import type { AboutPeerComparison, AboutPeerRow, AboutState } from './types'

export const DEFAULT_PEER_FOOTNOTE =
  'Sales growth, Profit growth, OPM, ROE, ROA, D.Payout, CFO/EBIT%, PE, PB => 3 years average data'

export type PeerMetricKey =
  | 'mcap'
  | 'ttm_sales'
  | 'sales_growth'
  | 'profit_growth'
  | 'opm'
  | 'roe'
  | 'roa'
  | 'payout'
  | 'cfo_ebit_pct'
  | 'pe'
  | 'pb'
  | 'ps'
  | 'd_yield'

export const PEER_METRIC_COLUMNS: ReadonlyArray<{
  key: PeerMetricKey
  label: string
}> = [
  { key: 'mcap', label: 'MCAP' },
  { key: 'ttm_sales', label: 'TTM sales' },
  { key: 'sales_growth', label: 'Sales growth' },
  { key: 'profit_growth', label: 'Profit growth' },
  { key: 'opm', label: 'OPM' },
  { key: 'roe', label: 'ROE' },
  { key: 'roa', label: 'ROA' },
  { key: 'payout', label: 'Payout' },
  { key: 'cfo_ebit_pct', label: 'CFO/EBIT%' },
  { key: 'pe', label: 'PE' },
  { key: 'pb', label: 'PB' },
  { key: 'ps', label: 'PS' },
  { key: 'd_yield', label: 'D.Yield' },
]

export const PEER_TABLE_HEADERS: string[] = [
  'Company',
  ...PEER_METRIC_COLUMNS.map(col => col.label),
]

export type NormalizedPeerRow = {
  s_no: string
  company: string
  screener_url: string
  mcap: string
  ttm_sales: string
  sales_growth: string
  profit_growth: string
  opm: string
  roe: string
  roa: string
  payout: string
  cfo_ebit_pct: string
  pe: string
  pb: string
  ps: string
  d_yield: string
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

function normalizePeerRow(raw: AboutPeerRow | Record<string, unknown>, isMedian = false): NormalizedPeerRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const company = cleanStr(r.company, '')
  if (!company) return null

  return {
    s_no: cleanStr(r.s_no, ''),
    company,
    screener_url: cleanStr(r.screener_url, ''),
    mcap: cleanStr(r.mcap ?? r.mcap_cr),
    ttm_sales: cleanStr(r.ttm_sales ?? r.revenue_cr),
    sales_growth: cleanStr(r.sales_growth),
    profit_growth: cleanStr(r.profit_growth),
    opm: cleanStr(r.opm ?? r.opm_pct),
    roe: cleanStr(r.roe),
    roa: cleanStr(r.roa),
    payout: cleanStr(r.payout),
    cfo_ebit_pct: cleanStr(r.cfo_ebit_pct),
    pe: cleanStr(r.pe),
    pb: cleanStr(r.pb),
    ps: cleanStr(r.ps),
    d_yield: cleanStr(r.d_yield),
    is_target: !isMedian && Boolean(r.is_target),
    is_median: isMedian || Boolean(r.is_median),
  }
}

/** Resolve Screener's deterministic Peer Comparison table */
export function resolvePeerComparison(about?: AboutState | null): ResolvedPeerComparison {
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
      footnote: cleanStr(srcComp.footnote, DEFAULT_PEER_FOOTNOTE),
    }
  }

  return {
    rows: [],
    median: null,
    sectorPath: [],
    authenticated: true,
    sourceUrl: '',
    footnote: DEFAULT_PEER_FOOTNOTE,
  }
}
