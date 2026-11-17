import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from 'lucide-react'
import type { SavedReportInfo } from './types'

type Props = {
  html: string
  info: SavedReportInfo
  onClose: () => void
  onGenerateFresh: (code: string) => void
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

  // Strip sticky navigation ribbon and ensure readable typography for shareholding pattern tables in existing reports
  const sanitizedHtml = useMemo(() => {
    if (!html) return ''
    let clean = html.replace(/<header\s+class=["']web-report-sticky-nav["']>[\s\S]*?<\/header>/gi, '')
    const injectedCss = '<style>' +
      '.web-report-sticky-nav{display:none!important;visibility:hidden!important;height:0!important;padding:0!important;overflow:hidden!important;}' +
      '.sh-cell-value{font-size:12.5px!important;font-weight:800!important;}' +
      '.sh-delta-chip{font-size:9px!important;padding:1px 3px!important;}' +
      '.sh-delta-chip svg{width:8px!important;height:8px!important;}' +
      '.sh-period-text{font-size:11px!important;font-weight:800!important;}' +
      '.sh-latest-tag{font-size:8px!important;}' +
      '.sh-cat-badge{font-size:12px!important;padding:3px 7px!important;}' +
      '.sh-cat-icon{width:12px!important;height:12px!important;}' +
      '.sh-td-cell,.sh-th-period{min-width:48px!important;padding:4px 4px!important;}' +
      '.sh-th-category,.sh-td-category{min-width:125px!important;max-width:160px!important;width:140px!important;padding:6px 8px!important;}' +
      '</style>'
    if (clean.includes('</head>')) {
      clean = clean.replace('</head>', `${injectedCss}</head>`)
    } else {
      clean = injectedCss + clean
    }
    return clean
  }, [html])

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
    const blob = new Blob([sanitizedHtml || html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
        </div>

        <div className="saved-report-header-right">
          {/* Full Screen Toggle Button */}
          <button
            type="button"
            className={`button ${isFullscreen ? 'button-primary' : 'button-soft'} viewer-action-btn viewer-fullscreen-btn`}
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Enlarge report into Full Screen (F)'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>

          {/* Update Button */}
          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={() => onGenerateFresh(info.code)}
            title="Fetch latest financial data from Screener and update this report in Google Drive"
          >
            <RefreshCw size={14} />
            <span>Update</span>
          </button>

          {/* Download Button */}
          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={handleDownload}
            title="Download this complete HTML report to your computer"
          >
            <Download size={14} />
            <span>Download</span>
          </button>

          {/* Close Viewer Button */}
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
          srcDoc={sanitizedHtml}
          title={`${info.code} - Saved Web Report`}
          className="saved-report-iframe"
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
      </main>
    </div>
  )
}
