import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  LoaderCircle,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { AboutState, ScreenerAboutData } from './types'
import './aboutSection.css'

type Props = {
  about: AboutState
  fallbackCompanyName: string
  onRetry: () => void
  onUnlockWithKey?: (key: string) => void
}

const SECTION_PALETTES = [
  { name: 'cyan', headerColor: '#38bdf8', labelColor: '#67e8f9', dotColor: '#06b6d4', glow: 'rgba(6, 182, 212, 0.2)' },
  { name: 'violet', headerColor: '#c084fc', labelColor: '#d8b4fe', dotColor: '#a855f7', glow: 'rgba(168, 85, 247, 0.2)' },
  { name: 'amber', headerColor: '#fbbf24', labelColor: '#fde047', dotColor: '#f59e0b', glow: 'rgba(245, 158, 11, 0.2)' },
  { name: 'rose', headerColor: '#fb7185', labelColor: '#fda4af', dotColor: '#f43f5e', glow: 'rgba(244, 63, 94, 0.2)' },
  { name: 'blue', headerColor: '#60a5fa', labelColor: '#93c5fd', dotColor: '#3b82f6', glow: 'rgba(59, 130, 246, 0.2)' },
  { name: 'emerald', headerColor: '#34d399', labelColor: '#6ee7b7', dotColor: '#10b981', glow: 'rgba(16, 185, 129, 0.2)' },
  { name: 'orange', headerColor: '#fb923c', labelColor: '#fdba74', dotColor: '#f97316', glow: 'rgba(249, 115, 22, 0.2)' },
  { name: 'teal', headerColor: '#2dd4bf', labelColor: '#5eead4', dotColor: '#14b8a6', glow: 'rgba(20, 184, 166, 0.2)' },
]

/** Strip source notations like [1], [7], sups, and anchors */
function sanitizeInlineText(raw: string): string {
  if (!raw) return ''
  let s = raw.replace(/\[\d+\]/g, '')
  s = s.replace(/<sup[^>]*>.*?<\/sup>/gi, '')
  s = s.replace(/<a\b[^>]*>\[?\d+\]?<\/a>/gi, '')
  s = s.replace(/[ \t]{2,}/g, ' ')
  return s.trim()
}

/** Render highlighted text with bold underline styling for numbers and key terms */
function HighlightedContent({ text }: { text: string }) {
  const cleaned = sanitizeInlineText(text)
  if (!cleaned) return null

  // Split on bold markdown or html strong tags
  const tokens = cleaned.split(/(<strong[^>]*>.*?<\/strong>|<b[^>]*>.*?<\/b>|\*\*.*?\*\*)/gi)

  return (
    <>
      {tokens.map((token, idx) => {
        const strongMatch = token.match(/<(strong|b)[^>]*>(.*?)<\/\1>/i)
        if (strongMatch) {
          const inner = sanitizeInlineText(strongMatch[2])
          return (
            <strong key={idx} className="doc-bold-highlight">
              {inner}
            </strong>
          )
        }
        const mdMatch = token.match(/^\*\*(.*?)\*\*$/)
        if (mdMatch) {
          const inner = sanitizeInlineText(mdMatch[1])
          return (
            <strong key={idx} className="doc-bold-highlight">
              {inner}
            </strong>
          )
        }
        return <span key={idx}>{token}</span>
      })}
    </>
  )
}

/** Render a single line in document (bullet or narrative line with colorful label) */
function RenderDocumentLine({
  line,
}: {
  line: string
}) {
  const clean = sanitizeInlineText(line)
  if (!clean) return null

  const isBullet = clean.startsWith('-') || clean.startsWith('•') || clean.startsWith('*')
  const content = isBullet ? clean.replace(/^[-•*]\s*/, '') : clean

  // Match label like "BFSI: 32.8%" or "Employees: 5,98,056..."
  const labelMatch = content.match(/^([^:]{2,45}:)\s*(.*)$/)
  if (labelMatch) {
    const label = labelMatch[1]
    const val = labelMatch[2]
    return (
      <div className={isBullet ? 'doc-bullet-row' : 'doc-narrative-p'}>
        {isBullet && <span className="doc-bullet-dot" />}
        <span className="doc-label">
          {label}
        </span>{' '}
        <span className="doc-val">
          <HighlightedContent text={val} />
        </span>
      </div>
    )
  }

  return (
    <div className={isBullet ? 'doc-bullet-row' : 'doc-narrative-p'}>
      {isBullet && <span className="doc-bullet-dot" />}
      <span className="doc-body-text">
        <HighlightedContent text={content} />
      </span>
    </div>
  )
}

/** Render a subsection block like a) AI Services: ... */
function RenderDocumentSubsection({
  sub,
}: {
  sub: string
}) {
  const clean = sanitizeInlineText(sub)
  if (!clean) return null

  // Match e.g. "a) AI Services: rest..."
  const m = clean.match(/^([a-z]\))\s*([^:]{2,45}:)?\s*(.*)$/i)
  if (m) {
    const letter = m[1]
    const label = m[2] || ''
    const body = m[3] || ''

    return (
      <div className="doc-sub-item">
        <span className="doc-sub-letter">
          {letter}
        </span>{' '}
        {label && (
          <span className="doc-sub-label">
            {label}
          </span>
        )}{' '}
        <span className="doc-sub-body">
          <HighlightedContent text={body} />
        </span>
      </div>
    )
  }

  return (
    <div className="doc-sub-item">
      <span className="doc-sub-body">
        <HighlightedContent text={clean} />
      </span>
    </div>
  )
}

