import { useState, useMemo } from 'react'
import {
  Search,
  X,
  ShieldCheck,
  AlertTriangle,
  CircleHelp,
  BookOpen,
  CheckCircle2,
  Calculator,
  SlidersHorizontal,
  BarChart3,
  Sparkles,
} from 'lucide-react'
import type { FinancialData } from './types'
import './dataChecks.css'

export interface RatioDefinition {
  id: string
  name: string
  abbr: string
  category: 'growth' | 'margins' | 'returns' | 'liquidity' | 'solvency' | 'cashflow' | 'banking' | 'workingcap' | 'glossary'
  formula: string
  meaning: string
  benchmark: string
  notes: string
  applicableTo: 'all' | 'bank' | 'nonbank'
}

export interface PlotDefinition {
  id: string
  title: string
  subtitle: string
  category: 'annual-corporate' | 'quarterly-corporate' | 'annual-bank' | 'quarterly-bank'
  applicableTo: 'all' | 'bank' | 'nonbank'
  metrics: string
  dataSource: string
  meaning: string
  interpretation: string
  interactiveControls: string
}

export const RATIO_DEFINITIONS: RatioDefinition[] = [
  // Banking (BFSI) Ratios
  {
    id: 'ldr',
    name: 'Loan-to-Deposit Ratio (LDR %)',
    abbr: 'LDR / CDR',
    category: 'banking',
    formula: 'LDR (%) = (Total Loans & Advances ÷ Total Customer Deposits) × 100',
    meaning: 'Measures how aggressively a bank deploys customer deposits into lending assets. An essential measure of lending utilization, funding mix, and liquidity risk.',
    benchmark: 'Healthy range: 70% to 80%. Above 85% signals liquidity tightness requiring costly wholesale market borrowing.',
    notes: 'RBI closely monitors LDR. If deposits lag loan growth, the bank must curtail lending or offer higher deposit rates, impacting NIM.',
    applicableTo: 'bank',
  },
  {
    id: 'borrowings-deposits',
    name: 'Borrowings / Deposits (%)',
    abbr: 'Borrowings / Deposits',
    category: 'banking',
    formula: 'Borrowings / Deposits (%) = (Wholesale Borrowings ÷ Customer Deposits) × 100',
    meaning: 'Evaluates the bank’s reliance on volatile wholesale, interbank, and capital market borrowings compared to sticky, granular retail deposits.',
    benchmark: 'Healthy: Below 15% - 20%. Lower is safer as retail deposits are less prone to sudden liquidity flight.',
    notes: 'High dependence on wholesale borrowing increases vulnerability to sudden market interest rate hikes and liquidity crunches.',
    applicableTo: 'bank',
  },
  {
    id: 'nii-spread',
    name: 'NII Spread / Net Interest Margin',
    abbr: 'NII Spread / NIM',
    category: 'banking',
    formula: 'NII Spread (%) = ((Interest Earned − Interest Paid) ÷ Total Revenue or Avg Earning Assets) × 100',
    meaning: 'The core gross margin of a lending institution. Represents the markup earned on advances and investments over the cost of funds paid to depositors.',
    benchmark: 'Top retail private banks: 3.5% - 4.5%. Large PSU banks: 2.8% - 3.2%. NBFCs often operate at 5% - 9%.',
    notes: 'Compresses during rate hikes if deposit rates reprice faster than fixed-rate lending assets, or when CASA ratio declines.',
    applicableTo: 'bank',
  },
  {
    id: 'interest-ratio',
    name: 'Interest Ratio (%)',
    abbr: 'Interest Ratio',
    category: 'banking',
    formula: 'Interest Ratio (%) = (Interest Paid ÷ Interest Earned) × 100',
    meaning: 'The proportion of total interest income consumed by interest expenses owed to depositors and lenders.',
    benchmark: 'Healthy: 50% - 65%. Above 75% indicates elevated cost of funds or lower-yielding asset portfolio.',
    notes: 'An inverse indicator of gross interest margin. A lower ratio denotes superior pricing power and cheap CASA funding.',
    applicableTo: 'bank',
  },
  {
    id: 'interest-income-contrib',
    name: 'Interest Income Contribution (%)',
    abbr: 'Interest Income Part',
    category: 'banking',
    formula: 'Interest Income Contribution (%) = (Interest Earned ÷ Total Revenue) × 100',
    meaning: 'Share of total revenue derived directly from interest on loans and investments versus non-interest fee income.',
    benchmark: 'Typically 80% - 90% for standard commercial banks; remainder is treasury gains and fee income.',
    notes: 'Higher other income (processing fees, wealth management, insurance distribution) cushions profitability during sluggish credit cycles.',
    applicableTo: 'bank',
  },
  {
    id: 'casa-ratio',
    name: 'CASA Ratio (%)',
    abbr: 'CASA %',
    category: 'banking',
    formula: 'CASA (%) = ((Current Account Deposits + Savings Account Deposits) ÷ Total Deposits) × 100',
    meaning: 'The proportion of customer deposits held in zero-interest Current Accounts and low-interest Savings Accounts.',
    benchmark: 'Best-in-class Indian banks achieve 40% - 48%. Average commercial banks hover between 30% - 38%.',
    notes: 'Higher CASA dramatically lowers cost of deposits (CoD), providing a decisive structural margin advantage.',
    applicableTo: 'bank',
  },
  {
    id: 'gnpa-nnpa',
    name: 'Asset Quality (GNPA & NNPA %)',
    abbr: 'GNPA / NNPA',
    category: 'banking',
    formula: 'GNPA (%) = Gross Bad Loans ÷ Gross Advances × 100 | NNPA (%) = Net Bad Loans ÷ Net Advances × 100',
    meaning: 'Quantifies bad loans and credit default risk. GNPA reflects total defaulted loans; NNPA shows defaults remaining after dedicated provisioning.',
    benchmark: 'Tier-1 banks: GNPA < 2.0%, NNPA < 0.5%. PSU banks: GNPA 3% - 5%, NNPA < 1.0%.',
    notes: 'Divergence between GNPA and NNPA illustrates provisioning strength. High PCR (> 70%) ensures buffer against future write-offs.',
    applicableTo: 'bank',
  },
  {
    id: 'equity-total-assets',
    name: 'Equity / Total Assets (%)',
    abbr: 'Equity / Assets',
    category: 'banking',
    formula: 'Equity / Total Assets (%) = (Total Equity Capital ÷ Total Balance Sheet Assets) × 100',
    meaning: 'The ultimate solvency and capital adequacy cushion of a bank. Reflects how much asset loss can be absorbed before depositor funds are impaired.',
    benchmark: 'Healthy: 8% - 13%. Basel III mandates minimum regulatory Tier-1 capital ratios above 9% - 11.5%.',
    notes: 'Low ratios (< 6%) signify dangerously high balance-sheet leverage, leaving zero margin for loan portfolio shocks.',
    applicableTo: 'bank',
  },

  // Profitability & Margins (Corporate & Banking)
  {
    id: 'opm',
    name: 'Operating Profit Margin (OPM %)',
    abbr: 'OPM',
    category: 'margins',
    formula: 'OPM (%) = (Operating Profit / Operating Revenue) × 100',
    meaning: 'Operating efficiency and gross pricing power before depreciation, interest, and taxes.',
    benchmark: 'Asset-light IT: 22% - 28%. Specialty chemicals: 18% - 25%. FMCG: 18% - 24%. Infrastructure: 12% - 18%.',
    notes: 'A widening gap between OPM and NPM highlights burdensome interest obligations or steep asset depreciation.',
    applicableTo: 'all',
  },
  {
    id: 'npm',
    name: 'Net Profit Margin (NPM %)',
    abbr: 'NPM',
    category: 'margins',
    formula: 'NPM (%) = (Net Profit After Tax ÷ Total Revenue) × 100',
    meaning: 'The bottom-line residual percentage of every rupee of revenue converted into pure net profit for shareholders.',
    benchmark: 'High-margin software/consumer: 15% - 25%. Heavy manufacturing: 6% - 12%. Retail/distribution: 2% - 5%.',
    notes: 'Consistently higher NPM relative to industry peers demonstrates structural cost advantages or premium brand pricing.',
    applicableTo: 'all',
  },
  {
    id: 'gpm',
    name: 'Gross Profit Margin (GPM %)',
    abbr: 'GPM',
    category: 'margins',
    formula: 'GPM (%) = ((Sales − Raw Material Costs − Manufacturing Expenses) ÷ Sales) × 100',
    meaning: 'Pure product markup over direct manufacturing input costs, completely excluding overheads and SG&A.',
    benchmark: 'Consumer brands: 50% - 65%. Industrial manufacturing: 30% - 45%. Commodity processors: 15% - 25%.',
    notes: 'Automatically suppressed if raw material cost line is unstated or reported as pure gross billing.',
    applicableTo: 'nonbank',
  },

  // Returns & Capital Efficiency
  {
    id: 'roce',
    name: 'Return on Capital Employed (ROCE %)',
    abbr: 'ROCE',
    category: 'returns',
    formula: 'ROCE (%) = (EBIT ÷ Total Capital Employed) × 100 | Screener #ratios official integration',
    meaning: 'Evaluates the operating pre-tax profit generated per rupee of capital deployed across equity and debt.',
    benchmark: 'Elite compounders: > 20% - 25%+. Good businesses: 15% - 20%. Capital destroyers: < 10% (below WACC).',
    notes: 'Directly sourced from Screener official #ratios table or calculated via EBIT / Capital Employed. The single most reliable measure of capital allocation prowess.',
    applicableTo: 'all',
  },
  {
    id: 'roe',
    name: 'Return on Equity (ROE %)',
    abbr: 'ROE',
    category: 'returns',
    formula: 'ROE (%) = (Net Profit After Tax ÷ Average Shareholders’ Net Worth) × 100',
    meaning: 'The rate of return earned on shareholders’ capital. Determines the intrinsic compounding speed of book value per share.',
    benchmark: 'Outstanding: > 18% - 25% without excessive leverage. Good: 14% - 18%. Poor: < 10%.',
    notes: 'Can be artificially inflated by excessive debt leverage. Always cross-check with ROCE and DuPont leverage multiplier.',
    applicableTo: 'all',
  },
  {
    id: 'roa',
    name: 'Return on Assets (ROA %)',
    abbr: 'ROA',
    category: 'returns',
    formula: 'ROA (%) = (Net Profit After Tax ÷ Average Total Assets) × 100',
    meaning: 'Asset productivity indicator measuring net profit produced per unit of total balance-sheet assets.',
    benchmark: 'Banks: > 1.2% - 1.8% (world-class > 2.0%). Non-banks: > 8% - 15%.',
    notes: 'For banks, ROA is the bedrock metric because lending leverage (Assets/Equity) magnifies 1.5% ROA into a 15% ROE.',
    applicableTo: 'all',
  },
  {
    id: 'dupont',
    name: 'DuPont 3-Stage Decomposition',
    abbr: 'DuPont 3-Stage',
    category: 'returns',
    formula: 'ROE = Net Profit Margin (%) × Asset Turnover (×) × Financial Leverage (×)',
    meaning: 'Deconstructs ROE into its three drivers: Operational Profitability (NPM), Capital Velocity (Asset Turnover), and Financial Leverage (Assets/Equity).',
    benchmark: 'Sustainable compounders derive ROE from high margin and asset turnover rather than reckless debt leverage.',
    notes: 'Identifies whether rising ROE is fueled by genuine business excellence or dangerous balance-sheet expansion.',
    applicableTo: 'all',
  },

  // Solvency & Debt Coverage
  {
    id: 'debt-to-equity',
    name: 'Debt to Equity Ratio (D/E ×)',
    abbr: 'D/E',
    category: 'solvency',
    formula: 'Debt to Equity (×) = Total Borrowings ÷ Net Worth (Share Capital + Reserves)',
    meaning: 'Measures financial leverage and long-term solvency risk. Shows the proportion of debt financing relative to owners’ equity.',
    benchmark: 'Conservative: < 0.5x. Moderate: 0.5x - 1.0x. Highly leveraged: > 1.5x (excluding financial companies).',
    notes: 'Net cash or zero-debt balance sheets provide immense resilience during macroeconomic down-cycles and credit contractions.',
    applicableTo: 'nonbank',
  },
  {
    id: 'interest-coverage',
    name: 'Interest Coverage Ratio (ICR ×)',
    abbr: 'ICR',
    category: 'solvency',
    formula: 'ICR (×) = (Profit Before Tax + Interest Expense) ÷ Interest Expense',
    meaning: 'Determines how easily a company can pay interest on outstanding debt from operating earnings (EBIT).',
    benchmark: 'Comfortable: > 4.0x. Acceptable: 2.5x - 4.0x. Danger threshold: < 1.5x.',
    notes: 'Below 1.5x indicates high debt distress risk. An unexpected EBITDA contraction could trigger payment defaults or rating downgrades.',
    applicableTo: 'nonbank',
  },

  // Working Capital Cycle & Cash Flows (Screener.in Deeper Schedule Integration)
  {
    id: 'debtor-days',
    name: 'Debtor Days / Days Sales Outstanding (DSO)',
    abbr: 'Debtor Days',
    category: 'workingcap',
    formula: 'DSO (Days) = (Trade Receivables ÷ Annual Sales) × 365 | Screener #ratios official',
    meaning: 'The average number of days taken to collect cash payments from customers after invoice billing.',
    benchmark: 'Cash/Retail businesses: < 15 days. Industrial B2B: 45 - 75 days. Government/EPC utilities: 90 - 180+ days.',
    notes: 'Sourced from Screener official #ratios table or calculated via Trade Receivables / (Sales / 365). A spike signals customer credit strain or channel stuffing.',
    applicableTo: 'nonbank',
  },
  {
    id: 'creditor-days',
    name: 'Creditor Days / Days Payable Outstanding (DPO)',
    abbr: 'Creditor Days',
    category: 'workingcap',
    formula: 'DPO (Days) = (Trade Payables ÷ Annual Sales) × 365 | Screener #ratios & Schedule integration',
    meaning: 'The average number of days the company takes to settle trade obligations with its suppliers and vendors.',
    benchmark: 'Healthy: 45 - 90 days. Extended supplier credit provides non-interest working capital funding.',
    notes: 'Extracted directly from Screener official #ratios or expanded Balance Sheet schedule (Trade Payables) and Cash Flow schedule. When unavailable, preserved as null (—) without arbitrary assumptions.',
    applicableTo: 'nonbank',
  },
  {
    id: 'inventory-days',
    name: 'Inventory Days / Days Inventory Outstanding (DIO)',
    abbr: 'Inventory Days',
    category: 'workingcap',
    formula: 'DIO (Days) = (Inventories ÷ Annual Sales) × 365 | Screener #ratios official',
    meaning: 'The average number of days raw materials, work-in-progress, and finished goods sit in stock before being sold.',
    benchmark: 'FMCG: 20 - 45 days. Auto/Engineering: 50 - 80 days. Capital Goods/EPC: 90 - 150 days. Power utilities: 0 - 20 days.',
    notes: 'Sourced from Screener official #ratios table or Inventories / (Sales / 365). Rising DIO combined with falling sales points to inventory obsolescence risk.',
    applicableTo: 'nonbank',
  },
  {
    id: 'ccc',
    name: 'Cash Conversion Cycle (CCC Days)',
    abbr: 'CCC',
    category: 'workingcap',
    formula: 'CCC (Days) = Debtor Days + Inventory Days − Creditor Days | Screener #ratios official',
    meaning: 'The net number of days it takes for capital invested in raw materials and inventory to cycle back into operating cash from sales.',
    benchmark: 'Negative or near-zero is elite (e.g. FMCG/retail using negative working capital funded by suppliers). Standard: 30 - 75 days.',
    notes: 'Extracted directly from Screener official #ratios or calculated via Debtor Days + Inventory Days - Creditor Days. Expanding CCC drains operating cash flow.',
    applicableTo: 'nonbank',
  },
  {
    id: 'working-capital-days',
    name: 'Working Capital Days',
    abbr: 'WC Days',
    category: 'workingcap',
    formula: 'WC Days = (Working Capital ÷ Annual Sales) × 365 | Screener #ratios official',
    meaning: 'Quantifies the total days of annual revenue tied up in operational working capital assets.',
    benchmark: 'Negative or low (< 20 days) denotes elite working capital management. > 90 days indicates heavy capital drag.',
    notes: 'Sourced directly from Screener official #ratios table or calculated via Working Capital / (Sales / 365). Uses verified expanded Screener schedules.',
    applicableTo: 'nonbank',
  },
  {
    id: 'cfo-pat',
    name: 'CFO / PAT (Cash Flow Quality Ratio)',
    abbr: 'CFO / PAT',
    category: 'cashflow',
    formula: 'CFO / PAT (×) = Cash from Operating Activities (CFO) ÷ Net Profit After Tax (PAT)',
    meaning: 'The quintessential earnings quality check: measures how much of reported accounting P&L net profit actually converts into hard bank cash.',
    benchmark: 'High quality: > 0.85x - 1.1x over a multi-year cumulative period. Below 0.6x is a major red flag.',
    notes: 'Persistent divergence where PAT grows while CFO stagnates indicates aggressive revenue recognition or ballooning working capital.',
    applicableTo: 'all',
  },
  {
    id: 'fcf',
    name: 'Free Cash Flow (FCF ₹ Cr)',
    abbr: 'FCF',
    category: 'cashflow',
    formula: 'FCF = Cash from Operating Activities (CFO) − Capital Work-in-Progress / CapEx additions',
    meaning: 'The discretionary cash surplus generated by core operations after paying for all asset maintenance and growth capital investments.',
    benchmark: 'Consistently positive and growing FCF is the truest foundation for dividends, buybacks, and debt reduction.',
    notes: 'Companies with zero or negative FCF for decades are capital-destroying conveyor belts, regardless of reported net profit.',
    applicableTo: 'all',
  },

  // Valuation & Technical Glossary
  {
    id: 'pe',
    name: 'Price to Earnings Ratio (P/E ×)',
    abbr: 'P/E',
    category: 'glossary',
    formula: 'P/E (×) = Current Market Capitalization ÷ Trailing Twelve Months (TTM) Net Profit',
    meaning: 'Valuation multiple indicating how many rupees investors are willing to pay today for each rupee of annual earnings.',
    benchmark: 'Mature utilities/banks: 10x - 18x. Steady compounders: 25x - 45x. High-growth market leaders: 50x+.',
    notes: 'Low P/E can be a value trap if earnings are at cyclical peak or if capital allocation destroys shareholder value.',
    applicableTo: 'all',
  },
  {
    id: 'pb',
    name: 'Price to Book Ratio (P/B ×)',
    abbr: 'P/B',
    category: 'glossary',
    formula: 'P/B (×) = Current Market Capitalization ÷ Latest Net Worth (Equity + Reserves)',
    meaning: 'Valuation comparison between market value and net balance-sheet accounting equity. Indispensable for banks & NBFCs.',
    benchmark: 'Commercial banks: 1.2x to 3.0x. High-return asset-light leaders: > 8x - 15x.',
    notes: 'For banks, P/B is directly tied to ROE: a bank compounding book value at 18% ROE commands a 2.5x - 3.5x P/B premium.',
    applicableTo: 'all',
  },
  {
    id: '52w-range-dma',
    name: '52-Week Price Range & Moving Averages (50 DMA / 200 DMA)',
    abbr: '52W Range & DMAs',
    category: 'glossary',
    formula: 'Range = 52W Low to 52W High · CMP (Cyan ◆), 50 DMA (Amber ●), 200 DMA (Purple ▲) · Range % = 100 × (CMP − Low) / (High − Low)',
    meaning: 'Visualizes where the stock price is currently trading relative to its 1-year low and high boundaries, alongside the 50-day and 200-day simple moving averages to identify technical trend strength and key support/resistance levels.',
    benchmark: 'CMP > 50 DMA > 200 DMA indicates strong bullish momentum. CMP < 200 DMA indicates long-term consolidation or corrective phase.',
    notes: 'Displayed as an interactive horizontal track widget in the Peer Comparison section across both Bank and Non-Bank peer tables.',
    applicableTo: 'all',
  },
]

