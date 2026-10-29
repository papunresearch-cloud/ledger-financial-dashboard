import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { AnnualRow, BankAnnualRow, BankQuarterRow, QuarterRow } from './types'

type Metric = { key: string; label: string; color: string; kind?: 'line'; axis?: 'right'; unit?: 'percent' | 'ratio' | 'rupee' }
export type ChartSpec = { id: string; title: string; subtitle: string; data: Array<Record<string, unknown>>; metrics: Metric[]; type?: 'line' | 'bar' | 'combo'; category: 'annual' | 'quarterly'; yAxisMax?: number }

const fmt = (value: number, unit?: Metric['unit']) => {
  if (!Number.isFinite(value)) return '—'
  if (unit === 'percent') return `${value.toFixed(1)}%`
  if (unit === 'ratio') return `${value.toFixed(2)}×`
  if (unit === 'rupee') return `₹${value.toFixed(2)}`
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value)
}

export function ChartPanel({ spec, exportMode = false, theme = 'light' }: { spec: ChartSpec; exportMode?: boolean; theme?: 'light' | 'dark' }) {
  const hasData = spec.data.some(point => spec.metrics.some(metric => typeof point[metric.key] === 'number' && Number.isFinite(point[metric.key] as number)))
  const allLine = spec.type === 'line'
  const tickColor = theme === 'dark' ? '#a6c2b8' : '#74837d'
  const gridColor = theme === 'dark' ? '#28453e' : '#e6ece8'
  const axisMetric = spec.metrics.find(metric => metric.kind !== 'line') ?? spec.metrics[0]
  const rightMetric = spec.metrics.find(metric => metric.axis === 'right')
  const tickFormatter = (value: number, metric?: Metric) => metric?.unit
    ? fmt(Number(value), metric.unit)
    : new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))
  return <article className={`chart-card ${theme === 'dark' ? 'chart-card-dark' : ''}`} data-chart-card={spec.id} data-export-chart-card={exportMode ? spec.id : undefined}>
    <div className="chart-heading">
      <div><span className="eyebrow">{spec.category === 'annual' ? 'YEARLY' : 'QUARTERLY'}</span><h3>{spec.title}</h3><p>{spec.subtitle}</p></div>
      <span className="chart-spark" aria-hidden="true">✳</span>
    </div>
    <div className="chart-snapshot">
      {hasData ? <ResponsiveContainer width="100%" height={286}>
        {allLine ? <LineChart data={spec.data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" domain={spec.yAxisMax ? ['auto', spec.yAxisMax] : undefined} allowDataOverflow={Boolean(spec.yAxisMax)} tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => tickFormatter(v, spec.metrics[0])} />
          <Tooltip formatter={(v, name) => [fmt(Number(v), spec.metrics.find(m => m.label === name)?.unit), name]} contentStyle={{ borderRadius: 12, border: `1px solid ${theme === 'dark' ? '#365b50' : '#dbe6df'}`, background: theme === 'dark' ? '#10211e' : '#fff', color: theme === 'dark' ? '#e7f2ed' : '#18362f', boxShadow: '0 8px 24px #0004' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: theme === 'dark' ? '#c5ddd3' : '#52655d', paddingTop: 6 }} />
          {spec.metrics.map(metric => <Line key={metric.key} yAxisId="left" type="monotone" dataKey={metric.key as string} name={metric.label} stroke={metric.color} strokeWidth={2.8} dot={{ r: 3.4, fill: metric.color, stroke: '#fff', strokeWidth: 1.4 }} activeDot={{ r: 5 }} connectNulls={false} />)}
        </LineChart> : <ComposedChart data={spec.data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" domain={spec.yAxisMax ? ['auto', spec.yAxisMax] : undefined} allowDataOverflow={Boolean(spec.yAxisMax)} tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => tickFormatter(v, axisMetric)} />
          {rightMetric && <YAxis yAxisId="right" orientation="right" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => tickFormatter(v, rightMetric)} />}
          <Tooltip formatter={(v, name) => [fmt(Number(v), spec.metrics.find(m => m.label === name)?.unit), name]} contentStyle={{ borderRadius: 12, border: `1px solid ${theme === 'dark' ? '#365b50' : '#dbe6df'}`, background: theme === 'dark' ? '#10211e' : '#fff', color: theme === 'dark' ? '#e7f2ed' : '#18362f', boxShadow: '0 8px 24px #0004' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: theme === 'dark' ? '#c5ddd3' : '#52655d', paddingTop: 6 }} />
          {spec.metrics.map(metric => metric.kind === 'line'
            ? <Line key={metric.key} yAxisId={metric.axis === 'right' ? 'right' : 'left'} type="monotone" dataKey={metric.key as string} name={metric.label} stroke={metric.color} strokeWidth={2.8} dot={{ r: 3.4, fill: metric.color, stroke: '#fff', strokeWidth: 1.4 }} activeDot={{ r: 5 }} connectNulls={false} />
            : <Bar key={metric.key} yAxisId="left" dataKey={metric.key as string} name={metric.label} fill={metric.color} radius={[5, 5, 0, 0]} maxBarSize={36} />)}
        </ComposedChart>}
      </ResponsiveContainer> : <div className="chart-empty"><span>◌</span><strong>Not enough data to plot</strong><small>Check the data-quality notes below.</small></div>}
    </div>
  </article>
}

