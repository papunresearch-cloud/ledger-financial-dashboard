import { useState, type ReactNode } from 'react'
import { AlertTriangle, ExternalLink, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import type { AboutMasterSource, AboutState } from './types'
import './aboutSection.css'

type Props = {
  about: AboutState
  fallbackCompanyName: string
  onRetry: () => void
  onUnlockWithKey: (key: string) => void
}

function jumpToSource(id: string) {
  const el = document.getElementById(`about-source-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('about-source-highlight')
  window.setTimeout(() => el.classList.remove('about-source-highlight'), 2000)
}

function CitationBadge({ num }: { num?: number | string | null }) {
  if (num === undefined || num === null || num === '') return null
  const label = String(num)
  return (
    <button
      type="button"
      className="about-citation-badge"
      title={`Jump to Source [${label}]`}
      onClick={() => jumpToSource(label)}
    >
      [{label}]
    </button>
  )
}

function CitationText({ text }: { text?: string | null }) {
  if (!text) return null
  const sanitized = text.replace(/https?:\/\/\S+/g, '').trim()
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

function sourceTypeClass(stype: string): string {
  if (stype.includes('Official')) return 'tag-indigo'
  if (stype.includes('Capex')) return 'tag-emerald'
  if (stype.includes('Regulatory')) return 'risk-high'
  if (stype.includes('Dossier')) return 'tag-amber'
  if (stype.includes('Corporate News')) return 'tag-blue'
  return 'tag-cyan'
}

export function AboutSection({ about, fallbackCompanyName, onRetry, onUnlockWithKey }: Props) {
  const [inlineKey, setInlineKey] = useState('')
  const sources = about.sources
  const ai = about.ai
  const compName = sources?.company_info?.name || fallbackCompanyName
  const compSymbol = sources?.company_info?.symbol || ''
  const sum = ai?.summary_report
  const masterSources: AboutMasterSource[] = sources?.master_sources ?? []

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
  const recentNews = sources?.live_intel?.recent_news_12m ?? []

  return (
    <section className="about-wrap">
      {(compSymbol || sources?.generated_at || about.status === 'ready' || about.status === 'error') && (
        <div className="about-status-strip">
          <div className="about-status-left">
            {compSymbol && <span className="about-symbol-pill">{compSymbol}</span>}
            <span className="about-gen-time">
              {sources?.generated_at ? `Updated: ${sources.generated_at}` : compName}
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
            {about.error || about.aiError}
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
            {(sum.company_name || compName) && (
              <SummarySubcard heading="Company Name & Listed Identity" accent="cyan">
                <p><strong><CitationText text={sum.company_name || `${compName}${compSymbol ? ` (${compSymbol})` : ''}`} /></strong></p>
              </SummarySubcard>
            )}

            {sum.promoter_and_owner?.trim() && (
              <SummarySubcard heading="Promoter Group & Ownership Profile" accent="violet">
                <p><CitationText text={sum.promoter_and_owner} /></p>
              </SummarySubcard>
            )}

            {sum.sector_and_industry?.trim() && (
              <SummarySubcard heading="Sector & Industry Classification" accent="indigo">
                <p><CitationText text={sum.sector_and_industry} /></p>
              </SummarySubcard>
            )}

            {sum.business_model_type && (
              (() => {
                const isObj = typeof sum.business_model_type === 'object'
                const tags = isObj ? (sum.business_model_type as { primary_tags?: string[] }).primary_tags ?? [] : []
                const note = isObj ? (sum.business_model_type as { note?: string }).note ?? '' : String(sum.business_model_type)
                if (!tags.length && !note.trim()) return null
                return (
                  <SummarySubcard heading="Business Model Archetype" accent="fuchsia">
                    {tags.length > 0 && (
                      <div className="about-pill-row">
                        {tags.map((t, i) => t.trim() && <span key={i} className="about-archetype-pill">{t}</span>)}
                      </div>
                    )}
                    {note.trim() && <p><CitationText text={note} /></p>}
                  </SummarySubcard>
                )
              })()
            )}

            {(sum.market_position_and_peers?.trim() || (sum.peer_table && sum.peer_table.length > 0)) && (
              <SummarySubcard heading="Peers Comparison & Market Position" accent="cyan" span2>
                {sum.market_position_and_peers?.trim() && (
                  <p><CitationText text={sum.market_position_and_peers} /></p>
                )}
                {sum.peer_table && sum.peer_table.length > 0 && (
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
                        {sum.peer_table.slice(0, 6).map((pr, idx) => (
                          <tr key={idx} className={pr.is_target ? 'about-peer-row-target' : 'about-peer-row-normal'}>
                            <td>{pr.company}{pr.is_target ? ' ★' : ''}</td>
                            <td>{pr.mcap_cr || '-'}</td>
                            <td>{pr.revenue_cr || '-'}</td>
                            <td>{pr.opm_pct || '-'}</td>
                            <td>{pr.pe || '-'}</td>
                            <td>{pr.roce_pct || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SummarySubcard>
            )}

            {sum.business_model_short?.trim() && (
              <SummarySubcard heading="Business Model, Products & Services" accent="emerald">
                <p><CitationText text={sum.business_model_short} /></p>
              </SummarySubcard>
            )}

            {sum.revenue_sources_short?.trim() && (
              <SummarySubcard heading="Primary Revenue Sources" accent="blue">
                <p><CitationText text={sum.revenue_sources_short} /></p>
              </SummarySubcard>
            )}

            {sum.revenue_breakups && (
              (() => {
                if (typeof sum.revenue_breakups === 'string') {
                  if (!sum.revenue_breakups.trim()) return null
                  return (
                    <SummarySubcard heading="Revenue Breakups (Product, Geography & Consol vs Standalone)" accent="purple">
                      <p><CitationText text={sum.revenue_breakups} /></p>
                    </SummarySubcard>
                  )
                }
                const { product_wise, geography_wise, consolidated_vs_standalone } = sum.revenue_breakups
                if (!product_wise?.trim() && !geography_wise?.trim() && !consolidated_vs_standalone?.trim()) return null
                return (
                  <SummarySubcard heading="Revenue Breakups (Product, Geography & Consol vs Standalone)" accent="purple">
                    {product_wise?.trim() && <p><strong className="sum-title-purple">Product-Wise: </strong><CitationText text={product_wise} /></p>}
                    {geography_wise?.trim() && <p><strong className="sum-title-purple">Geography-Wise: </strong><CitationText text={geography_wise} /></p>}
                    {consolidated_vs_standalone?.trim() && <p><strong className="sum-title-purple">Consolidated vs Standalone: </strong><CitationText text={consolidated_vs_standalone} /></p>}
                  </SummarySubcard>
                )
              })()
            )}

            {sum.profitability_analysis && (
              (() => {
                if (typeof sum.profitability_analysis === 'string') {
                  if (!sum.profitability_analysis.trim()) return null
                  return (
                    <SummarySubcard heading="Profitability, Margins & Contribution Drivers" accent="emerald">
                      <p><CitationText text={sum.profitability_analysis} /></p>
                    </SummarySubcard>
                  )
                }
                const { current_vs_avg_margin, profitability_factors, profit_contribution_consol_vs_standalone } = sum.profitability_analysis
                if (!current_vs_avg_margin?.trim() && !profitability_factors?.trim() && !profit_contribution_consol_vs_standalone?.trim()) return null
                return (
                  <SummarySubcard heading="Profitability, Margins & Contribution Drivers" accent="emerald">
                    {current_vs_avg_margin?.trim() && <p><strong className="sum-title-emerald">Current vs Average Margin: </strong><CitationText text={current_vs_avg_margin} /></p>}
                    {profitability_factors?.trim() && <p><strong className="sum-title-emerald">Margin Drivers: </strong><CitationText text={profitability_factors} /></p>}
                    {profit_contribution_consol_vs_standalone?.trim() && <p><strong className="sum-title-emerald">Profit Contribution (Consol vs Standalone): </strong><CitationText text={profit_contribution_consol_vs_standalone} /></p>}
                  </SummarySubcard>
                )
              })()
            )}

            {sum.financial_issues?.trim() && (
              <SummarySubcard heading="Major Financial Issues: Cash Flow, Debt & Statement Watch" accent="amber">
                <p><CitationText text={sum.financial_issues} /></p>
              </SummarySubcard>
            )}

            {sum.partners_and_subsidiaries?.trim() && (
              <SummarySubcard heading="Subsidiaries, Associates & Partners" accent="indigo">
                <p><CitationText text={sum.partners_and_subsidiaries} /></p>
              </SummarySubcard>
            )}

            {sum.growth_capex_orderbook?.trim() && (
              <SummarySubcard heading="Growth Probability, Order Book & Capex" accent="emerald">
                <p><CitationText text={sum.growth_capex_orderbook} /></p>
              </SummarySubcard>
            )}

            {sum.current_issues?.trim() && (
              <SummarySubcard heading="Current Legal, Regulatory & Operational Issues" accent="rose">
                <p><CitationText text={sum.current_issues} /></p>
              </SummarySubcard>
            )}

            {sum.investor_risks_and_opportunities && (
              (() => {
                if (typeof sum.investor_risks_and_opportunities === 'string') {
                  if (!sum.investor_risks_and_opportunities.trim()) return null
                  return (
                    <SummarySubcard heading="Investor Opportunities & Key Risks" accent="amber" span2>
                      <p><CitationText text={sum.investor_risks_and_opportunities} /></p>
                    </SummarySubcard>
                  )
                }
                const { opportunities, risks } = sum.investor_risks_and_opportunities
                if (!opportunities?.trim() && !risks?.trim()) return null
                return (
                  <SummarySubcard heading="Investor Opportunities & Key Risks" accent="amber" span2>
                    <div className="about-grid-2">
                      {opportunities?.trim() && (
                        <div className="about-opp-box">
                          <div className="about-sub-label sum-title-emerald">Opportunities</div>
                          <p><CitationText text={opportunities} /></p>
                        </div>
                      )}
                      {risks?.trim() && (
                        <div className="about-risk-box">
                          <div className="about-sub-label sum-title-rose">Key Risks</div>
                          <p><CitationText text={risks} /></p>
                        </div>
                      )}
                    </div>
                  </SummarySubcard>
                )
              })()
            )}

            {sum.additional_insights?.trim() && (
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
            {ai.executive_summary && (
              <div className="about-body-text">
                <p><CitationText text={ai.executive_summary} /></p>
              </div>
            )}
            {ai.quick_stats && ai.quick_stats.length > 0 && (
              <div className="about-quick-stats">
                {ai.quick_stats.slice(0, 3).map((st, idx) => (
                  <div key={idx} className={`about-stat-box stat-tone-${(idx % 3) + 1}`}>
                    <div className="about-stat-lbl">{st.label}</div>
                    <div className="about-stat-val">{st.value}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {ai.official_site_highlights && (ai.official_site_highlights.headline || ai.official_site_highlights.core_assets) && (
            <section className="about-card">
              <div className="about-top-bar bar-blue-teal" />
              <div className="about-card-header">
                <h3 className="sum-title-blue">
                  Official Corporate Disclosures &amp; Operating Infrastructure
                  <CitationBadge num={ai.official_site_highlights.source_num} />
                </h3>
                <span className="about-tag-badge tag-blue">Official Domain</span>
              </div>
              {ai.official_site_highlights.headline && (
                <p className="about-body-text" style={{ fontStyle: 'italic', fontWeight: 600, marginBottom: 8 }}>
                  {ai.official_site_highlights.headline}
                </p>
              )}
              {ai.official_site_highlights.core_assets && (
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
                {ai.capex_and_order_book && ai.capex_and_order_book.length > 0 ? (
                  ai.capex_and_order_book.map((item, idx) => (
                    <div key={idx} className="about-item-card about-capex-card">
                      <div className="about-item-top">
                        <div className="about-item-title">
                          {item.headline}
                          <CitationBadge num={item.source_num} />
                        </div>
                        {item.date && <span className="about-tag-badge tag-emerald">{item.date}</span>}
                      </div>
                      <div className="about-body-text">
                        <p><CitationText text={item.details} /></p>
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
                {ai.regulatory_and_litigation && ai.regulatory_and_litigation.length > 0 ? (
                  ai.regulatory_and_litigation.map((item, idx) => {
                    const sev = item.severity || 'Medium'
                    const sevLow = sev.toLowerCase()
                    const sevCls = sevLow.includes('high') ? 'risk-high' : sevLow.includes('medium') ? 'risk-med' : 'risk-low'
                    return (
                      <div key={idx} className="about-item-card about-reg-card">
                        <div className="about-item-top">
                          <div className="about-item-title">
                            {item.issue}
                            <CitationBadge num={item.source_num} />
                          </div>
                          <span className={`about-tag-badge ${sevCls}`}>{sev} Risk</span>
                        </div>
                        <div className="about-body-text">
                          <p><CitationText text={item.details} /></p>
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
              {ai.revenue_breakup && ai.revenue_breakup.length > 0 ? (
                ai.revenue_breakup.map((item, idx) => {
                  const pct = Number(item.percentage) || 0
                  return (
                    <div key={idx} className="about-bar-item">
                      <div className="about-bar-meta">
                        <span className="about-bar-label">{item.category}</span>
                        <span className="about-bar-pct-cyan">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="about-bar-track">
                        <div className={`about-bar-fill ${barGrads[idx % barGrads.length]}`} style={{ width: `${Math.min(100, Math.max(6, pct))}%` }} />
                      </div>
                      {item.details && <div className="about-bar-desc">{item.details}</div>}
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
              {ai.geographical_reach && ai.geographical_reach.length > 0 ? (
                ai.geographical_reach.map((item, idx) => {
                  const pct = Number(item.percentage) || 0
                  return (
                    <div key={idx} className="about-bar-item">
                      <div className="about-bar-meta">
                        <span className="about-bar-label">{item.region}</span>
                        <span className="about-bar-pct-indigo">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="about-bar-track">
                        <div className={`about-bar-fill ${barGrads[(idx + 2) % barGrads.length]}`} style={{ width: `${Math.min(100, Math.max(6, pct))}%` }} />
                      </div>
                      {item.details && <div className="about-bar-desc">{item.details}</div>}
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
                  <span className="about-tag-badge tag-cyan">{item.date || 'Recent'}</span>
                  <span className="about-news-pub">{item.publisher || 'News'}</span>
                </div>
                <div className="about-body-text" style={{ fontWeight: 500 }}>
                  <span>{item.headline || item.title}</span>
                  <CitationBadge num={item.ref_id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ai?.sections && ai.sections.length > 0 && (
        <>
          <div className="about-dimensions-header">
            <h2>
              <span className="about-summary-dot" />
              Comprehensive Business &amp; Operational Analysis
            </h2>
            <span className="about-tag-badge tag-cyan">{ai.sections.length} Specialized Dimensions</span>
          </div>
          <div className="about-grid-2">
            {ai.sections.map((sec, idx) => {
              const cleanTitle = (sec.title || '').replace(/^\d+[\.\-\s:]+/, '').trim()
              const lines = (sec.content || '').split('\n').map(l => l.trim()).filter(Boolean)
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
            {masterSources.map(src => (
              <div key={src.id} id={`about-source-${src.id}`} className="about-source-item">
                <div className="about-source-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="about-source-id">[{src.id}]</span>
                    <span className={`about-tag-badge ${sourceTypeClass(src.type)}`}>{src.type}</span>
                  </div>
                  {src.date && <span className="about-bar-desc">{src.date}</span>}
                </div>
                <div className="about-source-title">{src.title || 'Reference Link'}</div>
                <a className="about-source-link" href={src.url} target="_blank" rel="noopener noreferrer">
                  <span>{src.url}</span>
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
