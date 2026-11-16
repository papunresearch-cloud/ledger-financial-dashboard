import {
  AlertTriangle,
  Building2,
  Calculator,
  Check,
  Clock,
  Coins,
  Landmark,
  PieChart,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { FinancialData } from './types'

interface FormulaItem {
  name: string
  formula: string
  description: string
  benchmark?: string
}

interface FormulaCategory {
  title: string
  icon: typeof Calculator
  color: string
  items: FormulaItem[]
}

const NON_BANK_CATEGORIES: FormulaCategory[] = [
  {
    title: 'Corporate Growth & Top-Line Momentum (Quarterly & Yearly)',
    icon: TrendingUp,
    color: '#0f766e',
    items: [
      {
        name: 'Sales YoY Growth (%)',
        formula: 'YoY Growth = [ (Sales_t − Sales_{t-1}) / |Sales_{t-1}| ] × 100',
        description: 'Annual or quarterly top-line revenue expansion. For quarterly tables, compares Q(t) vs Q(t-4); TTM compares trailing 4 quarters against prior 4 quarters.',
        benchmark: 'Consistent double-digit growth (>12%–15% YoY) indicates healthy market share expansion.',
      },
      {
        name: 'Sales QoQ Growth (%)',
        formula: 'QoQ Growth = [ (Sales_Q(t) − Sales_Q(t-1)) / |Sales_Q(t-1)| ] × 100',
        description: 'Sequential quarter-on-quarter revenue momentum capturing immediate operational demand velocity.',
      },
      {
        name: 'Operating Profit YoY Growth (%)',
        formula: 'Operating Profit Growth = [ (Operating Profit_Q(t) − Operating Profit_Q(t-4)) / |Operating Profit_Q(t-4)| ] × 100',
        description: 'Year-over-year expansion in core operational cash generation before interest, tax, and depreciation.',
      },
      {
        name: 'Net Profit YoY Growth (%)',
        formula: 'Net Profit Growth = [ (Net Profit_t − Net Profit_{t-1}) / |Net Profit_{t-1}| ] × 100',
        description: 'Annual bottom-line profit after tax (PAT) expansion attributable to equity shareholders.',
        benchmark: 'Sustainable PAT growth > 15%–20% drives long-term shareholder value creation.',
      },
      {
        name: 'Net Profit QoQ Growth (%)',
        formula: 'Net Profit QoQ = [ (Net Profit_Q(t) − Net Profit_Q(t-1)) / |Net Profit_Q(t-1)| ] × 100',
        description: 'Sequential quarterly net income trend, capturing short-term margin fluctuations or exceptional items.',
      },
    ],
  },
  {
    title: 'Profitability & Core Return Ratios',
    icon: TrendingUp,
    color: '#0f766e',
    items: [
      {
        name: 'Return on Equity (ROE)',
        formula: 'ROE = (Net Profit after Tax / Average Shareholders\' Equity) × 100',
        description: 'Measures net earnings generated per rupee of invested shareholder capital. Average equity is the arithmetic mean of opening and closing equity (Share Capital + Reserves).',
        benchmark: 'Sustained ROE > 15–20% indicates strong economic moat and pricing power.',
      },
      {
        name: 'Return on Assets (ROA)',
        formula: 'ROA = (Net Profit after Tax / Average Total Assets) × 100',
        description: 'Evaluates bottom-line asset productivity regardless of financial structure. Average total assets uses opening and closing balance sheet endpoints.',
        benchmark: 'Capital-efficient non-financial businesses typically deliver ROA > 8–10%.',
      },
      {
        name: 'Return on Capital Employed (ROCE)',
        formula: 'ROCE = [ (Profit Before Tax + Interest Expense) / Average Capital Employed ] × 100',
        description: 'Core operational performance metric measuring pre-interest operating yield on total long-term capital (Shareholders\' Equity + Long-Term & Short-Term Borrowings).',
        benchmark: 'High-quality compounding businesses target ROCE > 18–20%.',
      },
      {
        name: 'Operating Profit Margin (OPM %)',
        formula: 'OPM = (Operating Profit [EBITDA] / Revenue from Operations) × 100',
        description: 'Measures operational profitability before depreciation, financing costs, and income taxes.',
        benchmark: 'Higher and expanding margins indicate superior industry pricing power.',
      },
      {
        name: 'Net Profit Margin (NPM %)',
        formula: 'NPM = (Net Profit after Tax / Revenue from Operations) × 100',
        description: 'The final bottom-line conversion percentage of top-line revenue that flows directly to shareholders.',
      },
      {
        name: 'Gross Profit Margin (GPM %)',
        formula: 'GPM = [ (Sales − Raw Material Costs − Inventory Adjustments) / Sales ] × 100',
        description: 'First-stage markup over direct manufacturing materials and inventory changes.',
      },
      {
        name: 'Pre-Tax Margin (PBT %)',
        formula: 'PBT Margin = (Profit Before Tax / Revenue from Operations) × 100',
        description: 'Measures operational profitability before income taxes after meeting operating expenses, depreciation write-offs, and financing charges.',
        benchmark: 'High margins indicate resilience against raw material cost shocks and debt servicing costs.',
      },
      {
        name: 'Other Income vs Total Income (%)',
        formula: 'Other Income Share = [ Other Income / (Sales + Other Income) ] × 100',
        description: 'Proportion of aggregate corporate income derived from non-core operations (treasury yields, interest on deposits, asset sales, dividends).',
        benchmark: 'High-quality operating businesses keep other income < 10%–15% of total income to ensure earnings are driven by core operations.',
      },
      {
        name: 'Other Income / PBT (%)',
        formula: 'Other Income / PBT = (Other Income / Profit Before Tax) × 100',
        description: 'Tests the sensitivity of pre-tax accounting profits to non-operating other income sources.',
        benchmark: 'Ratios > 25% indicate that a substantial chunk of reported profits depends on non-operating treasury or exceptional returns.',
      },
    ],
  },
  {
    title: 'DuPont 3-Stage ROE Decomposition',
    icon: PieChart,
    color: '#1d4ed8',
    items: [
      {
        name: 'Master DuPont Identity',
        formula: 'ROE = Net Profit Margin (NPM) × Asset Turnover (ATO) × Equity Multiplier (EM)',
        description: 'Breaks down return on equity into three independent operational and structural drivers: profitability, volume efficiency, and balance sheet gearing.',
      },
      {
        name: 'Stage 1: Net Profit Margin (NPM)',
        formula: 'NPM = Net Profit after Tax / Revenue from Operations',
        description: 'Driver of operational pricing strength, cost discipline, and effective tax rates.',
      },
      {
        name: 'Stage 2: Total Asset Turnover (ATO)',
        formula: 'ATO = Revenue from Operations / Average Total Assets',
        description: 'Measures volume velocity and revenue generated per unit of total asset base.',
      },
      {
        name: 'Stage 3: Equity Multiplier (EM)',
        formula: 'EM = Average Total Assets / Average Shareholders\' Equity = 1 + (Total Debt / Equity)',
        description: 'Measures financial leverage gearing. An elevated EM increases ROE but elevates insolvency volatility.',
      },
    ],
  },
  {
    title: 'Cash Flow & Earnings Quality Analysis',
    icon: Coins,
    color: '#047857',
    items: [
      {
        name: 'Free Cash Flow (FCF)',
        formula: 'FCF = Cash Flow from Operations (CFO) − Net CapEx (Additions to Fixed Assets & CWIP)',
        description: 'True surplus cash generated by core operations after maintaining and expanding the productive physical asset base.',
        benchmark: 'Consistently positive FCF funds debt reduction, acquisitions, and dividends without diluting equity.',
      },
      {
        name: 'CFO to Sales % (CFO / Sales %)',
        formula: 'CFO / Sales = (Cash Flow from Operations / Revenue from Operations) × 100',
        description: 'Measures the proportion of top-line operational revenue converted directly into liquid operating cash.',
        benchmark: 'Higher percentages reflect superior cash-generative power on revenue scale.',
      },
      {
        name: 'Cash Conversion Ratio (CFO / Operating Profit %)',
        formula: 'Cash Conversion = (Cash Flow from Operations / Operating Profit [EBITDA]) × 100',
        description: 'Measures the proportion of accounting operating profit converted into hard operating cash.',
        benchmark: 'Healthy business models convert > 80% of EBITDA into CFO. Ratios below 60% indicate aggressive accounting.',
      },
      {
        name: 'Cash Realization Ratio (CFO / Net Profit %)',
        formula: 'Cash Realization = (Cash Flow from Operations / Net Profit after Tax) × 100',
        description: 'Tests whether reported accounting earnings are mirrored in cash collections or trapped in working capital.',
        benchmark: 'Over multi-year cycles, cumulative CFO / PAT should ideally equal or exceed 100%.',
      },
      {
        name: 'FCF to Operating Cash Flow % (FCF / OCF %)',
        formula: 'FCF / OCF = (Free Cash Flow / Cash Flow from Operations) × 100',
        description: 'Proportion of operational cash retained after capital investments in plant, property, equipment, and CWIP.',
        benchmark: 'Sustained ratios > 50% provide self-funded discretionary liquidity for debt repayment and dividends.',
      },
      {
        name: 'FCF to Net Profit % (FCF / Net Profit %)',
        formula: 'FCF / Net Profit = (Free Cash Flow / Net Profit after Tax) × 100',
        description: 'Measures cash-adjusted earnings quality by benchmarking surplus free cash against accounting net profits.',
        benchmark: 'Ratios approaching or exceeding 100% indicate zero earnings inflation and high cash conversion.',
      },
    ],
  },
  {
    title: 'Solvency, Leverage & Balance Sheet Strength',
    icon: Scale,
    color: '#b45309',
    items: [
      {
        name: 'Interest Coverage Ratio',
        formula: 'Interest Coverage = (Profit Before Tax + Interest Expense) / Interest Expense',
        description: 'Earnings buffer available to service periodic lender interest charges.',
        benchmark: '> 3.0× indicates a healthy safety cushion; < 1.5× signals debt service vulnerability.',
      },
      {
        name: 'Debt-to-Equity (D/E) Ratio',
        formula: 'Debt-to-Equity = Total Borrowings / Total Shareholders\' Equity',
        description: 'Ratio of total interest-bearing debt (Long-Term + Short-Term Borrowings) to equity base (Share Capital + Reserves).',
        benchmark: '< 0.5× represents conservative leverage; > 1.5× indicates elevated financial risk.',
      },
      {
        name: 'Liabilities to Assets %',
        formula: 'Liabilities to Assets = [ (Total Assets − Shareholders\' Equity) / Total Assets ] × 100',
        description: 'Total external liabilities (borrowings, payables, provisions) as a percentage of overall corporate assets.',
      },
      {
        name: 'Current Ratio (Proxy)',
        formula: 'Current Ratio = Other Assets (Current Assets Proxy) / Other Liabilities (Current Liabilities Proxy)',
        description: 'Short-term liquidity indicator measuring buffer of liquid/operating assets against immediate commitments.',
      },
      {
        name: 'Quick Ratio (x)',
        formula: 'Quick Ratio = (Current Assets − Inventories) / Current Liabilities',
        description: 'Acid-test liquidity indicator measuring immediate cash, marketable securities, and receivables against short-term debt obligations, excluding inventory.',
        benchmark: 'Healthy working capital management targets Quick Ratio ≥ 1.0×.',
      },
      {
        name: 'Cash Ratio',
        formula: 'Cash Ratio = Cash & Bank Balances / Other Liabilities (Current Liabilities Proxy)',
        description: 'Most stringent liquidity test measuring immediate cash reserves relative to short-term liabilities.',
      },
      {
        name: 'Asset Turnover (x)',
        formula: 'Asset Turnover = Revenue from Operations / Total Assets',
        description: 'Capital efficiency multiple measuring annual top-line revenue generated per rupee of total corporate balance-sheet assets.',
        benchmark: 'Capital-light operating models typically achieve Asset Turnover > 1.5×–2.0×.',
      },
      {
        name: 'Net Working Capital',
        formula: 'Net Working Capital = Other Assets (Current Assets Proxy) − Other Liabilities (Current Liabilities Proxy)',
        description: 'Operational buffer required to bridge billing, collection, inventory holding, and vendor disbursement.',
      },
      {
        name: 'CWIP / Net Block %',
        formula: 'CWIP / Net Block = (Capital Work in Progress / Net Block) × 100',
        description: 'Gauges ongoing physical expansion and project commissioning pipeline relative to active fixed assets.',
        benchmark: 'Elevated ratios (>30%–50%) indicate heavy capital expenditure cycle; monitor timely commissioning without cost overruns.',
      },
      {
        name: 'Financial Leverage Multiplier (Assets / Equity ×)',
        formula: 'Financial Leverage = Average Total Assets / Average Shareholders\' Equity',
        description: 'Structural gearing ratio measuring total assets supported per unit of equity net worth.',
      },
    ],
  },
  {
    title: 'Operating Cycle & Working Capital Days',
    icon: Clock,
    color: '#6d28d9',
    items: [
      {
        name: 'Debtor (Receivables) Days',
        formula: 'Debtor Days = (Trade Receivables / Revenue from Operations) × 365',
        description: 'Average collection period required to turn credit sales into cash.',
        benchmark: 'Lower days indicate tighter customer credit terms and superior collection enforcement.',
      },
      {
        name: 'Inventory Days',
        formula: 'Inventory Days = (Inventories / Cost of Goods Sold or Sales) × 365',
        description: 'Average duration raw materials, WIP, and finished inventory sit in warehouses before being sold.',
      },
      {
        name: 'Payable Days',
        formula: 'Payable Days = (Trade Payables / Operating Expenses or Purchases) × 365',
        description: 'Average credit window negotiated from vendors and raw material suppliers.',
      },
      {
        name: 'Cash Conversion Cycle (CCC)',
        formula: 'CCC (Days) = Debtor Days + Inventory Days − Payable Days',
        description: 'Total elapsed time between paying suppliers for inputs and collecting cash from end customers.',
        benchmark: 'Shorter or negative CCC indicates customers and vendors finance operating working capital.',
      },
      {
        name: 'Working Capital Days',
        formula: 'Working Capital Days = (Net Working Capital / Revenue from Operations) × 365',
        description: 'Number of operating days of revenue tied up in net operational working capital.',
      },
      {
        name: 'Fixed Asset (Net Block) Turnover',
        formula: 'Fixed Asset Turnover = Revenue from Operations / Net Block (Property, Plant & Equipment)',
        description: 'Gross operating efficiency measuring top-line revenue output per rupee of physical manufacturing asset base.',
      },
    ],
  },
  {
    title: 'Per-Share Metrics & Market Valuation Multiples',
    icon: Building2,
    color: '#0284c7',
    items: [
      {
        name: 'Adjusted Number of Equity Shares',
        formula: 'Number of Shares = Equity Share Capital / Face Value per Share',
        description: 'Denominator used across all per-share financial metrics, adjusted for face-value splits.',
      },
      {
        name: 'Earnings Per Share (EPS)',
        formula: 'EPS = Net Profit after Tax / Number of Equity Shares',
        description: 'Annual or quarterly bottom-line profit allocated to each individual equity share.',
      },
      {
        name: 'Cash Earnings Per Share (CEPS)',
        formula: 'CEPS = (Net Profit after Tax + Depreciation & Amortization) / Number of Equity Shares',
        description: 'Cash-adjusted earnings per share adding back non-cash depreciation and amortization write-downs.',
      },
      {
        name: 'Book Value Per Share (BVPS)',
        formula: 'BVPS = (Equity Share Capital + Reserves & Surplus) / Number of Equity Shares',
        description: 'Net asset value per equity share based on recorded balance-sheet book value.',
      },
      {
        name: 'Price-to-Earnings (P/E) Multiple',
        formula: 'P/E = Current Market Price / TTM EPS = Current Market Capitalization / TTM Net Profit',
        description: 'Market valuation multiple indicating price investors are willing to pay per unit of current earnings.',
      },
      {
        name: 'Price-to-Book (P/B) Multiple',
        formula: 'P/B = Current Market Price / Latest BVPS = Current Market Capitalization / Latest Total Equity',
        description: 'Valuation comparison between public market equity capitalization and historical book value of equity.',
      },
      {
        name: 'Price-to-Sales (P/S) Multiple',
        formula: 'P/S = Current Market Capitalization / TTM Revenue from Operations',
        description: 'Market valuation relative to aggregate top-line revenue scale.',
      },
      {
        name: 'Enterprise Value (EV)',
        formula: 'EV = Market Capitalization + Total Debt − Cash & Bank Balances',
        description: 'Comprehensive theoretical acquisition price incorporating debt assumption and cash deduction.',
      },
      {
        name: 'EV / EBITDA Multiple',
        formula: 'EV / EBITDA = Enterprise Value / TTM Operating Profit (EBITDA)',
        description: 'Capital-structure-neutral valuation multiple comparing firm value to pre-interest operating cash generator.',
      },
      {
        name: 'Effective Tax Rate (%)',
        formula: 'Effective Tax Rate = [ (Profit Before Tax − Net Profit) / Profit Before Tax ] × 100 (or Screener reported tax %)',
        description: 'Proportion of pre-tax accounting profit paid in corporate taxes, reflecting statutory deductions, MAT credits, and tax incentives.',
        benchmark: 'Standard effective corporate tax rate in India under the new tax regime is approximately 25.17%.',
      },
      {
        name: 'Dividend Payout Ratio %',
        formula: 'Dividend Payout = (Total Equity Dividend Disbursed / Net Profit after Tax) × 100',
        description: 'Percentage of net profits returned directly to shareholders as liquid cash dividends.',
      },
      {
        name: 'Standalone vs Consolidated Revenue (%)',
        formula: 'Standalone Revenue Share = (Standalone Revenue / Consolidated Revenue) × 100',
        description: 'Proportion of total consolidated revenue generated directly by the standalone parent corporate legal entity.',
      },
      {
        name: 'Standalone vs Consolidated Net Profit (%)',
        formula: 'Standalone Profit Share = (Standalone Net Profit / Consolidated Net Profit) × 100',
        description: 'Proportion of total corporate group earnings contributed directly by the parent entity versus subsidiaries and joint ventures.',
      },
    ],
  },
  {
    title: 'Compound Growth & Statistical Weighting Methodology',
    icon: Calculator,
    color: '#4338ca',
    items: [
      {
        name: 'Compound Annual Growth Rate (CAGR)',
        formula: 'CAGR_n = [ (Value_t / Value_{t-n}) ^ (1 / n) ] − 1',
        description: 'Smoothed geometric annual growth rate calculated over 1Y, 3Y, 5Y, and 8Y/10Y endpoints. Non-positive endpoints (negative sales or loss years) are invalid for logarithmic CAGR and remain blank.',
      },
      {
        name: 'Trailing Twelve Months (TTM) Growth %',
        formula: 'TTM Growth = [ (Sum of 4 latest quarters − Sum of prior 4 quarters) / Sum of prior 4 quarters ] × 100',
        description: 'Real-time rolling 1-year growth benchmark removing quarterly seasonality.',
      },
      {
        name: 'Recency-Weighted Winsorized Historical Average (AVG Column)',
        formula: 'AVG = [ Σ (w_i × Winsorized_Value_i) ] / [ Σ w_i ], where w_i = i (recency weight 1..N)',
        description: 'To prevent distortion from one-off cyclical spikes, historical points outside 1.5 × IQR are capped (Winsorized). More recent operational years receive higher linear weights.',
      },
      {
        name: 'Quadratic Growth Trend Fit',
        formula: 'Fitted Curve: y(t) = a·t² + b·t + c (applied when N ≥ 6 and R² ≥ 80%)',
        description: 'Where R² is high, historical CAGR is derived from the second-degree quadratic velocity curve rather than point-to-point noise.',
      },
    ],
  },
]

const BANK_CATEGORIES: FormulaCategory[] = [
  {
    title: 'Banking Growth & Top-Line Momentum (Quarterly & Yearly)',
    icon: TrendingUp,
    color: '#0f766e',
    items: [
      {
        name: 'Interest Earned (Revenue) YoY Growth (%)',
        formula: 'YoY Growth = [ (Interest Earned_t − Interest Earned_{t-1}) / |Interest Earned_{t-1}| ] × 100',
        description: 'Year-over-year expansion in total gross interest earned from loans, advances, bills discounted, and treasury investments. For quarterly tables, compares Q(t) vs Q(t-4); TTM compares trailing 4 quarters against prior 4 quarters.',
        benchmark: 'Well-managed commercial banks aim for sustainable loan-book revenue growth of 12%–18% YoY.',
      },
      {
        name: 'Interest Earned (Revenue) QoQ Growth (%)',
        formula: 'QoQ Growth = [ (Interest Earned_Q(t) − Interest Earned_Q(t-1)) / |Interest Earned_Q(t-1)| ] × 100',
        description: 'Quarter-on-quarter momentum in gross interest income, capturing sequential lending velocity and interest rate reset cycles.',
      },
      {
        name: 'Net Interest Income (NII) YoY Growth (%)',
        formula: 'NII Growth = [ (NII_t − NII_{t-1}) / |NII_{t-1}| ] × 100, where NII = Interest Earned − Interest Expended',
        description: 'Core lending revenue growth after deducting interest paid on customer deposits and borrowings. Captures pure intermediation franchise compounding.',
        benchmark: 'Top-tier private banks sustain NII growth between 14% and 20% YoY across credit cycles.',
      },
      {
        name: 'Deposits YoY Growth (%)',
        formula: 'Deposits Growth = [ (Deposits_t − Deposits_{t-1}) / |Deposits_{t-1}| ] × 100',
        description: 'Annual growth in the bank\'s aggregate customer deposit base (CASA and term deposits), reflecting liability franchise strength and customer trust.',
        benchmark: 'Deposit growth should ideally match or pace advance growth to prevent elevated liquidity strains.',
      },
      {
        name: 'Net Profit YoY Growth (%)',
        formula: 'Net Profit Growth = [ (Net Profit_t − Net Profit_{t-1}) / |Net Profit_{t-1}| ] × 100',
        description: 'Annual bottom-line profit after tax (PAT) expansion after operating costs, loan provisions, and corporate taxes.',
        benchmark: 'Consistent double-digit earnings growth (>15% YoY) signals high operating leverage and disciplined credit underwriting.',
      },
      {
        name: 'Net Profit QoQ Growth (%)',
        formula: 'Net Profit QoQ = [ (Net Profit_Q(t) − Net Profit_Q(t-1)) / |Net Profit_Q(t-1)| ] × 100',
        description: 'Sequential quarterly net income trend, capturing immediate quarterly provisioning shifts or seasonal tax swings.',
      },
    ],
  },
  {
    title: 'Spread, Margins & Operational Efficiency',
    icon: Landmark,
    color: '#0284c7',
    items: [
      {
        name: 'Net Interest Margin (NIM Proxy %)',
        formula: 'NIM Proxy = [ (Interest Earned − Interest Expended) / Total Assets ] × 100',
        description: 'Core lending efficiency metric measuring net interest revenue generated per unit of funded balance-sheet assets.',
        benchmark: 'High-performing Indian commercial banks typically sustain NIM between 3.2% and 4.3%.',
      },
      {
        name: 'NII Spread — NII / Revenue (%)',
        formula: 'NII Spread = [ (Interest Earned − Interest Expended) / Interest Earned ] × 100',
        description: 'Proportion of gross lending revenue retained as net interest income after meeting deposit and funding borrowing costs.',
        benchmark: 'Leading retail deposit franchises sustain NII Spreads above 40%–50%.',
      },
      {
        name: 'Financing Margin (OPM %)',
        formula: 'Financing Margin = (Financing Profit / Interest Earned) × 100',
        description: 'Operating profitability of core financial operations before non-interest other income, overhead, and corporate taxes.',
        benchmark: 'Positive and expanding financing margin indicates core lending operations cover basic operating costs.',
      },
      {
        name: 'Cost-to-Income Ratio (incl. Provisions %)',
        formula: 'Cost-to-Income = [ Operating Expenses / (Net Interest Income + Other Income) ] × 100',
        description: 'Operational efficiency ratio indicating proportion of net revenues consumed by staff, branch networks, and administrative overhead.',
        benchmark: 'Digitized, lean banking franchises operate with Cost-to-Income < 45%–50%.',
      },
      {
        name: 'Other Income vs Total Income (%)',
        formula: 'Other Income Share = [ Other Income / (Interest Earned + Other Income) ] × 100',
        description: 'Proportion of total bank revenues sourced from fee income, commissions, distribution, forex, and treasury trading.',
        benchmark: 'Healthy diversified banks maintain other income between 15% and 25% of total income.',
      },
      {
        name: 'Non-Interest Income Share — Other Inc / (NII + Other Inc) (%)',
        formula: 'Non-Interest Income Share = [ Other Income / (Net Interest Income + Other Income) ] × 100',
        description: 'Contribution of fee, forex, and non-fund-based income relative to total net revenue (NII + Other Income). High non-interest income reduces capital charge requirements.',
        benchmark: 'Diversified corporate and retail franchises achieve 25%–35% non-interest income share.',
      },
      {
        name: 'Net Profit Margin (NPM %)',
        formula: 'NPM = (Net Profit after Tax / Total Revenue) × 100',
        description: 'Final bottom-line conversion percentage of total top-line bank revenue flowing to shareholders after all interest, provisions, costs, and taxes.',
      },
    ],
  },
  {
    title: 'Asset Quality, Solvency & Funding Mix',
    icon: Scale,
    color: '#b45309',
    items: [
      {
        name: 'Gross NPA (%)',
        formula: 'Gross NPA % = (Gross Non-Performing Assets / Gross Advances) × 100',
        description: 'Recognized loans overdue past 90 days as a percentage of total loan book (Reported Standalone Bank Book).',
        benchmark: 'Top-tier Indian private banks maintain Gross NPA < 1.5%–2.0%; systemic stress occurs above 5.0%.',
      },
      {
        name: 'Net NPA (%)',
        formula: 'Net NPA % = (Net Non-Performing Assets / Net Advances) × 100 = [ (Gross NPA − Provisions) / Net Advances ] × 100',
        description: 'Bad loans remaining on the balance sheet after specific credit impairment provisions have been deducted.',
        benchmark: 'Conservative banking standards target Net NPA < 0.5%–0.8%.',
      },
      {
        name: 'Provision Coverage Ratio (PCR Proxy %)',
        formula: 'PCR Proxy = [ (Gross NPA % − Net NPA %) / Gross NPA % ] × 100',
        description: 'Proportion of recognized bad loans already covered by provisioning reserves, insulating future profits and equity capital from slippages.',
        benchmark: 'Prudent regulatory and banking comfort levels require PCR > 70%–80%.',
      },
      {
        name: 'Credit-to-Deposit / Loan-to-Deposit Ratio (LDR %)',
        formula: 'LDR = (Total Loans & Advances / Total Customer Deposits) × 100',
        description: 'Measures how much of customer deposits are deployed into loans and advances. Ratios exceeding 85%–90% signal heavy reliance on wholesale borrowings and tightening structural liquidity.',
        benchmark: 'Comfortable RBI regulatory and liquidity range is typically 70% to 80%.',
      },
      {
        name: 'Borrowings / Deposits (%) [Wholesale Funding Reliance]',
        formula: 'Borrowings / Deposits = (Non-Deposit Wholesale Borrowings / Customer Deposits) × 100',
        description: 'Gauges bank reliance on expensive or volatile wholesale market borrowings (subordinated debt, certificates of deposit, refinance) relative to sticky retail deposits.',
        benchmark: 'Retail-heavy deposit franchises keep wholesale borrowings < 15%–20% of customer deposits.',
      },
      {
        name: 'Equity / Total Assets (%) [Capital Buffer Cushion]',
        formula: 'Equity / Total Assets = [ (Equity Share Capital + Reserves & Surplus) / Total Assets ] × 100',
        description: 'Net worth cushion safeguarding depositors and creditors against asset deflation or severe loan book write-offs.',
        benchmark: 'Well-capitalized commercial banks sustain Equity / Total Assets between 10% and 14%.',
      },
      {
        name: 'Investments / Deposits (%) [Treasury / SLR Liquidity Buffer]',
        formula: 'Investments / Deposits = (Total Investments / Total Customer Deposits) × 100',
        description: 'Measures liquidity deployed in central government securities (G-Secs), statutory liquidity ratio (SLR) assets, and corporate debt relative to deposits.',
        benchmark: 'Standard range is 25%–32% to fulfill statutory SLR requirements and liquidity coverage ratios.',
      },
      {
        name: 'Cash & Liquidity Coverage Buffer %',
        formula: 'Liquidity Ratio = [ Cash & Bank Balances / (Borrowings + Other Liabilities) ] × 100',
        description: 'Immediate liquid cash and central bank reserve buffer available to cover non-deposit borrowings and near-term obligations.',
      },
    ],
  },
  {
    title: 'Capital Returns, Leverage & DuPont Framework for Banks',
    icon: PieChart,
    color: '#1d4ed8',
    items: [
      {
        name: 'Return on Assets (ROA %)',
        formula: 'ROA = (Net Profit after Tax / Average Total Assets) × 100',
        description: 'Primary gold-standard profitability metric for financial institutions, measuring return generated on the overall funded balance sheet.',
        benchmark: 'ROA > 1.0% is considered healthy; ROA > 1.5% represents elite banking execution.',
      },
      {
        name: 'Return on Equity (ROE %)',
        formula: 'ROE = (Net Profit after Tax / Average Shareholders\' Equity) × 100',
        description: 'Annualized net accounting return generated on equity share capital and accumulated retained reserves.',
        benchmark: 'Tier-1 Indian banks target sustainable ROE between 14% and 18%.',
      },
      {
        name: 'Asset Leverage Multiplier (Assets / Net Worth ×)',
        formula: 'Asset Leverage = Total Balance-Sheet Assets / Total Shareholders\' Equity (Net Worth)',
        description: 'Balance-sheet gearing multiplier. Reflects how many rupees of assets are funded for every rupee of shareholder equity.',
        benchmark: 'Commercial banks typically operate with leverage between 7.0× and 9.5×. Excessive leverage (>12×) magnifies insolvency risk during credit downturns.',
      },
      {
        name: 'Banking DuPont ROE Decomposition',
        formula: 'ROE = Return on Assets (ROA) × Financial Leverage Multiplier (Assets / Net Worth)',
        description: 'Deconstructs bank equity returns into underlying asset earning power versus balance-sheet leverage gearing.',
      },
      {
        name: 'Asset Utilization (AU %)',
        formula: 'AU = [ (Interest Income + Other Income) / Average Total Assets ] × 100',
        description: 'Total revenue-generating capacity across the entire funded and liquid asset book.',
      },
    ],
  },
  {
    title: 'Banking Per-Share Metrics, Valuation & Payout',
    icon: Building2,
    color: '#059669',
    items: [
      {
        name: 'Earnings Per Share (EPS ₹)',
        formula: 'EPS = Net Profit after Tax / Number of Diluted Equity Shares',
        description: 'Quarterly or annual bottom-line profit attributable to each unit of equity ownership.',
      },
      {
        name: 'Book Value Per Share (BVPS ₹)',
        formula: 'BVPS = (Equity Share Capital + Reserves & Surplus) / Number of Equity Shares',
        description: 'Primary baseline equity valuation anchor for banks and non-banking financial companies.',
      },
      {
        name: 'Price-to-Book (P/B) Multiple',
        formula: 'P/B = Current Market Price / Latest BVPS = Market Capitalization / Total Equity',
        description: 'Standard valuation multiple comparing market price against net balance-sheet equity value.',
        benchmark: 'High-quality Indian banks command P/B valuations between 2.0× and 3.5× based on sustained ROE > 15%.',
      },
      {
        name: 'Price-to-Earnings (P/E) Multiple',
        formula: 'P/E = Current Market Price / TTM EPS = Market Capitalization / TTM Net Profit',
        description: 'Market valuation multiple relative to trailing twelve-month net profit.',
      },
      {
        name: 'Effective Tax Rate (%)',
        formula: 'Effective Tax Rate = [ (Profit Before Tax − Net Profit) / Profit Before Tax ] × 100 (or Screener reported tax %)',
        description: 'Statutory corporate tax proportion incurred on banking profits before exceptional items.',
      },
      {
        name: 'Dividend Payout Ratio %',
        formula: 'Dividend Payout = (Dividends Disbursed / Net Profit after Tax) × 100',
        description: 'Proportion of banking profits distributed to shareholders in dividends after RBI capital conservation buffer rules.',
        benchmark: 'Indian commercial banks typically maintain dividend payouts between 15% and 30%.',
      },
    ],
  },
  {
    title: 'Corporate Scope & Statistical Methodology',
    icon: Calculator,
    color: '#4338ca',
    items: [
      {
        name: 'Standalone vs Consolidated Revenue (%)',
        formula: 'Standalone Revenue Ratio = (Standalone Revenue / Consolidated Revenue) × 100',
        description: 'Proportion of total consolidated revenue generated directly by the parent bank book versus capital market/subsidiary units (AMC, insurance, securities).',
      },
      {
        name: 'Standalone vs Consolidated Net Profit (%)',
        formula: 'Standalone Profit Ratio = (Standalone Net Profit / Consolidated Net Profit) × 100',
        description: 'Proportion of total bottom-line earnings contributed by the parent bank book.',
      },
      {
        name: 'Compound Annual Growth Rate (CAGR)',
        formula: 'CAGR_n = [ (Value_t / Value_{t-n}) ^ (1 / n) ] − 1',
        description: 'Geometric compound growth calculated over 1Y, 3Y, 5Y, and 8Y/10Y endpoints across advances, deposits, NII, and net profit.',
      },
      {
        name: 'Recency-Weighted Winsorized Historical Average (AVG Column)',
        formula: 'AVG = [ Σ (w_i × Winsorized_Value_i) ] / [ Σ w_i ], where w_i = i (recency weight 1..N)',
        description: 'Robust statistical average weighting recent fiscal years higher while capping extreme one-off provisioning or credit cycle outliers.',
      },
      {
        name: 'Trailing Twelve Months (TTM) Rolling Calculation',
        formula: 'TTM Metric = Sum of 4 latest consecutive reported quarters',
        description: 'Smooths seasonal variations in credit growth, fee booking, and fiscal-year-end recoveries.',
      },
    ],
  },
]

export function DataChecksView({ data }: { data: FinancialData }) {
  const isBank = data.mode === 'bank'
  const categories = isBank ? BANK_CATEGORIES : NON_BANK_CATEGORIES
  const firstPeriod = data.annual[0]?.period ?? '—'
  const lastPeriod = data.annual.at(-1)?.period ?? '—'
  const warningsCount = data.warnings.length

  return (
    <div className="checks-section-wrap">
      {/* Intro Heading */}
      <div className="section-intro">
        <div>
          <div className="hero-kicker">
            <Sparkles size={14} /> METHODOLOGY &amp; DATA INTEGRITY
          </div>
          <h2>Data Checks, Financial Formulas &amp; Methodology</h2>
          <p>
            Complete mathematical definitions, formulas, DuPont decomposition, and data audit checks
            applied across {data.companyName}&apos;s financial statements.
          </p>
        </div>
        <span className={`check-status ${warningsCount ? 'attention' : ''}`}>
          {warningsCount ? (
            <>
              <AlertTriangle size={15} /> {warningsCount} DATA DISCLOSURES
            </>
          ) : (
            <>
              <Check size={15} /> DATA INTEGRITY VERIFIED
            </>
          )}
        </span>
      </div>

      {/* Top Source Summary & Warnings */}
      <div className="checks-top-grid">
        <div className="checks-card checks-card-source">
          <div className="checks-card-header">
            <ShieldCheck size={18} className="checks-icon-shield" />
            <h3>Source &amp; Dataset Coverage</h3>
          </div>
          <div className="check-row">
            <span>Company Name</span>
            <b>{data.companyName}</b>
          </div>
          <div className="check-row">
            <span>Analysis Architecture</span>
            <b>{isBank ? 'Banking & Financial Institution' : 'Corporate Non-Bank Analysis'}</b>
          </div>
          <div className="check-row">
            <span>Annual Reporting Horizon</span>
            <b>{firstPeriod} — {lastPeriod} ({data.annual.length} Fiscal Years)</b>
          </div>
          <div className="check-row">
            <span>Quarterly Disclosures</span>
            <b>{data.quarterly.length} Quarters Available + TTM</b>
          </div>
          <div className="check-row">
            <span>Face Value Per Share</span>
            <b>{data.faceValue === null ? 'Not provided in sheet' : `₹${data.faceValue}`}</b>
          </div>
          <div className="check-row">
            <span>Primary Input Workbook</span>
            <b>{data.sourceFileName}</b>
          </div>
        </div>

        <div className="checks-card checks-card-warnings">
          <div className="checks-card-header">
            <AlertTriangle size={18} className="checks-icon-alert" />
            <h3>Workbook Notes &amp; Edge-Case Safeguards</h3>
          </div>
          {warningsCount > 0 ? (
            <ul className="checks-warnings-list">
              {data.warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          ) : (
            <p className="checks-clean-notice">
              All financial statements reconciled cleanly. No missing balance-sheet rows or zero-denominator
              divisions were detected for this workbook.
            </p>
          )}
        </div>
      </div>

      {/* Mathematical Formulas & Financial Methodology Grid */}
      <div className="formula-sections-container">
        <div className="formula-main-kicker">
          <Calculator size={16} /> MATHEMATICAL EXPRESSIONS &amp; RATIO FORMULAS
        </div>

        <div className="formula-grid">
          {categories.map((cat, catIdx) => {
            const Icon = cat.icon
            return (
              <div key={catIdx} className="formula-card">
                <div className="formula-card-head" style={{ borderTopColor: cat.color }}>
                  <div className="formula-card-title-wrap">
                    <Icon size={18} style={{ color: cat.color }} />
                    <h3>{cat.title}</h3>
                  </div>
                  <span className="formula-count-pill">{cat.items.length} Formulations</span>
                </div>

                <div className="formula-items-list">
                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="formula-item">
                      <div className="formula-item-name">{item.name}</div>
                      <div className="formula-math-box">
                        <code>{item.formula}</code>
                      </div>
                      <p className="formula-desc">{item.description}</p>
                      {item.benchmark && (
                        <div className="formula-benchmark-note">
                          <strong>Benchmark / Interpretation:</strong> {item.benchmark}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
