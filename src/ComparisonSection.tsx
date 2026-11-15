import { useMemo } from 'react'
import {
  AlertTriangle,
  GitCompare,
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
          <span>{row.company}</span>
        )}
        {row.is_target && <span className="about-peer-target-star">★ TARGET</span>}
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
    <>
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
    </>
  )
}

export function ComparisonSection({
  about,
  companyName,
  symbol,
  onRetry,
}: {
  about: AboutState
  companyName: string
  symbol: string
  onRetry?: () => void
}) {
  const comp = useMemo(() => resolvePeerComparison(about), [about])
  const targetRow = useMemo(() => comp.rows.find(r => r.is_target) || comp.rows[0], [comp])
  const medianRow = comp.median

  const sectorText = useMemo(() => {
    if (comp.sectorPath && comp.sectorPath.length > 0) {
      return comp.sectorPath.join(' › ')
    }
    const infoSector = about.data?.company_info?.sector
    if (infoSector) return infoSector
    return ''
  }, [comp.sectorPath, about.data])

  const isLoading = about.status === 'loading'
  const isError = about.status === 'error' && !comp.rows.length

  return (
    <div className="comparison-page-container">
      {/* 1. TOP BANNER */}
      <header className="comparison-top-banner">
        <div className="comparison-banner-left">
          <div className="comparison-avatar-chip">
            <GitCompare size={24} />
          </div>
          <div>
            <div className="comparison-title-row">
              <span className="comparison-company-name">{companyName || symbol}</span>
              {symbol && <span className="comparison-symbol-badge">{symbol}</span>}
              {sectorText && <span className="comparison-sector-badge">{sectorText}</span>}
            </div>
            <p className="comparison-page-subtitle">
              Peer comparison and industry positioning from Screener.in · {comp.rows.length} peer companies tracked
            </p>
          </div>
        </div>
        <div>
          {onRetry && (
            <button
              className="comparison-btn-refresh"
              onClick={onRetry}
              disabled={isLoading}
              title="Refresh peer comparison from Screener"
            >
              {isLoading ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
              <span>{isLoading ? 'Updating...' : 'Refresh Peers'}</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. LOADING OR ERROR STATES */}
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
        </div>
      )}

      {/* 3. SUMMARY KPI CARDS (TARGET VS MEDIAN) */}
      {targetRow && (
        <section className="comparison-kpi-grid" aria-label="Peer comparison highlights">
          <article className="comparison-kpi-card target-accent">
            <span className="comp-kpi-label">Market Cap (₹ Cr)</span>
            <div className="comp-kpi-values">
              <span className="comp-kpi-target-val">{targetRow.mcap || '-'}</span>
              {medianRow?.mcap && (
                <span className="comp-kpi-median-val">med: {medianRow.mcap}</span>
              )}
            </div>
          </article>

          <article className="comparison-kpi-card">
            <span className="comp-kpi-label">P/E [3Y Historical]</span>
            <div className="comp-kpi-values">
              <span className="comp-kpi-target-val">{targetRow.pe || '-'}</span>
              {medianRow?.pe && (
                <span className="comp-kpi-median-val">med: {medianRow.pe}</span>
              )}
            </div>
          </article>

          <article className="comparison-kpi-card">
            <span className="comp-kpi-label">OPM (3Y Avg)</span>
            <div className="comp-kpi-values">
              <span className="comp-kpi-target-val">{targetRow.opm || '-'}</span>
              {medianRow?.opm && (
                <span className="comp-kpi-median-val">med: {medianRow.opm}</span>
              )}
            </div>
          </article>

          <article className="comparison-kpi-card">
            <span className="comp-kpi-label">ROE (3Y Avg)</span>
            <div className="comp-kpi-values">
              <span className="comp-kpi-target-val">{targetRow.roe || '-'}</span>
              {medianRow?.roe && (
                <span className="comp-kpi-median-val">med: {medianRow.roe}</span>
              )}
            </div>
          </article>
        </section>
      )}

      {/* 4. MAIN PEER TABLE */}
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
