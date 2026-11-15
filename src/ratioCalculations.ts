import type {
  AnnualRow,
  BankAnnualRow,
  BankData,
  BankQuarterRow,
  CompanyData,
  FinancialData,
  QuarterRow,
  RatioTable,
  RatioTableRow,
} from './types'

function fmtPct(val: number | null | undefined, signed = false): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—'
  const sign = signed && val > 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

function fmtMult(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—'
  return `${val.toFixed(2)}×`
}

function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)
}

function fmtDays(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—'
  return `${Math.round(val)} days`
}

function growthPct(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr === null || curr === undefined || prev === null || prev === undefined || prev === 0 || !Number.isFinite(curr) || !Number.isFinite(prev)) {
    return null
  }
  return ((curr - prev) / Math.abs(prev)) * 100
}

/** Compute full set of Quarterly Financial Ratios */
export function computeQuarterlyRatios(data: FinancialData): RatioTable {
  if (data.mode === 'bank') {
    return computeBankQuarterlyRatios(data)
  }
  return computeCorporateQuarterlyRatios(data)
}

/** Compute full set of Yearly Financial Ratios */
export function computeYearlyRatios(data: FinancialData): RatioTable {
  if (data.mode === 'bank') {
    return computeBankYearlyRatios(data)
  }
  return computeCorporateYearlyRatios(data)
}

