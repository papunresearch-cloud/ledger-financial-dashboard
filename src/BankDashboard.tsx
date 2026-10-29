import { AlertTriangle, CircleHelp, Landmark, ShieldCheck } from 'lucide-react'
import { ChartPanel, type BankChartSpecs } from './Charts'
import { PerShareRollingSummary } from './PerShareRollingSummary'
import { averageOfThreeYearRollingAverages } from './rollingPerShare'
import type { BankData, BankAnnualRow, BankQuarterRow } from './types'

type Section = 'overview' | 'yearly' | 'quarterly' | 'tables' | 'checks'
const amount = (value: number | null | undefined, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
const percent = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
const latest = <K extends keyof BankAnnualRow>(rows: BankAnnualRow[], key: K) => [...rows].reverse().find(row => typeof row[key] === 'number')?.[key] as number | null | undefined
const average = <K extends 'roe' | 'roa' | 'dividendPayout'>(rows: BankAnnualRow[], key: K, periods: number) => {
  const window = rows.slice(-periods)
  const values = window.map(row => row[key]).filter((value): value is number => value !== null && Number.isFinite(value))
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count: values.length, total: periods }
}
const cagr = (start: number | null | undefined, end: number | null | undefined, years: number) => start === null || start === undefined || end === null || end === undefined || start <= 0 || end <= 0 || years <= 0 ? null : (Math.pow(end / start, 1 / years) - 1) * 100
type GrowthMetric = 'totalRevenue' | 'netProfit' | 'equity' | 'interestEarned' | 'interestPaid' | 'otherIncome'
type TtmGrowthMetric = Exclude<GrowthMetric, 'equity'>
const annualCagr = <K extends GrowthMetric>(rows: BankAnnualRow[], key: K, years: number) => {
  const current = rows.at(-1)?.[key]
  const prior = rows.at(-(years + 1))?.[key]
  return cagr(prior, current, years)
}
const ttmSum = <K extends TtmGrowthMetric>(rows: BankQuarterRow[], key: K, offset: number) => {
  const end = rows.length - offset
  const start = end - 4
  if (start < 0) return null
  const period = rows.slice(start, end)
  if (period.length !== 4 || period.some(row => row[key] === null)) return null
  return period.reduce((sum, row) => sum + (row[key] as number), 0)
}
const ttmCagr = <K extends TtmGrowthMetric>(rows: BankQuarterRow[], key: K) => cagr(ttmSum(rows, key, 4), ttmSum(rows, key, 0), 1)
const rupeesCr = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `₹ ${amount(value)} Cr`

