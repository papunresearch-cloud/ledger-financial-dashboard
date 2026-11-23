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
  Lightbulb,
  Compass,
  Layers,
  Cpu,
} from 'lucide-react'
import type { FinancialData } from './types'
import './dataChecks.css'

export interface RatioDefinition {
  id: string
  name: string
  abbr: string
  category: 'growth' | 'margins' | 'returns' | 'liquidity' | 'solvency' | 'cashflow' | 'banking' | 'workingcap' | 'valuation' | 'technicals' | 'governance' | 'analytics' | 'glossary'
  formula: string
  meaning: string
  conceptualUse: string
  benchmark: string
  notes: string
  applicableTo: 'all' | 'bank' | 'nonbank'
  whereUsed: string
}

export interface PlotDefinition {
  id: string
  title: string
  subtitle: string
  category: 'annual-corporate' | 'quarterly-corporate' | 'special-corporate' | 'annual-bank' | 'quarterly-bank'
  applicableTo: 'all' | 'bank' | 'nonbank'
  metrics: string
  dataSource: string
  meaning: string
  conceptualUse: string
  interpretation: string
  interactiveControls: string
}

export interface StatisticalModelDefinition {
  id: string
  title: string
  subtitle: string
  formula: string
  purpose: string
  algorithm: string[]
  conceptualUse: string
  whyItMatters: string
  whereUsed: string
}

