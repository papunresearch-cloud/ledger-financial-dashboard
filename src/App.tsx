import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownToLine, BarChart3, BookOpen, Calculator, Calendar, Check, ChevronRight, CircleHelp, Clock, CloudOff, ExternalLink, FileSpreadsheet, FileUp, GitCompare, Globe, Landmark, Layers, LoaderCircle, Moon, PieChart, RefreshCw, ShieldCheck, Sparkles, Sun, Trash2, TrendingUp, Zap } from 'lucide-react'
import { AboutSection } from './AboutSection'
import { ComparisonSection } from './ComparisonSection'
import { BankDashboard } from './BankDashboard'
import { CompanyDashboard } from './CompanyDashboard'
import { ForecastCalculator } from './ForecastCalculator'
import { HoldingSection } from './HoldingSection'
import { QuarterlyRatioSection } from './QuarterlyRatioSection'
import { YearlyRatioSection } from './YearlyRatioSection'
import { DataChecksView } from './DataChecksView'
import { makeBankChartSpecs, makeChartSpecs } from './Charts'
import { exportExcel } from './exportReports'
import { exportStandaloneHtmlReport } from './exportVisualPdf'
import { parseBankWorkbook, parseCompanyWorkbook } from './parseWorkbook'
import companies from './companies.json'
import type { AboutState, AnnualRow, AppTheme, CompanyData, FinancialData, ScreenerAboutData, Section } from './types'
import './cloud-download.css'
import './frontpage3d.css'

type Mode = 'nonbank' | 'bank'
const compact = (n: number | null | undefined, digits = 1) => n === null || n === undefined || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n)
const supportsLocalScreener = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const supportsCloudScreener = !supportsLocalScreener
const emptyAboutState = (companyKey = ''): AboutState => ({ companyKey, status: 'idle', data: null, error: '' })

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
  snapshot?: ScreenerAboutData['financial_snapshot'] | null,
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

    const finalTotAssets = totAssVal ?? row.totalAssets
    const finalDeposits = depVal ?? row.deposits ?? (finalTotAssets ? finalTotAssets * 0.80 : null)
    const finalBorrowings = borrVal ?? (
      finalDeposits !== null && row.borrowings !== null && row.borrowings > finalDeposits
        ? row.borrowings - finalDeposits
        : (row.borrowings ?? (finalTotAssets ? finalTotAssets * 0.08 : null))
    )
    const finalLoansAdvances = advVal ?? row.loansAdvances ?? row.otherAssets ?? (finalTotAssets ? finalTotAssets * 0.68 : null)

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

