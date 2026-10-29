import type ExcelJS from 'exceljs'
import type { AnnualRow, BankAnnualRow, BankData, BankQuarterRow, CompanyData, QuarterRow } from './types'

type Table = {
  periods: string[]
  rows: Map<string, Array<number | null>>
  rawRows: Map<string, unknown[]>
}

const cleanLabel = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/:$/, '')

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  if (!text || ['-', '—', 'na', 'n/a'].includes(text.toLowerCase())) return null
  const negative = /^\(.*\)$/.test(text)
  const parsed = Number(text.replace(/[₹,%\s,()]/g, ''))
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : null
}

function dateParts(value: unknown): { year: number; month: number } | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 }
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
  }
  const text = String(value ?? '').trim()
  if (!text) return null
  const yearMatch = text.match(/(?:19|20)\d{2}/)
  if (!yearMatch) return null
  const year = Number(yearMatch[0])
  const numericDate = text.match(/(?:19|20)\d{2}[-/.](\d{1,2})/)
  if (numericDate) return { year, month: Number(numericDate[1]) }
  const month = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i)
  if (month) {
    const m = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month[1].toLowerCase()) + 1
    return { year, month: m }
  }
  return { year, month: 3 }
}

function fiscalYearLabel(value: unknown, quarterly = false): string | null {
  const parts = dateParts(value)
  if (!parts) return null
  if (!quarterly) return `FY${parts.year}`
  const q = parts.month <= 3 ? 4 : parts.month <= 6 ? 1 : parts.month <= 9 ? 2 : 3
  const fy = parts.month <= 3 ? parts.year : parts.year + 1
  return `Q${q} FY${fy}`
}

function boundsFor(matrix: unknown[][], startNames: string[], endNames: string[] = []): [number, number] | null {
  const starts = new Set(startNames.map(cleanLabel))
  const ends = new Set(endNames.map(cleanLabel))
  const start = matrix.findIndex(row => starts.has(cleanLabel(row?.[0])))
  if (start < 0) return null
  let end = matrix.length
  for (let i = start + 1; i < matrix.length; i++) {
    if (ends.has(cleanLabel(matrix[i]?.[0]))) { end = i; break }
  }
  return [start, end]
}

function tableFrom(matrix: unknown[][], bounds: [number, number], quarterly = false): Table {
  const [start, end] = bounds
  let dateRow = -1
  for (let i = start + 1; i < end; i++) {
    if (cleanLabel(matrix[i]?.[0]) === 'report date') { dateRow = i; break }
  }
  if (dateRow < 0) throw new Error(`Could not find a Report Date row near row ${start + 1}.`)
  const dateValues = matrix[dateRow] ?? []
  const periodColumns: Array<{ column: number; period: string }> = []
  for (let column = 1; column < dateValues.length; column++) {
    const period = fiscalYearLabel(dateValues[column], quarterly)
    if (period) periodColumns.push({ column, period })
  }
  if (!periodColumns.length) throw new Error(`No usable period dates found near row ${dateRow + 1}.`)
  const rows = new Map<string, Array<number | null>>()
  const rawRows = new Map<string, unknown[]>()
  for (let i = start + 1; i < end; i++) {
    const label = cleanLabel(matrix[i]?.[0])
    if (!label || label === 'report date') continue
    const raw = matrix[i] ?? []
    rawRows.set(label, raw)
    rows.set(label, periodColumns.map(({ column }) => numberOrNull(raw[column])))
  }
  return { periods: periodColumns.map(x => x.period), rows, rawRows }
}

function get(table: Table, label: string, periodIndex: number, aliases: string[] = []): number | null {
  for (const key of [label, ...aliases].map(cleanLabel)) {
    const values = table.rows.get(key)
    if (values && periodIndex < values.length) return values[periodIndex]
  }
  return null
}

function rowLabelOccurrences(matrix: unknown[][], bounds: [number, number], label: string): number[] {
  const target = cleanLabel(label)
  const found: number[] = []
  for (let i = bounds[0] + 1; i < bounds[1]; i++) if (cleanLabel(matrix[i]?.[0]) === target) found.push(i)
  return found
}