export const RATIO_DEFINITIONS: RatioDefinition[] = [
  {
    "id": "sales-growth-yoy",
    "name": "Sales Growth (YoY %)",
    "abbr": "Sales YoY %",
    "category": "growth",
    "formula": "Sales Growth YoY (%) = ((Sales_t − Sales_{t-1}) ÷ |Sales_{t-1}|) × 100 | Quarterly: (Q_t − Q_{t-4}) ÷ |Q_{t-4}| × 100",
    "meaning": "Measures the year-over-year rate of top-line revenue expansion, comparing the current fiscal year or quarter against the identical period in the prior year.",
    "conceptualUse": "Assesses organic market demand, pricing power, and market share expansion. Compare top-line sales growth with operating profit growth: if sales are expanding at 15% but operating profit is growing at 25%, the business enjoys positive operational leverage. Conversely, if sales grow while profits contract, the company is sacrificing margins or suffering from uncontrollable input cost inflation.",
    "benchmark": "High-growth compounders: > 15% - 20%+. Mature defensives (FMCG/pharma): 8% - 14%. Cyclical commodities: highly volatile across cycle stages.",
    "notes": "Available in Yearly Ratios, Quarterly Ratios, Overview CAGR table, Peer Comparison table, and Plotbook. For banks, this corresponds to Interest Earned / Total Revenue Growth.",
    "applicableTo": "all",
    "whereUsed": "Overview · Yearly Ratios · Quarterly Ratios · Peer Comparison · Annual Growth Plot"
  },
  {
    "id": "sales-growth-qoq",
    "name": "Sales Growth (QoQ %)",
    "abbr": "Sales QoQ %",
    "category": "growth",
    "formula": "Sales Growth QoQ (%) = ((Sales_Q(t) − Sales_Q(t-1)) ÷ |Sales_Q(t-1)|) × 100",
    "meaning": "Sequential rate of change in revenue from one quarter to the immediately preceding quarter.",
    "conceptualUse": "Detects high-frequency operational turning points and immediate demand momentum before it shows up in annual figures. Must always be interpreted in the context of business seasonality (e.g. consumer durables and retail regularly spike in Q3 due to festivals; capital goods and construction regularly surge in Q4 due to fiscal year-end budget exhaustions).",
    "benchmark": "Positive sequential growth outside of seasonal lulls; compare against the same sequential quarter of prior years.",
    "notes": "Featured in the Quarterly Ratios table and quarterly analytical charts. Non-annualized.",
    "applicableTo": "all",
    "whereUsed": "Quarterly Ratios · Quarterly Plots"
  },
  {
    "id": "op-growth-yoy",
    "name": "Operating Profit Growth (YoY %)",
    "abbr": "OP Growth YoY",
    "category": "growth",
    "formula": "Operating Profit Growth (%) = ((Operating Profit_t − Operating Profit_{t-1}) ÷ |Operating Profit_{t-1}|) × 100",
    "meaning": "Rate of growth in core operating earnings (EBITDA) before depreciation, debt interest, and income taxes.",
    "conceptualUse": "The purest test of operational scaling. When operating profit growth sustainably outpaces sales growth, operating profit margins (OPM) expand due to fixed-cost absorption. If operating profit falls despite positive sales growth, check for raw material price shocks, employee wage spikes, or price-cutting wars.",
    "benchmark": "Elite compounders: > 18% - 25% YoY. Stagnant businesses: < 8% or negative.",
    "notes": "Calculated across both annual and quarterly timelines in Corporate Non-Bank views.",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios · Quarterly Ratios · Special Growth Plot"
  },
  {
    "id": "np-growth-yoy",
    "name": "Net Profit Growth (YoY %)",
    "abbr": "PAT Growth YoY",
    "category": "growth",
    "formula": "Net Profit Growth (%) = ((Net Profit_t − Net Profit_{t-1}) ÷ |Net Profit_{t-1}|) × 100",
    "meaning": "Year-over-year rate of bottom-line net profit after tax (PAT) expansion attributable to equity shareholders.",
    "conceptualUse": "The primary engine of EPS growth and equity market compounding. Watch out for 'low-quality' net profit growth caused by non-operating other income, one-off asset sales, or sudden tax rate reductions. Always cross-check with Operating Profit Growth and Cash from Operations (CFO): if PAT surges but CFO is negative, earnings quality is suspect.",
    "benchmark": "Sustained > 15% - 20% CAGR over a 3 to 5-year cycle identifies superior wealth creators.",
    "notes": "Reported across Overview, Yearly Ratios, Quarterly Ratios, Peer Comparison, and Visual Plots.",
    "applicableTo": "all",
    "whereUsed": "Overview CAGR · Yearly Ratios · Quarterly Ratios · Peer Comparison · Annual Growth Plot"
  },
  {
    "id": "np-growth-qoq",
    "name": "Net Profit Growth (QoQ %)",
    "abbr": "PAT Growth QoQ",
    "category": "growth",
    "formula": "Net Profit Growth QoQ (%) = ((Net Profit_Q(t) − Net Profit_Q(t-1)) ÷ |Net Profit_Q(t-1)|) × 100",
    "meaning": "Sequential rate of change in net profit from the previous quarter to the current quarter.",
    "conceptualUse": "Highlights immediate bottom-line shocks such as unexpected raw material margin compression, surge in quarterly borrowing costs, foreign exchange losses, or tax adjustments.",
    "benchmark": "Consistent sequential expansion; monitor closely for quarterly cyclicality.",
    "notes": "Tracked in the Quarterly Ratios table.",
    "applicableTo": "all",
    "whereUsed": "Quarterly Ratios · Quarterly Plots"
  },
  {
    "id": "cagr-duration",
    "name": "Multi-Duration Compound Annual Growth Rate (CAGR 1Y - 9Y & TTM)",
    "abbr": "CAGR (1Y-9Y, TTM)",
    "category": "growth",
    "formula": "CAGR (%) = ((End Value ÷ Start Value)^(1 ÷ Years) − 1) × 100 | TTM compares latest 4 quarters against prior 4 quarters",
    "meaning": "The smoothed annualized geometric growth rate over multi-year periods (1Y, 2Y, 3Y, 4Y, 5Y, 6Y, 7Y, 8Y, 9Y, and TTM).",
    "conceptualUse": "Reveals whether growth is secular or transitory. Comparing 9Y, 5Y, 3Y, and 1Y CAGR shows whether momentum is accelerating or decelerating. For instance, a company with 10% 9Y CAGR but 25% 3Y CAGR is experiencing a structural turnaround or business expansion. Non-positive endpoints are mathematically undefined for CAGR and cleanly left blank.",
    "benchmark": "> 15% across Sales and Net Profit over 5-7 years indicates an elite wealth compounder.",
    "notes": "Generated in the Overview summary table for Sales, Other Income, Net Profit, and Book Value.",
    "applicableTo": "all",
    "whereUsed": "Overview Summary Block · CAGR by Duration Table"
  },
  {
    "id": "bank-ie-growth-yoy",
    "name": "Interest Earned Growth (YoY % - Bank)",
    "abbr": "IE Growth YoY",
    "category": "growth",
    "formula": "Interest Earned Growth (%) = ((Interest Earned_t − Interest Earned_{t-1}) ÷ |Interest Earned_{t-1}|) × 100",
    "meaning": "Year-over-year rate of expansion in interest income earned on commercial loans, advances, and treasury investments.",
    "conceptualUse": "The banking equivalent of top-line sales growth. Reflects the rate at which the bank is expanding its loan book and earning yields on deployed assets. High growth must always be balanced against asset quality: rapid loan growth during late credit cycles often leads to bad loan spikes later.",
    "benchmark": "Top-tier private banks: 14% - 20%. Large public sector banks: 8% - 13%.",
    "notes": "Displayed in Bank Overview, Bank Yearly Ratios, and Bank Quarterly Ratios.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · Bank Quarterly Ratios"
  },
  {
    "id": "bank-ie-growth-qoq",
    "name": "Interest Earned Growth (QoQ % - Bank)",
    "abbr": "IE Growth QoQ",
    "category": "growth",
    "formula": "Interest Earned Growth QoQ (%) = ((Interest Earned_Q(t) − Interest Earned_Q(t-1)) ÷ |Interest Earned_Q(t-1)|) × 100",
    "meaning": "Sequential rate of change in quarterly interest income for a banking institution.",
    "conceptualUse": "Captures quarter-to-quarter credit demand and loan disbursement momentum across retail, MSME, and corporate segments.",
    "benchmark": "Stable 2.5% - 4.5% sequential growth across quarters.",
    "notes": "Included in Bank Quarterly Ratios table.",
    "applicableTo": "bank",
    "whereUsed": "Bank Quarterly Ratios"
  },
  {
    "id": "bank-nii-growth-yoy",
    "name": "Net Interest Income (NII) Growth (YoY % - Bank)",
    "abbr": "NII Growth YoY",
    "category": "growth",
    "formula": "NII Growth (%) = ((NII_t − NII_{t-1}) ÷ |NII_{t-1}|) × 100, where NII = Interest Earned − Interest Paid",
    "meaning": "Annual rate of growth in the core lending gross spread earned by the bank over its funding costs.",
    "conceptualUse": "The single most important core earnings growth indicator for a bank. If Interest Earned grows at 15% but NII only grows at 5%, the bank is suffering from rising cost of funds (deposit rates repricing higher than loan yields). High NII growth requires strong CASA deposit stickiness.",
    "benchmark": "> 14% - 18% for top private retail franchises.",
    "notes": "Reported across Bank Yearly and Bank Quarterly ratio tables.",
    "applicableTo": "bank",
    "whereUsed": "Bank Yearly Ratios · Bank Quarterly Ratios"
  },
  {
    "id": "bank-deposits-growth",
    "name": "Customer Deposits Growth (YoY % - Bank)",
    "abbr": "Deposits Growth YoY",
    "category": "growth",
    "formula": "Deposits Growth (%) = ((Deposits_t − Deposits_{t-1}) ÷ |Deposits_{t-1}|) × 100",
    "meaning": "Annual growth rate in customer deposit liabilities across current accounts, savings accounts, and term fixed deposits.",
    "conceptualUse": "Deposits represent the raw material for a bank's lending engine. If a bank expands loans at 20% while deposits grow at only 10%, its Loan-to-Deposit Ratio (LDR) will surge to dangerous levels, forcing it to raise expensive wholesale borrowings or slow down lending.",
    "benchmark": "12% - 16% YoY; must track or exceed lending advances growth.",
    "notes": "Tracked in Bank Yearly Ratios and Bank Overview.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios"
  },
  {
    "id": "bv-growth",
    "name": "Book Value Growth (3Y CAGR %)",
    "abbr": "BV Growth 3Y",
    "category": "growth",
    "formula": "BV Growth (%) = ((Book Value_t ÷ Book Value_{t-3})^(1 ÷ 3) − 1) × 100",
    "meaning": "The 3-year compound annual growth rate of net tangible accounting equity (share capital + reserves).",
    "conceptualUse": "For banks, NBFCs, and financial institutions, stock prices track book value per share over the long run. High book value compounding driven by high ROE (retained earnings) creates immense value. Check whether book value growth was organic (from profits) or artificial (dilution via rights issues or QIPs).",
    "benchmark": "> 14% - 18% organic compounding without shareholder dilution.",
    "notes": "Highlighted in the Bank Peer Comparison table (`bv_growth` column) and Overview CAGR.",
    "applicableTo": "all",
    "whereUsed": "Bank Peer Comparison · Overview Summary Table"
  },
  {
    "id": "gpm",
    "name": "Gross Profit Margin (GPM %)",
    "abbr": "GPM %",
    "category": "margins",
    "formula": "GPM (%) = ((Sales + Change in Inventory − Raw Material Costs) ÷ Sales) × 100",
    "meaning": "Pure manufacturing product markup over direct raw material inputs, before factory overheads, power & fuel, labor, and SG&A.",
    "conceptualUse": "The ultimate barometer of pricing power and product moat. If commodity input costs double and GPM remains constant or expands, the company has pricing power to pass price increases to consumers. If GPM collapses, the company is a price-taker. Automatically suppressed for companies with unstated raw material costs (e.g. IT services).",
    "benchmark": "Branded FMCG: 45% - 65%. Specialty Chemicals: 35% - 50%. Bulk commodities: 15% - 25%.",
    "notes": "Integrated into Corporate Annual and Quarterly plots, and Data Sheet.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Snapshot · Yearly Plots · Data Sheet"
  },
  {
    "id": "opm",
    "name": "Operating Profit Margin (OPM %)",
    "abbr": "OPM %",
    "category": "margins",
    "formula": "OPM (%) = (Operating Profit ÷ Sales or Operating Revenue) × 100",
    "meaning": "Operating earnings efficiency (EBITDA margin) reflecting gross operating profit generated per rupee of revenue before depreciation, interest, and taxes.",
    "conceptualUse": "Measures core operational profitability and operating leverage. Expanding OPM over a 5 to 10-year period signifies scale economies and brand moats. Always cross-check with cash flows: high OPM with low CFO/Sales indicates earnings are trapped in unpaid receivables or unsold inventory.",
    "benchmark": "Asset-light IT: 22% - 28%. Specialty chemicals: 18% - 25%. FMCG: 18% - 24%. Infrastructure/EPC: 10% - 15%. Retail: 4% - 8%.",
    "notes": "Featured in Overview, Yearly Ratios, Quarterly Ratios, Peer Comparison, and Visual Plots.",
    "applicableTo": "all",
    "whereUsed": "Overview · Yearly Ratios · Quarterly Ratios · Peer Comparison · Annual & Quarterly Plots"
  },
  {
    "id": "npm",
    "name": "Net Profit Margin (NPM %)",
    "abbr": "NPM %",
    "category": "margins",
    "formula": "NPM (%) = (Net Profit After Tax ÷ Sales or Total Revenue) × 100",
    "meaning": "The bottom-line residual percentage of revenue converted into pure net profit attributable to equity shareholders.",
    "conceptualUse": "The primary profitability pillar in DuPont analysis. Compare NPM with OPM: a large gap indicates that earnings are heavily consumed by high interest obligations on debt or massive depreciation charges on plant and machinery.",
    "benchmark": "High-margin software/consumer: 15% - 25%. Heavy manufacturing: 6% - 12%. Retail/distribution: 2% - 5%.",
    "notes": "Displayed in Overview, Yearly Ratios, Quarterly Ratios, DuPont Analysis, and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Overview · Yearly Ratios · Quarterly Ratios · DuPont Analysis · Forecast Calculator"
  },
  {
    "id": "npm-prime",
    "name": "Net Profit Margin on Core Revenue (NPM' % - Bank)",
    "abbr": "NPM' %",
    "category": "margins",
    "formula": "NPM' (%) = (Net Profit ÷ Interest Earned or Core Revenue) × 100",
    "meaning": "Net profit margin computed specifically against core interest earned rather than gross aggregate revenue.",
    "conceptualUse": "Isolates the bank's net bottom-line efficiency generated exclusively from its primary lending operations, stripping away the distortive effects of volatile treasury trading profits or one-off fee windfalls.",
    "benchmark": "18% - 28% for disciplined retail commercial banks.",
    "notes": "Presented in BankDashboard annual return history table.",
    "applicableTo": "bank",
    "whereUsed": "BankDashboard Return History Table"
  },
  {
    "id": "pbt-margin",
    "name": "Pre-Tax Profit Margin (PBT %)",
    "abbr": "PBT %",
    "category": "margins",
    "formula": "PBT Margin (%) = (Profit Before Tax ÷ Sales or Total Revenue) × 100",
    "meaning": "Operating earnings margin after depreciation and debt interest, but before statutory income taxes.",
    "conceptualUse": "Enables apples-to-apples profitability comparisons across companies that operate in different tax jurisdictions or enjoy temporary tax incentives/holidays.",
    "benchmark": "Quality manufacturing: 12% - 18%. Service sector: 18% - 26%.",
    "notes": "Included in Corporate and Bank Yearly & Quarterly ratio tables.",
    "applicableTo": "all",
    "whereUsed": "Yearly Ratios · Quarterly Ratios"
  },
  {
    "id": "other-income-total-income",
    "name": "Other Income / Total Income (%)",
    "abbr": "Other Income %",
    "category": "margins",
    "formula": "Other Income Share (%) = (Other Income ÷ Total Income or Revenue) × 100",
    "meaning": "The share of total company revenue originating from non-operational sources (e.g. treasury interest, mutual fund dividends, foreign exchange gains, asset sales).",
    "conceptualUse": "Earnings quality detector. If Other Income represents > 20% - 30% of total profit, the core business engine is sluggish or loss-making. Spikes in other income often reflect non-recurring gains like selling a factory or real estate, which will not recur next year.",
    "benchmark": "Ideally low (< 5% - 8%). Cash-rich tech companies have higher treasury income, which should be modeled separately from core operating profits.",
    "notes": "Reported across Yearly Ratios, Quarterly Ratios, and Overview CAGR tables.",
    "applicableTo": "all",
    "whereUsed": "Overview CAGR · Yearly Ratios · Quarterly Ratios · Bank Plots"
  },
  {
    "id": "effective-tax-rate",
    "name": "Effective Tax Rate (%)",
    "abbr": "Tax Rate %",
    "category": "margins",
    "formula": "Effective Tax Rate (%) = ((Profit Before Tax − Net Profit) ÷ Profit Before Tax) × 100",
    "meaning": "The actual percentage of pre-tax accounting profit paid to tax authorities.",
    "conceptualUse": "Identifies earnings sustainability. A sudden jump in PAT caused by an effective tax rate drop from 25% to 5% (due to deferred tax adjustments or carry-forward losses) will normalize in subsequent years, leading to a sudden earnings deceleration.",
    "benchmark": "Standard Indian corporate tax regime: ~25.17%. Concessional manufacturing rate: ~17.16%.",
    "notes": "Tracked in Corporate and Bank Quarterly & Yearly ratio tables.",
    "applicableTo": "all",
    "whereUsed": "Yearly Ratios · Quarterly Ratios"
  },
  {
    "id": "cost-to-income",
    "name": "Cost-to-Income Ratio (%) [Bank / BFSI]",
    "abbr": "Cost / Income %",
    "category": "margins",
    "formula": "Cost-to-Income (%) = (Total Operating Expenses ÷ (Net Interest Income + Other Income)) × 100",
    "meaning": "The proportion of net operating revenue absorbed by administrative expenses, employee wages, branch overheads, and technology costs.",
    "conceptualUse": "The quintessential operating efficiency metric for financial institutions. Lower is strictly better. Banks with low cost-to-income ratios have higher operating buffers to absorb credit defaults (NPAs) and can underwrite loans more competitively.",
    "benchmark": "Best-in-class digital private banks: 38% - 46%. Traditional PSU banks: 50% - 60%. Above 65% signals excessive branch bloat.",
    "notes": "Featured in Bank Yearly Ratios, Bank Quarterly Ratios, and Bank Annual Plots.",
    "applicableTo": "bank",
    "whereUsed": "Bank Yearly Ratios · Bank Quarterly Ratios · Bank Plots"
  },
  {
    "id": "nii-spread",
    "name": "NII Spread / Net Interest Margin (NIM %)",
    "abbr": "NII Spread / NIM",
    "category": "margins",
    "formula": "NII Spread (%) = ((Interest Earned − Interest Paid) ÷ Interest Earned) × 100 | NIM = (NII ÷ Total Earning Assets) × 100",
    "meaning": "The core gross margin of a lending institution. Represents the markup earned on advances and investments over the cost of funds paid to depositors.",
    "conceptualUse": "The fundamental engine of bank profitability. Expands when low-cost CASA deposits rise or when the bank shifts mix toward high-yielding retail advances (personal loans, microfinance). Compresses during rate hikes if deposit rates rise faster than loan yields.",
    "benchmark": "Top private retail banks: 3.8% - 4.5%. Commercial PSU banks: 2.8% - 3.2%. High-yielding NBFCs: 6.0% - 10.0%.",
    "notes": "Available in Bank Overview, Bank Yearly Ratios, and Bank Plots.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · Bank Quarterly Ratios · Bank Plots"
  },
  {
    "id": "non-interest-income-share",
    "name": "Non-Interest Income Share (%) [Bank / BFSI]",
    "abbr": "Other Inc Share %",
    "category": "margins",
    "formula": "Non-Interest Income Share (%) = (Other Income ÷ (Net Interest Income + Other Income)) × 100",
    "meaning": "The proportion of a bank’s net operating revenue generated through non-lending fees, commissions, foreign exchange, wealth management, and treasury operations.",
    "conceptualUse": "Fee income is highly capital-light because it does not consume loan risk capital. High fee income provides strong profitability insulation during cyclical credit downturns.",
    "benchmark": "Healthy private retail banks: 22% - 30%. Pure lending institutions: 10% - 16%.",
    "notes": "Integrated into Bank Yearly and Quarterly ratio tables.",
    "applicableTo": "bank",
    "whereUsed": "Bank Yearly Ratios · Bank Quarterly Ratios"
  },
  {
    "id": "financing-margin",
    "name": "Financing Margin (%) [Bank / BFSI]",
    "abbr": "Financing Margin",
    "category": "margins",
    "formula": "Financing Margin (%) = (Operating Profit ÷ Total Revenue) × 100",
    "meaning": "Operating earnings margin of a financial institution before statutory provisioning for loan losses and corporate taxes.",
    "conceptualUse": "Gauges pure operating profitability across all revenue streams relative to overall operating overhead.",
    "benchmark": "16% - 25% for established commercial banks.",
    "notes": "Reported in Bank Yearly and Quarterly ratio tables.",
    "applicableTo": "bank",
    "whereUsed": "Bank Yearly Ratios · Bank Quarterly Ratios"
  },
  {
    "id": "cost-structure",
    "name": "Cost Structure Breakdown (% of Sales)",
    "abbr": "Cost Breakdown %",
    "category": "margins",
    "formula": "Material Cost % = (Material Exp ÷ Sales) × 100 · Employee Cost % = (Employee Exp ÷ Sales) × 100 · Other Exp % = (Other Exp ÷ Sales) × 100",
    "meaning": "Deconstructs the operational expense anatomy into raw material inputs, labor wages, and general overheads as percentages of revenue.",
    "conceptualUse": "Pinpoints the root cause of margin swings. Reveals whether margin compression is caused by rising commodity prices (material cost surge), wage inflation, or unabsorbed overheads.",
    "benchmark": "Industry dependent. Manufacturing: materials 50-65%; IT services: employees 55-65%.",
    "notes": "Visualized in Corporate Quarterly Plots (`quarter-cost-structure`).",
    "applicableTo": "nonbank",
    "whereUsed": "Quarterly Plots · Cost Structure Chart"
  },
  {
    "id": "roce",
    "name": "Return on Capital Employed (ROCE %)",
    "abbr": "ROCE %",
    "category": "returns",
    "formula": "ROCE (%) = (EBIT ÷ Average Capital Employed) × 100 | Capital Employed = Equity + Total Borrowings | Screener official #ratios",
    "meaning": "Evaluates operating pre-tax profit generated per rupee of total capital deployed across both debt and equity holders.",
    "conceptualUse": "The single most reliable indicator of business quality and managerial capital allocation skill. It measures whether the business earns returns above its Weighted Average Cost of Capital (WACC ~ 10-12%). Companies sustaining ROCE > 20% over 5-10 years possess enduring economic moats.",
    "benchmark": "Elite compounders: > 22% - 30%+. Good businesses: 15% - 20%. Capital destroyers: < 10% (below cost of capital).",
    "notes": "Extracted from Screener official #ratios table or calculated via EBIT / Capital Employed. Displayed in Overview, Yearly Ratios, and Plots.",
    "applicableTo": "all",
    "whereUsed": "Overview Return History · Yearly Ratios · Annual Returns Plot"
  },
  {
    "id": "roe",
    "name": "Return on Equity (ROE %)",
    "abbr": "ROE %",
    "category": "returns",
    "formula": "ROE (%) = (Net Profit After Tax ÷ Average Net Worth) × 100 | Net Worth = Equity Capital + Reserves",
    "meaning": "The rate of return earned on shareholders' equity capital. Determines the intrinsic compounding speed of book value per share.",
    "conceptualUse": "Measures the power of retained earnings. High ROE allows a company to reinvest profits at high rates of return without diluting equity or raising debt. Always cross-check with ROCE and Debt-to-Equity: an artificially elevated ROE (35%) paired with low ROCE (9%) signals excessive, dangerous debt leverage.",
    "benchmark": "Outstanding: > 18% - 25% without excessive leverage. Good: 14% - 18%. Poor: < 10%.",
    "notes": "Central metric across Overview, Yearly Ratios, DuPont Decomposition, Peer Comparison, and Visual Plots.",
    "applicableTo": "all",
    "whereUsed": "Overview Snapshot · Yearly Ratios · DuPont Table · Peer Comparison · Annual Returns Plot"
  },
  {
    "id": "roa",
    "name": "Return on Assets (ROA %)",
    "abbr": "ROA %",
    "category": "returns",
    "formula": "ROA (%) = (Net Profit After Tax ÷ Average Total Balance-Sheet Assets) × 100",
    "meaning": "Asset productivity indicator measuring net profit generated per unit of total assets on the balance sheet.",
    "conceptualUse": "The ultimate benchmark for capital-heavy manufacturers and financial institutions. For banks, ROA is the bedrock metric because lending leverage (Assets/Equity of 10x-12x) magnifies a 1.5% ROA into a 15% - 18% ROE.",
    "benchmark": "Commercial banks: > 1.3% - 1.8% (world-class > 2.0%). Non-bank corporates: > 8% - 14%.",
    "notes": "Visualized in Overview Return History, Yearly Ratios, Peer Comparison, and Annual Plots.",
    "applicableTo": "all",
    "whereUsed": "Overview Return History · Yearly Ratios · Peer Comparison · Annual Returns Plot"
  },
  {
    "id": "dupont-corporate",
    "name": "DuPont 3-Stage Decomposition (Corporate Non-Bank)",
    "abbr": "DuPont (NPM × ATO × EM)",
    "category": "returns",
    "formula": "ROE (%) = Net Profit Margin (NPM %) × Asset Turnover (ATO ×) × Equity Multiplier (EM ×)",
    "meaning": "Deconstructs Return on Equity into its three foundational economic drivers: Operational Profitability (NPM), Capital Velocity (Asset Turnover), and Financial Leverage (Assets/Equity).",
    "conceptualUse": "Forensic diagnostic tool. Shows whether rising ROE is fueled by genuine operational excellence (expanding margins or faster turnover) or reckless balance-sheet borrowing. If Equity Multiplier rises while Asset Turnover declines, the company is masking declining business efficiency with risky leverage.",
    "benchmark": "Sustainable compounders derive ROE from high NPM (> 15%) and high ATO (> 1.2x) rather than high EM (> 2.5x).",
    "notes": "Featured in the Overview Decomposition of ROE table and Annual DuPont Plot.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview DuPont Table · Annual DuPont Plot"
  },
  {
    "id": "dupont-bank",
    "name": "DuPont 3-Stage Decomposition (Bank / BFSI)",
    "abbr": "DuPont (NPM × AY × EM)",
    "category": "returns",
    "formula": "ROE (%) = Net Profit Margin (NPM %) × Asset Yield (AY %) × Equity Multiplier (EM ×)",
    "meaning": "Adapts the DuPont framework to banking by replacing turnover with Asset Yield: ROE = (PAT ÷ Total Revenue) × (Total Revenue ÷ Total Assets) × (Total Assets ÷ Equity).",
    "conceptualUse": "Isolates the drivers of bank ROE: (1) Bottom-line cost and provisioning efficiency (NPM), (2) Earning power of the asset portfolio (Asset Yield), and (3) Solvency leverage cushion (EM).",
    "benchmark": "Tier-1 banks: NPM > 20%, Asset Yield > 8% - 9%, Equity Multiplier 8x - 11x.",
    "notes": "Implemented in BankDashboard ROE Decomposition table.",
    "applicableTo": "bank",
    "whereUsed": "BankDashboard ROE Decomposition Table"
  },
  {
    "id": "asset-turnover",
    "name": "Asset Turnover (ATO ×)",
    "abbr": "ATO ×",
    "category": "returns",
    "formula": "Asset Turnover (×) = Sales ÷ Average Total Assets",
    "meaning": "Measures the revenue velocity generated per rupee of balance-sheet assets.",
    "conceptualUse": "Measures capital velocity. Retailers and distributors operate at low profit margins (2-3%) but high turnover (3x-5x), producing strong 15-20% ROE. Asset-heavy manufacturers with low turnover (< 0.8x) must sustain high profit margins to earn their cost of capital.",
    "benchmark": "Asset-light tech/distribution: > 1.5x - 3.0x. Heavy manufacturing: 0.7x - 1.2x.",
    "notes": "Used in Overview DuPont Table and Yearly Ratios.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview DuPont Table · Yearly Ratios"
  },
  {
    "id": "sales-to-net-block",
    "name": "Fixed Asset Turnover (Sales / Net Block ×)",
    "abbr": "Sales / Net Block",
    "category": "returns",
    "formula": "Fixed Asset Turnover (×) = Annual Sales ÷ Net Block (Property, Plant & Equipment)",
    "meaning": "Measures manufacturing productivity from installed physical plant, property, and equipment.",
    "conceptualUse": "Critical metric when analyzing capital expenditure cycles. When a company commissions a major new factory (CWIP converts to Net Block), this ratio initially dips. If it does not rebound within 2-3 years, the capacity is underutilized or the capital was misallocated.",
    "benchmark": "Efficient manufacturing: 2.5x - 5.0x+. Capital-intensive process industries: 1.2x - 2.0x.",
    "notes": "Featured in Special Analysis Charts (`special-sales-net-block`).",
    "applicableTo": "nonbank",
    "whereUsed": "Special Analysis Plot (Sales / Net Block)"
  },
  {
    "id": "asset-yield",
    "name": "Asset Yield (AY % - Bank)",
    "abbr": "Asset Yield %",
    "category": "returns",
    "formula": "Asset Yield (%) = (Total Revenue ÷ Average Total Assets) × 100",
    "meaning": "Gross income yield generated across all balance-sheet assets including commercial loans and investment securities.",
    "conceptualUse": "Reflects the asset earning power of the bank. Rises in high interest rate cycles as lending yields reprice upward; drops during rate easing cycles.",
    "benchmark": "Commercial banks: 7.5% - 9.5%. Retail NBFCs: 12% - 18%.",
    "notes": "Used in BankDashboard DuPont ROE decomposition.",
    "applicableTo": "bank",
    "whereUsed": "BankDashboard ROE Decomposition Table"
  },
  {
    "id": "asset-leverage-em",
    "name": "Equity Multiplier / Asset Leverage (EM ×)",
    "abbr": "EM / Leverage",
    "category": "returns",
    "formula": "Equity Multiplier (×) = Average Total Assets ÷ Average Equity Net Worth",
    "meaning": "Quantifies total balance-sheet leverage (how many rupees of assets are supported by each rupee of equity net worth).",
    "conceptualUse": "Leverage amplifies returns in good years but accelerates insolvency in downturns. A falling EM combined with rising ROE is the gold standard of organic business compounding.",
    "benchmark": "Non-bank corporate: 1.2x - 1.8x. Commercial banks: 8.0x - 11.5x.",
    "notes": "Included in Corporate and Bank DuPont tables and Bank Yearly Ratios.",
    "applicableTo": "all",
    "whereUsed": "Overview DuPont Table · Bank Yearly Ratios · Bank Plots"
  },
  {
    "id": "debt-to-equity",
    "name": "Debt to Equity Ratio (D/E ×)",
    "abbr": "D/E Ratio",
    "category": "solvency",
    "formula": "Debt to Equity (×) = Total Borrowings ÷ Net Worth (Share Capital + Reserves)",
    "meaning": "Measures financial leverage and long-term solvency risk. Shows the proportion of debt financing relative to owners' equity.",
    "conceptualUse": "Key solvency risk check. High D/E companies are vulnerable to interest rate hikes and macroeconomic downturns. Look for 'net cash' companies (where Cash & Investments > Total Borrowings) which have immense resilience.",
    "benchmark": "Conservative: < 0.5x. Moderate: 0.5x - 1.0x. Highly leveraged: > 1.5x (excluding financial companies).",
    "notes": "Tracked in Overview, Yearly Ratios, Peer Comparison, and Annual Debt Plot.",
    "applicableTo": "all",
    "whereUsed": "Overview · Yearly Ratios · Peer Comparison · Bank Dashboard · Annual Debt Plot"
  },
  {
    "id": "interest-coverage",
    "name": "Interest Coverage Ratio (ICR ×)",
    "abbr": "ICR (Coverage)",
    "category": "solvency",
    "formula": "ICR (×) = (Profit Before Tax + Interest Expense) ÷ Interest Expense (EBIT ÷ Interest)",
    "meaning": "Determines how easily a company can pay interest on outstanding debt from operating earnings (EBIT).",
    "conceptualUse": "Solvency buffer test. Below 1.5x indicates high debt distress risk. An unexpected EBITDA contraction could trigger payment defaults, credit rating downgrades, or bankruptcy restructuring.",
    "benchmark": "Comfortable: > 4.0x. Acceptable: 2.5x - 4.0x. Danger threshold: < 1.5x.",
    "notes": "Featured in Overview ratio chip strip, Yearly Ratios, and Annual Debt Plot.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Ratio Strip · Yearly Ratios · Annual Debt Plot"
  },
  {
    "id": "borrowings-deposits",
    "name": "Borrowings / Deposits (%) [Bank / BFSI]",
    "abbr": "Borrowings / Deposits",
    "category": "solvency",
    "formula": "Borrowings / Deposits (%) = (Wholesale Borrowings ÷ Customer Deposits) × 100",
    "meaning": "Evaluates the bank’s reliance on volatile wholesale, interbank, and capital market borrowings compared to sticky, granular retail deposits.",
    "conceptualUse": "Wholesale borrowings are sensitive to money market interest rates and liquidity flight. High reliance on wholesale borrowing leaves the bank vulnerable to sudden liquidity freezes.",
    "benchmark": "Healthy: Below 15% - 20%. Lower is safer as retail deposits provide superior stability.",
    "notes": "Reported in Bank Overview, Bank Yearly Ratios, and Bank Annual Plots.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · Bank Annual Plot"
  },
  {
    "id": "equity-total-assets",
    "name": "Equity / Total Assets (%) [Bank / BFSI]",
    "abbr": "Equity / Assets %",
    "category": "solvency",
    "formula": "Equity / Total Assets (%) = (Total Equity Capital ÷ Total Balance Sheet Assets) × 100",
    "meaning": "The ultimate solvency and capital adequacy cushion of a bank. Reflects how much asset loss can be absorbed before depositor funds are impaired.",
    "conceptualUse": "Evaluates capital adequacy and downside cushion. Low ratios (< 6%) signify dangerously high balance-sheet leverage, leaving zero margin for loan portfolio shocks.",
    "benchmark": "Healthy: 8% - 13%. Basel III mandates minimum regulatory Tier-1 capital ratios above 9% - 11.5%.",
    "notes": "Tracked in Bank Yearly Ratios and Bank Annual Plots.",
    "applicableTo": "bank",
    "whereUsed": "Bank Yearly Ratios · Bank Annual Plot"
  },
  {
    "id": "bank-ldr",
    "name": "Loan-to-Deposit Ratio (LDR / CDR %) [Bank / BFSI]",
    "abbr": "LDR / CDR %",
    "category": "solvency",
    "formula": "LDR (%) = (Total Loans & Advances ÷ Total Customer Deposits) × 100",
    "meaning": "Measures how aggressively a bank deploys customer deposits into lending assets. An essential measure of lending utilization, funding mix, and liquidity risk.",
    "conceptualUse": "RBI closely monitors LDR. If deposits lag loan growth (LDR > 85%), the bank must curtail lending or offer higher deposit rates, impacting NIM and triggering liquidity tightness.",
    "benchmark": "Healthy range: 70% to 80%. Above 85% signals liquidity tightness requiring costly wholesale market borrowing.",
    "notes": "Featured in Bank Overview, Bank Yearly Ratios, and Bank Annual Plots.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · Bank Annual Plot"
  },
  {
    "id": "casa-ratio",
    "name": "CASA Ratio (%) [Bank / BFSI]",
    "abbr": "CASA %",
    "category": "solvency",
    "formula": "CASA (%) = ((Current Account Deposits + Savings Account Deposits) ÷ Total Deposits) × 100",
    "meaning": "The proportion of customer deposits held in zero-interest Current Accounts and low-interest Savings Accounts.",
    "conceptualUse": "The primary structural moat in banking. Higher CASA dramatically lowers cost of deposits (CoD), providing a decisive structural margin advantage over competitors.",
    "benchmark": "Best-in-class Indian banks achieve 40% - 48%. Average commercial banks hover between 30% - 38%.",
    "notes": "Detailed in Data Checks compendium and Bank About Section.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Analytics & Glossary"
  },
  {
    "id": "current-ratio",
    "name": "Current Ratio (×)",
    "abbr": "Current Ratio",
    "category": "liquidity",
    "formula": "Current Ratio (×) = Current Assets (Other Assets) ÷ Current Liabilities (Other Liabilities)",
    "meaning": "Measures short-term liquidity buffer against immediate operational liabilities due within one year.",
    "conceptualUse": "Tests whether the company can meet short-term obligations. A ratio below 1.0x indicates potential liquidity distress, unless the company operates with negative working capital (like FMCG/retailers where trade payables fund business operations).",
    "benchmark": "Healthy manufacturing: 1.33x - 2.0x. Fast-cycle consumer FMCG: 0.8x - 1.2x.",
    "notes": "Shown in Overview ratio strip, Yearly Ratios, and Liquidity Plots.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Ratio Strip · Yearly Ratios · Annual Liquidity Plot"
  },
  {
    "id": "quick-ratio",
    "name": "Quick Ratio / Acid Test (×)",
    "abbr": "Quick Ratio",
    "category": "liquidity",
    "formula": "Quick Ratio (×) = (Current Assets − Inventory) ÷ Current Liabilities",
    "meaning": "Strict liquidity buffer excluding illiquid raw materials, work-in-progress, and finished goods inventory.",
    "conceptualUse": "Tests if the company can survive immediate creditor demands without relying on forced inventory liquidation at heavy discounts.",
    "benchmark": "Conservative: > 1.0x. Acceptable: 0.8x - 1.0x.",
    "notes": "Included in Yearly Ratios and Annual Liquidity Plot.",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios · Annual Liquidity Plot"
  },
  {
    "id": "cash-ratio",
    "name": "Cash Ratio (%)",
    "abbr": "Cash Ratio %",
    "category": "liquidity",
    "formula": "Cash Ratio (%) = (Cash & Bank Balances ÷ Current Liabilities or Other Liabilities) × 100",
    "meaning": "The proportion of short-term liabilities that can be settled immediately with cash on hand.",
    "conceptualUse": "The most conservative liquidity metric: completely eliminates collection delay risks on receivables and selling delay risks on inventory.",
    "benchmark": "Healthy: 20% - 50%. High cash ratios (> 60%) indicate fortress balance sheets.",
    "notes": "Displayed in Overview ratio strip, Yearly Ratios, and Liquidity Plots.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Ratio Strip · Yearly Ratios · Annual Liquidity Plot"
  },
  {
    "id": "bank-liquidity",
    "name": "Cash & Liquidity (%) [Bank / BFSI]",
    "abbr": "Liquidity %",
    "category": "workingcap",
    "formula": "Liquidity (%) = (Cash & Bank Balances ÷ (Borrowings + Other Liabilities)) × 100",
    "meaning": "Liquid cash reserves covering non-deposit liabilities and wholesale market borrowings.",
    "conceptualUse": "Buffer against unexpected liquidity crunches or wholesale debt rollover requirements.",
    "benchmark": "Healthy: 10% - 20%.",
    "notes": "Reported in Bank Yearly Ratios and Bank Liquidity Plot.",
    "applicableTo": "bank",
    "whereUsed": "Bank Yearly Ratios · Bank Liquidity Plot"
  },
  {
    "id": "debtor-days",
    "name": "Debtor Days / Days Sales Outstanding (DSO)",
    "abbr": "Debtor Days",
    "category": "workingcap",
    "formula": "DSO (Days) = (Trade Receivables ÷ Annual Sales) × 365 | Screener official #ratios",
    "meaning": "The average number of days taken to collect cash payments from customers after invoice billing.",
    "conceptualUse": "Measures customer bargaining power and credit discipline. A sudden spike in DSO signals customer financial distress or aggressive channel stuffing (booking sales before actual collection).",
    "benchmark": "Cash/Retail: < 15 days. Industrial B2B: 45 - 75 days. Government/EPC utilities: 90 - 180+ days.",
    "notes": "Extracted from Screener official #ratios table or calculated via Trade Receivables / (Sales / 365).",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios · Working Capital Plots"
  },
  {
    "id": "creditor-days",
    "name": "Creditor Days / Days Payable Outstanding (DPO)",
    "abbr": "Creditor Days",
    "category": "workingcap",
    "formula": "DPO (Days) = (Trade Payables ÷ Annual Sales) × 365 | Screener official #ratios & schedules",
    "meaning": "The average number of days the company takes to settle trade obligations with its suppliers and vendors.",
    "conceptualUse": "Measures supplier bargaining power. Extended supplier credit provides non-interest working capital funding. However, excessively high payable days can strain vendor relationships.",
    "benchmark": "Healthy: 45 - 90 days. Extended supplier credit provides non-interest working capital funding.",
    "notes": "Sourced from Screener official #ratios or expanded Balance Sheet & Cash Flow schedules. Unstated values remain null without artificial assumptions.",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios · Working Capital Plots"
  },
  {
    "id": "inventory-days",
    "name": "Inventory Days / Days Inventory Outstanding (DIO)",
    "abbr": "Inventory Days",
    "category": "workingcap",
    "formula": "DIO (Days) = (Inventories ÷ Annual Sales) × 365 | Screener official #ratios",
    "meaning": "The average number of days raw materials, work-in-progress, and finished goods sit in stock before being sold.",
    "conceptualUse": "Inventory efficiency indicator. Rising DIO combined with falling sales points to inventory obsolescence risk and potential future write-downs.",
    "benchmark": "FMCG: 20 - 45 days. Auto/Engineering: 50 - 80 days. Capital Goods/EPC: 90 - 150 days.",
    "notes": "Extracted from Screener official #ratios table or calculated via Inventories / (Sales / 365).",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios · Working Capital Plots"
  },
  {
    "id": "ccc",
    "name": "Cash Conversion Cycle (CCC Days)",
    "abbr": "CCC (Days)",
    "category": "workingcap",
    "formula": "CCC (Days) = Debtor Days + Inventory Days − Creditor Days | Screener official #ratios",
    "meaning": "The net number of days it takes for capital invested in raw materials and inventory to cycle back into operating cash from sales.",
    "conceptualUse": "The ultimate test of working capital prowess. Negative or near-zero CCC (e.g. FMCG/retailers where vendors fund the inventory) allows businesses to grow without consuming cash. Expanding CCC drains cash and destroys ROCE.",
    "benchmark": "Negative to near-zero is elite. Standard manufacturing: 30 - 75 days. Working-capital heavy: > 100 days.",
    "notes": "Extracted from Screener official #ratios or computed via DSO + DIO - DPO.",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios · Working Capital Plots"
  },
  {
    "id": "working-capital-days",
    "name": "Working Capital Days",
    "abbr": "WC Days",
    "category": "workingcap",
    "formula": "WC Days = (Working Capital ÷ Annual Sales) × 365 | Screener official #ratios",
    "meaning": "Quantifies the total days of annual revenue tied up in operational working capital assets.",
    "conceptualUse": "Measures total operational drag. Lower days mean more capital is available for reinvestment, dividends, or debt reduction.",
    "benchmark": "Negative or low (< 25 days) denotes elite working capital management. > 90 days indicates heavy capital drag.",
    "notes": "Sourced from Screener official #ratios table or calculated via Working Capital / (Sales / 365).",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios"
  },
  {
    "id": "current-asset-comp",
    "name": "Current Asset Composition & Balance Sheet Mix (%)",
    "abbr": "Asset Mix %",
    "category": "workingcap",
    "formula": "Liabilities/Assets % · Current Assets/Assets % · Receivables/CA % · Inventory/CA % · Cash/CA %",
    "meaning": "Anatomical breakdown of balance-sheet capital allocation across fixed assets, cash, receivables, and inventory.",
    "conceptualUse": "Structural health check. Detects dangerous balance-sheet shifts, such as ballooning illiquid receivables while cash evaporates, or excessive unproductive corporate investments.",
    "benchmark": "Receivables should not exceed 30%-40% of Current Assets in healthy industrial firms.",
    "notes": "Visualized in Special Analysis Plot (`special-current-asset-composition`) and Annual Asset Mix.",
    "applicableTo": "nonbank",
    "whereUsed": "Special Analysis Plots · Annual Asset Mix Plot"
  },
  {
    "id": "cfo-pat",
    "name": "CFO / PAT (Cash Flow Quality Ratio)",
    "abbr": "CFO / PAT",
    "category": "cashflow",
    "formula": "CFO / PAT (×) = Cash from Operating Activities (CFO) ÷ Net Profit After Tax (PAT)",
    "meaning": "The quintessential earnings quality check: measures how much of reported accounting P&L net profit actually converts into hard bank cash.",
    "conceptualUse": "Forensic earnings test. Accounting profits can be inflated via aggressive revenue recognition or capitalized expenses, but CFO cannot easily be faked. Over a multi-year period, cumulative CFO/PAT must be >= 0.85x - 1.0x. Persistent divergence (PAT rising while CFO stagnates) is a major red flag for aggressive accounting or bloated working capital.",
    "benchmark": "High quality: > 0.85x - 1.1x over a multi-year cumulative period. Below 0.6x is a red flag.",
    "notes": "Featured in Overview Cash History Table, Yearly Ratios, and Profit & Cash Generation Plot.",
    "applicableTo": "all",
    "whereUsed": "Overview Cash History · Yearly Ratios · Cash Profit Plot"
  },
  {
    "id": "cfo-sales",
    "name": "CFO / Sales (%)",
    "abbr": "CFO / Sales %",
    "category": "cashflow",
    "formula": "CFO / Sales (%) = (Cash from Operating Activities ÷ Annual Sales) × 100",
    "meaning": "The real cash margin generated per rupee of revenue after paying operating expenses and absorbing working capital changes.",
    "conceptualUse": "Unlike OPM (which is an accrual concept), CFO/Sales shows the actual cash harvested from sales. Used as a baseline input in the Forecast Calculator for forward cash flow projections.",
    "benchmark": "Asset-light services: > 20% - 25%. Manufacturing: 12% - 18%. Low-margin retail: 2% - 5%.",
    "notes": "Available in Overview Cash History Table, Yearly Ratios, and Forecast Calculator.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Cash History · Yearly Ratios · Forecast Calculator"
  },
  {
    "id": "cfo-ebitda",
    "name": "CFO / EBITDA (or CFO / Operating Profit %)",
    "abbr": "CFO / EBITDA %",
    "category": "cashflow",
    "formula": "CFO / EBITDA (%) = (Cash from Operating Activities ÷ Operating Profit) × 100",
    "meaning": "Conversion rate of operating earnings before interest and depreciation into cash from operations.",
    "conceptualUse": "Pinpoints working capital efficiency. When CFO/EBITDA is close to 100%, working capital is neutral. If CFO/EBITDA is only 40%, 60% of operating profits were absorbed by uncollected customer invoices or unsold inventory.",
    "benchmark": "Healthy: > 75% - 95%.",
    "notes": "Included in Overview Cash History Table, Yearly Ratios, and Peer Comparison (`cfo_ebit_pct`).",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Cash History · Yearly Ratios · Peer Comparison"
  },
  {
    "id": "fcf",
    "name": "Free Cash Flow (FCF ₹ Cr)",
    "abbr": "FCF (₹ Cr)",
    "category": "cashflow",
    "formula": "FCF = Cash from Operating Activities (CFO) − Capital Work-in-Progress (CWIP) / CapEx additions",
    "meaning": "The discretionary cash surplus generated by core operations after paying for all asset maintenance and growth capital investments.",
    "conceptualUse": "The fundamental source of all intrinsic shareholder value. FCF is the cash management can distribute as dividends, use for share buybacks, pay down debt, or fund acquisitions without external borrowing or equity dilution.",
    "benchmark": "Consistently positive and growing FCF is the hallmark of great compounders.",
    "notes": "Displayed in Overview, Yearly Ratios, Forecast Calculator, and Visual Plots.",
    "applicableTo": "all",
    "whereUsed": "Overview Snapshot · Yearly Ratios · Forecast Calculator · Annual Cash Profit Plot"
  },
  {
    "id": "fcf-net-profit",
    "name": "FCF / Net Profit (%)",
    "abbr": "FCF / PAT %",
    "category": "cashflow",
    "formula": "FCF / Net Profit (%) = (Free Cash Flow ÷ Net Profit After Tax) × 100",
    "meaning": "The percentage of net profit converted into discretionary free cash flow after meeting all capital expenditure needs.",
    "conceptualUse": "Differentiates capital-light compounders from capital-heavy conveyor belts. Capital-heavy companies may show high reported net profits, but all cash is absorbed by endless machinery replacement, leaving zero cash for shareholders.",
    "benchmark": "Asset-light leaders: > 60% - 85%. Capital-intensive manufacturing: 20% - 40%.",
    "notes": "Reported in Overview Cash History Table and Yearly Ratios.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Cash History · Yearly Ratios"
  },
  {
    "id": "fcf-cfo",
    "name": "FCF / CFO (%)",
    "abbr": "FCF / CFO %",
    "category": "cashflow",
    "formula": "FCF / CFO (%) = (Free Cash Flow ÷ Cash from Operating Activities) × 100",
    "meaning": "The proportion of operating cash flow retained as free cash flow after deducting capital expenditures.",
    "conceptualUse": "Reflects the reinvestment requirement of the business. A high ratio (> 65%) indicates that the company does not need heavy ongoing CapEx to maintain its competitive position.",
    "benchmark": "Quality asset-light: > 65% - 80%.",
    "notes": "Included in Yearly Ratios table.",
    "applicableTo": "nonbank",
    "whereUsed": "Yearly Ratios"
  },
  {
    "id": "fcf-sales",
    "name": "FCF / Sales (%)",
    "abbr": "FCF / Sales %",
    "category": "cashflow",
    "formula": "FCF / Sales (%) = (Free Cash Flow ÷ Annual Sales) × 100",
    "meaning": "Free cash flow generated per rupee of revenue.",
    "conceptualUse": "Essential for Discounted Cash Flow (DCF) modeling and long-term intrinsic value calculations.",
    "benchmark": "Outstanding: > 10% - 15%. Average: 4% - 8%.",
    "notes": "Featured in Overview Cash History Table and Forecast Calculator.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Cash History · Forecast Calculator"
  },
  {
    "id": "cash-flow-activities",
    "name": "Macro Cash Flow Activities (CFO, CFI, CFF & Net Cash Flow ₹ Cr)",
    "abbr": "CFO / CFI / CFF",
    "category": "cashflow",
    "formula": "Net Cash Flow = Cash from Operations (CFO) + Cash from Investing (CFI) + Cash from Financing (CFF)",
    "meaning": "Visualizes the complete macro cash generation and allocation life cycle of the corporation.",
    "conceptualUse": "The classic hallmark of high-quality compounders is robust positive CFO funding negative CFI (productive CapEx) and negative CFF (dividends and debt repayment). If a company shows Negative CFO funded by Positive CFF (debt/equity raising), it is on an unsustainable lifeline.",
    "benchmark": "CFO > 0, CFI < 0, CFF < 0 for mature compounders.",
    "notes": "Visualized in the Annual Cash Flow Activities Plot (`annual-cash-flow-activities`).",
    "applicableTo": "all",
    "whereUsed": "Annual Cash Flow Activities Plot"
  },
  {
    "id": "cwip",
    "name": "Capital Work in Progress (CWIP ₹ Cr)",
    "abbr": "CWIP (₹ Cr)",
    "category": "cashflow",
    "formula": "CWIP = Balance Sheet Capital Work in Progress",
    "meaning": "Monitors uncommissioned plant, machinery, and facility construction projects under active execution.",
    "conceptualUse": "Chronically high CWIP without capitalization indicates project execution delays, cost overruns, or impaired capital assets. When CWIP capitalizes into Net Block, revenue should surge.",
    "benchmark": "10% - 35% of Net Block during expansion phases.",
    "notes": "Visualized in Annual Net Block and CWIP Plots.",
    "applicableTo": "nonbank",
    "whereUsed": "Annual Net Block Plot · Annual CWIP Plot · Data Sheet"
  },
  {
    "id": "cwip-net-block",
    "name": "CWIP / Net Block (%)",
    "abbr": "CWIP / Net Block %",
    "category": "cashflow",
    "formula": "CWIP / Net Block (%) = (Capital Work in Progress ÷ Net Block) × 100",
    "meaning": "The scale of ongoing factory and asset expansion relative to the company's existing productive asset base.",
    "conceptualUse": "Elevated CWIP / Net Block (> 30%-50%) indicates major capacity expansion under construction. When CWIP capitalizes into Net Block, revenue and production should surge.",
    "benchmark": "15% - 40% during major capex expansions.",
    "notes": "Overlaid as a percentage line on the Annual Net Block Plot.",
    "applicableTo": "nonbank",
    "whereUsed": "Annual Net Block Plot"
  },
  {
    "id": "wc-changes",
    "name": "Granular Working Capital Movements (Screener Deeper Schedules)",
    "abbr": "WC Movements",
    "category": "cashflow",
    "formula": "Working Capital Movement = ΔReceivables + ΔInventory + ΔPayables (extracted behind Screener '+' button)",
    "meaning": "Granular cash inflows and outflows absorbed by working capital components during revenue expansion.",
    "conceptualUse": "Root-cause diagnostic isolating the individual working capital line items that drive or impair operating cash flows. Shows exactly why CFO surged or contracted in any given fiscal year.",
    "benchmark": "Working capital changes should remain modest relative to sales expansion.",
    "notes": "Extracted from Screener.in expanded Cash Flow from Operations schedule.",
    "applicableTo": "nonbank",
    "whereUsed": "Sales vs WC vs CFO Plot · CFO vs Rec vs Inv vs Pay Plot"
  },
  {
    "id": "pe",
    "name": "Price to Earnings Ratio (P/E ×)",
    "abbr": "P/E Ratio",
    "category": "valuation",
    "formula": "P/E (×) = Current Market Capitalization ÷ Trailing Twelve Months (TTM) Net Profit",
    "meaning": "Valuation multiple indicating how many rupees investors are willing to pay today for each rupee of annual earnings.",
    "conceptualUse": "Core valuation anchor. Compare current PE against: (a) company's own 3-year historical average PE, (b) sector median PE, and (c) earnings growth rate. Low PE can be a value trap if earnings are at a cyclical peak; high PE requires sustainable > 20% EPS growth.",
    "benchmark": "Mature utilities/banks: 10x - 18x. Steady compounders: 25x - 45x. High-growth market leaders: 50x+.",
    "notes": "Shown in Overview Snapshot, Peer Comparison (Current vs 3Y Avg & % Diff), and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Overview Snapshot · Peer Comparison · Forecast Calculator"
  },
  {
    "id": "pb",
    "name": "Price to Book Ratio (P/B ×)",
    "abbr": "P/B Ratio",
    "category": "valuation",
    "formula": "P/B (×) = Current Market Capitalization ÷ Latest Net Worth (Equity + Reserves)",
    "meaning": "Valuation comparison between market value and net balance-sheet accounting equity. Indispensable for banks & NBFCs.",
    "conceptualUse": "For banks and financial lenders, P/B is directly tied to ROE: a bank compounding book value at 18% ROE commands a 2.5x - 3.5x P/B premium, whereas a bank earning 8% ROE warrants < 1.0x P/B.",
    "benchmark": "Commercial banks: 1.2x to 3.0x. High-return asset-light leaders: > 8x - 15x.",
    "notes": "Featured in Overview Snapshot, Peer Comparison (Current vs 3Y Avg & % Diff), and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Overview Snapshot · Peer Comparison · Forecast Calculator"
  },
  {
    "id": "ps",
    "name": "Price to Sales Ratio (P/S ×)",
    "abbr": "P/S Ratio",
    "category": "valuation",
    "formula": "P/S (×) = Current Market Capitalization ÷ Trailing Twelve Months (TTM) Sales",
    "meaning": "Valuation multiple comparing market value against total annual revenue.",
    "conceptualUse": "Useful for valuing cyclical companies during earnings troughs or turnaround situations where net profit is temporarily depressed.",
    "benchmark": "Consumer FMCG: 4x - 8x. IT: 3x - 7x. Manufacturing: 1x - 3x. Retail: 0.5x - 1.5x.",
    "notes": "Included in Overview Snapshot, Peer Comparison, and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Overview Snapshot · Peer Comparison · Forecast Calculator"
  },
  {
    "id": "dividend-yield",
    "name": "Dividend Yield (D.Yield %)",
    "abbr": "Div Yield %",
    "category": "valuation",
    "formula": "Dividend Yield (%) = (Annual Dividend Per Share ÷ Current Market Price) × 100",
    "meaning": "Cash return generated solely through dividend distributions relative to current share price.",
    "conceptualUse": "Provides a cash return floor during bear markets. Watch out for 'dividend traps': a high yield (> 7-8%) in cyclical commodity firms often signals that market price has collapsed in anticipation of an upcoming profit crash.",
    "benchmark": "Growth companies: 0.2% - 1.2%. Dividend compounders: 1.5% - 3.0%. Mature utilities/PSUs: 4.5% - 7.5%.",
    "notes": "Tracked in Peer Comparison table and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Peer Comparison · Forecast Calculator"
  },
  {
    "id": "earnings-yield",
    "name": "Earnings Yield (%)",
    "abbr": "Earnings Yield %",
    "category": "valuation",
    "formula": "Earnings Yield (%) = (EPS ÷ Current Market Price) × 100 = (1 ÷ P/E Ratio) × 100",
    "meaning": "The annual net earnings generated per rupee of stock price; the equity equivalent of a bond yield.",
    "conceptualUse": "Used to compare stock valuations directly against risk-free government bond yields (e.g. 10Y G-Sec yield ~ 7.0%). If a stock's earnings yield is 2% (50x PE) while bond yields are 7%, the stock must deliver substantial earnings growth to justify the premium.",
    "benchmark": "Compare against the 10-Year Government Bond Yield (~ 7.0% in India).",
    "notes": "Computed in Forecast Calculator forward yields table.",
    "applicableTo": "all",
    "whereUsed": "Forecast Calculator Forward Multiples Table"
  },
  {
    "id": "eps",
    "name": "Earnings Per Share (EPS ₹)",
    "abbr": "EPS (₹)",
    "category": "valuation",
    "formula": "EPS (₹) = Net Profit After Tax ÷ Adjusted Number of Equity Shares (in Crore)",
    "meaning": "Net profit allocated to each individual equity share outstanding.",
    "conceptualUse": "The core compounding metric for individual shareholders. Long-term stock returns are directly tethered to EPS growth. Dilution through rights issues or ESOPs reduces EPS growth even if company net profit grows.",
    "benchmark": "Consistent > 15% CAGR compounding.",
    "notes": "Displayed in Overview Per-Share Summary, Yearly Ratios, Quarterly Ratios, Plots, and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Overview Per Share Summary · Yearly Ratios · Quarterly Ratios · Forecast Calculator · Annual Plots"
  },
  {
    "id": "dps",
    "name": "Dividend Per Share (DPS ₹)",
    "abbr": "DPS (₹)",
    "category": "valuation",
    "formula": "DPS (₹) = Total Dividend Amount ÷ Adjusted Number of Equity Shares",
    "meaning": "Direct cash dividend returned to shareholders per share held.",
    "conceptualUse": "Signal of cash generation reality. Companies that consistently grow DPS prove that accounting profits are backed by hard bank cash.",
    "benchmark": "Steady annual growth matching or trailing EPS growth.",
    "notes": "Featured in Overview Per Share Summary, Yearly Plots, and Forecast Calculator.",
    "applicableTo": "all",
    "whereUsed": "Overview Per Share Summary · Annual Dividend Plot · Forecast Calculator"
  },
  {
    "id": "dividend-payout",
    "name": "Dividend Payout Ratio (%)",
    "abbr": "Payout %",
    "category": "valuation",
    "formula": "Dividend Payout (%) = (Total Dividend Amount ÷ Net Profit After Tax) × 100",
    "meaning": "The proportion of annual net earnings distributed to shareholders as dividends.",
    "conceptualUse": "Measures capital allocation discipline. A growing company with high ROCE (> 25%) should retain most profits (payout 15-30%) to reinvest at high rates. A mature utility with limited growth opportunities should return 60-80% as dividends.",
    "benchmark": "Compounders: 20% - 40%. Cash cows: 50% - 75%.",
    "notes": "Included in Overview Return History, Yearly Ratios, Plots, and Peer Comparison.",
    "applicableTo": "all",
    "whereUsed": "Overview Return History · Yearly Ratios · Peer Comparison · Annual Dividend Plot"
  },
  {
    "id": "sps",
    "name": "Sales Per Share (SPS ₹)",
    "abbr": "SPS (₹)",
    "category": "valuation",
    "formula": "SPS (₹) = Annual Sales ÷ Adjusted Number of Equity Shares",
    "meaning": "Top-line revenue generated per unit of equity share.",
    "conceptualUse": "Tracks top-line compounding per share, free from margin fluctuations.",
    "benchmark": "Steady growth matching sales growth rate.",
    "notes": "Generated in Forecast Calculator projection table.",
    "applicableTo": "nonbank",
    "whereUsed": "Forecast Calculator Projection Table"
  },
  {
    "id": "bvps",
    "name": "Book Value Per Share (BVPS / BVS ₹)",
    "abbr": "BVPS (₹)",
    "category": "valuation",
    "formula": "BVPS (₹) = Total Equity Net Worth ÷ Adjusted Number of Equity Shares",
    "meaning": "Net balance-sheet accounting equity backing each individual share.",
    "conceptualUse": "Compounding floor. Book value increases annually by: BVPS_{t+1} = BVPS_t + EPS − DPS. For banks and financial institutions, long-term valuation is anchored to BVPS compounding.",
    "benchmark": "> 14% - 18% annual growth.",
    "notes": "Modeled in Forecast Calculator forward projections.",
    "applicableTo": "all",
    "whereUsed": "Forecast Calculator Projection Table · Bank Analysis"
  },
  {
    "id": "fcf-per-share",
    "name": "Free Cash Flow Per Share (FCF / Share ₹)",
    "abbr": "FCF / Share",
    "category": "valuation",
    "formula": "FCF / Share (₹) = Free Cash Flow ÷ Adjusted Number of Equity Shares",
    "meaning": "Discretionary cash surplus produced per share after meeting all capital expenditures.",
    "conceptualUse": "Real cash owner earnings per share. Can be directly compared against EPS to assess quality of earnings.",
    "benchmark": "High quality: FCF/Share closely mirrors or exceeds EPS over multi-year cycles.",
    "notes": "Highlighted in Overview Per Share Summary and Forecast Calculator.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Per Share Summary · Forecast Calculator"
  },
  {
    "id": "cfo-per-share",
    "name": "Operating Cash Flow Per Share (CFO / Share ₹)",
    "abbr": "CFO / Share",
    "category": "valuation",
    "formula": "CFO / Share (₹) = Cash from Operations ÷ Adjusted Number of Equity Shares",
    "meaning": "Core operating cash flow generated per share.",
    "conceptualUse": "Used to calculate Cash Flow Yield (CFO per share / Market price).",
    "benchmark": "Positive and growing in tandem with operational expansion.",
    "notes": "Modeled in Forecast Calculator forward table.",
    "applicableTo": "nonbank",
    "whereUsed": "Forecast Calculator Projection Table"
  },
  {
    "id": "adjusted-shares",
    "name": "Adjusted Equity Shares in Crore (Share Capital Base)",
    "abbr": "Shares (Cr)",
    "category": "valuation",
    "formula": "Adjusted Shares (Cr) = Total Common Shares Outstanding retroactively adjusted for splits & bonuses",
    "meaning": "The normalized share count base used across all per-share calculations.",
    "conceptualUse": "Ensures historical per-share metrics (EPS, BVPS, DPS) are comparable across time without artificial step-changes from stock splits.",
    "benchmark": "Stable or declining (via buybacks). Spiking share count indicates equity dilution.",
    "notes": "Extracted from Data Sheet and used throughout per-share and valuation models.",
    "applicableTo": "all",
    "whereUsed": "Parse Workbook · Overview · Forecast Calculator"
  },
  {
    "id": "forward-projections",
    "name": "Forward Value & Valuation Multiples Projections (Forecast Studio)",
    "abbr": "Forward Studio",
    "category": "valuation",
    "formula": "Simulates 1 to 10-year forward sales, SPS, EPS, BVPS, DPS, CFO/sh, FCF/sh, Forward PE, PB, and Yields based on user growth and margin assumptions",
    "meaning": "Interactive financial model projecting future per-share compounded intrinsic trajectory.",
    "conceptualUse": "Enables sensitivity testing of investment theses: shows what forward multiple you are paying 3 or 5 years out under realistic growth assumptions.",
    "benchmark": "Test base, bull, and bear scenarios.",
    "notes": "Interactive modal opened via 'Forecast Studio' button in header.",
    "applicableTo": "all",
    "whereUsed": "Forecast Studio Modal"
  },
  {
    "id": "52w-range-dma",
    "name": "52-Week Price Range Track & Moving Averages (50 DMA / 200 DMA)",
    "abbr": "52W Range & DMAs",
    "category": "technicals",
    "formula": "Range = 52W Low to High · CMP (Cyan ◆), 50 DMA (Amber ●), 200 DMA (Purple ▲) · Range % = [200 × (High − Low) ÷ (High + Low)]",
    "meaning": "Visualizes where the stock price is currently trading relative to its 1-year low and high boundaries, alongside the 50-day and 200-day simple moving averages to identify technical trend strength.",
    "conceptualUse": "Highlights market sentiment and price volatility. CMP > 50 DMA > 200 DMA indicates strong bullish momentum. CMP < 200 DMA indicates long-term consolidation or corrective phase. Stocks trading near 52W highs during broader market downturns demonstrate relative strength.",
    "benchmark": "CMP > 50 DMA > 200 DMA denotes Stage 2 accumulation.",
    "notes": "Displayed as an interactive horizontal track widget in Peer Comparison across Bank and Non-Bank peer tables.",
    "applicableTo": "all",
    "whereUsed": "Peer Comparison Table (Track Widget)"
  },
  {
    "id": "50-dma",
    "name": "50-Day Moving Average (50 DMA)",
    "abbr": "50 DMA",
    "category": "technicals",
    "formula": "50 DMA = Arithmetic mean of closing prices over the past 50 trading sessions (Small Blue Triangle ▼)",
    "meaning": "Intermediate technical trend indicator representing institutional cost basis over ~10 weeks.",
    "conceptualUse": "Acts as dynamic support in ongoing uptrends. When stock pulls back to 50 DMA on declining volume and bounces, institutions are defending their positions.",
    "benchmark": "Stock price should hold above 50 DMA in a healthy bull phase.",
    "notes": "Integrated into 52W Range Track in Peer Comparison.",
    "applicableTo": "all",
    "whereUsed": "Peer Comparison Track Widget"
  },
  {
    "id": "200-dma",
    "name": "200-Day Moving Average (200 DMA)",
    "abbr": "200 DMA",
    "category": "technicals",
    "formula": "200 DMA = Arithmetic mean of closing prices over the past 200 trading sessions (Big Orange Triangle ▼)",
    "meaning": "Long-term trend baseline separating secular bull markets from bear phases.",
    "conceptualUse": "Golden Cross (50 DMA crosses above 200 DMA) and Death Cross (50 DMA crosses below 200 DMA). A stock trading below its 200 DMA is in a confirmed long-term downtrend.",
    "benchmark": "CMP > 200 DMA confirms long-term institutional sponsorship.",
    "notes": "Overlaid on 52W Range Track in Peer Comparison.",
    "applicableTo": "all",
    "whereUsed": "Peer Comparison Track Widget"
  },
  {
    "id": "pe-pb-relative-diff",
    "name": "P/E & P/B Relative Valuation vs 3-Year Historical Average (% Diff)",
    "abbr": "PE/PB 3Y Diff %",
    "category": "technicals",
    "formula": "Diff (%) = ((Current Multiple − 3-Year Average Multiple) ÷ 3-Year Average Multiple) × 100 | Format: 15.94 [25.69] (-37.95%)",
    "meaning": "Compares current market valuation multiple against the company’s own 3-year historical average multiple.",
    "conceptualUse": "Mean reversion indicator. If a company with intact business fundamentals trades at a -35% discount to its 3Y average PE, it represents a potential valuation re-rating opportunity. If it trades at a +60% premium, future growth expectations are fully priced in.",
    "benchmark": "Negative percentage indicates valuation discount relative to historical norm.",
    "notes": "Displayed in the Peer Comparison table for PE and PB columns.",
    "applicableTo": "all",
    "whereUsed": "Peer Comparison Table (PE & PB Columns)"
  },
  {
    "id": "peer-median",
    "name": "Industry Peer Median & Relative Benchmark",
    "abbr": "Peer Median",
    "category": "technicals",
    "formula": "Median value computed across all industry peers for each individual financial metric in the peer table",
    "meaning": "The sector middle benchmark representing standard industry performance.",
    "conceptualUse": "Eliminates outlier distortions. Allows investors to see immediately whether the target company has above-median margins, return ratios, and cash quality, justifying an above-median valuation multiple.",
    "benchmark": "Target company should outperform peer median across ROE, ROCE, and OPM.",
    "notes": "Calculated and rendered as a dedicated summary row in Peer Comparison.",
    "applicableTo": "all",
    "whereUsed": "Peer Comparison Table (Median Row)"
  },
  {
    "id": "promoter-holding",
    "name": "Promoter Holding & Promoter Pledging (%)",
    "abbr": "Promoter %",
    "category": "governance",
    "formula": "Promoter Holding (%) = (Promoter Shares ÷ Total Share Capital) × 100 · Pledging % = (Pledged Shares ÷ Promoter Shares) × 100",
    "meaning": "Equity ownership held by the founding promoters/controlling group and whether any shares are pledged as collateral for debt.",
    "conceptualUse": "'Skin in the game'. High promoter holding (> 50-70%) aligns founder interests with minority shareholders. Promoter pledging > 15-20% is a severe warning flag: if the stock price drops, lenders can invoke pledge and dump shares, causing a catastrophic margin call death spiral.",
    "benchmark": "Safe: Promoter holding > 50% with zero (0%) pledging.",
    "notes": "Featured in Holding Section with quarterly and yearly trend tracking.",
    "applicableTo": "all",
    "whereUsed": "Holding Section (Quarterly & Yearly Shareholding)"
  },
  {
    "id": "fii-holding",
    "name": "Foreign Institutional Investors (FII / FPI %)",
    "abbr": "FII %",
    "category": "governance",
    "formula": "FII Holding (%) = (Shares held by Foreign Portfolio Investors ÷ Total Share Capital) × 100",
    "meaning": "Equity ownership held by global institutional funds, sovereign wealth funds, and foreign asset managers.",
    "conceptualUse": "Validates global institutional due diligence and liquidity. Rapid FII outflows during global risk-off episodes can cause temporary price corrections in high-FII stocks.",
    "benchmark": "High FII stake (> 15-25%) indicates global institutional validation.",
    "notes": "Tracked in Holding Section with sequential delta chips.",
    "applicableTo": "all",
    "whereUsed": "Holding Section"
  },
  {
    "id": "dii-holding",
    "name": "Domestic Institutional Investors (DII %)",
    "abbr": "DII %",
    "category": "governance",
    "formula": "DII Holding (%) = (Shares held by Mutual Funds, Insurance & Financial Institutions ÷ Total Share Capital) × 100",
    "meaning": "Equity ownership held by domestic mutual funds, insurance companies (LIC), and domestic pension funds.",
    "conceptualUse": "Represents sticky domestic SIP inflows. Steady sequential accumulation by domestic mutual funds over multiple quarters is a bullish institutional signal.",
    "benchmark": "Rising DII stake cushions stocks against foreign capital flight.",
    "notes": "Detailed in Holding Section.",
    "applicableTo": "all",
    "whereUsed": "Holding Section"
  },
  {
    "id": "public-holding",
    "name": "Public & Retail Shareholding (%)",
    "abbr": "Public %",
    "category": "governance",
    "formula": "Public Holding (%) = (Shares held by retail individuals and non-institutional public ÷ Total Share Capital) × 100",
    "meaning": "Equity ownership held by individual retail investors.",
    "conceptualUse": "Contrarian governance indicator. When retail holding drops while institutional stake rises, smart money is accumulating from weak hands. When retail holding explodes while promoters or institutions sell, distribution to the public is occurring at cycle tops.",
    "benchmark": "Lower public float (< 20-30%) with rising institutional stake is favorable.",
    "notes": "Reported in Holding Section.",
    "applicableTo": "all",
    "whereUsed": "Holding Section"
  },
  {
    "id": "shareholder-count",
    "name": "Total Shareholder Count (Retail Breadth)",
    "abbr": "Shareholders",
    "category": "governance",
    "formula": "Total number of individual demat accounts holding company equity shares",
    "meaning": "The total breadth of retail shareholder ownership.",
    "conceptualUse": "A massive surge in shareholder count (+40% to 100% in a few quarters) usually indicates aggressive retail hype and institutional distribution. A declining shareholder count indicates supply absorption by long-term holders.",
    "benchmark": "Declining or stable shareholder count during price consolidations signals accumulation.",
    "notes": "Tracked as the bottom row in the Holding Section table.",
    "applicableTo": "all",
    "whereUsed": "Holding Section"
  },
  {
    "id": "holding-delta",
    "name": "Period-over-Period Ownership Delta (Δ %)",
    "abbr": "Holding Δ %",
    "category": "governance",
    "formula": "Delta (%) = Current Quarter Holding % − Previous Quarter Holding %",
    "meaning": "Net change in equity ownership category between sequential quarters.",
    "conceptualUse": "Instantly highlights active institutional accumulation or promoter selling in real time.",
    "benchmark": "Positive delta chips (green) signify accumulation; negative (red) indicate stake reduction.",
    "notes": "Displayed as interactive badges alongside shareholding percentages.",
    "applicableTo": "all",
    "whereUsed": "Holding Section"
  },
  {
    "id": "robust-weighted-avg",
    "name": "Robust Weighted Average with IQR Outlier Winsorization",
    "abbr": "Robust W.Avg (IQR)",
    "category": "analytics",
    "formula": "IQR = Q3 − Q1 · Outliers winsorized at [Q1 − 1.5×IQR, Q3 + 1.5×IQR] · Linear recency weights with EQ = 100/N and 50% spread ratio",
    "meaning": "Advanced statistical estimator designed to calculate representative multi-year historical averages for financial ratios.",
    "conceptualUse": "Standard arithmetic means are severely distorted by one-off black swan years (e.g. Covid lockdown shock) or extraordinary asset sales. This robust algorithm automatically clamps extreme outliers using Interquartile Range (IQR) Winsorization and gives higher predictive weight to recent operating years.",
    "benchmark": "Superior to simple averages for multi-year financial modeling.",
    "notes": "Engineered in `rollingPerShare.ts`; powers the 'AVG' column in Overview Return History, Cash History, and Per Share Summary.",
    "applicableTo": "all",
    "whereUsed": "Overview Return History · Cash History · Per Share Summary · DuPont Table"
  },
  {
    "id": "recency-weighting",
    "name": "Linear Recency Weighting (50% Spread Ratio)",
    "abbr": "Recency Weighting",
    "category": "analytics",
    "formula": "EQ = 100 ÷ N · Weights increase linearly from oldest to newest with 100 × (newest − oldest) ÷ EQ = 50%",
    "meaning": "Weights historical annual financial data points so recent fiscal years exert greater influence on the average than ancient years.",
    "conceptualUse": "A business 10 years ago may have operated in different product lines or under different management. Recency weighting reflects current business realities while retaining multi-year perspective.",
    "benchmark": "Applies when N > 5 annual data points are present.",
    "notes": "Implemented in `calculateRobustWeightedAverage` across the entire dashboard.",
    "applicableTo": "all",
    "whereUsed": "Overview Return History · Cash History · Per Share Summary"
  },
  {
    "id": "rolling-cash-ratio",
    "name": "Rolling Cash Ratio Average (3-Year Rolling Sums)",
    "abbr": "Rolling Cash 3Y",
    "category": "analytics",
    "formula": "Window Ratio = (Σ_{3Y} Cash Flow Numerator ÷ Σ_{3Y} Denominator) × 100, evaluated across rolling 3-year windows",
    "meaning": "Multi-year rolling cash conversion estimator for CFO/Sales, FCF/Sales, CFO/PAT, and FCF/PAT.",
    "conceptualUse": "Eliminates single-year working capital timing anomalies (e.g. advance received on March 30 or inventory bulk purchased on March 31) to show true normalized multi-year cash conversion.",
    "benchmark": "Skips loss windows where denominator is <= 0.",
    "notes": "Programmed in `calculateRollingCashRatioAverage` in `rollingPerShare.ts`.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Cash History Table (Custom Average Column)"
  },
  {
    "id": "quadratic-curve-fit",
    "name": "Quadratic Curve Fitting & R² Goodness-of-Fit Validation",
    "abbr": "Quadratic Fit & R²",
    "category": "analytics",
    "formula": "Fits y = ax² + bx + c via least-squares matrix inversion · R² = 1 − (Residual SS ÷ Total SS) · Uses fitted 3Y CAGR when N >= 6 and R² > 80%",
    "meaning": "Non-linear regression modeling that captures accelerating or decelerating compound growth trends.",
    "conceptualUse": "Standard point-to-point CAGR only compares the start year and end year, making it vulnerable to cherry-picked base years. Quadratic fit uses every intermediate year's data point and validates fit quality with R². If the model fits (R² > 80%), it delivers an objective trend-fitted CAGR.",
    "benchmark": "R² > 0.80 indicates highly reliable trend fit.",
    "notes": "Powers the 'AVG' CAGR column in Overview and Forecast Calculator default growth inputs.",
    "applicableTo": "all",
    "whereUsed": "Overview CAGR Table · Forecast Calculator Sales Growth Default"
  },
  {
    "id": "gnpa-ratio",
    "name": "Gross Non-Performing Assets (GNPA %)",
    "abbr": "GNPA %",
    "category": "solvency",
    "formula": "GNPA (%) = (Gross NPAs ÷ Gross Advances) × 100",
    "meaning": "Measures the total proportion of loan assets that have stopped generating interest income because payments of principal or interest remain overdue for more than 90 days (RBI NPA classification). Represents the gross quantum of impaired lending.",
    "conceptualUse": "The primary headline indicator of loan book stress and underwriting risk. A surging GNPA indicates loose lending standards, adverse economic shocks, or aggressive loan expansion into vulnerable borrower segments. Red Flag: Beware when loan growth exceeds 30% while GNPA appears unnaturally low; rapid loan book expansion mechanically dilutes the GNPA ratio in the short term until unseasoned loans mature (vintage risk). Also beware of loan 'evergreening'—extending fresh loans to delinquent borrowers to keep them out of NPA status.",
    "benchmark": "Pristine: Below 1.5% - 2.0% (top tier private banks). Acceptable: 2.5% - 4.0%. Severe Stress: Above 6.0% (indicates systemic underwriting failure and capital impairment risk).",
    "notes": "Reported quarterly and annually in Bank P&L / Balance Sheet notes, RBI supervisory returns, and Bank Overview.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · RBI Supervisory Disclosures"
  },
  {
    "id": "nnpa-ratio",
    "name": "Net Non-Performing Assets (NNPA %)",
    "abbr": "NNPA %",
    "category": "solvency",
    "formula": "NNPA (%) = ((Gross NPAs − Cumulative Provisions) ÷ (Gross Advances − Cumulative Provisions)) × 100",
    "meaning": "Measures the actual unprovided, at-risk impaired assets on the bank's balance sheet after subtracting the cash provisions already charged against past profits. Reflects true residual insolvency risk for equity shareholders.",
    "conceptualUse": "The single most crucial solvency metric for bank equity investors. If Net NPA exceeds a bank's Net Worth (Equity Capital + Free Reserves), the bank is technically balance-sheet insolvent and subject to RBI Prompt Corrective Action (PCA), mandatory capital infusion, or merger. A collapsing NNPA toward zero indicates that a bank has fully provisioned for historical bad debts and future earnings will be freed from aggressive provisioning drags.",
    "benchmark": "Fortress: Below 0.5% (HDFC Bank, ICICI Bank, Kotak). Healthy: 0.5% - 1.2%. Warning: Above 2.0%. Critical Solvency Threat: Above 3.5% - 4.0%.",
    "notes": "Key driver of bank credit ratings, Basel III equity adequacy assessments, and P/B multiple expansion.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · Solvency & Liquidity Checks"
  },
  {
    "id": "crar-ratio",
    "name": "Capital to Risk-Weighted Assets Ratio (CRAR / CAR %)",
    "abbr": "CRAR %",
    "category": "solvency",
    "formula": "CRAR (%) = ((Tier 1 Capital + Tier 2 Capital) ÷ Total Risk-Weighted Assets (RWA)) × 100",
    "meaning": "Measures the bank's total capital buffer against unexpected loan defaults and market losses, expressed as a percentage of its risk-weighted assets. Tier 1 comprises permanent core equity and disclosed reserves; Tier 2 comprises subordinated bonds, revaluation reserves, and general loss provisions.",
    "conceptualUse": "Defines the bank's growth runway and resilience to shocks. Banks cannot expand their lending books without maintaining regulatory CRAR. A bank with CRAR near regulatory minimums cannot grow organically without diluting existing equity holders through discounted rights issues or QIPs. High CRAR (> 16-18%) indicates a bulletproof capital foundation with multi-year organic compounding capability without dilution.",
    "benchmark": "RBI Regulatory Minimum: 9.0% standard, 11.5% including 2.5% Capital Conservation Buffer (CCB). Domestic Systemically Important Banks (D-SIBs: SBI, HDFC, ICICI) require additional 0.20% - 0.80% buffers. Healthy Private Banks: 16% - 20%.",
    "notes": "Mandated under Basel III regulatory accords. Common Equity Tier 1 (CET-1) is the purest component.",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Balance Sheet Schedules · Regulatory Capital Checks"
  },
  {
    "id": "tier1-ratio",
    "name": "Tier-1 Capital Adequacy Ratio (CET-1 & AT1 %)",
    "abbr": "Tier-1 CAR %",
    "category": "solvency",
    "formula": "Tier 1 CAR (%) = (Core Tier 1 Capital ÷ Total Risk-Weighted Assets) × 100",
    "meaning": "Measures the bank's core capital consisting of permanent common equity, share premium, and statutory free reserves (CET-1) plus qualifying Additional Tier-1 (AT-1) perpetual bonds. Represents loss-absorbing capital on a going-concern basis.",
    "conceptualUse": "High-quality capital test. While Tier-2 debt only absorbs losses during bankruptcy/liquidation, Tier-1 absorbs losses while the bank continues normal operations. Watch out for over-reliance on AT-1 bonds (which can be written down or converted during distress, as seen in Yes Bank and Credit Suisse crises). Pure CET-1 above 14% represents gold-standard banking strength.",
    "benchmark": "RBI Regulatory Minimum: 7.0% (CET-1) / 8.875% with CCB. Tier 1 minimum: 8.875%. Top-tier private banks maintain Tier 1 between 14.0% and 18.0%.",
    "notes": "Reported under Basel III Pillar 3 disclosures and quarterly investor presentations.",
    "applicableTo": "bank",
    "whereUsed": "Bank Balance Sheet Schedules · Basel III Capital Disclosures"
  },
  {
    "id": "pcr-standalone",
    "name": "Provision Coverage Ratio (PCR %)",
    "abbr": "PCR %",
    "category": "solvency",
    "formula": "PCR (%) = (Cumulative Loan Loss Provisions Held ÷ Gross NPAs) × 100",
    "meaning": "Measures what percentage of total bad loans has already been covered by setting aside profits as loss provisions. Shows the balance sheet buffer protecting against future loan write-offs.",
    "conceptualUse": "Leading indicator of future earnings surprises. When PCR is high (> 75-80%), future recoveries from bad loans flow directly into P&L as write-backs, boosting profitability. Conversely, when PCR is low (< 60%), aging loan rules mandate continuous fresh provisioning charges each quarter even if no new bad loans appear, severely suppressing net profit.",
    "benchmark": "RBI Recommended Minimum: 70%. Best-in-class Indian Banks: 75% - 85%+. Vulnerable Banks: Below 65%.",
    "notes": "Includes both specific loan loss provisions and technical write-offs (Floating Provisions / Counter-cyclical buffers).",
    "applicableTo": "bank",
    "whereUsed": "Bank Overview · Bank Yearly Ratios · Asset Quality Checks"
  },
  {
    "id": "credit-cost",
    "name": "Credit Cost Ratio (%)",
    "abbr": "Credit Cost %",
    "category": "solvency",
    "formula": "Credit Cost (%) = (Annualized Loan Loss Provisions in P&L ÷ Average Gross Advances) × 100",
    "meaning": "Measures the annual provisioning expense charged to the income statement as a proportion of total loans disbursed. Represents the annualized cost of bad loan write-offs in the lending business.",
    "conceptualUse": "The true structural operating risk penalty of a lender. In benign credit environments, credit cost sits below 0.5% - 1.0%. During corporate credit downcycles or retail unsecured defaults, credit costs can spike above 2.5% - 4.0%, completely wiping out the bank's Net Interest Margin (NIM) and triggering operating losses.",
    "benchmark": "Conservative / High-Quality Lenders: 0.3% - 0.8%. Average Corporate/Retail Banks: 1.0% - 1.5%. Distressed / High-Risk MFI/NBFC: Above 2.5% - 4.0%.",
    "notes": "Calculated by isolating loan loss provisions from tax and operational overhead provisions in P&L.",
    "applicableTo": "bank",
    "whereUsed": "Bank P&L Analysis · Credit Risk Valuation · Risk-Adjusted Return Checks"
  },
  {
    "id": "slippage-ratio",
    "name": "Slippage Ratio (%)",
    "abbr": "Slippage %",
    "category": "solvency",
    "formula": "Slippage Ratio (%) = (Fresh Additions to NPAs during Period ÷ Standard Advances at Start of Period) × 100",
    "meaning": "Measures the rate at which standard, performing loans deteriorate into non-performing loans over a financial quarter or year. Isolates fresh stress from write-offs and recoveries.",
    "conceptualUse": "Crucial early-warning diagnostic. Headline GNPA can artificially decline if a bank aggressively writes off old bad loans. Slippage ratio reveals whether the underlying loan book is genuinely stabilizing or continuing to deteriorate. A falling slippage ratio with high recovery signals an imminent turnaround in bank profitability.",
    "benchmark": "Excellent: Below 1.0% annualized. Moderate: 1.2% - 2.0%. Warning: Above 2.5% annualized.",
    "notes": "Reported in quarterly investor presentations and management concall disclosures.",
    "applicableTo": "bank",
    "whereUsed": "Bank Quarterly Ratios · Asset Quality Trend Analysis"
  },
  {
    "id": "cost-of-funds",
    "name": "Cost of Funds (CoF %)",
    "abbr": "Cost of Funds %",
    "category": "margins",
    "formula": "Cost of Funds (%) = (Total Annual Interest Expended ÷ Average (Total Customer Deposits + Borrowings)) × 100",
    "meaning": "Measures the average blended interest rate the bank pays to its depositors and debt holders to finance its interest-bearing balance sheet liabilities.",
    "conceptualUse": "The ultimate moat indicator for a bank liability franchise. Banks that maintain low Cost of Funds can comfortably underwrite prime, low-risk corporate and home loan borrowers at competitive rates while preserving fat Net Interest Margins (NIM). Banks with high Cost of Funds are forced to lend to risky, subprime borrowers to earn adequate spreads.",
    "benchmark": "Leading Retail Banks (SBI, HDFC, Kotak): 4.2% - 5.5% (driven by high CASA). Wholesale / Emerging Banks: 6.5% - 8.0%+.",
    "notes": "Directly counterbalanced by Yield on Advances to determine the Net Interest Margin (NIM).",
    "applicableTo": "bank",
    "whereUsed": "Bank P&L Spread Analysis · Liability Moat Evaluation"
  },
  {
    "id": "yield-on-advances",
    "name": "Yield on Advances (%)",
    "abbr": "Yield on Advances %",
    "category": "margins",
    "formula": "Yield on Advances (%) = (Interest Earned on Loans & Advances ÷ Average Gross Advances) × 100",
    "meaning": "Measures the average gross interest yield generated by the bank across its entire lending portfolio (corporate, SME, mortgage, auto, credit card, and microfinance).",
    "conceptualUse": "Portfolio risk barometer. A bank boasting an 14% - 16% yield is not necessarily a better business; it indicates high exposure to unsecured personal loans, microfinance, or stressed developers, which will carry severe credit costs during cyclical downturns. Compare Yield on Advances against Cost of Funds to evaluate lending spread stability.",
    "benchmark": "Secured Mortgages / Corporate: 8.0% - 9.5%. Diversified Retail / SME: 9.5% - 11.5%. High-Yield Unsecured / MFI: 14.0% - 20.0%+.",
    "notes": "Disclosed in Bank Annual Reports, Investor Presentations, and Yield Breakdown Schedules.",
    "applicableTo": "bank",
    "whereUsed": "Bank Lending Portfolio Schedules · Spread Analysis"
  },
  {
    "id": "ev-ebitda",
    "name": "Enterprise Value to EBITDA (EV / EBITDA ×)",
    "abbr": "EV / EBITDA",
    "category": "valuation",
    "formula": "EV / EBITDA (×) = Enterprise Value ÷ EBITDA = (Market Cap + Total Debt + Minority Interest − Cash & Investments) ÷ (Operating Profit + Other Income before D&A)",
    "meaning": "Valuation multiple measuring the total company acquisition cost relative to its core cash earnings before non-cash depreciation, interest, and taxes. Capital-structure neutral metric comparing leveraged vs debt-free companies.",
    "conceptualUse": "Superior to P/E when evaluating capital-intensive businesses or comparing companies with vastly different debt loads. P/E can be artificially lowered by taking on dangerous levels of debt (which artificially boosts ROE). EV/EBITDA accounts for total debt obligations. Valuation Trap: Watch out for EBITDA boosted by capital lease accounting (Ind-AS 116 / IFRS 16) where rent is reclassified into depreciation and interest, artificially inflating EBITDA while debt increases.",
    "benchmark": "Undervalued / Mature Industrials: 6x - 10x. Fair Value Manufacturing: 12x - 16x. Premium High-Growth / FMCG: 20x - 30x+. Above 35x indicates severe valuation froth.",
    "notes": "Widely used in M&A, DCF exit multiple modeling, and cross-company capital structure comparisons.",
    "applicableTo": "nonbank",
    "whereUsed": "Forecast Calculator · Peer Comparison · Valuation Overview"
  },
  {
    "id": "net-debt-ebitda",
    "name": "Net Debt to EBITDA (×)",
    "abbr": "Net Debt / EBITDA",
    "category": "solvency",
    "formula": "Net Debt / EBITDA (×) = (Total Gross Borrowings − Cash & Liquid Investments) ÷ Operating EBITDA",
    "meaning": "Measures how many years of current operating cash profit would be needed to pay off all company debt after exhausting liquid cash reserves. The standard leverage metric used by credit rating agencies.",
    "conceptualUse": "Primary debt distress gauge. Unlike Debt-to-Equity (which can be distorted by asset write-downs or share buybacks reducing book equity), Net Debt / EBITDA measures debt against actual cash generation. A ratio over 3.0x indicates dangerous leverage where any downturn in EBITDA could trigger credit rating downgrades, debt covenant breaches, or debt servicing failure. Negative Net Debt indicates a pristine net cash fortress.",
    "benchmark": "Conservative / Fortress: Negative (Net Cash) or Below 1.0x. Healthy: 1.0x - 2.0x. Caution: 2.5x - 3.5x. Distress Warning: Above 4.0x.",
    "notes": "Favored by corporate bond rating agencies (CRISIL, ICRA, S&P) and syndicated loan covenants.",
    "applicableTo": "nonbank",
    "whereUsed": "Overview Solvency Strip · Solvency Plots · Balance Sheet Checks"
  }
]

