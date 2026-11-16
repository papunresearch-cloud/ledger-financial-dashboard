import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownToLine, BarChart3, BookOpen, Calculator, Calendar, Check, ChevronRight, CircleHelp, Clock, CloudOff, FileSpreadsheet, FileUp, GitCompare, Globe, Landmark, Layers, LoaderCircle, Moon, PieChart, RefreshCw, Settings, ShieldCheck, Sparkles, Sun, Trash2, TrendingUp, Vault, Zap } from 'lucide-react'
import { AboutSection } from './AboutSection'
import { ComparisonSection } from './ComparisonSection'
import { BankDashboard } from './BankDashboard'
import { CompanyDashboard } from './CompanyDashboard'
import { ForecastCalculator } from './ForecastCalculator'
import { HoldingSection } from './HoldingSection'
import { QuarterlyRatioSection } from './QuarterlyRatioSection'
import { YearlyRatioSection } from './YearlyRatioSection'
import { SettingsModal } from './SettingsModal'
import { makeBankChartSpecs, makeChartSpecs } from './Charts'
import { exportExcel } from './exportReports'
import { buildStandaloneWebReportHtml, exportStandaloneHtmlReport, waitForPrintStageReady } from './exportVisualPdf'
import { parseBankWorkbook, parseCompanyWorkbook } from './parseWorkbook'
import { GoogleDrivePromptModal } from './GoogleDrivePromptModal'
import { SavedReportViewer } from './SavedReportViewer'
import { ReportVaultModal } from './ReportVaultModal'
import companies from './companies.json'
import { DataChecksView } from './DataChecksView'
import type { AboutAiData, AboutSourcesResponse, AboutState, AppTheme, FinancialData, LocalSettingsSummary, SavedReportInfo, SavedReportItem, Section } from './types'
import './cloud-download.css'
import './frontpage3d.css'

type Mode = 'nonbank' | 'bank'
const supportsLocalScreener = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const supportsCloudScreener = !supportsLocalScreener
const emptyAboutState = (companyKey = ''): AboutState => ({ companyKey, status: 'idle', sources: null, ai: null, error: '', aiError: '' })

function inferCompanyCode(companyName: string, fileName: string): string {
  const cleanFile = fileName.replace(/\.xlsx$/i, '').trim().toUpperCase()
  if (cleanFile) {
    const bySymbol = companies.find(c => c.nse.toUpperCase() === cleanFile || c.bse.toUpperCase() === cleanFile)
    if (bySymbol) return bySymbol.nse || bySymbol.bse
  }
  const cleanName = companyName.trim().toLowerCase()
  if (cleanName) {
    const byName = companies.find(c => c.name.toLowerCase() === cleanName)
      ?? companies.find(c => cleanName.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(cleanName))
    if (byName) return byName.nse || byName.bse
  }
  return /^[A-Z0-9][A-Z0-9&._-]{1,20}$/.test(cleanFile) ? cleanFile : ''
}