export function BankDashboard({ data, section, specs }: { data: BankData; section: Section; specs: BankChartSpecs }) {
  const newest = data.annual.at(-1)
  const ttmNetProfit = ttmSum(data.quarterly, 'netProfit', 0)
  const currentShares = latest(data.annual, 'sharesCr')
  const ttmEps = ttmNetProfit === null || currentShares === null || currentShares === undefined || currentShares <= 0 ? null : ttmNetProfit / currentShares
  const epsRollingAverage = averageOfThreeYearRollingAverages([...data.annual.map(row => row.eps), ttmEps])
  const dividendRollingAverage = averageOfThreeYearRollingAverages(data.annual.map(row => row.dividendPerShare))
  const fcfPerShareRollingAverage = averageOfThreeYearRollingAverages(data.annual.map(row =>
    row.freeCashFlow === null || row.sharesCr === null || row.sharesCr <= 0 ? null : row.freeCashFlow / row.sharesCr,
  ))
  const currentEquity = latest(data.annual, 'equity')
  const pe = data.currentMarketCap !== null && ttmNetProfit !== null && ttmNetProfit > 0 ? data.currentMarketCap / ttmNetProfit : null
  const pb = data.currentMarketCap !== null && currentEquity !== null && currentEquity !== undefined && currentEquity > 0 ? data.currentMarketCap / currentEquity : null
  const horizons = [
    { label: 'TTM', value: (key: GrowthMetric) => key === 'equity' ? null : ttmCagr(data.quarterly, key) },
    { label: '1 year', value: (key: GrowthMetric) => annualCagr(data.annual, key, 1) },
    { label: '3 years', value: (key: GrowthMetric) => annualCagr(data.annual, key, 3) },
    { label: '5 years', value: (key: GrowthMetric) => annualCagr(data.annual, key, 5) },
    { label: '7 years', value: (key: GrowthMetric) => annualCagr(data.annual, key, 7) },
    { label: '9 years', value: (key: GrowthMetric) => annualCagr(data.annual, key, 9) },
  ]
  const averagePeriods = [
    { label: 'Last year', years: 1 },
    { label: '3-year average', years: 3 },
    { label: '5-year average', years: 5 },
    { label: '7-year average', years: 7 },
    { label: '9-year average', years: 9 },
  ]
  const returnMetrics = [
    { label: 'ROA', metric: 'roa' as const },
    { label: 'ROE', metric: 'roe' as const },
    { label: 'Dividend payout', metric: 'dividendPayout' as const },
  ]
  return <>
    {section === 'overview' && <>
      <div className="bank-overview">
        <div className="bank-overview-heading"><div><div className="hero-kicker">BANK FINANCIAL SNAPSHOT</div><h2>At a glance</h2><p>Values are drawn from the uploaded Data Sheet; missing fields are left unavailable.</p></div><span className="bank-asof">LATEST DATA · {newest?.period ?? '—'}</span></div>
        <section className="bank-snapshot-grid" aria-label="Current bank figures">
          <SnapshotCard label="Current market cap" value={rupeesCr(data.currentMarketCap)} accent="mint"/>
          <SnapshotCard label="Total asset" value={rupeesCr(latest(data.annual, 'totalAssets'))} accent="violet"/>
          <SnapshotCard label="Current equity" value={rupeesCr(currentEquity)} accent="blue"/>
          <SnapshotCard label="Current sales" value={rupeesCr(latest(data.annual, 'interestEarned'))} accent="gold"/>
          <SnapshotCard label="P / E" value={pe === null ? '—' : `${pe.toFixed(2)}×`} accent="pink"/>
          <SnapshotCard label="P / B" value={pb === null ? '—' : `${pb.toFixed(2)}×`} accent="teal"/>
        </section>
        <PerShareRollingSummary eps={epsRollingAverage} dividendPerShare={dividendRollingAverage} freeCashFlowPerShare={fcfPerShareRollingAverage} note="EPS includes the latest TTM value when four quarters and share data are available. Dividend per Share and FCF per Share use annual data because quarterly dividend and cash-flow inputs are unavailable."/>
        <section className="bank-summary-block">
          <div className="bank-block-title"><div><span className="bank-section-kicker">RETURN PROFILE</span><h3>Average returns & payout</h3></div><span>ROA, ROE & dividend payout · %</span></div>
          <div className="bank-growth-scroll"><table className="bank-growth-table"><thead><tr><th>Metric</th>{averagePeriods.map(period => <th key={period.label}>{period.label}</th>)}</tr></thead><tbody>
            {returnMetrics.map(({ label, metric }) => <tr key={metric}><th>{label}</th>{averagePeriods.map(period => <td key={period.label}>{percent(average(data.annual, metric, period.years).value)}</td>)}</tr>)}
          </tbody></table></div>
          <div className="bank-growth-note">Averages use valid annual values. Dividend payout skips years with missing or unusable payout inputs; zero dividend counts as zero payout.</div>
        </section>
        <section className="bank-summary-block">
          <div className="bank-block-title"><div><span className="bank-section-kicker">COMPOUND GROWTH</span><h3>Growth by period</h3></div><span>CAGR · %</span></div>
          <div className="bank-growth-scroll"><table className="bank-growth-table"><thead><tr><th>Metric</th>{horizons.map(item => <th key={item.label}>{item.label}</th>)}</tr></thead><tbody>
            {([['Total income','totalRevenue'],['Interest earned','interestEarned'],['Interest paid','interestPaid'],['Other income','otherIncome'],['Net profit','netProfit'],['Equity','equity']] as const).map(([label,key]) => <tr key={key}><th>{label}</th>{horizons.map(item => <td key={item.label}>{percent(item.value(key))}</td>)}</tr>)}
          </tbody></table></div>
          <div className="bank-growth-note">TTM compares the latest four quarters with the preceding four; equity TTM is unavailable because quarterly equity is not in the workbook. Annual growth needs one more annual observation than the selected period.</div>
        </section>
        <div className="bank-overview-note"><Landmark size={16}/><span>Growth and return averages use available valid periods in the uploaded Data Sheet.</span></div>
      </div>
    </>}
    {section === 'yearly' && <>
      <div className="bank-plots-page">
        <div className="bank-plots-heading"><div><div className="hero-kicker">BANK PLOTBOOK</div><h2>Financial charts</h2></div><span>ANNUAL + QUARTERLY · ₹ CRORE UNLESS STATED</span></div>
        <div className="bank-chart-section"><div className="bank-chart-section-title"><span>01</span><h3>Annual plots</h3><i>{specs.annual.length} charts</i></div><div className="chart-grid">{specs.annual.map(spec => <ChartPanel key={spec.id} spec={spec} theme="dark"/>)}</div></div>
        <div className="bank-chart-section"><div className="bank-chart-section-title"><span>02</span><h3>Quarterly plots</h3><i>{specs.quarterly.length} charts</i></div><div className="chart-grid">{specs.quarterly.map(spec => <ChartPanel key={spec.id} spec={spec} theme="dark"/>)}</div></div>
      </div>
    </>}
    {section === 'tables' && <BankSourceSheet data={data}/>}
    {section === 'checks' && <>
      <Intro kicker="SOURCE COVERAGE & FORMULAS" title="Bank data checks" description="Calculations use the uploaded fields only; missing bank disclosures are not estimated." count={data.warnings.length ? `${data.warnings.length} data notes` : 'READY'}/>
      <div className="checks-grid"><div className="checks-card"><h3><ShieldCheck size={18}/> Source and coverage</h3><CheckRow label="Company" value={data.companyName}/><CheckRow label="Annual periods" value={`${data.annual[0]?.period ?? '—'} to ${data.annual.at(-1)?.period ?? '—'}`}/><CheckRow label="Quarterly periods" value={`${data.quarterly.length} quarters`}/><CheckRow label="Face value" value={data.faceValue === null ? 'Not provided' : `₹${data.faceValue}`}/><CheckRow label="Workbook" value={data.sourceFileName}/></div>
        <div className="checks-card definitions-card"><h3><CircleHelp size={18}/> Bank-mode calculations</h3><ul>
          <li><b>Annual and quarterly interest earned</b> = source Sales; <b>interest paid</b> = source Interest.</li>
          <li><b>Total revenue</b> = interest earned + Other Income.</li>
          <li><b>Interest gap %</b> = 100 × (interest earned − interest paid) ÷ interest earned. <b>Other income / interest earned</b> = 100 × other income ÷ interest earned.</li>
          <li><b>Annual total expense</b> = available itemized expense rows + Other Expenses + Interest when all components exist; otherwise total revenue − reported PBT. The fallback is flagged in data notes.</li>
          <li><b>Quarterly total expense</b> = Expenses + Interest. <b>OPM</b> = 100 × (total revenue − total expense) ÷ total revenue. <b>NPM</b> = 100 × net profit ÷ total revenue.</li>
          <li><b>Equity</b> = share capital + reserves. <b>Borrowings / equity</b> is plotted as requested; interpret as a user-defined bank funding ratio.</li>
          <li><b>EPS / dividend per share</b> = ₹ crore ÷ adjusted equity shares in crore. Zero dividend gives zero per-share dividend and payout; blank remains missing.</li>
          <li><b>ROE / ROA</b> = net profit ÷ average equity / average total assets. First year is blank without prior-year balances.</li>
          <li><b>Liquidity</b> = 100 × Cash &amp; Bank ÷ (Borrowings + Other Liabilities).</li>
        </ul></div></div>
      <div className="checks-card warnings-card"><h3><AlertTriangle size={18}/> Workbook notes & unavailable fields</h3><ul>{[...data.warnings, ...data.missingMetrics].map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>
    </>}
    <div className="chart-export-stage bank-chart-export-stage" aria-hidden="true">{[...specs.annual, ...specs.quarterly].map(spec => <ChartPanel key={`export-${spec.id}`} spec={spec} theme="dark" exportMode/>)}</div>
  </>
}

function Intro({ kicker, title, description, count }: { kicker: string; title: string; description: string; count: string }) {
  return <div className="section-intro"><div><div className="hero-kicker">{kicker}</div><h2>{title}</h2><p>{description}</p></div><span className="period-chip">{count}</span></div>
}
function SnapshotCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <article className={`bank-snapshot-card accent-${accent}`}><span>{label}</span><strong>{value}</strong></article>
}
function CheckRow({ label, value }: { label: string; value: string }) {
  return <div className="check-row"><span>{label}</span><b>{value}</b></div>
}
function BankSourceSheet({ data }: { data: BankData }) {
  const sections = ['company name', 'profit & loss', 'quarters', 'balance sheet', 'cash flow', 'price', 'derived']
  return <section className="bank-source-page">
    <div className="bank-source-heading"><div><div className="hero-kicker">ORIGINAL WORKBOOK VIEW</div><h2>Data Sheet</h2><p>{data.sourceFileName} · original row and column order</p></div><span>{data.sourceMatrix.length} ROWS</span></div>
    <div className="bank-sheet-frame"><div className="bank-sheet-topline"><span className="sheet-dot"/><span className="sheet-dot"/><span className="sheet-dot"/><strong>DATA SHEET</strong><small>Source values · blanks preserved</small></div>
      <div className="bank-raw-scroll"><table className="bank-source-table"><tbody>{data.sourceMatrix.map((row, i) => {
        const cells = row ?? []
        const label = String(cells[0] ?? '').trim().toLowerCase().replace(/:$/, '')
        const sectionRow = sections.includes(label)
        const dateRow = label === 'report date'
        const cleanText = (value: unknown) => String(value ?? '').replace(/PLEASE\s+DO\s+NOT\s+MAKE\s+ANY\s+CHANGES\s+TO\s+THIS\s+SHEET/gi, '').trim()
        return <tr key={i} className={sectionRow ? 'raw-section-row' : dateRow ? 'raw-date-row' : ''}>{cells.map((cell, j) => <td key={j} className={j === 0 ? 'raw-label' : ''}>{cell instanceof Date ? cell.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : typeof cell === 'number' ? amount(cell, 2) : cleanText(cell)}</td>)}</tr>
      })}</tbody></table></div></div>
  </section>
}