// -------------------------------------------------------------
// CORPORATE (NON-BANK) QUARTERLY RATIOS
// -------------------------------------------------------------
function computeCorporateQuarterlyRatios(data: CompanyData): RatioTable {
  const quarters = data.quarterly
  const n = quarters.length
  const headers = quarters.map(q => q.period)

  // Compute TTM window from last 4 quarters if available
  const hasTtm = n >= 4
  const last4 = hasTtm ? quarters.slice(-4) : []
  const prior4 = n >= 8 ? quarters.slice(-8, -4) : []

  const sumLast4 = (k: keyof QuarterRow) => last4.reduce((acc, q) => {
    const v = q[k]
    return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc
  }, 0)
  const sumPrior4 = (k: keyof QuarterRow) => prior4.reduce((acc, q) => {
    const v = q[k]
    return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc
  }, 0)

  const ttmSales = hasTtm ? sumLast4('sales') : null
  const priorTtmSales = prior4.length === 4 ? sumPrior4('sales') : null
  const ttmOp = hasTtm ? sumLast4('operatingProfit') : null
  const priorTtmOp = prior4.length === 4 ? sumPrior4('operatingProfit') : null
  const ttmNp = hasTtm ? sumLast4('netProfit') : null
  const priorTtmNp = prior4.length === 4 ? sumPrior4('netProfit') : null
  const ttmPbt = hasTtm ? sumLast4('profitBeforeTax') : null
  const ttmOi = hasTtm ? sumLast4('otherIncome') : null

  const outHeaders = [...headers]
  if (hasTtm) outHeaders.push('TTM')

  const rows: RatioTableRow[] = []

  const add = (label: string, category: string, formula: string, computeFn: (q: QuarterRow, idx: number) => number | null | undefined, ttmFn?: () => number | null | undefined, isMultiple = false, isSigned = false) => {
    const values: string[] = quarters.map((q, idx) => {
      const v = computeFn(q, idx)
      return isMultiple ? fmtMult(v) : fmtPct(v, isSigned)
    })
    if (hasTtm) {
      const tv = ttmFn ? ttmFn() : null
      values.push(isMultiple ? fmtMult(tv) : fmtPct(tv, isSigned))
    }
    rows.push({ label, category, formula, values })
  }

  // 1. Growth
  add(
    'Sales YoY Growth (%)',
    'Growth',
    '(Sales_Q(t) − Sales_Q(t-4)) / |Sales_Q(t-4)| × 100 (TTM: trailing 4Q vs prior 4Q)',
    (q, i) => i >= 4 ? growthPct(q.sales, quarters[i - 4].sales) : null,
    () => growthPct(ttmSales, priorTtmSales),
    false,
    true
  )
  add(
    'Sales QoQ Growth (%)',
    'Growth',
    '(Sales_Q(t) − Sales_Q(t-1)) / |Sales_Q(t-1)| × 100',
    (q, i) => i >= 1 ? growthPct(q.sales, quarters[i - 1].sales) : null,
    () => null,
    false,
    true
  )
  add(
    'Operating Profit YoY Growth (%)',
    'Growth',
    '(Operating Profit_Q(t) − Operating Profit_Q(t-4)) / |Operating Profit_Q(t-4)| × 100',
    (q, i) => i >= 4 ? growthPct(q.operatingProfit, quarters[i - 4].operatingProfit) : null,
    () => growthPct(ttmOp, priorTtmOp),
    false,
    true
  )
  add(
    'Net Profit YoY Growth (%)',
    'Growth',
    '(Net Profit_Q(t) − Net Profit_Q(t-4)) / |Net Profit_Q(t-4)| × 100',
    (q, i) => i >= 4 ? growthPct(q.netProfit, quarters[i - 4].netProfit) : null,
    () => growthPct(ttmNp, priorTtmNp),
    false,
    true
  )
  add(
    'Net Profit QoQ Growth (%)',
    'Growth',
    '(Net Profit_Q(t) − Net Profit_Q(t-1)) / |Net Profit_Q(t-1)| × 100',
    (q, i) => i >= 1 ? growthPct(q.netProfit, quarters[i - 1].netProfit) : null,
    () => null,
    false,
    true
  )

  // 2. Profitability & Margins
  add(
    'Operating Margin — OPM (%)',
    'Profitability & Margins',
    'Operating Profit / Sales × 100',
    q => q.sales && q.operatingProfit !== null ? (q.operatingProfit / q.sales) * 100 : q.operatingProfitMargin,
    () => ttmSales && ttmOp !== null ? (ttmOp / ttmSales) * 100 : null
  )
  add(
    'Pre-Tax Margin — PBT (%)',
    'Profitability & Margins',
    'Profit before tax / Sales × 100',
    q => q.sales && q.profitBeforeTax !== null ? (q.profitBeforeTax / q.sales) * 100 : null,
    () => ttmSales && ttmPbt !== null ? (ttmPbt / ttmSales) * 100 : null
  )
  add(
    'Net Profit Margin — NPM (%)',
    'Profitability & Margins',
    'Net Profit / Sales × 100',
    q => q.sales && q.netProfit !== null ? (q.netProfit / q.sales) * 100 : q.netProfitMargin,
    () => ttmSales && ttmNp !== null ? (ttmNp / ttmSales) * 100 : null
  )

  // 3. Earnings Quality & Coverage
  add(
    'Other Income vs Total Income (%)',
    'Earnings Quality & Coverage',
    'Other Income / (Sales + Other Income) × 100',
    q => {
      const tot = (q.sales ?? 0) + (q.otherIncome ?? 0)
      return q.otherIncome !== null && tot > 0 ? (q.otherIncome / tot) * 100 : null
    },
    () => {
      const tot = (ttmSales ?? 0) + (ttmOi ?? 0)
      return ttmOi !== null && tot > 0 ? (ttmOi / tot) * 100 : null
    }
  )
  add(
    'Other Income / PBT (%)',
    'Earnings Quality & Coverage',
    'Other Income / Profit before tax × 100 (when PBT > 0)',
    q => q.profitBeforeTax && q.profitBeforeTax > 0 && q.otherIncome !== null ? (q.otherIncome / q.profitBeforeTax) * 100 : null,
    () => ttmPbt && ttmPbt > 0 && ttmOi !== null ? (ttmOi / ttmPbt) * 100 : null
  )
  add(
    'Effective Tax Rate (%)',
    'Earnings Quality & Coverage',
    '(PBT − Net Profit) / PBT × 100',
    q => q.profitBeforeTax && q.profitBeforeTax > 0 && q.netProfit !== null ? ((q.profitBeforeTax - q.netProfit) / q.profitBeforeTax) * 100 : null,
    () => ttmPbt && ttmPbt > 0 && ttmNp !== null ? ((ttmPbt - ttmNp) / ttmPbt) * 100 : null
  )

  // 4. Per Share
  const sharesCr = data.annual.at(-1)?.sharesCr ?? null
  const epsVals = quarters.map(q => {
    if (sharesCr && q.netProfit !== null) return `₹${(q.netProfit / sharesCr).toFixed(2)}`
    return '—'
  })
  if (hasTtm) {
    epsVals.push(sharesCr && ttmNp !== null ? `₹${(ttmNp / sharesCr).toFixed(2)}` : '—')
  }
  rows.push({
    label: 'EPS (₹)',
    category: 'Per Share',
    formula: 'Quarterly Net Profit / Number of Equity Shares (₹)',
    values: epsVals,
  })

  return {
    headers: outHeaders,
    rows,
    is_bank: false,
    scope: 'Corporate Non-Bank',
  }
}

