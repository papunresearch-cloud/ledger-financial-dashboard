import { Component, useState, type ReactNode } from 'react'
import { AlertTriangle, ExternalLink, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import type { AboutMasterSource, AboutNewsItem, AboutState } from './types'
import './aboutSection.css'

type Props = {
  about: AboutState
  fallbackCompanyName: string
  onRetry: () => void
  onUnlockWithKey: (key: string) => void
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
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('about-source-highlight')
  window.setTimeout(() => el.classList.remove('about-source-highlight'), 2000)
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
  if (safe.includes('Official')) return 'tag-indigo'
  if (safe.includes('Capex')) return 'tag-emerald'
  if (safe.includes('Regulatory')) return 'risk-high'
  if (safe.includes('Dossier')) return 'tag-amber'
  if (safe.includes('Corporate News')) return 'tag-blue'
  return 'tag-cyan'
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

function AboutSectionInner({ about, fallbackCompanyName, onRetry, onUnlockWithKey }: Props) {
  const [inlineKey, setInlineKey] = useState('')
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
  const barGrads = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5'] as const
  const recentNews = asArray<AboutNewsItem>(sources?.live_intel?.recent_news_12m)
  const aiSections = asArray<{ title?: unknown; content?: unknown }>(ai?.sections)
  const quickStats = asArray<{ label?: unknown; value?: unknown }>(ai?.quick_stats)
  const capexList = asArray<{ headline?: unknown; date?: unknown; details?: unknown; source_num?: unknown }>(ai?.capex_and_order_book)
  const regList = asArray<{ issue?: unknown; severity?: unknown; details?: unknown; source_num?: unknown }>(ai?.regulatory_and_litigation)
  const revBreakupBars = asArray<{ category?: unknown; percentage?: unknown; details?: unknown }>(ai?.revenue_breakup)
  const geoReachBars = asArray<{ region?: unknown; percentage?: unknown; details?: unknown }>(ai?.geographical_reach)
  const peerRows = asArray<{ company?: unknown; mcap_cr?: unknown; revenue_cr?: unknown; opm_pct?: unknown; pe?: unknown; roce_pct?: unknown; is_target?: boolean }>(sum?.peer_table)

  return (
    <section className="about-wrap">
      {(compSymbol || asText(sources?.generated_at) || about.status === 'ready' || about.status === 'error') && (
        <div className="about-status-strip">
          <div className="about-status-left">
            {compSymbol && <span className="about-symbol-pill">{compSymbol}</span>}
            <span className="about-gen-time">
              {asText(sources?.generated_at) ? `Updated: ${asText(sources?.generated_at)}` : compName}
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

            {asText(sum.promoter_and_owner) && (
              <SummarySubcard heading="Promoter Group & Ownership Profile" accent="violet">
                <p><CitationText text={sum.promoter_and_owner} /></p>
              </SummarySubcard>
            )}

            {asText(sum.sector_and_industry) && (
              <SummarySubcard heading="Sector & Industry Classification" accent="indigo">
                <p><CitationText text={sum.sector_and_industry} /></p>
              </SummarySubcard>
            )}

            {sum.business_model_type && (
              (() => {
                const isObj = typeof sum.business_model_type === 'object' && !Array.isArray(sum.business_model_type)
                const rawTags = isObj ? (sum.business_model_type as { primary_tags?: unknown }).primary_tags : []
                const tags = Array.isArray(rawTags)
                  ? rawTags.map(asText).filter(Boolean)
                  : asText(rawTags).split(',').map(t => t.trim()).filter(Boolean)
                const note = isObj ? asText((sum.business_model_type as { note?: unknown }).note) : asText(sum.business_model_type)
                if (!tags.length && !note) return null
                return (
                  <SummarySubcard heading="Business Model Archetype" accent="fuchsia">
                    {tags.length > 0 && (
                      <div className="about-pill-row">
                        {tags.map((t, i) => <span key={i} className="about-archetype-pill">{t}</span>)}
                      </div>
                    )}
                    {note && <p><CitationText text={note} /></p>}
                  </SummarySubcard>
                )
              })()
            )}

            {(asText(sum.market_position_and_peers) || peerRows.length > 0) && (
              <SummarySubcard heading="Peers Comparison & Market Position" accent="cyan" span2>
                {asText(sum.market_position_and_peers) && (
                  <p><CitationText text={sum.market_position_and_peers} /></p>
                )}
                {peerRows.length > 0 && (
                  <div className="about-peer-wrap">
                    <table className="about-peer-table">
                      <thead>
                        <tr>
                          <th>Peer Company</th>
                          <th>M.Cap (Cr)</th>
                          <th>Revenue (Cr)</th>
                          <th>OPM %</th>
                          <th>P/E</th>
                          <th>ROCE %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {peerRows.slice(0, 6).map((pr, idx) => (
                          <tr key={idx} className={pr?.is_target ? 'about-peer-row-target' : 'about-peer-row-normal'}>
                            <td>{asText(pr?.company)}{pr?.is_target ? ' ★' : ''}</td>
                            <td>{asText(pr?.mcap_cr) || '-'}</td>
                            <td>{asText(pr?.revenue_cr) || '-'}</td>
                            <td>{asText(pr?.opm_pct) || '-'}</td>
                            <td>{asText(pr?.pe) || '-'}</td>
                            <td>{asText(pr?.roce_pct) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SummarySubcard>
            )}

            {asText(sum.business_model_short) && (
              <SummarySubcard heading="Business Model, Products & Services" accent="emerald">
                <p><CitationText text={sum.business_model_short} /></p>
              </SummarySubcard>
            )}

            {asText(sum.revenue_sources_short) && (
              <SummarySubcard heading="Primary Revenue Sources" accent="blue">
                <p><CitationText text={sum.revenue_sources_short} /></p>
              </SummarySubcard>
            )}

            {sum.revenue_breakups && (
              (() => {
                if (typeof sum.revenue_breakups !== 'object' || Array.isArray(sum.revenue_breakups)) {
                  const flat = asText(sum.revenue_breakups)
                  if (!flat) return null
                  return (
                    <SummarySubcard heading="Revenue Breakups (Product, Geography & Consol vs Standalone)" accent="purple">
                      <p><CitationText text={flat} /></p>
                    </SummarySubcard>
                  )
                }
                const pw = asText(sum.revenue_breakups.product_wise)
                const gw = asText(sum.revenue_breakups.geography_wise)
                const cs = asText(sum.revenue_breakups.consolidated_vs_standalone)
                if (!pw && !gw && !cs) return null
                return (
                  <SummarySubcard heading="Revenue Breakups (Product, Geography & Consol vs Standalone)" accent="purple">
                    {pw && <p><strong className="sum-title-purple">Product-Wise: </strong><CitationText text={pw} /></p>}
                    {gw && <p><strong className="sum-title-purple">Geography-Wise: </strong><CitationText text={gw} /></p>}
                    {cs && <p><strong className="sum-title-purple">Consolidated vs Standalone: </strong><CitationText text={cs} /></p>}
                  </SummarySubcard>
                )
              })()
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
          <section className="about-card">
            <div className="about-top-bar bar-cyan-indigo" />
            <div className="about-card-header">
              <h2 className="sum-title-cyan">
                <span className="about-dot-cyan" />
                Business Overview
              </h2>
            </div>
            {asText(ai.executive_summary) && (
              <div className="about-body-text">
                <p><CitationText text={ai.executive_summary} /></p>
              </div>
            )}
            {quickStats.length > 0 && (
              <div className="about-quick-stats">
                {quickStats.slice(0, 3).map((st, idx) => (
                  <div key={idx} className={`about-stat-box stat-tone-${(idx % 3) + 1}`}>
                    <div className="about-stat-lbl">{asText(st?.label)}</div>
                    <div className="about-stat-val">{asText(st?.value)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

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

          <div className="about-grid-2">
            <div className="about-card">
              <div className="about-card-header">
                <h3>Business Segments &amp; Revenue Mix</h3>
                <span className="about-tag-badge tag-cyan">Divisions</span>
              </div>
              {revBreakupBars.length > 0 ? (
                revBreakupBars.map((item, idx) => {
                  const pct = asPercent(item?.percentage)
                  const det = asText(item?.details)
                  return (
                    <div key={idx} className="about-bar-item">
                      <div className="about-bar-meta">
                        <span className="about-bar-label">{asText(item?.category)}</span>
                        <span className="about-bar-pct-cyan">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="about-bar-track">
                        <div className={`about-bar-fill ${barGrads[idx % barGrads.length]}`} style={{ width: `${Math.min(100, Math.max(6, pct))}%` }} />
                      </div>
                      {det && <div className="about-bar-desc">{det}</div>}
                    </div>
                  )
                })
              ) : (
                <p className="about-bar-desc">Divisional breakdown integrated across operational sections below.</p>
              )}
            </div>

            <div className="about-card">
              <div className="about-card-header">
                <h3>Geographical Distribution &amp; Reach</h3>
                <span className="about-tag-badge tag-indigo">Markets</span>
              </div>
              {geoReachBars.length > 0 ? (
                geoReachBars.map((item, idx) => {
                  const pct = asPercent(item?.percentage)
                  const det = asText(item?.details)
                  return (
                    <div key={idx} className="about-bar-item">
                      <div className="about-bar-meta">
                        <span className="about-bar-label">{asText(item?.region)}</span>
                        <span className="about-bar-pct-indigo">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="about-bar-track">
                        <div className={`about-bar-fill ${barGrads[(idx + 2) % barGrads.length]}`} style={{ width: `${Math.min(100, Math.max(6, pct))}%` }} />
                      </div>
                      {det && <div className="about-bar-desc">{det}</div>}
                    </div>
                  )
                })
              ) : (
                <p className="about-bar-desc">Domestic and international market footprints detailed below.</p>
              )}
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
              <h2>Verified Corporate Intelligence Sources &amp; Footnotes ({masterSources.length} References)</h2>
              <p className="about-bar-desc">
                All underlying regulatory filings, official website endpoints, and media disclosure links referenced in this report.
              </p>
            </div>
            <span className="about-tag-badge tag-cyan">Primary Audit Trail</span>
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
