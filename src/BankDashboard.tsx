import { AlertTriangle, CircleHelp, Landmark, ShieldCheck } from 'lucide-react'
import { ChartPanel, type BankChartSpecs } from './Charts'
import { PerShareRollingSummary } from './PerShareRollingSummary'
import { calculateRobustWeightedAverage } from './rollingPerShare'
import { getRelativeColor, formatFiscalYearHeader } from './colorUtils'
import type { BankData, BankAnnualRow, BankQuarterRow } from './types'

type Section = 'overview' | 'yearly' | 'quarterly' | 'tables' | 'checks'
const amount = (value: number | null | undefined, digits = 0) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
const percent = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
const fmt2Dec = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const latest = <K extends keyof BankAnnualRow>(rows: BankAnnualRow[], key: K) => [...rows].reverse().find(row => typeof row[key] === 'number')?.[key] as number | null | undefined

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

function quadraticCurveFit(points: Array<{ year: number; value: number }>): { rSquared: number; predictAt: (year: number) => number } | null {
  if (points.length < 3) return null
  const origin = points[0].year
  const xs = points.map(point => point.year - origin)
  const ys = points.map(point => point.value)
  const sumX = (power: number) => xs.reduce((total, x) => total + x ** power, 0)
  const sumY = ys.reduce((total, y) => total + y, 0)
  const sumXY = xs.reduce((total, x, i) => total + x * ys[i], 0)
  const sumX2Y = xs.reduce((total, x, i) => total + x * x * ys[i], 0)
  const matrix = [[sumX(4), sumX(3), sumX(2), sumX2Y], [sumX(3), sumX(2), sumX(1), sumXY], [sumX(2), sumX(1), points.length, sumY]]
  for (let column = 0; column < 3; column++) {
    let pivot = column
    for (let row = column + 1; row < 3; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    if (Math.abs(matrix[pivot][column]) < 1e-12) return null
    ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
    const divisor = matrix[column][column]
    for (let j = column; j < 4; j++) matrix[column][j] /= divisor
    for (let row = 0; row < 3; row++) {
      if (row === column) continue
      const factor = matrix[row][column]
      for (let j = column; j < 4; j++) matrix[row][j] -= factor * matrix[column][j]
    }
  }
  const [a, b, c] = matrix.map(row => row[3])
  const predictX = (x: number) => a * x * x + b * x + c
  const mean = sumY / points.length
  const totalSquares = ys.reduce((sum, y) => sum + (y - mean) ** 2, 0)
  const residualSquares = ys.reduce((sum, y, i) => sum + (y - predictX(xs[i])) ** 2, 0)
  const rSquared = totalSquares === 0 ? (residualSquares < 1e-9 ? 1 : 0) : 1 - residualSquares / totalSquares
  return { rSquared, predictAt: year => predictX(year - origin) }
}

function curveBasedCagrAverage(metric: string, points: Array<{ year: number; value: number }>, ttmGrowth: number | null) {
  const newest = points.at(-1)
  const curve = quadraticCurveFit(points)
  if (points.length >= 6 && curve && curve.rSquared > 0.8 && newest) {
    const start = curve.predictAt(newest.year - 3)
    const end = curve.predictAt(newest.year)
    if (start > 0 && end > 0) return { value: cagr(start, end, 3), basis: `${metric}: fitted 3Y CAGR, R² ${(curve.rSquared * 100).toFixed(1)}%` }
  }
  const threeYearsAgo = newest ? points.find(point => point.year === newest.year - 3) : undefined
  const actualThreeYear = threeYearsAgo && newest ? cagr(threeYearsAgo.value, newest.value, 3) : null
  if (actualThreeYear !== null) {
    const reason = points.length < 6 ? 'under 6 annual values' : `R² ${(curve ? curve.rSquared * 100 : 0).toFixed(1)}% or fitted endpoints unusable`
    return { value: actualThreeYear, basis: `${metric}: actual 3Y CAGR fallback (${reason})` }
  }
  if (ttmGrowth !== null) return { value: ttmGrowth, basis: `${metric}: TTM growth fallback` }
  const previous = points.at(-2)
  const oneYear = previous && newest ? cagr(previous.value, newest.value, newest.year - previous.year) : null
  if (oneYear !== null) return { value: oneYear, basis: `${metric}: 1Y growth fallback` }
  return { value: null, basis: `${metric}: unavailable` }
}

export function BankDashboard({ data, section, specs }: { data: BankData; section: Section; specs: BankChartSpecs }) {
  const newest = data.annual.at(-1)
  const ttmNetProfit = ttmSum(data.quarterly, 'netProfit', 0)
  const epsAverage = calculateRobustWeightedAverage(data.annual.map(row => row.eps))
  const dividendAverage = calculateRobustWeightedAverage(data.annual.map(row => row.dividendPerShare))
  const fcfPerShareAverage = calculateRobustWeightedAverage(data.annual.map(row =>
    row.freeCashFlow === null || row.sharesCr === null || row.sharesCr <= 0 ? null : row.freeCashFlow / row.sharesCr,
  ))
  const currentEquity = latest(data.annual, 'equity')
  const pe = data.currentMarketCap !== null && ttmNetProfit !== null && ttmNetProfit > 0 ? data.currentMarketCap / ttmNetProfit : null
  const pb = data.currentMarketCap !== null && currentEquity !== null && currentEquity !== undefined && currentEquity > 0 ? data.currentMarketCap / currentEquity : null
  const historyPeriods = Array.from({ length: Math.min(9, data.annual.length) }, (_, i) => ({ label: formatFiscalYearHeader(data.annual[data.annual.length - 1 - i]?.period, i === 0 ? 'LY' : `${i + 1}Y`), offset: i }))
  const returnRows = [
    {
      title: 'ROA',
      values: historyPeriods.map(period => data.annual[data.annual.length - 1 - period.offset]?.roa ?? null),
    },
    {
      title: 'ROE',
      values: historyPeriods.map(period => data.annual[data.annual.length - 1 - period.offset]?.roe ?? null),
    },
    {
      title: 'NPM',
      values: historyPeriods.map(period => {
        const row = data.annual[data.annual.length - 1 - period.offset]
        const sales = ((row as Record<string, unknown>)?.sales ?? row?.interestEarned) as number | null | undefined
        return row && typeof row.netProfit === 'number' && typeof sales === 'number' && sales > 0
          ? (row.netProfit / sales) * 100
          : null
      }),
    },
    {
      title: "NPM'",
      values: historyPeriods.map(period => {
        const row = data.annual[data.annual.length - 1 - period.offset]
        const sales = ((row as Record<string, unknown>)?.sales ?? row?.interestEarned) as number | null | undefined
        const total = typeof row?.totalRevenue === 'number'
          ? row.totalRevenue
          : typeof sales === 'number' && typeof row?.otherIncome === 'number'
            ? sales + row.otherIncome
            : null
        return row && typeof row.netProfit === 'number' && typeof total === 'number' && total > 0
          ? (row.netProfit / total) * 100
          : null
      }),
    },
    {
      title: 'Dividend payout',
      values: historyPeriods.map(period => data.annual[data.annual.length - 1 - period.offset]?.dividendPayout ?? null),
    },
  ]
  const returnHistory = returnRows.map(row => ({
    ...row,
    average: calculateRobustWeightedAverage([...row.values].reverse()),
  }))
  const roeDecompositionRows = [
    {
      title: 'ROE',
      values: historyPeriods.map(period => {
        const index = data.annual.length - 1 - period.offset
        return data.annual[index]?.roe ?? null
      }),
      format: percent,
    },
    {
      title: 'NPM',
      values: historyPeriods.map(period => {
        const index = data.annual.length - 1 - period.offset
        const row = data.annual[index]
        const sales = ((row as Record<string, unknown>)?.sales ?? row?.interestEarned) as number | null | undefined
        const total = typeof row?.totalRevenue === 'number'
          ? row.totalRevenue
          : typeof sales === 'number' && typeof row?.otherIncome === 'number'
            ? sales + row.otherIncome
            : null
        return row && typeof row.netProfit === 'number' && typeof total === 'number' && total > 0
          ? (row.netProfit / total) * 100
          : null
      }),
      format: percent,
    },
    {
      title: 'AY',
      values: historyPeriods.map(period => {
        const index = data.annual.length - 1 - period.offset
        const row = data.annual[index]
        const priorRow = index > 0 ? data.annual[index - 1] : null
        const sales = ((row as Record<string, unknown>)?.sales ?? row?.interestEarned) as number | null | undefined
        const total = typeof row?.totalRevenue === 'number'
          ? row.totalRevenue
          : typeof sales === 'number' && typeof row?.otherIncome === 'number'
            ? sales + row.otherIncome
            : null
        const avgAssets = priorRow && typeof priorRow.totalAssets === 'number' && typeof row?.totalAssets === 'number'
          ? (priorRow.totalAssets + row.totalAssets) / 2
          : null
        return typeof total === 'number' && typeof avgAssets === 'number' && avgAssets > 0
          ? (total / avgAssets) * 100
          : null
      }),
      format: percent,
    },
    {
      title: 'EM',
      values: historyPeriods.map(period => {
        const index = data.annual.length - 1 - period.offset
        const row = data.annual[index]
        const priorRow = index > 0 ? data.annual[index - 1] : null
        const avgAssets = priorRow && typeof priorRow.totalAssets === 'number' && typeof row?.totalAssets === 'number'
          ? (priorRow.totalAssets + row.totalAssets) / 2
          : null
        const avgEquity = priorRow && typeof priorRow.equity === 'number' && typeof row?.equity === 'number'
          ? (priorRow.equity + row.equity) / 2
          : null
        return avgAssets !== null && avgEquity !== null && avgEquity > 0
          ? avgAssets / avgEquity
          : typeof row?.totalAssets === 'number' && typeof row?.equity === 'number' && row.equity > 0
            ? row.totalAssets / row.equity
            : null
      }),
      format: fmt2Dec,
    },
    {
      title: 'Interest Income Part',
      values: historyPeriods.map(period => {
        const index = data.annual.length - 1 - period.offset
        const row = data.annual[index]
        const interest = ((row as Record<string, unknown>)?.sales ?? row?.interestEarned) as number | null | undefined
        const total = typeof row?.totalRevenue === 'number'
          ? row.totalRevenue
          : typeof interest === 'number' && typeof row?.otherIncome === 'number'
            ? interest + row.otherIncome
            : null
        return typeof interest === 'number' && typeof total === 'number' && total > 0
          ? (interest / total) * 100
          : null
      }),
      format: percent,
    },
  ].map(row => ({
    ...row,
    average: calculateRobustWeightedAverage([...row.values].reverse()),
  }))
  const metricPoints = (key: GrowthMetric) => data.annual.map(row => ({ year: Number(row.period.match(/\d{4}/)?.[0]), value: row[key] }))
    .filter((point): point is { year: number; value: number } => Number.isFinite(point.year) && point.value !== null && Number.isFinite(point.value))
    .sort((a, b) => a.year - b.year)
  const cagrAverages: Record<string, { value: number | null; basis: string }> = {
    'Total income': curveBasedCagrAverage('Total income', metricPoints('totalRevenue'), ttmCagr(data.quarterly, 'totalRevenue')),
    'Interest earned': curveBasedCagrAverage('Interest earned', metricPoints('interestEarned'), ttmCagr(data.quarterly, 'interestEarned')),
    'Interest paid': curveBasedCagrAverage('Interest paid', metricPoints('interestPaid'), ttmCagr(data.quarterly, 'interestPaid')),
    'Other income': curveBasedCagrAverage('Other income', metricPoints('otherIncome'), ttmCagr(data.quarterly, 'otherIncome')),
    'Net profit': curveBasedCagrAverage('Net profit', metricPoints('netProfit'), ttmCagr(data.quarterly, 'netProfit')),
    'Book Value': curveBasedCagrAverage('Book Value', metricPoints('equity'), null),
  }
  const cagrPeriods = Array.from({ length: 9 }, (_, i) => i + 1)
  const cagrRows = [
    { label: 'Total income', key: 'totalRevenue' as const, ttm: ttmCagr(data.quarterly, 'totalRevenue') },
    { label: 'Interest earned', key: 'interestEarned' as const, ttm: ttmCagr(data.quarterly, 'interestEarned') },
    { label: 'Interest paid', key: 'interestPaid' as const, ttm: ttmCagr(data.quarterly, 'interestPaid') },
    { label: 'Other income', key: 'otherIncome' as const, ttm: ttmCagr(data.quarterly, 'otherIncome') },
    { label: 'Net profit', key: 'netProfit' as const, ttm: ttmCagr(data.quarterly, 'netProfit') },
    { label: 'Book Value', key: 'equity' as const, ttm: null },
  ].map(row => ({ ...row, annual: cagrPeriods.map(years => annualCagr(data.annual, row.key, years)), average: cagrAverages[row.label].value }))
  return <>
    {section === 'overview' && <>
      <div className="bank-overview">
        <div className="bank-overview-heading"><div className="overview-heading-title"><div className="hero-kicker">BANK FINANCIAL SNAPSHOT</div><h2>At a glance</h2><p>Values are drawn from the uploaded Data Sheet; missing fields are left unavailable.</p></div><div className="overview-current-price"><span>Current Price</span><strong>{data.currentPrice === null ? '—' : `₹ ${amount(data.currentPrice, 2)}`}</strong><small>LATEST DATA · {newest?.period ?? '—'}</small></div></div>
        <section className="bank-snapshot-grid" aria-label="Current bank figures">
          <SnapshotCard label="Current market cap" value={rupeesCr(data.currentMarketCap)} accent="mint"/>
          <SnapshotCard label="Total asset" value={rupeesCr(latest(data.annual, 'totalAssets'))} accent="violet"/>
          <SnapshotCard label="Current equity" value={rupeesCr(currentEquity)} accent="blue"/>
          <SnapshotCard label="Current sales" value={rupeesCr(latest(data.annual, 'interestEarned'))} accent="gold"/>
          <SnapshotCard label="P / E" value={pe === null ? '—' : `${pe.toFixed(2)}×`} accent="pink"/>
          <SnapshotCard label="P / B" value={pb === null ? '—' : `${pb.toFixed(2)}×`} accent="teal"/>
        </section>
        <PerShareRollingSummary eps={epsAverage} dividendPerShare={dividendAverage} freeCashFlowPerShare={fcfPerShareAverage} note="Average is calculated using annual data with IQR outlier Winsorization and recency weighting (50% spread ratio). Zero and negative values are included. TTM data is excluded."/>
        <section className="bank-summary-block">
          <div className="bank-block-title"><div><span className="bank-section-kicker">ANNUAL DETAIL</span><h3>Year-by-year returns</h3></div><span>ROA, ROE, NPM & dividend payout · %</span></div>
          <div className="bank-growth-scroll"><table className="bank-growth-table"><thead><tr><th>Ratio</th>{historyPeriods.map(period => <th key={period.label}>{period.label}</th>)}<th>AVG</th></tr></thead><tbody>
            {returnHistory.map(row => <tr key={row.title}><th>{row.title}</th>{row.values.map((value, index) => <td key={index} style={{ color: getRelativeColor(value, row.average) }}>{percent(value)}</td>)}<td>{percent(row.average)}</td></tr>)}
          </tbody></table></div>
          <div className="bank-growth-note">AVG =&gt; Recency-weighted average with IQR outlier Winsorization; recent years carry higher weight.</div>
          <div className="bank-growth-note" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>NPM = Net profit / Sales &amp; NPM’ = Net profit / (Sales + Other Income)</div>
        </section>
        <section className="bank-summary-block">
          <div className="bank-block-title"><div><span className="bank-section-kicker">ANNUAL DETAIL</span><h3>ROE decomposition</h3></div><span>1 Decimal (%) · Ratio</span></div>
          <div className="bank-growth-scroll"><table className="bank-growth-table"><thead><tr><th>Ratio</th>{historyPeriods.map(period => <th key={period.label}>{period.label}</th>)}<th>AVG</th></tr></thead><tbody>
            {roeDecompositionRows.map(row => {
              const formatCell = row.format ?? percent
              return (
                <tr key={row.title}>
                  <th>{row.title}</th>
                  {row.values.map((value, index) => <td key={index} style={{ color: getRelativeColor(value, row.average) }}>{formatCell(value)}</td>)}
                  <td>{formatCell(row.average)}</td>
                </tr>
              )
            })}
          </tbody></table></div>
          <div className="bank-growth-note">*** ROE = Net Profit Margin (NPM) * Asset Yield (AY)  * Equity Multiplier (EM) | AVG uses recency weighting with IQR outlier Winsorization</div>
          <div className="bank-growth-note" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Equity Multiplier =&gt; EM</div>
        </section>
        <section className="bank-summary-block">
          <div className="bank-block-title"><div><span className="bank-section-kicker">COMPOUND GROWTH</span><h3>CAGR by duration</h3></div><span>CAGR · %</span></div>
          <div className="bank-growth-scroll"><table className="bank-growth-table"><thead><tr><th>Metric</th><th>TTM</th>{cagrPeriods.map(years => <th key={years}>{years}Y</th>)}<th>AVG</th></tr></thead><tbody>
            {cagrRows.map(row => <tr key={row.label}><th>{row.label}</th><td style={{ color: getRelativeColor(row.ttm, row.average) }}>{percent(row.ttm)}</td>{row.annual.map((value, index) => <td key={index} style={{ color: getRelativeColor(value, row.average) }}>{percent(value)}</td>)}<td>{percent(row.average)}</td></tr>)}
          </tbody></table></div>
          <div className="bank-growth-note">Annual 1Y–9Y columns use actual period endpoints. AVG uses a separate quadratic fit per metric: with 6 or more annual values and R² greater than 80%, it uses the fitted three-year CAGR from the latest four curve values; otherwise it falls back to actual 3Y CAGR, TTM growth when available, then 1Y growth. {Object.values(cagrAverages).map(result => result.basis).join(' · ')}. Book Value = equity share capital + reserves. Non-positive endpoints remain blank.</div>
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
          <li><b>Interest Ratio %</b> = 100 × interest paid ÷ interest earned. <b>Interest income contribution %</b> = 100 × interest earned ÷ total revenue.</li>
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