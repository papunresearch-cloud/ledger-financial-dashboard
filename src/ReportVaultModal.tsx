import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Eye,
  FileText,
  HardDrive,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Vault,
  X,
  Zap,
} from 'lucide-react'
import type { GoogleDriveSyncStatus, SavedReportItem } from './types'
import companies from './companies.json'
import './reportVaultModal.css'

type Props = {
  reports: SavedReportItem[]
  loading: boolean
  onClose: () => void
  onViewReport: (code: string, companyName?: string) => void
  onUpdateReport: (code: string, companyName?: string) => void
  onRefreshList: () => void
  driveStatus?: GoogleDriveSyncStatus | null
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
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

export function ReportVaultModal({
  reports,
  loading,
  onClose,
  onViewReport,
  onUpdateReport,
  onRefreshList,
  driveStatus,
}: Props) {
  const [search, setSearch] = useState('')

  // Escape key closes modal
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Map each report to its full company name from directory
  const enrichedReports = useMemo(() => {
    return reports.map(rep => {
      const cCode = rep.code.toUpperCase()
      const match = companies.find(
        c => (c.nse && c.nse.toUpperCase() === cCode) || (c.bse && c.bse.toUpperCase() === cCode)
      )
      const companyName = match?.name || rep.code
      const ddMmYy = formatDdMmYy(rep.lastModified, rep.formattedDate)
      return {
        ...rep,
        companyName,
        ddMmYy,
      }
    })
  }, [reports])

  // Filter based on search query
  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enrichedReports
    return enrichedReports.filter(
      r => r.code.toLowerCase().includes(q) || r.companyName.toLowerCase().includes(q)
    )
  }, [enrichedReports, search])

  const totalBytes = useMemo(() => {
    return reports.reduce((acc, r) => acc + (r.sizeBytes || 0), 0)
  }, [reports])

  return (
    <div className="vault-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="vault-modal-container" onClick={e => e.stopPropagation()}>
        {/* Futuristic 3D Vault Rim & Dial Accent */}
        <div className="vault-dial-glow" />
        
        {/* Top Header */}
        <header className="vault-modal-header">
          <div className="vault-header-left">
            <div className="vault-3d-badge">
              <div className="vault-3d-icon-box">
                <Vault size={26} className="vault-dial-icon" />
              </div>
              <div className="vault-title-group">
                <div className="vault-kicker-row">
                  <span className="vault-kicker-badge">
                    <Sparkles size={11} /> FINANCIAL INTELLIGENCE VAULT
                  </span>
                  <span className="vault-status-pill">
                    <ShieldCheck size={12} /> SECURED ARCHIVE
                  </span>
                </div>
                <h2 className="vault-main-title">Company Research &amp; Report Vault</h2>
                <p className="vault-subtitle">
                  Direct access to all previously analyzed companies. Open responsive in-app web reports or trigger live data updates.
                </p>
              </div>
            </div>
          </div>

          <div className="vault-header-right">
            <button
              type="button"
              className="vault-refresh-btn"
              onClick={onRefreshList}
              disabled={loading}
              title="Refresh vault archives"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Scanning…' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              className="vault-close-btn"
              onClick={onClose}
              aria-label="Close Vault"
              title="Close Vault (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* 3D Vault Intelligence Status Ribbon */}
        <div className="vault-metrics-ribbon">
          <div className="vault-metric-item">
            <span className="vault-metric-label">SECURED DOSSIERS</span>
            <span className="vault-metric-value">{reports.length}</span>
            <small className="vault-metric-sub">{formatBytes(totalBytes)} total</small>
          </div>
          <div className="vault-metric-item">
            <span className="vault-metric-label">LOCAL MIRROR</span>
            <span className="vault-metric-value ok-color">ACTIVE</span>
            <small className="vault-metric-sub" title={driveStatus?.gdriveDesktopPath || 'G:\\My Drive\\Ledger_Reports'}>
              {driveStatus?.gdriveDesktopAvailable ? 'G:\\My Drive\\Ledger_Reports' : 'Local Disk'}
            </small>
          </div>
          <div className="vault-metric-item">
            <span className="vault-metric-label">CLOUD SYNC</span>
            <span className={`vault-metric-value ${driveStatus?.apiConnected ? 'ok-color' : ''}`}>
              {driveStatus?.apiConnected ? 'GOOGLE DRIVE' : 'STANDALONE'}
            </span>
            <small className="vault-metric-sub">
              {driveStatus?.userEmail ? driveStatus.userEmail : 'Synchronized'}
            </small>
          </div>
          <div className="vault-metric-item search-metric-item">
            <div className="vault-search-box">
              <Search size={15} className="vault-search-icon" />
              <input
                type="text"
                className="vault-search-input"
                placeholder="Search by company or ticker symbol…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  className="vault-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Vault Grid / List Area */}
        <div className="vault-dossier-list-wrapper">
          {loading && reports.length === 0 ? (
            <div className="vault-loading-state">
              <RefreshCw size={28} className="spin" />
              <span>Opening Vault Archives…</span>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="vault-empty-state">
              <div className="vault-empty-icon-wrap">
                <Vault size={42} />
              </div>
              <h3>{search ? 'No Matching Companies In Vault' : 'Your Financial Vault is Empty'}</h3>
              <p>
                {search
                  ? `No archived report matches "${search}". Check the ticker or download it fresh from Screener.`
                  : 'Analyze companies via the Screener downloader or upload a Data Sheet workbook. Every analysis is automatically secured in this vault with full revision history.'}
              </p>
            </div>
          ) : (
            <div className="vault-grid">
              {filteredReports.map(item => (
                <div key={item.code} className="vault-card">
                  <div className="vault-card-body">
                    <div className="vault-card-top">
                      <div className="vault-company-ident">
                        <div className="vault-avatar-badge">
                          {item.code.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="vault-name-block">
                          <div className="vault-code-row">
                            <span className="vault-stock-ticker">{item.code}</span>
                            <span className="vault-type-tag">
                              <FileText size={11} /> Web Report
                            </span>
                          </div>
                          <h4 className="vault-company-title" title={item.companyName}>
                            {item.companyName}
                          </h4>
                        </div>
                      </div>
                    </div>

                    <div className="vault-card-meta">
                      <div className="vault-date-chip" title={`Last updated: ${item.formattedDate}`}>
                        <Calendar size={13} />
                        <span className="vault-date-label">Updated:</span>
                        <strong className="vault-date-val">{item.ddMmYy}</strong>
                      </div>
                      <div className="vault-size-chip">
                        <HardDrive size={12} />
                        <span>{formatBytes(item.sizeBytes)}</span>
                      </div>
                    </div>

                    <div className="vault-card-actions">
                      <button
                        type="button"
                        className="vault-action-btn vault-view-btn"
                        onClick={() => {
                          onClose()
                          onViewReport(item.code, item.companyName)
                        }}
                        title={`Open complete web report for ${item.companyName} within the app`}
                      >
                        <Eye size={15} />
                        <span>View</span>
                      </button>

                      <button
                        type="button"
                        className="vault-action-btn vault-update-btn"
                        onClick={() => {
                          onClose()
                          onUpdateReport(item.code, item.companyName)
                        }}
                        title={`Download fresh data from Screener and update ${item.code} in the vault`}
                      >
                        <Zap size={14} />
                        <span>Update</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vault Footer */}
        <footer className="vault-modal-footer">
          <div className="vault-footer-left">
            <span className="vault-security-note">
              <ShieldCheck size={14} /> Reports are stored locally and backed up to Google Drive (<code>G:\My Drive\Ledger_Reports</code>).
            </span>
          </div>
          <div className="vault-footer-right">
            <span className="vault-count-pill">
              Showing {filteredReports.length} of {reports.length} {reports.length === 1 ? 'file' : 'files'}
            </span>
            <button type="button" className="vault-dismiss-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