function enrichBankDataWithSnapshot(
  currentData: FinancialData,
  snapshot?: AboutSourcesResponse['financial_snapshot'] | null,
): FinancialData {
  if (currentData.mode !== 'bank' || !snapshot?.balance_sheet) return currentData
  const bs = snapshot.balance_sheet
  const bsHeaders = bs.headers || []
  if (bsHeaders.length === 0) return currentData

  const depRow = bs.rows?.find(r => /^deposits?/i.test(r.label?.trim() || ''))
  const borrRow = bs.rows?.find(r => /^borrowing/i.test(r.label?.trim() || ''))
  const assetsRow = bs.rows?.find(r => /other\s*assets|^advances/i.test(r.label?.trim() || ''))
  const totAssetsRow = bs.rows?.find(r => /total\s*assets|^total\s*liabilities/i.test(r.label?.trim() || ''))

  const cleanNum = (valStr?: string): number | null => {
    if (!valStr) return null
    const cleaned = String(valStr).replace(/,/g, '').trim()
    if (!cleaned || cleaned === '-' || cleaned === '--') return null
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const headerYears = bsHeaders.map(h => {
    const m = h.match(/(?:20)?(\d{2})$/)
    return m ? m[1] : h.replace(/\s+/g, '').toLowerCase()
  })

  let anyModified = false
  const enrichedAnnual = currentData.annual.map(row => {
    const rowYearMatch = row.period.match(/(?:20)?(\d{2})$/)
    const rowToken = rowYearMatch ? rowYearMatch[1] : row.period.replace(/\s+/g, '').toLowerCase()

    let colIdx = headerYears.findIndex(hy => hy === rowToken)
    if (colIdx === -1) {
      colIdx = bsHeaders.findIndex(h => h.replace(/\s+/g, '').toLowerCase() === row.period.replace(/\s+/g, '').toLowerCase())
    }
    if (colIdx === -1) return row

    const depVal = depRow ? cleanNum(depRow.values?.[colIdx]) : null
    const borrVal = borrRow ? cleanNum(borrRow.values?.[colIdx]) : null
    const advVal = assetsRow ? cleanNum(assetsRow.values?.[colIdx]) : null
    const totAssVal = totAssetsRow ? cleanNum(totAssetsRow.values?.[colIdx]) : null

    const finalDeposits = depVal ?? row.deposits
    const finalBorrowings = borrVal ?? (
      finalDeposits !== null && row.borrowings !== null && row.borrowings > finalDeposits
        ? row.borrowings - finalDeposits
        : row.borrowings
    )
    const finalLoansAdvances = advVal ?? row.loansAdvances ?? row.otherAssets
    const finalTotAssets = totAssVal ?? row.totalAssets

    const ldr = finalLoansAdvances !== null && finalDeposits !== null && finalDeposits > 0
      ? (100 * finalLoansAdvances / finalDeposits)
      : row.ldr
    const borrowingsToDeposits = finalBorrowings !== null && finalDeposits !== null && finalDeposits > 0
      ? (100 * finalBorrowings / finalDeposits)
      : row.borrowingsToDeposits
    const equityToTotalAssets = row.equity !== null && finalTotAssets !== null && finalTotAssets > 0
      ? (100 * row.equity / finalTotAssets)
      : row.equityToTotalAssets

    if (
      finalDeposits !== row.deposits ||
      finalBorrowings !== row.borrowings ||
      finalLoansAdvances !== row.loansAdvances ||
      ldr !== row.ldr ||
      borrowingsToDeposits !== row.borrowingsToDeposits ||
      equityToTotalAssets !== row.equityToTotalAssets
    ) {
      anyModified = true
    }

    return {
      ...row,
      deposits: finalDeposits,
      borrowings: finalBorrowings,
      loansAdvances: finalLoansAdvances,
      totalAssets: finalTotAssets,
      ldr,
      borrowingsToDeposits,
      equityToTotalAssets,
    }
  })

  if (!anyModified) return currentData

  return {
    ...currentData,
    annual: enrichedAnnual,
  }
}

function App() {
  const [mode, setMode] = useState<Mode>('nonbank')
  const [section, setSection] = useState<Section>('about')
  const [theme, setTheme] = useState<AppTheme>('dark')
  const [data, setData] = useState<FinancialData | null>(null)
  const [activeCode, setActiveCode] = useState('')
  const [companyCode, setCompanyCode] = useState('')
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false)
  const [activeCompanySuggestion, setActiveCompanySuggestion] = useState(0)
  const [accessKey, setAccessKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [localSettings, setLocalSettings] = useState<LocalSettingsSummary | null>(null)
  const [about, setAbout] = useState<AboutState>(() => emptyAboutState())
  const [printRenderActive, setPrintRenderActive] = useState<'html' | null>(null)
  const [autoSyncStageActive, setAutoSyncStageActive] = useState(false)
  const [, setDriveSyncInfo] = useState<{
    synced: boolean
    syncing: boolean
    version?: number
    formattedDate?: string
    fileName?: string
    driveFileId?: string
  } | null>(null)
  const [driveHistory, setDriveHistory] = useState<SavedReportItem[]>([])
  const [driveHistoryLoading, setDriveHistoryLoading] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [historyPrompt, setHistoryPrompt] = useState<{
    info: SavedReportInfo
    targetCode: string
    companyName?: string
  } | null>(null)
  const [viewingSavedReport, setViewingSavedReport] = useState<{
    html: string
    info: SavedReportInfo
    targetCode: string
  } | null>(null)
  const aboutCacheRef = useRef<Map<string, AboutState>>(new Map())
  const aboutReqIdRef = useRef(0)
  const printStageRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastSavedHtmlHashRef = useRef<string>('')
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshLocalSettings = () => {
    if (!supportsLocalScreener) return
    fetch('/api/settings')
      .then(res => (res.ok ? res.json() : null))
      .then((summary: LocalSettingsSummary | null) => {
        if (summary) setLocalSettings(summary)
      })
      .catch(() => { /* ignore */ })
  }

  const loadDriveHistory = () => {
    if (!supportsLocalScreener) return
    setDriveHistoryLoading(true)
    fetch('/api/drive/history')
      .then(res => (res.ok ? res.json() : []))
      .then((items: SavedReportItem[]) => {
        if (Array.isArray(items)) setDriveHistory(items)
      })
      .catch(() => {})
      .finally(() => setDriveHistoryLoading(false))
  }

  useEffect(() => {
    refreshLocalSettings()
    loadDriveHistory()
  }, [])

  useEffect(() => {
    if (data && data.mode === 'bank' && about.sources?.financial_snapshot) {
      const enriched = enrichBankDataWithSnapshot(data, about.sources.financial_snapshot)
      if (enriched !== data) {
        setData(enriched)
      }
    }
  }, [about.sources?.financial_snapshot, data])

  const companySpecs = useMemo(() => !data || data.mode === 'bank' ? null : makeChartSpecs(data.annual, data.quarterly), [data])
  const bankSpecs = useMemo(() => !data || data.mode !== 'bank' ? null : makeBankChartSpecs(data.annual, data.quarterly), [data])
  const companySuggestions = useMemo(() => {
    const query = companyCode.trim().toLocaleLowerCase()
    if (!query) return []
    return companies.filter(company => company.name.toLocaleLowerCase().includes(query) || company.nse.toLocaleLowerCase().includes(query) || company.bse.toLocaleLowerCase().includes(query)).slice(0, 8)
  }, [companyCode])

  function chooseCompany(company: typeof companies[number]) {
    setCompanyCode(company.nse || company.bse)
    setCompanySuggestionsOpen(false)
    setActiveCompanySuggestion(0)
    setError('')
  }

  async function synthesizeAiStep(
    cacheKey: string,
    sourcesPayload: AboutSourcesResponse,
    headers: Record<string, string>,
    reqId: number,
  ) {
    setAbout({
      companyKey: cacheKey,
      status: 'loading-ai',
      sources: sourcesPayload,
      ai: null,
      error: '',
      aiError: '',
    })

    const aiResp = await fetch('/api/about-ai', {
      method: 'POST',
      headers,
      body: JSON.stringify(sourcesPayload),
    })
    if (reqId !== aboutReqIdRef.current) return
    if (aiResp.status === 401) {
      setAbout({ companyKey: cacheKey, status: 'needs-key', sources: sourcesPayload, ai: null, error: '', aiError: '' })
      return
    }
    if (!aiResp.ok) {
      let msg = `AI synthesis failed (HTTP ${aiResp.status}).`
      let missingKey = false
      try {
        const b = await aiResp.json() as { detail?: string; missingKey?: boolean }
        if (b.detail) msg = b.detail
        if (b.missingKey) missingKey = true
      } catch { /* ignore */ }
      if (supportsLocalScreener && aiResp.status === 503 && missingKey) {
        setAbout({
          companyKey: cacheKey,
          status: 'needs-local-key',
          sources: sourcesPayload,
          ai: null,
          error: '',
          aiError: '',
        })
        return
      }
      setAbout({
        companyKey: cacheKey,
        status: 'error',
        sources: sourcesPayload,
        ai: null,
        error: '',
        aiError: msg,
      })
      return
    }
    const aiBody = await aiResp.json() as { ai?: AboutAiData }
    if (reqId !== aboutReqIdRef.current) return

    const finalState: AboutState = {
      companyKey: cacheKey,
      status: 'ready',
      sources: sourcesPayload,
      ai: aiBody.ai ?? null,
      error: '',
      aiError: '',
      cached: false,
    }
    aboutCacheRef.current.set(cacheKey, finalState)
    setAbout(finalState)
    refreshLocalSettings()
  }

  async function loadAboutForCompany(
    parsedData: FinancialData,
    codeHint: string,
    nameHint: string,
    overrideKey?: string,
    forceRefresh = false,
  ) {
    const cacheKey = (codeHint || nameHint || parsedData.sourceFileName).trim().toUpperCase()
    if (!forceRefresh) {
      const cached = aboutCacheRef.current.get(cacheKey)
      if (cached && cached.status === 'ready') {
        setAbout(cached)
        return
      }
    }

    const reqId = ++aboutReqIdRef.current
    const keyToUse = (overrideKey ?? accessKey).trim()
    if (supportsCloudScreener && !keyToUse) {
      setAbout({ ...emptyAboutState(cacheKey), status: 'needs-key' })
      return
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (supportsCloudScreener && keyToUse) headers['X-Ledger-Key'] = keyToUse

    // Fast path: if sources already arrived and only AI synthesis failed or needed a key, retry only Step 2
    if (forceRefresh && about.companyKey === cacheKey && about.sources && !about.ai && (about.aiError || about.status === 'needs-local-key')) {
      try {
        await synthesizeAiStep(cacheKey, about.sources, headers, reqId)
      } catch (cause) {
        if (reqId !== aboutReqIdRef.current) return
        setAbout({
          companyKey: cacheKey,
          status: 'error',
          sources: about.sources,
          ai: null,
          error: '',
          aiError: cause instanceof Error ? cause.message : String(cause),
        })
      }
      return
    }

    if (supportsLocalScreener && !forceRefresh) {
      try {
        const cacheResp = await fetch('/api/about-cache', {
          method: 'POST',
          headers,
          body: JSON.stringify({ code: codeHint, companyName: nameHint }),
        })
        if (reqId !== aboutReqIdRef.current) return
        if (cacheResp.ok) {
          const disk = await cacheResp.json() as {
            hit?: boolean
            cachedAt?: string
            sources?: AboutSourcesResponse
            ai?: AboutAiData | null
          }
          if (disk.hit && disk.sources && disk.ai) {
            const diskState: AboutState = {
              companyKey: cacheKey,
              status: 'ready',
              sources: disk.sources,
              ai: disk.ai,
              error: '',
              aiError: '',
              cached: true,
              cachedAt: disk.cachedAt,
            }
            aboutCacheRef.current.set(cacheKey, diskState)
            setAbout(diskState)
            if (disk.sources.financial_snapshot) {
              setData(prev => prev ? enrichBankDataWithSnapshot(prev, disk.sources?.financial_snapshot) : prev)
            }
            return
          }
          if (disk.hit && disk.sources && !disk.ai) {
            if (disk.sources.financial_snapshot) {
              setData(prev => prev ? enrichBankDataWithSnapshot(prev, disk.sources?.financial_snapshot) : prev)
            }
            await synthesizeAiStep(cacheKey, disk.sources, headers, reqId)
            return
          }
        }
      } catch {
        /* fall through to live fetch */
      }
    }

    setAbout({ ...emptyAboutState(cacheKey), status: 'loading-sources' })
    try {
      const srcResp = await fetch('/api/about-sources', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: codeHint, companyName: nameHint, forceRefresh }),
      })
      if (reqId !== aboutReqIdRef.current) return
      if (srcResp.status === 401) {
        setAbout({ ...emptyAboutState(cacheKey), status: 'needs-key' })
        return
      }
      if (!srcResp.ok) {
        let msg = `Company intelligence sources unavailable (HTTP ${srcResp.status}).`
        try { const b = await srcResp.json() as { detail?: string }; if (b.detail) msg = b.detail } catch { /* ignore */ }
        throw new Error(msg)
      }
      const sourcesPayload = await srcResp.json() as AboutSourcesResponse
      if (reqId !== aboutReqIdRef.current) return

      if (sourcesPayload.financial_snapshot) {
        setData(prev => prev ? enrichBankDataWithSnapshot(prev, sourcesPayload.financial_snapshot) : prev)
      }

      await synthesizeAiStep(cacheKey, sourcesPayload, headers, reqId)
    } catch (cause) {
      if (reqId !== aboutReqIdRef.current) return
      const msg = cause instanceof Error ? cause.message : String(cause)
      setAbout({
        companyKey: cacheKey,
        status: 'error',
        sources: null,
        ai: null,
        error: cause instanceof TypeError || /failed to fetch|networkerror/i.test(msg)
          ? supportsLocalScreener
            ? 'Local Python server is unreachable for About research. Start backend/server.py and click Retry.'
            : 'Cloud intelligence endpoint could not be reached. Check Vercel deployment and click Retry.'
          : msg,
        aiError: '',
      })
    }
  }

  async function processFile(file?: File) {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) { setError('Choose an .xlsx workbook. Legacy .xls files are not supported yet.'); return }
    setBusy(true); setError('')
    try {
      const parsed = mode === 'bank' ? await parseBankWorkbook(file) : await parseCompanyWorkbook(file)
      const inferred = inferCompanyCode(parsed.companyName, file.name)
      setActiveCode(inferred)
      setData(parsed); setSection('about')
      void loadAboutForCompany(parsed, inferred, parsed.companyName)
    } catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'Could not read this workbook.') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  async function fetchFromScreener(skipDriveCheck = false, overrideCode?: string, overrideName?: string) {
    const code = (overrideCode || companyCode).trim().toUpperCase()
    if (!code) { setError('Enter a Screener company code such as INFY, ITC, or RELIANCE.'); return }
    if (!/^[A-Z0-9][A-Z0-9&._-]{0,31}$/.test(code)) { setError('Use the company code from its Screener URL, for example INFY or RELIANCE.'); return }

    if (supportsLocalScreener && !skipDriveCheck) {
      try {
        const checkRes = await fetch('/api/drive/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, companyName: overrideName || '' }),
        })
        if (checkRes.ok) {
          const info = await checkRes.json() as SavedReportInfo
          if (info.found) {
            setHistoryPrompt({ info, targetCode: code, companyName: overrideName || info.companyName })
            return
          }
        }
      } catch (e) {
        console.warn('Drive check query failed:', e)
      }
    }

    setBusy(true); setError('')
    setHistoryPrompt(null)
    setViewingSavedReport(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (supportsCloudScreener) headers['X-Ledger-Key'] = accessKey
      const response = await fetch('/api/download', { method: 'POST', headers, body: JSON.stringify({ code }) })
      if (!response.ok) {
        let message = `Screener download failed (HTTP ${response.status}).`
        try { const body = await response.json() as { detail?: string }; if (body.detail) message = body.detail } catch { /* keep HTTP error */ }
        throw new Error(message)
      }
      const blob = await response.blob()
      const file = new File([blob], `${code}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const parsed = mode === 'bank' ? await parseBankWorkbook(file) : await parseCompanyWorkbook(file)
      setActiveCode(code)
      setData(parsed); setSection('about')
      void loadAboutForCompany(parsed, code, parsed.companyName)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(cause instanceof TypeError || /failed to fetch|networkerror/i.test(message) ? supportsLocalScreener ? 'The local Python download service is not running. Start it with the README instructions, then retry.' : 'The cloud download service could not be reached. Check its Vercel deployment and try again.' : message)
    } finally { setBusy(false) }
  }

  async function handleViewSavedReport(code: string, companyName?: string) {
    try {
      setBusy(true)
      const res = await fetch('/api/drive/get-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, companyName }),
      })
      if (!res.ok) {
        throw new Error(`Report not found (HTTP ${res.status}).`)
      }
      const payload = await res.json() as { html: string; info: SavedReportInfo }
      setViewingSavedReport({ html: payload.html, info: payload.info, targetCode: code })
      setHistoryPrompt(null)
    } catch (cause) {
      setError(`Failed to open saved report: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  async function triggerAutoDriveSync(currentData: FinancialData, currentCode: string) {
    if (!supportsLocalScreener || !currentData) return
    const code = (currentCode || inferCompanyCode(currentData.companyName, currentData.sourceFileName) || currentData.companyName).trim().toUpperCase()
    if (!code) return

    try {
      setDriveSyncInfo(prev => ({ synced: prev?.synced ?? false, syncing: true }))
      setAutoSyncStageActive(true)

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const stageEl = printStageRef.current
      if (!stageEl) {
        setAutoSyncStageActive(false)
        return
      }

      await waitForPrintStageReady(stageEl)
      const html = buildStandaloneWebReportHtml(stageEl, currentData)
      setAutoSyncStageActive(false)

      if (!html || html.length < 500) return
      if (lastSavedHtmlHashRef.current === `${code}_${html.length}`) {
        setDriveSyncInfo(prev => (prev ? { ...prev, syncing: false } : null))
        return
      }

      const res = await fetch('/api/drive/save-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          companyName: currentData.companyName,
          html,
        }),
      })

      if (res.ok) {
        const body = await res.json()
        lastSavedHtmlHashRef.current = `${code}_${html.length}`
        setDriveSyncInfo({
          synced: true,
          syncing: false,
          version: body.version,
          formattedDate: body.formattedDate,
          fileName: body.fileName,
          driveFileId: body.driveFileId,
        })
        loadDriveHistory()
      } else {
        setDriveSyncInfo(prev => ({ synced: prev?.synced ?? false, syncing: false }))
      }
    } catch (e) {
      console.warn('Auto drive sync failed:', e)
      setAutoSyncStageActive(false)
      setDriveSyncInfo(prev => ({ synced: prev?.synced ?? false, syncing: false }))
    }
  }

  useEffect(() => {
    if (!data) {
      setDriveSyncInfo(null)
      lastSavedHtmlHashRef.current = ''
      return
    }
    if (about.status === 'loading-sources' || about.status === 'loading-ai') {
      return
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      void triggerAutoDriveSync(data, activeCode)
    }, 1200)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [data, activeCode, about.status])

  const reset = () => {
    aboutReqIdRef.current++
    setData(null)
    setActiveCode('')
    setAbout(emptyAboutState())
    setError('')
    setSection('about')
    setDriveSyncInfo(null)
    setHistoryPrompt(null)
    setViewingSavedReport(null)
    loadDriveHistory()
    if (fileInput.current) fileInput.current.value = ''
  }
  async function saveLocalGeminiKey(newKey: string) {
    const cleaned = newKey.trim()
    if (!cleaned) return
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: cleaned }),
      })
      const body = (await res.json()) as LocalSettingsSummary & { detail?: string }
      if (!res.ok) throw new Error(body.detail || `Failed to save Gemini key (HTTP ${res.status}).`)
      setLocalSettings(body)
      if (data) {
        void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setAbout(prev => ({ ...prev, status: 'error', aiError: message }))
    }
  }
  const handleExport = (kind: 'excel' | 'html') => async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!data) return
    const buttonEl = event.currentTarget
    try {
      if (kind === 'excel') {
        await exportExcel(data, buttonEl, about)
        return
      }
      setPrintRenderActive('html')
      try {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const stageEl = printStageRef.current
        if (!stageEl) throw new Error('Print stage could not be prepared for export.')
        await exportStandaloneHtmlReport({ data, button: buttonEl, stageElement: stageEl })
        if (supportsLocalScreener) {
          void triggerAutoDriveSync(data, activeCode)
        }
      } finally {
        setPrintRenderActive(null)
      }
    } catch (cause) {
      setError(`Export failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
  const sections: Array<{ key: Section; label: string; icon: typeof BarChart3 }> = [
    { key: 'about', label: 'About', icon: BookOpen },
    { key: 'comparison', label: 'Comparison', icon: GitCompare },
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'quarterly-ratio', label: 'Quarterly-Ratio', icon: Clock },
    { key: 'yearly-ratio', label: 'Yearly-ratio', icon: Calendar },
    { key: 'yearly', label: 'Plots', icon: BarChart3 },
    { key: 'holding', label: 'Holding-%', icon: PieChart },
    { key: 'tables', label: 'Data Sheet', icon: FileSpreadsheet },
    { key: 'checks', label: 'Data checks', icon: CircleHelp },
  ]
  const themeClass = data ? (theme === 'bright' ? 'theme-bright' : 'theme-dark') : ''
  return <div className={`app-shell ${data?.mode === 'bank' ? 'bank-theme' : data ? 'company-theme' : ''} ${themeClass}`}>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Ledger home"><span className="brand-mark"><Activity size={18}/></span><span>ledger<span className="brand-dot">.</span></span></a>
      <div className="topbar-right">
        <span className="privacy-label"><ShieldCheck size={15}/> Files stay in this browser</span>
        {supportsLocalScreener && (
          <button
            type="button"
            className="button button-soft vault-topbar-button"
            onClick={() => setVaultOpen(true)}
            title="Open Secure Company Research & Report Vault"
          >
            <Vault size={16} />
            <span>Vault</span>
            {driveHistory.length > 0 && <span className="vault-topbar-badge">{driveHistory.length}</span>}
          </button>
        )}
        {supportsLocalScreener && <button type="button" className="button button-soft" onClick={() => setSettingsOpen(true)} title="Gemini API key, Screener browser & disk cache settings"><Settings size={16}/> Settings{localSettings && !localSettings.hasGeminiApiKey && <span className="settings-button-dot" aria-label="Gemini API key not configured"/>}</button>}{data && <>
        <button className="button forecast-ribbon-button" onClick={() => setCalculatorOpen(true)}><Calculator size={16}/> Forecast calculator</button>
        <button type="button" className="button button-soft theme-toggle-button" onClick={() => setTheme(current => current === 'dark' ? 'bright' : 'dark')} title={theme === 'dark' ? 'Switch to Bright Mode' : 'Switch to Dark Mode'}>
          {theme === 'dark' ? <><Sun size={16}/> Bright mode</> : <><Moon size={16}/> Dark mode</>}
        </button>
        <button className="button report-action-button" onClick={handleExport('excel')}><FileSpreadsheet size={16}/> Excel report</button>
        <button className="button report-action-button" onClick={handleExport('html')}><Globe size={16}/> Web report</button>
      </>}</div>
    </header>
    <main id="top" className="main-wrap">
      {!data ? <section className="welcome-view">
        <div className="welcome-copy">
          <div className="hero-kicker">
            <span className="hero-kicker-dot" />
            <Sparkles size={14} className="hero-kicker-sparkle" />
            <span>FINANCIAL STATEMENTS, MADE CRYSTAL CLEAR</span>
          </div>
          <h1>See the story<br/>behind the <span className="hero-em-gradient">numbers.</span></h1>
          <p className="hero-description">
            Transform raw Screener workbooks into luminous financial intelligence. High-definition quarterly trends, interactive valuation ratios, and deep balance sheet analysis — rendered instantly on your device.
          </p>
          <div className="promise-row">
            <span className="promise-pill"><Check size={14} /> 100% Private & In-Memory</span>
            <span className="promise-pill"><Check size={14} /> Zero Cloud Account</span>
            <span className="promise-pill"><Check size={14} /> Transparent Formulas</span>
          </div>

          {supportsLocalScreener && (
            <div
              className="vault-hero-card"
              onClick={() => setVaultOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setVaultOpen(true)
                }
              }}
              title="Open Financial Intelligence & Report Vault"
            >
              <div className="vault-hero-bg-glow" />
              <div className="vault-hero-content">
                <div className="vault-hero-icon-3d">
                  <Vault size={28} />
                  <span className="vault-hero-pulse" />
                </div>
                <div className="vault-hero-text">
                  <div className="vault-hero-badge-row">
                    <span className="vault-hero-tag"><Sparkles size={11} /> REPORT VAULT</span>
                    <span className="vault-hero-count">{driveHistory.length} {driveHistory.length === 1 ? 'Report' : 'Reports'} Secured</span>
                  </div>
                  <h3 className="vault-hero-title">Financial Intelligence Vault</h3>
                  <p className="vault-hero-desc">
                    Access existing company reports with update dates, open in-app full screen Web Reports, or trigger live data updates.
                  </p>
                </div>
                <div className="vault-hero-cta">
                  <span>Open Vault</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            </div>
          )}

          <div className="hero-metrics-ribbon">
            <div className="hero-metric-tile accent-emerald">
              <div className="metric-tile-icon"><TrendingUp size={16} /></div>
              <div className="metric-tile-content">
                <strong>4,500+</strong>
                <span>Equities Indexed</span>
              </div>
            </div>
            <div className="hero-metric-tile accent-cyan">
              <div className="metric-tile-icon"><Zap size={16} /></div>
              <div className="metric-tile-content">
                <strong>Instant</strong>
                <span>Local Analysis</span>
              </div>
            </div>
            <div className="hero-metric-tile accent-indigo">
              <div className="metric-tile-icon"><Layers size={16} /></div>
              <div className="metric-tile-content">
                <strong>Dual Engine</strong>
                <span>Non-Bank & Bank</span>
              </div>
            </div>
          </div>
        </div>

        <div className="setup-card">
          <div className="step-label">
            <span className="setup-step-tag"><span className="status-dot-glow" /> READY TO ANALYZE</span>
            <span className="setup-step-num">STEP 01 / 02</span>
          </div>
          <h2 className="setup-card-title">Choose analysis mode</h2>
          <p className="setup-card-subtitle">Select company profile to apply specialized accounting models & ratios.</p>
          <div className="mode-options">
            <button
              type="button"
              className={`mode-option mode-nonbank ${mode === 'nonbank' ? 'selected' : ''}`}
              onClick={() => setMode('nonbank')}
            >
              <span className="mode-icon nonbank"><BarChart3 size={20}/></span>
              <span className="mode-copy">
                <strong>Non-bank company</strong>
                <small>Manufacturing, IT, FMCG, Pharma & General Corporates</small>
              </span>
              <span className="radio-dot"/>
            </button>
            <button
              type="button"
              className={`mode-option mode-bank ${mode === 'bank' ? 'selected' : ''}`}
              onClick={() => setMode('bank')}
            >
              <span className="mode-icon bank"><Landmark size={20}/></span>
              <span className="mode-copy">
                <strong>Banking & Financials</strong>
                <small>Interest spread, Advances, Deposits & specialized bank metrics</small>
              </span>
              <span className="radio-dot"/>
            </button>
          </div>

          {supportsLocalScreener || supportsCloudScreener ? (
            <div className="download-card">
              <div className="download-card-head">
                <span className="download-icon"><ArrowDownToLine size={20}/></span>
                <div>
                  <strong>Direct Screener Sync</strong>
                  <small>Search by company name or ticker symbol for instant fetching</small>
                </div>
              </div>
              {!supportsLocalScreener && (
                <>
                  <label htmlFor="ledger-access-key">Ledger access key</label>
                  <input
                    id="ledger-access-key"
                    type="password"
                    value={accessKey}
                    onChange={event => setAccessKey(event.target.value)}
                    autoComplete="current-password"
                    className="access-key-input"
                    placeholder="Enter your private access key"
                  />
                </>
              )}
              <label htmlFor="company-code">Screener company code or ticker</label>
              <div className="company-code-picker">
                <div className="company-code-field">
                  <span>screener.in/company/</span>
                  <input
                    id="company-code"
                    value={companyCode}
                    onChange={event => {
                      setCompanyCode(event.target.value)
                      setCompanySuggestionsOpen(true)
                      setActiveCompanySuggestion(0)
                    }}
                    onFocus={() => setCompanySuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setCompanySuggestionsOpen(false), 150)}
                    onKeyDown={event => {
                      if (event.key === 'ArrowDown' && companySuggestions.length) {
                        event.preventDefault()
                        setCompanySuggestionsOpen(true)
                        setActiveCompanySuggestion(index => (index + 1) % companySuggestions.length)
                      } else if (event.key === 'ArrowUp' && companySuggestions.length) {
                        event.preventDefault()
                        setActiveCompanySuggestion(index => (index - 1 + companySuggestions.length) % companySuggestions.length)
                      } else if (event.key === 'Escape') {
                        setCompanySuggestionsOpen(false)
                      } else if (event.key === 'Enter' && !busy) {
                        event.preventDefault()
                        void fetchFromScreener()
                      }
                    }}
                    placeholder="Company name or code (e.g. INFY, TCS)"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-controls="company-suggestions"
                  />
                  <span>/</span>
                </div>
                {companySuggestionsOpen && companySuggestions.length > 0 && (
                  <ul id="company-suggestions" className="company-suggestions" role="listbox">
                    {companySuggestions.map((company, index) => (
                      <li key={`${company.name}-${company.nse}-${company.bse}`} role="option" aria-selected={index === activeCompanySuggestion}>
                        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => chooseCompany(company)}>
                          <span>{company.name}</span>
                          <small>{company.nse ? `NSE: ${company.nse}` : `BSE: ${company.bse}`}{company.nse && company.bse ? ` · BSE: ${company.bse}` : ''}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="button button-primary fetch-button"
                disabled={busy || (!supportsLocalScreener && !accessKey)}
                onClick={() => {
                  setCompanySuggestionsOpen(false)
                  void fetchFromScreener()
                }}
              >
                {busy ? (
                  <><LoaderCircle className="spin" size={16}/> Downloading & analyzing…</>
                ) : (
                  <><Sparkles size={16}/> Download & analyze</>
                )}
              </button>
              <p className="browser-note">
                <ShieldCheck size={14}/>
                {supportsLocalScreener
                  ? (localSettings?.hasScreenerCredentials
                      ? 'Screener automatic login is active from Settings; Ledger downloads silently in the background.'
                      : 'A Chrome or Edge window will open. Sign in there if prompted (or save your Screener login in Settings).')
                  : 'The cloud service downloads through your configured proxy; selected analysis mode is applied automatically.'}
              </p>
            </div>
          ) : (
            <div className="download-card">
              <div className="download-card-head">
                <span className="download-icon"><CloudOff size={20}/></span>
                <div>
                  <strong>Cloud version: upload a workbook</strong>
                  <small>Direct Screener download uses a Chrome session on your own computer.</small>
                </div>
              </div>
              <p className="browser-note">
                <ShieldCheck size={14}/>
                Save the Screener export as an .xlsx file, then choose it below. The workbook is analyzed in this browser and never uploaded to any external server.
              </p>
            </div>
          )}

          <div className="upload-divider"><span>OR UPLOAD A SAVED WORKBOOK</span></div>

          <div
            className={`upload-zone manual-upload ${dragging ? 'dragging' : ''} ${busy ? 'loading' : ''}`}
            onDragOver={event => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => {
              event.preventDefault()
              setDragging(false)
              void processFile(event.dataTransfer.files[0])
            }}
          >
            <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={event => void processFile(event.target.files?.[0])}/>
            <span className="upload-icon">
              {busy ? <LoaderCircle className="spin" size={22}/> : <FileUp size={22}/>}
            </span>
            <strong>{busy ? 'Processing Workbook…' : 'Drop a workbook here or choose a file'}</strong>
            <small>Must include a <b>Data Sheet</b> worksheet</small>
            <button type="button" className="button button-soft upload-button" disabled={busy} onClick={() => fileInput.current?.click()}>
              Choose .xlsx file <ChevronRight size={15}/>
            </button>
            <span className="file-note">MANUAL FALLBACK · 100% SECURE ON YOUR DEVICE</span>
          </div>

          <div className="local-note">
            <CloudOff size={15}/>
            <span>Workbook is processed strictly in browser memory and is never saved to a permanent file.</span>
          </div>
          {error && <div className="error-box"><AlertTriangle size={16}/>{error}</div>}
        </div>

        <div className="welcome-foot">
          <span className="foot-brand">⚡ LEDGER INTELLIGENCE</span>
          <span className="foot-caps">Annual trends <b className="foot-dot">·</b> Quarterly movements <b className="foot-dot">·</b> Advanced ratios <b className="foot-dot">·</b> Peer Medians</span>
        </div>
      </section> : <>
        <section className="company-banner"><div className="company-title-wrap"><div className="company-icon">{data.companyName.slice(0,1).toUpperCase()}</div><div><div className="hero-kicker"><span className="status-pulse"/> {data.mode === 'bank' ? 'BANK ANALYSIS' : 'NON-BANK ANALYSIS'} <span className="title-divider">/</span> {data.annual[0]?.period} — {data.annual.at(-1)?.period}</div><h1>{data.companyName}</h1></div></div><div className="company-actions"><button className="button button-soft" onClick={reset}><RefreshCw size={15}/> New workbook</button><button className="button button-danger-soft" onClick={reset}><Trash2 size={15}/> Clear</button></div></section>
        <nav className="section-nav" aria-label="Analysis sections">{sections.map(({key,label,icon:Icon})=><button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}><Icon size={16}/>{label}{section===key&&<span className="nav-active-mark"/>}</button>)}</nav>
        {section === 'about' && (
          <AboutSection
            about={about}
            fallbackCompanyName={data.companyName}
            onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
            onUnlockWithKey={enteredKey => {
              setAccessKey(enteredKey)
              void loadAboutForCompany(data, activeCode, data.companyName, enteredKey, true)
            }}
            onSaveLocalGeminiKey={supportsLocalScreener ? (enteredKey => void saveLocalGeminiKey(enteredKey)) : undefined}
          />
        )}
        {section === 'comparison' && (
          <ComparisonSection
            about={about}
            companyName={data.companyName}
            symbol={activeCode}
            isBank={data.mode === 'bank'}
            onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
          />
        )}
        {section === 'quarterly-ratio' && <QuarterlyRatioSection data={data} />}
        {section === 'yearly-ratio' && <YearlyRatioSection data={data} />}
        {section === 'holding' && (
          <HoldingSection
            about={about}
            companyName={data.companyName}
            symbol={activeCode}
            onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
          />
        )}
        {section === 'checks' ? (
          <DataChecksView data={data} />
        ) : data.mode === 'bank' ? (
          <BankDashboard data={data} section={section} specs={bankSpecs!} theme={theme}/>
        ) : (
          <CompanyDashboard data={data} section={section} specs={companySpecs!} theme={theme}/>
        )}
        {error && <div className="error-box"><AlertTriangle size={16}/>{error}</div>}
        <footer className="app-footer"><span>LEDGER <b>·</b> PRIVATE BY DESIGN</span><span>Workbook is processed in browser memory only. Clearing or refreshing removes it.</span></footer>
      </>}
    </main>
    {data && (printRenderActive || autoSyncStageActive) && (
      <div
        id="ledger-print-stage"
        ref={printStageRef}
        className="print-report-stage theme-bright web-report-stage"
        aria-hidden="true"
      >
        <div data-print-block="banner">
          <section className="company-banner">
            <div className="company-title-wrap">
              <div className="company-icon">{data.companyName.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="hero-kicker"><span className="status-pulse"/> {data.mode === 'bank' ? 'BANK ANALYSIS' : 'NON-BANK ANALYSIS'} <span className="title-divider">/</span> {data.annual[0]?.period} — {data.annual.at(-1)?.period}</div>
                <h1>{data.companyName}</h1>
              </div>
            </div>
          </section>
        </div>
        <div data-print-section="about">
          <AboutSection
            about={about}
            fallbackCompanyName={data.companyName}
            onRetry={() => {}}
            onUnlockWithKey={() => {}}
          />
        </div>
        <div data-print-section="comparison">
          <ComparisonSection
            about={about}
            companyName={data.companyName}
            symbol={activeCode}
            isBank={data.mode === 'bank'}
            onRetry={() => {}}
          />
        </div>
        <div data-print-section="overview">
          {data.mode === 'bank' ? (
            <BankDashboard data={data} section="overview" specs={bankSpecs!} theme="bright" hideExportStage/>
          ) : (
            <CompanyDashboard data={data} section="overview" specs={companySpecs!} theme="bright" hideExportStage/>
          )}
        </div>
        <div data-print-section="quarterly-ratio">
          <QuarterlyRatioSection data={data} />
        </div>
        <div data-print-section="yearly-ratio">
          <YearlyRatioSection data={data} />
        </div>
        <div data-print-section="plots">
          {data.mode === 'bank' ? (
            <BankDashboard data={data} section="yearly" specs={bankSpecs!} theme="bright" staticCharts gradientPrefix="print-" hideExportStage/>
          ) : (
            <CompanyDashboard data={data} section="yearly" specs={companySpecs!} theme="bright" staticCharts gradientPrefix="print-" hideExportStage/>
          )}
        </div>
        <div data-print-section="holding">
          <HoldingSection
            about={about}
            companyName={data.companyName}
            symbol={activeCode}
            onRetry={() => {}}
          />
        </div>
        {(printRenderActive === 'html' || autoSyncStageActive) && (
          <>
            <div data-print-section="tables">
              {data.mode === 'bank' ? (
                <BankDashboard data={data} section="tables" specs={bankSpecs!} theme="bright" hideExportStage/>
              ) : (
                <CompanyDashboard data={data} section="tables" specs={companySpecs!} theme="bright" hideExportStage/>
              )}
            </div>
            <div data-print-section="checks">
              <DataChecksView data={data}/>
            </div>
          </>
        )}
      </div>
    )}
    {data && calculatorOpen && <ForecastCalculator data={data} theme={theme} onClose={() => setCalculatorOpen(false)}/>}
    {historyPrompt && (
      <GoogleDrivePromptModal
        info={historyPrompt.info}
        onViewSaved={() => void handleViewSavedReport(historyPrompt.targetCode, historyPrompt.companyName)}
        onGenerateFresh={() => void fetchFromScreener(true, historyPrompt.targetCode, historyPrompt.companyName)}
        onCancel={() => setHistoryPrompt(null)}
      />
    )}
    {vaultOpen && (
      <ReportVaultModal
        reports={driveHistory}
        loading={driveHistoryLoading}
        onClose={() => setVaultOpen(false)}
        onViewReport={(code, compName) => void handleViewSavedReport(code, compName)}
        onUpdateReport={(code, compName) => void fetchFromScreener(true, code, compName)}
        onRefreshList={loadDriveHistory}
      />
    )}
    {viewingSavedReport && (
      <SavedReportViewer
        html={viewingSavedReport.html}
        info={viewingSavedReport.info}
        onClose={() => setViewingSavedReport(null)}
        onGenerateFresh={code => void fetchFromScreener(true, code)}
      />
    )}
    {supportsLocalScreener && settingsOpen && (
      <SettingsModal
        initialSettings={localSettings}
        onClose={() => setSettingsOpen(false)}
        onSettingsUpdated={(summary, savedNewKey) => {
          setLocalSettings(summary)
          if (savedNewKey && data && (about.status === 'needs-local-key' || about.aiError)) {
            void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)
          }
        }}
        onCacheCleared={() => {
          aboutCacheRef.current.clear()
        }}
      />
    )}
  </div>
}

export default App