export const PLOT_DEFINITIONS: PlotDefinition[] = [
  {
    "id": "annual-sales",
    "title": "Sales (Annual & TTM)",
    "subtitle": "Annual and TTM sales · ₹ crore columns",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Annual Sales (₹ Cr) · Trailing Twelve Months (TTM) Sales (₹ Cr)",
    "dataSource": "Screener P&L Statement (Annual Disclosures & Quarters summation)",
    "meaning": "Tracks the long-term historical trajectory of top-line revenue alongside the latest Trailing Twelve Months (TTM) run-rate.",
    "conceptualUse": "Assesses volume expansion, pricing gains, and scale. Comparing the TTM column with the latest full FY column shows whether top-line momentum is accelerating or decelerating right now.",
    "interpretation": "A rising stair-step pattern indicates persistent demand expansion. If TTM sales fall below the latest FY, demand has hit a sudden slowdown.",
    "interactiveControls": "Period range slider · Metric tooltips · Mouse drag zoom · Reset button"
  },
  {
    "id": "annual-pbt",
    "title": "Profit Before Tax (PBT) & [PBT − Depreciation]",
    "subtitle": "Annual and TTM PBT & PBT less depreciation · ₹ crore",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Profit Before Tax (PBT ₹ Cr) · [PBT − Depreciation] (₹ Cr)",
    "dataSource": "P&L Statement (Profit before tax & Depreciation schedules)",
    "meaning": "Evaluates operating earnings after debt interest charges, juxtaposed against earnings after absorbing plant and equipment depreciation.",
    "conceptualUse": "Measures the real economic cash generation before tax. High capital-intensive firms often report PBT that is heavily reduced by depreciation; comparing both shows the drag of past physical CapEx.",
    "interpretation": "Widening gap between PBT and [PBT − Depreciation] signals aggressive ongoing asset depreciation from heavy capital expenditures.",
    "interactiveControls": "Period range slider · Metric tooltips · Zoom and pan controls"
  },
  {
    "id": "annual-profit",
    "title": "Net Profit (Annual & TTM)",
    "subtitle": "Annual and TTM net profit · ₹ crore columns",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Annual Net Profit (₹ Cr) · TTM Net Profit (₹ Cr)",
    "dataSource": "P&L Statement (Net Profit line) & Latest 4 Quarters aggregation",
    "meaning": "Visualizes the long-term bottom-line earnings power of the business attributable to shareholders.",
    "conceptualUse": "The ultimate driver of intrinsic equity value and EPS compounding. Cross-check against the Sales plot: if sales doubled over 5 years but net profit stagnated, costs are eroding value.",
    "interpretation": "Look for consistent upward stair-step growth with TTM leading the trend. Severe volatility indicates high operating or financial leverage.",
    "interactiveControls": "X-axis period slider · Y-axis auto-scale · Mouse drag range selection"
  },
  {
    "id": "annual-margins",
    "title": "Profit Margins (GPM, OPM & NPM %)",
    "subtitle": "Annual GPM, OPM and NPM · TTM OPM and NPM · % lines",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Gross Profit Margin (GPM %) · Operating Profit Margin (OPM %) · Net Profit Margin (NPM %)",
    "dataSource": "P&L Statement (Sales, Raw Materials, Operating Profit & Net Profit)",
    "meaning": "Visualizes the conversion efficiency at each tier of the income statement across multiple years and TTM.",
    "conceptualUse": "Displays margin resilience across economic cycles. If GPM expands while OPM contracts, overheads or employee costs are inflating. A wide gap between OPM and NPM highlights high debt interest or steep depreciation charges.",
    "interpretation": "Expanding margins over a 5-10 year timeline demonstrate strong competitive moats and pricing power. GPM is automatically suppressed when raw materials are unstated.",
    "interactiveControls": "X-axis period slider · Tooltips with precise decimals · Drag-to-zoom"
  },
  {
    "id": "annual-sales-operating-net-profit",
    "title": "Sales, Operating Profit & Net Profit Combo",
    "subtitle": "₹ crore columns · GPM, OPM & NPM % lines on right axis",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Sales (₹ Cr) · Operating Profit (₹ Cr) · Net Profit (₹ Cr) · GPM (%) · OPM (%) · NPM (%)",
    "dataSource": "P&L Statement comprehensive annual disclosures",
    "meaning": "Comprehensive dual-axis overview combining top-line volume, intermediate operating earnings, bottom-line net profit, and corresponding margin percentages.",
    "conceptualUse": "All-in-one view of operational leverage. When revenue bars increase moderately while profit bars explode upward, positive operating leverage is actively multiplying earnings.",
    "interpretation": "Check if margin lines (right axis) trend upward simultaneously with rising volume bars (left axis) — the definitive signature of a compounder.",
    "interactiveControls": "Dual-axis toggle · Period slider · Hover crosshair · Reset button"
  },
  {
    "id": "annual-dividend",
    "title": "Dividend Amount & Payout Ratio",
    "subtitle": "Dividend amount · ₹ crore; payout ratio · % line",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Total Dividend Amount (₹ Cr) · Dividend Payout Ratio (%)",
    "dataSource": "P&L Dividend disclosures & Cash Flow financing distributions",
    "meaning": "Monitors total corporate cash distributed to equity shareholders versus the percentage of annual net earnings paid out.",
    "conceptualUse": "Evaluates capital allocation policy. Growing dividend amounts with stable payout ratios (20%-35%) indicate disciplined management returning surplus cash while retaining sufficient growth capital.",
    "interpretation": "A sudden spike in payout ratio to > 80%-100% indicates earnings have collapsed while dividends were artificially maintained, signaling an imminent dividend cut.",
    "interactiveControls": "Period range slider · Dual-axis tooltip · Zoom controls"
  },
  {
    "id": "annual-eps-dividend",
    "title": "EPS, Dividend per Share & Payout",
    "subtitle": "EPS & dividend per share in ₹; payout ratio · % line",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Earnings Per Share (EPS ₹) · Dividend Per Share (DPS ₹) · Dividend Payout (%)",
    "dataSource": "P&L Net Profit, share capital count & dividend distributions",
    "meaning": "Analyzes per-share earnings creation, per-share dividend distribution, and dividend payout discipline.",
    "conceptualUse": "Directly links corporate profits to individual share ownership. Watch whether DPS grows in tandem with EPS: consistent growth in both validates high-quality cash earnings.",
    "interpretation": "Steady upward trajectory in EPS with sustainable 20%-40% payout indicates high reinvestment efficiency.",
    "interactiveControls": "Period range slider · Metric chip toggles · Range drag zoom"
  },
  {
    "id": "annual-cash-flow-activities",
    "title": "Cash Flow Activities (CFO, CFI, CFF & Net)",
    "subtitle": "Operating, investing, financing and net cash flow · ₹ crore columns",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Cash from Operations (CFO ₹ Cr) · Cash from Investing (CFI ₹ Cr) · Cash from Financing (CFF ₹ Cr) · Net Cash Flow (₹ Cr)",
    "dataSource": "Cash Flow Statement macro activity sections",
    "meaning": "Visualizes the complete macro cash generation and allocation cycle of the business.",
    "conceptualUse": "Evaluates corporate life-cycle stage. The hallmark of elite compounders is robust positive CFO funding negative CFI (productive CapEx) and negative CFF (dividends and debt repayment). If a company has Negative CFO funded by Positive CFF (debt/equity raising), it is on an unsustainable lifeline.",
    "interpretation": "Healthy businesses exhibit tall green CFO bars, controlled blue negative CFI bars, and red negative CFF bars.",
    "interactiveControls": "Period slider · Hover inspection · Zoom and reset"
  },
  {
    "id": "annual-cash-profit",
    "title": "Profit & Cash Generation Reality Check",
    "subtitle": "Operating profit, OCF, FCF & net profit · ₹ crore",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Operating Profit (₹ Cr) · Operating Cash Flow (CFO ₹ Cr) · Free Cash Flow (FCF ₹ Cr) · Net Profit (₹ Cr)",
    "dataSource": "P&L Statement & Cash Flow Statement",
    "meaning": "The definitive earnings reality check: compares accounting accrual profits directly against actual cash collected and discretionary free cash flow.",
    "conceptualUse": "Detects aggressive accounting or working capital traps. If Net Profit grows steadily while CFO and FCF lag or turn negative, earnings are merely accounting entries trapped in unpaid customer bills or obsolete stock.",
    "interpretation": "In high-quality companies, CFO matches or exceeds Net Profit, and FCF stays consistently positive.",
    "interactiveControls": "Period range slider · Series toggles · Mouse drag range selection"
  },
  {
    "id": "annual-sales-wc-cfo",
    "title": "Sales vs Working Capital vs Cash from Operation",
    "subtitle": "Sales, working capital & cash from operation · ₹ crore",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Sales (₹ Cr) · Working Capital Changes / Balance (₹ Cr) · Cash from Operation (CFO ₹ Cr)",
    "dataSource": "Screener.in Expanded Cash from Operating Activity schedule (+ button) & P&L",
    "meaning": "Directly illustrates how working capital movements absorb or liberate operating cash during top-line revenue expansion.",
    "conceptualUse": "Identifies capital intensity of growth. If sales expand rapidly while working capital remains near zero or negative, suppliers are funding business growth (elite negative working capital). If working capital absorbs massive cash, growth is capital-hungry.",
    "interpretation": "Look for CFO expanding at least as fast as Sales without working capital drains.",
    "interactiveControls": "Period slider · Hover tooltips · Zoom controls"
  },
  {
    "id": "annual-cfo-rec-inv-pay",
    "title": "CFO vs Receivables vs Inventory vs Payables",
    "subtitle": "Cash from operation, receivables, inventory & payables · ₹ crore",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Cash from Operation (₹ Cr) · Receivables (₹ Cr) · Inventory (₹ Cr) · Payables (₹ Cr)",
    "dataSource": "Screener.in Detailed Cash Flow Schedules (expanded behind '+' button on CFO)",
    "meaning": "Granular root-cause diagnostic isolating the individual working capital line items that drive or impair operating cash flows.",
    "conceptualUse": "Shows exactly why CFO surged or contracted in any given fiscal year—whether driven by customer collections (Receivables), stock management (Inventory), or supplier credit (Payables).",
    "interpretation": "Spikes in receivables or inventory without corresponding rises in payables directly suppress the CFO bar.",
    "interactiveControls": "Period range slider · Metric chip inspection · Reset zoom"
  },
  {
    "id": "annual-working-capital",
    "title": "Sales, Receivables & Inventory",
    "subtitle": "Sales, receivables & inventory in ₹ crore",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Sales (₹ Cr) · Trade Receivables (₹ Cr) · Inventories (₹ Cr)",
    "dataSource": "Balance Sheet Other Assets schedules & P&L Sales",
    "meaning": "Monitors the accumulation of customer receivables and inventory relative to overall annual revenue scale.",
    "conceptualUse": "Identifies channel stuffing or inventory hoarding. If receivables grow at 35% while sales grow at only 10%, the company is either extending lenient credit to mask declining demand or customers are struggling to pay.",
    "interpretation": "Receivables and inventory bars should grow at or below the rate of sales growth.",
    "interactiveControls": "Period slider · Dual-axis tooltip · Drag to zoom"
  },
  {
    "id": "annual-net-block",
    "title": "Net Block & CWIP / Net Block (%)",
    "subtitle": "Net block · ₹ crore; CWIP / net block · % line on right axis",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Net Block (₹ Cr) · CWIP / Net Block (%)",
    "dataSource": "Balance Sheet Fixed Assets & Capital Work in Progress schedules",
    "meaning": "Tracks productive fixed asset expansion alongside ongoing construction projects as a percentage of operational capacity.",
    "conceptualUse": "Forward capacity indicator. Spikes in CWIP/Net Block (> 30%-50%) signal that a major factory or plant expansion is underway. Once commissioned, Net Block will jump and revenue capacity will expand.",
    "interpretation": "Look for CWIP/Net Block rising during construction, then dropping sharply as Net Block jumps, followed by rising revenue.",
    "interactiveControls": "Period range slider · Dual-axis display · Reset zoom"
  },
  {
    "id": "annual-cwip",
    "title": "Capital Work in Progress (CWIP)",
    "subtitle": "CWIP in ₹ crore columns",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Capital Work in Progress (CWIP ₹ Cr)",
    "dataSource": "Balance Sheet Fixed Assets schedule (CWIP line)",
    "meaning": "Monitors uncommissioned plant, machinery, factory, and facility construction projects.",
    "conceptualUse": "Execution risk monitor. Chronically high CWIP across 4-5 years without capitalization into Net Block points to severe project execution delays, cost overruns, or impaired assets.",
    "interpretation": "Healthy expansion shows cyclical CWIP peaks that quickly normalize as new plants go online.",
    "interactiveControls": "Period slider · Hover tooltips · Zoom controls"
  },
  {
    "id": "annual-equity",
    "title": "Equity Capital & Reserves",
    "subtitle": "Share capital plus reserves (Net Worth) · ₹ crore",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Total Shareholders' Equity (₹ Cr)",
    "dataSource": "Balance Sheet Equity Share Capital & Reserves schedules",
    "meaning": "Tracks the long-term compounding of net accounting shareholders' equity.",
    "conceptualUse": "The ultimate compounding visual. Shows whether retained earnings are steadily expanding the equity base year after year without dilution.",
    "interpretation": "Smooth upward staircase growth signifies high retained earnings compounding.",
    "interactiveControls": "Period range slider · Tooltips with precise crores"
  },
  {
    "id": "annual-cash-bank",
    "title": "Cash & Cash-Equivalent Balances",
    "subtitle": "Cash & bank · ₹ crore; cash / total assets · % line on right axis",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Cash & Bank Balances (₹ Cr) · Cash / Total Assets (%)",
    "dataSource": "Balance Sheet Current Assets & Bank schedules",
    "meaning": "Evaluates pure liquid cash reserves on the balance sheet and cash as a proportion of total corporate assets.",
    "conceptualUse": "Measures balance-sheet safety and war chest capacity. High cash allows companies to survive recessions, acquire distressed competitors, or fund new projects without debt.",
    "interpretation": "Consistent cash allocation of 8%-20% of assets denotes financial fortitude.",
    "interactiveControls": "Period slider · Dual-axis tooltip · Drag zoom"
  },
  {
    "id": "annual-de",
    "title": "Borrowings & Debt-to-Equity",
    "subtitle": "Total borrowings · ₹ crore; debt / equity · × line on right axis",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Borrowings (₹ Cr) · Debt-to-Equity (×)",
    "dataSource": "Balance Sheet Borrowings & Net Worth schedules",
    "meaning": "Visualizes total corporate borrowings juxtaposed against financial leverage (D/E ratio).",
    "conceptualUse": "Solvency tracking. Declining borrowings paired with falling D/E indicates aggressive debt deleveraging, which reduces financial risk and expands net margins via lower interest costs.",
    "interpretation": "D/E line trending below 0.5x indicates conservative debt management; above 1.5x signals high solvency risk.",
    "interactiveControls": "Period slider · Dual-axis toggle · Zoom controls"
  },
  {
    "id": "annual-returns",
    "title": "Return on Equity (ROE) & Return on Assets (ROA)",
    "subtitle": "ROE and ROA columns · %; ROA line overlaid on right axis",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Return on Equity (ROE %) · Return on Assets (ROA %) · ROA Overlay Line (%)",
    "dataSource": "P&L Statement & Balance Sheet multi-year returns",
    "meaning": "Compares equity return efficiency against total balance-sheet asset productivity over time.",
    "conceptualUse": "Differentiates genuine operational efficiency from debt-driven leverage. If ROE expands while ROA declines, the business is becoming less productive but is taking on more debt.",
    "interpretation": "High-quality compounders sustain ROE > 18%-25% and ROA > 10%-15% simultaneously.",
    "interactiveControls": "Period slider · Dual-axis scale · Drag zoom"
  },
  {
    "id": "annual-asset-mix",
    "title": "Current Assets, Net Block & Investments Share",
    "subtitle": "Current assets, net block and investments as a % of total assets",
    "category": "annual-corporate",
    "applicableTo": "nonbank",
    "metrics": "Current Assets / Total Assets (%) · Net Block / Total Assets (%) · Investments / Total Assets (%)",
    "dataSource": "Balance Sheet total asset component schedules",
    "meaning": "Shows structural capital allocation shifts across operating working assets, physical factories, and investment securities.",
    "conceptualUse": "Detects structural shifts in business model: e.g. shifting from manufacturing to asset-light outsourcing (Net Block share falls while Investments or Cash rises).",
    "interpretation": "Stable asset mix with high productive net block and controlled current assets indicates disciplined asset management.",
    "interactiveControls": "Period slider · Hover tooltips · Zoom controls"
  },
  {
    "id": "quarter-sales",
    "title": "Quarterly Sales",
    "subtitle": "Quarterly revenue · ₹ crore columns",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Quarterly Sales (₹ Cr)",
    "dataSource": "Screener Quarterly Disclosures",
    "meaning": "High-frequency tracking of revenue across recent sequential quarters.",
    "conceptualUse": "Reveals underlying quarterly momentum and seasonal cyclicality before annual reports are published.",
    "interpretation": "Look for sequential step-ups and seasonal patterns across Q1 to Q4.",
    "interactiveControls": "X-axis period slider · Tooltip inspection · Drag zoom"
  },
  {
    "id": "quarter-pbt",
    "title": "Quarterly PBT & [PBT − Depreciation]",
    "subtitle": "Quarterly PBT & PBT less depreciation · ₹ crore",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Quarterly PBT (₹ Cr) · [PBT − Depreciation] (₹ Cr)",
    "dataSource": "Screener Quarterly Financial Results",
    "meaning": "Quarterly pre-tax operating earnings before and after asset depreciation charges.",
    "conceptualUse": "Tracks quarterly cash operating earnings resilience after meeting debt interest obligations.",
    "interpretation": "Consistent positive spread confirms quarterly operational health.",
    "interactiveControls": "Period slider · Hover tooltips · Zoom controls"
  },
  {
    "id": "quarter-profit",
    "title": "Quarterly Net Profit",
    "subtitle": "Quarterly bottom-line earnings · ₹ crore",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Quarterly Net Profit After Tax (₹ Cr)",
    "dataSource": "Screener Quarterly Disclosures",
    "meaning": "High-frequency bottom-line net profit delivery across recent fiscal quarters.",
    "conceptualUse": "Identifies sudden quarterly shocks (e.g. tax hits, one-off charges, forex losses) that temporarily depress net profits.",
    "interpretation": "Smooth upward sequential trajectory confirms reliable quarterly compounding.",
    "interactiveControls": "Period slider · Hover tooltips · Zoom controls"
  },
  {
    "id": "quarter-margins",
    "title": "Quarterly Operating & Net Margins (OPM & NPM)",
    "subtitle": "Quarterly OPM and NPM · % lines",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Quarterly OPM (%) · Quarterly NPM (%)",
    "dataSource": "Screener Quarterly Financial Disclosures",
    "meaning": "Monitors quarterly operating and net profit margins across recent sequential quarters.",
    "conceptualUse": "Immediate margin sensitivity check. Detects whether raw material commodity surges or wage inflation are squeezing margins in recent quarters.",
    "interpretation": "Stable margins across quarters indicate strong pricing power and pricing pass-through agility.",
    "interactiveControls": "Period slider · Percentage tooltips · Drag zoom"
  },
  {
    "id": "quarter-sales-opm",
    "title": "Sales & OPM (Quarterly Combo)",
    "subtitle": "Quarterly sales · ₹ crore; OPM · % line on right axis",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Quarterly Sales (₹ Cr) · Operating Profit Margin (OPM %)",
    "dataSource": "Screener Quarterly Financial Results",
    "meaning": "High-frequency correlation between top-line quarterly revenue volume and operating profitability margin.",
    "conceptualUse": "Shows whether quarterly revenue spikes are accompanied by higher margins (economies of scale) or lower margins (discounting to boost volume).",
    "interpretation": "Sales bars and OPM line expanding together demonstrates strong demand with pricing power.",
    "interactiveControls": "Dual-axis toggle · Period slider · Hover crosshair"
  },
  {
    "id": "quarter-profit-npm",
    "title": "Operating Profit, Net Profit & NPM (Quarterly)",
    "subtitle": "Quarterly profits · ₹ crore; NPM · % line on right axis",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Operating Profit (₹ Cr) · Net Profit (₹ Cr) · Net Profit Margin (NPM %)",
    "dataSource": "Screener Quarterly Disclosures",
    "meaning": "Evaluates bottom-line net profit conversion across recent quarters.",
    "conceptualUse": "Identifies quarterly non-operating leakages (interest costs, tax adjustments) between operating profit and net profit.",
    "interpretation": "Widening gap between operating and net profit bars signals rising quarterly debt service or tax charges.",
    "interactiveControls": "Period slider · Dual-axis display · Reset zoom"
  },
  {
    "id": "quarter-cost-structure",
    "title": "Cost Structure Breakdown (Quarterly)",
    "subtitle": "Cost metrics as % of sales: material, employee & other expenses",
    "category": "quarterly-corporate",
    "applicableTo": "nonbank",
    "metrics": "Material Cost % of Sales · Employee Cost % of Sales · Other Expenses % of Sales",
    "dataSource": "Quarterly Disclosures Cost Breakdown schedules",
    "meaning": "Breaks down quarterly operating expense anatomy into raw materials, labor, and overheads.",
    "conceptualUse": "Isolates the exact cost line item responsible for quarterly margin swings. Shows whether margin expansion was driven by cheaper raw materials, employee productivity, or fixed overhead absorption.",
    "interpretation": "Declining material cost % alongside stable employee costs confirms expanding gross margins.",
    "interactiveControls": "Period slider · Percentage chip inspection · Reset zoom"
  },
  {
    "id": "special-yoy-growth",
    "title": "Year-on-Year Growth Dynamics",
    "subtitle": "Change from previous year · % (Sales, Operating Profit, Net Profit)",
    "category": "special-corporate",
    "applicableTo": "nonbank",
    "metrics": "Sales Growth YoY (%) · Operating Profit Growth YoY (%) · Net Profit Growth YoY (%)",
    "dataSource": "Annual multi-statement growth calculations",
    "meaning": "Multi-tier growth comparison showing the divergence between top-line expansion and bottom-line profit compounding.",
    "conceptualUse": "The definitive operational leverage visualizer. When Net Profit Growth and Operating Profit Growth bars rise far above Sales Growth bars, the business is enjoying high operating leverage.",
    "interpretation": "Profit bars exceeding sales growth bars indicates expanding profit margins.",
    "interactiveControls": "Period slider · Metric tooltips · Mouse drag zoom"
  },
  {
    "id": "special-sales-net-block",
    "title": "Sales / Net Block (Fixed Asset Turnover)",
    "subtitle": "Net block · ₹ crore; annual sales / net block · × line on right axis",
    "category": "special-corporate",
    "applicableTo": "nonbank",
    "metrics": "Net Block (₹ Cr) · Sales / Net Block (×)",
    "dataSource": "Balance Sheet Net Block & P&L Sales",
    "meaning": "Evaluates manufacturing asset productivity: how many rupees of revenue are produced per rupee of installed fixed assets.",
    "conceptualUse": "Vital during capacity expansions. If Net Block doubles but Sales/Net Block declines permanently, the capital allocation was inefficient or the plant is operating at low utilization.",
    "interpretation": "A rising Sales/Net Block line confirms improving plant utilization and high capital efficiency.",
    "interactiveControls": "Dual-axis toggle · Period slider · Reset button"
  },
  {
    "id": "special-current-asset-composition",
    "title": "Current Asset Composition & Balance Sheet Mix",
    "subtitle": "Current liabilities, current assets, receivables, inventory & cash as % of assets",
    "category": "special-corporate",
    "applicableTo": "nonbank",
    "metrics": "Liabilities / Assets (%) · Current Assets / Assets (%) · Receivables / CA (%) · Inventory / CA (%) · Cash / CA (%)",
    "dataSource": "Balance Sheet Current Assets & Liabilities schedules",
    "meaning": "Comprehensive balance-sheet structural analysis tracking the percentage distribution of working capital assets.",
    "conceptualUse": "Structural solvency monitor. Alerts investors if receivables or inventory begin consuming a disproportionate share of current assets while cash dwindles.",
    "interpretation": "Stable or falling receivables/CA alongside rising cash/CA indicates exceptional balance-sheet health.",
    "interactiveControls": "Period slider · Multi-line hover tooltips · Zoom controls"
  },
  {
    "id": "bank-interest-gap",
    "title": "Interest Earned & Interest Paid (Annual)",
    "subtitle": "₹ crore columns · Interest Ratio = Interest Paid ÷ Interest Earned (%) line",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Interest Earned (₹ Cr) · Interest Paid (₹ Cr) · Interest Ratio (%)",
    "dataSource": "Banking P&L Form B (Interest schedules)",
    "meaning": "The foundational revenue engine of a bank: interest earned on advances and treasury versus interest paid on customer deposits and borrowings.",
    "conceptualUse": "Visualizes the core lending spread. A widening gap between Interest Earned and Interest Paid columns reflects expanding Net Interest Income (NII) and cheap CASA deposit funding.",
    "interpretation": "A falling Interest Ratio line indicates expanding gross interest margins and lower cost of funds.",
    "interactiveControls": "Period slider · Dual-axis inspection · Drag zoom"
  },
  {
    "id": "bank-interest-other-income",
    "title": "Interest Earned & Other Income (Annual)",
    "subtitle": "₹ crore columns · Interest income contribution = Interest income ÷ Total income (%)",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Interest Earned (₹ Cr) · Other Income (₹ Cr) · Interest Income Contribution (%)",
    "dataSource": "Banking P&L Schedules 13 (Interest Earned) & 14 (Other Income)",
    "meaning": "Analyzes the revenue composition between core lending interest and non-interest fee/treasury income.",
    "conceptualUse": "Measures fee income diversification. Healthy banks generate 15%-25% of revenue from recurring other income (cards, wealth management, trade finance), which does not consume loan risk capital.",
    "interpretation": "Steady growth in other income provides a strong cushion during credit cycle downturns.",
    "interactiveControls": "Period slider · Dual-axis tooltip · Drag zoom"
  },
  {
    "id": "bank-revenue-expense-opm",
    "title": "Total Revenue & Total Expense (Annual)",
    "subtitle": "₹ crore columns · OPM = [(total revenue − total expense) ÷ total revenue] % line",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Total Revenue (₹ Cr) · Total Expense (₹ Cr) · Operating Profit Margin (%)",
    "dataSource": "Banking P&L Total Income and Expense schedules",
    "meaning": "Comprehensive banking revenue versus operating expenses, provisioning charges, and interest paid.",
    "conceptualUse": "Measures operational 'jaws'. When total revenue grows faster than total expenses, the jaws widen and operating profitability expands.",
    "interpretation": "A rising OPM line on the right axis demonstrates strong operating leverage and cost containment.",
    "interactiveControls": "Dual-axis toggle · Period slider · Hover crosshair"
  },
  {
    "id": "bank-pbt",
    "title": "Profit Before Tax (PBT) & [PBT − Depreciation] (Bank)",
    "subtitle": "Annual PBT & PBT less depreciation · ₹ crore",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Profit Before Tax (PBT ₹ Cr) · [PBT − Depreciation] (₹ Cr)",
    "dataSource": "Banking P&L Disclosures",
    "meaning": "Pre-tax banking earnings before and after absorbing physical branch and technological asset depreciation.",
    "conceptualUse": "Evaluates bottom-line pre-tax earnings resilience after meeting all funding costs, operating overheads, and loan loss provisions.",
    "interpretation": "Consistent upward trajectory confirms healthy pre-tax earnings generation.",
    "interactiveControls": "Period slider · Hover tooltips · Drag zoom"
  },
  {
    "id": "bank-profit-npm",
    "title": "Net Profit & NPM (Bank)",
    "subtitle": "Net profit · ₹ crore; NPM = net profit ÷ total revenue · % line on right axis",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Net Profit (₹ Cr) · Net Profit Margin (%)",
    "dataSource": "Banking P&L Disclosures",
    "meaning": "Bottom-line net profit after tax and its percentage conversion from total gross banking revenue.",
    "conceptualUse": "The ultimate measure of post-tax banking profitability. Reflects how much of gross revenue survives after interest costs, operating expenses, bad loan provisions, and taxes.",
    "interpretation": "NPM trending above 18%-22% indicates superior underwriting and cost efficiency.",
    "interactiveControls": "Period slider · Dual-axis display · Drag zoom"
  },
  {
    "id": "bank-dividend",
    "title": "Dividend & Payout (Bank)",
    "subtitle": "Dividend amount · ₹ crore; dividend payout · % line",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Dividend Amount (₹ Cr) · Dividend Payout (%)",
    "dataSource": "Banking Cash Flow & Profit Appropriation schedules",
    "meaning": "Monitors total dividend distributions and payout ratios for the banking institution.",
    "conceptualUse": "Capital adequacy check. Banks must retain adequate profits to fund future credit expansion and maintain RBI regulatory capital buffers.",
    "interpretation": "Conservative payout ratios (15%-25%) allow banks to compound capital internally.",
    "interactiveControls": "Period slider · Tooltip inspection · Zoom controls"
  },
  {
    "id": "bank-eps-dps",
    "title": "EPS, Dividend per Share & Payout (Bank)",
    "subtitle": "Per-share values · ₹; payout ratio · % line on right axis",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "EPS (₹) · Dividend Per Share (DPS ₹) · Dividend Payout (%)",
    "dataSource": "Banking share capital and profit distribution disclosures",
    "meaning": "Per-share earnings and cash dividend creation for banking shareholders.",
    "conceptualUse": "Evaluates per-share compounding and dividend reliability in the financial sector.",
    "interpretation": "Steady EPS growth accompanied by consistent DPS proves genuine profitability.",
    "interactiveControls": "Period slider · Dual-axis inspection · Drag zoom"
  },
  {
    "id": "bank-returns",
    "title": "Return on Equity (ROE) & Return on Assets (ROA) (Bank)",
    "subtitle": "ROE and ROA columns share scale; ROA overlaid as right-axis line",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Return on Equity (ROE %) · Return on Assets (ROA %) · ROA Overlay Line (%)",
    "dataSource": "Banking Financial Ratios & Balance Sheet Schedules",
    "meaning": "The premier profitability benchmark for commercial banking operations.",
    "conceptualUse": "Bedrock banking diagnostic. Elite commercial banks sustain ROA > 1.5% - 2.0% and ROE > 15% - 18% with pristine credit quality and high capital buffers.",
    "interpretation": "Rising ROA confirms improving asset quality and margin expansion.",
    "interactiveControls": "Period slider · Dual-axis toggle · Drag zoom"
  },
  {
    "id": "bank-equity-de",
    "title": "Equity & Borrowings / Equity (Bank)",
    "subtitle": "Equity and borrowings columns · ₹ crore; ratio line · × on right axis",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Equity Capital (₹ Cr) · Wholesale Borrowings (₹ Cr) · Borrowings / Equity (×)",
    "dataSource": "Banking Balance Sheet Capital & Borrowings schedules",
    "meaning": "Evaluates wholesale borrowing leverage relative to shareholders' net equity base.",
    "conceptualUse": "Monitors capital structure risk. High borrowings-to-equity exposes the bank to refinancing shocks during money market liquidity contractions.",
    "interpretation": "Borrowings/Equity line should remain conservative and stable.",
    "interactiveControls": "Period slider · Dual-axis tooltip · Drag zoom"
  },
  {
    "id": "bank-liquidity",
    "title": "Cash & Liquidity (Bank)",
    "subtitle": "Cash & Bank · ₹ crore; liquidity = cash ÷ (borrowings + other liabilities) · %",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Cash & Bank Balances (₹ Cr) · Liquidity Ratio (%)",
    "dataSource": "Banking Balance Sheet Schedules 6, 7 (Cash & Bank) & Liabilities",
    "meaning": "Monitors liquid cash reserves covering non-deposit liabilities and wholesale market borrowings.",
    "conceptualUse": "Measures immediate liquidity cushion against sudden interbank funding freezes or depositor runs.",
    "interpretation": "Healthy liquidity lines hover between 10% - 20% of non-deposit liabilities.",
    "interactiveControls": "Period slider · Dual-axis scale · Reset zoom"
  },
  {
    "id": "bank-assets",
    "title": "Total Assets, Loans & Advances & Borrowings",
    "subtitle": "₹ crore columns: total assets, loans & advances, and borrowings",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Total Assets (₹ Cr) · Loans & Advances (₹ Cr) · Borrowings (₹ Cr)",
    "dataSource": "Banking Balance Sheet Form A",
    "meaning": "Visualizes total balance sheet scale alongside the core commercial lending portfolio and wholesale borrowings.",
    "conceptualUse": "Evaluates lending asset dominance. In healthy commercial banks, Loans & Advances should constitute 65%-75% of total balance sheet assets.",
    "interpretation": "Loans & Advances bars tracking close to Total Assets indicates productive lending deployment.",
    "interactiveControls": "Period slider · Metric tooltips · Drag zoom"
  },
  {
    "id": "bank-ldr",
    "title": "Loan-to-Deposit Ratio (LDR %) [Credit-to-Deposit Ratio]",
    "subtitle": "Loans & Advances, Deposits (₹ crore left axis); LDR % (right axis line)",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Loans & Advances (₹ Cr) · Customer Deposits (₹ Cr) · LDR (%)",
    "dataSource": "Banking Balance Sheet Form A (Advances & Deposits schedules)",
    "meaning": "Monitors the proportion of customer deposits deployed into commercial lending assets.",
    "conceptualUse": "Evaluates credit aggressiveness and liquidity buffer. Ratios above 85% indicate aggressive loan expansion requiring high-cost market borrowings and risk regulatory scrutiny from RBI.",
    "interpretation": "Healthy LDR is 72%-80%. Ratios consistently above 85% signal liquidity tightness.",
    "interactiveControls": "Dual-axis toggle · Period slider · Reset button"
  },
  {
    "id": "bank-borrowings-deposits",
    "title": "Borrowings / Deposits (%) [Bank]",
    "subtitle": "Wholesale Borrowings & Deposits (₹ Cr left); Ratio % line on right axis",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Wholesale Borrowings (₹ Cr) · Customer Deposits (₹ Cr) · Borrowings / Deposits (%)",
    "dataSource": "Banking Balance Sheet Schedule 4 (Borrowings) & Schedule 3 (Deposits)",
    "meaning": "Measures reliance on wholesale interbank borrowing versus retail customer deposits.",
    "conceptualUse": "Funding stability check. Lower is strictly safer (< 15%-20%). Heavy wholesale borrowing exposes the bank to volatile money-market interest rate hikes.",
    "interpretation": "A low, flat, or declining ratio line reflects growing retail deposit franchise strength.",
    "interactiveControls": "Period slider · Dual-axis inspection · Drag zoom"
  },
  {
    "id": "bank-equity-assets",
    "title": "Equity / Total Assets (%) [Bank]",
    "subtitle": "Equity Capital & Total Assets (₹ Cr left); Equity / Total Assets % line on right axis",
    "category": "annual-bank",
    "applicableTo": "bank",
    "metrics": "Equity Capital (₹ Cr) · Total Assets (₹ Cr) · Equity / Total Assets (%)",
    "dataSource": "Banking Balance Sheet Capital & Total Assets Disclosures",
    "meaning": "Capital adequacy cushion protecting depositors against bad loan write-offs.",
    "conceptualUse": "Evaluates solvency buffer. Healthy banks operate with Equity/Assets of 8%-13%, providing solid protection against macroeconomic downturns.",
    "interpretation": "Ratio line holding firmly above 8%-10% confirms strong solvency resilience.",
    "interactiveControls": "Dual-axis display · Period slider · Zoom controls"
  },
  {
    "id": "bank-quarter-interest-gap",
    "title": "Interest Earned & Interest Paid (Quarterly)",
    "subtitle": "₹ crore columns · Interest Ratio = Interest Paid ÷ Interest Earned (%) line",
    "category": "quarterly-bank",
    "applicableTo": "bank",
    "metrics": "Quarterly Interest Earned (₹ Cr) · Interest Paid (₹ Cr) · Interest Ratio (%)",
    "dataSource": "Quarterly Financial Results for Banks",
    "meaning": "Quarterly interest spread tracking cost of funds versus lending yield.",
    "conceptualUse": "Immediate margin sensitivity indicator. A falling interest ratio demonstrates expanding NIM and strong quarterly asset repricing.",
    "interpretation": "Widening gap between quarterly interest earned and paid confirms expanding net interest margins.",
    "interactiveControls": "Period slider · Dual-axis tooltip · Drag zoom"
  },
  {
    "id": "bank-quarter-income",
    "title": "Interest Earned & Other Income (Quarterly)",
    "subtitle": "₹ crore columns · Interest Income Contribution % line on right axis",
    "category": "quarterly-bank",
    "applicableTo": "bank",
    "metrics": "Interest Earned (₹ Cr) · Other Income (₹ Cr) · Interest Income Contribution (%)",
    "dataSource": "Quarterly Banking Statements",
    "meaning": "Reveals the quarterly contribution of core interest income versus fee/treasury other income.",
    "conceptualUse": "Monitors fee income stability across quarters. High recurring other income cushions profitability during sluggish quarterly credit cycles.",
    "interpretation": "Stable 75%-85% interest contribution with steady other income indicates well-balanced revenue.",
    "interactiveControls": "Period slider · Dual-axis display · Drag zoom"
  },
  {
    "id": "bank-quarter-revenue-expense",
    "title": "Total Revenue & Total Expense (Quarterly)",
    "subtitle": "Quarterly total revenue, total expense & OPM % line on right axis",
    "category": "quarterly-bank",
    "applicableTo": "bank",
    "metrics": "Total Revenue (₹ Cr) · Total Expense (₹ Cr) · Operating Profit Margin (%)",
    "dataSource": "Quarterly Banking Disclosures",
    "meaning": "High-frequency quarterly operating profitability and cost-to-income tracking.",
    "conceptualUse": "Captures quarterly cost control and operating leverage in real time.",
    "interpretation": "Consistently wide margins across all four quarters reflect robust risk-adjusted profitability.",
    "interactiveControls": "Dual-axis toggle · Period slider · Hover crosshair"
  },
  {
    "id": "bank-quarter-pbt",
    "title": "Quarterly PBT & [PBT − Depreciation] (Bank)",
    "subtitle": "Quarterly PBT & PBT less depreciation · ₹ crore",
    "category": "quarterly-bank",
    "applicableTo": "bank",
    "metrics": "Quarterly PBT (₹ Cr) · [PBT − Depreciation] (₹ Cr)",
    "dataSource": "Quarterly Banking Financial Results",
    "meaning": "Quarterly pre-tax earnings delivery before and after depreciation charges.",
    "conceptualUse": "Monitors quarterly operational earnings strength after absorbing credit provisions and funding costs.",
    "interpretation": "Sequential quarterly increases indicate improving credit conditions and loan book expansion.",
    "interactiveControls": "Period slider · Tooltip inspection · Zoom controls"
  },
  {
    "id": "bank-quarter-profit",
    "title": "Quarterly Net Profit & NPM (Bank)",
    "subtitle": "Net profit · ₹ crore; NPM = net profit ÷ total revenue · % line on right axis",
    "category": "quarterly-bank",
    "applicableTo": "bank",
    "metrics": "Quarterly Net Profit (₹ Cr) · Net Profit Margin (%)",
    "dataSource": "Quarterly Banking Statements",
    "meaning": "Quarterly bottom-line net profit after tax and its net conversion margin from total revenue.",
    "conceptualUse": "Evaluates bottom-line earnings delivery across sequential quarters, highlighting any quarterly tax or provision spikes.",
    "interpretation": "Look for steady sequential net profit delivery with stable NPM % lines.",
    "interactiveControls": "Period slider · Dual-axis display · Drag zoom"
  }
]

