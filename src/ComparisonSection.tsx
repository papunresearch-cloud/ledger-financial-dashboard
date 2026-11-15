import { useMemo } from 'react'
import {
  AlertTriangle,
  LoaderCircle,
  RefreshCw,
  Building2,
  ExternalLink,
} from 'lucide-react'
import {
  PEER_METRIC_COLUMNS,
  PEER_TABLE_HEADERS,
  resolvePeerComparison,
  type NormalizedPeerRow,
  type ResolvedPeerComparison,
} from './peerComparison'
import type { AboutState } from './types'
import './comparisonSection.css'

function PeerTableRow({ row }: { row: NormalizedPeerRow }) {
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
      {PEER_METRIC_COLUMNS.map(col => (
        <td key={col.key}>{row[col.key] || '-'}</td>
      ))}
    </tr>
  )
}

function PeerComparisonBlock({ comp }: { comp: ResolvedPeerComparison }) {
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
              {PEER_TABLE_HEADERS.map(header => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comp.rows.map((row, idx) => (
              <PeerTableRow key={`${row.company}-${idx}`} row={row} />
            ))}
          </tbody>
          {comp.median && (
            <tfoot>
              <PeerTableRow row={comp.median} />
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
  onRetry,
}: {
  about: AboutState
  companyName: string
  symbol: string
  onRetry?: () => void
}) {
  const comp = useMemo(() => resolvePeerComparison(about), [about])
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
        <PeerComparisonBlock comp={comp} />
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
