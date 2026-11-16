import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Cloud,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Folder,
  Globe,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Settings,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react'
import type { GoogleDriveSyncStatus, LocalSettingsSummary } from './types'
import './settingsModal.css'

type Props = {
  initialSettings: LocalSettingsSummary | null
  onClose: () => void
  onSettingsUpdated: (summary: LocalSettingsSummary, savedNewKey: boolean) => void
  onCacheCleared: () => void
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function SettingsModal({
  initialSettings,
  onClose,
  onSettingsUpdated,
  onCacheCleared,
}: Props) {
  const [summary, setSummary] = useState<LocalSettingsSummary | null>(initialSettings)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [screenerEmailInput, setScreenerEmailInput] = useState(initialSettings?.screenerEmail || '')
  const [screenerPasswordInput, setScreenerPasswordInput] = useState('')
  const [showScreenerPassword, setShowScreenerPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [driveStatus, setDriveStatus] = useState<GoogleDriveSyncStatus | null>(null)
  const [driveLoading, setDriveLoading] = useState(false)

  const fetchDriveData = () => {
    setDriveLoading(true)
    fetch('/api/drive/status')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(statusData => {
        if (statusData) setDriveStatus(statusData)
      })
      .finally(() => setDriveLoading(false))
  }

  useEffect(() => {
    fetchDriveData()
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/settings')
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as LocalSettingsSummary
      })
      .then(data => {
        if (active) {
          setSummary(data)
          if (data.screenerEmail) {
            setScreenerEmailInput(prev => prev || data.screenerEmail || '')
          }
          onSettingsUpdated(data, false)
        }
      })
      .catch(() => {
        /* keep initialSettings if offline/failed */
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function postSettings(payload: Record<string, unknown>, successText: string, savedNewKey = false) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json()) as LocalSettingsSummary & { detail?: string }
      if (!res.ok) throw new Error(body.detail || `Request failed (HTTP ${res.status})`)
      setSummary(body)
      onSettingsUpdated(body, savedNewKey)
      setMessage({ kind: 'ok', text: successText })
      if (savedNewKey) setApiKeyInput('')
    } catch (cause) {
      setMessage({ kind: 'err', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  async function handleClearCache() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/about-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      })
      const body = (await res.json()) as { cleared?: number; aboutCacheCount?: number; aboutCacheBytes?: number; detail?: string }
      if (!res.ok) throw new Error(body.detail || `Failed to clear cache (HTTP ${res.status})`)
      if (summary) {
        const updated: LocalSettingsSummary = {
          ...summary,
          aboutCacheCount: body.aboutCacheCount ?? 0,
          aboutCacheBytes: body.aboutCacheBytes ?? 0,
        }
        setSummary(updated)
        onSettingsUpdated(updated, false)
      }
      onCacheCleared()
      setMessage({
        kind: 'ok',
        text: body.cleared ? `Cleared ${body.cleared} cached company briefing(s) from disk.` : 'About disk cache is already empty.',
      })
    } catch (cause) {
      setMessage({ kind: 'err', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const detected = summary?.detectedBrowsers ?? []
  const keyBadge = summary?.hasGeminiApiKey
    ? summary.keySource === 'settings'
      ? { cls: 'ok', label: `Saved (${summary.geminiApiKeyMasked})` }
      : { cls: 'ok', label: `Active from .env (${summary.geminiApiKeyMasked})` }
    : { cls: 'warn', label: 'Not configured' }

  const screenerBadge = summary?.hasScreenerCredentials
    ? summary.screenerSource === 'settings'
      ? { cls: 'ok', label: `Auto-Login Active (${summary.screenerEmail || 'Saved'})` }
      : { cls: 'ok', label: `From .env (${summary.screenerEmail || 'Configured'})` }
    : { cls: 'muted', label: 'Manual browser login' }

  async function handleSaveScreener() {
    const cleanEmail = screenerEmailInput.trim()
    const pw = screenerPasswordInput
    if (!cleanEmail) {
      setMessage({ kind: 'err', text: 'Please enter your Screener email or username.' })
      return
    }
    if (!pw && !summary?.hasScreenerCredentials) {
      setMessage({ kind: 'err', text: 'Please enter your Screener password.' })
      return
    }
    const payload: Record<string, unknown> = { screenerEmail: cleanEmail }
    if (pw) payload.screenerPassword = pw
    await postSettings(payload, 'Screener auto-login credentials saved to AppData.')
    setScreenerPasswordInput('')
  }

  return (
    <div
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ledger-settings-title"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="settings-modal">
        <div className="settings-head">
          <div className="settings-head-title">
            <span className="settings-head-icon">
              <Settings size={18} />
            </span>
            <div>
              <h2 id="ledger-settings-title">Ledger Desktop Settings</h2>
              <p>Stored locally in AppData — your API key never leaves this device except to call Gemini.</p>
            </div>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="settings-section-title">
              <KeyRound size={15} /> Gemini AI API Key (<code>GEMINI_API_KEY</code>)
            </span>
            <span className={`settings-pill ${keyBadge.cls}`}>{keyBadge.label}</span>
          </div>
          <p className="settings-desc">
            Required for AI synthesis in the <strong>About</strong> tab (Summary Report &amp; 18 Operational Dimensions).
            Get a free key from{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              Google AI Studio <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
            </a>
            .
          </p>
          <div className="settings-key-input-row">
            <div className="settings-input-wrap">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={event => setApiKeyInput(event.target.value)}
                placeholder={summary?.hasGeminiApiKey ? 'Enter new GEMINI_API_KEY to replace…' : 'Paste AIza… Gemini API key'}
                autoComplete="off"
                onKeyDown={event => {
                  if (event.key === 'Enter' && apiKeyInput.trim() && !busy) {
                    void postSettings({ geminiApiKey: apiKeyInput.trim() }, 'Gemini API key saved to AppData.', true)
                  }
                }}
              />
              <button
                type="button"
                className="settings-eye-btn"
                onClick={() => setShowKey(prev => !prev)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !apiKeyInput.trim()}
              onClick={() =>
                void postSettings({ geminiApiKey: apiKeyInput.trim() }, 'Gemini API key saved to AppData.', true)
              }
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save Key
            </button>
          </div>
          {summary?.keySource === 'settings' && (
            <div className="settings-actions-row">
              <span className="settings-desc">Saved in <code>settings.json</code></span>
              <button
                type="button"
                className="button button-danger-soft"
                disabled={busy}
                onClick={() => void postSettings({ clearGeminiApiKey: true }, 'Saved Gemini API key removed.')}
              >
                <Trash2 size={14} /> Remove Saved Key
              </button>
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="settings-section-title">
              <UserCheck size={15} /> Screener.in Account (Automatic Login)
            </span>
            <span className={`settings-pill ${screenerBadge.cls}`}>{screenerBadge.label}</span>
          </div>
          <p className="settings-desc">
            Save your Screener email &amp; password so Ledger signs in silently in the background without opening a login prompt (email/password accounts).
          </p>
          <div className="settings-screener-grid">
            <div className="settings-input-wrap">
              <input
                type="text"
                value={screenerEmailInput}
                onChange={event => setScreenerEmailInput(event.target.value)}
                placeholder="Screener Email or Username"
                autoComplete="username"
              />
            </div>
            <div className="settings-input-wrap">
              <input
                type={showScreenerPassword ? 'text' : 'password'}
                value={screenerPasswordInput}
                onChange={event => setScreenerPasswordInput(event.target.value)}
                placeholder={summary?.hasScreenerCredentials ? 'New password (leave blank to keep saved)' : 'Screener Password'}
                autoComplete="current-password"
                onKeyDown={event => {
                  if (event.key === 'Enter' && !busy) {
                    void handleSaveScreener()
                  }
                }}
              />
              <button
                type="button"
                className="settings-eye-btn"
                onClick={() => setShowScreenerPassword(prev => !prev)}
                aria-label={showScreenerPassword ? 'Hide Screener password' : 'Show Screener password'}
              >
                {showScreenerPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="settings-actions-row">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !screenerEmailInput.trim() || (!screenerPasswordInput && !summary?.hasScreenerCredentials)}
              onClick={() => void handleSaveScreener()}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save Screener Login
            </button>
            {summary?.screenerSource === 'settings' && (
              <button
                type="button"
                className="button button-danger-soft"
                disabled={busy}
                onClick={() => {
                  setScreenerEmailInput('')
                  setScreenerPasswordInput('')
                  void postSettings({ clearScreenerCredentials: true }, 'Saved Screener credentials removed.')
                }}
              >
                <Trash2 size={14} /> Remove Saved Login
              </button>
            )}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="settings-section-title">
              <Globe size={15} /> Screener Browser Profile
            </span>
            <span className="settings-pill muted">
              {detected.length
                ? `Detected: ${detected.map(b => (b === 'chrome' ? 'Chrome' : 'Edge')).join(' · ')}`
                : 'No Chrome/Edge detected'}
            </span>
          </div>
          <p className="settings-desc">
            Chooses which installed browser opens for Screener sign-in and Excel export. Cookies stay in your local profile folder.
          </p>
          <div className="settings-browser-grid">
            {(
              [
                { id: 'auto', title: 'Auto', note: 'Chrome, else Edge' },
                { id: 'chrome', title: 'Google Chrome', note: detected.includes('chrome') ? 'Installed' : 'Not detected' },
                { id: 'edge', title: 'Microsoft Edge', note: detected.includes('msedge') ? 'Installed' : 'Not detected' },
              ] as const
            ).map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`settings-browser-btn ${(summary?.browserPreference ?? 'auto') === opt.id ? 'active' : ''}`}
                disabled={busy}
                onClick={() =>
                  void postSettings({ browserPreference: opt.id }, `Screener browser preference set to ${opt.title}.`)
                }
              >
                <strong>{opt.title}</strong>
                <small>{opt.note}</small>
              </button>
            ))}
          </div>
          {summary?.browserProfileDir && (
            <div className="settings-path-box" title={summary.browserProfileDir}>
              <Folder size={14} />
              <span>{summary.browserProfileDir}</span>
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="settings-section-title">
              <Database size={15} /> Persistent About Disk Cache
            </span>
            <span className="settings-pill muted">
              {summary ? `${summary.aboutCacheCount} cached · ${formatBytes(summary.aboutCacheBytes)}` : 'Loading…'}
            </span>
          </div>
          <p className="settings-desc">
            Corporate sources, news, and Gemini AI briefings are cached on disk so previously opened companies load instantly.
            Click <strong>Refresh Intelligence</strong> inside any company&apos;s About tab to fetch fresh data.
          </p>
          <div className="settings-actions-row">
            <span className="settings-path-box" style={{ flex: 1, minWidth: 200 }} title={summary?.aboutCacheDir}>
              <Folder size={14} />
              <span>{summary?.aboutCacheDir || '%LOCALAPPDATA%\\Ledger\\about-cache'}</span>
            </span>
            <button
              type="button"
              className="button button-soft"
              disabled={busy || !summary || summary.aboutCacheCount === 0}
              onClick={() => void handleClearCache()}
            >
              <Trash2 size={14} /> Clear Cache
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="settings-section-title">
              <Cloud size={15} /> Google Drive Cloud &amp; Local Storage Sync
            </span>
            <span className={`settings-pill ${driveStatus?.apiConnected ? 'ok' : 'muted'}`}>
              {driveLoading && !driveStatus
                ? 'Connecting to Drive…'
                : driveStatus?.apiConnected
                ? `Connected (${driveStatus.userEmail || 'Active'})`
                : driveStatus?.gdriveDesktopAvailable
                ? 'Local Mirror Active'
                : 'Offline'}
            </span>
          </div>
          <p className="settings-desc">
            All company research is automatically saved as responsive standalone Web Reports in Google Drive and your local mirror (<code>G:\My Drive\Ledger_Reports</code>). Existing reports are updated in-place preserving revision history.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            <div className="settings-path-box" title={driveStatus?.gdriveDesktopPath || 'G:\\My Drive\\Ledger_Reports'}>
              <HardDrive size={14} />
              <span><strong>Local Desktop Mirror:</strong> {driveStatus?.gdriveDesktopPath || 'G:\\My Drive\\Ledger_Reports'}</span>
            </div>
            {driveStatus?.driveFolderId && (
              <div className="settings-path-box" title={`Google Drive Folder ID: ${driveStatus.driveFolderId}`}>
                <Cloud size={14} />
                <span><strong>Cloud Drive Folder:</strong> Ledger_Reports ({driveStatus.driveFolderId})</span>
              </div>
            )}
          </div>
        </section>

        {message && (
          <div className={`settings-feedback ${message.kind}`}>
            {message.kind === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
            <span>{message.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
