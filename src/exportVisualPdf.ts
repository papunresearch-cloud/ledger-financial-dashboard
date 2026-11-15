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
    }

    /* Print optimization if user prints HTML directly */
    @media print {
      .web-report-sticky-nav {
        display: none !important;
      }
      .web-report-container {
        padding: 0 !important;
        max-width: 100% !important;
      }
      @page {
        size: landscape;
        margin: 8mm;
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