export const PLOT_DEFINITIONS: PlotDefinition[] = [
  // Corporate Non-Bank Annual Plots
  {
    id: 'annual-growth',
    title: 'Sales & Net Profit Growth',
    subtitle: 'Sales and Net profit YoY % bars',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Sales Growth YoY (%) · Net Profit Growth YoY (%)',
    dataSource: 'Screener P&L Statement (Annual Sales & Net Profit Disclosures)',
    meaning: 'Compares top-line revenue momentum against bottom-line net earnings expansion year over year.',
    interpretation: 'When profit growth consistently outpaces revenue growth, the company is enjoying positive operational leverage and expanding margins. If sales grow while profits collapse, cost inflation or pricing erosion is occurring.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-margins',
    title: 'Operating & Net Margins',
    subtitle: 'Operating & net profit margins · %',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Operating Profit Margin (OPM %) · Net Profit Margin (NPM %)',
    dataSource: 'P&L Statement (Operating Profit ÷ Sales & Net Profit ÷ Sales)',
    meaning: 'Tracks core manufacturing and business profitability margins across business cycles.',
    interpretation: 'Rising OPM reflects pricing power, raw material efficiency, and economies of scale. Wide gap between OPM and NPM highlights high borrowing costs or heavy depreciation.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-returns',
    title: 'Return on Capital',
    subtitle: 'ROCE, ROE and ROA · %',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Return on Capital Employed (ROCE %) · Return on Equity (ROE %) · Return on Assets (ROA %)',
    dataSource: 'Screener official #ratios table + Balance Sheet & P&L',
    meaning: 'The defining benchmark of capital efficiency: how effectively management generates operating and net profits from deployed capital.',
    interpretation: 'Companies maintaining ROCE > 20% over 5-10 years possess enduring economic moats. When ROE dramatically exceeds ROCE, high debt leverage is present.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-dupont',
    title: 'DuPont Analysis (3-Stage)',
    subtitle: 'Net margin, asset turnover & financial leverage',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Net Profit Margin (%) · Asset Turnover (×) · Financial Leverage (Assets/Equity ×)',
    dataSource: 'Comprehensive multi-statement DuPont model',
    meaning: 'Dissects ROE into its three foundational pillars: margin quality, asset velocity, and capital structure leverage.',
    interpretation: 'Identifies whether rising ROE is powered by healthy business fundamentals (higher margin / turnover) or risky balance-sheet borrowing.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-debt',
    title: 'Debt & Solvency',
    subtitle: 'Total borrowings · ₹ crore; debt / equity & interest coverage ratio lines',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Borrowings (₹ Cr) · Debt / Equity (×) · Interest Coverage Ratio (×)',
    dataSource: 'Balance Sheet Borrowings & P&L EBIT / Interest schedules',
    meaning: 'Evaluates balance sheet leverage and debt service coverage safety.',
    interpretation: 'Healthy businesses exhibit declining D/E (< 0.5x) and comfortable ICR (> 4.0x). A debt spike with falling ICR signals solvency vulnerability.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-liquidity',
    title: 'Working Capital & Liquidity',
    subtitle: 'Current, quick and cash ratios · ratio (×)',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Current Ratio (×) · Quick Ratio (×) · Cash Ratio (×)',
    dataSource: 'Balance Sheet assets, liabilities & cash equivalents',
    meaning: 'Assesses short-term liquidity buffer against immediate operational liabilities.',
    interpretation: 'Current ratio between 1.33x and 2.0x is ideal. Quick ratio > 1.0x ensures liquidity without relying on forced inventory liquidation.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-eps-dividend',
    title: 'EPS, Dividend per Share & Payout',
    subtitle: 'EPS & dividend per share in ₹; payout ratio · %',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Earnings Per Share (₹) · Dividend Per Share (₹) · Dividend Payout (%)',
    dataSource: 'P&L Net Profit, share count & Cash Flow dividend distributions',
    meaning: 'Measures shareholder cash return policy and per-share compounding.',
    interpretation: 'Steady growth in EPS accompanied by sustainable dividend payouts (20%-40%) signifies disciplined capital allocation.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-cash-flow-activities',
    title: 'Cash Flow Activities',
    subtitle: 'Operating, investing, financing and net cash flow · ₹ crore',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Cash from Operating (CFO ₹ Cr) · Cash from Investing (CFI ₹ Cr) · Cash from Financing (CFF ₹ Cr) · Net Cash Flow (₹ Cr)',
    dataSource: 'Cash Flow Statement top-level activity lines',
    meaning: 'Visualizes the complete macro cash generation and allocation cycle of the business.',
    interpretation: 'The classic hallmark of high-quality compounders is robust positive CFO funding negative CFI (productive CapEx) and negative CFF (dividends & debt repayment).',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-cash-profit',
    title: 'Profit & Cash Generation',
    subtitle: 'Operating profit, OCF, FCF & net profit · ₹ crore',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Operating Profit (₹ Cr) · Operating Cash Flow (₹ Cr) · Free Cash Flow (₹ Cr) · Net Profit (₹ Cr)',
    dataSource: 'P&L Operating Profit, Net Profit & Cash Flow CFO / FCF additions',
    meaning: 'The definitive earnings reality check: compares accounting accrual profits against actual cash collected.',
    interpretation: 'Healthy companies produce CFO equal to or exceeding Net Profit. If Net Profit grows while CFO and FCF lag or turn negative, working capital is trapping earnings.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-sales-wc-cfo',
    title: 'Sales vs Working Capital vs Cash from Operation',
    subtitle: 'Sales, working capital changes & cash from operations · ₹ crore',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Sales (₹ Cr) · Working Capital Changes / Balance (₹ Cr) · Cash from Operation (₹ Cr)',
    dataSource: 'Screener.in Expanded Cash from Operating Activity schedule (+ button) & P&L',
    meaning: 'Directly illustrates how working capital movements absorb or liberate operating cash during top-line revenue expansion.',
    interpretation: 'When sales expand with stable or negative working capital changes, the company enjoys negative working capital (suppliers fund growth). If working capital changes consume massive cash, growth is capital-hungry.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-cfo-wc-breakdown',
    title: 'Cash from Operation vs Receivables vs Inventory vs Payables',
    subtitle: 'CFO, receivables, inventory & payables breakdown · ₹ crore',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Cash from Operation (₹ Cr) · Receivables (₹ Cr) · Inventory (₹ Cr) · Payables (₹ Cr)',
    dataSource: 'Screener.in Detailed Cash Flow Schedules (expanded behind "+" button on Cash from Operating Activity)',
    meaning: 'Root-cause diagnostic isolating the individual working capital line items that drive or impair operating cash flows.',
    interpretation: 'Shows exactly why CFO surged or contracted in any given fiscal year—whether driven by customer collections (Receivables), stock management (Inventory), or supplier credit (Payables).',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-working-capital',
    title: 'Sales, Receivables & Inventory',
    subtitle: 'Sales, receivables & inventory in ₹ crore',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Sales (₹ Cr) · Receivables (₹ Cr) · Inventory (₹ Cr)',
    dataSource: 'Balance Sheet Other Assets schedules & P&L Sales',
    meaning: 'Evaluates working capital assets relative to overall revenue scale.',
    interpretation: 'Receivables growing faster than sales indicates customer payment delays or aggressive revenue booking. Rapidly mounting inventory signals slowdown in demand.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-net-block',
    title: 'Net Block & CWIP / Net Block',
    subtitle: 'Net block · ₹ crore; CWIP / net block · %',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Net Block (₹ Cr) · CWIP / Net Block (%)',
    dataSource: 'Balance Sheet Fixed Assets & Capital Work in Progress schedules',
    meaning: 'Tracks fixed productive asset expansion and ongoing capital expenditure projects.',
    interpretation: 'Elevated CWIP / Net Block (> 30%-50%) indicates major capacity expansion under construction. When CWIP capitalizes into Net Block, revenue should surge.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'annual-cwip',
    title: 'Capital Work in Progress',
    subtitle: 'CWIP in ₹ crore',
    category: 'annual-corporate',
    applicableTo: 'nonbank',
    metrics: 'Capital Work in Progress (CWIP ₹ Cr)',
    dataSource: 'Balance Sheet Capital Work in Progress',
    meaning: 'Monitors uncommissioned plant, machinery, and facility construction projects.',
    interpretation: 'Chronically high CWIP without capitalization indicates project execution delays, cost overruns, or impaired capital assets.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },

  // Corporate Non-Bank Quarterly Plots
  {
    id: 'quarter-sales-opm',
    title: 'Sales & OPM (Quarterly)',
    subtitle: 'Quarterly sales · ₹ crore; OPM · %',
    category: 'quarterly-corporate',
    applicableTo: 'nonbank',
    metrics: 'Quarterly Sales (₹ Cr) · Operating Profit Margin (OPM %)',
    dataSource: 'Screener Quarterly Financial Results',
    meaning: 'High-frequency quarterly trend analysis tracking revenue seasonality and quarterly margin resilience.',
    interpretation: 'Uncovers seasonal demand spikes (e.g. Q3 festival season, Q4 closing) and sudden quarterly margin compressions caused by raw material surges.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'quarter-profit-npm',
    title: 'Operating Profit, Net Profit & NPM (Quarterly)',
    subtitle: 'Quarterly profits · ₹ crore; NPM · %',
    category: 'quarterly-corporate',
    applicableTo: 'nonbank',
    metrics: 'Operating Profit (₹ Cr) · Net Profit (₹ Cr) · Net Profit Margin (NPM %)',
    dataSource: 'Screener Quarterly Disclosures',
    meaning: 'Evaluates bottom-line net profit delivery across recent sequential quarters.',
    interpretation: 'Identifies sudden quarterly tax or interest hits that depress net margins despite stable operating earnings.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'quarter-cost-structure',
    title: 'Cost Structure Breakdown (Quarterly)',
    subtitle: 'Cost metrics as % of sales',
    category: 'quarterly-corporate',
    applicableTo: 'nonbank',
    metrics: 'Material Cost % of Sales · Employee Cost % of Sales · Other Expenses % of Sales',
    dataSource: 'Quarterly Disclosures Cost Breakdown',
    meaning: 'Breaks down the operational cost anatomy into raw materials, labor, and overheads.',
    interpretation: 'Shows whether margin expansion is driven by cheaper raw materials, employee productivity gains, or fixed overhead absorption.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },

  // Banking (BFSI) Annual Plots
  {
    id: 'bank-revenue-expenses',
    title: 'Total Revenue & Total Expense',
    subtitle: '₹ crore · Total Revenue = Interest Earned + Other Income; Total Expense = Operating + Provisions + Interest Paid',
    category: 'annual-bank',
    applicableTo: 'bank',
    metrics: 'Total Revenue (₹ Cr) · Total Expense (₹ Cr) · Operating Profit Margin (OPM %)',
    dataSource: 'Banking P&L Disclosures (Form B)',
    meaning: 'Comprehensive banking revenue vs total overheads, funding costs, and provisioning expenses.',
    interpretation: 'Healthy banks generate wide jaws between total revenue and operating expenses, driving strong operating profit before loan-loss provisions.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-interest',
    title: 'Interest Earned & Interest Paid',
    subtitle: '₹ crore · Interest Gap = Net Interest Income (NII)',
    category: 'annual-bank',
    applicableTo: 'bank',
    metrics: 'Interest Earned (₹ Cr) · Interest Paid (₹ Cr) · Interest Gap / NII (₹ Cr)',
    dataSource: 'Banking P&L Interest Schedules',
    meaning: 'The foundational revenue engine of a financial institution: interest earned on advances/treasury minus interest paid on deposits/borrowings.',
    interpretation: 'A widening Interest Gap reflects expanding Net Interest Margin (NIM) and superior low-cost CASA deposit funding.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-returns',
    title: 'Return on Equity (ROE) & Return on Assets (ROA)',
    subtitle: 'ROE and ROA columns share scale; ROA overlaid as right-axis line',
    category: 'annual-bank',
    applicableTo: 'bank',
    metrics: 'ROE (%) · ROA (%) · ROA Overlay Line (%)',
    dataSource: 'Banking Financial Ratios & Balance Sheet Schedules',
    meaning: 'Core profitability benchmark for commercial banking operations.',
    interpretation: 'Elite commercial banks sustain ROA > 1.5% - 2.0% and ROE > 15% - 18% with pristine credit quality and high capital buffers.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-ldr',
    title: 'Loan-to-Deposit Ratio (LDR %) [Credit-to-Deposit Ratio]',
    subtitle: 'Loans & Advances, Deposits (₹ crore left axis); LDR % (right axis line)',
    category: 'annual-bank',
    applicableTo: 'bank',
    metrics: 'Loans & Advances (₹ Cr) · Customer Deposits (₹ Cr) · LDR (%)',
    dataSource: 'Banking Balance Sheet Form A (Advances & Deposits schedules)',
    meaning: 'Monitors the proportion of customer deposits deployed into commercial lending.',
    interpretation: 'Healthy LDR is 70%-80%. Ratios above 85% indicate aggressive loan expansion requiring high-cost market borrowings.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-borrowings-deposits',
    title: 'Borrowings / Deposits (%)',
    subtitle: 'Wholesale Borrowings & Deposits (₹ Cr left); Ratio % (right axis)',
    category: 'annual-bank',
    applicableTo: 'bank',
    metrics: 'Borrowings (₹ Cr) · Customer Deposits (₹ Cr) · Borrowings / Deposits (%)',
    dataSource: 'Balance Sheet Schedule 4 (Borrowings) & Schedule 3 (Deposits)',
    meaning: 'Measures reliance on wholesale interbank borrowing versus retail customer deposits.',
    interpretation: 'Lower is safer (< 15%-20%). Heavy wholesale borrowing exposes the bank to volatile money-market rate hikes.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-equity-assets',
    title: 'Equity / Total Assets (%)',
    subtitle: 'Equity Capital & Total Assets (₹ Cr left); Equity / Total Assets % (right axis)',
    category: 'annual-bank',
    applicableTo: 'bank',
    metrics: 'Equity Capital (₹ Cr) · Total Assets (₹ Cr) · Equity / Total Assets (%)',
    dataSource: 'Balance Sheet Capital & Total Assets Disclosures',
    meaning: 'Capital adequacy cushion protecting depositors against bad loan write-offs.',
    interpretation: 'Healthy banks operate with Equity/Assets of 8%-13%, providing solid buffers against macroeconomic downturns.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },

  // Banking (BFSI) Quarterly Plots
  {
    id: 'bank-quarter-interest-gap',
    title: 'Interest Earned & Interest Paid (Quarterly)',
    subtitle: '₹ crore · Interest Ratio = Interest Paid ÷ Interest Earned (%)',
    category: 'quarterly-bank',
    applicableTo: 'bank',
    metrics: 'Quarterly Interest Earned (₹ Cr) · Interest Paid (₹ Cr) · Interest Ratio (%)',
    dataSource: 'Quarterly Financial Results for Banks',
    meaning: 'Quarterly interest spread tracking cost of funds versus lending yield.',
    interpretation: 'Falling interest ratio demonstrates expanding NIM and strong quarterly asset repricing.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-quarter-income',
    title: 'Interest Earned & Other Income (Quarterly)',
    subtitle: '₹ crore · Interest Income Contribution %',
    category: 'quarterly-bank',
    applicableTo: 'bank',
    metrics: 'Interest Earned (₹ Cr) · Other Income (₹ Cr) · Interest Income Contribution (%)',
    dataSource: 'Quarterly Banking Statements',
    meaning: 'Reveals the quarterly contribution of core interest income versus fee/treasury other income.',
    interpretation: 'Healthy banks generate 15%-25% non-interest income from recurring fees (cards, wealth, FX) rather than volatile bond trading gains.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
  {
    id: 'bank-quarter-revenue-expense',
    title: 'Total Revenue & Total Expense (Quarterly)',
    subtitle: 'Quarterly total revenue, total expense & OPM %',
    category: 'quarterly-bank',
    applicableTo: 'bank',
    metrics: 'Total Revenue (₹ Cr) · Total Expense (₹ Cr) · Operating Profit Margin (%)',
    dataSource: 'Quarterly Banking Statements',
    meaning: 'High-frequency quarterly operating profitability and cost-to-income tracking.',
    interpretation: 'Consistently wide margins across all four quarters reflect robust risk-adjusted profitability.',
    interactiveControls: 'X-axis period slider · Y-axis scale zoom (0-1000) · Mouse drag range selection · Reset button',
  },
]

export function DataChecksView({ data }: { data: FinancialData }) {
  const [activeTab, setActiveTab] = useState<'ratios' | 'plots'>('ratios')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const isBank = data.mode === 'bank'

  // Filter ratio definitions
  const filteredRatios = useMemo(() => {
    return RATIO_DEFINITIONS.filter(item => {
      if (item.applicableTo === 'bank' && !isBank) return false
      if (item.applicableTo === 'nonbank' && isBank) return false
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.name.toLowerCase().includes(q)
        const matchAbbr = item.abbr.toLowerCase().includes(q)
        const matchFormula = item.formula.toLowerCase().includes(q)
        const matchMeaning = item.meaning.toLowerCase().includes(q)
        const matchNotes = item.notes.toLowerCase().includes(q)
        const matchBenchmark = item.benchmark.toLowerCase().includes(q)
        return matchName || matchAbbr || matchFormula || matchMeaning || matchNotes || matchBenchmark
      }
      return true
    })
  }, [isBank, selectedCategory, searchQuery])

  // Filter plot definitions
  const filteredPlots = useMemo(() => {
    return PLOT_DEFINITIONS.filter(item => {
      if (item.applicableTo === 'bank' && !isBank) return false
      if (item.applicableTo === 'nonbank' && isBank) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchSub = item.subtitle.toLowerCase().includes(q)
        const matchMetrics = item.metrics.toLowerCase().includes(q)
        const matchSource = item.dataSource.toLowerCase().includes(q)
        const matchMeaning = item.meaning.toLowerCase().includes(q)
        const matchInterp = item.interpretation.toLowerCase().includes(q)
        return matchTitle || matchSub || matchMetrics || matchSource || matchMeaning || matchInterp
      }
      return true
    })
  }, [isBank, searchQuery])

  // Count by category for filter pills
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    RATIO_DEFINITIONS.forEach(item => {
      if (item.applicableTo === 'bank' && !isBank) return
      if (item.applicableTo === 'nonbank' && isBank) return
      counts.all = (counts.all || 0) + 1
      counts[item.category] = (counts[item.category] || 0) + 1
    })
    return counts
  }, [isBank])

  const categories = [
    { key: 'all', label: 'All Ratios' },
    ...(isBank ? [{ key: 'banking', label: 'Banking & Credit (BFSI)' }] : []),
    { key: 'margins', label: 'Margins & Spreads' },
    { key: 'returns', label: 'Returns & Capital' },
    { key: 'liquidity', label: 'Liquidity & Solvency' },
    ...(!isBank ? [{ key: 'workingcap', label: 'Working Capital & CCC' }] : []),
    { key: 'cashflow', label: 'Cash Flow & Quality' },
    { key: 'glossary', label: 'Glossary & Valuation' },
  ]

  const warningCount = data.warnings.length + (data.missingMetrics?.length || 0)
  const totalRatiosCount = RATIO_DEFINITIONS.filter(r => (r.applicableTo === 'bank' ? isBank : !isBank || r.applicableTo === 'all')).length
  const totalPlotsCount = PLOT_DEFINITIONS.filter(p => (p.applicableTo === 'bank' ? isBank : !isBank || p.applicableTo === 'all')).length

  return (
    <div className="checks-page-container">
      {/* 1. HERO TOP BANNER */}
      <header className="checks-hero-banner">
        <div className="checks-hero-left">
          <div className="checks-icon-orb">
            <ShieldCheck size={26} />
          </div>
          <div>
            <div className="checks-hero-kicker">FINANCIAL AUDIT & METRICS DIRECTORY</div>
            <h1 className="checks-hero-title">Data Checks, Ratio Formulas & Plot Directory</h1>
            <p className="checks-hero-subtitle">
              Exhaustive compendium of all financial ratios, mathematical formulas, Screener.in deeper schedules integration,
              benchmarks, and comprehensive explanations for every interactive chart and plot in this project.
            </p>
          </div>
        </div>
        <div>
          <span className={`checks-status-pill ${warningCount > 0 ? 'attention' : 'ready'}`}>
            {warningCount > 0 ? (
              <>
                <AlertTriangle size={15} /> {warningCount} DATA NOTES
              </>
            ) : (
              <>
                <CheckCircle2 size={15} /> ALL INPUTS VERIFIED
              </>
            )}
          </span>
        </div>
      </header>

      {/* 2. SOURCE COVERAGE & VERIFICATION METRICS */}
      <section className="checks-meta-grid" aria-label="Workbook verification">
        <div className="checks-info-card">
          <h3>
            <BookOpen size={17} style={{ color: '#38bdf8' }} /> Source Coverage & Metadata
          </h3>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Company Name</span>
            <span className="checks-kv-value">{data.companyName}</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Reporting Classification</span>
            <span className="checks-kv-value">{isBank ? 'Bank / BFSI Institution' : 'Corporate Non-Bank'}</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Annual Periods Verified</span>
            <span className="checks-kv-value">
              {data.annual[0]?.period ?? '—'} to {data.annual.at(-1)?.period ?? '—'} ({data.annual.length} Periods)
            </span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Quarterly Disclosures</span>
            <span className="checks-kv-value">{data.quarterly.length} Quarters · TTM Included</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Screener.in Integration</span>
            <span className="checks-kv-value" style={{ color: '#34d399', fontWeight: 700 }}>
              Official #ratios + Deeper Cash Flow & BS Schedules
            </span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Source Document</span>
            <span className="checks-kv-value" style={{ fontSize: '12px' }}>{data.sourceFileName}</span>
          </div>
        </div>

        <div className="checks-info-card">
          <h3>
            <AlertTriangle size={17} style={{ color: warningCount > 0 ? '#f59e0b' : '#10b981' }} />
            Data Quality & Screener.in Schedules
          </h3>
          {warningCount > 0 ? (
            <ul className="checks-warning-list">
              {[...data.warnings, ...(data.missingMetrics || [])].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="checks-ready-notice">
              <CheckCircle2 size={16} /> All core mathematical schedules, P&L statements, Balance Sheet rows, and Screener.in schedule endpoints match verified criteria.
            </p>
          )}
          <div className="ratio-note-box" style={{ marginTop: '14px' }}>
            <strong>Deeper Schedules Rule:</strong> For working capital, payables, and receivables, the engine extracts exact schedule lines from Screener.in (behind the `+` buttons) and official #ratios table (`Debtor Days`, `Days Payable`, `CCC`, `Working Capital Days`, `ROCE %`). Unstated values stay strictly null (`—`) without artificial assumptions.
          </div>
        </div>
      </section>

      {/* 3. MAIN SECTION TABS: RATIOS VS PLOTS */}
      <section className="checks-tabs-container">
        <div className="checks-main-tabs">
          <button
            type="button"
            className={`checks-main-tab-btn ${activeTab === 'ratios' ? 'active' : ''}`}
            onClick={() => setActiveTab('ratios')}
          >
            <Calculator size={18} />
            <span>Financial Ratios & Formulas</span>
            <span className="checks-tab-badge">{totalRatiosCount}</span>
          </button>
          <button
            type="button"
            className={`checks-main-tab-btn ${activeTab === 'plots' ? 'active' : ''}`}
            onClick={() => setActiveTab('plots')}
          >
            <BarChart3 size={18} />
            <span>Visual Plots & Chart Directory</span>
            <span className="checks-tab-badge">{totalPlotsCount}</span>
          </button>
        </div>
      </section>

      {/* 4. SEARCH & FILTER TOOLBAR */}
      <section className="checks-toolbar" aria-label="Search and filter">
        <div className="checks-search-box">
          <Search size={18} className="checks-search-icon" />
          <input
            type="text"
            className="checks-search-input"
            placeholder={
              activeTab === 'ratios'
                ? 'Search ratio, formula, abbreviation, benchmark or keyword (e.g. Creditor Days, ROCE, NIM, CCC, LDR)...'
                : 'Search plot title, metrics, data source, or interpretation (e.g. Cash flow, Working capital, Dupont)...'
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="checks-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>

        {activeTab === 'ratios' && (
          <div className="checks-filter-row">
            <SlidersHorizontal size={15} style={{ color: '#64748b', marginRight: '4px' }} />
            {categories.map(cat => (
              <button
                key={cat.key}
                className={`checks-filter-btn ${selectedCategory === cat.key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {cat.label}
                <span className="checks-count-chip">{categoryCounts[cat.key] || 0}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 5. CONTENT GRID */}
      {activeTab === 'ratios' ? (
        <>
          <div className="checks-grid-section-title">
            <h3>
              <Calculator size={19} style={{ color: '#38bdf8' }} />
              Financial Metrics & Ratio Compendium
            </h3>
            <span className="checks-results-meta">
              Showing {filteredRatios.length} of {totalRatiosCount} ratios
            </span>
          </div>

          {filteredRatios.length > 0 ? (
            <div className="checks-compendium-grid">
              {filteredRatios.map(item => (
                <article key={item.id} className="ratio-card">
                  <div className="ratio-card-top">
                    <div className="ratio-card-title-group">
                      <span className="ratio-card-abbr">{item.abbr}</span>
                      <h4 className="ratio-card-name">{item.name}</h4>
                    </div>
                    <span className={`ratio-cat-badge badge-${item.category}`}>
                      {item.category.toUpperCase()}
                    </span>
                  </div>

                  <div className="ratio-formula-box">
                    <div className="ratio-formula-label">MATHEMATICAL FORMULA & SOURCING</div>
                    <div className="ratio-formula-text">{item.formula}</div>
                  </div>

                  <p className="ratio-details-content">{item.meaning}</p>

                  <div className="ratio-benchmark-strip">
                    <span className="benchmark-tag">BENCHMARK:</span>
                    <span className="benchmark-value">{item.benchmark}</span>
                  </div>

                  <div className="ratio-note-box">
                    <strong>Analyst Note:</strong> {item.notes}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="checks-empty-state">
              <CircleHelp size={40} style={{ color: '#64748b', margin: '0 auto' }} />
              <h4>No matching ratios found</h4>
              <p>Try searching for a different keyword or select "All Ratios" in the category filter.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="checks-grid-section-title">
            <h3>
              <BarChart3 size={19} style={{ color: '#38bdf8' }} />
              Visual Analytics & Interactive Plot Directory
            </h3>
            <span className="checks-results-meta">
              Showing {filteredPlots.length} of {totalPlotsCount} plots
            </span>
          </div>

          {filteredPlots.length > 0 ? (
            <div className="checks-compendium-grid">
              {filteredPlots.map(plot => (
                <article key={plot.id} className="plot-guide-card">
                  <div className="plot-card-top">
                    <div className="plot-card-title-group">
                      <span className="plot-card-cat-pill">
                        {plot.category.includes('quarterly') ? 'QUARTERLY' : 'YEARLY'}
                      </span>
                      <h4 className="plot-card-title">{plot.title}</h4>
                      <p className="plot-card-subtitle">{plot.subtitle}</p>
                    </div>
                  </div>

                  <div className="plot-metrics-box">
                    <div className="plot-meta-label">METRICS & VISUAL SERIES</div>
                    <div className="plot-metrics-tags">
                      {plot.metrics.split('·').map((m, idx) => (
                        <span key={idx} className="plot-metric-chip">
                          {m.trim()}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="plot-source-box">
                    <span className="plot-source-label">DATA SOURCING:</span>
                    <span className="plot-source-value">{plot.dataSource}</span>
                  </div>

                  <div className="plot-details-section">
                    <p className="plot-meaning-text">{plot.meaning}</p>
                    <div className="plot-interp-box">
                      <strong>How to Interpret:</strong> {plot.interpretation}
                    </div>
                  </div>

                  <div className="plot-controls-footer">
                    <Sparkles size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                    <span><strong>Interactive Controls:</strong> {plot.interactiveControls}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="checks-empty-state">
              <CircleHelp size={40} style={{ color: '#64748b', margin: '0 auto' }} />
              <h4>No matching charts or plots found</h4>
              <p>Try searching for a different keyword or check the spelling.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