function totalAssetsValue(matrix: unknown[][], bounds: [number, number], periodIndex: number): number | null {
  const totalRows = rowLabelOccurrences(matrix, bounds, 'Total')
  const assetTotalRow = totalRows.at(-1)
  if (assetTotalRow === undefined) return null
  const dates = matrix.find((row, index) => index > bounds[0] && index < bounds[1] && cleanLabel(row?.[0]) === 'report date') ?? []
  const periodColumns: number[] = []
  for (let column = 1; column < dates.length; column++) if (fiscalYearLabel(dates[column])) periodColumns.push(column)
  return numberOrNull(matrix[assetTotalRow]?.[periodColumns[periodIndex]])
}

function safeMargin(sales: number | null, result: number | null): number | null {
  if (sales === null || result === null || sales === 0) return null
  return 100 * result / sales
}

function metaValue(matrix: unknown[][], label: string): number | null {
  const idx = matrix.findIndex(row => cleanLabel(row?.[0]) === cleanLabel(label))
  return idx < 0 ? null : numberOrNull(matrix[idx]?.[1])
}

function plainCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date) return value
  if ('result' in value) return value.result ?? null
  if ('text' in value) return value.text
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  return null
}

export async function parseCompanyWorkbook(file: File): Promise<CompanyData> {
    const { default: ExcelJSRuntime } = await import('exceljs')
    const workbook = new ExcelJSRuntime.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheetName = workbook.worksheets.find(sheet => cleanLabel(sheet.name) === 'data sheet')?.name
    if (!sheetName) throw new Error('This workbook does not contain a worksheet named “Data Sheet”.')
    const sheet = workbook.getWorksheet(sheetName)!
    const matrix: unknown[][] = Array.from({ length: sheet.rowCount }, () => Array<unknown>(sheet.columnCount).fill(null))
    sheet.eachRow({ includeEmpty: true }, row => {
      row.eachCell({ includeEmpty: true }, (cell, column) => { matrix[row.number - 1][column - 1] = plainCellValue(cell.value) })
    })
    const pnlBounds = boundsFor(matrix, ['Profit & Loss', 'PROFIT AND LOSS'], ['Quarters', 'Balance Sheet'])
    const quarterBounds = boundsFor(matrix, ['Quarters'], ['Balance Sheet'])
    const balanceBounds = boundsFor(matrix, ['Balance Sheet'], ['Cash Flow', 'Cash Flow:'])
    const cashBounds = boundsFor(matrix, ['Cash Flow', 'Cash Flow:'], ['Price', 'Derived'])
    if (!pnlBounds || !quarterBounds || !balanceBounds || !cashBounds) {
      throw new Error('The workbook needs the standard Profit & Loss, Quarters, Balance Sheet, and Cash Flow sections on Data Sheet.')
    }
    const pnl = tableFrom(matrix, pnlBounds)
    const quarterly = tableFrom(matrix, quarterBounds, true)
    const balance = tableFrom(matrix, balanceBounds)
    const cash = tableFrom(matrix, cashBounds)
    const shareRow = matrix.find(row => cleanLabel(row?.[0]) === 'adjusted equity shares in cr')
    const missingMetrics: string[] = []
    const warnings: string[] = []
    const annual: AnnualRow[] = pnl.periods.map((period, i) => {
      const sales = get(pnl, 'Sales', i)
      const otherIncome = get(pnl, 'Other Income', i)
      const totalIncome = sales === null || otherIncome === null ? null : sales + otherIncome
      const netProfit = get(pnl, 'Net profit', i, ['Net Profit'])
      const dividend = get(pnl, 'Dividend Amount', i)
      const rawMaterial = get(pnl, 'Raw Material Cost', i)
      const inventoryChange = get(pnl, 'Change in Inventory', i)
      const gpmNumerator = sales === null
        ? null : sales + (inventoryChange ?? 0) - (rawMaterial ?? 0)
      const operatingCosts = [
        get(pnl, 'Raw Material Cost', i), get(pnl, 'Power and Fuel', i),
        get(pnl, 'Other Mfr. Exp', i, ['Other Manufacturing Expenses']),
        get(pnl, 'Employee Cost', i), get(pnl, 'Selling and admin', i), get(pnl, 'Other Expenses', i),
      ].reduce<number>((sum, value) => sum + (value ?? 0), 0)
      const operatingProfit = sales === null
        ? null : sales + (inventoryChange ?? 0) - operatingCosts
      const equityCapital = get(balance, 'Equity Share Capital', i, ['Share Capital'])
      const reserves = get(balance, 'Reserves', i)
      const equity = equityCapital === null || reserves === null ? null : equityCapital + reserves
      const borrowings = get(balance, 'Borrowings', i)
      const totalAssets = totalAssetsValue(matrix, balanceBounds, i)
      const netBlock = get(balance, 'Net Block', i)
      const investments = get(balance, 'Investments', i)
      const otherAssets = get(balance, 'Other Assets', i)
      const currentAssets = get(balance, 'Current Assets', i, ['Current asset'])
      const currentLiabilities = get(balance, 'Current Liabilities', i, ['Current liability'])
      const otherLiabilities = get(balance, 'Other Liabilities', i)
      const inventory = get(balance, 'Inventory', i)
      const cashBank = get(balance, 'Cash & Bank', i, ['Cash and Bank'])
      const interest = get(pnl, 'Interest', i)
      const profitBeforeTax = get(pnl, 'Profit before tax', i, ['Profit Before Tax'])
      const sharesAdjusted = shareRow ? numberOrNull(shareRow[i + 1]) : null
      const sharesRaw = get(balance, 'No. of Equity Shares', i, ['Number of Equity Shares'])
      const sharesCr = sharesAdjusted ?? (sharesRaw === null ? null : sharesRaw / 10_000_000)
      const cashOperating = get(cash, 'Cash from Operating Activity', i)
      const cashInvesting = get(cash, 'Cash from Investing Activity', i, ['Cash from investing activities'])
      const cashFinancing = get(cash, 'Cash from Financing Activity', i, ['Cash from financing activities'])
      const reportedNetCashFlow = get(cash, 'Net Cash Flow', i, ['Net cash flow during the year'])
      const netCashFlow = reportedNetCashFlow ?? (cashOperating !== null && cashInvesting !== null && cashFinancing !== null
        ? cashOperating + cashInvesting + cashFinancing : null)
      const cwip = get(balance, 'Capital Work in Progress', i, ['CWIP'])
      const priorCapital = i > 0 ? get(balance, 'Equity Share Capital', i - 1, ['Share Capital']) : null
      const priorReserves = i > 0 ? get(balance, 'Reserves', i - 1) : null
      const priorEquity = priorCapital === null || priorReserves === null ? null : priorCapital + priorReserves
      const priorBorrowings = i > 0 ? get(balance, 'Borrowings', i - 1) : null
      const capitalEmployed = (equityCapital ?? 0) + (reserves ?? 0) + (borrowings ?? 0)
      const priorCapitalEmployed = i === 0 ? 0 : (priorCapital ?? 0) + (priorReserves ?? 0) + (priorBorrowings ?? 0)
      const ebit = profitBeforeTax === null || interest === null ? null : profitBeforeTax + interest
      const roceEbit = (profitBeforeTax ?? 0) + (interest ?? 0)
      const priorAssets = i > 0 ? totalAssetsValue(matrix, balanceBounds, i - 1) : null
      const roe = i === 0 || equity === null || priorEquity === null || netProfit === null
        ? null : 100 * netProfit / ((priorEquity + equity) / 2)
      const roa = i === 0 || totalAssets === null || priorAssets === null || netProfit === null
        ? null : 100 * netProfit / ((priorAssets + totalAssets) / 2)
      const averageCapitalEmployed = (capitalEmployed + priorCapitalEmployed) / 2
      const roce = averageCapitalEmployed <= 0 ? null : 100 * roceEbit / averageCapitalEmployed
      const interestCoverage = ebit === null || interest === null || interest <= 0 ? null : ebit / interest
      const currentRatio = otherAssets === null || otherLiabilities === null || otherLiabilities <= 0 ? null : otherAssets / otherLiabilities
      const quickRatio = currentAssets === null || inventory === null || currentLiabilities === null || currentLiabilities <= 0 || currentAssets < inventory ? null : (currentAssets - inventory) / currentLiabilities
      const cashRatio = cashBank === null || otherLiabilities === null || otherLiabilities <= 0 ? null : cashBank / otherLiabilities
      const row: AnnualRow = {
        period, sales, totalIncome, netProfit, operatingProfit,
        operatingCashFlow: cashOperating,
        investingCashFlow: cashInvesting,
        financingCashFlow: cashFinancing,
        netCashFlow,
        freeCashFlow: cashOperating === null ? null : cashOperating - (cwip ?? 0),
        dividend,
        dividendPerShare: dividend === 0 ? 0 : dividend === null || dividend < 0 || sharesCr === null || sharesCr <= 0 ? null : dividend / sharesCr,
        dividendPayout: dividend === 0 ? 0 : dividend === null || dividend < 0 || netProfit === null || netProfit <= 0 ? null : 100 * dividend / netProfit,
        eps: netProfit === null || sharesCr === null || sharesCr === 0 ? null : netProfit / sharesCr,
        grossProfitMargin: safeMargin(sales, gpmNumerator),
        operatingProfitMargin: safeMargin(sales, operatingProfit),
        netProfitMargin: safeMargin(sales, netProfit),
        receivables: get(balance, 'Receivables', i), inventory,
        netBlock, cwip,
        netBlockToCwip: cwip === null || cwip === 0 || netBlock === null || netBlock === 0 ? null : 100 * cwip / netBlock,
        equity, borrowings, roce, interestCoverage, currentAssets, currentLiabilities, currentRatio, quickRatio, cashRatio,
        debtToEquity: borrowings === null || equity === null || equity === 0 ? null : borrowings / equity,
        roe, roa, totalAssets, investments, otherAssets, otherLiabilities,
        currentAssetsToTotalAssets: otherAssets === null || totalAssets === null || totalAssets <= 0 ? null : 100 * otherAssets / totalAssets,
        netBlockToTotalAssets: netBlock === null || totalAssets === null || totalAssets <= 0 ? null : 100 * netBlock / totalAssets,
        investmentsToTotalAssets: investments === null || totalAssets === null || totalAssets <= 0 ? null : 100 * investments / totalAssets,
        cashToTotalAssets: cashBank === null || totalAssets === null || totalAssets <= 0 ? null : 100 * cashBank / totalAssets,
        cashBank, sharesCr,
      }
      return row
    })
    const quarterRows: QuarterRow[] = quarterly.periods.map((period, i) => {
      const sales = get(quarterly, 'Sales', i)
      const otherIncome = get(quarterly, 'Other Income', i)
      const totalIncome = sales === null || otherIncome === null ? null : sales + otherIncome
      const netProfit = get(quarterly, 'Net profit', i, ['Net Profit'])
      const operatingProfit = get(quarterly, 'Operating Profit', i)
      return { period, sales, totalIncome, netProfit, operatingProfit,
        operatingProfitMargin: safeMargin(sales, operatingProfit),
        netProfitMargin: safeMargin(sales, netProfit) }
    })
    if (annual.some(row => row.dividend === null)) warnings.push('Some annual dividend cells are blank. They are shown as missing, not assumed to mean zero dividend.')
    if (!shareRow) warnings.push('Adjusted Equity Shares in Cr is missing; EPS and dividend per share use the reported equity-share count divided by 10 million as a fallback.')
    if (annual.some(row => row.freeCashFlow === null)) warnings.push('FCF requires Operating Cash Flow; blank Capital Work in Progress is treated as zero.')
    if (quarterRows.some(row => row.operatingProfitMargin === null)) warnings.push('Quarterly OPM requires reported Operating Profit and Sales for each quarter.')
    if (quarterRows.some(row => row.netProfitMargin === null)) warnings.push('Quarterly NPM requires Net Profit and Sales for each quarter.')
    if (quarterRows.some(row => row.operatingProfitMargin === null)) missingMetrics.push('Quarterly OPM')
    const companyName = String(matrix.find(row => cleanLabel(row?.[0]) === 'company name')?.[1] ?? file.name.replace(/\.xlsx?$/i, ''))
    return {
      companyName, faceValue: metaValue(matrix, 'Face Value'), currentMarketCap: metaValue(matrix, 'Market Capitalization'), annual, quarterly: quarterRows,
      sourceMatrix: matrix, sourceFileName: file.name, warnings, missingMetrics,
    }
}

