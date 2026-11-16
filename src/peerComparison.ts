import type { AboutPeerComparison, AboutPeerRow, AboutState } from './types'

export const DEFAULT_NON_BANK_FOOTNOTE =
  'Sales growth, Profit growth, OPM, ROE, ROA, D.Payout, CFO/EBIT%, PE, PB => 3 years average data · 52W Range Bar: ━━ Track = 52W Low to High · ▲ Lower Arrow = CMP · ▼ Small Blue Triangle = 50 DMA · ▼ Big Orange Triangle = 200 DMA · XX% = 52W Range Position % [100 × (CMP − 52W Low) / (52W High − 52W Low)]'

export const DEFAULT_BANK_FOOTNOTE =
  'Sales growth, Profit growth, BV Growth, D.Payout, DE, ROE, ROA, PE, PB => 3 years average data · 52W Range Bar: ━━ Track = 52W Low to High · ▲ Lower Arrow = CMP · ▼ Small Blue Triangle = 50 DMA · ▼ Big Orange Triangle = 200 DMA · XX% = 52W Range Position % [100 × (CMP − 52W Low) / (52W High − 52W Low)]'

export const DEFAULT_PEER_FOOTNOTE = DEFAULT_NON_BANK_FOOTNOTE

export type PeerMetricKey =
  | 'price_range'
  | 'mcap'
  | 'ttm_sales'
  | 'sales_growth'
  | 'profit_growth'
  | 'bv_growth'
  | 'opm'
  | 'debt_to_equity'
  | 'roe'
  | 'roa'
  | 'payout'
  | 'cfo_ebit_pct'
  | 'pe'
  | 'pb'
  | 'ps'
  | 'd_yield'

export type PeerMetricColumn = {
  key: PeerMetricKey
  label: string
  headerLine1: string
  headerLine2?: string
  tooltip?: string
}

export const NON_BANK_PEER_COLUMNS: ReadonlyArray<PeerMetricColumn> = [
  { key: 'price_range', label: '52W Range', headerLine1: '52W Range', headerLine2: 'Track (%)', tooltip: '52-Week Price Range with CMP (Lower Arrow), 50 DMA (Small Blue Triangle), and 200 DMA (Big Orange Triangle)' },
  { key: 'mcap', label: 'MCAP', headerLine1: 'MCAP', headerLine2: '(₹ Cr)', tooltip: 'Market Capitalization (₹ Cr)' },
  { key: 'ttm_sales', label: 'TTM sales', headerLine1: 'TTM Sales', headerLine2: '(₹ Cr)', tooltip: 'Trailing 12-Month Sales (₹ Cr)' },
  { key: 'sales_growth', label: 'Sales growth', headerLine1: 'Sales', headerLine2: 'Growth', tooltip: '3-Year Sales Growth (%)' },
  { key: 'profit_growth', label: 'Profit growth', headerLine1: 'Profit', headerLine2: 'Growth', tooltip: '3-Year Profit Growth (%)' },
  { key: 'opm', label: 'OPM', headerLine1: 'OPM', headerLine2: '(%)', tooltip: '3-Year Average Operating Profit Margin (%)' },
  { key: 'roe', label: 'ROE', headerLine1: 'ROE', headerLine2: '(%)', tooltip: '3-Year Average Return on Equity (%)' },
  { key: 'roa', label: 'ROA', headerLine1: 'ROA', headerLine2: '(%)', tooltip: '3-Year Average Return on Assets (%)' },
  { key: 'payout', label: 'Payout', headerLine1: 'Div', headerLine2: 'Payout', tooltip: '3-Year Average Dividend Payout (%)' },
  { key: 'cfo_ebit_pct', label: 'CFO/EBIT%', headerLine1: 'CFO/', headerLine2: 'EBIT%', tooltip: '3-Year Average CFO / EBIT (%)' },
  { key: 'pe', label: 'PE', headerLine1: 'P/E', headerLine2: '[3Y Avg]', tooltip: 'Current PE [3-Year Historical PE] and % Diff' },
  { key: 'pb', label: 'PB', headerLine1: 'P/B', headerLine2: '[3Y Avg]', tooltip: 'Current PB [3-Year Historical PB] and % Diff' },
  { key: 'ps', label: 'PS', headerLine1: 'P/S', headerLine2: 'Ratio', tooltip: 'Price to Sales' },
  { key: 'd_yield', label: 'D.Yield', headerLine1: 'Div', headerLine2: 'Yield', tooltip: 'Dividend Yield (%)' },
]

