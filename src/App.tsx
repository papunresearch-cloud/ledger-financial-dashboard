import { useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownToLine, BarChart3, Check, ChevronRight, CircleHelp, CloudOff, FileSpreadsheet, FileUp, Landmark, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { BankDashboard } from './BankDashboard'
import { CompanyDashboard } from './CompanyDashboard'
import { makeBankChartSpecs, makeChartSpecs } from './Charts'
import { exportExcel, exportPdf } from './exportReports'
import { parseBankWorkbook, parseCompanyWorkbook } from './parseWorkbook'
import companies from './companies.json'
import type { CompanyData, FinancialData } from './types'
import './cloud-download.css'

type Mode = 'nonbank' | 'bank'
type Section = 'overview' | 'yearly' | 'quarterly' | 'tables' | 'checks'
const compact = (n: number | null | undefined, digits = 1) => n === null || n === undefined || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n)
const supportsLocalScreener = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const supportsCloudScreener = !supportsLocalScreener

function App() {
  const [mode, setMode] = useState<Mode>('nonbank')
  const [section, setSection] = useState<Section>('overview')
  const [data, setData] = useState<FinancialData | null>(null)
  const [companyCode, setCompanyCode] = useState('')
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false)
  const [activeCompanySuggestion, setActiveCompanySuggestion] = useState(0)
  const [accessKey, setAccessKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
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

  async function processFile(file?: File) {
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) { setError('Choose an .xlsx workbook. Legacy .xls files are not supported yet.'); return }
    setBusy(true); setError('')
    try {
      const parsed = mode === 'bank' ? await parseBankWorkbook(file) : await parseCompanyWorkbook(file)
      setData(parsed); setSection('overview')
    } catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'Could not read this workbook.') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  async function fetchFromScreener() {
    const code = companyCode.trim().toUpperCase()
    if (!code) { setError('Enter a Screener company code such as INFY, ITC, or RELIANCE.'); return }
    if (!/^[A-Z0-9][A-Z0-9&._-]{0,31}$/.test(code)) { setError('Use the company code from its Screener URL, for example INFY or RELIANCE.'); return }
    setBusy(true); setError('')
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
      setData(parsed); setSection('overview')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(cause instanceof TypeError || /failed to fetch|networkerror/i.test(message) ? supportsLocalScreener ? 'The local Python download service is not running. Start it with the README instructions, then retry.' : 'The cloud download service could not be reached. Check its Vercel deployment and try again.' : message)
    } finally { setBusy(false) }
  }

  const reset = () => { setData(null); setError(''); setSection('overview'); if (fileInput.current) fileInput.current.value = '' }
  const handleExport = (kind: 'pdf' | 'excel') => async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!data) return
    try { if (kind === 'pdf') await exportPdf(data, event.currentTarget); else await exportExcel(data, event.currentTarget) }
    catch (cause) { setError(`Export failed: ${cause instanceof Error ? cause.message : String(cause)}`) }
  }
  const sections: Array<{ key: Section; label: string; icon: typeof BarChart3 }> = data?.mode === 'bank' ? [
    { key: 'overview', label: 'Overview', icon: Activity }, { key: 'yearly', label: 'Plots', icon: BarChart3 }, { key: 'tables', label: 'Data Sheet', icon: FileSpreadsheet }, { key: 'checks', label: 'Data checks', icon: CircleHelp },
  ] : [
    { key: 'overview', label: 'Overview', icon: Activity }, { key: 'yearly', label: 'Plots', icon: BarChart3 }, { key: 'tables', label: 'Data Sheet', icon: FileSpreadsheet }, { key: 'checks', label: 'Data checks', icon: CircleHelp },
  ]
  return <div className={`app-shell ${data?.mode === 'bank' ? 'bank-theme' : data ? 'company-theme' : ''}`}>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Ledger home"><span className="brand-mark"><Activity size={18}/></span><span>ledger<span className="brand-dot">.</span></span></a>
      <div className="topbar-right"><span className="privacy-label"><ShieldCheck size={15}/> Files stay in this browser</span>{data && <><button className="button button-soft" onClick={handleExport('pdf')}><ArrowDownToLine size={16}/> PDF report</button><button className="button button-primary" onClick={handleExport('excel')}><FileSpreadsheet size={16}/> Excel with charts</button></>}</div>
    </header>
    <main id="top" className="main-wrap">
      {!data ? <section className="welcome-view">
        <div className="welcome-copy"><div className="hero-kicker"><Sparkles size={15}/> FINANCIAL STATEMENTS, MADE CLEAR</div><h1>See the story<br/>behind the <em>numbers.</em></h1><p className="hero-description">Choose an analysis mode, upload its Data Sheet workbook or fetch a supported Screener export, then explore the financials and export a report.</p><div className="promise-row"><span><Check size={15}/> Workbook stays local</span><span><Check size={15}/> No Ledger account</span><span><Check size={15}/> Clear formulas</span></div></div>
        <div className="setup-card"><div className="step-label">START HERE <span>01 / 02</span></div><h2>Choose analysis mode</h2><p className="muted">The selected mode controls which financial ratios are calculated.</p>
          <div className="mode-options"><button className={`mode-option ${mode === 'nonbank' ? 'selected' : ''}`} onClick={() => setMode('nonbank')}><span className="mode-icon"><BarChart3 size={18}/></span><span className="mode-copy"><strong>Non-bank company</strong><small>Manufacturers, IT, FMCG and other companies</small></span><span className="radio-dot"/></button><button className={`mode-option ${mode === 'bank' ? 'selected' : ''}`} onClick={() => setMode('bank')}><span className="mode-icon bank"><Landmark size={18}/></span><span className="mode-copy"><strong>Bank</strong><small>Bank-specific calculations from the project prompt</small></span><span className="radio-dot"/></button></div>
          {supportsLocalScreener || supportsCloudScreener ? <div className="download-card"><div className="download-card-head"><span className="download-icon"><ArrowDownToLine size={18}/></span><div><strong>Fetch directly from Screener</strong><small>Type a company name to choose a match, or enter its code directly.</small></div></div>{!supportsLocalScreener && <><label htmlFor="ledger-access-key">Ledger access key</label><input id="ledger-access-key" type="password" value={accessKey} onChange={event => setAccessKey(event.target.value)} autoComplete="current-password" className="access-key-input" placeholder="Enter your private access key"/></>}<label htmlFor="company-code">Screener company code or ticker</label><div className="company-code-picker"><div className="company-code-field"><span>screener.in/company/</span><input id="company-code" value={companyCode} onChange={event => { setCompanyCode(event.target.value); setCompanySuggestionsOpen(true); setActiveCompanySuggestion(0) }} onFocus={() => setCompanySuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setCompanySuggestionsOpen(false), 150)} onKeyDown={event => { if (event.key === 'ArrowDown' && companySuggestions.length) { event.preventDefault(); setCompanySuggestionsOpen(true); setActiveCompanySuggestion(index => (index + 1) % companySuggestions.length) } else if (event.key === 'ArrowUp' && companySuggestions.length) { event.preventDefault(); setActiveCompanySuggestion(index => (index - 1 + companySuggestions.length) % companySuggestions.length) } else if (event.key === 'Escape') setCompanySuggestionsOpen(false); else if (event.key === 'Enter' && !busy) { event.preventDefault(); void fetchFromScreener() } }} placeholder="Company name or code (e.g. INFY)" autoComplete="off" aria-autocomplete="list" aria-controls="company-suggestions"/><span>/</span></div>{companySuggestionsOpen && companySuggestions.length > 0 && <ul id="company-suggestions" className="company-suggestions" role="listbox">{companySuggestions.map((company, index) => <li key={`${company.name}-${company.nse}-${company.bse}`} role="option" aria-selected={index === activeCompanySuggestion}><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => chooseCompany(company)}><span>{company.name}</span><small>{company.nse ? `NSE: ${company.nse}` : `BSE: ${company.bse}`}{company.nse && company.bse ? ` · BSE: ${company.bse}` : ''}</small></button></li>)}</ul>}</div><button className="button button-primary fetch-button" disabled={busy || (!supportsLocalScreener && !accessKey)} onClick={() => { setCompanySuggestionsOpen(false); void fetchFromScreener() }}>{busy ? <><LoaderCircle className="spin" size={16}/> Downloading & analyzing…</> : <><Sparkles size={16}/> Download & analyze</>}</button><p className="browser-note"><ShieldCheck size={14}/>{supportsLocalScreener ? 'A Chrome window will open. Sign in there if prompted; the browser profile is reused.' : 'The cloud service downloads through your configured proxy; the selected analysis mode is applied to the workbook after download.'}</p></div> : <div className="download-card"><div className="download-card-head"><span className="download-icon"><CloudOff size={18}/></span><div><strong>Cloud version: upload a workbook</strong><small>Direct Screener download uses a Chrome session on your own computer.</small></div></div><p className="browser-note"><ShieldCheck size={14}/>Save the Screener export as an .xlsx file, then choose it below. The workbook is analyzed in this browser and is not uploaded to a server.</p></div>}
          <div className="upload-divider"><span>OR USE A SAVED WORKBOOK</span></div><div className={`upload-zone manual-upload ${dragging ? 'dragging' : ''} ${busy ? 'loading' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void processFile(event.dataTransfer.files[0]) }}><input ref={fileInput} type="file" accept=".xlsx" hidden onChange={event => void processFile(event.target.files?.[0])}/><span className="upload-icon">{busy ? <LoaderCircle className="spin" size={20}/> : <FileUp size={20}/>}</span><strong>{busy ? 'Working…' : 'Drop a workbook here or choose a file'}</strong><small>Must include a <b>Data Sheet</b> worksheet</small><button className="button button-soft upload-button" disabled={busy} onClick={() => fileInput.current?.click()}>Choose .xlsx file <ChevronRight size={15}/></button><span className="file-note">MANUAL FALLBACK · PROCESSED ON YOUR DEVICE</span></div>
          <div className="local-note"><CloudOff size={15}/><span>Workbook is processed in browser memory and is not saved to a permanent file.</span></div>{error && <div className="error-box"><AlertTriangle size={16}/>{error}</div>}
        </div><div className="welcome-foot"><span>BUILT FOR CLARITY</span><span>Annual trends <b>·</b> Quarterly movement <b>·</b> Ratio analysis</span></div>
      </section> : <>
        <section className="company-banner"><div className="company-title-wrap"><div className="company-icon">{data.companyName.slice(0,1).toUpperCase()}</div><div><div className="hero-kicker"><span className="status-pulse"/> {data.mode === 'bank' ? 'BANK ANALYSIS' : 'NON-BANK ANALYSIS'} <span className="title-divider">/</span> {data.annual[0]?.period} — {data.annual.at(-1)?.period}</div><h1>{data.companyName}</h1><p className="muted">Source: {data.sourceFileName}{data.faceValue !== null ? ` · Face value ₹${compact(data.faceValue)}` : ''}</p></div></div><div className="company-actions"><button className="button button-soft" onClick={reset}><RefreshCw size={15}/> New workbook</button><button className="button button-danger-soft" onClick={reset}><Trash2 size={15}/> Clear</button></div></section>
        <nav className="section-nav" aria-label="Analysis sections">{sections.map(({key,label,icon:Icon})=><button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}><Icon size={16}/>{label}{section===key&&<span className="nav-active-mark"/>}</button>)}</nav>
        {data.mode === 'bank' ? <BankDashboard data={data} section={section} specs={bankSpecs!}/> : section === 'checks' ? <CompanyChecks data={data} /> : <CompanyDashboard data={data} section={section} specs={companySpecs!}/>}
        {error && <div className="error-box"><AlertTriangle size={16}/>{error}</div>}
        <footer className="app-footer"><span>LEDGER <b>·</b> PRIVATE BY DESIGN</span><span>Workbook is processed in browser memory only. Clearing or refreshing removes it.</span></footer>
      </>}
    </main>
  </div>
}

function CheckRow({ label, value }: { label: string; value: string }) { return <div className="check-row"><span>{label}</span><b>{value}</b></div> }
function CompanyChecks({ data }: { data: CompanyData }) {
  return <><div className="section-intro"><div><div className="hero-kicker">TRANSPARENT INPUTS</div><h2>Data checks & definitions</h2><p>Missing source fields remain blank; unavailable current-asset figures are not inferred.</p></div><span className={`check-status ${data.warnings.length?'attention':''}`}>{data.warnings.length?<><AlertTriangle size={15}/> REVIEW INPUTS</>:<><Check size={15}/> READY</>}</span></div>
    <div className="checks-grid"><div className="checks-card"><h3><ShieldCheck size={18}/> Source and coverage</h3><CheckRow label="Company" value={data.companyName}/><CheckRow label="Annual periods" value={`${data.annual[0]?.period??'—'} to ${data.annual.at(-1)?.period??'—'}`}/><CheckRow label="Quarterly periods" value={`${data.quarterly.length} quarters`}/><CheckRow label="Face value" value={data.faceValue===null?'Not provided':`₹${data.faceValue}`}/><CheckRow label="Input file" value={data.sourceFileName}/></div>
    <div className="checks-card definitions-card"><h3><CircleHelp size={18}/> Calculation rules</h3><ul><li><b>FCF</b> = Cash from Operating Activity − Capital Work in Progress.</li><li><b>ROE / ROA</b> = net profit ÷ average equity / average total assets.</li><li><b>ROCE</b> = (profit before tax + interest) ÷ average (equity + borrowings).</li><li><b>Interest coverage</b> = (profit before tax + interest) ÷ interest.</li><li><b>Current ratio</b> = Other Assets ÷ Other Liabilities. <b>Cash ratio</b> = Cash & Bank ÷ Other Liabilities.</li><li><b>Current assets chart proxy</b> = Other Assets. The current-assets share is Other Assets ÷ Total Assets.</li><li><b>CFO/FCF quality</b> uses period-summed values; missing periods, non-positive denominators, and extreme values remain blank.</li><li><b>Valuation</b> ratios use current market cap ÷ TTM net profit, latest equity, or TTM sales.</li></ul></div></div>
    <div className="checks-card warnings-card"><h3><AlertTriangle size={18}/> Workbook-specific notices</h3>{data.warnings.length?<ul>{data.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>:<p>No missing-input warnings for the calculated chart set.</p>}</div></>
}

export default App
