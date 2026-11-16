import { Component, useState, type ReactNode } from 'react'
import { AlertTriangle, ExternalLink, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import type {
  AboutAnalystConsensus,
  AboutCreditRatingItem,
  AboutFactoryItem,
  AboutFinancialPositionSummary,
  AboutFinancialSnapshot,
  AboutMarketIntelligence,
  AboutMasterSource,
  AboutNewsItem,
  AboutState,
  AboutSubsidiaryItem,
  AboutSummaryReport,
  AboutValuationMultiples,
} from './types'
import {
  resolvePeerComparison,
} from './peerComparison'
import {
  normalizePromoterProfile,
  resolveShareholding,
  type NormalizedPromoterProfile,
  type ResolvedShareholding,
} from './promoterProfile'
import './aboutSection.css'

type Props = {
  about: AboutState
  fallbackCompanyName: string
  onRetry: () => void
  onUnlockWithKey: (key: string) => void
  onSaveLocalGeminiKey?: (key: string) => void
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const sub = asText(v)
        return sub ? `${k.replace(/_/g, ' ')}: ${sub}` : ''
      })
      .filter(Boolean)
      .join('; ')
  }
  return ''
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asPercent(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(asText(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function jumpToSource(id: string) {
  const el = document.getElementById(`about-source-${id}`)
  if (!el) return
  document.querySelectorAll('.about-source-highlight').forEach(node => node.classList.remove('about-source-highlight'))
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('about-source-highlight')
  window.setTimeout(() => el.classList.remove('about-source-highlight'), 4500)
}

function CitationBadge({ num }: { num?: unknown }) {
  const raw = asText(num).match(/\d+/)?.[0] ?? ''
  if (!raw) return null
  return (
    <button
      type="button"
      className="about-citation-badge"
      title={`Jump to Source [${raw}]`}
      onClick={() => jumpToSource(raw)}
    >
      [{raw}]
    </button>
  )
}

function CitationText({ text }: { text?: unknown }) {
  const safe = asText(text)
  if (!safe) return null
  const sanitized = safe.replace(/https?:\/\/\S+/g, '').trim()
  const parts = sanitized.split(/(\[+[\d\s,]+\]+)/g)
  return (
    <>
      {parts.map((part, idx) => {
        if (/^\[+[\d\s,]+\]+$/.test(part)) {
          const nums = part.match(/\d+/g) ?? []
          return nums.map((n, subIdx) => <CitationBadge key={`${idx}-${subIdx}`} num={n} />)
        }
        return <span key={idx}>{part}</span>
      })}
    </>
  )
}

const FP_METRIC_RE = /((?:Rs\.?|₹)\s*-?\d[\d,]*(?:\.\d+)?(?:\s*(?:Cr|Lakh|%|x))?|[+-]?\d[\d,]*(?:\.\d+)?\s*(?:%|x(?=\s|[.,;)]|$)|Cr(?=\s|[.,;)]|$)|days?(?=\s|[.,;)]|$)))/g

function renderMetricHighlightFragment(fragment: string, keyPrefix: string, boldMetrics: boolean): ReactNode {
  const citeParts = fragment.split(/(\[+[\d\s,]+\]+)/g)
  return citeParts.map((part, idx) => {
    if (/^\[+[\d\s,]+\]+$/.test(part)) {
      const nums = part.match(/\d+/g) ?? []
      return nums.map((n, subIdx) => <CitationBadge key={`${keyPrefix}-c-${idx}-${subIdx}`} num={n} />)
    }
    if (!boldMetrics) return <span key={`${keyPrefix}-t-${idx}`}>{part}</span>
    const segs = part.split(FP_METRIC_RE)
    return segs.map((seg, sIdx) => {
      if (!seg) return null
      if (sIdx % 2 === 1) {
        return <strong key={`${keyPrefix}-m-${idx}-${sIdx}`} className="about-fp-metric">{seg}</strong>
      }
      return <span key={`${keyPrefix}-s-${idx}-${sIdx}`}>{seg}</span>
    })
  })
}

function renderBoldAndCite(text: string, keyPrefix: string, autoBoldMetrics: boolean): ReactNode {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g)
  return boldParts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} className="about-fp-metric">
          {renderMetricHighlightFragment(part.slice(2, -2), `${keyPrefix}-bi-${idx}`, false)}
        </strong>
      )
    }
    return renderMetricHighlightFragment(part, `${keyPrefix}-p-${idx}`, autoBoldMetrics)
  })
}

function RichFinancialText({
  text,
  autoUnderlineLast = true,
}: {
  text?: unknown
  autoUnderlineLast?: boolean
}) {
  const raw = asText(text).replace(/https?:\/\/\S+/g, '').trim()
  if (!raw) return null
  let normalized = raw.replace(/<u>([\s\S]*?)<\/u>/gi, '__$1__')
  const hasExplicitUnderline = /__[^_]+__/.test(normalized)
  const hasExplicitBold = /\*\*[^*]+\*\*/.test(normalized)

  if (!hasExplicitUnderline && autoUnderlineLast && normalized.length >= 28) {
    const trailingCiteMatch = normalized.match(/(\s*(?:\[+[\d\s,]+\]+\.?)+)\s*$/)
    const trailingCites = trailingCiteMatch ? trailingCiteMatch[1] : ''
    const core = trailingCites ? normalized.slice(0, normalized.length - trailingCites.length).trimEnd() : normalized
    const lastPeriodIdx = Math.max(core.lastIndexOf('. '), core.lastIndexOf('! '), core.lastIndexOf('? '))
    if (lastPeriodIdx > 18 && core.length - (lastPeriodIdx + 2) >= 20) {
      normalized = `${core.slice(0, lastPeriodIdx + 2)}__${core.slice(lastPeriodIdx + 2)}__${trailingCites}`
    } else if (!core.includes('. ')) {
      normalized = `__${core}__${trailingCites}`
    }
  }

  const uParts = normalized.split(/(__[^_]+__)/g)
  return (
    <>
      {uParts.map((part, idx) => {
        if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
          return (
            <u key={`u-${idx}`} className="about-fp-conclusion">
              {renderBoldAndCite(part.slice(2, -2), `u-${idx}`, !hasExplicitBold)}
            </u>
          )
        }
        return <span key={`p-${idx}`}>{renderBoldAndCite(part, `p-${idx}`, !hasExplicitBold)}</span>
      })}
    </>
  )
}

function SummarySubcard({
  heading,
  accent,
  span2 = false,
  children,
}: {
  heading: string
  accent: 'cyan' | 'violet' | 'indigo' | 'fuchsia' | 'emerald' | 'blue' | 'purple' | 'amber' | 'rose'
  span2?: boolean
  children: ReactNode
}) {
  return (
    <div className={`about-subcard sum-acc-${accent} ${span2 ? 'about-span-2' : ''}`}>
      <div className="about-subcard-head">
        <h3 className={`sum-title-${accent}`}>{heading}</h3>
      </div>
      <div className="about-body-text">{children}</div>
    </div>
  )
}

function sourceTypeClass(stype: unknown): string {
  const safe = asText(stype)
  if (safe.includes('Official') || safe.includes('Encyclopedia')) return 'tag-indigo'
  if (safe.includes('Capex') || safe.includes('Positives')) return 'tag-emerald'
  if (safe.includes('Regulatory') || safe.includes('Risks')) return 'risk-high'
  if (safe.includes('Dossier')) return 'tag-amber'
  if (safe.includes('Corporate News') || safe.includes('Reputation')) return 'tag-blue'
  return 'tag-cyan'
}


