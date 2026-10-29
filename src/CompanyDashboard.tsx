import { Activity } from 'lucide-react'
import { ChartPanel, type ChartSpec } from './Charts'
import { PerShareRollingSummary } from './PerShareRollingSummary'
import { averageOfThreeYearRollingAverages } from './rollingPerShare'
import type { AnnualRow, CompanyData, QuarterRow } from './types'

type Section = 'overview' | 'yearly' | 'quarterly' | 'tables' | 'checks'
type CompanySpecs = { annual: ChartSpec[]; margins: ChartSpec[]; quarterly: ChartSpec[]; special: ChartSpec[] }
const fmt = (value: number | null | undefined, decimals = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(value)
const percent = (value: number | null) => value === null || !Number.isFinite(value) || Math.abs(value) > 1000 ? '—' : `${value.toFixed(1)}%`
const moneyCr = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `₹ ${fmt(value, 0)} Cr`
const latest = <K extends keyof AnnualRow>(rows: AnnualRow[], key: K) => [...rows].reverse().find(row => typeof row[key] === 'number')?.[key] as number | null | undefined
const mean = <K extends 'roe' | 'roa' | 'roce' | 'dividendPayout' | 'operatingProfitMargin' | 'netProfitMargin'>(rows: AnnualRow[], key: K, years: number): number | null => {
  const slice = rows.slice(-years)
  if (slice.length < years || slice.some(row => row[key] === null || !Number.isFinite(row[key]))) return null
  const value = slice.reduce((sum, row) => sum + (row[key] as number), 0) / years
  return Number.isFinite(value) && Math.abs(value) <= 1000 ? value : null
}
const meanAvailable = (rows: AnnualRow[], key: 'dividendPayout', years: number): number | null => {
  const values = rows.slice(-years).map(row => row[key]).filter((value): value is number => value !== null && Number.isFinite(value))
  if (!values.length) return null
  const value = values.reduce((sum, item) => sum + item, 0) / values.length
  return Number.isFinite(value) && Math.abs(value) <= 1000 ? value : null
}
const sumRatio = (rows: AnnualRow[], numerator: 'operatingCashFlow' | 'freeCashFlow', denominator: 'sales' | 'netProfit', years: number): number | null => {
  const slice = rows.slice(-years)
  if (slice.length < years || slice.some(row => row[numerator] === null || row[denominator] === null)) return null
  const n = slice.reduce((sum, row) => sum + (row[numerator] as number), 0)
  const d = slice.reduce((sum, row) => sum + (row[denominator] as number), 0)
  const value = d <= 0 ? null : 100 * n / d
  return value !== null && Number.isFinite(value) && Math.abs(value) <= 1000 ? value : null
}
const cagr = (start: number | null | undefined, end: number | null | undefined, years: number) => start === null || start === undefined || end === null || end === undefined || start <= 0 || end <= 0 || years <= 0 ? null : (Math.pow(end / start, 1 / years) - 1) * 100
const annualCagr = (rows: AnnualRow[], key: 'sales' | 'totalIncome' | 'netProfit' | 'equity', years: number) => cagr(rows.at(-(years + 1))?.[key], rows.at(-1)?.[key], years)
const ttmSum = (rows: QuarterRow[], key: 'sales' | 'totalIncome' | 'netProfit', offset = 0) => {
  const end = rows.length - offset
  const start = end - 4
  if (start < 0) return null
  const group = rows.slice(start, end)
  return group.some(row => row[key] === null) ? null : group.reduce((sum, row) => sum + (row[key] as number), 0)
}
export function CompanyDashboard({ data, section, specs }: { data: CompanyData; section: Section; specs: CompanySpecs }) {
  const ttmSales = ttmSum(data.quarterly, 'sales')
  const ttmProfit = ttmSum(data.quarterly, 'netProfit')
  const ttmShares = latest(data.annual, 'sharesCr')
  const ttmEps = ttmProfit === null || ttmShares === null || ttmShares === undefined || ttmShares <= 0 ? null : ttmProfit / ttmShares
  const epsRollingAverage = averageOfThreeYearRollingAverages([...data.annual.map(row => row.eps), ttmEps])
  const dividendRollingAverage = averageOfThreeYearRollingAverages(data.annual.map(row => row.dividendPerShare))
  const fcfPerShareRollingAverage = averageOfThreeYearRollingAverages(data.annual.map(row =>
    row.freeCashFlow === null || row.sharesCr === null || row.sharesCr <= 0 ? null : row.freeCashFlow / row.sharesCr,
  ))
  const equity = latest(data.annual, 'equity')
  const marketCap = data.currentMarketCap
  const ratios = [
    { label: 'Interest coverage', value: latest(data.annual, 'interestCoverage'), suffix: '×' },
    { label: 'Current ratio', value: latest(data.annual, 'currentRatio'), suffix: '×' },
    { label: 'Cash ratio', value: latest(data.annual, 'cashRatio'), suffix: '×' },
  ]
  const growthPeriods = [
    { label: 'TTM', value: (key: 'sales' | 'totalIncome' | 'netProfit' | 'equity') => key === 'equity' ? null : cagr(ttmSum(data.quarterly, key, 4), ttmSum(data.quarterly, key), 1) },
    { label: 'Last year', value: (key: 'sales' | 'totalIncome' | 'netProfit' | 'equity') => annualCagr(data.annual, key, 1) },
    { label: '3 years', value: (key: 'sales' | 'totalIncome' | 'netProfit' | 'equity') => annualCagr(data.annual, key, 3) },
    { label: '5 years', value: (key: 'sales' | 'totalIncome' | 'netProfit' | 'equity') => annualCagr(data.annual, key, 5) },
    { label: '7 years', value: (key: 'sales' | 'totalIncome' | 'netProfit' | 'equity') => annualCagr(data.annual, key, 7) },
    { label: '9 years', value: (key: 'sales' | 'totalIncome' | 'netProfit' | 'equity') => annualCagr(data.annual, key, 9) },
  ]
  const returnRows = [
    { title: 'ROA', one: latest(data.annual, 'roa') ?? null, three: mean(data.annual, 'roa', 3), five: mean(data.annual, 'roa', 5), seven: mean(data.annual, 'roa', 7), nine: mean(data.annual, 'roa', 9) },
    { title: 'ROE', one: latest(data.annual, 'roe') ?? null, three: mean(data.annual, 'roe', 3), five: mean(data.annual, 'roe', 5), seven: mean(data.annual, 'roe', 7), nine: mean(data.annual, 'roe', 9) },
    { title: 'ROCE', one: latest(data.annual, 'roce') ?? null, three: mean(data.annual, 'roce', 3), five: mean(data.annual, 'roce', 5), seven: mean(data.annual, 'roce', 7), nine: mean(data.annual, 'roce', 9) },
    { title: 'Dividend payout', one: data.annual.at(-1)?.dividendPayout ?? null, three: meanAvailable(data.annual, 'dividendPayout', 3), five: meanAvailable(data.annual, 'dividendPayout', 5), seven: meanAvailable(data.annual, 'dividendPayout', 7), nine: meanAvailable(data.annual, 'dividendPayout', 9) },
  ]
  const cashQuality = [
    { title: 'OPM', one: latest(data.annual, 'operatingProfitMargin') ?? null, three: mean(data.annual, 'operatingProfitMargin', 3), five: mean(data.annual, 'operatingProfitMargin', 5), seven: mean(data.annual, 'operatingProfitMargin', 7), nine: mean(data.annual, 'operatingProfitMargin', 9) },
    { title: 'NPM', one: latest(data.annual, 'netProfitMargin') ?? null, three: mean(data.annual, 'netProfitMargin', 3), five: mean(data.annual, 'netProfitMargin', 5), seven: mean(data.annual, 'netProfitMargin', 7), nine: mean(data.annual, 'netProfitMargin', 9) },
    { title: 'CFO / Sales', one: sumRatio(data.annual, 'operatingCashFlow', 'sales', 1), three: sumRatio(data.annual, 'operatingCashFlow', 'sales', 3), five: sumRatio(data.annual, 'operatingCashFlow', 'sales', 5), seven: sumRatio(data.annual, 'operatingCashFlow', 'sales', 7), nine: sumRatio(data.annual, 'operatingCashFlow', 'sales', 9) },
    { title: 'FCF / Sales', one: sumRatio(data.annual, 'freeCashFlow', 'sales', 1), three: sumRatio(data.annual, 'freeCashFlow', 'sales', 3), five: sumRatio(data.annual, 'freeCashFlow', 'sales', 5), seven: sumRatio(data.annual, 'freeCashFlow', 'sales', 7), nine: sumRatio(data.annual, 'freeCashFlow', 'sales', 9) },
    { title: 'CFO / Net profit', one: sumRatio(data.annual, 'operatingCashFlow', 'netProfit', 1), three: sumRatio(data.annual, 'operatingCashFlow', 'netProfit', 3), five: sumRatio(data.annual, 'operatingCashFlow', 'netProfit', 5), seven: sumRatio(data.annual, 'operatingCashFlow', 'netProfit', 7), nine: sumRatio(data.annual, 'operatingCashFlow', 'netProfit', 9) },
    { title: 'FCF / Net profit', one: sumRatio(data.annual, 'freeCashFlow', 'netProfit', 1), three: sumRatio(data.annual, 'freeCashFlow', 'netProfit', 3), five: sumRatio(data.annual, 'freeCashFlow', 'netProfit', 5), seven: sumRatio(data.annual, 'freeCashFlow', 'netProfit', 7), nine: sumRatio(data.annual, 'freeCashFlow', 'netProfit', 9) },
  ]
  const displayRows = [...data.sourceMatrix].map(row => row ?? [])
  const cleanSourceText = (value: unknown) => typeof value === 'string'
    ? value.replace(/PLEASE\s+DO\s+NOT\s+MAKE\s+ANY\s+CHANGES\s+TO\s+THIS\s+SHEET/gi, '').trim()
    : value
  return <>
    {section === 'overview' && <div className="company-overview">
      <div className="company-overview-heading"><div><div className="hero-kicker">NON-BANK FINANCIAL SNAPSHOT</div><h2>At a glance</h2><p>Valuation, returns, cash quality and growth from the uploaded Data Sheet.</p></div><span>{data.annual.at(-1)?.period ?? ''}</span></div>
      <div className="company-snapshot-grid">
        <Snapshot label="Current market cap" value={moneyCr(marketCap)} tone="mint"/><Snapshot label="Total asset" value={moneyCr(latest(data.annual, 'totalAssets'))} tone="violet"/><Snapshot label="TTM sales" value={moneyCr(ttmSales)} tone="blue"/>
        <Snapshot label="P / E" value={marketCap !== null && ttmProfit !== null && ttmProfit > 0 ? `${fmt(marketCap / ttmProfit, 2)}×` : '—'} tone="pink"/><Snapshot label="P / B" value={marketCap !== null && equity !== null && equity !== undefined && equity > 0 ? `${fmt(marketCap / equity, 2)}×` : '—'} tone="gold"/><Snapshot label="P / S" value={marketCap !== null && ttmSales !== null && ttmSales > 0 ? `${fmt(marketCap / ttmSales, 2)}×` : '—'} tone="teal"/>
      </div>
      <PerShareRollingSummary eps={epsRollingAverage} dividendPerShare={dividendRollingAverage} freeCashFlowPerShare={fcfPerShareRollingAverage} note="EPS includes the latest TTM value when four quarters and share data are available. Dividend per Share and FCF per Share use annual data because quarterly dividend and cash-flow inputs are unavailable."/>
      <div className="company-ratio-strip">{ratios.map(item => <div className="company-ratio-chip" key={item.label}><span>{item.label} · latest</span><strong>{item.value === null || item.value === undefined || !Number.isFinite(item.value) || item.value < 0 || item.value > 1000 ? '' : `${fmt(item.value, 2)}${item.suffix}`}</strong></div>)}</div>
      <SummaryTable title="Returns & dividend payout" note="Dividend payout averages skip blank or unusable years and divide by the number of valid years; Last year shows only the latest year." rows={returnRows}/>
      <SummaryTable title="Cash flow quality" note="CFO = Cash from Operating Activity · FCF = CFO − Capital Work in Progress. Period ratios use summed cash flows divided by summed denominators." rows={cashQuality}/>
      <section className="company-summary-block"><div className="company-block-heading"><div><span>COMPOUND GROWTH</span><h3>Growth by period</h3></div><small>CAGR · %</small></div><div className="company-table-scroll"><table className="company-growth-table"><thead><tr><th>Metric</th>{growthPeriods.map(p => <th key={p.label}>{p.label}</th>)}</tr></thead><tbody>{([['Total income','totalIncome'],['Sales','sales'],['Total net profit','netProfit'],['Total equity','equity']] as const).map(([label,key])=><tr key={key}><th>{label}</th>{growthPeriods.map(p=><td key={p.label}>{percent(p.value(key))}</td>)}</tr>)}</tbody></table></div><p className="company-summary-note">TTM growth compares the latest four quarters with the previous four. Equity uses annual periods only. CAGR is blank when there is insufficient history or a non-positive start/end value. Unusable ratios remain blank.</p></section>
      <div className="company-method-note"><Activity size={17}/><span>Interest coverage = (profit before tax + interest) ÷ interest. ROCE = EBIT ÷ average capital employed, where capital employed is equity plus borrowings. Current ratio uses Other Assets ÷ Other Liabilities; cash ratio uses Cash & Bank ÷ Other Liabilities.</span></div>
    </div>}
    {section === 'yearly' && <div className="company-plots-page">
      <div className="company-page-heading"><div><div className="hero-kicker">NON-BANK PLOTBOOK</div><h2>Yearly & quarterly plots</h2></div><span>₹ CRORE UNLESS STATED</span></div>
      <div className="chart-grid">{[...specs.annual, ...specs.margins, ...specs.quarterly].map(spec => <ChartPanel key={spec.id} spec={spec} theme="dark" />)}</div>
      <section className="company-chart-section company-special-chart-section"><div className="company-chart-section-heading"><h3>Special analysis</h3><i>YEARLY · NON-STANDARD RATIOS</i></div><div className="chart-grid">{specs.special.map(spec => <ChartPanel key={spec.id} spec={spec} theme="dark" />)}</div></section>
    </div>}
    {section === 'tables' && <section className="company-data-sheet">
      <div className="company-page-heading"><div><div className="hero-kicker">ORIGINAL WORKBOOK VIEW</div><h2>Data Sheet</h2><p>{data.sourceFileName} · original row and column order</p></div><span>{displayRows.length} ROWS</span></div>
      <div className="company-sheet-frame"><div className="company-sheet-topline"><i/><i/><i/><strong>DATA SHEET</strong><small>Source values · empty cells preserved</small></div><div className="company-source-scroll"><table className="company-source-table"><tbody>{displayRows.map((cells,i)=>{const label=String(cells[0]??'').trim().toLowerCase().replace(/:$/,'');const section=['company name','meta','profit & loss','quarters','balance sheet','cash flow','price','derived'].includes(label);const date=label==='report date';return <tr key={i} className={section?'source-section':date?'source-period':''}>{cells.map((cell,j)=>{const clean=cleanSourceText(cell);return <td key={j} className={j===0?'source-label':''}>{clean instanceof Date?clean.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):typeof clean==='number'?fmt(clean,2):clean==null?'':String(clean)}</td>})}</tr>})}</tbody></table></div></div>
    </section>}
    <div className="chart-export-stage company-chart-export-stage" aria-hidden="true">{[...specs.annual,...specs.margins,...specs.quarterly,...specs.special].map(spec=><ChartPanel key={`company-export-${spec.id}`} spec={spec} theme="dark" exportMode/>)}</div>
  </>
}

function Snapshot({ label, value, tone }: { label: string; value: string; tone: string }) { return <article className={`company-snapshot tone-${tone}`}><span>{label}</span><strong>{value}</strong></article> }
function SummaryTable({ title, note, rows }: { title: string; note: string; rows: Array<{ title: string; one: number | null; three: number | null; five: number | null; seven: number | null; nine: number | null }> }) {
  return <section className="company-summary-block"><div className="company-block-heading"><div><span>{title.startsWith('Returns') ? 'PROFITABILITY' : 'CASH CONVERSION'}</span><h3>{title}</h3></div><small>Percent</small></div><div className="company-table-scroll"><table className="company-growth-table"><thead><tr><th>Ratio</th><th>Last year</th><th>3-year average</th><th>5-year average</th><th>7-year average</th><th>9-year average</th></tr></thead><tbody>{rows.map(r=><tr key={r.title}><th>{r.title}</th><td>{percent(r.one)}</td><td>{percent(r.three)}</td><td>{percent(r.five)}</td><td>{percent(r.seven)}</td><td>{percent(r.nine)}</td></tr>)}</tbody></table></div><p className="company-summary-note">{note}</p></section>
}
