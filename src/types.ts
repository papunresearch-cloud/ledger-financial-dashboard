export type PeriodValue = { period: string; value: number | null }

export type AnnualRow = {
  period: string
  sales: number | null
  totalIncome: number | null
  netProfit: number | null
  operatingProfit: number | null
  operatingCashFlow: number | null
  investingCashFlow: number | null
  financingCashFlow: number | null
  netCashFlow: number | null
  freeCashFlow: number | null
  dividend: number | null
  dividendPerShare: number | null
  dividendPayout: number | null
  eps: number | null
  grossProfitMargin: number | null
  operatingProfitMargin: number | null
  netProfitMargin: number | null
  receivables: number | null
  inventory: number | null
  payables: number | null
  netBlock: number | null
  cwip: number | null
  netBlockToCwip: number | null
  equity: number | null
  borrowings: number | null
  roce: number | null
  interestCoverage: number | null
  currentAssets: number | null
  currentLiabilities: number | null
  currentRatio: number | null
  quickRatio: number | null
  cashRatio: number | null
  debtToEquity: number | null
  roe: number | null
  roa: number | null
  totalAssets: number | null
  investments: number | null
  otherAssets: number | null
  otherLiabilities: number | null
  currentAssetsToTotalAssets: number | null
  netBlockToTotalAssets: number | null
  investmentsToTotalAssets: number | null
  cashToTotalAssets: number | null
  cashBank: number | null
  sharesCr: number | null
  profitBeforeTax: number | null
  depreciation: number | null
  pbtLessDepreciation: number | null
  otherIncome: number | null
  interest: number | null
}

export type QuarterRow = {
  period: string
  sales: number | null
  totalIncome: number | null
  netProfit: number | null
  operatingProfit: number | null
  profitBeforeTax: number | null
  depreciation: number | null
  pbtLessDepreciation: number | null
  otherIncome: number | null
  operatingProfitMargin: number | null
  netProfitMargin: number | null
}

export type CompanyData = {
  mode?: 'nonbank'
  companyName: string
  faceValue: number | null
  currentMarketCap: number | null
  currentPrice: number | null
  annual: AnnualRow[]
  quarterly: QuarterRow[]
  sourceMatrix: unknown[][]
  sourceFileName: string
  warnings: string[]
  missingMetrics: string[]
}

export type BankAnnualRow = {
  period: string
  interestEarned: number | null
  interestPaid: number | null
  interestGap: number | null
  interestRatio: number | null
  otherIncomeToInterestEarned: number | null
  interestIncomeContribution: number | null
  otherIncome: number | null
  totalRevenue: number | null
  basicExpense: number | null
  provisionOtherExpense: number | null
  totalExpense: number | null
  expenseMethod: 'reported components' | 'revenue less PBT' | null
  profitBeforeTax: number | null
  netProfit: number | null
  operatingProfitMargin: number | null
  netProfitMargin: number | null
  dividend: number | null
  dividendPerShare: number | null
  dividendPayout: number | null
  eps: number | null
  equity: number | null
  borrowings: number | null
  debtToEquity: number | null
  roe: number | null
  roa: number | null
  cashBank: number | null
  otherLiabilities: number | null
  liquidity: number | null
  totalAssets: number | null
  otherAssets: number | null
  sharesCr: number | null
  operatingCashFlow: number | null
  cwip: number | null
  freeCashFlow: number | null
  depreciation: number | null
  pbtLessDepreciation: number | null
  deposits: number | null
  loansAdvances: number | null
  ldr: number | null
  borrowingsToDeposits: number | null
  equityToTotalAssets: number | null
}

export type BankQuarterRow = {
  period: string
  interestEarned: number | null
  interestPaid: number | null
  interestGap: number | null
  interestRatio: number | null
  otherIncomeToInterestEarned: number | null
  interestIncomeContribution: number | null
  otherIncome: number | null
  totalRevenue: number | null
  expenses: number | null
  totalExpense: number | null
  operatingProfit: number | null
  profitBeforeTax: number | null
  depreciation: number | null
  pbtLessDepreciation: number | null
  netProfit: number | null
  operatingProfitMargin: number | null
  netProfitMargin: number | null
}

export type BankData = {
  mode: 'bank'
  companyName: string
  faceValue: number | null
  currentMarketCap: number | null
  currentPrice: number | null
  currentAssets: number | null
  annual: BankAnnualRow[]
  quarterly: BankQuarterRow[]
  sourceMatrix: unknown[][]
  sourceFileName: string
  warnings: string[]
  missingMetrics: string[]
}

export type FinancialData = CompanyData | BankData

export type AppTheme = 'dark' | 'bright'

export type Section = 'about' | 'comparison' | 'overview' | 'quarterly-ratio' | 'yearly-ratio' | 'yearly' | 'holding' | 'quarterly' | 'tables' | 'checks'

export type AboutPeerRow = {
  s_no?: string
  company: string
  screener_url?: string
  mcap?: string
  ttm_sales?: string
  sales_growth?: string
  profit_growth?: string
  opm?: string
  debt_to_equity?: string
  bv_growth?: string
  roe?: string
  roa?: string
  payout?: string
  cfo_ebit_pct?: string
  pe?: string
  pb?: string
  ps?: string
  d_yield?: string
  cmp?: string
  high_52w?: string
  low_52w?: string
  h52_corr?: string
  is_target?: boolean
  is_median?: boolean
}

export type AboutPeerComparison = {
  rows: AboutPeerRow[]
  median?: AboutPeerRow | null
  sector_path?: string[]
  authenticated?: boolean
  source_url?: string
  footnote?: string
}

export type RatioTableRow = {
  label: string
  category: string
  formula?: string
  values: string[]
  rawValues?: (number | null)[]
}

export type RatioTable = {
  headers: string[]
  rows: RatioTableRow[]
  is_bank?: boolean
  scope?: string
}

export type ScreenerFootnote = {
  num: string
  url: string
  title?: string
}

export type ScreenerParagraph = {
  id: number
  title: string
  html: string
  text: string
  lines?: string[]
  subsections?: string[]
  bullets?: string[]
  citations?: ScreenerFootnote[]
}

export type ScreenerRatio = {
  label: string
  value: string
}

export type ShareholdingRow = {
  category: string
  values: string[]
  is_total?: boolean
  is_shareholders?: boolean
}

export type ShareholdingTable = {
  periods: string[]
  rows: ShareholdingRow[]
}

export type ShareholdingPattern = {
  quarterly: ShareholdingTable | null
  yearly: ShareholdingTable | null
}

export type ScreenerAboutData = {
  company_info: {
    name: string
    symbol: string
    screener_url: string
    website?: string
    sector?: string
  }
  ratios: ScreenerRatio[]
  about_intro: {
    title?: string
    html: string
    text: string
    citations: ScreenerFootnote[]
  }
  paragraphs: ScreenerParagraph[]
  shareholding?: ShareholdingPattern
  peer_comparison?: AboutPeerComparison | null
  financial_snapshot?: {
    balance_sheet?: {
      headers: string[]
      rows: Array<{ label: string; values: string[] }>
    }
  }
  pros: string[]
  cons: string[]
  footnotes: ScreenerFootnote[]
  generated_at?: string
  sources?: any
  ai?: any
}

export type AboutState = {
  companyKey: string
  status: 'idle' | 'loading' | 'ready' | 'error' | 'loading-sources' | 'loading-ai' | 'needs-key'
  data: ScreenerAboutData | null
  error: string
  sources?: any
  ai?: any
  aiError?: string
}