function PromoterOwnershipBlock({
  profile,
  shareholding,
}: {
  profile?: NormalizedPromoterProfile
  shareholding: ResolvedShareholding
}) {
  const showProfile = Boolean(profile?.hasContent)
  const topNamed = shareholding.named_promoters?.slice(0, 8) ?? []

  return (
    <div className="about-promoter-wrap">
      {showProfile && profile && (
        !profile.isStructured ? (
          <p><CitationText text={profile.flatText} /></p>
        ) : (
          <>
            {profile.mainGroup && (
              <p>
                <strong>Main Promoter Group &amp; Control:</strong>{' '}
                <CitationText text={profile.mainGroup} />
              </p>
            )}
            {profile.shortHistory && (
              <p>
                <strong>Short History &amp; Background:</strong>{' '}
                <CitationText text={profile.shortHistory} />
              </p>
            )}
            {profile.reputation && (
              <p>
                <strong>Market Reputation &amp; Governance Track Record:</strong>{' '}
                <CitationText text={profile.reputation} />
              </p>
            )}
            {(profile.positives.length > 0 || profile.negatives.length > 0) && (
              <div className="about-promoter-grid">
                <div className="about-promoter-box box-positives">
                  <div className="about-promoter-box-head">
                    <span className="about-tag-badge tag-emerald">Positive Signals &amp; Strengths</span>
                  </div>
                  {profile.positives.length > 0 ? (
                    <ul className="about-promoter-list">
                      {profile.positives.map((pt, i) => (
                        <li key={i}><CitationText text={pt} /></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="about-bar-desc">No distinct positive governance highlights surfaced in current feeds.</p>
                  )}
                </div>
                <div className="about-promoter-box box-concerns">
                  <div className="about-promoter-box-head">
                    <span className="about-tag-badge risk-high">Concerns, Risks &amp; Controversies</span>
                  </div>
                  {profile.negatives.length > 0 ? (
                    <ul className="about-promoter-list">
                      {profile.negatives.map((pt, i) => (
                        <li key={i}><CitationText text={pt} /></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="about-bar-desc">No material promoter controversies or pledge red flags identified.</p>
                  )}
                </div>
              </div>
            )}
            {profile.ownershipTakeaway && (
              <p>
                <strong>Ownership &amp; Shareholder Trend:</strong>{' '}
                <CitationText text={profile.ownershipTakeaway} />
              </p>
            )}
          </>
        )
      )}

      {(topNamed.length > 0 || shareholding.pledged_pct) && (
        <div className="about-promoter-chips">
          {shareholding.pledged_pct && (
            <span className="about-pledge-chip">Pledged: {shareholding.pledged_pct}</span>
          )}
          {topNamed.map(holder => (
            <span key={holder.name} className="about-promoter-chip">
              {holder.name}: <strong>{holder.latest_pct}</strong>
            </span>
          ))}
        </div>
      )}


    </div>
  )
}

const MIX_PALETTE = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6'] as const
const BAR_GRADS = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5'] as const

function MixDistributionPanel({
  title,
  badge,
  badgeClass,
  pctClass,
  items,
  gradOffset = 0,
  emptyText,
}: {
  title: string
  badge: string
  badgeClass: string
  pctClass: string
  items: Array<{ name: string; percentage: number; details?: string }>
  gradOffset?: number
  emptyText: string
}) {
  const totalPct = items.reduce((acc, it) => acc + Math.max(0, it.percentage), 0)
  return (
    <div className="about-mix-panel">
      <div className="about-shp-head">
        <h4>{title}</h4>
        <span className={`about-tag-badge ${badgeClass}`}>{badge}</span>
      </div>
      {items.length > 0 ? (
        <>
          {totalPct > 0 && (
            <div className="about-stacked-bar" aria-label={title}>
              {items.map((it, idx) => {
                const widthPct = Math.max(4, (Math.max(0, it.percentage) / totalPct) * 100)
                return (
                  <div
                    key={`${it.name}-${idx}`}
                    className="about-stacked-seg"
                    style={{ width: `${widthPct}%`, backgroundColor: MIX_PALETTE[idx % MIX_PALETTE.length] }}
                    title={`${it.name}: ${it.percentage.toFixed(1)}%`}
                  />
                )
              })}
            </div>
          )}
          <div className="about-mix-bars">
            {items.map((it, idx) => (
              <div key={`${it.name}-${idx}`} className="about-bar-item">
                <div className="about-bar-meta">
                  <span className="about-bar-label">
                    <span
                      className="about-legend-dot"
                      style={{ backgroundColor: MIX_PALETTE[idx % MIX_PALETTE.length] }}
                    />
                    {it.name}
                  </span>
                  <span className={pctClass}>{it.percentage.toFixed(1)}%</span>
                </div>
                <div className="about-bar-track">
                  <div
                    className={`about-bar-fill ${BAR_GRADS[(idx + gradOffset) % BAR_GRADS.length]}`}
                    style={{ width: `${Math.min(100, Math.max(6, it.percentage))}%` }}
                  />
                </div>
                {it.details && <div className="about-bar-desc">{it.details}</div>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="about-bar-desc">{emptyText}</p>
      )}
    </div>
  )
}

function BusinessDetailsBlock({
  sum,
  revBreakupBars,
  geoReachBars,
  factories,
  subsidiaries,
}: {
  sum: AboutSummaryReport
  revBreakupBars: Array<{ category?: unknown; percentage?: unknown; details?: unknown }>
  geoReachBars: Array<{ region?: unknown; percentage?: unknown; details?: unknown }>
  factories: AboutFactoryItem[]
  subsidiaries: AboutSubsidiaryItem[]
}) {
  const modelText = asText(sum.business_model_short)
  const revenueText = asText(sum.revenue_sources_short)
  const rbRaw = sum.revenue_breakups
  const isRbObj = Boolean(rbRaw && typeof rbRaw === 'object' && !Array.isArray(rbRaw))
  const rbFlat = !isRbObj ? asText(rbRaw) : ''
  const rbProd = isRbObj ? asText((rbRaw as { product_wise?: unknown }).product_wise) : ''
  const rbGeo = isRbObj ? asText((rbRaw as { geography_wise?: unknown }).geography_wise) : ''
  const rbCons = isRbObj ? asText((rbRaw as { consolidated_vs_standalone?: unknown }).consolidated_vs_standalone) : ''
  const hasRb = Boolean(rbFlat || rbProd || rbGeo || rbCons)

  const segItems = revBreakupBars
    .map(r => ({ name: asText(r?.category), percentage: asPercent(r?.percentage), details: asText(r?.details) }))
    .filter(r => r.name)
  const geoItems = geoReachBars
    .map(g => ({ name: asText(g?.region), percentage: asPercent(g?.percentage), details: asText(g?.details) }))
    .filter(g => g.name)

  return (
    <div className="about-business-details-wrap">
      {(modelText || revenueText || hasRb) && (
        <div className="about-details-trio">
          {modelText && (
            <div className="about-detail-panel panel-emerald">
              <div className="about-detail-panel-head">Business Model, Products &amp; Services</div>
              <div className="about-body-text">
                <p><CitationText text={modelText} /></p>
              </div>
            </div>
          )}
          {revenueText && (
            <div className="about-detail-panel panel-blue">
              <div className="about-detail-panel-head">Primary Revenue Sources</div>
              <div className="about-body-text">
                <p><CitationText text={revenueText} /></p>
              </div>
            </div>
          )}
          {hasRb && (
            <div className="about-detail-panel panel-purple">
              <div className="about-detail-panel-head">Revenue Breakups</div>
              <div className="about-body-text">
                {rbFlat && <p><CitationText text={rbFlat} /></p>}
                {rbProd && <p><strong className="sum-title-purple">Product-Wise: </strong><CitationText text={rbProd} /></p>}
                {rbGeo && <p><strong className="sum-title-purple">Geography-Wise: </strong><CitationText text={rbGeo} /></p>}
                {rbCons && <p><strong className="sum-title-purple">Consolidated vs Standalone: </strong><CitationText text={rbCons} /></p>}
              </div>
            </div>
          )}
        </div>
      )}

      {(segItems.length > 0 || geoItems.length > 0) && (
        <div className="about-grid-2">
          <MixDistributionPanel
            title="Business Segments & Revenue Mix"
            badge="Divisions"
            badgeClass="tag-cyan"
            pctClass="about-bar-pct-cyan"
            items={segItems}
            gradOffset={0}
            emptyText="Segment share breakdown unavailable in current disclosures."
          />
          <MixDistributionPanel
            title="Geographical Distribution & Reach"
            badge="Markets"
            badgeClass="tag-indigo"
            pctClass="about-bar-pct-indigo"
            items={geoItems}
            gradOffset={2}
            emptyText="Geographical split unavailable in current disclosures."
          />
        </div>
      )}

      {(factories.length > 0 || subsidiaries.length > 0) && (
        <div className="about-grid-2">
          {factories.length > 0 && (
            <div className="about-entity-list-card">
              <div className="about-shp-head">
                <h4>Factories, Plants &amp; Operating Facilities</h4>
                <span className="about-tag-badge tag-emerald">{factories.length} Listed</span>
              </div>
              <ul className="about-entity-list">
                {factories.map((fac, idx) => (
                  <li key={`${fac.name}-${idx}`}>
                    <div className="about-entity-row">
                      <strong>{fac.name}</strong>
                      {fac.location && <span className="about-entity-meta">{fac.location}</span>}
                    </div>
                    {fac.details && (
                      <div className="about-entity-desc"><CitationText text={fac.details} /></div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {subsidiaries.length > 0 && (
            <div className="about-entity-list-card">
              <div className="about-shp-head">
                <h4>Subsidiaries, Associates &amp; Joint Ventures</h4>
                <span className="about-tag-badge tag-indigo">{subsidiaries.length} Listed</span>
              </div>
              <ul className="about-entity-list">
                {subsidiaries.map((sub, idx) => (
                  <li key={`${sub.name}-${idx}`}>
                    <div className="about-entity-row">
                      <strong>{sub.name}</strong>
                      {sub.relationship && <span className="about-entity-meta">{sub.relationship}</span>}
                    </div>
                    {sub.details && (
                      <div className="about-entity-desc"><CitationText text={sub.details} /></div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function FinancialPositionBlock({
  fp,
  snapshot,
}: {
  fp?: AboutFinancialPositionSummary | null
  snapshot?: AboutFinancialSnapshot | null
}) {
  const stance = asText(fp?.overall_stance)
  const salesYearly = asText(fp?.sales_yearly_and_ttm)
  const salesQuarterly = asText(fp?.sales_quarterly_momentum)
  const pnlYearly = asText(fp?.pnl_yearly_and_ttm)
  const pnlQuarterly = asText(fp?.pnl_quarterly_trend)
  const bsHealth = asText(fp?.balance_sheet_health)
  const cfQuality = asText(fp?.cash_flow_quality)
  const strengths = asArray<unknown>(fp?.strengths_good).map(asText).filter(Boolean)
  const watchpoints = asArray<unknown>(fp?.watchpoints_bad).map(asText).filter(Boolean)
  const trendStatus = asText(fp?.trend_status)
  const trendVerdict = asText(fp?.current_trend_verdict)
  const ranges = asArray<{ metric?: string; items?: Array<{ period?: string; value?: string }> }>(
    snapshot?.growth_ranges,
  )

  const trendLow = trendStatus.toLowerCase()
  const trendCls = trendLow.includes('improv')
    ? 'tag-emerald'
    : trendLow.includes('caut') || trendLow.includes('deterior') || trendLow.includes('weak')
      ? 'risk-high'
      : trendLow.includes('mix')
        ? 'tag-amber'
        : 'tag-cyan'

  return (
    <div className="about-finpos-wrap">
      {(stance || trendStatus) && (
        <div className="about-finpos-stance">
          {stance && <p><RichFinancialText text={stance} /></p>}
          {trendStatus && <span className={`about-tag-badge ${trendCls}`}>{trendStatus} Trend</span>}
        </div>
      )}

      {(salesYearly || salesQuarterly || pnlYearly || pnlQuarterly || bsHealth || cfQuality) && (
        <div className="about-grid-2">
          {salesYearly && (
            <div className="about-finpos-card">
              <h5>Sales Trajectory (Yearly &amp; TTM)</h5>
              <p><RichFinancialText text={salesYearly} /></p>
            </div>
          )}
          {salesQuarterly && (
            <div className="about-finpos-card">
              <h5>Quarterly Sales Momentum (QoQ &amp; YoY)</h5>
              <p><RichFinancialText text={salesQuarterly} /></p>
            </div>
          )}
          {pnlYearly && (
            <div className="about-finpos-card">
              <h5>P&amp;L Trajectory (Yearly &amp; TTM)</h5>
              <p><RichFinancialText text={pnlYearly} /></p>
            </div>
          )}
          {pnlQuarterly && (
            <div className="about-finpos-card">
              <h5>Quarterly P&amp;L Momentum (QoQ &amp; YoY)</h5>
              <p><RichFinancialText text={pnlQuarterly} /></p>
            </div>
          )}
          {bsHealth && (
            <div className="about-finpos-card">
              <h5>Balance Sheet Strength &amp; Solvency</h5>
              <p><RichFinancialText text={bsHealth} /></p>
            </div>
          )}
          {cfQuality && (
            <div className="about-finpos-card">
              <h5>Cash Flow &amp; Free Cash Flow Quality</h5>
              <p><RichFinancialText text={cfQuality} /></p>
            </div>
          )}
        </div>
      )}

      {(strengths.length > 0 || watchpoints.length > 0) && (
        <div className="about-promoter-grid">
          <div className="about-promoter-box box-positives">
            <div className="about-promoter-box-head">
              <span className="about-tag-badge tag-emerald">Financial Strengths (Good)</span>
            </div>
            {strengths.length > 0 ? (
              <ul className="about-promoter-list">
                {strengths.map((pt, i) => (
                  <li key={i}><RichFinancialText text={pt} autoUnderlineLast={false} /></li>
                ))}
              </ul>
            ) : (
              <p className="about-bar-desc">No distinct financial tailwinds highlighted.</p>
            )}
          </div>
          <div className="about-promoter-box box-concerns">
            <div className="about-promoter-box-head">
              <span className="about-tag-badge risk-high">Financial Concerns &amp; Watchpoints (Bad)</span>
            </div>
            {watchpoints.length > 0 ? (
              <ul className="about-promoter-list">
                {watchpoints.map((pt, i) => (
                  <li key={i}><RichFinancialText text={pt} autoUnderlineLast={false} /></li>
                ))}
              </ul>
            ) : (
              <p className="about-bar-desc">No material balance sheet or cash flow red flags surfaced.</p>
            )}
          </div>
        </div>
      )}

      {trendVerdict && (
        <div className="about-finpos-verdict">
          <strong>Current Financial Trend:</strong> <RichFinancialText text={trendVerdict} />
        </div>
      )}

      {ranges.length > 0 && (
        <div className="about-finpos-ranges">
          {ranges.map((r, idx) => (
            <div key={`${r.metric}-${idx}`} className="about-range-pill">
              <span className="about-range-title">{r.metric}</span>
              <span className="about-range-vals">
                {(r.items ?? []).map(it => `${it.period}: ${it.value}`).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}


    </div>
  )
}

function ValuationMultiplesBlock({
  val,
  aiSummary,
}: {
  val?: AboutValuationMultiples
  aiSummary?: string
}) {
  const tpe = asText(val?.trailing_pe) || asText(val?.screener_pe)
  const fpe = asText(val?.forward_pe)
  const peg = asText(val?.peg_ratio)
  const pb = asText(val?.price_to_book)
  const teps = asText(val?.trailing_eps)
  const feps = asText(val?.forward_eps)
  const screenerPe = asText(val?.screener_pe)

  const hasMetrics = Boolean(tpe || fpe || peg || pb || teps || feps)

  return (
    <div className="about-valuation-wrap">
      {hasMetrics && (
        <div className="about-metrics-strip">
          {tpe && (
            <div className="about-metric-pill">
              <span className="about-metric-label">Trailing P/E</span>
              <strong className="about-metric-val">{tpe}x</strong>
            </div>
          )}
          {fpe && (
            <div className="about-metric-pill accent-pill">
              <span className="about-metric-label">Forward P/E</span>
              <strong className="about-metric-val">{fpe}x</strong>
            </div>
          )}
          {peg && (
            <div className="about-metric-pill">
              <span className="about-metric-label">PEG Ratio</span>
              <strong className="about-metric-val">{peg}</strong>
            </div>
          )}
          {pb && (
            <div className="about-metric-pill">
              <span className="about-metric-label">Price / Book</span>
              <strong className="about-metric-val">{pb}x</strong>
            </div>
          )}
          {teps && (
            <div className="about-metric-pill">
              <span className="about-metric-label">Trailing EPS</span>
              <strong className="about-metric-val">₹{teps}</strong>
            </div>
          )}
          {feps && (
            <div className="about-metric-pill">
              <span className="about-metric-label">Forward EPS</span>
              <strong className="about-metric-val">₹{feps}</strong>
            </div>
          )}
          {screenerPe && screenerPe !== tpe && (
            <div className="about-metric-pill">
              <span className="about-metric-label">Screener P/E</span>
              <strong className="about-metric-val">{screenerPe}x</strong>
            </div>
          )}
        </div>
      )}
      {aiSummary && (
        <div className="about-body-text" style={{ marginTop: hasMetrics ? 10 : 0 }}>
          <p><CitationText text={aiSummary} /></p>
        </div>
      )}
    </div>
  )
}

function isWithinLast12Months(dateStr?: unknown): boolean {
  const safe = asText(dateStr).trim()
  if (!safe) return true
  const now = new Date()
  const cutoff = new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000)

  const mYear = safe.match(/\b(20\d\d)\b/)
  if (mYear) {
    const yr = Number(mYear[1])
    if (yr < cutoff.getFullYear() - 1) return false
    if (yr === cutoff.getFullYear() - 1 && now.getMonth() > 0) return false
  }

  const parsed = Date.parse(safe)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed) >= cutoff
  }
  return true
}

export function getAnalystReliability(analystCount?: unknown): {
  stars: number
  starsText: string
  label: string
  badgeCls: string
} {
  const count = Number(asText(analystCount).replace(/[^0-9]/g, '')) || 0
  if (count >= 10) {
    return {
      stars: 3,
      starsText: '★★★',
      label: 'High Reliability (10+ Analysts)',
      badgeCls: 'stars-high',
    }
  }
  if (count >= 5) {
    return {
      stars: 2,
      starsText: '★★☆',
      label: 'Moderate Reliability (5-9 Analysts)',
      badgeCls: 'stars-mid',
    }
  }
  return {
    stars: 1,
    starsText: '★☆☆',
    label: 'Low Reliability (<5 Analysts)',
    badgeCls: 'stars-low',
  }
}

function AnalystForecastsBlock({
  consensus,
  news,
  aiSummary,
}: {
  consensus?: AboutAnalystConsensus
  news?: AboutNewsItem[]
  aiSummary?: string
}) {
  const rating = asText(consensus?.rating)?.toUpperCase()
  const count = asText(consensus?.analyst_count)
  const rel = getAnalystReliability(count)
  const meanTarget = asText(consensus?.target_mean_price)
  const upside = asText(consensus?.implied_upside_pct)
  const lowTarget = asText(consensus?.target_low_price)
  const medTarget = asText(consensus?.target_median_price)
  const highTarget = asText(consensus?.target_high_price)
  const dist = consensus?.distribution

  const totalVotes = dist
    ? (dist.strongBuy ?? 0) + (dist.buy ?? 0) + (dist.hold ?? 0) + (dist.sell ?? 0) + (dist.strongSell ?? 0)
    : 0

  return (
    <div className="about-analyst-wrap">
      {(rating || meanTarget || count) && (
        <div className="about-analyst-card">
          <div className="about-analyst-headline-left">
            {rating && (
              <span className={`about-rec-badge rec-${rating.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                {rating}
              </span>
            )}
            <div className="about-reliability-box">
              <span className={`about-stars-pill ${rel.badgeCls}`} title={`Reliability: ${rel.label}`}>
                <span className="about-stars-gold">{rel.starsText}</span>
                <span className="about-stars-label">{rel.label}</span>
              </span>
              <span className="about-analyst-count">
                Based on <strong>{count || '1+'}</strong> covering analysts (Last 12M)
              </span>
            </div>
          </div>
          {meanTarget && (
            <div className="about-target-band">
              <span className="about-target-label">1Y Consensus Target</span>
              <div className="about-target-row">
                <strong className="about-target-val">₹{meanTarget}</strong>
                {upside && (
                  <span className={`about-upside-badge ${upside.startsWith('-') ? 'upside-neg' : 'upside-pos'}`}>
                    {upside.startsWith('-') || upside.startsWith('+') ? upside : `+${upside}`}%
                  </span>
                )}
              </div>
              {(lowTarget || medTarget || highTarget) && (
                <span className="about-target-range">
                  {lowTarget ? `Low: ₹${lowTarget}` : ''}
                  {medTarget ? `${lowTarget ? ' · ' : ''}Med: ₹${medTarget}` : ''}
                  {highTarget ? `${lowTarget || medTarget ? ' · ' : ''}High: ₹${highTarget}` : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {dist && totalVotes > 0 && (
        <div className="about-dist-card">
          <div className="about-dist-label">Analyst Recommendation Distribution ({totalVotes} analysts)</div>
          <div className="about-dist-bar">
            {dist.strongBuy ? <div className="dist-seg seg-strong-buy" style={{ flex: dist.strongBuy }} title={`Strong Buy: ${dist.strongBuy}`} /> : null}
            {dist.buy ? <div className="dist-seg seg-buy" style={{ flex: dist.buy }} title={`Buy: ${dist.buy}`} /> : null}
            {dist.hold ? <div className="dist-seg seg-hold" style={{ flex: dist.hold }} title={`Hold: ${dist.hold}`} /> : null}
            {dist.sell ? <div className="dist-seg seg-sell" style={{ flex: dist.sell }} title={`Sell: ${dist.sell}`} /> : null}
            {dist.strongSell ? <div className="dist-seg seg-strong-sell" style={{ flex: dist.strongSell }} title={`Strong Sell: ${dist.strongSell}`} /> : null}
          </div>
          <div className="about-dist-legend">
            {(dist.strongBuy ?? 0) > 0 && <span><b className="dot dot-strong-buy" /> Strong Buy: {dist.strongBuy}</span>}
            {(dist.buy ?? 0) > 0 && <span><b className="dot dot-buy" /> Buy: {dist.buy}</span>}
            {(dist.hold ?? 0) > 0 && <span><b className="dot dot-hold" /> Hold: {dist.hold}</span>}
            {(dist.sell ?? 0) > 0 && <span><b className="dot dot-sell" /> Sell: {dist.sell}</span>}
            {(dist.strongSell ?? 0) > 0 && <span><b className="dot dot-strong-sell" /> Strong Sell: {dist.strongSell}</span>}
          </div>
        </div>
      )}

      {aiSummary && (
        <div className="about-body-text" style={{ marginTop: 10 }}>
          <p><CitationText text={aiSummary} /></p>
        </div>
      )}

      {news && news.length > 0 && (
        <div className="about-market-news-list">
          <div className="about-sub-head">Brokerage Calls &amp; Analyst Updates</div>
          {news.slice(0, 4).map((item, idx) => (
            <div key={idx} className="about-market-news-item">
              <span className="about-tag-badge tag-indigo">{asText(item.publisher) || 'Analyst'}</span>
              <span className="about-news-title">{asText(item.headline) || asText(item.title)}</span>
              {asText(item.date) && <span className="about-news-date">{asText(item.date)}</span>}
              <CitationBadge num={item.ref_id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ManagementGuidanceBlock({
  aiGuidance,
  news,
  concalls,
}: {
  aiGuidance?: string
  news?: AboutNewsItem[]
  concalls?: Array<{ title?: string; url?: string; ref_id?: number }>
}) {
  return (
    <div className="about-guidance-wrap">
      {aiGuidance && (
        <div className="about-body-text">
          <p><CitationText text={aiGuidance} /></p>
        </div>
      )}

      {concalls && concalls.length > 0 && (
        <div className="about-concalls-box">
          <div className="about-sub-head">Earnings Concalls &amp; Investor Presentations</div>
          <div className="about-concalls-list">
            {concalls.slice(0, 6).map((c, idx) => (
              <span key={idx} className="about-concall-pill">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={asText(c.title) || 'Concall / Presentation'}
                >
                  {asText(c.title) || 'Concall Disclosure'}
                  <ExternalLink size={11} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                </a>
                <CitationBadge num={c.ref_id} />
              </span>
            ))}
          </div>
        </div>
      )}

      {news && news.length > 0 && (
        <div className="about-market-news-list">
          <div className="about-sub-head">Management Outlook &amp; Guidance Commentary</div>
          {news.slice(0, 4).map((item, idx) => (
            <div key={idx} className="about-market-news-item">
              <span className="about-tag-badge tag-emerald">{asText(item.publisher) || 'Management'}</span>
              <span className="about-news-title">{asText(item.headline) || asText(item.title)}</span>
              {asText(item.date) && <span className="about-news-date">{asText(item.date)}</span>}
              <CitationBadge num={item.ref_id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreditRatingsBlock({
  ratings,
  news,
  aiSummary,
}: {
  ratings?: AboutCreditRatingItem[]
  news?: AboutNewsItem[]
  aiSummary?: string
}) {
  return (
    <div className="about-credit-wrap">
      {ratings && ratings.length > 0 && (
        <div className="about-ratings-grid">
          {ratings.map((r, idx) => {
            const agency = asText(r.agency) || 'Credit Agency'
            const ratingStr = asText(r.rating)
            const dateStr = asText(r.date)
            const details = asText(r.details) || asText(r.title)
            return (
              <div key={idx} className="about-rating-card">
                <div className="about-rating-header">
                  <span className="about-agency-badge">{agency}</span>
                  {ratingStr && <span className="about-rating-grade">{ratingStr}</span>}
                </div>
                {dateStr && <div className="about-rating-date">Dated: {dateStr}</div>}
                {details && <div className="about-rating-details">{details}</div>}
                <div className="about-rating-footer">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="about-rating-link">
                      Rating Rationale <ExternalLink size={10} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
                    </a>
                  ) : <span />}
                  <CitationBadge num={r.ref_id} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {aiSummary && (
        <div className="about-body-text" style={{ marginTop: ratings && ratings.length > 0 ? 10 : 0 }}>
          <p><CitationText text={aiSummary} /></p>
        </div>
      )}

      {news && news.length > 0 && (
        <div className="about-market-news-list">
          <div className="about-sub-head">Credit Rating Disclosures &amp; Agency Actions (Last 12 Months)</div>
          {news.slice(0, 4).map((item, idx) => (
            <div key={idx} className="about-market-news-item">
              <span className="about-tag-badge tag-amber">{asText(item.publisher) || 'Rating Agency'}</span>
              <span className="about-news-title">{asText(item.headline) || asText(item.title)}</span>
              {asText(item.date) && <span className="about-news-date">{asText(item.date)}</span>}
              <CitationBadge num={item.ref_id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type BoundaryState = { hasError: boolean; errorMsg: string }

class AboutErrorBoundary extends Component<{ onRetry: () => void; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false, errorMsg: '' }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, errorMsg: error?.message || 'Unexpected rendering error in About report.' }
  }

  componentDidUpdate(prevProps: { onRetry: () => void; children: ReactNode }) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, errorMsg: '' })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="about-wrap">
          <div className="error-box">
            <AlertTriangle size={16} />
            <div style={{ flex: 1 }}>
              About section hit a formatting issue ({this.state.errorMsg}). Overview, Plots, Data Sheet, and Data checks remain ready.
            </div>
            <button
              type="button"
              className="button button-soft"
              onClick={() => {
                this.setState({ hasError: false, errorMsg: '' })
                this.props.onRetry()
              }}
            >
              Retry
            </button>
          </div>
        </section>
      )
    }
    return this.props.children
  }
}

export function AboutSection(props: Props) {
  return (
    <AboutErrorBoundary onRetry={props.onRetry}>
      <AboutSectionInner {...props} />
    </AboutErrorBoundary>
  )
}

function AboutSectionInner({ about, fallbackCompanyName, onRetry, onUnlockWithKey, onSaveLocalGeminiKey }: Props) {
  const [inlineKey, setInlineKey] = useState('')
  const [localGeminiKey, setLocalGeminiKey] = useState('')
  const sources = about.sources
  const ai = about.ai
  const compName = asText(sources?.company_info?.name) || asText(fallbackCompanyName) || 'Company'
  const compSymbol = asText(sources?.company_info?.symbol)
  const sum = ai?.summary_report && typeof ai.summary_report === 'object' ? ai.summary_report : null
  const masterSources = asArray<AboutMasterSource>(sources?.master_sources)

  if (about.status === 'needs-key') {
    return (
      <section className="about-wrap">
        <div className="about-key-card">
          <h3><KeyRound size={17} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Cloud Corporate Intelligence Key Required</h3>
          <p>
            Your workbook charts and tables are ready in the Overview, Plots, Data Sheet, and Data checks tabs.
            To fetch live Screener filings, official website disclosures, 12-month news, and Gemini AI Summary Report for <b>{compName}</b>, enter your private Ledger access key once:
          </p>
          <div className="about-key-row">
            <input
              type="password"
              value={inlineKey}
              onChange={e => setInlineKey(e.target.value)}
              placeholder="Enter Ledger access key"
              onKeyDown={e => {
                if (e.key === 'Enter' && inlineKey.trim()) onUnlockWithKey(inlineKey.trim())
              }}
            />
            <button
              type="button"
              className="button button-primary"
              disabled={!inlineKey.trim()}
              onClick={() => onUnlockWithKey(inlineKey.trim())}
            >
              Load About Report
            </button>
          </div>
        </div>
      </section>
    )
  }

  const sectionColors = ['cyan', 'emerald', 'blue', 'indigo', 'violet', 'purple', 'amber', 'orange', 'rose'] as const
  const recentNews = asArray<AboutNewsItem>(sources?.live_intel?.recent_news_12m)
  const aiSections = asArray<{ title?: unknown; content?: unknown }>(ai?.sections)
  const capexList = asArray<{ headline?: unknown; date?: unknown; details?: unknown; source_num?: unknown }>(ai?.capex_and_order_book)
  const regList = asArray<{ issue?: unknown; severity?: unknown; details?: unknown; source_num?: unknown }>(ai?.regulatory_and_litigation)
  const revBreakupBars = asArray<{ category?: unknown; percentage?: unknown; details?: unknown }>(ai?.revenue_breakup)
  const geoReachBars = asArray<{ region?: unknown; percentage?: unknown; details?: unknown }>(ai?.geographical_reach)
  const factoriesList = asArray<AboutFactoryItem>(ai?.factories_and_plants).filter(f => asText(f?.name))
  const subsidiariesList = asArray<AboutSubsidiaryItem>(ai?.subsidiaries_list).filter(s => asText(s?.name))
  const peerComp = resolvePeerComparison(about)
  const shareholding = resolveShareholding(about)
  const promoterProfile = normalizePromoterProfile(sum?.promoter_and_owner)
  const finSnapshot = sources?.financial_snapshot
  const hasFinSnapshot = Boolean(
    finSnapshot &&
      ((finSnapshot.quarterly_ratios?.rows?.length ?? 0) > 0 ||
        (finSnapshot.yearly_ratios?.rows?.length ?? 0) > 0 ||
        (finSnapshot.growth_ranges?.length ?? 0) > 0),
  )
  const finPosSummary = ai?.financial_position_summary
  const hasFinPosSummary = Boolean(
    finPosSummary &&
      (asText(finPosSummary.overall_stance) ||
        asText(finPosSummary.sales_yearly_and_ttm) ||
        asText(finPosSummary.sales_quarterly_momentum) ||
        asText(finPosSummary.pnl_yearly_and_ttm) ||
        asText(finPosSummary.pnl_quarterly_trend) ||
        asText(finPosSummary.balance_sheet_health) ||
        asText(finPosSummary.cash_flow_quality)),
  )

  const marketIntel: AboutMarketIntelligence | undefined = sources?.market_intelligence
  const creditRatings = asArray<AboutCreditRatingItem>(marketIntel?.credit_ratings).filter(r => isWithinLast12Months(r.date))
  const creditRatingNews = asArray<AboutNewsItem>(marketIntel?.credit_rating_news).filter(n => isWithinLast12Months(n.date))
  const creditRatingSum = asText(sum?.credit_rating_summary)
  const hasCreditRatings = Boolean(
    creditRatingSum ||
      creditRatings.length > 0 ||
      creditRatingNews.length > 0,
  )

  const guidanceSum = asText(sum?.management_guidance)
  const guidanceNews = asArray<AboutNewsItem>(marketIntel?.management_guidance_news).filter(n => isWithinLast12Months(n.date))
  const concallsList = asArray<{ title?: string; url?: string; ref_id?: number }>(marketIntel?.concalls)
  const hasGuidance = Boolean(
    guidanceSum ||
      guidanceNews.length > 0 ||
      concallsList.length > 0,
  )

  const valData = marketIntel?.valuation
  const valSum = asText(sum?.valuation_and_pe)
  const hasValuation = Boolean(
    valSum ||
      (valData &&
        (asText(valData.trailing_pe) ||
          asText(valData.forward_pe) ||
          asText(valData.screener_pe) ||
          asText(valData.peg_ratio) ||
          asText(valData.price_to_book) ||
          asText(valData.trailing_eps) ||
          asText(valData.forward_eps))),
  )

  const analystConsensus = marketIntel?.analyst_consensus
  const rawRating = asText(analystConsensus?.rating)?.trim().toUpperCase()
  const hasRecommendation = Boolean(
    rawRating &&
      rawRating !== 'NONE' &&
      rawRating !== 'N/A' &&
      rawRating !== '-' &&
      rawRating !== 'UNKNOWN',
  )
  const analystNews = asArray<AboutNewsItem>(marketIntel?.analyst_news).filter(n => isWithinLast12Months(n.date))
  const analystSum = asText(sum?.analyst_forecasts)
  // Per user instruction: "No recommendation - This section wont be present in the report."
  const hasAnalystForecasts = Boolean(
    hasRecommendation &&
      (analystSum ||
        analystNews.length > 0 ||
        (analystConsensus &&
          (asText(analystConsensus.rating) ||
            asText(analystConsensus.target_mean_price) ||
            asText(analystConsensus.analyst_count) ||
            (analystConsensus.distribution && Object.keys(analystConsensus.distribution).length > 0)))),
  )

  return (
    <section className="about-wrap">
      {(compSymbol || asText(sources?.generated_at) || about.status === 'ready' || about.status === 'error' || about.status === 'needs-local-key') && (
        <div className="about-status-strip">
          <div className="about-status-left">
            {compSymbol && <span className="about-symbol-pill">{compSymbol}</span>}
            {about.cached && <span className="about-tag-badge tag-emerald">Cached on disk</span>}
            <span className="about-gen-time">
              {asText(sources?.generated_at)
                ? `Updated: ${asText(sources?.generated_at)}`
                : about.cachedAt
                  ? `Cached: ${about.cachedAt}`
                  : compName}
            </span>
          </div>
          <button
            type="button"
            className="about-refresh-btn"
            disabled={about.status === 'loading-sources' || about.status === 'loading-ai'}
            onClick={onRetry}
          >
            <RefreshCw size={14} className={about.status === 'loading-sources' || about.status === 'loading-ai' ? 'spin' : ''} />
            Refresh Intelligence
          </button>
        </div>
      )}

      {about.status === 'needs-local-key' && (
        <div className="about-key-card">
          <h3><KeyRound size={17} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Add Your Gemini API Key for AI Briefing</h3>
          <p>
            Screener disclosures and 12-month news for <b>{compName}</b> are loaded below (and financial tabs are ready above).
            Enter your <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>Google AI Studio Gemini API key</a> once — it is saved locally in <code>%LOCALAPPDATA%\Ledger</code> — to generate the Summary Report &amp; 18 Operational Dimensions:
          </p>
          <div className="about-key-row">
            <input
              type="password"
              value={localGeminiKey}
              onChange={e => setLocalGeminiKey(e.target.value)}
              placeholder="Paste AIza… Gemini API key"
              onKeyDown={e => {
                if (e.key === 'Enter' && localGeminiKey.trim() && onSaveLocalGeminiKey) {
                  onSaveLocalGeminiKey(localGeminiKey.trim())
                }
              }}
            />
            <button
              type="button"
              className="button button-primary"
              disabled={!localGeminiKey.trim() || !onSaveLocalGeminiKey}
              onClick={() => onSaveLocalGeminiKey?.(localGeminiKey.trim())}
            >
              Save Key &amp; Generate Report
            </button>
          </div>
        </div>
      )}

      {about.status === 'loading-sources' && (
        <div className="about-loader-card">
          <LoaderCircle size={24} className="spin about-loader-icon" />
          <div className="about-loader-text">
            <strong>Gathering multi-source corporate intelligence for {compName}…</strong>
            <span>Fetching Screener disclosures, peer table, official website &amp; 12-month corporate news. Financial tabs (Overview, Plots, Data Sheet) are already ready above.</span>
          </div>
        </div>
      )}

      {about.status === 'loading-ai' && (
        <div className="about-loader-card">
          <LoaderCircle size={24} className="spin about-loader-icon" />
          <div className="about-loader-text">
            <strong>Synthesizing Summary Report &amp; 18 Operational Dimensions…</strong>
            <span>Sources and last 12 months news have arrived below. Gemini AI is generating your structured company briefing (~15–25s).</span>
          </div>
        </div>
      )}

      {(about.error || about.aiError) && (
        <div className="error-box">
          <AlertTriangle size={16} />
          <div style={{ flex: 1 }}>
            {asText(about.error || about.aiError)}
          </div>
          <button type="button" className="button button-soft" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {!sum && (peerComp.rows.length > 0 || shareholding.hasAny || hasFinSnapshot || hasValuation || hasAnalystForecasts || hasGuidance || hasCreditRatings) && (
        <section className="about-card about-summary-showcase">
          <div className="about-top-bar bar-cyan" />
          <div className="about-grid-2">
            {shareholding.hasAny && (
              <SummarySubcard heading="Promoter Group & Ownership Profile" accent="violet" span2>
                <PromoterOwnershipBlock shareholding={shareholding} />
              </SummarySubcard>
            )}

            {hasFinSnapshot && (
              <SummarySubcard heading="Financial Position & Statement Summary" accent="emerald" span2>
                <FinancialPositionBlock snapshot={finSnapshot} />
              </SummarySubcard>
            )}
            {hasValuation && (
              <SummarySubcard heading="Trailing &amp; Forward Valuation Multiples" accent="blue" span2>
                <ValuationMultiplesBlock val={valData} />
              </SummarySubcard>
            )}
            {hasAnalystForecasts && (
              <SummarySubcard heading="Analyst Guidance, Recommendation &amp; Forecast (Last 12 Months)" accent="indigo" span2>
                <AnalystForecastsBlock consensus={analystConsensus} news={analystNews} />
              </SummarySubcard>
            )}
            {hasGuidance && (
              <SummarySubcard heading="Management Guidance &amp; Strategic Outlook" accent="emerald" span2>
                <ManagementGuidanceBlock news={guidanceNews} concalls={concallsList} />
              </SummarySubcard>
            )}
            {hasCreditRatings && (
              <SummarySubcard heading="Credit Rating &amp; Debt Quality Information (Last 12 Months)" accent="amber" span2>
                <CreditRatingsBlock ratings={creditRatings} news={creditRatingNews} />
              </SummarySubcard>
            )}
          </div>
        </section>
      )}

      {sum && (
        <section className="about-card about-summary-showcase">
          <div className="about-top-bar bar-rainbow" />
          <div className="about-summary-head">
            <span className="about-summary-dot" />
            <h2 className="about-summary-title">Summary Report</h2>
          </div>

          <div className="about-grid-2">
            {(asText(sum.company_name) || compName) && (
              <SummarySubcard heading="Company Name & Listed Identity" accent="cyan">
                <p><strong><CitationText text={asText(sum.company_name) || `${compName}${compSymbol ? ` (${compSymbol})` : ''}`} /></strong></p>
              </SummarySubcard>
            )}

            {asText(sum.sector_and_industry) && (
              <SummarySubcard heading="Sector & Industry Classification" accent="indigo">
                <p><CitationText text={sum.sector_and_industry} /></p>
              </SummarySubcard>
            )}

            {(promoterProfile.hasContent || shareholding.hasAny) && (
              <SummarySubcard heading="Promoter Group & Ownership Profile" accent="violet" span2>
                <PromoterOwnershipBlock profile={promoterProfile} shareholding={shareholding} />
              </SummarySubcard>
            )}

            {asText(sum.market_position_and_peers) && (
              <SummarySubcard heading="Market Position & Competitive Dynamics" accent="cyan" span2>
                <p><CitationText text={sum.market_position_and_peers} /></p>
              </SummarySubcard>
            )}

            {(asText(ai?.executive_summary) || sum.business_model_type) && (
              (() => {
                const isObj = Boolean(sum.business_model_type && typeof sum.business_model_type === 'object' && !Array.isArray(sum.business_model_type))
                const rawTags = isObj ? (sum.business_model_type as { primary_tags?: unknown }).primary_tags : []
                const tags = Array.isArray(rawTags)
                  ? rawTags.map(asText).filter(Boolean)
                  : asText(rawTags).split(',').map(t => t.trim()).filter(Boolean)
                const note = isObj ? asText((sum.business_model_type as { note?: unknown }).note) : asText(sum.business_model_type)
                const execSum = asText(ai?.executive_summary)
                if (!execSum && !tags.length && !note) return null
                return (
                  <SummarySubcard heading="Business Overview" accent="fuchsia" span2>
                    {(tags.length > 0 || note) && (
                      <div className="about-overview-archetype">
                        <span className="about-overview-kicker">Business Model Archetype</span>
                        {tags.length > 0 && (
                          <div className="about-pill-row">
                            {tags.map((t, i) => <span key={i} className="about-archetype-pill">{t}</span>)}
                          </div>
                        )}
                        {note && <p><CitationText text={note} /></p>}
                      </div>
                    )}
                    {execSum && <p><CitationText text={execSum} /></p>}
                  </SummarySubcard>
                )
              })()
            )}

            {(asText(sum.business_model_short) ||
              asText(sum.revenue_sources_short) ||
              asText(sum.revenue_breakups) ||
              revBreakupBars.length > 0 ||
              geoReachBars.length > 0 ||
              factoriesList.length > 0 ||
              subsidiariesList.length > 0) && (
              <SummarySubcard heading="Business Details" accent="emerald" span2>
                <BusinessDetailsBlock
                  sum={sum}
                  revBreakupBars={revBreakupBars}
                  geoReachBars={geoReachBars}
                  factories={factoriesList}
                  subsidiaries={subsidiariesList}
                />
              </SummarySubcard>
            )}

            {(hasFinPosSummary || hasFinSnapshot) && (
              <SummarySubcard heading="Financial Position & Statement Summary" accent="blue" span2>
                <FinancialPositionBlock fp={finPosSummary} snapshot={finSnapshot} />
              </SummarySubcard>
            )}

            {sum.profitability_analysis && (
              (() => {
                if (typeof sum.profitability_analysis !== 'object' || Array.isArray(sum.profitability_analysis)) {
                  const flat = asText(sum.profitability_analysis)
                  if (!flat) return null
                  return (
                    <SummarySubcard heading="Profitability, Margins & Contribution Drivers" accent="emerald">
                      <p><CitationText text={flat} /></p>
                    </SummarySubcard>
                  )
                }
                const cm = asText(sum.profitability_analysis.current_vs_avg_margin)
                const pf = asText(sum.profitability_analysis.profitability_factors)
                const pc = asText(sum.profitability_analysis.profit_contribution_consol_vs_standalone)
                if (!cm && !pf && !pc) return null
                return (
                  <SummarySubcard heading="Profitability, Margins & Contribution Drivers" accent="emerald">
                    {cm && <p><strong className="sum-title-emerald">Current vs Average Margin: </strong><CitationText text={cm} /></p>}
                    {pf && <p><strong className="sum-title-emerald">Margin Drivers: </strong><CitationText text={pf} /></p>}
                    {pc && <p><strong className="sum-title-emerald">Profit Contribution (Consol vs Standalone): </strong><CitationText text={pc} /></p>}
                  </SummarySubcard>
                )
              })()
            )}

            {asText(sum.financial_issues) && (
              <SummarySubcard heading="Major Financial Issues: Cash Flow, Debt & Statement Watch" accent="amber">
                <p><CitationText text={sum.financial_issues} /></p>
              </SummarySubcard>
            )}

            {asText(sum.partners_and_subsidiaries) && (
              <SummarySubcard heading="Subsidiaries, Associates & Partners" accent="indigo">
                <p><CitationText text={sum.partners_and_subsidiaries} /></p>
              </SummarySubcard>
            )}

            {asText(sum.growth_capex_orderbook) && (
              <SummarySubcard heading="Growth Probability, Order Book & Capex" accent="emerald">
                <p><CitationText text={sum.growth_capex_orderbook} /></p>
              </SummarySubcard>
            )}

            {asText(sum.current_issues) && (
              <SummarySubcard heading="Current Legal, Regulatory & Operational Issues" accent="rose">
                <p><CitationText text={sum.current_issues} /></p>
              </SummarySubcard>
            )}

            {sum.investor_risks_and_opportunities && (
              (() => {
                if (typeof sum.investor_risks_and_opportunities !== 'object' || Array.isArray(sum.investor_risks_and_opportunities)) {
                  const flat = asText(sum.investor_risks_and_opportunities)
                  if (!flat) return null
                  return (
                    <SummarySubcard heading="Investor Opportunities & Key Risks" accent="amber" span2>
                      <p><CitationText text={flat} /></p>
                    </SummarySubcard>
                  )
                }
                const oppText = asText(sum.investor_risks_and_opportunities.opportunities)
                const riskText = asText(sum.investor_risks_and_opportunities.risks)
                if (!oppText && !riskText) return null
                return (
                  <SummarySubcard heading="Investor Opportunities & Key Risks" accent="amber" span2>
                    <div className="about-grid-2">
                      {oppText && (
                        <div className="about-opp-box">
                          <div className="about-sub-label sum-title-emerald">Opportunities</div>
                          <p><CitationText text={oppText} /></p>
                        </div>
                      )}
                      {riskText && (
                        <div className="about-risk-box">
                          <div className="about-sub-label sum-title-rose">Key Risks</div>
                          <p><CitationText text={riskText} /></p>
                        </div>
                      )}
                    </div>
                  </SummarySubcard>
                )
              })()
            )}

            {hasValuation && (
              <SummarySubcard heading="Trailing &amp; Forward Valuation Multiples" accent="blue" span2>
                <ValuationMultiplesBlock val={valData} aiSummary={valSum} />
              </SummarySubcard>
            )}

            {hasAnalystForecasts && (
              <SummarySubcard heading="Analyst Guidance, Recommendation &amp; Forecast (Last 12 Months)" accent="indigo" span2>
                <AnalystForecastsBlock consensus={analystConsensus} news={analystNews} aiSummary={analystSum} />
              </SummarySubcard>
            )}

            {hasGuidance && (
              <SummarySubcard heading="Management Guidance &amp; Strategic Outlook" accent="emerald" span2>
                <ManagementGuidanceBlock aiGuidance={guidanceSum} news={guidanceNews} concalls={concallsList} />
              </SummarySubcard>
            )}

            {hasCreditRatings && (
              <SummarySubcard heading="Credit Rating &amp; Debt Quality Information (Last 12 Months)" accent="amber" span2>
                <CreditRatingsBlock ratings={creditRatings} news={creditRatingNews} aiSummary={creditRatingSum} />
              </SummarySubcard>
            )}

            {asText(sum.additional_insights) && (
              <SummarySubcard heading="Additional Strategic Highlights" accent="fuchsia" span2>
                <p><CitationText text={sum.additional_insights} /></p>
              </SummarySubcard>
            )}
          </div>
        </section>
      )}

      {ai && (
        <>
          {ai.official_site_highlights && (asText(ai.official_site_highlights.headline) || asText(ai.official_site_highlights.core_assets)) && (
            <section className="about-card">
              <div className="about-top-bar bar-blue-teal" />
              <div className="about-card-header">
                <h3 className="sum-title-blue">
                  Official Corporate Disclosures &amp; Operating Infrastructure
                  <CitationBadge num={ai.official_site_highlights.source_num} />
                </h3>
                <span className="about-tag-badge tag-blue">Official Domain</span>
              </div>
              {asText(ai.official_site_highlights.headline) && (
                <p className="about-body-text" style={{ fontStyle: 'italic', fontWeight: 600, marginBottom: 8 }}>
                  {asText(ai.official_site_highlights.headline)}
                </p>
              )}
              {asText(ai.official_site_highlights.core_assets) && (
                <div className="about-body-text">
                  <p><CitationText text={ai.official_site_highlights.core_assets} /></p>
                </div>
              )}
            </section>
          )}

          <div className="about-grid-2">
            <div className="about-card">
              <div className="about-top-bar bar-emerald-teal" />
              <div className="about-card-header">
                <h3 className="sum-title-emerald">Major Capex Announcements &amp; Order Book / Contract Wins</h3>
                <span className="about-tag-badge tag-emerald">Live Feed</span>
              </div>
              <div className="about-feed-stack">
                {capexList.length > 0 ? (
                  capexList.map((item, idx) => (
                    <div key={idx} className="about-item-card about-capex-card">
                      <div className="about-item-top">
                        <div className="about-item-title">
                          {asText(item?.headline)}
                          <CitationBadge num={item?.source_num} />
                        </div>
                        {asText(item?.date) && <span className="about-tag-badge tag-emerald">{asText(item?.date)}</span>}
                      </div>
                      <div className="about-body-text">
                        <p><CitationText text={item?.details} /></p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="about-bar-desc">No recent major capex disclosures flagged in immediate feeds.</p>
                )}
              </div>
            </div>

            <div className="about-card">
              <div className="about-top-bar bar-amber-rose" />
              <div className="about-card-header">
                <h3 className="sum-title-amber">Regulatory Actions, Exchange Penalties &amp; Litigation Watch</h3>
                <span className="about-tag-badge tag-amber">Risk &amp; Legal</span>
              </div>
              <div className="about-feed-stack">
                {regList.length > 0 ? (
                  regList.map((item, idx) => {
                    const sev = asText(item?.severity) || 'Medium'
                    const sevLow = sev.toLowerCase()
                    const sevCls = sevLow.includes('high') ? 'risk-high' : sevLow.includes('medium') ? 'risk-med' : 'risk-low'
                    return (
                      <div key={idx} className="about-item-card about-reg-card">
                        <div className="about-item-top">
                          <div className="about-item-title">
                            {asText(item?.issue)}
                            <CitationBadge num={item?.source_num} />
                          </div>
                          <span className={`about-tag-badge ${sevCls}`}>{sev} Risk</span>
                        </div>
                        <div className="about-body-text">
                          <p><CitationText text={item?.details} /></p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="about-bar-desc">No high-severity regulatory penalties or court stays identified in recent filings.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {recentNews.length > 0 && (
        <section className="about-card">
          <div className="about-top-bar bar-news" />
          <div className="about-card-header">
            <h3 className="sum-title-indigo">Recent Corporate News (Last 12 Months)</h3>
            <span className="about-tag-badge tag-indigo">Newest First</span>
          </div>
          <div className="about-grid-2">
            {recentNews.map((item, idx) => (
              <div key={idx} className="about-item-card about-news-card">
                <div className="about-item-top" style={{ marginBottom: 0 }}>
                  <span className="about-tag-badge tag-cyan">{asText(item?.date) || 'Recent'}</span>
                  <span className="about-news-pub">{asText(item?.publisher) || 'News'}</span>
                </div>
                <div className="about-body-text" style={{ fontWeight: 500 }}>
                  <span>{asText(item?.headline) || asText(item?.title)}</span>
                  <CitationBadge num={item?.ref_id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {aiSections.length > 0 && (
        <>
          <div className="about-dimensions-header">
            <h2>
              <span className="about-summary-dot" />
              Comprehensive Business &amp; Operational Analysis
            </h2>
            <span className="about-tag-badge tag-cyan">{aiSections.length} Specialized Dimensions</span>
          </div>
          <div className="about-grid-2">
            {aiSections.map((sec, idx) => {
              const cleanTitle = asText(sec?.title).replace(/^\d+[\.\-\s:]+/, '').trim()
              const lines = asText(sec?.content).split('\n').map(l => l.trim()).filter(Boolean)
              const colorName = sectionColors[idx % sectionColors.length]
              return (
                <article key={idx} className={`about-card about-section-card sec-${colorName}`}>
                  <div className="about-card-header">
                    <h3>{cleanTitle}</h3>
                  </div>
                  <div className="about-body-text">
                    {lines.map((line, lIdx) => (
                      <p key={lIdx}><CitationText text={line} /></p>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {masterSources.length > 0 && (
        <section id="about-sources-section" className="about-card about-sources-card">
          <div className="about-card-header">
            <div>
              <h2 className="about-sources-title">Verified Corporate Intelligence Sources &amp; Footnotes ({masterSources.length} References)</h2>
              <p className="about-bar-desc">
                All underlying regulatory filings, official website endpoints, and media disclosure links referenced in this report.
              </p>
            </div>
          </div>
          <div className="about-grid-2">
            {masterSources.map((src, sIdx) => (
              <div key={src?.id ?? sIdx} id={`about-source-${asText(src?.id)}`} className="about-source-item">
                <div className="about-source-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="about-source-id">[{asText(src?.id)}]</span>
                    <span className={`about-tag-badge ${sourceTypeClass(src?.type)}`}>{asText(src?.type) || 'Source'}</span>
                  </div>
                  {asText(src?.date) && <span className="about-bar-desc">{asText(src?.date)}</span>}
                </div>
                <div className="about-source-title">{asText(src?.title) || 'Reference Link'}</div>
                <a className="about-source-link" href={asText(src?.url) || '#'} target="_blank" rel="noopener noreferrer">
                  <span>{asText(src?.url)}</span>
                  <ExternalLink size={12} style={{ flex: 'none' }} />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