export const BANK_PEER_COLUMNS: ReadonlyArray<PeerMetricColumn> = [
  { key: 'price_range', label: '52W Range', headerLine1: '52W Range', headerLine2: 'Track (%)', tooltip: '52-Week Price Range with CMP (Lower Arrow), 50 DMA (Small Blue Triangle), and 200 DMA (Big Orange Triangle)' },
  { key: 'mcap', label: 'MCAP', headerLine1: 'MCAP', headerLine2: '(₹ Cr)', tooltip: 'Market Capitalization (₹ Cr)' },
  { key: 'ttm_sales', label: 'TTM sales', headerLine1: 'TTM Sales', headerLine2: '(₹ Cr)', tooltip: 'Trailing 12-Month Total Revenue / Sales (₹ Cr)' },
  { key: 'sales_growth', label: 'Sales growth', headerLine1: 'Sales', headerLine2: 'Growth', tooltip: '3-Year Sales Growth (%)' },
  { key: 'profit_growth', label: 'Profit growth', headerLine1: 'Profit', headerLine2: 'Growth', tooltip: '3-Year Profit Growth (%)' },
  { key: 'bv_growth', label: 'BV Growth', headerLine1: 'BV', headerLine2: 'Growth', tooltip: 'Book Value CAGR (BV Growth 3Y)' },
  { key: 'payout', label: 'Payout', headerLine1: 'Div', headerLine2: 'Payout', tooltip: '3-Year Average Dividend Payout (%)' },
  { key: 'debt_to_equity', label: 'DE', headerLine1: 'DE', headerLine2: 'Ratio', tooltip: 'Debt to Equity (DE)' },
  { key: 'roe', label: 'ROE', headerLine1: 'ROE', headerLine2: '(%)', tooltip: '3-Year Average Return on Equity (%)' },
  { key: 'roa', label: 'ROA', headerLine1: 'ROA', headerLine2: '(%)', tooltip: '3-Year Average Return on Assets (%)' },
  { key: 'pe', label: 'PE', headerLine1: 'P/E', headerLine2: '[3Y Avg]', tooltip: 'Current PE [3-Year Historical PE] and % Diff' },
  { key: 'pb', label: 'PB', headerLine1: 'P/B', headerLine2: '[3Y Avg]', tooltip: 'Current PB [3-Year Historical PB] and % Diff' },
  { key: 'ps', label: 'PS', headerLine1: 'P/S', headerLine2: 'Ratio', tooltip: 'Price to Sales' },
  { key: 'd_yield', label: 'D.Yield', headerLine1: 'Div', headerLine2: 'Yield', tooltip: 'Dividend Yield (%)' },
]

export function getPeerMetricColumns(isBank: boolean = false) {
  return isBank ? BANK_PEER_COLUMNS : NON_BANK_PEER_COLUMNS
}

export function getPeerTableHeaders(isBank: boolean = false): string[] {
  return ['Company', ...getPeerMetricColumns(isBank).map(col => col.label)]
}

// Backward compatibility aliases
export const PEER_METRIC_COLUMNS = NON_BANK_PEER_COLUMNS
export const PEER_TABLE_HEADERS = ['Company', ...NON_BANK_PEER_COLUMNS.map(col => col.label)]

export type NormalizedPeerRow = {
  s_no: string
  company: string
  screener_url: string
  price_range: string
  mcap: string
  ttm_sales: string
  sales_growth: string
  profit_growth: string
  opm: string
  debt_to_equity: string
  bv_growth: string
  roe: string
  roa: string
  payout: string
  cfo_ebit_pct: string
  pe: string
  pb: string
  ps: string
  d_yield: string
  cmp: string
  high_52w: string
  low_52w: string
  dma_50: string
  dma_200: string
  is_target: boolean
  is_median: boolean
}

export type ResolvedPeerComparison = {
  rows: NormalizedPeerRow[]
  median: NormalizedPeerRow | null
  sectorPath: string[]
  authenticated: boolean
  sourceUrl: string
  footnote: string
}

function cleanStr(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined) return fallback
  const s = String(value).trim()
  return s || fallback
}

