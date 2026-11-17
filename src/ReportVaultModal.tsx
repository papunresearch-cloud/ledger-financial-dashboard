import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownAZ,
  Calendar,
  Check,
  Clock,
  Eye,
  FileText,
  HardDrive,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
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

const MONTH_NAMES: Record<string, string> = {
  jan: 'Jan',
  feb: 'Feb',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'Sep',
  oct: 'Oct',
  nov: 'Nov',
  dec: 'Dec',
}

function normalizeQuarterDisplay(raw?: string): string {
  if (!raw) return 'Sep, 2026'
  const trimmed = raw.trim()
  if (/^[A-Za-z]+,\s*\d{4}$/.test(trimmed)) return trimmed

  const mMatch = trimmed.match(/([A-Za-z]{3,9})\s*['’,-]?\s*(?:20)?(\d{2,4})/)
  if (mMatch) {
    const key = mMatch[1].slice(0, 3).toLowerCase()
    const month = MONTH_NAMES[key] || (mMatch[1].charAt(0).toUpperCase() + mMatch[1].slice(1))
    let yr = parseInt(mMatch[2], 10)
    if (yr < 100) yr += 2000
    return `${month}, ${yr}`
  }

  const qMatch = trimmed.match(/Q([1-4])\s*(?:FY)?\s*(?:20)?(\d{2,4})/i)
  if (qMatch) {
    const qNum = parseInt(qMatch[1], 10)
    let fy = parseInt(qMatch[2], 10)
    if (fy < 100) fy += 2000
    if (qNum === 1) return `June, ${fy - 1}`
    if (qNum === 2) return `Sep, ${fy - 1}`
    if (qNum === 3) return `Dec, ${fy - 1}`
    if (qNum === 4) return `March, ${fy}`
  }

  return trimmed
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
  // View mode switch - default is "list" view
  const [viewMode, setViewMode] = useState<'list' | 'tiles'>('list')
  // Sort order switch - default is "date" (Order by Date, newest on top)
  const [sortBy, setSortBy] = useState<'date' | 'alpha'>('date')

  // Multi-selection state for deletion
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Escape key closes modal (or confirmation modal if open)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmDeleteOpen) {
          if (!deleting) setConfirmDeleteOpen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmDeleteOpen, deleting, onClose])

  // Map each report to its full company name from directory and normalize lastQuarter
  const enrichedReports = useMemo(() => {
    return reports.map(rep => {
      const cCode = rep.code.toUpperCase()
      const match = companies.find(
        c => (c.nse && c.nse.toUpperCase() === cCode) || (c.bse && c.bse.toUpperCase() === cCode)
      )
      const companyName = match?.name || rep.code
      const ddMmYy = formatDdMmYy(rep.lastModified, rep.formattedDate)
      const lastQuarter = normalizeQuarterDisplay(rep.lastQuarter)
      return {
        ...rep,
        companyName,
        ddMmYy,
        lastQuarter,
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

  // Sort based on arrangement mode
  const sortedReports = useMemo(() => {
    const list = [...filteredReports]
    if (sortBy === 'date') {
      // Order by Date: newest on the top
      return list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    } else {
      // Order by Alphabetic: A to Z
      return list.sort((a, b) => {
        const nameA = (a.companyName || a.code).toLowerCase()
        const nameB = (b.companyName || b.code).toLowerCase()
        return nameA.localeCompare(nameB)
      })
    }
  }, [filteredReports, sortBy])

  // Selection helpers
  const allSelected = sortedReports.length > 0 && selectedCodes.size === sortedReports.length
  const someSelected = selectedCodes.size > 0 && selectedCodes.size < sortedReports.length

  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCodes(new Set())
    } else {
      setSelectedCodes(new Set(sortedReports.map(r => r.code)))
    }
  }

  // Deletion execution
  const handleExecuteDelete = async () => {
    if (selectedCodes.size === 0) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/drive/delete-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: Array.from(selectedCodes) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to delete selected reports from Google Drive.')
      }
      // Successful deletion
      setSelectedCodes(new Set())
      setConfirmDeleteOpen(false)
      onRefreshList()
    } catch (err: any) {
      setDeleteError(err.message || 'Error deleting files.')
    } finally {
      setDeleting(false)
    }
  }

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
                  Direct access to all previously analyzed companies. Open responsive in-app web reports, run batch deletions, or trigger live data updates.
                </p>
              </div>
            </div>
          </div>

          <div className="vault-header-right">
            {/* Arrangement toggle button (Before View button) */}
            <button
              type="button"
              className={`vault-toggle-btn vault-sort-toggle ${sortBy === 'alpha' ? 'active' : ''}`}
              onClick={() => setSortBy(prev => (prev === 'date' ? 'alpha' : 'date'))}
              title={`Current order: ${sortBy === 'date' ? 'Newest on top (Order by Date)' : 'A to Z (Order by Alphabetic)'}. Click to toggle.`}
            >
              {sortBy === 'date' ? <Calendar size={14} /> : <ArrowDownAZ size={14} />}
              <span>{sortBy === 'date' ? 'Order by Date' : 'Order by Alphabetic'}</span>
            </button>

            {/* View mode toggle button (Before Refresh button) */}
            <button
              type="button"
              className={`vault-toggle-btn vault-view-toggle ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode(prev => (prev === 'list' ? 'tiles' : 'list'))}
              title={`Current view: ${viewMode === 'list' ? 'List View' : 'Tiles View'}. Click to toggle.`}
            >
              {viewMode === 'list' ? <List size={14} /> : <LayoutGrid size={14} />}
              <span>{viewMode === 'list' ? 'List View' : 'Tiles View'}</span>
            </button>

            {/* Refresh Button */}
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

            {/* Close Button */}
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

        {/* ==============================================================
           SELECTION TOOLBAR: Select All / Deselect All / Delete Button
           ============================================================== */}
        <div className="vault-selection-toolbar">
          <div className="vault-selection-left">
            <button
              type="button"
              className={`vault-select-all-btn ${allSelected ? 'active' : ''}`}
              onClick={toggleSelectAll}
              title={allSelected ? 'Deselect all files' : 'Select all files in vault'}
            >
              <span className={`vault-custom-checkbox ${allSelected ? 'checked' : someSelected ? 'indeterminate' : ''}`}>
                {allSelected && <Check size={11} strokeWidth={3} />}
                {someSelected && !allSelected && <span className="vault-checkbox-dash" />}
              </span>
              <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
              <span className="vault-pill-badge">{sortedReports.length}</span>
            </button>

            {selectedCodes.size > 0 && (
              <button
                type="button"
                className="vault-clear-selection-btn"
                onClick={() => setSelectedCodes(new Set())}
                title="Clear selected files"
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="vault-selection-right">
            {selectedCodes.size > 0 ? (
              <div className="vault-selection-action-group">
                <span className="vault-selected-notice">
                  <strong>{selectedCodes.size}</strong> {selectedCodes.size === 1 ? 'file' : 'files'} selected
                </span>
                <button
                  type="button"
                  className="vault-delete-action-btn active"
                  onClick={() => setConfirmDeleteOpen(true)}
                  title="Permanently delete selected files from Google Drive"
                >
                  <Trash2 size={14} />
                  <span>Delete Selected ({selectedCodes.size})</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="vault-delete-action-btn disabled"
                disabled
                title="Select files to delete"
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Vault Grid / List Area */}
        <div className="vault-dossier-list-wrapper">
          {loading && reports.length === 0 ? (
            <div className="vault-loading-state">
              <RefreshCw size={28} className="spin" />
              <span>Opening Vault Archives…</span>
            </div>
          ) : sortedReports.length === 0 ? (
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
          ) : viewMode === 'list' ? (
            /* ==============================================================
               LIST VIEW (Default)
               ============================================================== */
            <div className="vault-list-container">
              {sortedReports.map(item => {
                const isSelected = selectedCodes.has(item.code)
                return (
                  <div key={item.code} className={`vault-list-row ${isSelected ? 'row-selected' : ''}`}>
                    <div className="vault-list-select-col">
                      <button
                        type="button"
                        className={`vault-item-checkbox ${isSelected ? 'checked' : ''}`}
                        onClick={e => {
                          e.stopPropagation()
                          toggleSelect(item.code)
                        }}
                        aria-label={`Select ${item.companyName}`}
                        title={isSelected ? 'Deselect file' : 'Select file'}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </button>
                    </div>

                    <div className="vault-list-left">
                      <div className="vault-list-avatar">
                        {item.code.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="vault-list-name-block">
                        <div className="vault-list-code-row">
                          <span className="vault-stock-ticker">{item.code}</span>
                          <span className="vault-type-tag">
                            <FileText size={10} /> Web Report
                          </span>
                        </div>
                        <h4 className="vault-list-title" title={item.companyName}>
                          {item.companyName}
                        </h4>
                      </div>
                    </div>

                    <div className="vault-list-mid">
                      <div className="vault-quarter-chip" title="Latest reported financial quarter results">
                        <Clock size={12} />
                        <span className="vault-quarter-label">Last Quarter:</span>
                        <strong className="vault-quarter-val">{item.lastQuarter}</strong>
                      </div>
                      <div className="vault-date-chip" title={`Last updated: ${item.formattedDate}`}>
                        <Calendar size={12} />
                        <span className="vault-date-label">Updated:</span>
                        <strong className="vault-date-val">{item.ddMmYy}</strong>
                      </div>
                      <div className="vault-size-chip">
                        <HardDrive size={11} />
                        <span>{formatBytes(item.sizeBytes)}</span>
                      </div>
                    </div>

                    <div className="vault-list-actions">
                      <button
                        type="button"
                        className="vault-action-btn vault-view-btn"
                        onClick={() => {
                          onClose()
                          onViewReport(item.code, item.companyName)
                        }}
                        title={`Open complete web report for ${item.companyName} within the app`}
                      >
                        <Eye size={14} />
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
                        <Zap size={13} />
                        <span>Update</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ==============================================================
               TILES VIEW (3D Card Grid)
               ============================================================== */
            <div className="vault-grid">
              {sortedReports.map(item => {
                const isSelected = selectedCodes.has(item.code)
                return (
                  <div key={item.code} className={`vault-card ${isSelected ? 'card-selected' : ''}`}>
                    <div className="vault-card-body">
                      <div className="vault-card-top">
                        <div className="vault-company-ident">
                          <button
                            type="button"
                            className={`vault-item-checkbox ${isSelected ? 'checked' : ''}`}
                            onClick={e => {
                              e.stopPropagation()
                              toggleSelect(item.code)
                            }}
                            aria-label={`Select ${item.companyName}`}
                            title={isSelected ? 'Deselect file' : 'Select file'}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </button>
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
                        <div className="vault-quarter-chip" title="Latest reported financial quarter results">
                          <Clock size={12} />
                          <span className="vault-quarter-label">Last Quarter:</span>
                          <strong className="vault-quarter-val">{item.lastQuarter}</strong>
                        </div>
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
                )
              })}
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
              Showing {sortedReports.length} of {reports.length} {reports.length === 1 ? 'file' : 'files'}
            </span>
            <button type="button" className="vault-dismiss-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>

        {/* ==============================================================
           BEAUTIFUL DELETION CONFIRMATION POPUP (YES / NO)
           ============================================================== */}
        {confirmDeleteOpen && (
          <div className="vault-confirm-backdrop" onClick={() => !deleting && setConfirmDeleteOpen(false)}>
            <div className="vault-confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="vault-confirm-icon-box">
                <div className="vault-confirm-icon-glow" />
                <AlertTriangle size={34} className="vault-confirm-alert-icon" />
              </div>

              <div className="vault-confirm-badge">PERMANENT DELETION</div>

              <h3 className="vault-confirm-title">Delete Selected Files?</h3>

              <p className="vault-confirm-desc">
                Are you sure you want to permanently delete <strong>{selectedCodes.size}</strong> selected company {selectedCodes.size === 1 ? 'dossier' : 'dossiers'} from Google Drive (<code>G:\My Drive\Ledger_Reports</code>) and local archives?
              </p>

              <div className="vault-confirm-preview-list">
                {Array.from(selectedCodes).slice(0, 10).map(c => {
                  const comp = sortedReports.find(r => r.code === c)
                  return (
                    <span key={c} className="vault-confirm-chip">
                      <strong>{c}</strong>
                      {comp?.companyName && comp.companyName !== c && (
                        <small>{comp.companyName.length > 20 ? comp.companyName.slice(0, 18) + '…' : comp.companyName}</small>
                      )}
                    </span>
                  )
                })}
                {selectedCodes.size > 10 && (
                  <span className="vault-confirm-chip more">+{selectedCodes.size - 10} more</span>
                )}
              </div>

              <div className="vault-confirm-warning">
                <ShieldCheck size={13} />
                <span>This action cannot be undone. Files will be purged permanently.</span>
              </div>

              {deleteError && (
                <div className="vault-confirm-error">
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="vault-confirm-actions">
                <button
                  type="button"
                  className="vault-confirm-btn vault-confirm-no"
                  onClick={() => setConfirmDeleteOpen(false)}
                  disabled={deleting}
                >
                  <X size={15} />
                  <span>NO, Cancel</span>
                </button>

                <button
                  type="button"
                  className="vault-confirm-btn vault-confirm-yes"
                  onClick={handleExecuteDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <RefreshCw size={15} className="spin" />
                      <span>Deleting…</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} />
                      <span>YES, Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
