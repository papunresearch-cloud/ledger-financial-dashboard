import {
  Calendar,
  Cloud,
  Eye,
  RefreshCw,
} from 'lucide-react'
import type { SavedReportItem } from './types'

type Props = {
  reports: SavedReportItem[]
  loading: boolean
  onViewReport: (code: string) => void
  onUpdateReport: (code: string) => void
  onRefreshList: () => void
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function DriveHistoryShelf({
  reports,
  loading,
  onViewReport,
  onUpdateReport,
  onRefreshList,
}: Props) {
  if (reports.length === 0 && !loading) {
    return null
  }

  return (
    <div className="drive-history-shelf">
      <div className="drive-history-head">
        <div className="drive-history-title-wrap">
          <span className="drive-history-icon">
            <Cloud size={16} />
          </span>
          <span className="drive-history-title">Google Drive Research Reports</span>
          <span className="drive-history-badge">
            {reports.length} {reports.length === 1 ? 'report' : 'reports'} saved
          </span>
        </div>
        <button
          type="button"
          className="button button-soft drive-history-refresh-btn"
          onClick={onRefreshList}
          disabled={loading}
          title="Refresh saved reports list"
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="drive-history-list">
        {reports.map(report => (
          <div key={report.code} className="drive-history-item">
            <div className="drive-history-item-left">
              <span className="drive-history-item-code">{report.code}</span>
              <div className="drive-history-item-meta">
                <span className="drive-history-item-date">
                  <Calendar size={12} />
                  <span>{report.formattedDate}</span>
                </span>
                <span className="drive-history-item-size">
                  {formatBytes(report.sizeBytes)}
                </span>
              </div>
            </div>

            <div className="drive-history-item-actions">
              <button
                type="button"
                className="button button-soft drive-history-view-btn"
                onClick={() => onViewReport(report.code)}
                title={`View saved report for ${report.code}`}
              >
                <Eye size={14} />
                <span>View</span>
              </button>
              <button
                type="button"
                className="button button-soft drive-history-update-btn"
                onClick={() => onUpdateReport(report.code)}
                title={`Fetch latest Screener data and update ${report.code} in Google Drive`}
              >
                <RefreshCw size={13} />
                <span>Update</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
