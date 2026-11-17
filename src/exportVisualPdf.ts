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

  const deadline = performance.now() + 1200
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

  // Set section anchor IDs for smooth quick-nav
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

  // Remove desktop-only action bars and static tooltip overlays in exported web report
  Array.from(clone.querySelectorAll<HTMLElement>('.company-actions, .theme-toggle-button, .about-refresh-btn, .about-key-card, .settings-btn, .holding-btn-refresh, .peer-refresh-btn, .recharts-tooltip-wrapper')).forEach(el => el.remove())

  // Ensure 100% fluid, responsive SVG charts across all screen widths (ONLY the main chart SVG, never legend icons)
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

  // Format Recharts containers to fixed 286px height so the internal coordinates & legend align seamlessly
  Array.from(clone.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper')).forEach(el => {
    el.style.width = '100%'
    el.style.height = '286px'
    el.style.position = 'relative'
  })

  // Format legend cleanly: icons stay compact 14px, items wrap gracefully, centered below chart plot
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
      !parent.classList.contains('about-peer-wrap') &&
      !parent.classList.contains('about-ratio-wrap') &&
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
      color: #000000 !important;
      font-family: Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
    }

    /* Fluid Outer Container */
    .web-report-container {
      max-width: 1620px;
      margin: 0 auto;
      padding: 20px clamp(12px, 2vw, 24px) 80px;
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
      gap: 32px !important;
    }

    /* Hide any desktop-only controls in exported HTML */
    .company-actions,
    .topbar,
    .theme-toggle-button,
    .settings-btn,
    .about-refresh-btn,
    .about-actions,
    .about-key-card,
    .chart-actions,
    .recharts-tooltip-wrapper {
      display: none !important;
    }

    /* Full Fidelity Bright Mode Theme Rules */
    .app-shell.theme-bright,
    .theme-bright,
    .web-report-stage {
      background: transparent !important;
      color: #000000 !important;
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
    .chart-heading {
      margin-bottom: 10px !important;
    }
    .chart-heading h3 {
      color: #000000 !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      margin: 4px 0 2px !important;
    }
    .chart-heading p {
      color: #334155 !important;
      font-size: 11.5px !important;
      margin: 0 !important;
    }
    .chart-heading .eyebrow {
      color: #0369a1 !important;
      font-weight: 700 !important;
      font-size: 10px !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
    }
    .chart-heading-actions {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      flex-shrink: 0 !important;
    }
    .chart-reset-range-btn,
    .chart-slider-toggle-btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      font-family: 'DM Mono', monospace !important;
      padding: 3px 8px !important;
      border-radius: 7px !important;
      border: 1px solid #cbd5e1 !important;
      background: #f1f5f9 !important;
      color: #475569 !important;
      cursor: pointer !important;
      user-select: none !important;
      transition: all 0.15s ease !important;
    }
    .chart-reset-range-btn {
      background: #fef3c7 !important;
      color: #b45309 !important;
      border-color: #fde68a !important;
    }
    .chart-reset-range-btn:hover {
      background: #fde68a !important;
      color: #92400e !important;
    }
    .chart-slider-toggle-btn:hover,
    .chart-slider-toggle-btn.active {
      background: #e0f2fe !important;
      color: #0284c7 !important;
      border-color: #bae6fd !important;
    }
    .chart-sliders-box {
      margin-top: 10px !important;
      padding: 8px 12px !important;
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 12px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 7px !important;
      box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.04) !important;
    }
    .chart-slider-row {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      width: 100% !important;
    }
    .chart-slider-meta {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 56px !important;
      max-width: 65px !important;
      flex-shrink: 0 !important;
    }
    .chart-slider-axis-badge {
      font-size: 10px !important;
      font-weight: 800 !important;
      font-family: 'DM Mono', monospace !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
      color: #ffffff !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      flex-shrink: 0 !important;
    }
    .chart-slider-axis-badge.axis-x {
      background: #0284c7 !important;
    }
    .chart-slider-axis-badge.axis-y {
      background: #059669 !important;
    }
    .chart-slider-range-text {
      font-size: 11px !important;
      font-weight: 700 !important;
      font-family: 'DM Mono', monospace !important;
      color: #1e293b !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .dual-slider-container {
      position: relative !important;
      flex: 1 !important;
      height: 24px !important;
      display: flex !important;
      align-items: center !important;
      touch-action: none !important;
    }
    .dual-slider-track {
      position: absolute !important;
      width: 100% !important;
      height: 6px !important;
      border-radius: 3px !important;
      background: #e2e8f0 !important;
    }
    .dual-slider-fill {
      position: absolute !important;
      height: 6px !important;
      border-radius: 3px !important;
      background: #0284c7 !important;
      z-index: 2 !important;
      pointer-events: none !important;
    }
    .dual-slider-input {
      position: absolute !important;
      width: 100% !important;
      height: 6px !important;
      background: transparent !important;
      -webkit-appearance: none !important;
      appearance: none !important;
      pointer-events: none !important;
      margin: 0 !important;
      outline: none !important;
    }
    .dual-slider-input::-webkit-slider-thumb {
      pointer-events: auto !important;
      -webkit-appearance: none !important;
      appearance: none !important;
      width: 16px !important;
      height: 16px !important;
      border-radius: 50% !important;
      background: #0284c7 !important;
      border: 2px solid #ffffff !important;
      cursor: grab !important;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25) !important;
      transition: transform 0.12s ease !important;
    }
    .dual-slider-input.slider-max::-webkit-slider-thumb {
      background: #059669 !important;
      border-color: #ffffff !important;
    }
    .dual-slider-input::-webkit-slider-thumb:hover {
      transform: scale(1.2) !important;
    }
    .dual-slider-input::-webkit-slider-thumb:active {
      cursor: grabbing !important;
      transform: scale(1.28) !important;
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
    .chart-snapshot .recharts-responsive-container,
    .chart-snapshot .recharts-wrapper {
      width: 100% !important;
      height: 286px !important;
      position: relative !important;
    }
    .chart-snapshot .recharts-wrapper > svg {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
    }
    .recharts-legend-wrapper {
      position: absolute !important;
      bottom: 0px !important;
      left: 0px !important;
      width: 100% !important;
      text-align: center !important;
      height: auto !important;
      z-index: 5 !important;
    }
    .recharts-legend-item {
      display: inline-flex !important;
      align-items: center !important;
      font-size: 12px !important;
      margin: 0 8px !important;
      color: #000000 !important;
      font-weight: 600 !important;
    }
    .recharts-legend-item svg {
      width: 14px !important;
      height: 14px !important;
      display: inline-block !important;
      vertical-align: middle !important;
      margin-right: 4px !important;
    }

    /* Light green table headers with dark deep blue text for Peers & Ratios */
    .theme-bright .about-peer-table thead,
    .theme-bright .about-peer-table thead th,
    .theme-bright .about-ratio-table thead,
    .theme-bright .about-ratio-table thead th,
    .theme-bright .ratio-table thead th {
      position: sticky !important;
      top: 0 !important;
      z-index: 15 !important;
      background: #dcfce7 !important;
      color: #0f2b5c !important;
      border-bottom: 2px solid #86efac !important;
      font-weight: 800 !important;
    }
    .theme-bright .about-peer-table thead th:first-child,
    .theme-bright .about-ratio-table thead th:first-child,
    .theme-bright .ratio-table thead th.col-sticky {
      position: sticky !important;
      top: 0 !important;
      left: 0 !important;
      z-index: 30 !important;
      background: #dcfce7 !important;
      color: #0f2b5c !important;
      border-bottom: 2px solid #86efac !important;
      border-right: 1.5px solid #86efac !important;
      font-weight: 800 !important;
    }
    .theme-bright .about-ratio-table thead th.about-ratio-ttm-col,
    .theme-bright .ratio-table thead th.col-header-ttm {
      background: #bbf7d0 !important;
      color: #0f2b5c !important;
      border-bottom: 2px solid #4ade80 !important;
      font-weight: 800 !important;
    }
    .theme-bright .about-peer-table td,
    .theme-bright .about-ratio-table td,
    .theme-bright .ratio-table td {
      color: #000000 !important;
    }
    .theme-bright .about-peer-table th:first-child,
    .theme-bright .about-peer-table td:first-child,
    .theme-bright .about-ratio-table td.col-sticky,
    .theme-bright .ratio-table td.col-sticky {
      position: sticky !important;
      left: 0 !important;
      z-index: 8 !important;
      min-width: 175px !important;
      max-width: 230px !important;
      width: 200px !important;
      white-space: normal !important;
      background: #ffffff !important;
      border-right: 1.5px solid #cbd5e1 !important;
      box-shadow: 2px 0 6px rgba(0, 0, 0, 0.06) !important;
    }
    .theme-bright .about-peer-table tbody tr:hover td:first-child,
    .theme-bright .about-ratio-table tbody tr:hover td.col-sticky,
    .theme-bright .ratio-table tbody tr:hover td.col-sticky {
      background: #f1f5f9 !important;
    }

    /* Table Responsiveness: Horizontal & Vertical scrolling with sticky frozen headers */
    .about-table-scroll,
    .company-table-scroll,
    .bank-growth-scroll,
    .about-peer-wrap,
    .about-ratio-wrap,
    .peer-table-scroll-wrap,
    .sh-table-scroll-wrap,
    .ratio-table-wrapper,
    .company-source-scroll,
    .bank-source-scroll,
    .checks-table-wrapper,
    .table-container {
      width: 100% !important;
      max-width: 100% !important;
      overflow: auto !important;
      -webkit-overflow-scrolling: touch !important;
      display: block !important;
      position: relative !important;
      max-height: clamp(380px, 72vh, 760px) !important;
    }

    /* Rock-solid separate table layout for sticky freezing */
    .about-peer-table,
    .about-ratio-table,
    .ratio-table,
    .sh-data-table,
    .company-growth-table,
    .bank-growth-table {
      border-collapse: separate !important;
      border-spacing: 0 !important;
    }

    /* Pinned Sticky Column Headers (Top) */
    .about-peer-table thead th,
    .about-ratio-table thead th,
    .ratio-table thead th,
    .sh-data-table thead th,
    .company-growth-table thead th,
    .bank-growth-table thead th {
      position: sticky !important;
      top: 0 !important;
      z-index: 15 !important;
    }

    /* Pinned Sticky Row Headers (Left) */
    .about-peer-table tbody td:first-child,
    .about-peer-table tfoot td:first-child,
    .about-ratio-table tbody td.col-sticky,
    .ratio-table tbody td.col-sticky,
    .sh-data-table tbody .sh-td-category,
    .company-growth-table tbody th,
    .bank-growth-table tbody th {
      position: sticky !important;
      left: 0 !important;
      z-index: 8 !important;
    }

    /* Top-Left Intersection Corner Cells */
    .about-peer-table thead th:first-child,
    .about-ratio-table thead th:first-child,
    .about-ratio-table thead th.col-sticky,
    .ratio-table thead th.col-sticky,
    .sh-data-table thead th.sh-th-category,
    .company-growth-table thead th:first-child,
    .bank-growth-table thead th:first-child {
      position: sticky !important;
      top: 0 !important;
      left: 0 !important;
      z-index: 30 !important;
    }

    /* Ultra-Compact Shareholding Tables (Quarterly & Yearly) so all recent periods fit on screen & print */
    .holding-page-container {
      padding: 4px 0 24px !important;
      width: 100% !important;
      max-width: 100% !important;
      gap: 16px !important;
    }
    .sh-table-card {
      border-radius: 10px !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05) !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      overflow: hidden !important;
      margin-bottom: 20px !important;
      width: 100% !important;
    }
    .sh-table-header {
      padding: 8px 12px !important;
      background: #f8fafc !important;
      border-bottom: 1px solid #e2e8f0 !important;
    }
    .sh-table-title {
      font-size: 14px !important;
      color: #0f172a !important;
      margin: 1px 0 !important;
      font-weight: 800 !important;
    }
    .sh-table-subtitle {
      font-size: 10px !important;
      color: #64748b !important;
    }
    .sh-kicker {
      font-size: 8px !important;
      color: #0284c7 !important;
      letter-spacing: 0.8px !important;
    }
    .sh-col-count-pill {
      font-size: 8.5px !important;
      padding: 2px 6px !important;
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
      font-size: 13px !important;
    }
    .sh-th-category,
    .sh-td-category {
      position: sticky !important;
      left: 0 !important;
      z-index: 10 !important;
      min-width: 125px !important;
      max-width: 160px !important;
      width: 140px !important;
      padding: 6px 8px !important;
      background: #f8fafc !important;
      color: #0f172a !important;
      border-bottom: 1px solid #e2e8f0 !important;
      border-right: 1.5px solid #cbd5e1 !important;
      box-shadow: 2px 0 5px rgba(0, 0, 0, 0.05) !important;
    }
    .sh-cat-badge {
      padding: 3px 7px !important;
      font-size: 12px !important;
      gap: 5px !important;
      border-radius: 5px !important;
      box-shadow: none !important;
      font-weight: 750 !important;
    }
    .sh-cat-icon {
      width: 12px !important;
      height: 12px !important;
    }
    .sh-th-period {
      min-width: 48px !important;
      max-width: none !important;
      padding: 5px 4px !important;
      text-align: right !important;
      background: #f1f5f9 !important;
      color: #1e293b !important;
      border-bottom: 1px solid #cbd5e1 !important;
      border-right: 1px solid #f1f5f9 !important;
    }
    .sh-period-text {
      font-size: 11px !important;
      font-weight: 800 !important;
      letter-spacing: -0.2px !important;
      display: block !important;
      white-space: nowrap !important;
    }
    .sh-latest-tag {
      font-size: 8px !important;
      padding: 1px 3px !important;
      letter-spacing: 0.2px !important;
      border-radius: 2px !important;
      line-height: 1 !important;
      margin-top: 1px !important;
      display: inline-block !important;
    }
    .sh-td-cell {
      min-width: 48px !important;
      max-width: none !important;
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
      gap: 1.5px !important;
      line-height: 1.15 !important;
    }
    .sh-cell-value {
      font-size: 12.5px !important;
      font-weight: 800 !important;
      font-family: 'DM Mono', monospace !important;
      color: #0f172a !important;
      white-space: nowrap !important;
    }
    .sh-delta-chip {
      font-size: 9px !important;
      padding: 1px 3px !important;
      border-radius: 3px !important;
      gap: 2px !important;
      line-height: 1.1 !important;
      white-space: nowrap !important;
      font-weight: 750 !important;
      box-shadow: none !important;
    }
    .sh-delta-chip svg {
      width: 8px !important;
      height: 8px !important;
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

    .company-data-sheet,
    .bank-source-page {
      background: #ffffff !important;
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 20px !important;
      padding: clamp(16px, 2.5vw, 28px) !important;
      box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.07) !important;
    }
    .company-sheet-frame,
    .bank-sheet-frame {
      border: 1.5px solid #cbd5e1 !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    .company-source-table,
    .bank-source-table {
      width: max-content !important;
      min-width: 100% !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
    }

    /* Citation Source Spotlight Highlighting */
    @keyframes sourceHighlightPulse {
      0% {
        box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.6), 0 8px 24px rgba(217, 119, 6, 0.35);
        transform: scale(1.02);
      }
      50% {
        box-shadow: 0 0 0 8px rgba(217, 119, 6, 0.4), 0 14px 34px rgba(217, 119, 6, 0.45);
        transform: scale(1.03);
      }
      100% {
        box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.6), 0 8px 24px rgba(217, 119, 6, 0.35);
        transform: scale(1.02);
      }
    }
    .about-source-item:target,
    .about-source-highlight {
      position: relative !important;
      z-index: 10 !important;
      border: 2.5px solid #d97706 !important;
      border-left: 8px solid #b45309 !important;
      background: #fef08a !important;
      box-shadow: 0 0 0 6px rgba(217, 119, 6, 0.4), 0 12px 28px rgba(217, 119, 6, 0.25) !important;
      animation: sourceHighlightPulse 1.6s ease-in-out infinite alternate !important;
    }
    .about-source-item:target .about-source-id,
    .about-source-highlight .about-source-id {
      background: #b45309 !important;
      color: #ffffff !important;
      border-color: #78350f !important;
      font-weight: 800 !important;
    }
    .about-source-item:target .about-source-title,
    .about-source-highlight .about-source-title {
      color: #78350f !important;
      font-weight: 800 !important;
    }
    .about-source-item:target .about-source-link,
    .about-source-highlight .about-source-link {
      color: #0369a1 !important;
      font-weight: 700 !important;
    }

    /* Grid Breakpoints: 100% Responsive from Mobile to 4K */
    @media (max-width: 1024px) {
      .chart-grid {
        grid-template-columns: 1fr !important;
        gap: 20px !important;
      }
      .company-summary-grid,
      .bank-summary-grid {
        grid-template-columns: 1fr !important;
      }
      .about-summary-grid,
      .about-dimensions-grid {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 768px) {
      .web-report-container {
        padding: 14px 10px 50px !important;
      }
      .company-banner {
        padding: 16px !important;
        border-radius: 16px !important;
      }
      .company-title-wrap {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 12px !important;
      }
      .company-banner h1 {
        font-size: 22px !important;
      }
      .company-snapshot-grid,
      .bank-snapshot-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
        gap: 12px !important;
      }
      .about-metrics-strip {
        grid-template-columns: 1fr !important;
      }
      .about-peer-table,
      .about-ratio-table,
      .company-growth-table,
      .bank-growth-table {
        font-size: 11.5px !important;
      }
      .about-peer-table th,
      .about-peer-table td,
      .about-ratio-table th,
      .about-ratio-table td {
        padding: 6px 8px !important;
      }
    }

    @media (max-width: 480px) {
      .company-snapshot-grid,
      .bank-snapshot-grid {
        grid-template-columns: 1fr !important;
      }
      .per-share-grid {
        grid-template-columns: 1fr !important;
      }
      .about-finpos-grid {
        grid-template-columns: 1fr !important;
      }
    }

    /* Print optimization if user prints HTML directly */
    @media print {
      .web-report-container {
        padding: 0 !important;
        max-width: 100% !important;
        margin: 0 !important;
      }
      .about-table-scroll,
      .company-table-scroll,
      .bank-growth-scroll,
      .about-peer-wrap,
      .about-ratio-wrap,
      .peer-table-scroll-wrap,
      .sh-table-scroll-wrap,
      .ratio-table-wrapper,
      .company-source-scroll,
      .bank-source-scroll,
      .checks-table-wrapper,
      .table-container {
        max-height: none !important;
        overflow: visible !important;
        width: 100% !important;
        max-width: 100% !important;
      }
      .about-peer-table th,
      .about-peer-table td,
      .about-ratio-table th,
      .about-ratio-table td,
      .ratio-table th,
      .ratio-table td,
      .sh-data-table th,
      .sh-data-table td,
      .company-growth-table th,
      .company-growth-table td,
      .bank-growth-table th,
      .bank-growth-table td {
        position: static !important;
      }
      .sh-data-table {
        width: 100% !important;
        min-width: 0 !important;
        table-layout: auto !important;
        font-size: 9px !important;
      }
      .sh-th-category,
      .sh-td-category {
        min-width: 110px !important;
        max-width: 140px !important;
        width: 125px !important;
        padding: 4px 6px !important;
      }
      .sh-cat-badge {
        font-size: 10.5px !important;
        padding: 2px 5px !important;
      }
      .sh-cat-icon {
        width: 11px !important;
        height: 11px !important;
      }
      .sh-th-period,
      .sh-td-cell {
        min-width: 44px !important;
        max-width: none !important;
        padding: 4px 3px !important;
      }
      .sh-period-text {
        font-size: 10px !important;
      }
      .sh-latest-tag {
        font-size: 7.5px !important;
      }
      .sh-cell-value {
        font-size: 11.5px !important;
        font-weight: 800 !important;
      }
      .sh-delta-chip {
        font-size: 8.5px !important;
        padding: 0.5px 2px !important;
      }
      .sh-delta-chip svg {
        width: 7.5px !important;
        height: 7.5px !important;
      }
      @page {
        size: landscape;
        margin: 6mm;
      }
    }
  `

  const formatQuarterLabel = (period?: string): string => {
    if (!period) return 'Sep, 2026'
    const p = period.trim()
    const qMatch = p.match(/Q([1-4])\s*(?:FY)?\s*(?:20)?(\d{2,4})/i)
    if (qMatch) {
      const qNum = parseInt(qMatch[1], 10)
      let fy = parseInt(qMatch[2], 10)
      if (fy < 100) fy += 2000
      if (qNum === 1) return `June, ${fy - 1}`
      if (qNum === 2) return `Sep, ${fy - 1}`
      if (qNum === 3) return `Dec, ${fy - 1}`
      if (qNum === 4) return `March, ${fy}`
    }
    const mMatch = p.match(/([A-Za-z]{3,9})\s*[\'’]?\s*(?:20)?(\d{2,4})/)
    if (mMatch) {
      const m = mMatch[1].toLowerCase()
      let yr = parseInt(mMatch[2], 10)
      if (yr < 100) yr += 2000
      const nameMap: Record<string, string> = {
        jan: 'Jan', feb: 'Feb', mar: 'March', apr: 'April', may: 'May', jun: 'June',
        jul: 'July', aug: 'August', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec',
      }
      const prefix = m.slice(0, 3)
      const dispMonth = nameMap[prefix] || (m.charAt(0).toUpperCase() + m.slice(1))
      return `${dispMonth}, ${yr}`
    }
    return p
  }

  const lastPeriod = data.quarterly && data.quarterly.length > 0
    ? data.quarterly[data.quarterly.length - 1].period
    : ''
  const lastQuarterStr = formatQuarterLabel(lastPeriod)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="ledger-last-quarter" content="${lastQuarterStr}"/>
<title>${data.companyName.replace(/</g, '&lt;')} - Web Report</title>
<style>${activeCss}</style>
<style>${webReportCss}</style>
</head>
<body>
  <main class="web-report-container">
    <div class="app-shell ${modeClass} theme-bright web-report-stage">
      ${clone.outerHTML}
    </div>
  </main>
  <script>
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.about-citation-badge');
      if (btn) {
        var match = (btn.textContent || '').match(/\\d+/);
        if (match) {
          var id = match[0];
          var el = document.getElementById('about-source-' + id);
          if (el) {
            document.querySelectorAll('.about-source-highlight').forEach(function(node) {
              node.classList.remove('about-source-highlight');
            });
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('about-source-highlight');
            setTimeout(function() {
              el.classList.remove('about-source-highlight');
            }, 4500);
          }
        }
      }
    });

    // Chart Dual-Range Sliders (X-Axis & Y-Axis Zoom)
    (function() {
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
          '<div class="chart-slider-meta"><span class="chart-slider-axis-badge axis-x">X-axis</span></div>' +
          '<div class="dual-slider-container"><div class="dual-slider-track"></div><div class="dual-slider-fill" style="left:0%;width:100%;"></div>' +
          '<input type="range" min="0" max="' + (totalPeriods - 1) + '" value="0" class="dual-slider-input slider-min">' +
          '<input type="range" min="0" max="' + (totalPeriods - 1) + '" value="' + (totalPeriods - 1) + '" class="dual-slider-input slider-max">' +
          '</div></div>' +
          '<div class="chart-slider-row">' +
          '<div class="chart-slider-meta"><span class="chart-slider-axis-badge axis-y">Y-axis</span></div>' +
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
        if (yMin > yMax - 1) { yMin = yMax - 1; yMinInput.value = yMin; }

        // Update fill bars
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

        // Check if adjusted
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

        // X scaling
        var fracX = (xMax - xMin) / xSpan;
        var scaleX = fracX > 0 ? (1 / fracX) : 1;
        var origStartX = plotX + (xMin / xSpan) * plotW;
        var tx = plotX - origStartX * scaleX;

        // Y scaling with high dynamic range and enhanced play
        var fracY = Math.max(0.01, (yMax - yMin) / 100);
        var scaleY = 1 / Math.pow(fracY, 2.8);
        var normLow = yMin / 100;
        var ty = baselineY * (1 - scaleY) + (normLow * plotH * scaleY * 0.9);

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

        // X Axis ticks alignment & clipping
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

        // Y Axis ticks scaling
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
  </script>
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
