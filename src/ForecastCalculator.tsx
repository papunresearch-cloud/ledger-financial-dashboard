import { useEffect, useMemo, useState } from 'react'
import { Calculator, ChevronDown, CircleDollarSign, Landmark, X } from 'lucide-react'
import type { BankData, CompanyData, FinancialData } from './types'
import './forecastCalculator.css'

type CalculatorMode = 'nonbank' | 'bank'
type Inputs = { salesGrowth: string; npm: string; payout: string; cfoSales: string; fcfSales: string; years: string; price: string }
type ForecastRow = { year: string; sales: number; sps: number; eps: number; bvps: number; dps: number; cfoPerShare: number | null; fcfPerShare: number | null; pe: number | null; pb: number | null; ps: number | null; earningsYield: number | null; dividendYield: number | null }
const n = (value: number | null | undefined, fallback = 0) => value !== null && value !== undefined && Number.isFinite(value) ? value : fallback
const percent = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}%`
const amount = (value: number | null | undefined, digits = 2) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
const multiple = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${amount(value, 2)}×`

function sourceInputs(data: FinancialData): { sales: number; equity: number; shares: number; price: number; salesGrowth: number; npm: number; payout: number; cfoSales: number; fcfSales: number } {
  const latest = data.annual.at(-1)
  const prior = data.annual.at(-2)
  const bank = data.mode === 'bank'
  const sales = latest ? bank ? (latest as BankData['annual'][number]).totalRevenue : (latest as CompanyData['annual'][number]).sales : null
  const priorSales = prior ? bank ? (prior as BankData['annual'][number]).totalRevenue : (prior as CompanyData['annual'][number]).sales : null
  const equity = latest ? bank ? (latest as BankData['annual'][number]).equity : (latest as CompanyData['annual'][number]).equity : null
  const shares = latest?.sharesCr
  const npm = latest?.netProfitMargin
  const payout = latest ? bank ? (latest as BankData['annual'][number]).dividendPayout : (latest as CompanyData['annual'][number]).dividendPayout : null
  const cfo = latest ? bank ? (latest as BankData['annual'][number]).operatingCashFlow : (latest as CompanyData['annual'][number]).operatingCashFlow : null
  const fcf = latest ? bank ? (latest as BankData['annual'][number]).freeCashFlow : (latest as CompanyData['annual'][number]).freeCashFlow : null
  const salesGrowth = sales !== null && sales !== undefined && priorSales !== null && priorSales !== undefined && priorSales !== 0 ? (sales / priorSales - 1) * 100 : 0
  return { sales: n(sales), equity: n(equity), shares: n(shares), price: n(data.currentPrice), salesGrowth, npm: n(npm), payout: n(payout), cfoSales: sales ? n(cfo) / sales * 100 : 0, fcfSales: sales ? n(fcf) / sales * 100 : 0 }
}

