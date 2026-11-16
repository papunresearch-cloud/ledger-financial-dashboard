import { useEffect } from 'react'
import { Eye, RefreshCw, X, FileCheck } from 'lucide-react'
import type { SavedReportInfo } from './types'
import './existFileModal.css'

type Props = {
  info: SavedReportInfo
  onViewSaved: () => void
  onGenerateFresh: () => void
  onCancel: () => void
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

export function GoogleDrivePromptModal({
  info,
  onViewSaved,
  onGenerateFresh,
  onCancel,
}: Props) {
  const dateFormatted = formatDdMmYy(info.lastModified, info.formattedDate)

  // Listen for Escape key to dismiss
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="exist-file-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exist-file-title"
    >
      <div className="exist-file-modal" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="exist-file-close"
          onClick={onCancel}
          aria-label="Close"
          title="Close"
        >
          <X size={18} />
        </button>

        <div className="exist-file-icon-wrap">
          <div className="exist-file-icon-glow" />
          <div className="exist-file-icon">
            <FileCheck size={28} />
          </div>
        </div>

        <div className="exist-file-badge-row">
          <span className="exist-file-code">{info.code}</span>
          {info.companyName && info.companyName !== info.code && (
            <span className="exist-file-company">{info.companyName}</span>
          )}
        </div>

        <h2 id="exist-file-title" className="exist-file-title">
          Already file is existed updated on{' '}
          <span className="exist-file-date-pill">{dateFormatted}</span>.
        </h2>

        <p className="exist-file-question">
          Do you want to visualize the existing file?
        </p>

        <div className="exist-file-meta-bar">
          <span
            className="exist-file-meta-item font-mono"
            title={info.fileName || `${info.code}_Complete_Report.html`}
          >
            {info.fileName || `${info.code}_Complete_Report.html`}
          </span>
          {info.storageType && (
            <span className="exist-file-storage-tag">
              {info.storageType.includes('cloud')
                ? 'Google Drive & Mirror'
                : 'Desktop Mirror'}
            </span>
          )}
        </div>

        <div className="exist-file-actions">
          <button
            type="button"
            className="exist-btn exist-btn-yes"
            onClick={onViewSaved}
            autoFocus
          >
            <div className="exist-btn-main-row">
              <Eye size={18} />
              <span>Yes</span>
            </div>
            <span className="exist-btn-subtext">Visualize existing file</span>
          </button>

          <button
            type="button"
            className="exist-btn exist-btn-no"
            onClick={onGenerateFresh}
          >
            <div className="exist-btn-main-row">
              <RefreshCw size={18} />
              <span>No</span>
            </div>
            <span className="exist-btn-subtext">Process new file generation</span>
          </button>
        </div>
      </div>
    </div>
  )
}
