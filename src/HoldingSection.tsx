import { useMemo } from 'react'
import {
  AlertTriangle,
  Building2,
  Globe,
  Landmark,
  LoaderCircle,
  PieChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { AboutState, ShareholdingPattern, ShareholdingTable } from './types'
import './holdingSection.css'

type Props = {
  about: AboutState
  companyName: string
  symbol: string
  onRetry: () => void
}

type CategoryType = 'promoters' | 'fiis' | 'diis' | 'government' | 'public' | 'shareholders' | 'total' | 'other'

function getCategoryType(category: string): CategoryType {
  const lower = category.toLowerCase()
  if (lower.includes('promoter')) return 'promoters'
  if (lower.includes('fii')) return 'fiis'
  if (lower.includes('dii')) return 'diis'
  if (lower.includes('govt') || lower.includes('government')) return 'government'
  if (lower.includes('public')) return 'public'
  if (lower.includes('shareholder')) return 'shareholders'
  if (lower.includes('total')) return 'total'
  return 'other'
}

function parsePercent(val: string): number | null {
  if (!val) return null
  const clean = val.replace(/%/g, '').replace(/,/g, '').trim()
  const num = parseFloat(clean)
  return Number.isFinite(num) ? num : null
}

function calcDelta(curr: string, prev: string): { diff: number; text: string } | null {
  const c = parsePercent(curr)
  const p = parsePercent(prev)
  if (c === null || p === null) return null
  const diff = c - p
  if (Math.abs(diff) < 0.005) return null
  const sign = diff > 0 ? '+' : ''
  return { diff, text: `${sign}${diff.toFixed(2)}%` }
}

function CategoryBadge({ category }: { category: string }) {
  const ctype = getCategoryType(category)
  let Icon = PieChart
  if (ctype === 'promoters') Icon = ShieldCheck
  else if (ctype === 'fiis') Icon = Globe
  else if (ctype === 'diis') Icon = Landmark
  else if (ctype === 'government') Icon = Building2
  else if (ctype === 'public') Icon = Users
  else if (ctype === 'shareholders') Icon = Users

  return (
    <span className={`sh-cat-badge cat-${ctype}`}>
      <Icon size={14} className="sh-cat-icon" />
      <span className="sh-cat-name">{category}</span>
    </span>
  )
}

function ShareholdingTableView({
  title,
  subtitle,
  table,
  tableType,
}: {
  title: string
  subtitle: string
  table: ShareholdingTable | null
  tableType: 'quarterly' | 'yearly'
}) {
  if (!table || !table.periods || table.periods.length === 0 || !table.rows || table.rows.length === 0) {
    return (
      <div className="sh-table-empty">
        <p>No {title.toLowerCase()} data found for this company.</p>
      </div>
    )
  }

  const { periods, rows } = table
  const latestPeriodIdx = periods.length - 1

  return (
    <div className="sh-table-card">
      <div className="sh-table-header">
        <div>
          <div className="sh-kicker">{tableType.toUpperCase()} SHAREHOLDING</div>
          <h3 className="sh-table-title">{title}</h3>
          <p className="sh-table-subtitle">{subtitle}</p>
        </div>
        <div className="sh-table-actions">
          <span className="sh-col-count-pill">{periods.length} {tableType === 'quarterly' ? 'Quarters' : 'Years'}</span>
        </div>
      </div>

      <div className="sh-table-scroll-wrap">
        <table className="sh-data-table">
          <thead>
            <tr>
              <th className="sh-th-category">Category</th>
              {periods.map((period, pIdx) => {
                const isLatest = pIdx === latestPeriodIdx
                return (
                  <th key={period} className={`sh-th-period ${isLatest ? 'sh-th-latest' : ''}`}>
                    <span className="sh-period-text">{period}</span>
                    {isLatest && <span className="sh-latest-tag">Latest</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const ctype = getCategoryType(row.category)
              const isShareholders = ctype === 'shareholders' || row.is_shareholders
              const isTotal = ctype === 'total' || row.is_total

              return (
                <tr
                  key={rIdx}
                  className={`sh-tr-${ctype} ${isShareholders ? 'sh-tr-shareholders' : ''} ${isTotal ? 'sh-tr-total' : ''}`}
                >
                  <td className="sh-td-category">
                    <CategoryBadge category={row.category} />
                  </td>

                  {periods.map((_, pIdx) => {
                    const val = row.values[pIdx] ?? '—'
                    const prevVal = pIdx > 0 ? row.values[pIdx - 1] : undefined
                    const delta = !isShareholders && prevVal ? calcDelta(val, prevVal) : null
                    const isLatest = pIdx === latestPeriodIdx

                    return (
                      <td
                        key={pIdx}
                        className={`sh-td-cell cell-${ctype} ${isLatest ? 'cell-latest' : ''} ${isShareholders ? 'cell-shareholders' : ''}`}
                      >
                        <div className="sh-cell-content">
                          <span className="sh-cell-value">{val}</span>
                          {delta && (
                            <span
                              className={`sh-delta-chip ${delta.diff > 0 ? 'delta-up' : 'delta-down'}`}
                              title={`Change vs previous period: ${delta.text}`}
                            >
                              {delta.diff > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {delta.text}
                            </span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function HoldingSection({ about, companyName, symbol, onRetry }: Props) {
  const isLoading = about.status === 'loading' || about.status === 'loading-sources'
  const isError = about.status === 'error' && !about.data
  const shareholding: ShareholdingPattern | undefined = about.data?.shareholding

  const quarterly = shareholding?.quarterly
  const yearly = shareholding?.yearly

  // Extract latest KPIs from latest quarterly (or fallback to yearly)
  const kpis = useMemo(() => {
    const tbl = quarterly?.periods?.length ? quarterly : yearly
    if (!tbl || !tbl.periods.length || !tbl.rows.length) return null

    const latestIdx = tbl.periods.length - 1
    const latestPeriod = tbl.periods[latestIdx]

    let promoter = '—'
    let fii = '—'
    let dii = '—'
    let govt = '—'
    let publicH = '—'
    let totalShareholders = '—'

    for (const r of tbl.rows) {
      const ctype = getCategoryType(r.category)
      const val = r.values[latestIdx] ?? '—'
      if (ctype === 'promoters') promoter = val
      else if (ctype === 'fiis') fii = val
      else if (ctype === 'diis') dii = val
      else if (ctype === 'government') govt = val
      else if (ctype === 'public') publicH = val
      else if (ctype === 'shareholders') totalShareholders = val
    }

    const pProm = parsePercent(promoter) ?? 0
    const pFii = parsePercent(fii) ?? 0
    const pDii = parsePercent(dii) ?? 0
    const pGovt = parsePercent(govt) ?? 0
    const pPublic = parsePercent(publicH) ?? 0
    const institutional = (pFii + pDii).toFixed(2) + '%'

    return {
      period: latestPeriod,
      promoter,
      fii,
      dii,
      institutional,
      govt,
      publicH,
      totalShareholders,
      shares: [
        { label: 'Promoters', val: pProm, color: '#6366f1', brightColor: '#1e40af' },
        { label: 'FIIs', val: pFii, color: '#a855f7', brightColor: '#6b21a8' },
        { label: 'DIIs', val: pDii, color: '#10b981', brightColor: '#047857' },
        { label: 'Government', val: pGovt, color: '#f59e0b', brightColor: '#9a3412' },
        { label: 'Public', val: pPublic, color: '#f43f5e', brightColor: '#be123c' },
      ].filter(s => s.val > 0),
    }
  }, [quarterly, yearly])

  return (
    <section className="holding-page-container">
      {/* Top Banner */}
      <div className="holding-top-banner">
        <div className="holding-banner-left">
          <div className="holding-avatar-chip">
            <PieChart size={22} />
          </div>
          <div>
            <div className="holding-title-row">
              <span className="holding-company-name">{companyName}</span>
              {symbol && <span className="holding-symbol-badge">{symbol}</span>}
              <span className="holding-live-badge">
                <Sparkles size={12} /> Screener Verified
              </span>
            </div>
            <p className="holding-page-subtitle">
              Detailed ownership distribution &amp; shareholder movement from official filings
            </p>
          </div>
        </div>

        <div className="holding-banner-actions">
          <button
            type="button"
            className="holding-btn-refresh"
            disabled={isLoading}
            onClick={onRetry}
            title="Refresh shareholding pattern from Screener.in"
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Loading banner */}
      {isLoading && (
        <div className="holding-status-strip loading">
          <LoaderCircle size={20} className="spin text-cyan" />
          <span>Fetching complete quarterly and yearly shareholding pattern from Screener.in…</span>
        </div>
      )}

      {/* Error banner */}
      {isError && (
        <div className="holding-status-strip error">
          <AlertTriangle size={20} className="text-rose" />
          <div style={{ flex: 1 }}>
            <strong>Could not fetch shareholding pattern</strong>
            <p>{about.error || 'Screener shareholding data is temporarily unavailable.'}</p>
          </div>
          <button type="button" className="holding-btn-refresh" onClick={onRetry}>
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Top Exotic KPI Cards */}
      {kpis && (
        <div className="holding-kpi-container">
          <div className="holding-kpi-grid">
            <div className="sh-kpi-card card-promoters">
              <div className="sh-kpi-head">
                <ShieldCheck size={16} />
                <span>Promoters</span>
              </div>
              <strong className="sh-kpi-value">{kpis.promoter}</strong>
              <small className="sh-kpi-sub">Latest: {kpis.period}</small>
            </div>

            <div className="sh-kpi-card card-fiis">
              <div className="sh-kpi-head">
                <Globe size={16} />
                <span>Foreign Inst. (FIIs)</span>
              </div>
              <strong className="sh-kpi-value">{kpis.fii}</strong>
              <small className="sh-kpi-sub">Global institutional holding</small>
            </div>

            <div className="sh-kpi-card card-diis">
              <div className="sh-kpi-head">
                <Landmark size={16} />
                <span>Domestic Inst. (DIIs)</span>
              </div>
              <strong className="sh-kpi-value">{kpis.dii}</strong>
              <small className="sh-kpi-sub">Mutual funds, insurers &amp; banks</small>
            </div>

            <div className="sh-kpi-card card-inst">
              <div className="sh-kpi-head">
                <PieChart size={16} />
                <span>Total Inst. (FII + DII)</span>
              </div>
              <strong className="sh-kpi-value">{kpis.institutional}</strong>
              <small className="sh-kpi-sub">Total smart money allocation</small>
            </div>

            <div className="sh-kpi-card card-public">
              <div className="sh-kpi-head">
                <Users size={16} />
                <span>Public &amp; Retail</span>
              </div>
              <strong className="sh-kpi-value">{kpis.publicH}</strong>
              <small className="sh-kpi-sub">Individual &amp; non-promoter</small>
            </div>

            <div className="sh-kpi-card card-shareholders">
              <div className="sh-kpi-head">
                <Users size={16} />
                <span>Total Shareholders</span>
              </div>
              <strong className="sh-kpi-value">{kpis.totalShareholders}</strong>
              <small className="sh-kpi-sub">Unique folio holders</small>
            </div>
          </div>

          {/* Segmented Distribution Bar */}
          {kpis.shares.length > 0 && (
            <div className="sh-segmented-bar-card">
              <div className="sh-seg-head">
                <span>LATEST OWNERSHIP COMPOSITION ({kpis.period})</span>
                <small>100% Normalized Allocation</small>
              </div>
              <div className="sh-segmented-track">
                {kpis.shares.map(item => (
                  <div
                    key={item.label}
                    className="sh-segment-slice"
                    style={{
                      width: `${Math.max(item.val, 2)}%`,
                      backgroundColor: item.color,
                    }}
                    title={`${item.label}: ${item.val.toFixed(2)}%`}
                  />
                ))}
              </div>
              <div className="sh-seg-legend">
                {kpis.shares.map(item => (
                  <div key={item.label} className="sh-legend-item">
                    <span className="sh-legend-dot" style={{ backgroundColor: item.color }} />
                    <span className="sh-legend-label">{item.label}:</span>
                    <strong className="sh-legend-val">{item.val.toFixed(2)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Tables Container */}
      <div className="holding-tables-stack">
        {/* Table 1: Quarterly Shareholding Pattern */}
        <ShareholdingTableView
          title="Quarterly Shareholding Pattern"
          subtitle="All available quarters from official corporate filings (values in % unless stated)"
          table={quarterly ?? null}
          tableType="quarterly"
        />

        {/* Table 2: Yearly Shareholding Pattern */}
        <ShareholdingTableView
          title="Yearly Shareholding Pattern"
          subtitle="Long-term multi-year shareholding pattern history (values in % unless stated)"
          table={yearly ?? null}
          tableType="yearly"
        />
      </div>

      <div className="holding-page-footer">
        <span>Source: Screener.in Quarterly &amp; Yearly Shareholding Pattern Disclosures</span>
      </div>
    </section>
  )
}