export function formatPePbDiff(val: unknown): string {
  if (val === null || val === undefined) return '-'
  const s = String(val).trim()
  if (!s || s === '-') return '-'

  // Check if it already has (diff%): e.g. "15.94 [25.69] (-37.95%)"
  const withDiffMatch = s.match(/^([\d.,]+)\s*\[([\d.,]+)\]\s*\(([+-]?[\d.,]+%?)\)$/)
  if (withDiffMatch) {
    return s
  }

  // Check if it has "X [Y]": e.g. "15.94 [25.69]"
  const pairMatch = s.match(/^([\d.,]+)\s*\[([\d.,]+)\]$/)
  if (pairMatch) {
    const cStr = pairMatch[1]
    const aStr = pairMatch[2]
    const c = parseFloat(cStr.replace(/,/g, ''))
    const a = parseFloat(aStr.replace(/,/g, ''))
    if (!isNaN(c) && !isNaN(a) && a > 0) {
      const diff = (100.0 * (c - a)) / a
      const sign = diff > 0 ? '+' : ''
      return `${cStr} [${aStr}] (${sign}${diff.toFixed(2)}%)`
    }
    return `${cStr} [${aStr}]`
  }

  return s
}

function normalizePeerRow(raw: AboutPeerRow | Record<string, unknown>, isMedian = false): NormalizedPeerRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const company = cleanStr(r.company, '')
  if (!company) return null

  const cmp = cleanStr(r.cmp)
  const high_52w = cleanStr(r.high_52w ?? r['52w_high'])
  const low_52w = cleanStr(r.low_52w ?? r['52w_low'])
  const dma_50 = cleanStr(r.dma_50 ?? r['50_dma'])
  const dma_200 = cleanStr(r.dma_200 ?? r['200_dma'])

  let price_range = '-'
  const cNum = parseFloat(cmp.replace(/,/g, ''))
  const lNum = parseFloat(low_52w.replace(/,/g, ''))
  const hNum = parseFloat(high_52w.replace(/,/g, ''))
  if (!isNaN(cNum) && !isNaN(lNum) && !isNaN(hNum) && hNum > lNum) {
    const rPct = Math.max(0, Math.min(100, ((cNum - lNum) / (hNum - lNum)) * 100))
    price_range = `${Math.round(rPct)}%`
  } else if (cmp !== '-') {
    price_range = `₹${cmp}`
  }

  return {
    s_no: cleanStr(r.s_no, ''),
    company,
    screener_url: cleanStr(r.screener_url, ''),
    price_range,
    mcap: cleanStr(r.mcap ?? r.mcap_cr),
    ttm_sales: cleanStr(r.ttm_sales ?? r.revenue_cr),
    sales_growth: cleanStr(r.sales_growth),
    profit_growth: cleanStr(r.profit_growth),
    opm: cleanStr(r.opm ?? r.opm_pct),
    debt_to_equity: cleanStr(r.debt_to_equity ?? r.debt_eq ?? r.de),
    bv_growth: cleanStr(r.bv_growth ?? r.book_value_cagr ?? r.bvgr),
    roe: cleanStr(r.roe),
    roa: cleanStr(r.roa),
    payout: cleanStr(r.payout),
    cfo_ebit_pct: cleanStr(r.cfo_ebit_pct),
    pe: formatPePbDiff(cleanStr(r.pe)),
    pb: formatPePbDiff(cleanStr(r.pb)),
    ps: cleanStr(r.ps),
    d_yield: cleanStr(r.d_yield),
    cmp,
    high_52w,
    low_52w,
    dma_50,
    dma_200,
    is_target: !isMedian && Boolean(r.is_target),
    is_median: isMedian || Boolean(r.is_median),
  }
}

/** Resolve Screener's deterministic Peer Comparison table */
export function resolvePeerComparison(about?: AboutState | null, isBank: boolean = false): ResolvedPeerComparison {
  const defaultFootnote = isBank ? DEFAULT_BANK_FOOTNOTE : DEFAULT_NON_BANK_FOOTNOTE
  const srcComp = (about?.data?.peer_comparison ?? about?.sources?.peer_comparison) as AboutPeerComparison | undefined
  if (srcComp && Array.isArray(srcComp.rows) && srcComp.rows.length > 0) {
    const rows = srcComp.rows
      .map(r => normalizePeerRow(r, Boolean(r?.is_median)))
      .filter((r): r is NormalizedPeerRow => r !== null)
    const median = srcComp.median ? normalizePeerRow(srcComp.median, true) : null
    return {
      rows,
      median,
      sectorPath: Array.isArray(srcComp.sector_path) ? srcComp.sector_path.map(String).filter(Boolean) : [],
      authenticated: srcComp.authenticated !== false,
      sourceUrl: cleanStr(srcComp.source_url, ''),
      footnote: cleanStr(srcComp.footnote, defaultFootnote),
    }
  }

  return {
    rows: [],
    median: null,
    sectorPath: [],
    authenticated: true,
    sourceUrl: '',
    footnote: defaultFootnote,
  }
}
