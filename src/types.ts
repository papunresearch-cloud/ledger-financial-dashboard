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
}

export type QuarterRow = {
  period: string
  sales: number | null
  totalIncome: number | null
  netProfit: number | null
  operatingProfit: number | null
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

export type AboutPeerRow = {
  company: string
  mcap_cr: string
  revenue_cr: string
  opm_pct: string
  pe: string
  roce_pct: string
  is_target?: boolean
}

export type AboutSummaryReport = {
  company_name?: string
  promoter_and_owner?: string
  sector_and_industry?: string
  market_position_and_peers?: string
  peer_table?: AboutPeerRow[]
  business_model_short?: string
  business_model_type?: { primary_tags?: string[]; note?: string } | string
  revenue_sources_short?: string
  revenue_breakups?: {
    product_wise?: string
    geography_wise?: string
    consolidated_vs_standalone?: string
  } | string
  profitability_analysis?: {
    current_vs_avg_margin?: string
    profitability_factors?: string
    profit_contribution_consol_vs_standalone?: string
  } | string
  financial_issues?: string
  partners_and_subsidiaries?: string
  growth_capex_orderbook?: string
  current_issues?: string
  investor_risks_and_opportunities?: {
    opportunities?: string
    risks?: string
  } | string
  additional_insights?: string
}

export type AboutNewsItem = {
  title: string
  headline: string
  publisher: string
  url: string
  date: string
  timestamp?: number
  within_12m?: boolean
  ref_id?: number
}

export type AboutMasterSource = {
  id: number
  title: string
  url: string
  type: string
  date?: string
}

export type AboutSourcesResponse = {
  company_info: { id: number | string | null; name: string; symbol: string; url_path?: string }
  official_site: { url: string; title: string; status: string }
  live_intel: {
    capex_news: AboutNewsItem[]
    regulatory_news: AboutNewsItem[]
    recent_news_12m: AboutNewsItem[]
  }
  master_sources: AboutMasterSource[]
  official_ref_id: number | null
  screener_ref_id: number | null
  generated_at?: string
  prompt_context: {
    popup_text: string
    financial_intel: string
    official_content: string
  }
}

export type AboutAiData = {
  summary_report?: AboutSummaryReport
  executive_summary?: string
  quick_stats?: Array<{ label: string; value: string }>
  revenue_breakup?: Array<{ category: string; percentage: number; details?: string }>
  geographical_reach?: Array<{ region: string; percentage: number; details?: string }>
  capex_and_order_book?: Array<{ headline: string; date?: string; details: string; source_num?: number }>
  regulatory_and_litigation?: Array<{ issue: string; severity?: string; details: string; source_num?: number }>
  official_site_highlights?: { headline?: string; core_assets?: string; source_num?: number }
  sections?: Array<{ title: string; content: string }>
}

export type AboutState = {
  companyKey: string
  status: 'idle' | 'loading-sources' | 'loading-ai' | 'ready' | 'needs-key' | 'error'
  sources: AboutSourcesResponse | null
  ai: AboutAiData | null
  error: string
  aiError: string
}