export async function parseBankWorkbook(file: File): Promise<BankData> {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const workbook = new ExcelJSRuntime.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheetName = workbook.worksheets.find(sheet => cleanLabel(sheet.name) === 'data sheet')?.name
  if (!sheetName) throw new Error('This workbook does not contain a worksheet named “Data Sheet”.')
  const sheet = workbook.getWorksheet(sheetName)!
  const matrix: unknown[][] = Array.from({ length: sheet.rowCount }, () => Array<unknown>(sheet.columnCount).fill(null))
  sheet.eachRow({ includeEmpty: true }, row => {
    row.eachCell({ includeEmpty: true }, (cell, column) => { matrix[row.number - 1][column - 1] = plainCellValue(cell.value) })
  })
  const pnlBounds = boundsFor(matrix, ['Profit & Loss', 'PROFIT AND LOSS'], ['Quarters', 'Balance Sheet'])
  const quarterBounds = boundsFor(matrix, ['Quarters'], ['Balance Sheet'])
  const balanceBounds = boundsFor(matrix, ['Balance Sheet'], ['Cash Flow', 'Cash Flow:'])
  const cashBounds = boundsFor(matrix, ['Cash Flow', 'Cash Flow:'], ['Price', 'Derived'])
  if (!pnlBounds || !quarterBounds || !balanceBounds) {
    throw new Error('The bank Data Sheet needs Profit & Loss, Quarters, and Balance Sheet sections.')
  }
  const pnl = tableFrom(matrix, pnlBounds)
  const quarters = tableFrom(matrix, quarterBounds, true)
  const balance = tableFrom(matrix, balanceBounds)
  const cash = cashBounds ? tableFrom(matrix, cashBounds) : null
  const sharesRow = matrix.find(row => cleanLabel(row?.[0]) === 'adjusted equity shares in cr')
  const warnings: string[] = []
  const missingMetrics: string[] = []

  const annual: BankAnnualRow[] = pnl.periods.map((period, i) => {
    const interestEarned = get(pnl, 'Sales', i)
    const interestPaid = get(pnl, 'Interest', i)
    const otherIncome = get(pnl, 'Other Income', i)
    const totalRevenue = interestEarned === null || otherIncome === null ? null : interestEarned + otherIncome
    const profitBeforeTax = get(pnl, 'Profit before tax', i, ['Profit Before Tax'])
    const netProfit = get(pnl, 'Net profit', i, ['Net Profit'])
    const provisionOtherExpense = get(pnl, 'Other Expenses', i)
    const expenseInputs = [
      get(pnl, 'Raw Material Cost', i), get(pnl, 'Change in Inventory', i), get(pnl, 'Power and Fuel', i),
      get(pnl, 'Other Mfr. Exp', i, ['Other Manufacturing Expenses']), get(pnl, 'Employee Cost', i),
      get(pnl, 'Selling and admin', i),
    ]
    const allExpenseComponentsPresent = expenseInputs.every(value => value !== null)
      && provisionOtherExpense !== null && interestPaid !== null
    const basicExpense = expenseInputs.some(value => value !== null)
      ? expenseInputs.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null
    const reportedExpenseTotal = allExpenseComponentsPresent && basicExpense !== null
      ? basicExpense + provisionOtherExpense! + interestPaid!
      : null
    // Where the bank statement omits component rows, use the exact P&L identity
    // Revenue − PBT. This is a source-derived total, not an estimated expense.
    const totalExpense = reportedExpenseTotal ?? (totalRevenue === null || profitBeforeTax === null ? null : totalRevenue - profitBeforeTax)
    const expenseMethod: BankAnnualRow['expenseMethod'] = reportedExpenseTotal !== null
      ? 'reported components' : totalExpense !== null ? 'revenue less PBT' : null
    const equityCapital = get(balance, 'Equity Share Capital', i, ['Share Capital'])
    const reserves = get(balance, 'Reserves', i)
    const equity = equityCapital === null || reserves === null ? null : equityCapital + reserves
    const borrowings = get(balance, 'Borrowings', i)
    const totalAssets = totalAssetsValue(matrix, balanceBounds, i)
    const otherAssets = get(balance, 'Other Assets', i)
    const cashBank = get(balance, 'Cash & Bank', i, ['Cash and Bank'])
    const otherLiabilities = get(balance, 'Other Liabilities', i)
    const rawShares = get(balance, 'No. of Equity Shares', i, ['Number of Equity Shares'])
    const sharesCr = sharesRow ? numberOrNull(sharesRow[i + 1]) : rawShares === null ? null : rawShares / 10_000_000
    const operatingCashFlow = cash ? get(cash, 'Cash from Operating Activity', i) : null
    const cwip = get(balance, 'Capital Work in Progress', i, ['CWIP'])
    const freeCashFlow = operatingCashFlow === null ? null : operatingCashFlow - (cwip ?? 0)
    const priorEquityCapital = i > 0 ? get(balance, 'Equity Share Capital', i - 1, ['Share Capital']) : null
    const priorReserves = i > 0 ? get(balance, 'Reserves', i - 1) : null
    const priorEquity = priorEquityCapital === null || priorReserves === null ? null : priorEquityCapital + priorReserves
    const priorAssets = i > 0 ? totalAssetsValue(matrix, balanceBounds, i - 1) : null
    const dividend = get(pnl, 'Dividend Amount', i, ['Dividend'])
    const interestGap = interestEarned === null || interestPaid === null || interestEarned === 0
      ? null : 100 * (interestEarned - interestPaid) / interestEarned
    const otherIncomeToInterestEarned = interestEarned === null || otherIncome === null || interestEarned === 0
      ? null : 100 * otherIncome / interestEarned
    const operatingProfitMargin = totalRevenue === null || totalExpense === null || totalRevenue === 0
      ? null : 100 * (totalRevenue - totalExpense) / totalRevenue
    const netProfitMargin = totalRevenue === null || netProfit === null || totalRevenue === 0
      ? null : 100 * netProfit / totalRevenue
    const debtToEquity = borrowings === null || equity === null || equity === 0 ? null : borrowings / equity
    const denominatorLiquidity = borrowings === null || otherLiabilities === null ? null : borrowings + otherLiabilities
    const roe = i === 0 || equity === null || priorEquity === null || netProfit === null || priorEquity + equity === 0
      ? null : 100 * netProfit / ((priorEquity + equity) / 2)
    const roa = i === 0 || totalAssets === null || priorAssets === null || netProfit === null || priorAssets + totalAssets === 0
      ? null : 100 * netProfit / ((priorAssets + totalAssets) / 2)
    return {
      period, interestEarned, interestPaid, interestGap, otherIncome, otherIncomeToInterestEarned, totalRevenue, basicExpense, provisionOtherExpense,
      totalExpense, expenseMethod, profitBeforeTax, netProfit, operatingProfitMargin, netProfitMargin, dividend,
      dividendPerShare: dividend === 0 ? 0 : dividend === null || dividend < 0 || sharesCr === null || sharesCr <= 0 ? null : dividend / sharesCr,
      dividendPayout: dividend === 0 ? 0 : dividend === null || dividend < 0 || netProfit === null || netProfit <= 0 ? null : 100 * dividend / netProfit,
      eps: netProfit === null || sharesCr === null || sharesCr === 0 ? null : netProfit / sharesCr,
      equity, borrowings, debtToEquity, roe, roa, cashBank, otherLiabilities,
      liquidity: cashBank === null || denominatorLiquidity === null || denominatorLiquidity === 0
        ? null : 100 * cashBank / denominatorLiquidity,
      totalAssets, otherAssets, sharesCr, operatingCashFlow, cwip, freeCashFlow,
    }
  })

  const quarterly: BankQuarterRow[] = quarters.periods.map((period, i) => {
    const interestEarned = get(quarters, 'Sales', i)
    const interestPaid = get(quarters, 'Interest', i)
    const otherIncome = get(quarters, 'Other Income', i)
    const totalRevenue = interestEarned === null || otherIncome === null ? null : interestEarned + otherIncome
    const expenses = get(quarters, 'Expenses', i)
    const totalExpense = expenses === null || interestPaid === null ? null : expenses + interestPaid
    const operatingProfit = get(quarters, 'Operating Profit', i)
    const netProfit = get(quarters, 'Net profit', i, ['Net Profit'])
    const otherIncomeToInterestEarned = interestEarned === null || otherIncome === null || interestEarned === 0
      ? null : 100 * otherIncome / interestEarned
    return {
      period, interestEarned, interestPaid,
      interestGap: interestEarned === null || interestPaid === null || interestEarned === 0 ? null : 100 * (interestEarned - interestPaid) / interestEarned,
      otherIncome, otherIncomeToInterestEarned, totalRevenue, expenses, totalExpense, operatingProfit, netProfit,
      operatingProfitMargin: totalRevenue === null || totalExpense === null || totalRevenue === 0 ? null : 100 * (totalRevenue - totalExpense) / totalRevenue,
      netProfitMargin: totalRevenue === null || netProfit === null || totalRevenue === 0 ? null : 100 * netProfit / totalRevenue,
    }
  })

  if (annual.some(row => row.expenseMethod === 'revenue less PBT')) {
    warnings.push('For years with blank annual expense components, total expense uses the exact source identity Total Revenue − Profit before tax. Under this fallback, the requested OPM formula equals reported PBT ÷ Total Revenue; it is not a separately reported operating margin.')
  }
  if (annual.some(row => row.dividend === null)) warnings.push('Some annual dividend cells are blank; they remain missing rather than being assumed to mean zero.')
  if (annual.some(row => row.roe === null || row.roa === null)) warnings.push('ROE/ROA use average equity/total assets; the first year is blank because the prior-year balances are not in the workbook.')
  if (annual.some(row => row.liquidity === null)) warnings.push('Liquidity is unavailable where Cash & Bank, Borrowings, or Other Liabilities are missing or the denominator is zero.')
  const currentAssets = annual.length ? get(balance, 'Current Assets', annual.length - 1, ['Current asset']) : null
  if (currentAssets === null) warnings.push('The Data Sheet does not provide a Current Assets row. Other Assets is not treated as Current Assets.')
  missingMetrics.push('NIM, advances/loans, deposits/CASA, NPAs/provisions, and capital adequacy are not present in this Data Sheet and are not estimated.')
  const companyName = String(matrix.find(row => cleanLabel(row?.[0]) === 'company name')?.[1] ?? file.name.replace(/\.xlsx?$/i, ''))
  return {
    mode: 'bank', companyName, faceValue: metaValue(matrix, 'Face Value'),
    currentMarketCap: metaValue(matrix, 'Market Capitalization'), currentAssets, annual, quarterly,
    sourceMatrix: matrix, sourceFileName: file.name, warnings, missingMetrics,
  }
}

