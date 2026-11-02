import { Activity } from 'lucide-react'
import { ChartPanel, type ChartSpec } from './Charts'
import { PerShareRollingSummary } from './PerShareRollingSummary'
import { averageOfThreeYearRollingAverages } from './rollingPerShare'
import type { AnnualRow, CompanyData, QuarterRow } from './types'

type Section = 'overview' | 'yearly' | 'quarterly' | 'tables' | 'checks'
type CompanySpecs = { annual: ChartSpec[]; margins: ChartSpec[]; quarterly: ChartSpec[]; special: ChartSpec[] }
const fmt = (value: number | null | undefined, decimals = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(value)
const fmtTwoDecimals = (value: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const percent = (value: number | null) => value === null || !Number.isFinite(value) || Math.abs(value) > 1000 ? '—' : `${value.toFixed(1)}%`
const moneyCr = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `₹ ${fmt(value, 0)} Cr`
const latest = <K extends keyof AnnualRow>(rows: AnnualRow[], key: K) => [...rows].reverse().find(row => typeof row[key] === 'number')?.[key] as number | null | undefined
const middleAverage = (values: Array<number | null | undefined>): number | null => {
  const sorted = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value)).sort((a, b) => b - a)
  const count = sorted.length
  if (!count) return null
  const keep = count >= 6 ? count % 2 === 0 ? 4 : 3 : count === 5 ? 3 : count === 4 ? 2 : count === 3 ? 1 : count
  const start = Math.floor((count - keep) / 2)
  const middle = sorted.slice(start, start + keep)
  const average = middle.reduce((sum, value) => sum + value, 0) / middle.length
  return Number.isFinite(average) && Math.abs(average) <= 1000 ? average : null
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
    { label: 'Cash ratio', value: latest(data.annual, 'cashRatio'), suffix: '%' },
  ]
  const historyPeriods = Array.from({ length: Math.min(9, data.annual.length) }, (_, i) => ({ label: i === 0 ? 'LY' : `${i + 1}Y`, offset: i }))
  const historyMetricRows = (metrics: Array<{ title: string; getValue: (row: AnnualRow) => number | null }>) => metrics.map(metric => {
    const values = historyPeriods.map(period => metric.getValue(data.annual[data.annual.length - 1 - period.offset]))
    return { title: metric.title, values, average: middleAverage(values) }
  })
  const returnHistory = historyMetricRows([
    { title: 'ROA', getValue: row => row.roa },
    { title: 'ROE', getValue: row => row.roe },
    { title: 'ROCE', getValue: row => row.roce },
    { title: 'Dividend payout', getValue: row => row.dividendPayout },
  ])
  const cashHistory = historyMetricRows([
    { title: 'OPM', getValue: row => row.operatingProfitMargin },
    { title: 'NPM', getValue: row => row.netProfitMargin },
    { title: 'CFO / Sales', getValue: row => row.sales !== null && row.sales > 0 && row.operatingCashFlow !== null ? 100 * row.operatingCashFlow / row.sales : null },
    { title: 'FCF / Sales', getValue: row => row.sales !== null && row.sales > 0 && row.freeCashFlow !== null ? 100 * row.freeCashFlow / row.sales : null },
    { title: 'CFO / Net profit', getValue: row => row.netProfit !== null && row.netProfit > 0 && row.operatingCashFlow !== null ? 100 * row.operatingCashFlow / row.netProfit : null },
    { title: 'FCF / Net profit', getValue: row => row.netProfit !== null && row.netProfit > 0 && row.freeCashFlow !== null ? 100 * row.freeCashFlow / row.netProfit : null },
  ])
  const ttmOtherIncome = (offset = 0) => {
    const income = ttmSum(data.quarterly, 'totalIncome', offset)
    const sales = ttmSum(data.quarterly, 'sales', offset)
    return income === null || sales === null ? null : income - sales
  }
  const cagrPeriods = Array.from({ length: 9 }, (_, i) => i + 1)
  const cagrRows = [
    { title: 'Sales', ttm: cagr(ttmSum(data.quarterly, 'sales', 4), ttmSales, 1), annual: cagrPeriods.map(years => annualCagr(data.annual, 'sales', years)) },
    { title: 'Other Income', ttm: cagr(ttmOtherIncome(4), ttmOtherIncome(), 1), annual: cagrPeriods.map(years => {
      const start = data.annual.at(-(years + 1)); const end = data.annual.at(-1)
      return start?.totalIncome === null || start?.totalIncome === undefined || start.sales === null || end?.totalIncome === null || end?.totalIncome === undefined || end.sales === null ? null : cagr(start.totalIncome - start.sales, end.totalIncome - end.sales, years)
    }) },
    { title: 'Net Profit', ttm: cagr(ttmSum(data.quarterly, 'netProfit', 4), ttmProfit, 1), annual: cagrPeriods.map(years => annualCagr(data.annual, 'netProfit', years)) },
    { title: 'Book Value', ttm: null, annual: cagrPeriods.map(years => annualCagr(data.annual, 'equity', years)) },
  ].map(row => ({ ...row, average: middleAverage(row.annual) }))
  const displayRows = [...data.sourceMatrix].map(row => row ?? [])
  const cleanSourceText = (value: unknown) => typeof value === 'string'
    ? value.replace(/PLEASE\s+DO\s+NOT\s+MAKE\s+ANY\s+CHANGES\s+TO\s+THIS\s+SHEET/gi, '').trim()
    : value
  return <>
    {section === 'overview' && <div className="company-overview">
      <div className="company-overview-heading"><div className="overview-heading-title"><div className="hero-kicker">NON-BANK FINANCIAL SNAPSHOT</div><h2>At a glance</h2><p>Valuation, returns, cash quality and growth from the uploaded Data Sheet.</p></div><div className="overview-current-price"><span>Current Price</span><strong>{data.currentPrice === null ? '—' : `₹ ${fmt(data.currentPrice, 2)}`}</strong><small>{data.annual.at(-1)?.period ?? ''}</small></div></div>
      <div className="company-snapshot-grid">
        <Snapshot label="Current market cap" value={moneyCr(marketCap)} tone="mint"/><Snapshot label="Total asset" value={moneyCr(latest(data.annual, 'totalAssets'))} tone="violet"/><Snapshot label="TTM sales" value={moneyCr(ttmSales)} tone="blue"/>
        <Snapshot label="P / E" value={marketCap !== null && ttmProfit !== null && ttmProfit > 0 ? `${fmt(marketCap / ttmProfit, 2)}×` : '—'} tone="pink"/><Snapshot label="P / B" value={marketCap !== null && equity !== null && equity !== undefined && equity > 0 ? `${fmtTwoDecimals(marketCap / equity)}×` : '—'} tone="gold"/><Snapshot label="P / S" value={marketCap !== null && ttmSales !== null && ttmSales > 0 ? `${fmt(marketCap / ttmSales, 2)}×` : '—'} tone="teal"/>
      </div>
      <PerShareRollingSummary eps={epsRollingAverage} dividendPerShare={dividendRollingAverage} freeCashFlowPerShare={fcfPerShareRollingAverage} note="EPS includes the latest TTM value when four quarters and share data are available. Dividend per Share and FCF per Share use annual data because quarterly dividend and cash-flow inputs are unavailable."/>
      <div className="company-ratio-strip">{ratios.map(item => <div className="company-ratio-chip" key={item.label}><span>{item.label} · latest</span><strong>{item.value === null || item.value === undefined || !Number.isFinite(item.value) || item.value < 0 || item.value > 1000 ? '' : `${fmt(item.suffix === '%' ? item.value * 100 : item.value, 2)}${item.suffix}`}</strong></div>)}</div>
      <AnnualHistoryTable title="Year-by-year returns" rows={returnHistory} periods={historyPeriods.map(period => period.label)} note="LY is the latest available annual observation. AVG sorts annual values from highest to lowest and averages the centered values: 3 for an odd count or 4 for an even count when at least 6 values are available; 3 for 5, 2 for 4, 1 for 3, and all values for 1–2 observations."/>
      <AnnualHistoryTable title="Year-by-year cash quality" rows={cashHistory} periods={historyPeriods.map(period => period.label)} note="CFO = Cash from Operating Activity · FCF = CFO − Capital Work in Progress. AVG uses the centered-value averaging rule shown above. CFO/Net profit and FCF/Net profit are blank when net profit is not positive."/>
      <section className="company-summary-block"><div className="company-block-heading"><div><span>COMPOUND GROWTH</span><h3>CAGR by duration</h3></div><small>CAGR · %</small></div><div className="company-table-scroll"><table className="company-growth-table"><thead><tr><th>Metric</th><th>TTM</th>{cagrPeriods.map(years => <th key={years}>{years}Y</th>)}<th>AVG</th></tr></thead><tbody>{cagrRows.map(row=><tr key={row.title}><th>{row.title}</th><td>{percent(row.ttm)}</td>{row.annual.map((value,index)=><td key={index}>{percent(value)}</td>)}<td>{percent(row.average)}</td></tr>)}</tbody></table></div><p className="company-summary-note">TTM CAGR compares the latest four quarters with the previous four. Annual CAGRs use the corresponding number of fiscal-year intervals. Other income is total income less sales; book value is equity share capital plus reserves. AVG uses annual 1Y–9Y CAGR values only and applies the centered-value averaging rule. Non-positive endpoints are not meaningful for CAGR and remain blank.</p></section>
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
function AnnualHistoryTable({ title, note, periods, rows }: { title: string; note: string; periods: string[]; rows: Array<{ title: string; values: Array<number | null>; average: number | null }> }) {
  return <section className="company-summary-block"><div className="company-block-heading"><div><span>ANNUAL DETAIL</span><h3>{title}</h3></div><small>Percent</small></div><div className="company-table-scroll"><table className="company-growth-table"><thead><tr><th>Ratio</th>{periods.map(label=><th key={label}>{label}</th>)}<th>AVG</th></tr></thead><tbody>{rows.map(row=><tr key={row.title}><th>{row.title}</th>{row.values.map((value,index)=><td key={index}>{percent(value)}</td>)}<td>{percent(row.average)}</td></tr>)}</tbody></table></div><p className="company-summary-note">{note}</p></section>
}
