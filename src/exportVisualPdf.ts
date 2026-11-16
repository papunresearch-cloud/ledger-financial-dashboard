import type { FinancialData } from './types'

const safeName = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'COMPANY'

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 45_000)
}

export async function waitForPrintStageReady(stageElement: HTMLElement): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const deadline = performance.now() + 1500
  while (performance.now() < deadline) {
    const snapshots = Array.from(stageElement.querySelectorAll<HTMLElement>('[data-print-section="plots"] .chart-snapshot'))
    const allReady = snapshots.every(snap => {
      if (snap.querySelector('.chart-empty')) return true
      const svg = snap.querySelector<SVGSVGElement>('svg.recharts-surface')
      if (!svg) return false
      const rect = svg.getBoundingClientRect()
      return rect.width > 20 && rect.height > 20
    })
    if (allReady) break
    await new Promise<void>(resolve => window.setTimeout(resolve, 60))
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function collectAllActiveCss(): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules)
      chunks.push(rules.map(r => r.cssText).join('\n'))
    } catch {
      /* ignore cross-origin stylesheets */
    }
  }
  return chunks.join('\n')
}

function flattenSvgBarGradients(root: HTMLElement): void {
  const gradStops = new Map<string, string>()
  for (const grad of Array.from(root.querySelectorAll<SVGLinearGradientElement>('svg linearGradient[id]'))) {
    const stop = grad.querySelector('stop')
    const color = stop?.getAttribute('stop-color')
    if (grad.id && color) gradStops.set(grad.id, color)
  }
  if (!gradStops.size) return
  for (const el of Array.from(root.querySelectorAll<SVGElement>('svg [fill^="url(#"]'))) {
    const rawFill = el.getAttribute('fill') || ''
    const m = rawFill.match(/^url\(#([^)]+)\)$/)
    if (m && gradStops.has(m[1])) {
      el.setAttribute('fill', gradStops.get(m[1])!)
    }
  }
}

export function buildStandaloneWebReportHtml(
  stageElement: HTMLElement,
  data: FinancialData,
): string {
  const modeClass = data.mode === 'bank' ? 'bank-theme' : 'company-theme'
  const liveSvgs = Array.from(stageElement.querySelectorAll<SVGSVGElement>('.chart-snapshot .recharts-wrapper > svg'))
  const svgDims = liveSvgs.map(el => el.getBoundingClientRect())

  const clone = stageElement.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.removeAttribute('aria-hidden')

  // Set section anchor IDs for smooth quick navigation
  const bannerEl = clone.querySelector('[data-print-block="banner"]')
  if (bannerEl) bannerEl.id = 'top'

  const aboutEl = clone.querySelector('[data-print-section="about"]')
  if (aboutEl) aboutEl.id = 'about-section-anchor'

  const comparisonEl = clone.querySelector('[data-print-section="comparison"]')
  if (comparisonEl) comparisonEl.id = 'comparison-section-anchor'

  const overviewEl = clone.querySelector('[data-print-section="overview"]')
  if (overviewEl) overviewEl.id = 'overview-section-anchor'

  const qRatioEl = clone.querySelector('[data-print-section="quarterly-ratio"]')
  if (qRatioEl) qRatioEl.id = 'quarterly-ratio-anchor'

  const yRatioEl = clone.querySelector('[data-print-section="yearly-ratio"]')
  if (yRatioEl) yRatioEl.id = 'yearly-ratio-anchor'

  const plotsEl = clone.querySelector('[data-print-section="plots"]')
  if (plotsEl) plotsEl.id = 'plots-section-anchor'

  const holdingEl = clone.querySelector('[data-print-section="holding"]')
  if (holdingEl) holdingEl.id = 'holding-section-anchor'

  const tablesEl = clone.querySelector('[data-print-section="tables"]')
  if (tablesEl) tablesEl.id = 'tables-section-anchor'

  const checksEl = clone.querySelector('[data-print-section="checks"]')
  if (checksEl) checksEl.id = 'checks-section-anchor'

  // Remove desktop-only action bars and interactive overlays
  Array.from(clone.querySelectorAll<HTMLElement>(
    '.company-actions, .topbar, .section-nav, .theme-toggle-button, .settings-btn, .about-refresh-btn, .holding-btn-refresh, .peer-refresh-btn, .recharts-tooltip-wrapper',
  )).forEach(el => el.remove())

  // Ensure 100% fluid, responsive SVG charts across all screen widths
  Array.from(clone.querySelectorAll<SVGSVGElement>('.chart-snapshot .recharts-wrapper > svg')).forEach((svg, idx) => {
    const r = svgDims[idx]
    const w = r && r.width > 20 ? Math.round(r.width) : (svg.viewBox?.baseVal?.width || 540)
    const h = r && r.height > 20 ? Math.round(r.height) : (svg.viewBox?.baseVal?.height || 286)
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.maxWidth = '100%'
    svg.style.display = 'block'
  })

  // Format Recharts containers to responsive fixed height
  Array.from(clone.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper')).forEach(el => {
    el.style.width = '100%'
    el.style.height = '286px'
    el.style.position = 'relative'
  })

  // Format legend cleanly
  Array.from(clone.querySelectorAll<HTMLElement>('.recharts-legend-wrapper')).forEach(el => {
    el.style.position = 'absolute'
    el.style.bottom = '0px'
    el.style.left = '0px'
    el.style.width = '100%'
    el.style.height = 'auto'
    el.style.textAlign = 'center'
    el.style.zIndex = '5'
  })
  Array.from(clone.querySelectorAll<HTMLElement>('.recharts-legend-item svg')).forEach(el => {
    el.style.width = '14px'
    el.style.height = '14px'
    el.style.display = 'inline-block'
    el.style.verticalAlign = 'middle'
    el.style.marginRight = '4px'
  })
  Array.from(clone.querySelectorAll<HTMLElement>('.recharts-legend-item')).forEach(el => {
    el.style.display = 'inline-flex'
    el.style.alignItems = 'center'
    el.style.margin = '0 8px'
  })

  // Ensure tables without scroll wrappers have horizontal scrolling enabled
  Array.from(clone.querySelectorAll<HTMLTableElement>('table')).forEach(table => {
    const parent = table.parentElement
    if (
      parent &&
      !parent.classList.contains('peer-table-scroll-wrap') &&
      !parent.classList.contains('sh-table-scroll-wrap') &&
      !parent.classList.contains('ratio-table-wrapper') &&
      !parent.classList.contains('about-table-scroll') &&
      !parent.classList.contains('company-table-scroll') &&
      !parent.classList.contains('bank-growth-scroll')
    ) {
      parent.style.overflowX = 'auto'
      parent.style.setProperty('-webkit-overflow-scrolling', 'touch')
      parent.style.maxWidth = '100%'
    }
  })

  flattenSvgBarGradients(clone)

  const activeCss = collectAllActiveCss()

  const webReportCss = `
    html {
      box-sizing: border-box;
      scroll-behavior: smooth;
    }
    *, *::before, *::after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      padding: 0;
      background: #f8fafc !important;
      color: #0f172a !important;
      font-family: Cambria, Georgia, 'Times New Roman', serif !important;
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
    }

    /* Sticky Quick-Navigation Header */
    .web-report-sticky-nav {
      position: sticky;
      top: 0;
      z-index: 9999;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 2px solid #cbd5e1;
      box-shadow: 0 4px 18px -4px rgba(15, 23, 42, 0.1);
      padding: 10px 20px;
    }
    .web-report-nav-inner {
      max-width: 1440px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .web-report-nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .web-report-nav-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
    }
    .web-report-nav-pill {
      font-size: 10.5px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      background: #dcfce7;
      color: #065f46;
      border: 1px solid #86efac;
      letter-spacing: 0.3px;
    }
    .web-report-nav-links {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .web-report-nav-links a {
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      padding: 6px 13px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      transition: all 0.15s ease;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .web-report-nav-links a:hover {
      background: #f1f5f9;
      color: #0284c7;
      border-color: #cbd5e1;
    }
    .web-report-nav-links a.top-link {
      background: #0f766e;
      color: #ffffff;
      border-color: #0d9488;
    }
    .web-report-nav-links a.top-link:hover {
      background: #115e59;
    }

    /* Fluid Outer Container */
    .web-report-container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px 24px 80px;
      width: 100%;
    }

    /* Web Report Stage Styling (Full Width, Unpinned, Exact Bright Mode) */
    .print-report-stage,
    .web-report-stage {
      position: static !important;
      left: auto !important;
      top: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      z-index: auto !important;
      pointer-events: auto !important;
      background: transparent !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 36px !important;
    }

    /* Full Fidelity Bright Mode Theme Rules */
    .app-shell.theme-bright,
    .theme-bright,
    .web-report-stage {
      background: transparent !important;
      color: #0f172a !important;
    }

    .peer-diff-neg {
      color: #b91c1c !important;
      font-weight: 850 !important;
    }
    .peer-diff-pos {
      color: #15803d !important;
      font-weight: 850 !important;
    }
    .delta-zero {
      color: #0369a1 !important;
      background: #e0f2fe !important;
      border: 1px solid #7dd3fc !important;
      font-weight: 850 !important;
    }

    .peer-th-twoline {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-end !important;
      justify-content: flex-end !important;
      gap: 2px !important;
      line-height: 1.15 !important;
    }
    .about-peer-table th:first-child .peer-th-twoline {
      align-items: flex-start !important;
    }
    .peer-th-line1 {
      font-size: 11px !important;
      font-weight: 850 !important;
      white-space: nowrap !important;
    }
    .peer-th-line2 {
      font-size: 9.5px !important;
      font-weight: 700 !important;
      opacity: 0.85 !important;
      white-space: nowrap !important;
    }
    .peer-val-twoline {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-end !important;
      justify-content: center !important;
      gap: 2px !important;
      line-height: 1.18 !important;
    }
    .peer-td-range {
      min-width: 175px !important;
      max-width: 220px !important;
      width: 195px !important;
      padding: 5px 8px !important;
    }
    .peer-range-compact-cell {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 8px !important;
      width: 100% !important;
    }
    .peer-range-track-system {
      display: flex !important;
      flex-direction: column !important;
      position: relative !important;
      flex: 1 !important;
      min-width: 100px !important;
      max-width: 150px !important;
      padding: 0 4px !important;
    }
    .peer-markers-top {
      position: relative !important;
      width: 100% !important;
      height: 9px !important;
    }
    .peer-range-bar-track {
      position: relative !important;
      width: 100% !important;
      height: 4.5px !important;
      background: #cbd5e1 !important;
      border-radius: 999px !important;
    }
    .peer-markers-bottom {
      position: relative !important;
      width: 100% !important;
      height: 9px !important;
    }
    .peer-marker {
      position: absolute !important;
      transform: translateX(-50%) !important;
    }
    .marker-dma50-tri {
      width: 0 !important;
      height: 0 !important;
      border-left: 3.5px solid transparent !important;
      border-right: 3.5px solid transparent !important;
      border-top: 6.5px solid #0284c7 !important;
      bottom: 0px !important;
      z-index: 3 !important;
    }
    .marker-dma200-tri {
      width: 0 !important;
      height: 0 !important;
      border-left: 5px solid transparent !important;
      border-right: 5px solid transparent !important;
      border-top: 8.5px solid #ea580c !important;
      bottom: 0px !important;
      z-index: 2 !important;
    }
    .marker-cmp-arrow {
      width: 0 !important;
      height: 0 !important;
      border-left: 4.5px solid transparent !important;
      border-right: 4.5px solid transparent !important;
      border-bottom: 7.5px solid #16a34a !important;
      top: 0px !important;
      z-index: 4 !important;
    }
    .peer-range-pct-text {
      font-family: 'DM Mono', monospace !important;
      font-size: 10.5px !important;
      font-weight: 900 !important;
      color: #034574 !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
      min-width: 28px !important;
      text-align: right !important;
    }
    .peer-range-fallback {
      font-family: 'DM Mono', monospace !important;
      font-weight: 700 !important;
      color: #94a3b8 !important;
      font-size: 11px !important;
    }
    .peer-legend-strip {
      display: flex !important;
      align-items: center !important;
      gap: 16px !important;
      flex-wrap: wrap !important;
      padding: 8px 14px !important;
      background: #f8fafc !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 10px !important;
      font-family: 'DM Mono', monospace !important;
      font-size: 11.5px !important;
      color: #334155 !important;
    }
    .legend-label { color: #0f766e !important; font-weight: 850 !important; }
    .marker-track-sample { color: #94a3b8 !important; font-weight: 900 !important; }
    .marker-cmp-arrow-sample { color: #16a34a !important; font-weight: 900 !important; }
    .marker-dma50-sample { color: #0284c7 !important; font-weight: 900 !important; }
    .marker-dma200-sample { color: #ea580c !important; font-weight: 900 !important; font-size: 13px !important; }
    .legend-code { background: #e2e8f0 !important; padding: 1px 5px !important; border-radius: 4px !important; color: #034574 !important; font-weight: 850 !important; }

    /* Freeze row headers in all tables */
    .company-growth-table th:first-child,
    .bank-growth-table th:first-child,
    .ratio-table th.col-sticky,
    .ratio-table td.col-sticky,
    .sh-th-category,
    .sh-td-category,
    .about-peer-table th:first-child,
    .about-peer-table td:first-child {
      position: sticky !important;
      left: 0 !important;
      z-index: 5 !important;
      background: #ffffff !important;
    }

    /* Recharts Chart Grid & Card Styling */
    .chart-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 20px !important;
      width: 100% !important;
      margin-top: 14px !important;
    }
    .chart-card,
    .chart-card-bright {
      background: #ffffff !important;
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 18px !important;
      padding: 18px 20px 14px !important;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.07) !important;
      overflow: hidden !important;
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
    }
    .chart-snapshot {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 12px !important;
      padding: 8px 6px !important;
      height: 290px !important;
      position: relative !important;
      overflow: hidden !important;
    }

    /* Table Responsiveness: Horizontal scrolling with smooth touch support */
    .about-table-scroll,
    .company-table-scroll,
    .bank-growth-scroll,
    .peer-table-scroll-wrap,
    .sh-table-scroll-wrap,
    .ratio-table-wrapper,
    .company-source-scroll,
    .bank-raw-scroll,
    .checks-table-wrapper,
    .table-container {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      display: block !important;
    }

    /* Ultra-Compact Shareholding Tables (Quarterly & Yearly) so all recent periods fit on screen & print */
    .sh-table-card {
      border-radius: 10px !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05) !important;
      background: #ffffff !important;
      border: 1px solid #e2e8f0 !important;
      overflow: hidden !important;
      margin-bottom: 20px !important;
    }
    .sh-table-header {
      padding: 10px 14px !important;
      background: #f8fafc !important;
      border-bottom: 1px solid #e2e8f0 !important;
    }
    .sh-table-title {
      font-size: 15px !important;
      color: #0f172a !important;
      margin: 1px 0 !important;
    }
    .sh-table-subtitle {
      font-size: 11px !important;
      color: #64748b !important;
    }
    .sh-kicker {
      font-size: 9px !important;
      color: #0284c7 !important;
      letter-spacing: 0.8px !important;
    }
    .sh-col-count-pill {
      font-size: 9.5px !important;
      padding: 2px 7px !important;
      background: #e2e8f0 !important;
      color: #334155 !important;
    }
    .sh-table-scroll-wrap {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }
    .sh-data-table {
      width: 100% !important;
      min-width: 0 !important;
      table-layout: auto !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
      font-size: 11px !important;
    }
    .sh-th-category,
    .sh-td-category {
      min-width: 120px !important;
      max-width: 155px !important;
      width: 135px !important;
      padding: 6px 8px !important;
      background: #f8fafc !important;
      color: #0f172a !important;
      border-bottom: 1px solid #e2e8f0 !important;
      border-right: 1px solid #e2e8f0 !important;
      box-shadow: 1px 0 3px rgba(0, 0, 0, 0.05) !important;
    }
    .sh-cat-badge {
      padding: 2.5px 6px !important;
      font-size: 10.5px !important;
      gap: 4px !important;
      border-radius: 6px !important;
      box-shadow: none !important;
      font-weight: 750 !important;
    }
    .sh-cat-icon {
      width: 11px !important;
      height: 11px !important;
    }
    .sh-th-period {
      min-width: 48px !important;
      max-width: 76px !important;
      padding: 5px 4px !important;
      text-align: right !important;
      background: #f1f5f9 !important;
      color: #1e293b !important;
      border-bottom: 1px solid #cbd5e1 !important;
      border-right: 1px solid #f1f5f9 !important;
    }
    .sh-period-text {
      font-size: 10px !important;
      font-weight: 800 !important;
      letter-spacing: -0.2px !important;
      display: block !important;
      white-space: nowrap !important;
    }
    .sh-latest-tag {
      font-size: 7.5px !important;
      padding: 0 3px !important;
      letter-spacing: 0.3px !important;
      border-radius: 3px !important;
      line-height: 1.1 !important;
      margin-top: 1px !important;
    }
    .sh-td-cell {
      min-width: 48px !important;
      max-width: 76px !important;
      padding: 4px 4px !important;
      text-align: right !important;
      border-bottom: 1px solid #e2e8f0 !important;
      border-right: 1px solid #f8fafc !important;
    }
    .sh-cell-content {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-end !important;
      justify-content: center !important;
      gap: 1px !important;
      line-height: 1.1 !important;
    }
    .sh-cell-value {
      font-size: 11px !important;
      font-weight: 750 !important;
      font-family: 'DM Mono', monospace !important;
      color: #0f172a !important;
      white-space: nowrap !important;
    }
    .sh-delta-chip {
      font-size: 8px !important;
      padding: 1px 3px !important;
      border-radius: 3px !important;
      gap: 1px !important;
      line-height: 1 !important;
      white-space: nowrap !important;
      font-weight: 750 !important;
      box-shadow: none !important;
    }
    .sh-delta-chip svg {
      width: 7.5px !important;
      height: 7.5px !important;
    }
    .delta-zero {
      color: #0369a1 !important;
      background: #e0f2fe !important;
      border: 1px solid #bae6fd !important;
    }
    .delta-up {
      color: #15803d !important;
      background: #dcfce7 !important;
      border: 1px solid #bbf7d0 !important;
    }
    .delta-down {
      color: #b91c1c !important;
      background: #fee2e2 !important;
      border: 1px solid #fecaca !important;
    }

    /* Responsive Grid Breakpoints */
    @media (max-width: 1024px) {
      .chart-grid {
        grid-template-columns: 1fr !important;
        gap: 20px !important;
      }
      .company-summary-grid,
      .bank-summary-grid {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 768px) {
      .web-report-container {
        padding: 14px 10px 50px !important;
      }
      .web-report-nav-inner {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 10px !important;
      }
      .web-report-nav-links {
        width: 100% !important;
        display: flex !important;
        justify-content: space-between !important;
      }
      .web-report-nav-links a {
        flex: 1 1 auto !important;
        text-align: center !important;
        padding: 5px 6px !important;
        font-size: 11px !important;
      }
      .sh-th-category,
      .sh-td-category {
        min-width: 110px !important;
        max-width: 135px !important;
        width: 125px !important;
        padding: 8px 8px !important;
        white-space: normal !important;
        word-break: break-word !important;
        line-height: 1.25 !important;
      }
      .sh-cat-badge {
        font-size: 11.5px !important;
        padding: 4px 6px !important;
        white-space: normal !important;
        word-break: break-word !important;
      }
    }

    /* Print optimization if user prints HTML directly */
    @media print {
      .web-report-sticky-nav {
        display: none !important;
      }
      .web-report-container {
        padding: 0 !important;
        max-width: 100% !important;
        margin: 0 !important;
      }
      .sh-table-scroll-wrap {
        overflow: visible !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .sh-data-table {
        width: 100% !important;
        min-width: 0 !important;
        table-layout: auto !important;
        font-size: 9px !important;
      }
      .sh-th-category,
      .sh-td-category {
        min-width: 90px !important;
        max-width: 115px !important;
        width: 105px !important;
        padding: 3px 4px !important;
      }
      .sh-cat-badge {
        font-size: 8.5px !important;
        padding: 1.5px 4px !important;
      }
      .sh-cat-icon {
        width: 9px !important;
        height: 9px !important;
      }
      .sh-th-period,
      .sh-td-cell {
        min-width: 36px !important;
        max-width: none !important;
        padding: 3px 2px !important;
      }
      .sh-period-text {
        font-size: 8.5px !important;
      }
      .sh-latest-tag {
        font-size: 6.5px !important;
      }
      .sh-cell-value {
        font-size: 9px !important;
      }
      .sh-delta-chip {
        font-size: 7px !important;
        padding: 0 1.5px !important;
      }
      .sh-delta-chip svg {
        width: 6.5px !important;
        height: 6.5px !important;
      }
      @page {
        size: landscape;
        margin: 6mm;
      }
    }
  `

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<title>${data.companyName.replace(/</g, '&lt;')} - Web Report</title>
<style>${activeCss}</style>
<style>${webReportCss}</style>
</head>
<body>
  <header class="web-report-sticky-nav">
    <div class="web-report-nav-inner">
      <div class="web-report-nav-brand">
        <span class="web-report-nav-dot"></span>
        <span>${data.companyName.replace(/</g, '&lt;')}</span>
        <span class="web-report-nav-pill">${data.mode === 'bank' ? 'BANK ANALYSIS' : 'EQUITY ANALYSIS'}</span>
      </div>
      <nav class="web-report-nav-links">
        <a href="#about-section-anchor">About</a>
        <a href="#comparison-section-anchor">Comparison</a>
        <a href="#overview-section-anchor">Overview</a>
        <a href="#quarterly-ratio-anchor">Quarterly-Ratio</a>
        <a href="#yearly-ratio-anchor">Yearly-ratio</a>
        <a href="#plots-section-anchor">Charts</a>
        <a href="#holding-section-anchor">Holding-%</a>
        <a href="#tables-section-anchor">Data Sheet</a>
        <a href="#checks-section-anchor">Data Checks</a>
        <a href="#top" class="top-link">↑ Top</a>
      </nav>
    </div>
  </header>
  <main class="web-report-container">
    <div class="app-shell ${modeClass} theme-bright web-report-stage">
      ${clone.outerHTML}
    </div>
  </main>
</body>
</html>`
}

export async function exportStandaloneHtmlReport({
  data,
  button,
  stageElement,
}: {
  data: FinancialData
  button: HTMLButtonElement
  stageElement: HTMLElement
}): Promise<void> {
  const oldHtml = button.innerHTML
  button.disabled = true
  button.textContent = 'Saving Web report…'
  const filename = `${safeName(data.companyName)}_Complete_Report.html`
  try {
    await waitForPrintStageReady(stageElement)
    const html = buildStandaloneWebReportHtml(stageElement, data)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    triggerBlobDownload(blob, filename)
  } finally {
    button.disabled = false
    button.innerHTML = oldHtml
  }
}
