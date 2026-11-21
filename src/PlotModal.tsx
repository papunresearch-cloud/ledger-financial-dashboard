import React, { useState, useEffect } from 'react'
import { TrendingUp, ExternalLink, Maximize2, Minimize2, X, RefreshCw } from 'lucide-react'
import './plotModal.css'

interface PlotModalProps {
  symbol?: string
  companyName?: string
  onClose: () => void
}

export const PlotModal: React.FC<PlotModalProps> = ({
  symbol = 'SBIN',
  companyName = 'State Bank of India',
  onClose,
}) => {
  const [currentSymbol, setCurrentSymbol] = useState(symbol || 'SBIN')
  const [tickerInput, setTickerInput] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => {
    if (symbol) {
      setCurrentSymbol(symbol)
    }
  }, [symbol])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSwitchTicker = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = tickerInput.trim().toUpperCase()
    if (clean && clean !== currentSymbol) {
      setCurrentSymbol(clean)
      setKey(prev => prev + 1)
      setTickerInput('')
    }
  }

  const plotUrl = `/stock-plot.html?symbol=${encodeURIComponent(currentSymbol)}&name=${encodeURIComponent(companyName || currentSymbol)}`

  const handleOpenExternal = () => {
    window.open(plotUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="plot-modal-overlay" onClick={onClose}>
      <div
        className={`plot-modal-card ${isMaximized ? 'maximized' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Stock Time Series Plot Studio"
      >
        {/* Top Header Bar */}
        <div className="plot-modal-topbar">
          <div className="plot-modal-meta">
            <span className="plot-modal-brand-icon">
              <TrendingUp size={18} />
            </span>
            <div className="plot-modal-titles">
              <div className="plot-modal-title-row">
                <span className="plot-modal-main-title">Stock Time Series Studio</span>
                <span className="plot-symbol-badge">{currentSymbol}</span>
              </div>
              <span className="plot-modal-subtitle">{companyName || 'Interactive Financial Time-Series'}</span>
            </div>
          </div>

          {/* Quick Ticker Switcher */}
          <form className="plot-ticker-form" onSubmit={handleSwitchTicker}>
            <input
              type="text"
              className="plot-ticker-input"
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value)}
              placeholder="Switch Ticker (e.g. INFY, TCS)"
              autoComplete="off"
            />
            <button type="submit" className="button button-soft plot-ticker-btn" title="Load Ticker">
              <RefreshCw size={12} />
              <span>Go</span>
            </button>
          </form>

          {/* Actions */}
          <div className="plot-modal-actions">
            <button
              type="button"
              className="plot-ctrl-btn"
              onClick={handleOpenExternal}
              title="Pop out into full standalone window / tab"
            >
              <ExternalLink size={15} />
              <span className="btn-label-desktop">Pop out</span>
            </button>

            <button
              type="button"
              className="plot-ctrl-btn"
              onClick={() => setIsMaximized(prev => !prev)}
              title={isMaximized ? 'Restore normal window size' : 'Maximize window'}
            >
              {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              type="button"
              className="plot-ctrl-btn plot-close-btn"
              onClick={onClose}
              title="Close Plot (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Embedded Interactive Chart Iframe */}
        <div className="plot-iframe-container">
          <iframe
            key={key}
            src={plotUrl}
            title="Stock Time Series Chart"
            className="plot-iframe"
          />
        </div>
      </div>
    </div>
  )
}