export const STATISTICAL_MODELS: StatisticalModelDefinition[] = [
  {
    "id": "method-robust-avg",
    "title": "Robust Weighted Average with IQR Outlier Winsorization",
    "subtitle": "Algorithmic multi-year historical averaging for financial ratios",
    "formula": "IQR = Q_3 − Q_1 · Lower Bound = Q_1 − 1.5×IQR · Upper Bound = Q_3 + 1.5×IQR · Winsorize outliers · Apply Recency Weights",
    "purpose": "Eliminates distortion from extreme historical anomalies (e.g. Covid lockdowns, one-off tax credits, massive asset write-offs) while retaining multi-year context.",
    "algorithm": [
      "1. Filter out null, undefined, and non-finite numbers while preserving legitimate zeros and negative values.",
      "2. For small samples (N <= 5): use trimmed middle averages (N=5 takes middle 3; N=4 takes middle 2; N=3 takes median; N=2 takes mean).",
      "3. For samples N > 5: compute the 25th percentile (Q1) and 75th percentile (Q3) via linear interpolation.",
      "4. Calculate Interquartile Range (IQR = Q3 − Q1) and clamp values exceeding Q3 + 1.5×IQR or below Q1 − 1.5×IQR (Winsorization).",
      "5. Apply linear recency weights from oldest to newest with base weight EQ = 100 / N and a 50% spread ratio (newest − oldest = 0.5 × EQ).",
      "6. Compute final weighted average = (Σ value_i × weight_i) ÷ Σ weight_i."
    ],
    "conceptualUse": "Standard arithmetic averages are heavily distorted by outlier years. This robust estimator provides a realistic, statistically grounded 'normalized' baseline for intrinsic valuation and peer comparison.",
    "whyItMatters": "Prevents temporary booms or busts from corrupting long-term return and margin assumptions.",
    "whereUsed": "Overview Return History Table (ROA, ROE, ROCE, Payout) · Cash History Table (OPM, NPM) · Per Share Summary · DuPont Tables"
  },
  {
    "id": "method-recency-weights",
    "title": "Linear Recency Weighting (50% Spread Ratio)",
    "subtitle": "Time-decay weighting giving higher predictive power to recent years",
    "formula": "EQ = 100 ÷ N · Spread = 0.5 × EQ · Oldest Year = 0.75 × EQ · Newest Year = 1.25 × EQ · Linear interpolation across intermediate years",
    "purpose": "Ensures recent operating performance carries more predictive weight than performance from 8 or 9 years ago.",
    "algorithm": [
      "1. Base equal weight EQ = 100 / N.",
      "2. Set the spread ratio between the newest year and the oldest year to exactly 50% of base weight: (w_newest − w_oldest) ÷ EQ = 0.50.",
      "3. For odd N: middle year equals EQ; step size = (0.25 × EQ) ÷ ((N − 1) / 2).",
      "4. For even N: two middle years bracket EQ; step size = (0.25 × EQ) ÷ (N / 2 − 1).",
      "5. Weights sum to 100%, preserving probability measure."
    ],
    "conceptualUse": "A business often changes fundamentally over a decade (new management, debt reduction, higher value-added products). Recency weighting ensures recent structural improvements are recognized without discarding past history.",
    "whyItMatters": "Bridges the gap between stale 10-year historical averages and myopic 1-year trailing figures.",
    "whereUsed": "All historical average calculations across Corporate and Bank dashboards"
  },
  {
    "id": "method-rolling-cash",
    "title": "3-Year Rolling Cash Ratio Average with Denominator Loss Handling",
    "subtitle": "Multi-year rolling sum cash conversion algorithm",
    "formula": "Window Ratio (%) = (Σ_{3Y} Cash Flow Numerator ÷ Σ_{3Y} Denominator) × 100 · Evaluated across rolling 3-year windows",
    "purpose": "Measures normalized cash generation efficiency across business cycles by smoothing working capital swings.",
    "algorithm": [
      "1. Construct 3-year rolling overlapping windows across the entire annual financial history.",
      "2. For each window, compute the 3-year sum of the numerator (e.g. CFO or FCF) and 3-year sum of the denominator (Sales or Net Profit).",
      "3. If the 3-year sum of the denominator is non-positive (<= 0, e.g. net loss or zero sales), safely skip that specific window to prevent division by zero or sign distortions.",
      "4. If more than 3 valid rolling windows exist, apply the Robust Recency-Weighted Average to the window values.",
      "5. If 3 or fewer valid windows exist, apply a simple average.",
      "6. Fallback gracefully to 2-year or 1-year individual ratios if annual history is under 3 years."
    ],
    "conceptualUse": "Annual cash flows are notoriously volatile due to working capital timing (e.g. advance payment received on March 30 or bulk inventory bought on March 31). Evaluating 3-year rolling sums eliminates timing noise to show true normalized cash conversion.",
    "whyItMatters": "Separates companies with genuine cash generation from those with timing illusions or structural cash burn.",
    "whereUsed": "Overview Cash History Table (CFO / Sales, FCF / Sales, CFO / Net Profit, FCF / Net Profit)"
  },
  {
    "id": "method-quadratic-fit",
    "title": "Quadratic Curve Fitting & R² Trend Validation",
    "subtitle": "Non-linear regression modeling for multi-year CAGR forecasting",
    "formula": "Model: y = ax² + bx + c · Least-Squares Matrix Inversion · R² = 1 − (Residual SS ÷ Total SS) · Fitted 3Y CAGR from latest curve points if R² > 80%",
    "purpose": "Captures non-linear accelerating or decelerating growth trends across multi-year financial statements.",
    "algorithm": [
      "1. Map annual data points (year, value) and shift time origin to t_0 = 0 to avoid numerical instability.",
      "2. Formulate 3x3 normal equation matrix using sums of powers: Σx⁴, Σx³, Σx², Σx, and cross-products Σx²y, Σxy, Σy.",
      "3. Solve for parabolic coefficients [a, b, c] using Gauss-Jordan elimination with partial pivoting.",
      "4. Compute coefficient of determination R²: R² = 1 − (Σ(y_i − ŷ_i)² ÷ Σ(y_i − ȳ)²).",
      "5. If points >= 6 and R² > 0.80 and fitted endpoints are strictly positive: compute fitted 3-year CAGR from the curve: (ŷ_latest ÷ ŷ_{latest−3})^(1/3) − 1.",
      "6. Fallback ladder: if R² <= 0.80 or N < 6, fall back to actual 3Y CAGR, then TTM growth, then 1Y growth."
    ],
    "conceptualUse": "Standard point-to-point CAGR only looks at two endpoints (Year 0 and Year 10), ignoring all intermediate volatility. Quadratic fit uses every data point and validates fit quality with R², protecting against cherry-picked endpoints.",
    "whyItMatters": "Provides an objective mathematical trend projection for forward valuation models.",
    "whereUsed": "Overview CAGR by Duration Table · Forecast Calculator default sales growth assumptions"
  },
  {
    "id": "method-dupont",
    "title": "DuPont 3-Stage Mathematical Decompositions",
    "subtitle": "Multiplicative identity deconstructing Return on Equity (ROE)",
    "formula": "Corporate: ROE = (PAT / Sales) × (Sales / Assets) × (Assets / Equity) | Bank: ROE = (PAT / Revenue) × (Revenue / Assets) × (Assets / Equity)",
    "purpose": "Isolates whether equity compounding is powered by operational excellence, asset velocity, or debt leverage.",
    "algorithm": [
      "1. Calculate Net Profit Margin (NPM %) = (Net Profit After Tax ÷ Sales or Total Revenue) × 100.",
      "2. Calculate Asset Velocity: Asset Turnover (ATO = Sales ÷ Avg Assets) for non-banks; Asset Yield (AY % = Revenue ÷ Avg Assets × 100) for banks.",
      "3. Calculate Balance-Sheet Leverage: Equity Multiplier (EM = Avg Total Assets ÷ Avg Equity Net Worth).",
      "4. Verify Multiplicative Identity: NPM × ATO × EM strictly equals ROE (allowing for standard rounding).",
      "5. Apply robust recency-weighted averaging to each component across historical fiscal years."
    ],
    "conceptualUse": "The definitive forensic breakdown of profitability. Reveals if a high ROE is a debt illusion or genuine operational moat.",
    "whyItMatters": "Protects investors from highly levered cyclical companies masquerading as high-return compounders.",
    "whereUsed": "Overview Decomposition of ROE Table · Bank Dashboard Return History Table · Annual DuPont Plots"
  },
  {
    "id": "method-screener-schedules",
    "title": "Screener.in Deeper Schedule Integration & Expansion Rules",
    "subtitle": "Data engineering protocol for extracting sub-schedules and schedules",
    "formula": "Expanded Schedules behind '+' button (Payables, Receivables, Inventories) + Official #ratios (Debtor Days, ROCE %, CCC) | Strict Null Preservation",
    "purpose": "Ensures financial metrics reflect verified corporate disclosures rather than estimated or synthetic approximations.",
    "algorithm": [
      "1. Extract primary P&L, Balance Sheet, Cash Flow, and Quarters tables from the workbook.",
      "2. Interrogate the Screener.in official #ratios table for verified regulatory ratios (Debtor Days, Days Payable, CCC, Working Capital Days, ROCE %).",
      "3. Parse deeper schedules expanded behind the '+' buttons on Cash from Operations (Trade Payables, Trade Receivables, Inventories, Working Capital changes).",
      "4. Match fiscal period headers dynamically across formats ('FY24', 'Mar 2024', '2024', 'Q1 FY25').",
      "5. Strict Rule of Financial Truth: If a line item is unstated by the company, preserve it strictly as null ('—') without inventing artificial estimates."
    ],
    "conceptualUse": "Eliminates data hallucination and maintains rigorous institutional-grade financial integrity.",
    "whyItMatters": "Guarantees that every ratio, chart, and alert in the dashboard is anchored to verified financial filings.",
    "whereUsed": "parseWorkbook.ts · Data Sheet · DataChecksView Data Quality Banner · Export Reports"
  }
]

