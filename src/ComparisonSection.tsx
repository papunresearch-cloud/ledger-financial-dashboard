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
  getPeerTableHeaders,
  resolvePeerComparison,
  type NormalizedPeerRow,
  type PeerMetricKey,
  type ResolvedPeerComparison,
} from './peerComparison'
import type { AboutState } from './types'
import './comparisonSection.css'

function PeerTableRow({
  row,
  columns,
}: {
  row: NormalizedPeerRow
  columns: ReadonlyArray<{ key: PeerMetricKey; label: string; tooltip?: string }>
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
      {columns.map(col => (
        <td key={col.key}>{row[col.key] || '-'}</td>
      ))}
    </tr>
  )
}

function PeerComparisonBlock({
  comp,
  columns,
  headers,
}: {
  comp: ResolvedPeerComparison
  columns: ReadonlyArray<{ key: PeerMetricKey; label: string; tooltip?: string }>
  headers: string[]
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
              {headers.map((header, idx) => {
                const colInfo = idx > 0 ? columns[idx - 1] : null
                return (
                  <th key={header} title={colInfo?.tooltip || header}>
                    {header}
                  </th>
                )
              })}
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
  const headers = useMemo(() => getPeerTableHeaders(isBank), [isBank])
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
        <PeerComparisonBlock comp={comp} columns={columns} headers={headers} />
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