export function AboutSection({ about, fallbackCompanyName, onRetry }: Props) {
  const [copied, setCopied] = useState(false)
  const isLoading = about.status === 'loading' || about.status === 'loading-sources' || about.status === 'loading-ai'
  const isError = about.status === 'error' && !about.data
  const data: ScreenerAboutData | null = about.data || (about.sources as unknown as ScreenerAboutData) || null

  const compName = data?.company_info?.name || fallbackCompanyName || 'Company'
  const compSymbol = data?.company_info?.symbol || ''
  const screenerUrl = data?.company_info?.screener_url || `https://www.screener.in/company/${compSymbol}/`
  const website = data?.company_info?.website
  const sector = data?.company_info?.sector
  const intro = data?.about_intro
  const paragraphs = data?.paragraphs ?? []

  function handleCopyDocument() {
    if (!intro?.text) return
    let docText = `About\n${sanitizeInlineText(intro.text)}\n\nKey Points\n`
    for (const p of paragraphs) {
      if (p.title) docText += `\n${p.title}:\n`
      if (p.lines) {
        for (const l of p.lines) docText += `${sanitizeInlineText(l)}\n`
      }
      if (p.subsections) {
        for (const s of p.subsections) docText += `${sanitizeInlineText(s)}\n`
      }
    }
    navigator.clipboard.writeText(docText.trim()).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <section className="about-document-container">
      {/* Document Utility Toolbar */}
      <div className="doc-toolbar">
        <div className="doc-toolbar-left">
          <div className="doc-avatar-chip">
            {compSymbol.slice(0, 2) || compName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="doc-company-title-row">
              <span className="doc-company-title">{compName}</span>
              {compSymbol && <span className="doc-symbol-badge">{compSymbol}</span>}
            </div>
            {sector && <div className="doc-sector-text">{sector}</div>}
          </div>
        </div>

        <div className="doc-toolbar-actions">
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="doc-tool-btn"
              title="Open Official Corporate Website"
            >
              <Globe size={13} />
              <span>Website</span>
              <ExternalLink size={11} />
            </a>
          )}
          <a
            href={screenerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="doc-tool-btn"
            title="View on Screener.in"
          >
            <FileText size={13} />
            <span>Screener.in</span>
            <ExternalLink size={11} />
          </a>
          <button
            type="button"
            className="doc-tool-btn"
            onClick={handleCopyDocument}
            title="Copy whole structured document to clipboard"
          >
            {copied ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
            <span>{copied ? 'Copied!' : 'Copy Doc'}</span>
          </button>
          <button
            type="button"
            className="doc-tool-btn"
            onClick={() => window.print()}
            title="Print or Save as PDF"
          >
            <Printer size={13} />
            <span>Print</span>
          </button>
          <button
            type="button"
            className="doc-tool-btn doc-btn-refresh"
            disabled={isLoading}
            onClick={onRetry}
            title="Refresh company data from Screener.in"
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Loading Banner */}
      {isLoading && (
        <div className="doc-loading-strip">
          <LoaderCircle size={22} className="spin text-cyan" />
          <span>Fetching latest Screener.in About profile and Read More commentary…</span>
        </div>
      )}

      {/* Error Banner */}
      {isError && (
        <div className="doc-error-strip">
          <AlertTriangle size={18} className="text-rose" />
          <div style={{ flex: 1 }}>
            <strong>Could not load Screener About document</strong>
            <p>{about.error || 'The Screener intelligence service is currently unreachable.'}</p>
          </div>
          <button type="button" className="doc-tool-btn" onClick={onRetry}>
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* ========================================================
          EXECUTIVE DOCUMENT SHEET (Matches Word/Doc file format)
          ======================================================== */}
      <div className="doc-paper-sheet">
        {/* Document Header: ABOUT */}
        <div className="doc-sheet-header">
          <div className="doc-about-badge-row">
            <h1 className="doc-main-heading">About</h1>
            <span className="doc-live-tag">
              <Sparkles size={13} /> Verified Corporate Filing Extract
            </span>
          </div>

          <div className="doc-intro-content">
            <p className="doc-intro-paragraph">
              {intro?.text ? (
                <HighlightedContent text={intro.text} />
              ) : (
                `${compName} is a publicly listed enterprise in India.`
              )}
            </p>
          </div>
        </div>

        {/* Divider Rule */}
        <div className="doc-sheet-divider" />

        {/* Section 2: KEY POINTS */}
        <div className="doc-sheet-body">
          <h2 className="doc-key-points-heading">Key Points</h2>

          {/* Sequential Document Blocks */}
          <div className="doc-sections-stream">
            {paragraphs.map((p, idx) => {
              const pal = SECTION_PALETTES[idx % SECTION_PALETTES.length]
              const title = p.title || ''
              const lines = p.lines && p.lines.length > 0 ? p.lines : (p.text ? p.text.split('\n').filter(Boolean) : [])
              const subsections = p.subsections ?? []

              return (
                <div key={p.id || idx} className={`doc-section-block pal-${pal.name}`}>
                  {title && (
                    <h3 className="doc-section-title">
                      {title}:
                    </h3>
                  )}

                  {/* Render Lines / Bullets */}
                  {lines.length > 0 && (
                    <div className="doc-lines-list">
                      {lines.map((line, lIdx) => (
                        <RenderDocumentLine
                          key={lIdx}
                          line={line}
                        />
                      ))}
                    </div>
                  )}

                  {/* Render Subsections (e.g. a) AI Services...) */}
                  {subsections.length > 0 && (
                    <div className="doc-subsections-list">
                      {subsections.map((sub, sIdx) => (
                        <RenderDocumentSubsection
                          key={sIdx}
                          sub={sub}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Document Footer */}
        <div className="doc-sheet-footer">
          <span>Source: Screener.in Corporate Commentary &amp; Disclosures • Clean presentation without source citations</span>
        </div>
      </div>
    </section>
  )
}