export function DataChecksView({ data }: { data: FinancialData }) {
  const [activeTab, setActiveTab] = useState<'ratios' | 'plots' | 'methodology'>('ratios')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [modeFilter, setModeFilter] = useState<'auto' | 'all' | 'nonbank' | 'bank'>('auto')

  const isBank = data.mode === 'bank'
  const activeMode = modeFilter === 'auto' ? (isBank ? 'bank' : 'nonbank') : modeFilter

  // Filter ratio definitions
  const filteredRatios = useMemo(() => {
    return RATIO_DEFINITIONS.filter(item => {
      if (activeMode === 'bank' && item.applicableTo === 'nonbank') return false
      if (activeMode === 'nonbank' && item.applicableTo === 'bank') return false
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'liquidity' || selectedCategory === 'solvency' || selectedCategory === 'liquidity-solvency') {
          if (item.category !== 'liquidity' && item.category !== 'solvency') return false
        } else if (selectedCategory === 'banking') {
          if (item.category !== 'banking' && item.applicableTo !== 'bank') return false
        } else if (item.category !== selectedCategory) {
          return false
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.name.toLowerCase().includes(q)
        const matchAbbr = item.abbr.toLowerCase().includes(q)
        const matchFormula = item.formula.toLowerCase().includes(q)
        const matchMeaning = item.meaning.toLowerCase().includes(q)
        const matchConcept = item.conceptualUse.toLowerCase().includes(q)
        const matchNotes = item.notes.toLowerCase().includes(q)
        const matchBenchmark = item.benchmark.toLowerCase().includes(q)
        const matchUsed = item.whereUsed.toLowerCase().includes(q)
        return matchName || matchAbbr || matchFormula || matchMeaning || matchConcept || matchNotes || matchBenchmark || matchUsed
      }
      return true
    })
  }, [activeMode, selectedCategory, searchQuery])

  // Filter plot definitions
  const filteredPlots = useMemo(() => {
    return PLOT_DEFINITIONS.filter(item => {
      if (activeMode === 'bank' && item.applicableTo === 'nonbank') return false
      if (activeMode === 'nonbank' && item.applicableTo === 'bank') return false
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'annual' && !item.category.includes('annual')) return false
        if (selectedCategory === 'quarterly' && !item.category.includes('quarterly')) return false
        if (selectedCategory === 'special' && !item.category.includes('special')) return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchSub = item.subtitle.toLowerCase().includes(q)
        const matchMetrics = item.metrics.toLowerCase().includes(q)
        const matchSource = item.dataSource.toLowerCase().includes(q)
        const matchMeaning = item.meaning.toLowerCase().includes(q)
        const matchConcept = item.conceptualUse.toLowerCase().includes(q)
        const matchInterp = item.interpretation.toLowerCase().includes(q)
        return matchTitle || matchSub || matchMetrics || matchSource || matchMeaning || matchConcept || matchInterp
      }
      return true
    })
  }, [activeMode, selectedCategory, searchQuery])

  // Filter methodology models
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return STATISTICAL_MODELS
    const q = searchQuery.toLowerCase().trim()
    return STATISTICAL_MODELS.filter(item => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.formula.toLowerCase().includes(q) ||
        item.purpose.toLowerCase().includes(q) ||
        item.conceptualUse.toLowerCase().includes(q) ||
        item.whyItMatters.toLowerCase().includes(q) ||
        item.whereUsed.toLowerCase().includes(q)
      )
    })
  }, [searchQuery])

  // Count by category for filter pills
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, liquidity: 0, 'liquidity-solvency': 0, solvency: 0, banking: 0 }
    RATIO_DEFINITIONS.forEach(item => {
      if (activeMode === 'bank' && item.applicableTo === 'nonbank') return
      if (activeMode === 'nonbank' && item.applicableTo === 'bank') return
      counts.all = (counts.all || 0) + 1
      counts[item.category] = (counts[item.category] || 0) + 1
      if (item.category === 'liquidity' || item.category === 'solvency') {
        counts['liquidity'] = (counts['liquidity'] || 0) + 1
        counts['liquidity-solvency'] = (counts['liquidity-solvency'] || 0) + 1
        counts['solvency'] = (counts['solvency'] || 0) + 1
      }
      if (item.applicableTo === 'bank' || item.category === 'banking') {
        counts['banking'] = (counts['banking'] || 0) + 1
      }
    })
    return counts
  }, [activeMode])

  const categories = [
    { key: 'all', label: 'All Ratios & Terms' },
    { key: 'growth', label: 'Growth & Momentum' },
    { key: 'margins', label: 'Margins & Spreads' },
    { key: 'returns', label: 'Returns & DuPont' },
    { key: 'liquidity', label: 'Liquidity & Solvency' },
    { key: 'workingcap', label: 'Working Capital & CCC' },
    { key: 'cashflow', label: 'Cash Flow Quality & CapEx' },
    { key: 'valuation', label: 'Valuation & Multiples' },
    { key: 'technicals', label: 'Technicals & Peers' },
    { key: 'governance', label: 'Ownership & Governance' },
    { key: 'banking', label: 'Banking & BFSI Special' },
    { key: 'analytics', label: 'Statistical Methodology' },
  ]

  const plotCategories = [
    { key: 'all', label: 'All Charts' },
    { key: 'annual', label: 'Annual Plots' },
    { key: 'quarterly', label: 'Quarterly Plots' },
    { key: 'special', label: 'Special Analysis' },
  ]

  const warningCount = data.warnings.length + (data.missingMetrics?.length || 0)
  const totalRatiosCount = RATIO_DEFINITIONS.filter(r => (activeMode === 'bank' ? r.applicableTo !== 'nonbank' : activeMode === 'nonbank' ? r.applicableTo !== 'bank' : true)).length
  const totalPlotsCount = PLOT_DEFINITIONS.filter(p => (activeMode === 'bank' ? p.applicableTo !== 'nonbank' : activeMode === 'nonbank' ? p.applicableTo !== 'bank' : true)).length

  return (
    <div className="checks-page-container">
      {/* 1. HERO TOP BANNER */}
      <header className="checks-hero-banner">
        <div className="checks-hero-left">
          <div className="checks-icon-orb">
            <ShieldCheck size={28} />
          </div>
          <div>
            <div className="checks-hero-kicker">FINANCIAL AUDIT, RATIOS & METHODOLOGY ENCYCLOPEDIA</div>
            <h1 className="checks-hero-title">Financial Dictionary, Data Checks & Plot Directory</h1>
            <p className="checks-hero-subtitle">
              Exhaustive reference compendium explaining every ratio, financial term, valuation multiple, DuPont decomposition,
              market technical indicator, and interactive chart used across this application — complete with mathematical formulas,
              economic intuition, conceptual interpretation, red flags, and benchmarks.
            </p>
          </div>
        </div>
        <div className="checks-hero-right">
          <span className={`checks-status-pill ${warningCount > 0 ? 'attention' : 'ready'}`}>
            {warningCount > 0 ? (
              <>
                <AlertTriangle size={15} /> {warningCount} DATA AUDIT NOTES
              </>
            ) : (
              <>
                <CheckCircle2 size={15} /> ALL INPUTS VERIFIED
              </>
            )}
          </span>
          <div className="checks-mode-selector">
            <button
              type="button"
              className={`checks-mode-pill ${modeFilter === 'auto' ? 'active' : ''}`}
              onClick={() => setModeFilter('auto')}
              title="Match active company reporting classification"
            >
              Auto ({isBank ? 'Bank' : 'Corporate'})
            </button>
            <button
              type="button"
              className={`checks-mode-pill ${modeFilter === 'nonbank' ? 'active' : ''}`}
              onClick={() => setModeFilter('nonbank')}
            >
              Corporate Non-Bank
            </button>
            <button
              type="button"
              className={`checks-mode-pill ${modeFilter === 'bank' ? 'active' : ''}`}
              onClick={() => setModeFilter('bank')}
            >
              Bank / BFSI
            </button>
            <button
              type="button"
              className={`checks-mode-pill ${modeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setModeFilter('all')}
            >
              Show All Modes
            </button>
          </div>
        </div>
      </header>

      {/* 2. SOURCE COVERAGE & VERIFICATION METRICS */}
      <section className="checks-meta-grid" aria-label="Workbook verification">
        <div className="checks-info-card">
          <h3>
            <BookOpen size={17} style={{ color: '#38bdf8' }} /> Source Coverage & Active Verification
          </h3>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Company Name</span>
            <span className="checks-kv-value">{data.companyName}</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Reporting Classification</span>
            <span className="checks-kv-value">{isBank ? 'Bank / BFSI Financial Institution' : 'Corporate Non-Bank Business'}</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Annual Periods Verified</span>
            <span className="checks-kv-value">
              {data.annual[0]?.period ?? '—'} to {data.annual.at(-1)?.period ?? '—'} ({data.annual.length} Fiscal Years)
            </span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Quarterly Disclosures</span>
            <span className="checks-kv-value">{data.quarterly.length} Quarters · TTM Integrated</span>
          </div>
          <div className="checks-kv-row">
            <span className="checks-kv-label">Screener.in Integration</span>
            <span className="checks-kv-value" style={{ color: '#34d399', fontWeight: 700 }}>
              Official #ratios + Deeper Cash Flow & Balance Sheet Schedules
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
            <strong>Deeper Schedules Rule:</strong> For working capital, trade payables, receivables, and inventories, the engine extracts exact schedule lines from Screener.in (behind the `+` buttons) and official #ratios table (`Debtor Days`, `Days Payable`, `CCC`, `Working Capital Days`, `ROCE %`). Unstated values stay strictly null (`—`) without arbitrary synthetic assumptions.
          </div>
        </div>
      </section>

      {/* 3. MAIN SECTION TABS: RATIOS VS PLOTS VS METHODOLOGY */}
      <section className="checks-tabs-container">
        <div className="checks-main-tabs">
          <button
            type="button"
            className={`checks-main-tab-btn ${activeTab === 'ratios' ? 'active' : ''}`}
            onClick={() => { setActiveTab('ratios'); setSelectedCategory('all') }}
          >
            <Calculator size={18} />
            <span>Financial Terms & Ratios Compendium</span>
            <span className="checks-tab-badge">{totalRatiosCount}</span>
          </button>
          <button
            type="button"
            className={`checks-main-tab-btn ${activeTab === 'plots' ? 'active' : ''}`}
            onClick={() => { setActiveTab('plots'); setSelectedCategory('all') }}
          >
            <BarChart3 size={18} />
            <span>Visual Plots & Chart Directory</span>
            <span className="checks-tab-badge">{totalPlotsCount}</span>
          </button>
          <button
            type="button"
            className={`checks-main-tab-btn ${activeTab === 'methodology' ? 'active' : ''}`}
            onClick={() => setActiveTab('methodology')}
          >
            <Cpu size={18} />
            <span>Statistical Models & Analytics</span>
            <span className="checks-tab-badge">{STATISTICAL_MODELS.length}</span>
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
                ? 'Search any ratio, formula, meaning, red flag, benchmark, or where used (e.g. Creditor Days, ROCE, NIM, CCC, LDR, FCF, 50 DMA, Pledging)...'
                : activeTab === 'plots'
                ? 'Search plot title, metrics, data source, interpretation, or conceptual use (e.g. Cash flow, Working capital, DuPont, OPM, LDR)...'
                : 'Search mathematical methodology, formula, Winsorization, recency weighting, or curve fitting...'
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

        {activeTab === 'plots' && (
          <div className="checks-filter-row">
            <SlidersHorizontal size={15} style={{ color: '#64748b', marginRight: '4px' }} />
            {plotCategories.map(cat => (
              <button
                key={cat.key}
                className={`checks-filter-btn ${selectedCategory === cat.key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 5. CONTENT SECTIONS */}
      {activeTab === 'ratios' && (
        <>
          <div className="checks-grid-section-title">
            <h3>
              <Calculator size={19} style={{ color: '#38bdf8' }} />
              Financial Ratios, Terms & Expressions Directory
            </h3>
            <span className="checks-results-meta">
              Showing {filteredRatios.length} of {totalRatiosCount} ratios (Filtered by: {activeMode.toUpperCase()})
            </span>
          </div>

          {filteredRatios.length > 0 ? (
            <div className="checks-compendium-grid">
              {filteredRatios.map(item => (
                <article key={item.id} className="ratio-card">
                  <div className="ratio-card-top">
                    <div className="ratio-card-title-group">
                      <div className="ratio-card-badges-line">
                        <span className="ratio-card-abbr">{item.abbr}</span>
                        <span className={`ratio-scope-pill scope-${item.applicableTo}`}>
                          {item.applicableTo === 'all' ? 'UNIVERSAL' : item.applicableTo === 'bank' ? 'BANK / BFSI' : 'CORPORATE'}
                        </span>
                      </div>
                      <h4 className="ratio-card-name">{item.name}</h4>
                    </div>
                    <span className={`ratio-cat-badge badge-${item.category}`}>
                      {item.category.toUpperCase()}
                    </span>
                  </div>

                  <div className="ratio-formula-box">
                    <div className="ratio-formula-label">MATHEMATICAL FORMULA & SOURCE</div>
                    <div className="ratio-formula-text">{item.formula}</div>
                  </div>

                  <div className="ratio-details-content">
                    <p className="ratio-meaning-text">{item.meaning}</p>
                  </div>

                  <div className="ratio-concept-box">
                    <div className="ratio-concept-header">
                      <Lightbulb size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <span>HOW TO CONCEPTUALLY USE IT & RED FLAGS</span>
                    </div>
                    <p className="ratio-concept-text">{item.conceptualUse}</p>
                  </div>

                  <div className="ratio-benchmark-strip">
                    <span className="benchmark-tag">BENCHMARK:</span>
                    <span className="benchmark-value">{item.benchmark}</span>
                  </div>

                  <div className="ratio-note-box">
                    <strong>Dashboard Note:</strong> {item.notes}
                  </div>

                  <div className="ratio-where-used-strip">
                    <span className="where-used-label">USED IN:</span>
                    <span className="where-used-text">{item.whereUsed}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="checks-empty-state">
              <CircleHelp size={40} style={{ color: '#64748b', margin: '0 auto' }} />
              <h4>No matching ratios found</h4>
              <p>Try searching for a different keyword or reset the category / mode filter.</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'plots' && (
        <>
          <div className="checks-grid-section-title">
            <h3>
              <BarChart3 size={19} style={{ color: '#38bdf8' }} />
              Visual Analytics & Interactive Plot Directory
            </h3>
            <span className="checks-results-meta">
              Showing {filteredPlots.length} of {totalPlotsCount} visual plots (Mode: {activeMode.toUpperCase()})
            </span>
          </div>

          {filteredPlots.length > 0 ? (
            <div className="checks-compendium-grid">
              {filteredPlots.map(plot => (
                <article key={plot.id} className="plot-guide-card">
                  <div className="plot-card-top">
                    <div className="plot-card-title-group">
                      <div className="plot-card-pills-row">
                        <span className="plot-card-cat-pill">
                          {plot.category.includes('quarterly') ? 'QUARTERLY' : plot.category.includes('special') ? 'SPECIAL ANALYSIS' : 'YEARLY'}
                        </span>
                        <span className={`ratio-scope-pill scope-${plot.applicableTo}`}>
                          {plot.applicableTo === 'all' ? 'ALL MODES' : plot.applicableTo === 'bank' ? 'BANK ONLY' : 'CORPORATE ONLY'}
                        </span>
                      </div>
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
                    <div className="plot-concept-box">
                      <div className="plot-concept-header">
                        <Lightbulb size={13} style={{ color: '#c084fc' }} />
                        <span>HOW TO CONCEPTUALLY USE THIS CHART</span>
                      </div>
                      <p className="plot-concept-text">{plot.conceptualUse}</p>
                    </div>
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
              <h4>No matching visual plots found</h4>
              <p>Try searching for a different keyword or select 'All Charts'.</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'methodology' && (
        <>
          <div className="checks-grid-section-title">
            <h3>
              <Cpu size={19} style={{ color: '#38bdf8' }} />
              Statistical Models, Econometrics & Data Integrity Rules
            </h3>
            <span className="checks-results-meta">
              Showing {filteredModels.length} mathematical architectures
            </span>
          </div>

          {filteredModels.length > 0 ? (
            <div className="methodology-grid">
              {filteredModels.map(model => (
                <article key={model.id} className="method-card">
                  <div className="method-card-header">
                    <div className="method-card-orb">
                      <Layers size={20} />
                    </div>
                    <div>
                      <h4 className="method-card-title">{model.title}</h4>
                      <p className="method-card-sub">{model.subtitle}</p>
                    </div>
                  </div>

                  <div className="method-purpose-box">
                    <strong>Analytical Purpose:</strong> {model.purpose}
                  </div>

                  <div className="ratio-formula-box">
                    <div className="ratio-formula-label">MATHEMATICAL FORMULA & ARCHITECTURE</div>
                    <div className="ratio-formula-text">{model.formula}</div>
                  </div>

                  <div className="method-algo-box">
                    <div className="method-algo-title">ALGORITHMIC EXECUTION STEPS:</div>
                    <ul className="method-algo-list">
                      {model.algorithm.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="ratio-concept-box">
                    <div className="ratio-concept-header">
                      <Compass size={14} style={{ color: '#f59e0b' }} />
                      <span>CONCEPTUAL APPLICATION & VALUE</span>
                    </div>
                    <p className="ratio-concept-text">{model.conceptualUse}</p>
                  </div>

                  <div className="method-why-box">
                    <strong>Why It Matters for Investors:</strong> {model.whyItMatters}
                  </div>

                  <div className="ratio-where-used-strip">
                    <span className="where-used-label">IMPLEMENTED IN:</span>
                    <span className="where-used-text">{model.whereUsed}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="checks-empty-state">
              <CircleHelp size={40} style={{ color: '#64748b', margin: '0 auto' }} />
              <h4>No matching statistical models found</h4>
            </div>
          )}
        </>
      )}
    </div>
  )
}
