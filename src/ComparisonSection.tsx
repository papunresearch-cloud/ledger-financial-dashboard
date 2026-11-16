import { useMemo } from 'react'
import {
  AlertTriangle,
  LoaderCircle,
  RefreshCw,
  Building2,
  ExternalLink,
} from 'lucide-react'
import {
  getPeerMetricColumns,
  resolvePeerComparison,
  formatPePbDiff,
  type NormalizedPeerRow,
  type PeerMetricColumn,
  type ResolvedPeerComparison,
} from './peerComparison'
import type { AboutState } from './types'
import './comparisonSection.css'

function parseCleanNum(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const s = String(val).replace(/,/g, '').replace(/₹/g, '').replace(/%/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function formatInrPrice(n: number | null): string {
  if (n === null || isNaN(n)) return '-'
  return n >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : n.toFixed(1)
}

function PriceRange52WBar({ row }: { row: NormalizedPeerRow }) {
  const low = parseCleanNum(row.low_52w)
  const high = parseCleanNum(row.high_52w)
  const cmp = parseCleanNum(row.cmp)
  const d50 = parseCleanNum(row.dma_50)
  const d200 = parseCleanNum(row.dma_200)

  if (low === null || high === null || high <= low || cmp === null) {
    return <span className="peer-range-fallback">{cmp !== null ? `₹${formatInrPrice(cmp)}` : '-'}</span>
  }

  const span = high - low
  const getPct = (v: number | null) => {
    if (v === null || isNaN(v)) return null
    const pct = ((v - low) / span) * 100
    return Math.max(0, Math.min(100, pct))
  }

  const cmpPct = getPct(cmp) ?? 0
  const d50Pct = getPct(d50)
  const d200Pct = getPct(d200)

  const rangePctStr = `${cmpPct.toFixed(1)}%`

  const tooltipParts = [
    `52W Low: ₹${formatInrPrice(low)}`,
    `CMP: ₹${formatInrPrice(cmp)} (R: ${rangePctStr})`,
    d50 !== null ? `50 DMA: ₹${formatInrPrice(d50)}` : null,
    d200 !== null ? `200 DMA: ₹${formatInrPrice(d200)}` : null,
    `52W High: ₹${formatInrPrice(high)}`,
    `Range Position: ${rangePctStr}`,
  ].filter(Boolean)
  const cellTooltip = tooltipParts.join('  ·  ')

  return (
    <div className="peer-range-compact-cell" title={cellTooltip}>
      {/* Visual Range Bar System with Markers */}
      <div className="peer-range-track-system">
        {/* Top Markers Area: Small Blue Triangle (50 DMA) & Big Orange Triangle (200 DMA) */}
        <div className="peer-markers-top">
          {d50Pct !== null && (
            <span
              className="peer-marker marker-dma50-tri"
              style={{ left: `${d50Pct}%` }}
              title={`50 DMA: ₹${formatInrPrice(d50)}`}
            />
          )}
          {d200Pct !== null && (
            <span
              className="peer-marker marker-dma200-tri"
              style={{ left: `${d200Pct}%` }}
              title={`200 DMA: ₹${formatInrPrice(d200)}`}
            />
          )}
        </div>

        {/* Gray Horizontal Range Bar Track */}
        <div className="peer-range-bar-track" />

        {/* Bottom Marker Area: Lower Arrow / Triangle pointing UP (CMP) */}
        <div className="peer-markers-bottom">
          <span
            className="peer-marker marker-cmp-arrow"
            style={{ left: `${cmpPct}%` }}
            title={`CMP: ₹${formatInrPrice(cmp)} · Range: ${rangePctStr}`}
          />
        </div>
      </div>

      {/* Only Range Information Required: R: xx.x% */}
      <span className="peer-range-pct-text">
        R: {rangePctStr}
      </span>
    </div>
  )
}

function renderPePbCell(val: string) {
  if (!val || val === '-') return '-'

  // Match pattern: "15.94 [25.69] (-37.95%)" or "15.94 [25.69] (+12.30%)"
  const formatted = formatPePbDiff(val)
  const withDiffMatch = formatted.match(/^([\d.,]+\s*\[[\d.,]+\])\s*\(([+-]?[\d.,]+%?)\)$/)
  if (withDiffMatch) {
    const base = withDiffMatch[1]
    const diffStr = withDiffMatch[2]
    const num = parseFloat(diffStr.replace(/,/g, '').replace(/%/g, ''))
    const isNeg = !isNaN(num) && num < 0
    return (
      <div className="peer-val-twoline">
        <span className="peer-val-line1">{base}</span>
        <span className={`peer-val-line2 ${isNeg ? 'peer-diff-neg' : 'peer-diff-pos'}`}>
          ({diffStr})
        </span>
      </div>
    )
  }

  // Fallback: If string is "X [Y]" without diff, compute it dynamically
  const pairMatch = formatted.match(/^([\d.,]+)\s*\[([\d.,]+)\]$/)
  if (pairMatch) {
    const cStr = pairMatch[1]
    const aStr = pairMatch[2]
    const c = parseFloat(cStr.replace(/,/g, ''))
    const a = parseFloat(aStr.replace(/,/g, ''))
    if (!isNaN(c) && !isNaN(a) && a > 0) {
      const diff = (100.0 * (c - a)) / a
      const sign = diff > 0 ? '+' : ''
      const diffStr = `${sign}${diff.toFixed(2)}%`
      const isNeg = diff < 0
      return (
        <div className="peer-val-twoline">
          <span className="peer-val-line1">{cStr} [{aStr}]</span>
          <span className={`peer-val-line2 ${isNeg ? 'peer-diff-neg' : 'peer-diff-pos'}`}>
            ({diffStr})
          </span>
        </div>
      )
    }
  }

  return val
}

function PeerTableRow({
  row,
  columns,
}: {
  row: NormalizedPeerRow
  columns: ReadonlyArray<PeerMetricColumn>
}) {
  const rowClass = row.is_median
    ? 'about-peer-row-median'
    : row.is_target
      ? 'about-peer-row-target'
      : 'about-peer-row-normal'

  return (
    <tr className={rowClass}>
      <td>
        {row.s_no && !row.is_median && <span className="about-peer-sno">{row.s_no}</span>}
        {row.screener_url && !row.is_median ? (
          <a
            href={row.screener_url}
            target="_blank"
            rel="noopener noreferrer"
            className="about-peer-link"
          >
            {row.company}
          </a>
        ) : (
          <span className="about-peer-name-text">{row.company}</span>
        )}
      </td>
      {columns.map(col => {
        if (col.key === 'price_range') {
          return (
            <td key={col.key} className="peer-td-range">
              <PriceRange52WBar row={row} />
            </td>
          )
        }
        const rawVal = row[col.key] || '-'
        const content = (col.key === 'pe' || col.key === 'pb') ? renderPePbCell(rawVal) : rawVal
        return <td key={col.key}>{content}</td>
      })}
    </tr>
  )
}

function PeerComparisonBlock({
  comp,
  columns,
}: {
  comp: ResolvedPeerComparison
  columns: ReadonlyArray<PeerMetricColumn>
}) {
  if (comp.rows.length === 0) return null

  return (
    <div className="comparison-table-only-container">
      {!comp.authenticated && (
        <div className="about-peer-auth-note">
          Screener returned public peer columns only (custom 3Y metrics show <code>-</code>). Sign in once in Ledger
          Settings to unlock all custom Screener metrics.
        </div>
      )}
      <div className="about-peer-wrap">
        <table className="about-peer-table">
          <thead>
            <tr>
              <th>
                <div className="peer-th-twoline">
                  <span className="peer-th-line1">Company</span>
                  <span className="peer-th-line2">Name</span>
                </div>
              </th>
              {columns.map(col => (
                <th key={col.key} title={col.tooltip || col.label}>
                  <div className="peer-th-twoline">
                    <span className="peer-th-line1">{col.headerLine1}</span>
                    {col.headerLine2 && <span className="peer-th-line2">{col.headerLine2}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comp.rows.map((row, idx) => (
              <PeerTableRow key={`${row.company}-${idx}`} row={row} columns={columns} />
            ))}
          </tbody>
          {comp.median && (
            <tfoot>
              <PeerTableRow row={comp.median} columns={columns} />
            </tfoot>
          )}
        </table>
      </div>

      {/* Visual Legend for 52W Range Track */}
      <div className="peer-legend-strip">
        <span className="legend-label">52W Range Legend:</span>
        <span className="legend-item"><span className="legend-marker marker-track-sample">━━</span> 52W Range Track (52W Low to High)</span>
        <span className="legend-item"><span className="legend-marker marker-cmp-arrow-sample">▲</span> Lower Arrow = CMP</span>
        <span className="legend-item"><span className="legend-marker marker-dma50-sample">▼</span> Small Blue Triangle = 50 DMA</span>
        <span className="legend-item"><span className="legend-marker marker-dma200-sample">▼</span> Big Orange Triangle = 200 DMA</span>
        <span className="legend-item"><span className="legend-code">R: xx.x%</span> = Range Position %</span>
      </div>

      <p className="about-peer-footnote">{comp.footnote}</p>
    </div>
  )
}

export function ComparisonSection({
  about,
  isBank = false,
  onRetry,
}: {
  about: AboutState
  companyName: string
  symbol: string
  isBank?: boolean
  onRetry?: () => void
}) {
  const comp = useMemo(() => resolvePeerComparison(about, isBank), [about, isBank])
  const columns = useMemo(() => getPeerMetricColumns(isBank), [isBank])
  const isLoading = about.status === 'loading'
  const isError = about.status === 'error' && !comp.rows.length

  return (
    <div className="comparison-page-container only-table-view">
      {/* LOADING OR ERROR STATES */}
      {isLoading && comp.rows.length === 0 && (
        <div className="comparison-status-strip loading">
          <LoaderCircle size={18} className="spin" />
          <span>Fetching live peer comparison table from Screener.in...</span>
        </div>
      )}

      {isError && (
        <div className="comparison-status-strip error">
          <AlertTriangle size={18} />
          <span>{about.error || 'Unable to fetch peer comparison for this company.'}</span>
          {onRetry && (
            <button className="comparison-btn-retry" onClick={onRetry}>
              <RefreshCw size={14} /> Retry
            </button>
          )}
        </div>
      )}

      {/* ONLY COMPARISON TABLE */}
      {comp.rows.length > 0 ? (
        <PeerComparisonBlock comp={comp} columns={columns} />
      ) : (
        !isLoading && (
          <div className="about-peer-empty">
            <Building2 size={36} style={{ color: '#64748b', margin: '0 auto 10px' }} />
            <p>No peer comparison data available for this company on Screener.</p>
            {comp.sourceUrl && (
              <p>
                <a
                  href={comp.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="about-peer-link"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <span>View Company on Screener.in</span>
                  <ExternalLink size={14} />
                </a>
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}
