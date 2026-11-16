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
  dma_50?: string
  dma_200?: string
  price_range?: string
  is_target?: boolean
  is_median?: boolean
  // Legacy fallback fields for older cached payloads
  mcap_cr?: string
  revenue_cr?: string
  opm_pct?: string
  roce_pct?: string
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

export type AboutPeerComparison = {
  rows: AboutPeerRow[]
  median?: AboutPeerRow | null
  sector_path?: string[]
  authenticated?: boolean
  source_url?: string
  footnote?: string
}

export type AboutShareholdingRow = {
  label: string
  values: string[]
  is_count?: boolean
}

export type AboutShareholdingTable = {
  headers: string[]
  rows: AboutShareholdingRow[]
  note?: string
}

export type AboutNamedPromoter = {
  name: string
  latest_pct: string
  prev_pct: string
  period: string
}

export type AboutShareholding = {
  screener_url?: string
  pledged_pct?: string
  quarterly: AboutShareholdingTable
  yearly: AboutShareholdingTable
  named_promoters?: AboutNamedPromoter[]
}

export type AboutPromoterProfile = {
  main_promoter_group?: string
  short_history?: string
  reputation?: string
  positives?: string[] | string
  negatives_and_risks?: string[] | string
  ownership_takeaway?: string
}

export type AboutSummaryReport = {
  company_name?: string
  promoter_and_owner?: AboutPromoterProfile | string
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
  credit_rating_summary?: string
  management_guidance?: string
  valuation_and_pe?: string
  analyst_forecasts?: string
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

export type AboutPromoterIntel = {
  entity_candidates?: string[]
  wiki_profiles?: Array<{ title: string; url: string; summary: string; ref_id?: number }>
  reputation_news?: AboutNewsItem[]
  positive_news?: AboutNewsItem[]
  negative_news?: AboutNewsItem[]
}

export type AboutFinancialTable = {
  headers: string[]
  rows: Array<{ label: string; values: string[] }>
}

export type AboutRatioRow = {
  label: string
  category?: string
  values: string[]
}

export type AboutRatioTable = {
  headers: string[]
  rows: AboutRatioRow[]
  formulas?: string[]
  is_bank?: boolean
  scope?: string
}

export type AboutFinancialSnapshot = {
  quarterly_pnl?: AboutFinancialTable
  yearly_pnl?: AboutFinancialTable
  balance_sheet?: AboutFinancialTable
  cash_flow?: AboutFinancialTable
  ratios?: AboutFinancialTable
  quarterly_ratios?: AboutRatioTable
  yearly_ratios?: AboutRatioTable
  growth_ranges?: Array<{ metric: string; items: Array<{ period: string; value: string }> }>
}

export type AboutFactoryItem = {
  name: string
  location?: string
  details?: string
}

export type AboutSubsidiaryItem = {
  name: string
  relationship?: string
  details?: string
}

export type AboutFinancialPositionSummary = {
  overall_stance?: string
  sales_yearly_and_ttm?: string
  sales_quarterly_momentum?: string
  pnl_yearly_and_ttm?: string
  pnl_quarterly_trend?: string
  balance_sheet_health?: string
  cash_flow_quality?: string
  strengths_good?: string[]
  watchpoints_bad?: string[]
  trend_status?: string
  current_trend_verdict?: string
}

export type AboutCreditRatingItem = {
  agency: string
  rating?: string
  date?: string
  title?: string
  url?: string
  details?: string
  ref_id?: number
}

export type AboutValuationMultiples = {
  screener_pe?: string
  trailing_pe?: string
  forward_pe?: string
  peg_ratio?: string
  price_to_book?: string
  trailing_eps?: string
  forward_eps?: string
  current_price?: string
}

export type AboutAnalystConsensus = {
  rating?: string
  recommendation_mean?: string
  analyst_count?: string
  target_mean_price?: string
  target_median_price?: string
  target_high_price?: string
  target_low_price?: string
  implied_upside_pct?: string
  distribution?: {
    strongBuy?: number
    buy?: number
    hold?: number
    sell?: number
    strongSell?: number
  }
  recent_actions?: Array<{
    firm?: string
    action?: string
    toGrade?: string
    fromGrade?: string
    date?: string
  }>
}

export type AboutMarketIntelligence = {
  credit_ratings?: AboutCreditRatingItem[]
  credit_rating_news?: AboutNewsItem[]
  management_guidance_news?: AboutNewsItem[]
  concalls?: Array<{ title: string; url: string; ref_id?: number }>
  valuation?: AboutValuationMultiples
  analyst_consensus?: AboutAnalystConsensus
  analyst_news?: AboutNewsItem[]
  yahoo_ref_id?: number | null
}

export type AboutSourcesResponse = {
  company_info: { id: number | string | null; name: string; symbol: string; url_path?: string }
  official_site: { url: string; title: string; status: string }
  live_intel: {
    capex_news: AboutNewsItem[]
    regulatory_news: AboutNewsItem[]
    recent_news_12m: AboutNewsItem[]
  }
  promoter_intel?: AboutPromoterIntel
  master_sources: AboutMasterSource[]
  official_ref_id: number | null
  screener_ref_id: number | null
  peer_comparison?: AboutPeerComparison
  shareholding?: AboutShareholding
  shareholding_pattern?: ShareholdingPattern
  financial_snapshot?: AboutFinancialSnapshot
  market_intelligence?: AboutMarketIntelligence
  generated_at?: string
  prompt_context: {
    popup_text: string
    financial_intel: string
    official_content: string
    promoter_intel?: string
    market_intel?: string
  }
}

export type AboutAiData = {
  summary_report?: AboutSummaryReport
  executive_summary?: string
  quick_stats?: Array<{ label: string; value: string }>
  revenue_breakup?: Array<{ category: string; percentage: number; details?: string }>
  geographical_reach?: Array<{ region: string; percentage: number; details?: string }>
  factories_and_plants?: AboutFactoryItem[]
  subsidiaries_list?: AboutSubsidiaryItem[]
  financial_position_summary?: AboutFinancialPositionSummary
  capex_and_order_book?: Array<{ headline: string; date?: string; details: string; source_num?: number }>
  regulatory_and_litigation?: Array<{ issue: string; severity?: string; details: string; source_num?: number }>
  official_site_highlights?: { headline?: string; core_assets?: string; source_num?: number }
  sections?: Array<{ title: string; content: string }>
}

export type AboutState = {
  companyKey: string
  status: 'idle' | 'loading' | 'loading-sources' | 'loading-ai' | 'ready' | 'needs-key' | 'needs-local-key' | 'error'
  sources: AboutSourcesResponse | null
  data?: any
  ai: AboutAiData | null
  error: string
  aiError: string
  cached?: boolean
  cachedAt?: string
}

export type LocalSettingsSummary = {
  hasGeminiApiKey: boolean
  geminiApiKeyMasked: string
  keySource: 'settings' | 'env' | 'none'
  hasScreenerCredentials?: boolean
  screenerEmail?: string
  screenerSource?: 'settings' | 'env' | 'none'
  browserPreference: 'auto' | 'chrome' | 'edge'
  detectedBrowsers: string[]
  dataDir: string
  browserProfileDir: string
  aboutCacheDir: string
  aboutCacheCount: number
  aboutCacheBytes: number
}

export type GoogleDriveSyncStatus = {
  apiConnected: boolean
  userEmail: string
  hasCredentials: boolean
  hasToken: boolean
  driveFolderId: string | null
  gdriveDesktopPath: string
  gdriveDesktopAvailable: boolean
  localWebReportsPath: string
  totalSavedReports: number
}

export type SavedReportInfo = {
  found: boolean
  code: string
  companyName?: string
  fileName?: string
  lastModified?: string
  formattedDate?: string
  version?: number
  driveFileId?: string
  webViewLink?: string
  localPath?: string
  storageType?: string
}

export type SavedReportItem = {
  code: string
  fileName: string
  filePath: string
  sizeBytes: number
  lastModified: string
  formattedDate: string
  mtime: number
}
