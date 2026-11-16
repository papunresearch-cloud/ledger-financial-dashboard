import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Cloud,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import type { SavedReportInfo } from './types'

type Props = {
  html: string
  info: SavedReportInfo
  onClose: () => void
  onGenerateFresh: (code: string) => void
}

function formatDdMmYy(lastModified?: string, fallbackFormatted?: string): string {
  if (lastModified) {
    const d = new Date(lastModified)
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yy = String(d.getFullYear()).slice(-2)
      return `${dd}|${mm}|${yy}`
    }
  }
  if (fallbackFormatted) {
    const d = new Date(fallbackFormatted)
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yy = String(d.getFullYear()).slice(-2)
      return `${dd}|${mm}|${yy}`
    }
    const m = fallbackFormatted.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (m) {
      const dd = m[1].padStart(2, '0')
      const mm = m[2].padStart(2, '0')
      const yy = m[3].length === 4 ? m[3].slice(-2) : m[3]
      return `${dd}|${mm}|${yy}`
    }
  }
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yy = String(now.getFullYear()).slice(-2)
  return `${dd}|${mm}|${yy}`
}

export function SavedReportViewer({
  html,
  info,
  onClose,
  onGenerateFresh,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const dateBadge = formatDdMmYy(info.lastModified, info.formattedDate)

  // Sync fullscreen state with document fullscreenchange events
  useEffect(() => {
    function onFullscreenChange() {
      const active = Boolean(document.fullscreenElement)
      setIsFullscreen(active)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Keyboard shortcuts: F for fullscreen, Escape to exit or close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') {
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
        void toggleFullscreen()
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen()
          setIsFullscreen(true)
        } else {
          setIsFullscreen(prev => !prev)
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
          setIsFullscreen(false)
        } else {
          setIsFullscreen(false)
        }
      }
    } catch {
      // Fallback to pure CSS fullscreen
      setIsFullscreen(prev => !prev)
    }
  }

  function handleDownload() {
    const filename = info.fileName || `${info.code}_Complete_Report.html`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function handleOpenNewTab() {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <div
      ref={containerRef}
      className={`saved-report-viewer-overlay ${isFullscreen ? 'is-fullscreen-mode' : ''}`}
    >
      <header className="saved-report-viewer-header">
        <div className="saved-report-header-left">
          <button
            type="button"
            className="button button-soft viewer-back-btn"
            onClick={onClose}
            title="Return to Ledger Dashboard"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>

          <div className="viewer-title-info">
            <span className="viewer-code-pill">{info.code}</span>
            <span className="viewer-company-name">
              {info.companyName || info.code}
            </span>
            <span className="viewer-date-tag" title={`Saved: ${info.formattedDate || 'Recent'}`}>
              <Calendar size={13} />
              <span>Updated: <strong>{dateBadge}</strong></span>
            </span>
            <span className="viewer-version-tag">
              <Cloud size={13} />
              <span>Drive Mirror</span>
            </span>
            <span className="viewer-mode-tag">
              <Sparkles size={12} />
              <span>Web Report (Bright Mode)</span>
            </span>
          </div>
        </div>

        <div className="saved-report-header-right">
          {/* Full Screen / Enlarge Toggle Button */}
          <button
            type="button"
            className={`button ${isFullscreen ? 'button-primary' : 'button-soft'} viewer-action-btn viewer-fullscreen-btn`}
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Enlarge report into Full Screen (F)'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>

          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={() => onGenerateFresh(info.code)}
            title="Fetch latest financial data from Screener and update this report in Google Drive"
          >
            <RefreshCw size={14} />
            <span>Update Report</span>
          </button>

          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={handleDownload}
            title="Download this complete HTML report to your computer"
          >
            <Download size={14} />
            <span>Download</span>
          </button>

          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={handleOpenNewTab}
            title="Open in a new browser tab"
          >
            <ExternalLink size={14} />
          </button>

          <button
            type="button"
            className="viewer-close-btn"
            onClick={onClose}
            aria-label="Close report viewer"
            title="Close Viewer"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <main className="saved-report-viewer-body">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title={`${info.code} - Saved Web Report`}
          className="saved-report-iframe"
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
      </main>
    </div>
  )
}
