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
    formula: 'GNPA (%) = Gross NPAs ÷ Gross Advances × 100 | NNPA (%) = (Gross NPAs − Provisions) ÷ Net Advances × 100',
    meaning: 'Core indicator of loan default risk. NPAs are loans past due for over 90 days. NNPA shows unprovisioned bad debt.',
    benchmark: 'Healthy: GNPA < 2.5%, NNPA < 0.6%. Distressed: GNPA > 6%, NNPA > 2%.',
    notes: 'A low NNPA indicates the balance sheet is thoroughly cleansed and well-cushioned against credit losses.',
    applicableTo: 'bank',
  },
  {
    id: 'pcr',
    name: 'Provision Coverage Ratio (PCR %)',
    abbr: 'PCR %',
    category: 'banking',
    formula: 'PCR (%) = (Cumulative Specific Loan Provisions ÷ Gross NPAs) × 100',
    meaning: 'The percentage of bad loans already provisioned for through P&L write-downs.',
    benchmark: 'RBI guideline: 70% or higher. Strong private and PSU banks maintain 75% - 85%+. ',
    notes: 'High PCR protects future net profit from sudden write-off shocks when bad loans are formally resolved.',
    applicableTo: 'bank',
  },

  // Profitability & Margins
  {
    id: 'opm',
    name: 'Operating Profit Margin (OPM %)',
    abbr: 'OPM',
    category: 'margins',
    formula: 'OPM (%) = ((Total Revenue − Total Operating Expenses) ÷ Total Revenue) × 100',
    meaning: 'Measures operational profitability before non-operating items, finance costs, and taxes. Reflects raw business pricing power.',
    benchmark: 'Industry dependent: Software/SaaS: 25% - 35%; FMCG: 18% - 25%; Auto/Mfg: 10% - 16%; Retail: 4% - 8%.',
    notes: 'Excludes treasury gains, forex gains, and asset sales. Sustainable OPM expansion is the prime engine of earnings compounding.',
    applicableTo: 'all',
  },
  {
    id: 'npm',
    name: 'Net Profit Margin (NPM %)',
    abbr: 'NPM',
    category: 'margins',
    formula: 'NPM (%) = (Net Profit After Tax (PAT) ÷ Total Revenue) × 100',
    meaning: 'The bottom-line fraction of revenue translated into net profit for equity shareholders after all operating costs, interest, depreciation, and taxes.',
    benchmark: 'Healthy corporate: 8% - 18%. Banking sector: 12% - 22% of total revenue.',
    notes: 'Can be distorted by one-off tax adjustments, deferred tax assets, litigation settlements, or exceptional gains.',
    applicableTo: 'all',
  },
  {
    id: 'npm-prime',
    name: "NPM' % (Net Profit over Total Income)",
    abbr: "NPM'",
    category: 'margins',
    formula: "NPM' (%) = (Net Profit ÷ (Sales + Other Income)) × 100",
    meaning: 'Comprehensive margin comparing bottom-line earnings against gross revenue inclusive of all non-operating other income.',
    benchmark: 'Close to NPM. A large divergence reveals heavy reliance on investment gains or non-core other income.',
    notes: 'Used in bank ROE decomposition to ensure other income is properly accounted for in the asset yield.',
    applicableTo: 'all',
  },

  // Returns & Capital Efficiency
  {
    id: 'roce',
    name: 'Return on Capital Employed (ROCE %)',
    abbr: 'ROCE',
    category: 'returns',
    formula: 'ROCE (%) = (EBIT ÷ Average Capital Employed) × 100 | Capital Employed = Equity + Total Borrowings',
    meaning: 'Gold-standard metric of capital allocation excellence. Evaluates operating earnings generated across both debt and equity providers.',
    benchmark: 'Excellent: > 20%. Good: 15% - 20%. Below 12% indicates capital allocation underperforming cost of capital.',
    notes: 'Unlike ROE, ROCE cannot be artificially inflated through high financial leverage or dangerous debt loading.',
    applicableTo: 'nonbank',
  },
  {
    id: 'roe',
    name: 'Return on Equity (ROE %)',
    abbr: 'ROE',
    category: 'returns',
    formula: 'ROE (%) = (Net Profit After Tax ÷ Average Equity) × 100 | Equity = Share Capital + Reserves',
    meaning: 'Measures how efficiently management converts shareholders’ retained wealth and capital into bottom-line profits.',
    benchmark: 'Target: > 15% - 20%. Sustained ROE above 18% with modest leverage indicates a durable economic moat.',
    notes: 'Always inspect alongside Debt/Equity. High ROE driven by 5x leverage is fragile; high ROE driven by high NPM/AY is antifragile.',
    applicableTo: 'all',
  },
  {
    id: 'roa',
    name: 'Return on Assets (ROA %)',
    abbr: 'ROA',
    category: 'returns',
    formula: 'ROA (%) = (Net Profit After Tax ÷ Average Total Assets) × 100',
    meaning: 'Evaluates earnings productivity across the entire asset base. Crucial baseline for financial institutions.',
    benchmark: 'Banks: > 1.2% - 1.8% is top-tier. Non-financial manufacturing: 8% - 14%. Asset-light tech: > 15%.',
    notes: 'In banking, even a 0.2% increase in ROA creates massive additional equity capital to fund credit growth.',
    applicableTo: 'all',
  },
  {
    id: 'dupont-roe',
    name: 'DuPont ROE Decomposition',
    abbr: 'NPM × AY × EM',
    category: 'returns',
    formula: 'ROE = Net Profit Margin (NPM) × Asset Yield / Turnover (AY) × Equity Multiplier (EM)',
    meaning: 'Breaks down return on equity into three distinct engines: pricing profitability (NPM), asset efficiency (AY), and balance sheet leverage (EM).',
    benchmark: 'Balanced quality: High NPM and AY with conservative EM (< 1.5x non-bank, 7x - 9x bank).',
    notes: 'Identifies whether rising ROE stems from operating brilliance (higher margin/turnover) or speculative financial borrowing (higher EM).',
    applicableTo: 'all',
  },
  {
    id: 'asset-yield',
    name: 'Asset Yield / Turnover (AY %)',
    abbr: 'AY',
    category: 'returns',
    formula: 'Asset Yield (%) = (Total Revenue ÷ Average Total Assets) × 100',
    meaning: 'Quantifies revenue generation efficiency per rupee of total balance-sheet assets.',
    benchmark: 'Banks: 7% - 9% (representing interest + fee yields on loan/investment book). Non-banks: 60% - 150%.',
    notes: 'Higher asset turnover allows capital-light firms to produce spectacular returns on capital despite moderate margins.',
    applicableTo: 'all',
  },
  {
    id: 'equity-multiplier',
    name: 'Equity Multiplier (EM ×)',
    abbr: 'EM',
    category: 'returns',
    formula: 'Equity Multiplier (×) = Average Total Assets ÷ Average Shareholders’ Equity',
    meaning: 'Financial leverage multiplier in DuPont decomposition. Measures total asset backing supported by each unit of net worth.',
    benchmark: 'Non-banks: 1.1x to 1.8x. Banks & NBFCs: 7x to 9x (banks operate by intermediating deposits as leverage).',
    notes: 'When EM exceeds 12x in non-banking or 10x in banking, any small loan write-off can severely erode common equity tier-1 capital.',
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

  // Liquidity & Working Capital
  {
    id: 'current-ratio',
    name: 'Current Ratio (×)',
    abbr: 'CR',
    category: 'liquidity',
    formula: 'Current Ratio (×) = Current Assets ÷ Current Liabilities',
    meaning: 'Measures the company’s ability to cover obligations due within 12 months using short-term liquid assets.',
    benchmark: 'Healthy: 1.33x to 2.0x. High-working-capital manufacturing targets 1.5x+.',
    notes: 'When raw workbook does not itemize Current Assets, Other Assets is used as a proxy and flagged in data notes.',
    applicableTo: 'nonbank',
  },
  {
    id: 'cash-ratio',
    name: 'Cash Ratio (×)',
    abbr: 'Cash Ratio',
    category: 'liquidity',
    formula: 'Cash Ratio (×) = Cash & Bank Balances ÷ Current Liabilities',
    meaning: 'The most conservative liquidity test: examines immediate ability to pay all current liabilities without needing to sell inventory or collect receivables.',
    benchmark: 'Healthy: 0.2x to 0.5x. Overly high cash ratios (> 1.0x) may indicate uninvested idle funds earning low treasury yields.',
    notes: 'Key safety buffer during systemic crises when credit lines and supplier receivables freeze.',
    applicableTo: 'all',
  },
  {
    id: 'bank-liquidity',
    name: 'Bank Liquidity Ratio (%)',
    abbr: 'Bank Liquidity %',
    category: 'liquidity',
    formula: 'Bank Liquidity (%) = (Cash & Bank Balances ÷ (Borrowings + Other Liabilities)) × 100',
    meaning: 'Evaluates the cash buffer available to meet instantaneous wholesale borrowing withdrawals and other claims.',
    benchmark: 'Healthy: 10% - 20% of non-deposit liabilities.',
    notes: 'Complements the Liquidity Coverage Ratio (LCR) by tracking unencumbered cash liquidity.',
    applicableTo: 'bank',
  },
  {
    id: 'ccc',
    name: 'Cash Conversion Cycle (CCC Days)',
    abbr: 'CCC',
    category: 'workingcap',
    formula: 'CCC (Days) = DSO + DIO − DPO | Days Sales Outstanding + Days Inventory Outstanding − Days Payables Outstanding',
    meaning: 'The net number of days it takes for capital invested in raw materials and inventory to cycle back into operating cash from sales.',
    benchmark: 'Negative or near-zero is elite (e.g. FMCG/retail using negative working capital funded by suppliers). Standard: 30 - 75 days.',
    notes: 'Expanding CCC drains operating cash flow, forcing firms to draw on expensive working capital credit lines.',
    applicableTo: 'nonbank',
  },
  {
    id: 'dso',
    name: 'Days Sales Outstanding (DSO)',
    abbr: 'DSO / Debtor Days',
    category: 'workingcap',
    formula: 'DSO (Days) = (Trade Receivables ÷ Annual Gross Sales) × 365',
    meaning: 'The average number of days taken to collect cash payments from customers after invoice billing.',
    benchmark: 'B2C/Cash businesses: < 15 days. Industrial B2B: 45 - 75 days. Government/EPC: 90 - 180+ days.',
    notes: 'Spike in DSO often signals unbilled revenue aggression, channel stuffing, or deteriorating customer creditworthiness.',
    applicableTo: 'nonbank',
  },

  // Cash Flow & Earnings Quality
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

  // Growth & Valuation
  {
    id: 'cagr',
    name: 'Compound Annual Growth Rate (CAGR %)',
    abbr: 'CAGR',
    category: 'growth',
    formula: 'CAGR (%) = ((End Period Value ÷ Start Period Value)^(1 ÷ Years) − 1) × 100',
    meaning: 'Smoothed geometric annual growth rate over multi-year horizons (1Y through 9Y), dampening single-year volatility.',
    benchmark: 'GDP+ inflation is 10%-12%. Outperforming compounders deliver 15%-25%+ sustained revenue and profit CAGR.',
    notes: 'In our engine, CAGR Average uses a quadratic curve fit when R² > 80% with 6+ annual data points, falling back to 3Y/1Y CAGR.',
    applicableTo: 'all',
  },
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
]