// -------------------------------------------------------------
// CORPORATE (NON-BANK) YEARLY RATIOS
// -------------------------------------------------------------
function computeCorporateYearlyRatios(data: CompanyData): RatioTable {
  const annual = data.annual
  const headers = annual.map(a => a.period)
  const rows: RatioTableRow[] = []

  const add = (
    label: string,
    category: string,
    formula: string,
    computeFn: (a: AnnualRow, idx: number) => number | null | undefined,
    formatMode: 'pct' | 'mult' | 'num' | 'days' = 'pct',
    signed = false
  ) => {
    const values: string[] = annual.map((a, idx) => {
      const v = computeFn(a, idx)
      if (formatMode === 'mult') return fmtMult(v)
      if (formatMode === 'days') return fmtDays(v)
      if (formatMode === 'num') return fmtNum(v)
      return fmtPct(v, signed)
    })
    rows.push({ label, category, formula, values })
  }

  // 1. Growth
  add('Sales YoY Growth (%)', 'Growth', '(Sales_t − Sales_(t-1)) / |Sales_(t-1)| × 100', (a, i) => i >= 1 ? growthPct(a.sales, annual[i - 1].sales) : null, 'pct', true)
  add('Net Profit YoY Growth (%)', 'Growth', '(Net Profit_t − Net Profit_(t-1)) / |Net Profit_(t-1)| × 100', (a, i) => i >= 1 ? growthPct(a.netProfit, annual[i - 1].netProfit) : null, 'pct', true)

  // 2. Profitability & Margins
  add('Operating Margin — OPM (%)', 'Profitability & Margins', 'Operating Profit / Sales × 100', a => a.operatingProfitMargin)
  add('Pre-Tax Margin — PBT (%)', 'Profitability & Margins', 'Profit before tax / Sales × 100', a => a.sales && a.profitBeforeTax !== null ? (a.profitBeforeTax / a.sales) * 100 : null)
  add('Net Profit Margin — NPM (%)', 'Profitability & Margins', 'Net Profit / Sales × 100', a => a.netProfitMargin)
  add('Other Income vs Total Income (%)', 'Profitability & Margins', 'Other Income / Total Income × 100', a => a.totalIncome && a.otherIncome !== null ? (a.otherIncome / a.totalIncome) * 100 : null)

  // 3. Liquidity Ratios
  add('Current Ratio (x)', 'Liquidity Ratios', 'Other Assets / Other Liabilities', a => a.currentRatio, 'mult')
  add('Quick Ratio (x)', 'Liquidity Ratios', '(Other Assets − Inventory) / Other Liabilities', a => a.quickRatio, 'mult')
  add('Cash Ratio (%)', 'Liquidity Ratios', 'Cash & Bank / Other Liabilities × 100', a => a.cashRatio)

  // 4. Capital Returns & Efficiency
  add('Return on Equity — ROE (%)', 'Capital Returns & Leverage', 'Net Profit / Average Equity × 100', a => a.roe)
  add('ROCE (%)', 'Capital Returns & Leverage', 'EBIT / Average Capital Employed × 100', a => a.roce)
  add('Return on Assets — ROA (%)', 'Capital Returns & Leverage', 'Net Profit / Average Total Assets × 100', a => a.roa)
  add('Debt-to-Equity (x)', 'Capital Returns & Leverage', 'Borrowings / Equity (Share capital + Reserves)', a => a.debtToEquity, 'mult')
  add('Interest Coverage (x)', 'Capital Returns & Leverage', '(Profit before tax + Interest) / Interest', a => a.interestCoverage !== null ? a.interestCoverage : (a.interest && a.profitBeforeTax !== null && a.interest > 0 ? (a.profitBeforeTax + a.interest) / a.interest : null), 'mult')
  add('Asset Turnover (x)', 'Capital Returns & Leverage', 'Sales / Total Assets', a => a.totalAssets && a.sales && a.totalAssets > 0 ? a.sales / a.totalAssets : null, 'mult')

  // 5. Cash Flow & Quality
  add('CFO / Sales (%)', 'Cash Flow Quality & Payout', 'Cash from Operating Activity / Sales × 100', a => a.sales && a.operatingCashFlow !== null && a.sales > 0 ? (a.operatingCashFlow / a.sales) * 100 : null)
  add('CFO / Operating Profit (%)', 'Cash Flow Quality & Payout', 'Cash from Operating Activity / Operating Profit × 100', a => a.operatingProfit && a.operatingCashFlow !== null && a.operatingProfit > 0 ? (a.operatingCashFlow / a.operatingProfit) * 100 : null)
  add('CFO / Net Profit (%)', 'Cash Flow Quality & Payout', 'Cash from Operating Activity / Net Profit × 100', a => a.netProfit && a.operatingCashFlow !== null && a.netProfit > 0 ? (a.operatingCashFlow / a.netProfit) * 100 : null)
  add('FCF / OCF (%)', 'Cash Flow Quality & Payout', 'Free Cash Flow / Cash from Operating Activity × 100', a => a.operatingCashFlow && a.freeCashFlow !== null && a.operatingCashFlow > 0 ? (a.freeCashFlow / a.operatingCashFlow) * 100 : null)
  add('FCF / Net Profit (%)', 'Cash Flow Quality & Payout', 'Free Cash Flow / Net Profit × 100', a => a.netProfit && a.freeCashFlow !== null && a.netProfit > 0 ? (a.freeCashFlow / a.netProfit) * 100 : null)
  add('Dividend Payout (%)', 'Cash Flow Quality & Payout', 'Dividend Amount / Net Profit × 100', a => a.dividendPayout)

  // 6. Working Capital
  add('Debtor Days', 'Working Capital Cycle', 'Trade Receivables / (Sales / 365)', a => a.sales && a.receivables !== null && a.sales > 0 ? (a.receivables / a.sales) * 365 : null, 'days')
  add('Inventory Days', 'Working Capital Cycle', 'Inventories / (Sales / 365)', a => a.sales && a.inventory !== null && a.sales > 0 ? (a.inventory / a.sales) * 365 : null, 'days')
  add('Cash Conversion Cycle (Days)', 'Working Capital Cycle', 'Debtor Days + Inventory Days', a => {
    const d = a.sales && a.receivables !== null && a.sales > 0 ? (a.receivables / a.sales) * 365 : null
    const inv = a.sales && a.inventory !== null && a.sales > 0 ? (a.inventory / a.sales) * 365 : null
    if (d === null && inv === null) return null
    return (d ?? 0) + (inv ?? 0)
  }, 'days')
  add('Working Capital Days', 'Working Capital Cycle', '(Current Assets − Current Liabilities) / (Sales / 365)', a => {
    const ca = a.otherAssets ?? a.currentAssets
    const cl = a.otherLiabilities ?? a.currentLiabilities
    if (ca === null || cl === null || !a.sales || a.sales <= 0) return null
    return ((ca - cl) / a.sales) * 365
  }, 'days')

  return {
    headers,
    rows,
    is_bank: false,
    scope: 'Corporate Non-Bank',
  }
}