export function ForecastCalculator({ data, onClose }: { data: FinancialData; onClose: () => void }) {
  const source = useMemo(() => sourceInputs(data), [data])
  const [mode, setMode] = useState<CalculatorMode>(data.mode === 'bank' ? 'bank' : 'nonbank')
  const [inputs, setInputs] = useState<Inputs>({ salesGrowth: String(Number(source.salesGrowth.toFixed(2))), npm: String(Number(source.npm.toFixed(2))), payout: String(Number(source.payout.toFixed(2))), cfoSales: String(Number(source.cfoSales.toFixed(2))), fcfSales: String(Number(source.fcfSales.toFixed(2))), years: '5', price: String(source.price) })
  const [validation, setValidation] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const parsed = { growth: Number(inputs.salesGrowth), npm: Number(inputs.npm), payout: Number(inputs.payout), cfoSales: Number(inputs.cfoSales), fcfSales: Number(inputs.fcfSales), years: Number(inputs.years), price: Number(inputs.price) }
  const valid = Object.values(parsed).every(Number.isFinite) && Number.isInteger(parsed.years) && parsed.years >= 1 && parsed.years <= 10 && parsed.price >= 0 && parsed.payout >= 0 && source.shares > 0 && source.sales > 0
  const rows: ForecastRow[] = useMemo(() => {
    if (!valid) return []
    let sales = source.sales
    let bvps = source.equity / source.shares
    const output: ForecastRow[] = []
    const lastPeriod = data.annual.at(-1)?.period ?? 'FY'
    const lastYear = Number(lastPeriod.match(/\d{4}/)?.[0])
    for (let i = 1; i <= parsed.years; i++) {
      sales *= 1 + parsed.growth / 100
      const netProfit = sales * parsed.npm / 100
      const eps = netProfit / source.shares
      const dps = eps * parsed.payout / 100
      bvps += eps - dps
      const cfoPerShare = mode === 'bank' ? null : sales * parsed.cfoSales / 100 / source.shares
      const fcfPerShare = mode === 'bank' ? null : sales * parsed.fcfSales / 100 / source.shares
      const salesPerShare = sales / source.shares
      output.push({ year: Number.isFinite(lastYear) ? `FY${lastYear + i}` : `Year ${i}`, sales, sps: salesPerShare, eps, bvps, dps, cfoPerShare, fcfPerShare,
        pe: eps > 0 ? parsed.price / eps : null, pb: bvps > 0 ? parsed.price / bvps : null, ps: salesPerShare > 0 ? parsed.price / salesPerShare : null,
        earningsYield: parsed.price > 0 && eps > 0 ? eps / parsed.price * 100 : null,
        dividendYield: parsed.price > 0 && dps >= 0 ? dps / parsed.price * 100 : null })
    }
    return output
  }, [data.annual, mode, parsed.growth, parsed.npm, parsed.payout, parsed.price, parsed.years, parsed.cfoSales, parsed.fcfSales, source.equity, source.sales, source.shares, valid])

  function update(field: keyof Inputs, value: string) { setInputs(current => ({ ...current, [field]: value })); setValidation('') }
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) { setValidation('Enter valid numbers, a non-negative price and payout, and a whole number of years from 1 to 10. The workbook must also contain positive sales and a valid share count.'); return }
    setValidation('')
  }

  const fields: Array<{ key: keyof Inputs; label: string; suffix: string; step?: string; hint?: string }> = [
    { key: 'salesGrowth', label: 'Expected sales growth', suffix: '%', step: '0.1' },
    { key: 'npm', label: 'Expected NPM', suffix: '%', step: '0.1' },
    { key: 'payout', label: 'Expected dividend payout', suffix: '%', step: '0.1' },
    { key: 'cfoSales', label: 'CFO / Sales', suffix: '%', step: '0.1' },
    { key: 'fcfSales', label: 'FCF / Sales', suffix: '%', step: '0.1' },
    { key: 'years', label: 'Number of years', suffix: 'years', step: '1' },
    { key: 'price', label: 'Market price', suffix: '₹', step: '0.01' },
  ]

  return <div className="forecast-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="forecast-modal" role="dialog" aria-modal="true" aria-labelledby="forecast-title">
      <header className="forecast-hero"><div className="forecast-hero-orb orb-one"/><div className="forecast-hero-orb orb-two"/><button className="forecast-close" onClick={onClose} aria-label="Close calculator"><X size={19}/></button>
        <div className="forecast-kicker"><Calculator size={15}/> LEDGER FORECAST STUDIO</div><h2 id="forecast-title">Forward value<br/><em>calculator</em></h2><p>Turn your assumptions into a year-by-year per-share outlook.</p>
        <div className="forecast-company-chip"><span>{data.companyName.slice(0, 1)}</span><div><b>{data.companyName}</b><small>Base year · {data.annual.at(-1)?.period ?? '—'}</small></div></div>
      </header>
      <div className="forecast-body">
        <form className="forecast-input-panel" onSubmit={handleSubmit}>
          <div className="forecast-section-heading"><span>01</span><div><b>Set your assumptions</b><small>Pre-filled from the latest annual Data Sheet where possible</small></div></div>
          <label className="forecast-label">Company type</label><div className="forecast-mode-switch"><button type="button" className={mode === 'nonbank' ? 'selected' : ''} onClick={() => setMode('nonbank')}><CircleDollarSign size={16}/> Non-bank</button><button type="button" className={mode === 'bank' ? 'selected' : ''} onClick={() => setMode('bank')}><Landmark size={16}/> Bank</button></div>
          <div className="forecast-field-grid">{fields.map(field => <label className={`forecast-field ${field.key === 'cfoSales' && mode === 'bank' ? 'disabled' : ''}`} key={field.key}>
            <span>{field.label}</span><div className="forecast-input-wrap"><input type="number" inputMode="decimal" step={field.step ?? 'any'} value={inputs[field.key]} disabled={field.key === 'cfoSales' && mode === 'bank'} min={field.key === 'years' ? 1 : undefined} max={field.key === 'years' ? 10 : undefined} onChange={event => update(field.key, event.target.value)} /><i>{field.suffix}</i></div>{field.hint && <small>{field.hint}</small>}
          </label>)}</div>
          <div className="forecast-base-data"><div><span>{mode === 'bank' ? 'Latest revenue' : 'Latest sales'}</span><b>₹{amount(source.sales, 0)} cr</b></div><div><span>Book equity</span><b>₹{amount(source.equity, 0)} cr</b></div><div><span>Adjusted shares</span><b>{amount(source.shares, 2)} cr</b></div></div>
          {validation && <div className="forecast-validation" role="alert">{validation}</div>}
          <button className="forecast-generate" type="submit">Update projection <ChevronDown size={17}/></button>
        </form>
        <div className="forecast-results">
          <div className="forecast-section-heading result-heading"><span>02</span><div><b>Projection</b><small>Computed from your inputs and last year data</small></div></div>
          {!valid ? <div className="forecast-empty">Complete the inputs with valid values to see the projection.</div> : <>
            <section className="forecast-table-card earnings-card"><div className="forecast-card-title"><span className="table-icon purple">₹</span><div><b>Per-share values (₹)</b><small>Per-share measures for each forecast year</small></div></div><div className="forecast-table-scroll"><table><thead><tr><th>Year</th><th>SPS</th><th>EPS</th><th>BVS</th><th>Dividend</th>{mode === 'nonbank' && <><th>OCF</th><th>FCF</th></>}</tr></thead><tbody>{rows.map(row => <tr key={row.year}><th>{row.year}</th><td>{amount(row.sps)}</td><td>{amount(row.eps)}</td><td>{amount(row.bvps)}</td><td>{amount(row.dps)}</td>{mode === 'nonbank' && <><td>{amount(row.cfoPerShare)}</td><td>{amount(row.fcfPerShare)}</td></>}</tr>)}</tbody></table></div></section>
            <section className="forecast-table-card multiples-card"><div className="forecast-card-title"><span className="table-icon blue">×</span><div><b>Forward valuation & yields</b><small>At constant input Market price</small></div></div><div className="forecast-table-scroll"><table><thead><tr><th>Year</th><th>PE</th><th>PB</th><th>PS</th><th><span className="forecast-wrap-heading">Earning<br/>Yield</span></th><th><span className="forecast-wrap-heading">Dividend<br/>Yield</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.year}><th>{row.year}</th><td>{multiple(row.pe)}</td><td>{multiple(row.pb)}</td><td>{multiple(row.ps)}</td><td>{percent(row.earningsYield)}</td><td>{percent(row.dividendYield)}</td></tr>)}</tbody></table></div></section>
          </>}
          <p className="forecast-footnote">SPS = forecast sales ÷ shares; EPS = forecast sales × NPM ÷ shares; BVS rolls forward by EPS less dividend/share. OCF/share and FCF/share use their respective sales ratios and are omitted for banks. Multiples and yields use the entered market price; negative or unavailable valuation denominators show as —.</p>
        </div>
      </div>
    </section>
  </div>
}