export function DataChecksView({ data }: { data: FinancialData }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const isBank = data.mode === 'bank'

  // Filter definitions based on active bank/nonbank mode, selected category, and search query
  const filteredRatios = useMemo(() => {
    return RATIO_DEFINITIONS.filter(item => {
      // Applicability filter
      if (item.applicableTo === 'bank' && !isBank) return false
      if (item.applicableTo === 'nonbank' && isBank) return false

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false

      // Search query filter
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
    { key: 'all', label: 'All Items' },
    ...(isBank ? [{ key: 'banking', label: 'Banking & Credit (BFSI)' }] : []),
    { key: 'margins', label: 'Margins & Spreads' },
    { key: 'returns', label: 'Returns & Capital' },
    { key: 'liquidity', label: 'Liquidity & Solvency' },
    ...(!isBank ? [{ key: 'workingcap', label: 'Working Capital & CCC' }] : []),
    { key: 'cashflow', label: 'Cash Flow & Quality' },
    { key: 'growth', label: 'Growth & Valuation' },
    { key: 'glossary', label: 'Glossary & Valuation' },
  ]

  const warningCount = data.warnings.length + (data.missingMetrics?.length || 0)

  return (
    <div className="checks-page-container">
      {/* 1. HERO TOP BANNER */}
      <header className="checks-hero-banner">
        <div className="checks-hero-left">
          <div className="checks-icon-orb">
            <ShieldCheck size={26} />
          </div>
          <div>
            <div className="checks-hero-kicker">FINANCIAL DICTIONARY & DATA AUDIT</div>
            <h1 className="checks-hero-title">Data Checks, Formulas & Definitions</h1>
            <p className="checks-hero-subtitle">
              Comprehensive compendium of all financial ratios, mathematical formulas, abbreviations, benchmark thresholds,
              and data integrity checks across Quarterly and Yearly disclosures.
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

      {/* 2. SOURCE COVERAGE & SYSTEM WARNINGS */}
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
            <span className="checks-kv-label">Face Value</span>
            <span className="checks-kv-value">{data.faceValue === null ? 'Not specified' : `₹ ${data.faceValue}`}</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Source Document</span>
            <span className="checks-kv-value" style={{ fontSize: '12px' }}>{data.sourceFileName}</span>
          </div>
        </div>

        <div className="checks-info-card">
          <h3>
            <AlertTriangle size={17} style={{ color: warningCount > 0 ? '#f59e0b' : '#10b981' }} />
            Workbook Notices & Special Calculations
          </h3>
          {warningCount > 0 ? (
            <ul className="checks-warning-list">
              {[...data.warnings, ...(data.missingMetrics || [])].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="checks-ready-notice">
              <CheckCircle2 size={16} /> All core mathematical schedules, P&L statements, and Balance Sheet rows match standard verification criteria.
            </p>
          )}
          <div className="ratio-note-box" style={{ marginTop: '14px' }}>
            <strong>Average Computation Rule:</strong> Growth and returns use recency weighting with IQR outlier Winsorization (50% spread ratio).
            Multi-year CAGR utilizes quadratic curve fitting when R² exceeds 80% across 6+ years.
          </div>
        </div>
      </section>

      {/* 3. SEARCH & CATEGORY TOOLBAR */}
      <section className="checks-toolbar" aria-label="Search and filter ratios">
        <div className="checks-search-box">
          <Search size={18} className="checks-search-icon" />
          <input
            type="text"
            className="checks-search-input"
            placeholder="Search ratio, formula, abbreviation, benchmark or keyword (e.g. LDR, ROCE, NIM, CCC, DuPont, CASA)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="checks-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>

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
      </section>

      {/* 4. COMPENDIUM GRID */}
      <div className="checks-grid-section-title">
        <h3>
          <Calculator size={19} style={{ color: '#38bdf8' }} />
          Financial Metrics & Ratio Compendium
        </h3>
        <span className="checks-results-meta">
          Showing {filteredRatios.length} of {RATIO_DEFINITIONS.filter(r => (r.applicableTo === 'bank' ? isBank : !isBank || r.applicableTo === 'all')).length} items
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
                <div className="ratio-formula-label">MATHEMATICAL FORMULA</div>
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
          <h4>No matching ratios or definitions found</h4>
          <p>Try searching for a different keyword or select "All Items" in the category filter.</p>
        </div>
      )}
    </div>
  )
}