// -------------------------------------------------------------
// BANK QUARTERLY RATIOS
// -------------------------------------------------------------
function computeBankQuarterlyRatios(data: BankData): RatioTable {
  const quarters = data.quarterly
  const n = quarters.length
  const headers = quarters.map(q => q.period)

  const hasTtm = n >= 4
  const last4 = hasTtm ? quarters.slice(-4) : []
  const prior4 = n >= 8 ? quarters.slice(-8, -4) : []

  const sumLast4 = (k: keyof BankQuarterRow) => last4.reduce((acc, q) => {
    const v = q[k]
    return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc
  }, 0)
  const sumPrior4 = (k: keyof BankQuarterRow) => prior4.reduce((acc, q) => {
    const v = q[k]
    return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc
  }, 0)

  const ttmIe = hasTtm ? sumLast4('interestEarned') : null
  const priorTtmIe = prior4.length === 4 ? sumPrior4('interestEarned') : null
  const ttmIp = hasTtm ? sumLast4('interestPaid') : null
  const priorTtmIp = prior4.length === 4 ? sumPrior4('interestPaid') : null
  const ttmNii = ttmIe !== null && ttmIp !== null ? ttmIe - ttmIp : null
  const priorTtmNii = priorTtmIe !== null && priorTtmIp !== null ? priorTtmIe - priorTtmIp : null

  const ttmTotRev = hasTtm ? sumLast4('totalRevenue') : null
  const ttmTotExp = hasTtm ? sumLast4('totalExpense') : null
  const ttmNp = hasTtm ? sumLast4('netProfit') : null
  const priorTtmNp = prior4.length === 4 ? sumPrior4('netProfit') : null
  const ttmOi = hasTtm ? sumLast4('otherIncome') : null
  const ttmPbt = hasTtm ? sumLast4('profitBeforeTax') : null

  const outHeaders = [...headers]
  if (hasTtm) outHeaders.push('TTM')

  const rows: RatioTableRow[] = []

  const add = (label: string, category: string, formula: string, computeFn: (q: BankQuarterRow, idx: number) => number | null | undefined, ttmFn?: () => number | null | undefined, isMultiple = false, isSigned = false) => {
    const values: string[] = quarters.map((q, idx) => {
      const v = computeFn(q, idx)
      return isMultiple ? fmtMult(v) : fmtPct(v, isSigned)
    })
    if (hasTtm) {
      const tv = ttmFn ? ttmFn() : null
      values.push(isMultiple ? fmtMult(tv) : fmtPct(tv, isSigned))
    }
    rows.push({ label, category, formula, values })
  }

  // 1. Growth
  add('Interest Earned YoY Growth (%)', 'Growth', '(Interest Earned_Q(t) − Interest Earned_Q(t-4)) / |Interest Earned_Q(t-4)| × 100', (q, i) => i >= 4 ? growthPct(q.interestEarned, quarters[i - 4].interestEarned) : null, () => growthPct(ttmIe, priorTtmIe), false, true)
  add('Interest Earned QoQ Growth (%)', 'Growth', '(Interest Earned_Q(t) − Interest Earned_Q(t-1)) / |Interest Earned_Q(t-1)| × 100', (q, i) => i >= 1 ? growthPct(q.interestEarned, quarters[i - 1].interestEarned) : null, () => null, false, true)
  add('Net Interest Income (NII) YoY Growth (%)', 'Growth', '(NII_Q(t) − NII_Q(t-4)) / |NII_Q(t-4)| × 100', (q, i) => {
    if (i < 4) return null
    const nii = (q.interestEarned ?? 0) - (q.interestPaid ?? 0)
    const prevNii = (quarters[i - 4].interestEarned ?? 0) - (quarters[i - 4].interestPaid ?? 0)
    return growthPct(nii, prevNii)
  }, () => growthPct(ttmNii, priorTtmNii), false, true)
  add('Net Profit YoY Growth (%)', 'Growth', '(Net Profit_Q(t) − Net Profit_Q(t-4)) / |Net Profit_Q(t-4)| × 100', (q, i) => i >= 4 ? growthPct(q.netProfit, quarters[i - 4].netProfit) : null, () => growthPct(ttmNp, priorTtmNp), false, true)
  add('Net Profit QoQ Growth (%)', 'Growth', '(Net Profit_Q(t) − Net Profit_Q(t-1)) / |Net Profit_Q(t-1)| × 100', (q, i) => i >= 1 ? growthPct(q.netProfit, quarters[i - 1].netProfit) : null, () => null, false, true)

  // 2. Spread & Margins
  add('NII Spread — NII / Revenue (%)', 'Spread & Margins', '(Interest Earned − Interest Expended) / Interest Earned × 100', q => {
    const nii = (q.interestEarned ?? 0) - (q.interestPaid ?? 0)
    return q.interestEarned && q.interestEarned > 0 ? (nii / q.interestEarned) * 100 : null
  }, () => ttmIe && ttmIe > 0 && ttmNii !== null ? (ttmNii / ttmIe) * 100 : null)
  add('Financing Margin (%)', 'Spread & Margins', 'Operating Profit / Total Revenue × 100', q => q.operatingProfitMargin, () => ttmTotRev && ttmTotExp !== null ? ((ttmTotRev - ttmTotExp) / ttmTotRev) * 100 : null)
  add('Cost-to-Income (incl. Provisions %)', 'Spread & Margins', 'Total Expenses / (NII + Other Income) × 100', q => {
    const nii = (q.interestEarned ?? 0) - (q.interestPaid ?? 0)
    const opInc = nii + (q.otherIncome ?? 0)
    return q.totalExpense !== null && opInc > 0 ? (q.totalExpense / opInc) * 100 : null
  }, () => {
    const opInc = (ttmNii ?? 0) + (ttmOi ?? 0)
    return ttmTotExp !== null && opInc > 0 ? (ttmTotExp / opInc) * 100 : null
  })

  // 3. Income Mix
  add('Other Income vs Total Income (%)', 'Income Mix & Margins', 'Other Income / Total Revenue × 100', q => q.totalRevenue && q.otherIncome !== null ? (q.otherIncome / q.totalRevenue) * 100 : null, () => ttmTotRev && ttmOi !== null ? (ttmOi / ttmTotRev) * 100 : null)
  add('Non-Interest Income Share (%)', 'Income Mix & Margins', 'Other Income / (NII + Other Income) × 100', q => {
    const nii = (q.interestEarned ?? 0) - (q.interestPaid ?? 0)
    const opInc = nii + (q.otherIncome ?? 0)
    return q.otherIncome !== null && opInc > 0 ? (q.otherIncome / opInc) * 100 : null
  }, () => {
    const opInc = (ttmNii ?? 0) + (ttmOi ?? 0)
    return ttmOi !== null && opInc > 0 ? (ttmOi / opInc) * 100 : null
  })
  add('Net Profit Margin — NPM (%)', 'Income Mix & Margins', 'Net Profit / Total Revenue × 100', q => q.netProfitMargin, () => ttmTotRev && ttmNp !== null ? (ttmNp / ttmTotRev) * 100 : null)

  // 4. Tax & Per Share
  add('Effective Tax Rate (%)', 'Tax & Per Share', '(PBT − Net Profit) / PBT × 100', q => q.profitBeforeTax && q.profitBeforeTax > 0 && q.netProfit !== null ? ((q.profitBeforeTax - q.netProfit) / q.profitBeforeTax) * 100 : null, () => ttmPbt && ttmPbt > 0 && ttmNp !== null ? ((ttmPbt - ttmNp) / ttmPbt) * 100 : null)

  const sharesCr = data.annual.at(-1)?.sharesCr ?? null
  const epsVals = quarters.map(q => {
    if (sharesCr && q.netProfit !== null) return `₹${(q.netProfit / sharesCr).toFixed(2)}`
    return '—'
  })
  if (hasTtm) {
    epsVals.push(sharesCr && ttmNp !== null ? `₹${(ttmNp / sharesCr).toFixed(2)}` : '—')
  }
  rows.push({
    label: 'EPS (₹)',
    category: 'Tax & Per Share',
    formula: 'Quarterly Net Profit / Number of Equity Shares (₹)',
    values: epsVals,
  })

  return {
    headers: outHeaders,
    rows,
    is_bank: true,
    scope: 'Bank Book',
  }
}

