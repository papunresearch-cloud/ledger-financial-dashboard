import type { AboutPeerComparison, AboutPeerRow, AboutState } from './types'

export const DEFAULT_NON_BANK_FOOTNOTE =
  'Sales growth, Profit growth, OPM, ROE, ROA, D.Payout, CFO/EBIT%, PE, PB => 3 years average data; 52WH => Correction from 52w High [100*(52w High - CMP)/(52w High - 52w Low)]'

export const DEFAULT_BANK_FOOTNOTE =
  'Sales growth, Profit growth, BV Growth, D.Payout, DE, ROE, ROA, PE, PB => 3 years average data; 52WH => Correction from 52w High [100*(52w High - CMP)/(52w High - 52w Low)]'

export const DEFAULT_PEER_FOOTNOTE = DEFAULT_NON_BANK_FOOTNOTE

export type PeerMetricKey =
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
  | 'h52_corr'

export const NON_BANK_PEER_COLUMNS: ReadonlyArray<{
  key: PeerMetricKey
  label: string
  tooltip?: string
}> = [
  { key: 'mcap', label: 'MCAP', tooltip: 'Market Capitalization (₹ Cr)' },
  { key: 'ttm_sales', label: 'TTM sales', tooltip: 'Trailing 12-Month Sales (₹ Cr)' },
  { key: 'sales_growth', label: 'Sales growth', tooltip: '3-Year Sales Growth (%)' },
  { key: 'profit_growth', label: 'Profit growth', tooltip: '3-Year Profit Growth (%)' },
  { key: 'opm', label: 'OPM', tooltip: '3-Year Average Operating Profit Margin (%)' },
  { key: 'roe', label: 'ROE', tooltip: '3-Year Average Return on Equity (%)' },
  { key: 'roa', label: 'ROA', tooltip: '3-Year Average Return on Assets (%)' },
  { key: 'payout', label: 'Payout', tooltip: '3-Year Average Dividend Payout (%)' },
  { key: 'cfo_ebit_pct', label: 'CFO/EBIT%', tooltip: '3-Year Average CFO / EBIT (%)' },
  { key: 'pe', label: 'PE', tooltip: 'Current PE [3-Year Historical PE]' },
  { key: 'pb', label: 'PB', tooltip: 'Current PB [3-Year Historical PB]' },
  { key: 'ps', label: 'PS', tooltip: 'Price to Sales' },
  { key: 'd_yield', label: 'D.Yield', tooltip: 'Dividend Yield (%)' },
  { key: 'h52_corr', label: '52WH', tooltip: 'Correction from 52-Week High: 100 * (52w High - CMP) / (52w High - 52w Low)' },
]

export const BANK_PEER_COLUMNS: ReadonlyArray<{
  key: PeerMetricKey
  label: string
  tooltip?: string
}> = [
  { key: 'mcap', label: 'MCAP', tooltip: 'Market Capitalization (₹ Cr)' },
  { key: 'ttm_sales', label: 'TTM sales', tooltip: 'Trailing 12-Month Total Revenue / Sales (₹ Cr)' },
  { key: 'sales_growth', label: 'Sales growth', tooltip: '3-Year Sales Growth (%)' },
  { key: 'profit_growth', label: 'Profit growth', tooltip: '3-Year Profit Growth (%)' },
  { key: 'bv_growth', label: 'BV Growth', tooltip: 'Book Value CAGR (BV Growth 3Y)' },
  { key: 'payout', label: 'Payout', tooltip: '3-Year Average Dividend Payout (%)' },
  { key: 'debt_to_equity', label: 'DE', tooltip: 'Debt to Equity (DE)' },
  { key: 'roe', label: 'ROE', tooltip: '3-Year Average Return on Equity (%)' },
  { key: 'roa', label: 'ROA', tooltip: '3-Year Average Return on Assets (%)' },
  { key: 'pe', label: 'PE', tooltip: 'Current PE [3-Year Historical PE]' },
  { key: 'pb', label: 'PB', tooltip: 'Current PB [3-Year Historical PB]' },
  { key: 'ps', label: 'PS', tooltip: 'Price to Sales' },
  { key: 'd_yield', label: 'D.Yield', tooltip: 'Dividend Yield (%)' },
  { key: 'h52_corr', label: '52WH', tooltip: 'Correction from 52-Week High: 100 * (52w High - CMP) / (52w High - 52w Low)' },
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
  h52_corr: string
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

function compute52WH(cmpRaw: unknown, highRaw: unknown, lowRaw: unknown, fallback?: unknown): string {
  const fb = String(fallback ?? '').trim()
  if (fb && fb !== '-') return fb

  const parseNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    const s = String(v).replace(/,/g, '').replace(/%/g, '').trim()
    const n = parseFloat(s)
    return isNaN(n) ? null : n
  }
  const cmp = parseNum(cmpRaw)
  const high = parseNum(highRaw)
  const low = parseNum(lowRaw)
  if (cmp !== null && high !== null && low !== null) {
    const denom = high - low
    if (denom > 0) {
      const pct = (100.0 * (high - cmp)) / denom
      return `${pct.toFixed(1)}%`
    }
  }
  return '-'
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
  const h52_corr = compute52WH(r.cmp, r.high_52w ?? r['52w_high'], r.low_52w ?? r['52w_low'], r.h52_corr)

  return {
    s_no: cleanStr(r.s_no, ''),
    company,
    screener_url: cleanStr(r.screener_url, ''),
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
    h52_corr,
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