function enrichCompanyDataWithScreener(
  currentData: FinancialData,
  payload?: ScreenerAboutData | null,
): FinancialData {
  if (currentData.mode === 'bank' || !payload) return currentData
  const companyData = currentData as CompanyData
  const schedCf = payload.schedules?.cash_flow_operating || payload.cash_flow_schedule || {}
  const schedLiab = payload.schedules?.other_liabilities || {}
  const schedAssets = payload.schedules?.other_assets || {}
  const screenerRatios = payload.screener_ratios

  // Cash flow breakdown maps
  const cfPayablesMap = schedCf['Payables'] || schedCf['Trade Payables'] || {}
  const cfReceivablesMap = schedCf['Receivables'] || schedCf['Trade Receivables'] || {}
  const cfInventoryMap = schedCf['Inventory'] || schedCf['Inventories'] || {}
  const cfWcMap = schedCf['Working capital changes'] || schedCf['Working Capital'] || {}

  // Balance sheet maps
  const bsPayablesMap = schedLiab['Trade Payables'] || schedLiab['Payables'] || {}
  const bsReceivablesMap = schedAssets['Trade receivables'] || schedAssets['Receivables'] || {}
  const bsInventoryMap = schedAssets['Inventories'] || schedAssets['Inventory'] || {}

  // Screener official ratios
  const ratioHeaders = screenerRatios?.headers?.slice(1) || []
  const getRatioRow = (pattern: RegExp) =>
    screenerRatios?.rows?.find(r => pattern.test(r.label.trim()))

  const debtorDaysRow = getRatioRow(/debtor\s*days/i)
  const inventoryDaysRow = getRatioRow(/inventory\s*days/i)
  const daysPayableRow = getRatioRow(/days\s*payable|creditor\s*days/i)
  const cccRow = getRatioRow(/cash\s*conversion\s*cycle/i)
  const wcDaysRow = getRatioRow(/working\s*capital\s*days/i)
  const roceRow = getRatioRow(/roce/i)

  const cleanNum = (valStr?: unknown): number | null => {
    if (valStr === null || valStr === undefined) return null
    if (typeof valStr === 'number') return Number.isFinite(valStr) ? valStr : null
    const cleaned = String(valStr).replace(/,/g, '').replace(/%/g, '').trim()
    if (!cleaned || cleaned === '-' || cleaned === '--') return null
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const findValueForPeriod = (sourceMap: Record<string, string>, period: string): number | null => {
    const rowYearMatch = period.match(/(?:20)?(\d{2})$/)
    const twoDigitYear = rowYearMatch ? rowYearMatch[1] : null

    for (const [key, val] of Object.entries(sourceMap)) {
      if (key === 'setAttributes') continue
      const keyYearMatch = key.match(/(?:20)?(\d{2})$/)
      if (twoDigitYear && keyYearMatch && keyYearMatch[1] === twoDigitYear) {
        return cleanNum(val)
      }
      if (key.toLowerCase().includes(period.toLowerCase())) {
        return cleanNum(val)
      }
    }
    return null
  }

  const findRatioForPeriod = (row: { label: string; values: string[] } | undefined, period: string): number | null => {
    if (!row || !row.values || ratioHeaders.length === 0) return null
    const rowYearMatch = period.match(/(?:20)?(\d{2})$/)
    const twoDigitYear = rowYearMatch ? rowYearMatch[1] : null

    for (let i = 0; i < ratioHeaders.length; i++) {
      const h = ratioHeaders[i]
      const hYearMatch = h.match(/(?:20)?(\d{2})$/)
      if (twoDigitYear && hYearMatch && hYearMatch[1] === twoDigitYear) {
        return cleanNum(row.values[i])
      }
      if (h.toLowerCase().includes(period.toLowerCase())) {
        return cleanNum(row.values[i])
      }
    }
    return null
  }

  let anyModified = false
  const enrichedAnnual: AnnualRow[] = companyData.annual.map(row => {
    const bsPayables = findValueForPeriod(bsPayablesMap, row.period)
    const cfPayables = findValueForPeriod(cfPayablesMap, row.period)
    const bsReceivables = findValueForPeriod(bsReceivablesMap, row.period)
    const cfReceivables = findValueForPeriod(cfReceivablesMap, row.period)
    const bsInventory = findValueForPeriod(bsInventoryMap, row.period)
    const cfInventory = findValueForPeriod(cfInventoryMap, row.period)
    const cfWc = findValueForPeriod(cfWcMap, row.period)

    const screenerDebtorDays = findRatioForPeriod(debtorDaysRow, row.period)
    const screenerInventoryDays = findRatioForPeriod(inventoryDaysRow, row.period)
    const screenerDaysPayable = findRatioForPeriod(daysPayableRow, row.period)
    const screenerCashConversionCycle = findRatioForPeriod(cccRow, row.period)
    const screenerWorkingCapitalDays = findRatioForPeriod(wcDaysRow, row.period)
    const screenerRoce = findRatioForPeriod(roceRow, row.period)

    const finalPayables = bsPayables ?? cfPayables ?? row.payables
    const finalReceivables = bsReceivables ?? row.receivables
    const finalInventory = bsInventory ?? row.inventory
    const finalWc = cfWc ?? row.workingCapital

    if (
      finalPayables !== row.payables ||
      finalReceivables !== row.receivables ||
      finalInventory !== row.inventory ||
      finalWc !== row.workingCapital ||
      screenerDaysPayable !== row.screenerDaysPayable ||
      screenerCashConversionCycle !== row.screenerCashConversionCycle ||
      screenerWorkingCapitalDays !== row.screenerWorkingCapitalDays ||
      screenerRoce !== row.screenerRoce
    ) {
      anyModified = true
    }

    return {
      ...row,
      payables: finalPayables,
      receivables: finalReceivables,
      inventory: finalInventory,
      workingCapital: finalWc,
      cfPayables,
      cfReceivables,
      cfInventory,
      cfWorkingCapital: cfWc,
      screenerDebtorDays,
      screenerInventoryDays,
      screenerDaysPayable,
      screenerCashConversionCycle,
      screenerWorkingCapitalDays,
      screenerRoce,
    }
  })

  if (!anyModified) return companyData
  return {
    ...companyData,
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
  const [deepLinkSymbol, setDeepLinkSymbol] = useState('')
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false)
  const [activeCompanySuggestion, setActiveCompanySuggestion] = useState(0)
  const [accessKey, setAccessKey] = useState<string>(() => {
    try {
      return (typeof window !== 'undefined' && localStorage.getItem('ledger_access_key')) || ''
    } catch {
      return ''
    }
  })

  const updateAccessKey = (newKey: string) => {
    setAccessKey(newKey)
    try {
      if (typeof window !== 'undefined') {
        if (newKey) localStorage.setItem('ledger_access_key', newKey)
        else localStorage.removeItem('ledger_access_key')
      }
    } catch {
      /* ignore storage errors */
    }
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [about, setAbout] = useState<AboutState>(() => emptyAboutState())
  const aboutCacheRef = useRef<Map<string, AboutState>>(new Map())
  const aboutReqIdRef = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const printStageRef = useRef<HTMLDivElement>(null)
  const companySpecs = useMemo(() => !data || data.mode === 'bank' ? null : makeChartSpecs(data.annual, data.quarterly), [data])
  const bankSpecs = useMemo(() => !data || data.mode !== 'bank' ? null : makeBankChartSpecs(data.annual, data.quarterly), [data])
  const screenerUrl = useMemo(() => {
    if (!data) return ''
    if (about?.data?.company_info?.screener_url) {
      return about.data.company_info.screener_url
    }
    const resolvedCode = (activeCode || inferCompanyCode(data.companyName, data.sourceFileName) || '').trim().toUpperCase()
    if (resolvedCode) {
      return `https://www.screener.in/company/${encodeURIComponent(resolvedCode)}/`
    }
    return `https://www.screener.in/search/?q=${encodeURIComponent(data.companyName)}`
  }, [data, activeCode, about])
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

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (supportsCloudScreener && keyToUse) headers['X-Ledger-Key'] = keyToUse

    setAbout({ companyKey: cacheKey, status: 'loading', data: null, error: '' })
    try {
      const srcResp = await fetch('/api/about-sources', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: codeHint, companyName: nameHint }),
      })
      if (reqId !== aboutReqIdRef.current) return
      if (!srcResp.ok) {
        let msg = `Company About unavailable from Screener (HTTP ${srcResp.status}).`
        try { const b = await srcResp.json() as { detail?: string }; if (b.detail) msg = b.detail } catch { /* ignore */ }
        throw new Error(msg)
      }
      const dataPayload = await srcResp.json() as ScreenerAboutData
      if (reqId !== aboutReqIdRef.current) return

      const finalState: AboutState = {
        companyKey: cacheKey,
        status: 'ready',
        data: dataPayload,
        error: '',
        sources: dataPayload,
      }
      if (dataPayload.financial_snapshot) {
        setData(cur => cur ? enrichBankDataWithSnapshot(cur, dataPayload.financial_snapshot) : cur)
      }
      if (dataPayload.cash_flow_schedule) {
        setData(cur => cur ? enrichCompanyDataWithScreener(cur, dataPayload) : cur)
      }
      aboutCacheRef.current.set(cacheKey, finalState)
      setAbout(finalState)
    } catch (cause) {
      if (reqId !== aboutReqIdRef.current) return
      const msg = cause instanceof Error ? cause.message : String(cause)
      setAbout({
        companyKey: cacheKey,
        status: 'error',
        data: null,
        error: cause instanceof TypeError || /failed to fetch|networkerror/i.test(msg)
          ? supportsLocalScreener
            ? 'Local Python server is unreachable for About research. Start backend/server.py and click Retry.'
            : 'Cloud intelligence endpoint could not be reached. Check Vercel deployment and click Retry.'
          : msg,
      })
    }
  }

  async function processFile(file?: File) {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) { setError('Choose an .xlsx workbook. Legacy .xls files are not supported yet.'); return }
    setBusy(true); setError('')
    try {
      let parsed = mode === 'bank' ? await parseBankWorkbook(file) : await parseCompanyWorkbook(file)
      const inferred = inferCompanyCode(parsed.companyName, file.name)
      if (about.data?.cash_flow_schedule) {
        parsed = enrichCompanyDataWithScreener(parsed, about.data)
      }
      setActiveCode(inferred)
      setData(parsed); setSection('about')
      void loadAboutForCompany(parsed, inferred, parsed.companyName)
    } catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'Could not read this workbook.') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  async function fetchFromScreener(targetCode?: string, targetKey?: string, targetMode?: Mode) {
    const code = (targetCode ?? companyCode).trim().toUpperCase()
    if (!code) { setError('Enter a Screener company code such as INFY, ITC, or RELIANCE.'); return }
    if (!/^[A-Z0-9][A-Z0-9&._-]{0,31}$/.test(code)) { setError('Use the company code from its Screener URL, for example INFY or RELIANCE.'); return }
    setBusy(true); setError('')
    const keyToUse = (targetKey ?? accessKey).trim()
    const modeToUse = targetMode ?? mode
    if (targetMode && targetMode !== mode) {
      setMode(targetMode)
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (supportsCloudScreener && keyToUse) headers['X-Ledger-Key'] = keyToUse
      const response = await fetch('/api/download', { method: 'POST', headers, body: JSON.stringify({ code }) })
      if (!response.ok) {
        let message = `Screener download failed (HTTP ${response.status}).`
        try { const body = await response.json() as { detail?: string }; if (body.detail) message = body.detail } catch { /* keep HTTP error */ }
        throw new Error(message)
      }
      const blob = await response.blob()
      const file = new File([blob], `${code}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const parsed = modeToUse === 'bank' ? await parseBankWorkbook(file) : await parseCompanyWorkbook(file)
      setActiveCode(code)
      setData(parsed); setSection('about')
      void loadAboutForCompany(parsed, code, parsed.companyName, keyToUse)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(cause instanceof TypeError || /failed to fetch|networkerror/i.test(message) ? supportsLocalScreener ? 'The local Python download service is not running. Start it with the README instructions, then retry.' : 'The cloud download service could not be reached. Check its Vercel deployment and try again.' : message)
    } finally { setBusy(false) }
  }

  // Handle direct script deep-linking from Stock Monitor or Watchlist (?symbol=...&mode=...&key=...)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const urlSymbol = params.get('symbol') || params.get('code')
    const urlKey = params.get('key') || params.get('accessKey')
    const urlMode = params.get('mode')

    if (urlKey) {
      updateAccessKey(urlKey.trim())
    }

    if (urlMode === 'bank' || urlMode === 'nonbank') {
      setMode(urlMode)
    }

    if (urlSymbol) {
      const clean = urlSymbol.trim().toUpperCase()
      setCompanyCode(clean)
      setDeepLinkSymbol(clean)
      try {
        window.history.replaceState({}, document.title, window.location.pathname)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const reset = () => { aboutReqIdRef.current++; setData(null); setActiveCode(''); setAbout(emptyAboutState()); setError(''); setSection('about'); if (fileInput.current) fileInput.current.value = '' }
  const handleExport = (kind: 'excel' | 'html') => async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!data) return
    const buttonEl = event.currentTarget
    try {
      if (kind === 'excel') {
        await exportExcel(data, buttonEl, about)
      } else {
        const stageEl = printStageRef.current
        if (!stageEl) throw new Error('Web report stage could not be prepared for export.')
        await exportStandaloneHtmlReport({ data, button: buttonEl, stageElement: stageEl })
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
      <div className="topbar-right"><span className="privacy-label"><ShieldCheck size={15}/> Files stay in this browser</span>{data && <>
        <button className="button forecast-ribbon-button" onClick={() => setCalculatorOpen(true)}><Calculator size={16}/> Forecast calculator</button>
        <button type="button" className="button button-soft theme-toggle-button" onClick={() => setTheme(current => current === 'dark' ? 'bright' : 'dark')} title={theme === 'dark' ? 'Switch to Bright Mode' : 'Switch to Dark Mode'}>
          {theme === 'dark' ? <><Sun size={16}/> Bright mode</> : <><Moon size={16}/> Dark mode</>}
        </button>
        <button className="button report-action-button" onClick={handleExport('excel')}><FileSpreadsheet size={16}/> Excel report</button>
        <button className="button report-action-button" onClick={handleExport('html')}><Globe size={16}/> Web report</button>
      </>}</div>
    </header>
    <main id="top" className="main-wrap">
      {deepLinkSymbol && !data && (
        <div className="deep-link-backdrop">
          <div className="deep-link-card">
            <div className="deep-link-header">
              <span className="deep-link-badge">ANALYSIS SETUP</span>
              <h3>
                Analyze Script: <span className="highlight-symbol">{deepLinkSymbol}</span>
              </h3>
              <p>Choose your report accounting type and verify your access key to open the financial report.</p>
            </div>

            <div className="deep-link-body">
              <div>
                <span className="deep-link-section-title">1. Type of Report</span>
                <div className="deep-link-mode-grid">
                  <button
                    type="button"
                    className={`deep-link-mode-card ${mode === 'nonbank' ? 'selected' : ''}`}
                    onClick={() => setMode('nonbank')}
                  >
                    <div className="mode-icon-title">
                      <BarChart3 size={18} />
                      <span>Non-Bank Company</span>
                    </div>
                    <small>Manufacturing, IT, FMCG, Pharma, Services</small>
                  </button>

                  <button
                    type="button"
                    className={`deep-link-mode-card ${mode === 'bank' ? 'selected' : ''}`}
                    onClick={() => setMode('bank')}
                  >
                    <div className="mode-icon-title">
                      <Landmark size={18} />
                      <span>Banking & Financials</span>
                    </div>
                    <small>Interest spread, Advances, NPA & Bank metrics</small>
                  </button>
                </div>
              </div>

              {!supportsLocalScreener && (
                <div className="deep-link-field">
                  <label htmlFor="modal-access-key" className="deep-link-section-title">2. Ledger Access Key</label>
                  <input
                    id="modal-access-key"
                    type="password"
                    value={accessKey}
                    onChange={e => updateAccessKey(e.target.value)}
                    placeholder="Enter your private access key"
                    autoComplete="current-password"
                  />
                  <small className="deep-link-field-hint">
                    {accessKey ? '✓ Access key remembered in browser' : 'Enter access key once to authorize Screener downloads.'}
                  </small>
                </div>
              )}

              {error && (
                <div className="deep-link-error">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="deep-link-actions">
                <button
                  type="button"
                  className="deep-link-btn-primary"
                  disabled={busy || (!supportsLocalScreener && !accessKey.trim())}
                  onClick={async () => {
                    const code = deepLinkSymbol.trim().toUpperCase()
                    await fetchFromScreener(code, accessKey, mode)
                    setDeepLinkSymbol('')
                  }}
                >
                  {busy ? (
                    <><LoaderCircle className="spin" size={16}/> Downloading & Analyzing…</>
                  ) : (
                    <><Sparkles size={16}/> Open Analyzed Report</>
                  )}
                </button>
                <button
                  type="button"
                  className="deep-link-btn-secondary"
                  disabled={busy}
                  onClick={() => setDeepLinkSymbol('')}
                >
                  Cancel / Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
                    onChange={event => updateAccessKey(event.target.value)}
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
                  ? 'A Chrome window will open. Sign in there if prompted; the browser profile is securely reused.'
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
        <section className="company-banner"><div className="company-title-wrap"><div className="company-icon">{data.companyName.slice(0,1).toUpperCase()}</div><div><div className="hero-kicker"><span className="status-pulse"/> {data.mode === 'bank' ? 'BANK ANALYSIS' : 'NON-BANK ANALYSIS'} <span className="title-divider">/</span> {data.annual[0]?.period} — {data.annual.at(-1)?.period}</div><h1>{data.companyName}</h1><p className="muted">Source: {data.sourceFileName}{data.faceValue !== null ? ` · Face value ₹${compact(data.faceValue)}` : ''}</p></div></div><div className="company-actions">{screenerUrl && <a href={screenerUrl} target="_blank" rel="noopener noreferrer" className="button screener-ribbon-button" title={`Open ${activeCode || data.companyName} directly in Screener.in`}><ExternalLink size={15}/> SCREENER.IN</a>}<button className="button button-soft" onClick={reset}><RefreshCw size={15}/> New workbook</button><button className="button button-danger-soft" onClick={reset}><Trash2 size={15}/> Clear</button></div></section>
        <nav className="section-nav" aria-label="Analysis sections">{sections.map(({key,label,icon:Icon})=><button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}><Icon size={16}/>{label}{section===key&&<span className="nav-active-mark"/>}</button>)}</nav>
        {data.mode === 'bank' ? (
          <>
            {section === 'about' && (
              <AboutSection
                about={about}
                fallbackCompanyName={data.companyName}
                onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
                onUnlockWithKey={enteredKey => {
                  updateAccessKey(enteredKey)
                  void loadAboutForCompany(data, activeCode, data.companyName, enteredKey, true)
                }}
              />
            )}
            {section === 'comparison' && (
              <ComparisonSection
                about={about}
                companyName={data.companyName}
                symbol={activeCode}
                isBank={true}
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
            <BankDashboard data={data} section={section} specs={bankSpecs!} theme={theme}/>
          </>
        ) : (
          <>
            {section === 'about' && (
              <AboutSection
                about={about}
                fallbackCompanyName={data.companyName}
                onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
                onUnlockWithKey={enteredKey => {
                  updateAccessKey(enteredKey)
                  void loadAboutForCompany(data, activeCode, data.companyName, enteredKey, true)
                }}
              />
            )}
            {section === 'comparison' && (
              <ComparisonSection
                about={about}
                companyName={data.companyName}
                symbol={activeCode}
                isBank={false}
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
            {section === 'checks' && <DataChecksView data={data} />}
            <CompanyDashboard data={data} section={section} specs={companySpecs!} theme={theme}/>
          </>
        )}
        {error && <div className="error-box"><AlertTriangle size={16}/>{error}</div>}
        <footer className="app-footer"><span>LEDGER <b>·</b> PRIVATE BY DESIGN</span><span>Workbook is processed in browser memory only. Clearing or refreshing removes it.</span></footer>
      </>}
    </main>
    {data && (
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
                <p className="muted">Source: {data.sourceFileName}{data.faceValue !== null ? ` · Face value ₹${compact(data.faceValue)}` : ''}</p>
              </div>
            </div>
          </section>
        </div>

        <div data-print-section="about">
          <AboutSection
            about={about}
            fallbackCompanyName={data.companyName}
            onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
            onUnlockWithKey={enteredKey => {
              updateAccessKey(enteredKey)
              void loadAboutForCompany(data, activeCode, data.companyName, enteredKey, true)
            }}
          />
        </div>

        <div data-print-section="comparison">
          <ComparisonSection
            about={about}
            companyName={data.companyName}
            symbol={activeCode}
            isBank={data.mode === 'bank'}
            onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
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
            onRetry={() => void loadAboutForCompany(data, activeCode, data.companyName, undefined, true)}
          />
        </div>

        <div data-print-section="tables">
          {data.mode === 'bank' ? (
            <BankDashboard data={data} section="tables" specs={bankSpecs!} theme="bright" hideExportStage/>
          ) : (
            <CompanyDashboard data={data} section="tables" specs={companySpecs!} theme="bright" hideExportStage/>
          )}
        </div>

        <div data-print-section="checks">
          <DataChecksView data={data} />
        </div>
      </div>
    )}
    {data && calculatorOpen && <ForecastCalculator data={data} theme={theme} onClose={() => setCalculatorOpen(false)}/>}
  </div>
}

export default App