// -------------------------------------------------------------
// BANK YEARLY RATIOS
// -------------------------------------------------------------
function computeBankYearlyRatios(data: BankData): RatioTable {
  const annual = data.annual
  const headers = annual.map(a => a.period)
  const rows: RatioTableRow[] = []

  const add = (
    label: string,
    category: string,
    formula: string,
    computeFn: (a: BankAnnualRow, idx: number) => number | null | undefined,
    formatMode: 'pct' | 'mult' = 'pct',
    signed = false
  ) => {
    const values: string[] = annual.map((a, idx) => {
      const v = computeFn(a, idx)
      if (formatMode === 'mult') return fmtMult(v)
      return fmtPct(v, signed)
    })
    rows.push({ label, category, formula, values })
  }

  // 1. Growth
  add('Interest Earned (Revenue) YoY Growth (%)', 'Growth', '(Interest Earned_t − Interest Earned_(t-1)) / |Interest Earned_(t-1)| × 100', (a, i) => i >= 1 ? growthPct(a.interestEarned, annual[i - 1].interestEarned) : null, 'pct', true)
  add('Net Interest Income (NII) YoY Growth (%)', 'Growth', '(NII_t − NII_(t-1)) / |NII_(t-1)| × 100', (a, i) => {
    if (i < 1) return null
    const nii = (a.interestEarned ?? 0) - (a.interestPaid ?? 0)
    const prevNii = (annual[i - 1].interestEarned ?? 0) - (annual[i - 1].interestPaid ?? 0)
    return growthPct(nii, prevNii)
  }, 'pct', true)
  add('Deposits YoY Growth (%)', 'Growth', '(Deposits_t − Deposits_(t-1)) / |Deposits_(t-1)| × 100', (a, i) => i >= 1 ? growthPct(a.deposits, annual[i - 1].deposits) : null, 'pct', true)
  add('Net Profit YoY Growth (%)', 'Growth', '(Net Profit_t − Net Profit_(t-1)) / |Net Profit_(t-1)| × 100', (a, i) => i >= 1 ? growthPct(a.netProfit, annual[i - 1].netProfit) : null, 'pct', true)

  // 2. Spread & Profitability
  add('Net Interest Margin Proxy — NII / Total Assets (%)', 'Spread & Profitability', '(Interest Earned − Interest Expended) / Total Assets × 100', a => {
    const nii = (a.interestEarned ?? 0) - (a.interestPaid ?? 0)
    return a.totalAssets && a.totalAssets > 0 ? (nii / a.totalAssets) * 100 : null
  })
  add('NII Spread — NII / Revenue (%)', 'Spread & Profitability', '(Interest Earned − Interest Expended) / Interest Earned × 100', a => {
    const nii = (a.interestEarned ?? 0) - (a.interestPaid ?? 0)
    return a.interestEarned && a.interestEarned > 0 ? (nii / a.interestEarned) * 100 : null
  })
  add('Financing Margin (%)', 'Spread & Profitability', 'Operating Profit / Total Revenue × 100', a => a.operatingProfitMargin)
  add('Cost-to-Income (incl. Provisions %)', 'Spread & Profitability', 'Total Expenses / (NII + Other Income) × 100', a => {
    const nii = (a.interestEarned ?? 0) - (a.interestPaid ?? 0)
    const opInc = nii + (a.otherIncome ?? 0)
    return a.totalExpense !== null && opInc > 0 ? (a.totalExpense / opInc) * 100 : null
  })

  // 3. Income Mix
  add('Other Income vs Total Income (%)', 'Income Mix', 'Other Income / Total Revenue × 100', a => a.otherIncomeToInterestEarned)
  add('Non-Interest Income Share (%)', 'Income Mix', 'Other Income / (NII + Other Income) × 100', a => {
    const nii = (a.interestEarned ?? 0) - (a.interestPaid ?? 0)
    const opInc = nii + (a.otherIncome ?? 0)
    return a.otherIncome !== null && opInc > 0 ? (a.otherIncome / opInc) * 100 : null
  })
  add('Net Profit Margin — NPM (%)', 'Income Mix', 'Net Profit / Total Revenue × 100', a => a.netProfitMargin)

  // 4. Capital Returns & Leverage
  add('Return on Equity — ROE (%)', 'Capital Returns & Leverage', 'Net Profit / Average Equity × 100', a => a.roe)
  add('Return on Assets — ROA (%)', 'Capital Returns & Leverage', 'Net Profit / Average Total Assets × 100', a => a.roa)
  add('Asset Leverage (Assets / Net Worth x)', 'Capital Returns & Leverage', 'Total Balance-Sheet Assets / Equity', a => a.equity && a.totalAssets ? a.totalAssets / a.equity : null, 'mult')

  // 5. Asset Quality & Funding Mix
  add('LDR (%) [Credit-to-Deposit Ratio]', 'Asset Quality & Funding Mix', 'Loans & Advances / Customer Deposits × 100', a => a.ldr ?? (a.loansAdvances && a.deposits && a.deposits > 0 ? (a.loansAdvances / a.deposits) * 100 : null))
  add('Borrowings / Deposits (%)', 'Asset Quality & Funding Mix', 'Borrowings / Deposits × 100', a => a.borrowingsToDeposits ?? (a.borrowings && a.deposits && a.deposits > 0 ? (a.borrowings / a.deposits) * 100 : null))
  add('Equity / Total Assets (%)', 'Asset Quality & Funding Mix', 'Equity / Total Assets × 100', a => a.equityToTotalAssets ?? (a.equity && a.totalAssets && a.totalAssets > 0 ? (a.equity / a.totalAssets) * 100 : null))
  add('Cash & Liquidity (%)', 'Asset Quality & Funding Mix', 'Cash & Bank / (Borrowings + Other Liabilities) × 100', a => a.liquidity)

  // 6. Payout
  add('Dividend Payout (%)', 'Payout', 'Dividends / Net Profit × 100', a => a.dividendPayout)

  return {
    headers,
    rows,
    is_bank: true,
    scope: 'Bank Book',
  }
}