const annualSpec = <T extends { period: string },>(rows: T[], id: string, title: string, subtitle: string, metrics: Metric[], type: ChartSpec['type'] = 'bar'): ChartSpec => ({
  id, title, subtitle, metrics, type, category: 'annual', data: rows.map(row => ({ ...row, period: row.period.replace(/FY(?:20)?(\d{2})/g, 'FY$1') })),
})
const quarterSpec = <T extends { period: string },>(rows: T[], id: string, title: string, subtitle: string, metrics: Metric[], type: ChartSpec['type'] = 'bar'): ChartSpec => ({
  id, title, subtitle, metrics, type, category: 'quarterly', data: rows.map(row => ({ ...row, period: row.period.replace(/FY(?:20)?(\d{2})/g, 'FY$1') })),
})

export function makeChartSpecs(annual: AnnualRow[], quarterly: QuarterRow[]): { annual: ChartSpec[]; margins: ChartSpec[]; quarterly: ChartSpec[]; special: ChartSpec[] } {
  const A = (key: keyof AnnualRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const Q = (key: keyof QuarterRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const annualWithRoaOverlay = annual.map(row => ({ ...row, roaOverlay: row.roa }))
  const suppressGpm = annual.length > 0 && annual.every(row => row.grossProfitMargin !== null && row.grossProfitMargin > 95)
  const ttmValue = (key: 'sales' | 'netProfit' | 'operatingProfit'): number | null => {
    const slice = quarterly.slice(-4)
    if (slice.length < 4 || slice.some(row => row[key] === null)) return null
    return slice.reduce((sum, row) => sum + (row[key] as number), 0)
  }
  const ttmSales = ttmValue('sales')
  const ttmOperatingProfit = ttmValue('operatingProfit')
  const ttmNetProfit = ttmValue('netProfit')
  const ttmOperatingMargin = ttmSales === null || ttmSales === 0 || ttmOperatingProfit === null ? null : 100 * ttmOperatingProfit / ttmSales
  const ttmNetMargin = ttmSales === null || ttmSales === 0 || ttmNetProfit === null ? null : 100 * ttmNetProfit / ttmSales
  const annualTtm: AnnualRow[] = [...annual, {
    ...(annual.at(-1) ?? {} as AnnualRow), period: 'TTM', sales: ttmSales, netProfit: ttmNetProfit,
    operatingProfit: ttmOperatingProfit, operatingProfitMargin: ttmOperatingMargin, netProfitMargin: ttmNetMargin,
    grossProfitMargin: null,
  }]
  const ratio = (numerator: number | null, denominator: number | null, percent = false): number | null =>
    numerator === null || denominator === null || denominator <= 0 ? null : (percent ? 100 : 1) * numerator / denominator
  const specialAnnual = annual.map(row => ({
    ...row,
    salesToNetBlock: ratio(row.sales, row.netBlock),
    liabilitiesToTotalAssets: ratio(row.otherLiabilities, row.totalAssets, true),
    currentAssetsToTotalAssetsSpecial: ratio(row.otherAssets, row.totalAssets, true),
    receivablesToCurrentAssets: ratio(row.receivables, row.otherAssets, true),
    inventoryToCurrentAssets: ratio(row.inventory, row.otherAssets, true),
    cashToCurrentAssets: ratio(row.cashBank, row.otherAssets, true),
  }))
  const growth = (current: number | null, previous: number | null): number | null =>
    current === null || previous === null || previous <= 0 ? null : 100 * (current - previous) / previous
  const specialGrowthAnnual = specialAnnual.map((row, index) => {
    const previous = specialAnnual[index - 1]
    return {
      ...row,
      salesGrowth: previous ? growth(row.sales, previous.sales) : null,
      operatingProfitGrowth: previous ? growth(row.operatingProfit, previous.operatingProfit) : null,
      netProfitGrowth: previous ? growth(row.netProfit, previous.netProfit) : null,
    }
  })
  const marginLines = [
    ...(!suppressGpm ? [A('grossProfitMargin', 'GPM', '#FF72B6', 'line', 'right', 'percent')] : []),
    A('operatingProfitMargin', 'OPM', '#A78BFA', 'line', 'right', 'percent'),
    A('netProfitMargin', 'NPM', '#F97373', 'line', 'right', 'percent'),
  ]
  const marginOnlyLines = [
    ...(!suppressGpm ? [A('grossProfitMargin', 'GPM', '#FFC857', 'line', undefined, 'percent')] : []),
    A('operatingProfitMargin', 'OPM', '#22D3B5', 'line', undefined, 'percent'),
    A('netProfitMargin', 'NPM', '#A78BFA', 'line', undefined, 'percent'),
  ]
  const yearOnYearGrowthSpec = annualSpec(specialGrowthAnnual, 'special-yoy-growth', 'Year-on-year growth', 'Change from previous year · %', [
    { key: 'salesGrowth', label: 'Sales growth', color: '#22D3B5', unit: 'percent' },
    { key: 'operatingProfitGrowth', label: 'Operating profit growth', color: '#FFC857', unit: 'percent' },
    { key: 'netProfitGrowth', label: 'Net profit growth', color: '#FF72B6', unit: 'percent' },
  ])
  yearOnYearGrowthSpec.yAxisMax = 100
  return {
    annual: [
      annualSpec(annualTtm, 'annual-sales', 'Sales', 'Annual and TTM sales · ₹ crore', [A('sales', 'Sales', '#38D9B4')]),
      quarterSpec(quarterly, 'quarter-sales', 'Quarterly sales', 'Quarterly revenue · ₹ crore', [Q('sales', 'Sales', '#168b72')]),
      annualSpec(annualTtm, 'annual-profit', 'Net profit', 'Annual and TTM net profit · ₹ crore', [A('netProfit', 'Net profit', '#FFC857')]),
      quarterSpec(quarterly, 'quarter-profit', 'Quarterly net profit', 'Quarterly bottom-line earnings · ₹ crore', [Q('netProfit', 'Net profit', '#d7a743')]),
      annualSpec(annualTtm, 'annual-margins', 'Profit margins', 'Annual GPM, OPM and NPM · TTM OPM and NPM · %', marginOnlyLines, 'line'),
      quarterSpec(quarterly, 'quarter-margins', 'Quarterly operating & net margins', 'OPM and NPM · %', [Q('operatingProfitMargin', 'OPM', '#168b72', 'line', undefined, 'percent'), Q('netProfitMargin', 'NPM', '#6478bd', 'line', undefined, 'percent')], 'line'),
      annualSpec(annualTtm, 'annual-sales-operating-net-profit', 'Sales, operating profit & net profit', suppressGpm ? '₹ crore columns · OPM & NPM · % lines' : '₹ crore columns · GPM, OPM & NPM · % lines', [A('sales','Sales','#22D3B5'), A('operatingProfit','Operating profit','#5C9FFF'), A('netProfit','Net profit','#FFC857'), ...marginLines], 'combo'),
      annualSpec(annual, 'annual-dividend', 'Dividend & payout', 'Dividend amount · ₹ crore; payout ratio · %', [A('dividend', 'Dividend amount', '#d7a743'), A('dividendPayout', 'Payout ratio', '#e06961', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annual, 'annual-eps-dividend', 'EPS, dividend per share & payout', 'EPS & dividend per share in ₹; payout ratio · %', [A('eps', 'EPS', '#22D3B5', undefined, undefined, 'rupee'), A('dividendPerShare', 'Dividend per share', '#FFC857', undefined, undefined, 'rupee'), A('dividendPayout', 'Payout ratio', '#FF72B6', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annual, 'annual-cash-flow-activities', 'Cash flow activities', 'Operating, investing, financing and net cash flow · ₹ crore', [A('operatingCashFlow', 'Cash from Operating Activity', '#22D3B5'), A('investingCashFlow', 'Cash from Investing Activity', '#5C9FFF'), A('financingCashFlow', 'Cash from Financing Activity', '#FFC857'), A('netCashFlow', 'Net Cash Flow', '#FF72B6')]),
      annualSpec(annual, 'annual-cash-profit', 'Profit & cash generation', 'Operating profit, OCF, FCF & net profit · ₹ crore', [A('operatingProfit', 'Operating profit', '#22D3B5'), A('operatingCashFlow', 'Operating cash flow', '#5C9FFF'), A('freeCashFlow', 'Free cash flow', '#FFC857'), A('netProfit','Net profit','#FF72B6')]),
      annualSpec(annual, 'annual-working-capital', 'Sales, receivables & inventory', 'Sales, receivables & inventory in ₹ crore', [A('sales', 'Sales', '#22D3B5'), A('receivables', 'Receivables', '#FFC857'), A('inventory', 'Inventory', '#5C9FFF')]),
      annualSpec(annual, 'annual-net-block', 'Net block & CWIP / net block', 'Net block · ₹ crore; CWIP / net block · %', [A('netBlock', 'Net block', '#168b72'), A('netBlockToCwip', 'CWIP / net block', '#d68157', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annual, 'annual-cwip', 'Capital work in progress', 'CWIP in ₹ crore', [A('cwip', 'CWIP', '#FF72B6')]),
      annualSpec(annual, 'annual-equity', 'Equity', 'Share capital plus reserves · ₹ crore', [A('equity', 'Equity', '#6478bd')]),
      annualSpec(annual, 'annual-cash-bank', 'Cash & cash-equivalent', 'Cash & bank · ₹ crore; cash / total assets · %', [A('cashBank', 'Cash & bank', '#22D3B5'), A('cashToTotalAssets','Cash & bank / total assets','#FFC857','line','right','percent')], 'combo'),
      annualSpec(annual, 'annual-de', 'Debt to equity', 'Borrowings · ₹ crore; debt to equity · ×', [A('borrowings', 'Borrowings', '#5C9FFF'), A('debtToEquity', 'Debt / equity', '#FF72B6', 'line', 'right', 'ratio')], 'combo'),
      annualSpec(annualWithRoaOverlay, 'annual-returns', 'Return on equity & assets', 'ROE & ROA · %; ROA also shown as a line on a separate scale', [A('roe', 'ROE', '#22D3B5', undefined, undefined, 'percent'), A('roa', 'ROA', '#FFC857', undefined, undefined, 'percent'), { key: 'roaOverlay', label: 'ROA line', color: '#FF72B6', kind: 'line', axis: 'right', unit: 'percent' }], 'combo'),
      annualSpec(annual, 'annual-asset-mix', 'Current assets / total assets', 'Current assets, net block and investments as a share of total assets · %', [A('currentAssetsToTotalAssets', 'Current assets / total assets', '#A78BFA', 'line', undefined, 'percent'), A('netBlockToTotalAssets', 'Net block / total assets', '#22D3B5', 'line', undefined, 'percent'), A('investmentsToTotalAssets', 'Investments / total assets', '#FFC857', 'line', undefined, 'percent')], 'line'),
    ],
    margins: [],
    quarterly: [],
    special: [
      yearOnYearGrowthSpec,
      annualSpec(specialAnnual, 'special-sales-net-block', 'Sales / net block', 'Net block · ₹ crore; annual sales / net block · ×', [
        A('netBlock', 'Net block', '#6B1E35'),
        { key: 'salesToNetBlock', label: 'Sales / net block', color: '#38D9B4', kind: 'line', axis: 'right', unit: 'ratio' },
      ], 'combo'),
      annualSpec(specialAnnual, 'special-current-asset-composition', 'Current asset composition', 'Annual balance-sheet components as a share of current assets or total assets · %', [
        { key: 'liabilitiesToTotalAssets', label: 'Current liabilities / total assets', color: '#FF72B6', kind: 'line', unit: 'percent' },
        { key: 'currentAssetsToTotalAssetsSpecial', label: 'Current assets / total assets', color: '#A78BFA', kind: 'line', unit: 'percent' },
        { key: 'receivablesToCurrentAssets', label: 'Receivables / current assets', color: '#22D3B5', kind: 'line', unit: 'percent' },
        { key: 'inventoryToCurrentAssets', label: 'Inventory / current assets', color: '#FFC857', kind: 'line', unit: 'percent' },
        { key: 'cashToCurrentAssets', label: 'Cash & cash-equivalent / current assets', color: '#5C9FFF', kind: 'line', unit: 'percent' },
      ], 'line'),
    ],
  }
}

export type BankChartSpecs = { annual: ChartSpec[]; quarterly: ChartSpec[] }

export function makeBankChartSpecs(annual: BankAnnualRow[], quarterly: BankQuarterRow[]): BankChartSpecs {
  const A = (key: keyof BankAnnualRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const Q = (key: keyof BankQuarterRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const shortPeriod = (period: string) => period.replace(/FY(?:20)?(\d{2})/g, 'FY$1')
  const annualRows = annual.map(row => ({ ...row, period: shortPeriod(row.period), roaOverlay: row.roa }))
  const quarterRows = quarterly.map(row => ({ ...row, period: shortPeriod(row.period) }))
  return {
    annual: [
      annualSpec(annualRows, 'bank-interest-gap', 'Interest earned & interest paid', '₹ crore · Interest gap % = 100 × (earned − paid) ÷ earned', [A('interestEarned','Interest earned','#22D3B5'), A('interestPaid','Interest paid','#FFC857'), A('interestGap','Interest gap %','#A78BFA','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-interest-other-income', 'Interest earned & other income', '₹ crore · other income / interest earned · %', [A('interestEarned','Interest earned','#22D3B5'), A('otherIncome','Other income','#FFC857'), A('otherIncomeToInterestEarned','Other income / interest earned','#FF72B6','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-revenue-expense-opm', 'Total revenue & total expense', '₹ crore · OPM = (total revenue − total expense) ÷ total revenue · %', [A('totalRevenue','Total revenue','#22D3B5'), A('totalExpense','Total expense','#FFC857'), A('operatingProfitMargin','OPM','#A78BFA','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-profit-npm', 'Net profit & NPM', 'Net profit · ₹ crore; NPM = net profit ÷ total revenue · %', [A('netProfit','Net profit','#22D3B5'), A('netProfitMargin','NPM','#FF72B6','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-dividend', 'Dividend & payout', 'Dividend amount · ₹ crore; payout ratio · %', [A('dividend','Dividend amount','#FFC857'), A('dividendPayout','Dividend payout','#A78BFA','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-eps-dps', 'EPS, dividend per share & payout', 'Per-share values · ₹; payout ratio · %', [A('eps','EPS','#22D3B5',undefined,undefined,'rupee'), A('dividendPerShare','Dividend per share','#FFC857',undefined,undefined,'rupee'), A('dividendPayout','Dividend payout','#FF72B6','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-returns', 'ROE & ROA', 'ROE and ROA columns share one scale; ROA is overlaid as a line on the right scale', [A('roe','ROE','#22D3B5',undefined,undefined,'percent'), A('roa','ROA','#FFC857',undefined,undefined,'percent'), { key: 'roaOverlay', label: 'ROA line', color: '#FF72B6', kind: 'line', axis: 'right', unit: 'percent' }], 'combo'),
      annualSpec(annualRows, 'bank-equity-de', 'Equity & borrowings/equity', 'Equity and borrowings columns · ₹ crore; ratio line · ×', [A('equity','Equity','#22D3B5'), A('borrowings','Borrowings','#FFC857'), A('debtToEquity','Borrowings / equity','#FF72B6','line','right','ratio')], 'combo'),
      annualSpec(annualRows, 'bank-liquidity', 'Cash & liquidity', 'Cash & Bank · ₹ crore; liquidity = cash ÷ (borrowings + other liabilities) · %', [A('cashBank','Cash & Bank','#22D3B5'), A('liquidity','Liquidity','#A78BFA','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-assets', 'Total assets, other assets & borrowings', '₹ crore · source labels retained', [A('totalAssets','Total assets','#22D3B5'), A('otherAssets','Other assets','#FFC857'), A('borrowings','Borrowings','#A78BFA')]),
    ],
    quarterly: [
      quarterSpec(quarterRows, 'bank-quarter-interest-gap', 'Interest earned & interest paid', '₹ crore · Interest gap % = 100 × (earned − paid) ÷ earned', [Q('interestEarned','Interest earned','#22D3B5'), Q('interestPaid','Interest paid','#FFC857'), Q('interestGap','Interest gap %','#A78BFA','line','right','percent')], 'combo'),
      quarterSpec(quarterRows, 'bank-quarter-income', 'Interest earned & other income', '₹ crore · other income / interest earned · %', [Q('interestEarned','Interest earned','#22D3B5'), Q('otherIncome','Other income','#FFC857'), Q('otherIncomeToInterestEarned','Other income / interest earned','#FF72B6','line','right','percent')], 'combo'),
      quarterSpec(quarterRows, 'bank-quarter-revenue-expense', 'Total revenue & total expense', '₹ crore · OPM = (total revenue − total expense) ÷ total revenue · %', [Q('totalRevenue','Total revenue','#22D3B5'), Q('totalExpense','Total expense','#FFC857'), Q('operatingProfitMargin','OPM','#A78BFA','line','right','percent')], 'combo'),
      quarterSpec(quarterRows, 'bank-quarter-profit', 'Net profit & NPM', 'Net profit · ₹ crore; NPM = net profit ÷ total revenue · %', [Q('netProfit','Net profit','#22D3B5'), Q('netProfitMargin','NPM','#FF72B6','line','right','percent')], 'combo'),
    ],
  }
}
