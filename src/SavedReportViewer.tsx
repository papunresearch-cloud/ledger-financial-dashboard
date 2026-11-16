import { useRef } from 'react'
import {
  ArrowLeft,
  Calendar,
  Cloud,
  Download,
  ExternalLink,
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
  const iframeRef = useRef<HTMLIFrameElement>(null)

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
    <div className="saved-report-viewer-overlay">
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
            <span className="viewer-date-tag">
              <Calendar size={13} />
              <span>Saved: {info.formattedDate || 'Recent'}</span>
            </span>
            <span className="viewer-version-tag">
              <Cloud size={13} />
              <span>v{info.version || 1} in Google Drive</span>
            </span>
          </div>
        </div>

        <div className="saved-report-header-right">
          <button
            type="button"
            className="button button-primary viewer-action-btn"
            onClick={() => onGenerateFresh(info.code)}
            title="Fetch latest financial data from Screener and update this report in Google Drive"
          >
            <RefreshCw size={15} />
            <span>Generate Fresh Updated Version</span>
          </button>

          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={handleDownload}
            title="Download this complete HTML report to your computer"
          >
            <Download size={15} />
            <span>Download HTML</span>
          </button>

          <button
            type="button"
            className="button button-soft viewer-action-btn"
            onClick={handleOpenNewTab}
            title="Open in a new browser tab"
          >
            <ExternalLink size={15} />
          </button>

          <button
            type="button"
            className="viewer-close-btn"
            onClick={onClose}
            aria-label="Close report viewer"
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
