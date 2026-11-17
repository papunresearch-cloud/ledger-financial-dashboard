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
      '.chart-heading-actions{display:flex!important;align-items:center!important;gap:8px!important;flex-shrink:0!important;}' +
      '.chart-zoom-controls{display:inline-flex!important;align-items:center!important;background:#f1f5f9!important;border:1px solid #cbd5e1!important;border-radius:9px!important;padding:2px 4px!important;gap:3px!important;box-shadow:0 1px 3px rgba(15,23,42,.06)!important;user-select:none!important;}' +
      '.chart-zoom-btn{width:22px!important;height:22px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;background:transparent!important;border:none!important;border-radius:5px!important;color:#475569!important;padding:0!important;cursor:pointer!important;}' +
      '.chart-zoom-btn:hover:not(:disabled){background:#e2e8f0!important;color:#0f172a!important;}' +
      '.chart-zoom-btn:disabled{opacity:0.3!important;cursor:not-allowed!important;}' +
      '.chart-zoom-badge{font-family:\'DM Mono\',monospace!important;font-size:11px!important;font-weight:700!important;padding:1px 6px!important;min-width:28px!important;text-align:center!important;border-radius:5px!important;color:#475569!important;background:transparent!important;border:1px solid transparent!important;cursor:pointer!important;user-select:none!important;line-height:1.3!important;}' +
      '.chart-zoom-badge.is-zoomed{background:#0284c7!important;color:#fff!important;border-color:#0369a1!important;}' +
      '.chart-zoom-reset{color:#d97706!important;}' +
      '</style>'
    if (clean.includes('</head>')) {
      clean = clean.replace('</head>', `${injectedCss}</head>`)
    } else {
      clean = injectedCss + clean
    }

    if (!clean.includes('window._chartZoomInit') && !clean.includes('Chart Zooming in Web Report')) {
      const zoomScript = `<script>
      (function() {
        if (window._chartZoomInit) return;
        window._chartZoomInit = true;
        var ZOOM_PRESETS = [1, 1.5, 2, 3, 5, 8, 15, 30, 60, 120, 250, 500];
        function parseTick(text) {
          var clean = (text || '').trim();
          var prefix = ''; var suffix = '';
          if (clean.charAt(0) === '₹') { prefix = '₹'; clean = clean.slice(1).trim(); }
          if (clean.slice(-1) === '%') { suffix = '%'; clean = clean.slice(0, -1).trim(); }
          else if (clean.slice(-1) === '×') { suffix = '×'; clean = clean.slice(0, -1).trim(); }
          else if (clean.slice(-1).toUpperCase() === 'K') { suffix = 'K'; clean = clean.slice(0, -1).trim(); }
          else if (clean.slice(-1).toUpperCase() === 'M') { suffix = 'M'; clean = clean.slice(0, -1).trim(); }
          else if (clean.slice(-2).toUpperCase() === 'CR') { suffix = 'Cr'; clean = clean.slice(0, -2).trim(); }
          var num = parseFloat(clean);
          if (isNaN(num)) return null;
          var mult = 1;
          if (suffix === 'K') mult = 1000;
          else if (suffix === 'M') mult = 1000000;
          else if (suffix === 'Cr') mult = 10000000;
          return { prefix: prefix, value: num * mult, suffix: suffix };
        }
        function formatTick(val, origPrefix, origSuffix) {
          if (val === null || val === undefined || isNaN(val)) return '';
          if (val === 0) return '0';
          var prefix = origPrefix || '';
          var suffix = (origSuffix === '%' || origSuffix === '×') ? origSuffix : '';
          var abs = Math.abs(val);
          var formatted = '';
          if (origSuffix === 'K' || origSuffix === 'M' || origSuffix === 'Cr' || (suffix === '' && abs >= 1000)) {
            if (abs >= 10000000) formatted = (val / 10000000).toFixed(1).replace(/\\.0$/, '') + 'Cr';
            else if (abs >= 1000000) formatted = (val / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
            else if (abs >= 1000) formatted = (val / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
            else formatted = val.toFixed(1).replace(/\\.0$/, '');
          } else {
            if (abs >= 10) formatted = val.toFixed(1).replace(/\\.0$/, '');
            else formatted = val.toFixed(2).replace(/\\.00$/, '');
          }
          return prefix + formatted + suffix;
        }
        function ensureControlsOnCard(card) {
          if (card.querySelector('.chart-zoom-controls')) return;
          var heading = card.querySelector('.chart-heading');
          if (!heading) return;
          var actions = heading.querySelector('.chart-heading-actions');
          if (!actions) {
            actions = document.createElement('div');
            actions.className = 'chart-heading-actions';
            var spark = heading.querySelector('.chart-spark');
            if (spark) {
              heading.insertBefore(actions, spark);
              actions.appendChild(spark);
            } else {
              heading.appendChild(actions);
            }
          }
          var ctrl = document.createElement('div');
          ctrl.className = 'chart-zoom-controls';
          ctrl.title = 'Zoom Y-axis to expand small values compressed by sudden spike (or Ctrl+Scroll)';
          ctrl.innerHTML = '<button type="button" class="chart-zoom-btn zoom-out" disabled title="Zoom Out (-)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>' +
            '<button type="button" class="chart-zoom-badge" title="Click to cycle zoom">1×</button>' +
            '<button type="button" class="chart-zoom-btn zoom-in" title="Zoom In (+)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>' +
            '<button type="button" class="chart-zoom-btn chart-zoom-reset" style="display:none;" title="Reset zoom (1×)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg></button>';
          var sparkEl = actions.querySelector('.chart-spark');
          if (sparkEl) actions.insertBefore(ctrl, sparkEl);
          else actions.appendChild(ctrl);
        }
        function applyZoomToCard(card, targetZoom) {
          card._zoom = targetZoom;
          var badge = card.querySelector('.chart-zoom-badge');
          if (badge) {
            badge.textContent = targetZoom + '×';
            if (targetZoom > 1) badge.classList.add('is-zoomed');
            else badge.classList.remove('is-zoomed');
          }
          var resetBtn = card.querySelector('.chart-zoom-reset');
          if (resetBtn) resetBtn.style.display = targetZoom > 1 ? 'inline-flex' : 'none';
          var outBtn = card.querySelector('.chart-zoom-btn.zoom-out');
          if (outBtn) outBtn.disabled = targetZoom <= 1;
          var inBtn = card.querySelector('.chart-zoom-btn.zoom-in');
          if (inBtn) inBtn.disabled = targetZoom >= ZOOM_PRESETS[ZOOM_PRESETS.length - 1];

          var svg = card.querySelector('.chart-snapshot svg.recharts-surface');
          if (!svg) return;
          var baselineY = 227;
          var clipRect = svg.querySelector('clipPath rect');
          if (clipRect) {
            var cy = parseFloat(clipRect.getAttribute('y') || '12');
            var ch = parseFloat(clipRect.getAttribute('height') || '215');
            baselineY = cy + ch;
          }
          var clipPath = svg.querySelector('defs clipPath');
          var clipId = clipPath ? clipPath.getAttribute('id') : '';
          var plotLayers = svg.querySelectorAll('.recharts-bar, .recharts-line, .recharts-area');
          plotLayers.forEach(function(layer) {
            if (clipId && !layer.getAttribute('clip-path')) {
              layer.setAttribute('clip-path', 'url(#' + clipId + ')');
            }
            if (targetZoom <= 1) {
              layer.removeAttribute('transform');
            } else {
              layer.setAttribute('transform', 'matrix(1, 0, 0, ' + targetZoom + ', 0, ' + (baselineY * (1 - targetZoom)) + ')');
            }
          });
          var yTicks = svg.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick text');
          yTicks.forEach(function(textEl) {
            var tspan = textEl.querySelector('tspan') || textEl;
            if (!tspan.hasAttribute('data-orig-text')) {
              tspan.setAttribute('data-orig-text', tspan.textContent || '');
            }
            var origText = tspan.getAttribute('data-orig-text');
            if (targetZoom <= 1) {
              tspan.textContent = origText;
            } else {
              var parsed = parseTick(origText);
              if (parsed && parsed.value !== 0) {
                tspan.textContent = formatTick(parsed.value / targetZoom, parsed.prefix, parsed.suffix);
              }
            }
          });
        }
        function initAllCharts() {
          document.querySelectorAll('.chart-card').forEach(function(card) {
            ensureControlsOnCard(card);
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initAllCharts);
        } else {
          initAllCharts();
        }
        document.addEventListener('click', function(e) {
          var btn = e.target.closest('.chart-zoom-btn, .chart-zoom-badge');
          if (!btn) return;
          var card = btn.closest('.chart-card');
          if (!card) return;
          var curZoom = card._zoom || 1;
          var curIdx = ZOOM_PRESETS.indexOf(curZoom);
          if (curIdx === -1) curIdx = 0;
          if (btn.classList.contains('zoom-in')) {
            var nextIdx = Math.min(ZOOM_PRESETS.length - 1, curIdx + 1);
            applyZoomToCard(card, ZOOM_PRESETS[nextIdx]);
          } else if (btn.classList.contains('zoom-out')) {
            var prevIdx = Math.max(0, curIdx - 1);
            applyZoomToCard(card, ZOOM_PRESETS[prevIdx]);
          } else if (btn.classList.contains('chart-zoom-reset')) {
            applyZoomToCard(card, 1);
          } else if (btn.classList.contains('chart-zoom-badge')) {
            var cycleIdx = (curIdx + 1) % ZOOM_PRESETS.length;
            applyZoomToCard(card, ZOOM_PRESETS[cycleIdx]);
          }
        });
        document.addEventListener('wheel', function(e) {
          if (!e.ctrlKey) return;
          var snapshot = e.target.closest('.chart-snapshot');
          if (!snapshot) return;
          var card = snapshot.closest('.chart-card');
          if (!card) return;
          e.preventDefault();
          var curZoom = card._zoom || 1;
          var curIdx = ZOOM_PRESETS.indexOf(curZoom);
          if (curIdx === -1) curIdx = 0;
          if (e.deltaY < 0) {
            var nextIdx = Math.min(ZOOM_PRESETS.length - 1, curIdx + 1);
            applyZoomToCard(card, ZOOM_PRESETS[nextIdx]);
          } else if (e.deltaY > 0) {
            var prevIdx = Math.max(0, curIdx - 1);
            applyZoomToCard(card, ZOOM_PRESETS[prevIdx]);
          }
        }, { passive: false });
      })();
      </script>`
      if (clean.includes('</body>')) {
        clean = clean.replace('</body>', `${zoomScript}</body>`)
      } else {
        clean += zoomScript
      }
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
