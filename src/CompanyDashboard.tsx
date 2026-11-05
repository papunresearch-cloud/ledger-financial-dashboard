import { Activity } from 'lucide-react'
import { ChartPanel, type ChartSpec } from './Charts'
import { PerShareRollingSummary } from './PerShareRollingSummary'
import { averageOfThreeYearRollingAverages } from './rollingPerShare'
import { getRelativeColor, formatFiscalYearHeader } from './colorUtils'
import type { AnnualRow, CompanyData, QuarterRow } from './types'

type Section = 'overview' | 'yearly' | 'quarterly' | 'tables' | 'checks'
type CompanySpecs = { annual: ChartSpec[]; margins: ChartSpec[]; quarterly: ChartSpec[]; special: ChartSpec[] }
const fmt = (value: number | null | undefined, decimals = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(value)
const fmtTwoDecimals = (value: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const fmt2Dec = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const percent = (value: number | null) => value === null || !Number.isFinite(value) || Math.abs(value) > 1000 ? '—' : `${value.toFixed(1)}%`
const percent2Dec = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) > 1000 ? '—' : `${fmt2Dec(value)}%`
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
  const average = sumY / points.length
  const totalSquares = ys.reduce((sum, y) => sum + (y - average) ** 2, 0)
  const residualSquares = ys.reduce((sum, y, i) => sum + (y - predictX(xs[i])) ** 2, 0)
  const rSquared = totalSquares === 0 ? (residualSquares < 1e-9 ? 1 : 0) : 1 - residualSquares / totalSquares
  return { rSquared, predictAt: year => predictX(year - origin) }
}

