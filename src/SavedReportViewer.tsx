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
      '.chart-reset-range-btn,.chart-slider-toggle-btn{display:inline-flex!important;align-items:center!important;gap:5px!important;font-size:11px!important;font-weight:700!important;font-family:\'DM Mono\',monospace!important;padding:3px 8px!important;border-radius:7px!important;border:1px solid #cbd5e1!important;background:#f1f5f9!important;color:#475569!important;cursor:pointer!important;user-select:none!important;}' +
      '.chart-reset-range-btn{background:#fef3c7!important;color:#b45309!important;border-color:#fde68a!important;}' +
      '.chart-reset-range-btn:hover{background:#fde68a!important;color:#92400e!important;}' +
      '.chart-slider-toggle-btn.active{background:#e0f2fe!important;color:#0284c7!important;border-color:#bae6fd!important;}' +
      '.chart-sliders-box{margin-top:10px!important;padding:8px 12px!important;background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:12px!important;display:flex!important;flex-direction:column!important;gap:7px!important;box-shadow:inset 0 1px 3px rgba(15,23,42,.04)!important;}' +
      '.chart-slider-row{display:flex!important;align-items:center!important;gap:12px!important;width:100%!important;}' +
      '.chart-slider-meta{display:flex!important;align-items:center!important;gap:8px!important;min-width:140px!important;max-width:180px!important;flex-shrink:0!important;}' +
      '.chart-slider-axis-badge{font-size:10px!important;font-weight:800!important;font-family:\'DM Mono\',monospace!important;padding:2px 6px!important;border-radius:4px!important;color:#fff!important;text-transform:uppercase!important;}' +
      '.chart-slider-axis-badge.axis-x{background:#0284c7!important;}' +
      '.chart-slider-axis-badge.axis-y{background:#059669!important;}' +
      '.chart-slider-range-text{font-size:11px!important;font-weight:700!important;font-family:\'DM Mono\',monospace!important;color:#1e293b!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}' +
      '.dual-slider-container{position:relative!important;flex:1!important;height:24px!important;display:flex!important;align-items:center!important;touch-action:none!important;}' +
      '.dual-slider-track{position:absolute!important;width:100%!important;height:6px!important;border-radius:3px!important;background:#e2e8f0!important;}' +
      '.dual-slider-fill{position:absolute!important;height:6px!important;border-radius:3px!important;background:#0284c7!important;z-index:2!important;pointer-events:none!important;}' +
      '.dual-slider-input{position:absolute!important;width:100%!important;height:6px!important;background:transparent!important;-webkit-appearance:none!important;appearance:none!important;pointer-events:none!important;margin:0!important;outline:none!important;}' +
      '.dual-slider-input::-webkit-slider-thumb{pointer-events:auto!important;-webkit-appearance:none!important;appearance:none!important;width:16px!important;height:16px!important;border-radius:50%!important;background:#0284c7!important;border:2px solid #fff!important;cursor:grab!important;box-shadow:0 1px 4px rgba(15,23,42,.25)!important;}' +
      '.dual-slider-input.slider-max::-webkit-slider-thumb{background:#059669!important;border-color:#fff!important;}' +
      '.about-table-scroll,.company-table-scroll,.bank-growth-scroll,.about-peer-wrap,.about-ratio-wrap,.peer-table-scroll-wrap,.sh-table-scroll-wrap,.ratio-table-wrapper,.company-source-scroll,.bank-source-scroll,.checks-table-wrapper,.table-container{width:100%!important;max-width:100%!important;overflow:auto!important;-webkit-overflow-scrolling:touch!important;display:block!important;position:relative!important;max-height:clamp(380px,72vh,760px)!important;}' +
      '.about-peer-table,.about-ratio-table,.ratio-table,.sh-data-table,.company-growth-table,.bank-growth-table{border-collapse:separate!important;border-spacing:0!important;}' +
      '.about-peer-table thead th,.about-ratio-table thead th,.ratio-table thead th,.sh-data-table thead th,.company-growth-table thead th,.bank-growth-table thead th{position:sticky!important;top:0!important;z-index:15!important;}' +
      '.about-peer-table tbody td:first-child,.about-peer-table tfoot td:first-child,.about-ratio-table tbody td.col-sticky,.ratio-table tbody td.col-sticky,.sh-data-table tbody .sh-td-category,.company-growth-table tbody th,.bank-growth-table tbody th{position:sticky!important;left:0!important;z-index:8!important;}' +
      '.about-peer-table thead th:first-child,.about-ratio-table thead th:first-child,.about-ratio-table thead th.col-sticky,.ratio-table thead th.col-sticky,.sh-data-table thead th.sh-th-category,.company-growth-table thead th:first-child,.bank-growth-table thead th:first-child{position:sticky!important;top:0!important;left:0!important;z-index:30!important;}' +
      '.theme-bright .about-peer-table thead th,.theme-bright .about-ratio-table thead th,.theme-bright .ratio-table thead th{background:#dcfce7!important;color:#0f2b5c!important;border-bottom:2px solid #86efac!important;}' +
      '.theme-bright .about-peer-table thead th:first-child,.theme-bright .about-ratio-table thead th:first-child,.theme-bright .ratio-table thead th.col-sticky{background:#dcfce7!important;color:#0f2b5c!important;border-bottom:2px solid #86efac!important;border-right:1.5px solid #86efac!important;}' +
      '.theme-bright .about-peer-table td:first-child,.theme-bright .about-ratio-table td.col-sticky,.theme-bright .ratio-table td.col-sticky{background:#ffffff!important;border-right:1.5px solid #cbd5e1!important;}' +
      '.theme-bright .company-growth-table thead th,.theme-bright .bank-growth-table thead th{background:#1e3a8a!important;color:#ffffff!important;border-bottom:3px solid #f59e0b!important;}' +
      '.theme-bright .company-growth-table thead th:first-child,.theme-bright .bank-growth-table thead th:first-child{background:#1e3a8a!important;color:#ffffff!important;border-right:1.5px solid rgba(255,255,255,.25)!important;}' +
      '.theme-bright .company-growth-table tbody th,.theme-bright .bank-growth-table tbody th{background:#ffffff!important;color:#000000!important;border-right:1.5px solid #cbd5e1!important;}' +
      '.theme-bright .sh-data-table thead th{background:#f1f5f9!important;color:#1e293b!important;border-bottom:2px solid #cbd5e1!important;}' +
      '.theme-bright .sh-data-table thead th.sh-th-category{background:#f1f5f9!important;color:#1e293b!important;}' +
      '.theme-bright .sh-td-category{background:#ffffff!important;}' +
      '</style>'
    if (clean.includes('</head>')) {
      clean = clean.replace('</head>', `${injectedCss}</head>`)
    } else {
      clean = injectedCss + clean
    }

    if (!clean.includes('window._chartRangeInit') && !clean.includes('Chart Dual-Range Sliders')) {
      const sliderScript = `<script>
      (function() {
        if (window._chartRangeInit) return;
        window._chartRangeInit = true;
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
        function ensureSlidersOnCard(card) {
          if (card.querySelector('.chart-sliders-box')) return;
          var svg = card.querySelector('.chart-snapshot svg.recharts-surface');
          if (!svg) return;
          var xTicks = Array.from(svg.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick text tspan, .recharts-xAxis .recharts-cartesian-axis-tick text')).map(function(t) {
            return (t.textContent || '').trim();
          }).filter(Boolean);
          var totalPeriods = xTicks.length || 10;
          var startLabel = xTicks[0] || 'Start';
          var endLabel = xTicks[totalPeriods - 1] || 'End';

          var heading = card.querySelector('.chart-heading');
          if (heading && !heading.querySelector('.chart-heading-actions')) {
            var actions = document.createElement('div');
            actions.className = 'chart-heading-actions';
            actions.innerHTML = '<button type="button" class="chart-reset-range-btn" style="display:none;" title="Reset range"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg><span>Reset</span></button>' +
              '<button type="button" class="chart-slider-toggle-btn active" title="Toggle range sliders"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg><span>Range</span></button>';
            var spark = heading.querySelector('.chart-spark');
            if (spark) { heading.insertBefore(actions, spark); actions.appendChild(spark); }
            else { heading.appendChild(actions); }
          }
          var box = document.createElement('div');
          box.className = 'chart-sliders-box';
          box.dataset.totalPeriods = totalPeriods;
          box.dataset.periods = JSON.stringify(xTicks);
          box.innerHTML = '<div class="chart-slider-row">' +
            '<div class="chart-slider-meta"><span class="chart-slider-axis-badge axis-x">X-Axis</span><span class="chart-slider-range-text">' + startLabel + ' → ' + endLabel + '</span></div>' +
            '<div class="dual-slider-container"><div class="dual-slider-track"></div><div class="dual-slider-fill" style="left:0%;width:100%;"></div>' +
            '<input type="range" min="0" max="' + (totalPeriods - 1) + '" value="0" class="dual-slider-input slider-min">' +
            '<input type="range" min="0" max="' + (totalPeriods - 1) + '" value="' + (totalPeriods - 1) + '" class="dual-slider-input slider-max">' +
            '</div></div>' +
            '<div class="chart-slider-row">' +
            '<div class="chart-slider-meta"><span class="chart-slider-axis-badge axis-y">Y-Axis</span><span class="chart-slider-range-text">0 → Full</span></div>' +
            '<div class="dual-slider-container"><div class="dual-slider-track"></div><div class="dual-slider-fill" style="left:0%;width:100%;background:#059669;"></div>' +
            '<input type="range" min="0" max="100" value="0" class="dual-slider-input slider-min">' +
            '<input type="range" min="0" max="100" value="100" class="dual-slider-input slider-max">' +
            '</div></div>';
          card.appendChild(box);
        }
        function updateCardTransform(card) {
          var box = card.querySelector('.chart-sliders-box');
          if (!box) return;
          var rows = box.querySelectorAll('.chart-slider-row');
          if (rows.length < 2) return;
          var xMinInput = rows[0].querySelector('.slider-min');
          var xMaxInput = rows[0].querySelector('.slider-max');
          var yMinInput = rows[1].querySelector('.slider-min');
          var yMaxInput = rows[1].querySelector('.slider-max');
          if (!xMinInput || !xMaxInput || !yMinInput || !yMaxInput) return;
          var xMin = parseInt(xMinInput.value, 10);
          var xMax = parseInt(xMaxInput.value, 10);
          if (xMin > xMax - 1) { xMin = xMax - 1; xMinInput.value = xMin; }
          var yMin = parseInt(yMinInput.value, 10);
          var yMax = parseInt(yMaxInput.value, 10);
          if (yMin > yMax - 5) { yMin = yMax - 5; yMinInput.value = yMin; }
          var xSpan = parseInt(xMinInput.max, 10) || 1;
          var xFill = rows[0].querySelector('.dual-slider-fill');
          if (xFill) {
            xFill.style.left = ((xMin / xSpan) * 100) + '%';
            xFill.style.width = (((xMax - xMin) / xSpan) * 100) + '%';
          }
          var yFill = rows[1].querySelector('.dual-slider-fill');
          if (yFill) {
            yFill.style.left = yMin + '%';
            yFill.style.width = (yMax - yMin) + '%';
          }
          var periods = [];
          try { periods = JSON.parse(box.dataset.periods || '[]'); } catch(e){}
          var xRangeText = rows[0].querySelector('.chart-slider-range-text');
          if (xRangeText && periods.length) {
            xRangeText.textContent = (periods[xMin] || '') + ' → ' + (periods[xMax] || '');
          }
          var isAdjusted = xMin > 0 || xMax < xSpan || yMin > 0 || yMax < 100;
          var resetBtn = card.querySelector('.chart-reset-range-btn');
          if (resetBtn) resetBtn.style.display = isAdjusted ? 'inline-flex' : 'none';

          var svg = card.querySelector('.chart-snapshot svg.recharts-surface');
          if (!svg) return;
          var clipRect = svg.querySelector('clipPath rect');
          var plotX = 62; var plotW = 464; var baselineY = 227; var plotH = 215;
          if (clipRect) {
            plotX = parseFloat(clipRect.getAttribute('x') || '62');
            plotW = parseFloat(clipRect.getAttribute('width') || '464');
            var cy = parseFloat(clipRect.getAttribute('y') || '12');
            plotH = parseFloat(clipRect.getAttribute('height') || '215');
            baselineY = cy + plotH;
          }
          var fracX = (xMax - xMin) / xSpan;
          var scaleX = fracX > 0 ? (1 / fracX) : 1;
          var origStartX = plotX + (xMin / xSpan) * plotW;
          var tx = plotX - origStartX * scaleX;
          var fracY = (yMax - yMin) / 100;
          var scaleY = 1 / Math.max(0.01, Math.pow(fracY, 2.2));
          var ty = baselineY * (1 - scaleY);
          var clipPath = svg.querySelector('defs clipPath');
          var clipId = clipPath ? clipPath.getAttribute('id') : '';
          var plotLayers = svg.querySelectorAll('.recharts-bar, .recharts-line, .recharts-area');
          plotLayers.forEach(function(layer) {
            if (clipId && !layer.getAttribute('clip-path')) {
              layer.setAttribute('clip-path', 'url(#' + clipId + ')');
            }
            if (!isAdjusted) {
              layer.removeAttribute('transform');
            } else {
              layer.setAttribute('transform', 'matrix(' + scaleX + ', 0, 0, ' + scaleY + ', ' + tx + ', ' + ty + ')');
            }
          });
          var xAxis = svg.querySelector('.recharts-xAxis');
          if (xAxis) {
            if (!isAdjusted) {
              xAxis.removeAttribute('transform');
              xAxis.querySelectorAll('.recharts-cartesian-axis-tick').forEach(function(t) { t.style.display = ''; });
            } else {
              xAxis.setAttribute('transform', 'matrix(' + scaleX + ', 0, 0, 1, ' + tx + ', 0)');
              xAxis.querySelectorAll('.recharts-cartesian-axis-tick text').forEach(function(txt) {
                var origX = parseFloat(txt.getAttribute('x') || '0');
                var mappedX = origX * scaleX + tx;
                txt.closest('.recharts-cartesian-axis-tick').style.display = (mappedX < plotX - 5 || mappedX > plotX + plotW + 5) ? 'none' : '';
              });
            }
          }
          var yTicks = svg.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick text');
          var yRangeText = rows[1].querySelector('.chart-slider-range-text');
          var topTickVal = null;
          var bottomTickVal = null;
          yTicks.forEach(function(textEl, idx) {
            var tspan = textEl.querySelector('tspan') || textEl;
            if (!tspan.hasAttribute('data-orig-text')) {
              tspan.setAttribute('data-orig-text', tspan.textContent || '');
            }
            var origText = tspan.getAttribute('data-orig-text');
            if (!isAdjusted) {
              tspan.textContent = origText;
            } else {
              var parsed = parseTick(origText);
              if (parsed && parsed.value !== 0) {
                var scaledVal = parsed.value / scaleY;
                tspan.textContent = formatTick(scaledVal, parsed.prefix, parsed.suffix);
                if (idx === yTicks.length - 1) topTickVal = tspan.textContent;
                if (idx === 0) bottomTickVal = tspan.textContent;
              }
            }
          });
          if (yRangeText) {
            if (!isAdjusted) {
              yRangeText.textContent = '0 → Full';
            } else if (topTickVal) {
              yRangeText.textContent = (bottomTickVal || '0') + ' → ' + topTickVal;
            }
          }
        }
        function initAllCharts() {
          document.querySelectorAll('.chart-card').forEach(function(card) {
            ensureSlidersOnCard(card);
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initAllCharts);
        } else {
          initAllCharts();
        }
        document.addEventListener('input', function(e) {
          if (!e.target.classList.contains('dual-slider-input')) return;
          var card = e.target.closest('.chart-card');
          if (!card) return;
          updateCardTransform(card);
        });
        document.addEventListener('click', function(e) {
          var resetBtn = e.target.closest('.chart-reset-range-btn');
          if (resetBtn) {
            var card = resetBtn.closest('.chart-card');
            if (!card) return;
            var box = card.querySelector('.chart-sliders-box');
            if (!box) return;
            var inputs = box.querySelectorAll('.dual-slider-input');
            if (inputs.length >= 4) {
              inputs[0].value = inputs[0].min;
              inputs[1].value = inputs[1].max;
              inputs[2].value = inputs[2].min;
              inputs[3].value = inputs[3].max;
            }
            updateCardTransform(card);
            return;
          }
          var toggleBtn = e.target.closest('.chart-slider-toggle-btn');
          if (toggleBtn) {
            var card = toggleBtn.closest('.chart-card');
            if (!card) return;
            var box = card.querySelector('.chart-sliders-box');
            if (box) {
              var isHidden = box.style.display === 'none';
              box.style.display = isHidden ? 'flex' : 'none';
              toggleBtn.classList.toggle('active', isHidden);
            }
          }
        });
      })();
      </script>`
      if (clean.includes('</body>')) {
        clean = clean.replace('</body>', `${sliderScript}</body>`)
      } else {
        clean += sliderScript
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