function curveBasedCagrAverage(metric: string, points: Array<{ year: number; value: number }>, ttmGrowth: number | null): { value: number | null; basis: string; rSquared: number | null } {
  const latest = points.at(-1)
  const curve = quadraticCurveFit(points)
  if (points.length >= 6 && curve && curve.rSquared > 0.8 && latest) {
    const start = curve.predictAt(latest.year - 3)
    const end = curve.predictAt(latest.year)
    if (start > 0 && end > 0) return { value: cagr(start, end, 3), basis: `${metric}: fitted 3Y CAGR, R² ${(curve.rSquared * 100).toFixed(1)}%`, rSquared: curve.rSquared }
  }
  const prior3 = latest ? points.find(point => point.year === latest.year - 3) : undefined
  const actualThreeYear = prior3 && latest ? cagr(prior3.value, latest.value, 3) : null
  if (actualThreeYear !== null) {
    const reason = points.length < 6 ? 'under 6 annual values' : `R² ${(curve ? curve.rSquared * 100 : 0).toFixed(1)}% or fitted endpoints unusable`
    return { value: actualThreeYear, basis: `${metric}: actual 3Y CAGR fallback (${reason})`, rSquared: curve?.rSquared ?? null }
  }
  if (ttmGrowth !== null) return { value: ttmGrowth, basis: `${metric}: TTM growth fallback`, rSquared: curve?.rSquared ?? null }
  const priorYear = points.at(-2)
  const lastYear = priorYear && latest ? cagr(priorYear.value, latest.value, latest.year - priorYear.year) : null
  if (lastYear !== null) return { value: lastYear, basis: `${metric}: 1Y growth fallback`, rSquared: curve?.rSquared ?? null }
  return { value: null, basis: `${metric}: unavailable`, rSquared: curve?.rSquared ?? null }
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
  const historyPeriods = Array.from({ length: Math.min(9, data.annual.length) }, (_, i) => ({ label: formatFiscalYearHeader(data.annual[data.annual.length - 1 - i]?.period, i === 0 ? 'LY' : `${i + 1}Y`), offset: i }))
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
  const dupontHistory = [
    {
      title: 'ROE',
      getValue: (row: AnnualRow) => row.roe,
      format: percent2Dec,
    },
    {
      title: 'NPM',
      getValue: (row: AnnualRow) => {
        if (row.sales !== null && row.sales > 0 && row.netProfit !== null) {
          return 100 * row.netProfit / row.sales
        }
        return row.netProfitMargin
      },
      format: percent2Dec,
    },
    {
      title: 'ATO',
      getValue: (row: AnnualRow, priorRow?: AnnualRow | null) => {
        if (row.sales === null) return null
        const avgAssets = priorRow && priorRow.totalAssets !== null && row.totalAssets !== null
          ? (priorRow.totalAssets + row.totalAssets) / 2
          : null
        return avgAssets !== null && avgAssets > 0 ? row.sales / avgAssets : null
      },
      format: fmt2Dec,
    },
    {
      title: 'EM',
      getValue: (row: AnnualRow, priorRow?: AnnualRow | null) => {
        if (!priorRow || priorRow.totalAssets === null || row.totalAssets === null || priorRow.equity === null || row.equity === null) {
          return null
        }
        const avgAssets = (priorRow.totalAssets + row.totalAssets) / 2
        const avgEquity = (priorRow.equity + row.equity) / 2
        return avgEquity > 0 && avgAssets > 0 ? avgAssets / avgEquity : null
      },
      format: fmt2Dec,
    },
  ].map(metric => {
    const values = historyPeriods.map(period => {
      const index = data.annual.length - 1 - period.offset
      const row = data.annual[index]
      const priorRow = index > 0 ? data.annual[index - 1] : null
      return metric.getValue(row, priorRow)
    })
    return { title: metric.title, values, average: middleAverage(values), format: metric.format }
  })
  const ttmOtherIncome = (offset = 0) => {
    const income = ttmSum(data.quarterly, 'totalIncome', offset)
    const sales = ttmSum(data.quarterly, 'sales', offset)
    return income === null || sales === null ? null : income - sales
  }
  const metricPoints = (getValue: (row: AnnualRow) => number | null) => data.annual.map(row => ({ year: Number(row.period.match(/\d{4}/)?.[0]), value: getValue(row) }))
    .filter((point): point is { year: number; value: number } => Number.isFinite(point.year) && point.value !== null && Number.isFinite(point.value))
    .sort((a, b) => a.year - b.year)
  const cagrAverageByMetric: Record<string, ReturnType<typeof curveBasedCagrAverage>> = {
    Sales: curveBasedCagrAverage('Sales', metricPoints(row => row.sales), cagr(ttmSum(data.quarterly, 'sales', 4), ttmSales, 1)),
    'Other Income': curveBasedCagrAverage('Other Income', metricPoints(row => row.totalIncome !== null && row.sales !== null ? row.totalIncome - row.sales : null), cagr(ttmOtherIncome(4), ttmOtherIncome(), 1)),
    'Net Profit': curveBasedCagrAverage('Net Profit', metricPoints(row => row.netProfit), cagr(ttmSum(data.quarterly, 'netProfit', 4), ttmProfit, 1)),
    'Book Value': curveBasedCagrAverage('Book Value', metricPoints(row => row.equity), null),
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
  ].map(row => ({ ...row, average: cagrAverageByMetric[row.title].value }))
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
      <AnnualHistoryTable title="Year-by-year returns" rows={returnHistory} periods={historyPeriods.map(period => period.label)} note="AVG => sorts annual values from highest to lowest and then averages of the centered values"/>
      <AnnualHistoryTable title="Decomposition of ROE" rows={dupontHistory} periods={historyPeriods.map(period => period.label)} unit="2 Decimals" note="ROE = Net Profit Margin (NPM) * Asset turn Over (ATO) * Equity Multiplier (EM) | Equity Multiplier (EM)  = Total asset / Total equity"/>
      <AnnualHistoryTable title="Year-by-year cash quality" rows={cashHistory} periods={historyPeriods.map(period => period.label)} note="CFO = Cash from Operating Activity · FCF = CFO − Capital Work in Progress. AVG uses the centered-value averaging rule shown above. CFO/Net profit and FCF/Net profit are blank when net profit is not positive."/>
      <section className="company-summary-block"><div className="company-block-heading"><div><span>COMPOUND GROWTH</span><h3>CAGR by duration</h3></div><small>CAGR · %</small></div><div className="company-table-scroll"><table className="company-growth-table"><thead><tr><th>Metric</th><th>TTM</th>{cagrPeriods.map(years => <th key={years}>{years}Y</th>)}<th>AVG</th></tr></thead><tbody>{cagrRows.map(row=><tr key={row.title}><th>{row.title}</th><td style={{ color: getRelativeColor(row.ttm, row.average) }}>{percent(row.ttm)}</td>{row.annual.map((value,index)=><td key={index} style={{ color: getRelativeColor(value, row.average) }}>{percent(value)}</td>)}<td>{percent(row.average)}</td></tr>)}</tbody></table></div><p className="company-summary-note">TTM CAGR compares the latest four quarters with the previous four. Annual 1Y–9Y columns compare actual period endpoints. AVG uses a separate quadratic fit for each metric: when at least 6 annual values are available and R² is greater than 80%, it uses the fitted three-year CAGR from the latest four curve values; otherwise it falls back to actual 3Y CAGR, TTM growth when available, then 1Y growth. {Object.values(cagrAverageByMetric).map(result => result.basis).join(' · ')}. Other Income = total income − sales; Book Value = equity share capital + reserves. Non-positive endpoints are not valid for CAGR and remain blank.</p></section>
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
function AnnualHistoryTable({
  title,
  note,
  periods,
  rows,
  unit = 'Percent',
}: {
  title: string
  note: string
  periods: string[]
  rows: Array<{
    title: string
    values: Array<number | null>
    average: number | null
    format?: (value: number | null | undefined) => string
  }>
  unit?: string
}) {
  return (
    <section className="company-summary-block">
      <div className="company-block-heading">
        <div><span>ANNUAL DETAIL</span><h3>{title}</h3></div>
        <small>{unit}</small>
      </div>
      <div className="company-table-scroll">
        <table className="company-growth-table">
          <thead>
            <tr>
              <th>Ratio</th>
              {periods.map(label => <th key={label}>{label}</th>)}
              <th>AVG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const formatCell = row.format ?? percent
              return (
                <tr key={row.title}>
                  <th>{row.title}</th>
                  {row.values.map((value, index) => <td key={index} style={{ color: getRelativeColor(value, row.average) }}>{formatCell(value)}</td>)}
                  <td>{formatCell(row.average)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="company-summary-note">{note}</p>
    </section>
  )
}
