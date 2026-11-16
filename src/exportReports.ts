import type ExcelJS from 'exceljs'
import type { AboutState, BankData, FinancialData } from './types'
import {
  getPeerMetricColumns,
  getPeerTableHeaders,
  resolvePeerComparison,
  type NormalizedPeerRow,
} from './peerComparison'
import { computeQuarterlyRatios, computeYearlyRatios } from './ratioCalculations'
import { RATIO_DEFINITIONS } from './DataChecksView'
import { mergeBrokenLines } from './AboutSection'

type CapturedChart = { title: string; dataUrl: string }
const safeName = (value: string) => value.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'COMPANY'

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

const safeTextVal = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(safeTextVal).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const sub = safeTextVal(v)
        return sub ? `${k}: ${sub}` : ''
      })
      .filter(Boolean)
      .join('; ')
  }
  return ''
}

const stripEmphasis = (txt: string) =>
  txt
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/<\/?u>/gi, '')

const cleanMultilineCite = (text: unknown) =>
  stripEmphasis(safeTextVal(text))
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[+([\d\s,]+)\]+/g, '[$1]')
    .trim()

const estimateRowHeight = (text: string, charsPerLine = 92, base = 22) => {
  const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  return Math.max(base, Math.min(409, lines * 14 + 10))
}

const excelValue = (value: unknown): string | number | boolean | Date | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

async function captureCharts(): Promise<CapturedChart[]> {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-export-chart-card]'))
  const captured: CapturedChart[] = []
  const svgNs = 'http://www.w3.org/2000/svg'

  for (const card of cards) {
    const snapshot = card.querySelector<HTMLElement>('.chart-snapshot')
    if (!snapshot) continue
    const bounds = snapshot.getBoundingClientRect()
    const width = Math.max(1, Math.round(bounds.width))
    const height = Math.max(1, Math.round(bounds.height))
    const darkChart = card.classList.contains('chart-card-dark')
    const background = darkChart ? '#10211e' : '#ffffff'
    const sourceSvg = snapshot.querySelector('svg')
    const svg = sourceSvg
      ? sourceSvg.cloneNode(true) as SVGSVGElement
      : document.createElementNS(svgNs, 'svg')

    svg.setAttribute('xmlns', svgNs)
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.style.width = `${width}px`
    svg.style.height = `${height}px`

    const backgroundRect = document.createElementNS(svgNs, 'rect')
    backgroundRect.setAttribute('width', '100%')
    backgroundRect.setAttribute('height', '100%')
    backgroundRect.setAttribute('fill', background)
    svg.insertBefore(backgroundRect, svg.firstChild)

    if (!sourceSvg) {
      const emptyText = snapshot.querySelector('.chart-empty strong')?.textContent?.trim() ?? 'Not enough data to plot'
      const label = document.createElementNS(svgNs, 'text')
      label.setAttribute('x', String(width / 2))
      label.setAttribute('y', String(height / 2))
      label.setAttribute('text-anchor', 'middle')
      label.setAttribute('dominant-baseline', 'middle')
      label.setAttribute('fill', darkChart ? '#c5ddd3' : '#687a70')
      label.setAttribute('font-family', 'Arial, sans-serif')
      label.setAttribute('font-size', '14')
      label.textContent = emptyText
      svg.appendChild(label)
    } else {
      const legendItems = Array.from(snapshot.querySelectorAll<HTMLElement>('.recharts-legend-item'))
      for (const item of legendItems) {
        const itemBounds = item.getBoundingClientRect()
        const icon = item.querySelector<SVGElement>('svg path, svg line, svg circle')
        const iconColor = icon?.getAttribute('fill') && icon.getAttribute('fill') !== 'none'
          ? icon.getAttribute('fill')!
          : icon?.getAttribute('stroke') ?? '#168b72'
        const textColor = getComputedStyle(item).color
        const x = Math.max(6, itemBounds.left - bounds.left)
        const y = itemBounds.top - bounds.top + itemBounds.height / 2
        const marker = document.createElementNS(svgNs, 'circle')
        marker.setAttribute('cx', String(x + 5))
        marker.setAttribute('cy', String(y))
        marker.setAttribute('r', '4')
        marker.setAttribute('fill', iconColor)
        svg.appendChild(marker)
        const label = document.createElementNS(svgNs, 'text')
        label.setAttribute('x', String(x + 13))
        label.setAttribute('y', String(y))
        label.setAttribute('dominant-baseline', 'middle')
        label.setAttribute('fill', textColor)
        label.setAttribute('font-family', 'Arial, sans-serif')
        label.setAttribute('font-size', '11')
        label.textContent = item.textContent?.trim() ?? ''
        svg.appendChild(label)
      }
    }

    const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    try {
      const image = new Image()
      image.src = svgUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('A chart could not be rendered for export.'))
      })
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable for chart export.')
      context.fillStyle = background
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      captured.push({
        title: card.querySelector('h3')?.textContent?.trim() ?? 'Financial chart',
        dataUrl: canvas.toDataURL('image/png'),
      })
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }
  return captured
}

const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '102D2B' } }
const subHeaderFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '164E48' } }
const paleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'EAF2ED' } }

function styleHeader(row: ExcelJS.Row) {
  row.height = 25
  row.eachCell(cell => {
    cell.fill = headerFill
    cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFF' }, size: 10 }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'D7A743' } } }
  })
}

// -------------------------------------------------------------
// 1. ABOUT & INSIGHTS EXCEL SHEET
// -------------------------------------------------------------
function appendAboutExcelSheets(book: ExcelJS.Workbook, companyName: string, about?: AboutState | null) {
  const data = about?.data || (about?.sources as unknown as import('./types').ScreenerAboutData)
  if (!data?.about_intro && !about?.sources && !data?.company_info) return

  const ws = book.addWorksheet('About & Insights', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [
    { width: 32 },
    { width: 95 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
  ]
  const compInfo = data?.company_info || about?.sources?.company_info
  ws.addRow([compInfo?.name || companyName, compInfo?.symbol ? `Symbol: ${compInfo.symbol}` : 'Screener.in Corporate Profile & Insights'])
  ws.mergeCells('A1:F1')
  ws.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: '102D2B' } }
  ws.addRow(['Updated / Status', data?.generated_at || about?.sources?.generated_at || about?.status || 'Active'])
  ws.getRow(2).font = { italic: true, color: { argb: '475569' }, size: 9 }
  ws.addRow([])

  const addBanner = (title: string) => {
    const r = ws.addRow([title])
    ws.mergeCells(`A${r.number}:F${r.number}`)
    styleHeader(r)
  }

  const addKV = (label: string, value: string | undefined | null) => {
    const cleaned = cleanMultilineCite(value)
    if (!cleaned) return
    const r = ws.addRow([label, cleaned])
    ws.mergeCells(`B${r.number}:F${r.number}`)
    r.getCell(1).font = { name: 'Aptos', bold: true, size: 10, color: { argb: '102D2B' } }
    r.getCell(2).font = { name: 'Aptos', size: 10, color: { argb: '0F172A' } }
    r.getCell(1).alignment = { vertical: 'top', wrapText: true }
    r.getCell(2).alignment = { vertical: 'top', wrapText: true }
    r.height = estimateRowHeight(cleaned, 110)
  }

  if (data?.ratios && data.ratios.length > 0) {
    addBanner('KEY SCREENER FINANCIAL METRICS')
    for (const r of data.ratios) {
      addKV(r.label, r.value)
    }
    ws.addRow([])
  }

  if (data?.about_intro?.text) {
    addBanner('ABOUT COMPANY')
    addKV('Corporate Overview', mergeBrokenLines(data.about_intro.text.split('\n')).join(' '))
    ws.addRow([])
  }

  if (data?.paragraphs && data.paragraphs.length > 0) {
    addBanner(`READ MORE COMMENTARY & OPERATIONAL DIMENSIONS (${data.paragraphs.length} TOPICS)`)
    for (const p of data.paragraphs) {
      const title = p.title || `Dimension #${p.id}`
      const rawLines = p.lines && p.lines.length > 0 ? p.lines : (p.text ? p.text.split('\n').filter(Boolean) : [])
      const lines = mergeBrokenLines(rawLines)
      const content = lines.join('\n')
      addKV(title, content)
    }
    ws.addRow([])
  }

  if ((data?.pros && data.pros.length > 0) || (data?.cons && data.cons.length > 0)) {
    addBanner('SCREENER ANALYSIS: PROS & CONS')
    if (data?.pros?.length) addKV('Strengths & Pros', data.pros.map(pr => `✔ ${pr}`).join('\n'))
    if (data?.cons?.length) addKV('Points to Consider', data.cons.map(cn => `⚠ ${cn}`).join('\n'))
    ws.addRow([])
  }

  // Master Sources / Footnotes
  const footnotes = data?.footnotes ?? []
  if (footnotes.length > 0) {
    const srcSheet = book.addWorksheet('Verified Filings', { views: [{ state: 'frozen', ySplit: 1 }] })
    srcSheet.columns = [
      { width: 10 },
      { width: 45 },
      { width: 75 },
    ]
    srcSheet.addRow(['Ref #', 'Source Title', 'Filing URL'])
    styleHeader(srcSheet.getRow(1))
    for (const fn of footnotes) {
      const r = srcSheet.addRow([`[${fn.num}]`, fn.title || `Source Filing [${fn.num}]`, fn.url])
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      if (fn.url && fn.url.startsWith('http')) {
        r.getCell(3).value = { text: fn.url, hyperlink: fn.url }
        r.getCell(3).font = { color: { argb: '0369A1' }, underline: true, size: 9 }
      }
    }
  }
}

// -------------------------------------------------------------
// 2. PEER COMPARISON EXCEL SHEET
// -------------------------------------------------------------
function appendPeerComparisonExcelSheet(
  book: ExcelJS.Workbook,
  companyName: string,
  about?: AboutState | null,
  isBank: boolean = false,
) {
  const peerComp = resolvePeerComparison(about, isBank)
  const columns = getPeerMetricColumns(isBank)
  const headers = getPeerTableHeaders(isBank)
  const peerRowsAll: NormalizedPeerRow[] = peerComp.median ? [...peerComp.rows, peerComp.median] : peerComp.rows
  if (peerRowsAll.length === 0) return

  const peerSheet = book.addWorksheet('Peer Comparison', { views: [{ state: 'frozen', ySplit: 4 }] })
  peerSheet.columns = [
    { width: 24 },
    ...columns.map(col => ({ width: col.key === 'price_range' ? 22 : 14 })),
  ]
  const lastColLetter = String.fromCharCode(65 + columns.length)
  peerSheet.addRow([`${companyName} — Peer Comparison & Sector Valuation`])
  peerSheet.mergeCells(`A1:${lastColLetter}1`)
  peerSheet.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
  peerSheet.addRow([
    peerComp.sectorPath.length
      ? `Sector: ${peerComp.sectorPath.join(' > ')}`
      : 'Source: Screener Peer Comparison Section',
  ])
  peerSheet.mergeCells(`A2:${lastColLetter}2`)
  peerSheet.getRow(2).font = { italic: true, color: { argb: '475569' }, size: 9 }
  peerSheet.addRow([])

  const hdr = peerSheet.addRow(headers)
  styleHeader(hdr)
  hdr.eachCell((cell, colIdx) => {
    cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right', wrapText: true }
  })

  for (const peer of peerRowsAll) {
    const prefix = peer.s_no && !peer.is_median ? `${peer.s_no} ` : ''
    const pr = peerSheet.addRow([
      `${prefix}${peer.company}`,
      ...columns.map(col => peer[col.key] || '-'),
    ])
    pr.eachCell((cell, colIdx) => {
      cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
    })
    if (peer.is_target) {
      pr.eachCell(cell => {
        cell.fill = paleFill
        cell.font = { name: 'Aptos', bold: true, size: 10, color: { argb: '102D2B' } }
      })
    } else if (peer.is_median) {
      pr.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } }
        cell.font = { name: 'Aptos', bold: true, size: 10, color: { argb: '0F172A' } }
      })
    }
  }

  const fnRow = peerSheet.addRow([peerComp.footnote])
  peerSheet.mergeCells(`A${fnRow.number}:${lastColLetter}${fnRow.number}`)
  fnRow.getCell(1).font = { name: 'Aptos', italic: true, size: 9, color: { argb: '475569' } }
}

// -------------------------------------------------------------
// 3. RATIOS EXCEL SHEETS (QUARTERLY & YEARLY)
// -------------------------------------------------------------
function appendRatioExcelSheets(book: ExcelJS.Workbook, data: FinancialData) {
  // 3a. Quarterly Ratios Sheet
  const qRatios = computeQuarterlyRatios(data)
  if (qRatios.headers.length > 0 && qRatios.rows.length > 0) {
    const ws = book.addWorksheet('Quarterly Ratios', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    ws.columns = [{ width: 34 }, ...qRatios.headers.map(() => ({ width: 14 }))]
    ws.addRow([`${data.companyName} — Quarterly Financial Ratios`])
    ws.mergeCells(1, 1, 1, qRatios.headers.length + 1)
    ws.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
    ws.addRow([`Computed across ${qRatios.headers.length} quarterly reporting periods · Values in % or ratio`])
    ws.getRow(2).font = { italic: true, color: { argb: '64748B' }, size: 9 }

    const hdr = ws.addRow(['Financial Ratio', ...qRatios.headers])
    styleHeader(hdr)
    hdr.eachCell((cell, colIdx) => {
      cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
    })

    let lastCat = ''
    for (const row of qRatios.rows) {
      if (row.category && row.category !== lastCat) {
        lastCat = row.category
        const catRow = ws.addRow([lastCat.toUpperCase()])
        ws.mergeCells(catRow.number, 1, catRow.number, qRatios.headers.length + 1)
        catRow.eachCell(cell => {
          cell.fill = subHeaderFill
          cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFF' }, size: 9.5 }
        })
      }
      const dataRow = ws.addRow([row.label, ...row.values])
      dataRow.eachCell((cell, colIdx) => {
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
        if (colIdx === 1) cell.font = { name: 'Aptos', bold: true, size: 9.5, color: { argb: '0F172A' } }
      })
    }
  }

  // 3b. Yearly Ratios Sheet (including Creditor Days)
  const yRatios = computeYearlyRatios(data)
  if (yRatios.headers.length > 0 && yRatios.rows.length > 0) {
    const ws = book.addWorksheet('Yearly Ratios', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    ws.columns = [{ width: 34 }, ...yRatios.headers.map(() => ({ width: 14 }))]
    ws.addRow([`${data.companyName} — Yearly Financial Ratios`])
    ws.mergeCells(1, 1, 1, yRatios.headers.length + 1)
    ws.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
    ws.addRow([`Computed across ${yRatios.headers.length} annual reporting periods · Values in % or ratio`])
    ws.getRow(2).font = { italic: true, color: { argb: '64748B' }, size: 9 }

    const hdr = ws.addRow(['Financial Ratio', ...yRatios.headers])
    styleHeader(hdr)
    hdr.eachCell((cell, colIdx) => {
      cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
    })

    let lastCat = ''
    for (const row of yRatios.rows) {
      if (row.category && row.category !== lastCat) {
        lastCat = row.category
        const catRow = ws.addRow([lastCat.toUpperCase()])
        ws.mergeCells(catRow.number, 1, catRow.number, yRatios.headers.length + 1)
        catRow.eachCell(cell => {
          cell.fill = subHeaderFill
          cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFF' }, size: 9.5 }
        })
      }
      const dataRow = ws.addRow([row.label, ...row.values])
      dataRow.eachCell((cell, colIdx) => {
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
        if (colIdx === 1) cell.font = { name: 'Aptos', bold: true, size: 9.5, color: { argb: '0F172A' } }
      })
    }
  }
}

// -------------------------------------------------------------
// 4. SHAREHOLDING PATTERN EXCEL SHEET
// -------------------------------------------------------------
function appendShareholdingExcelSheet(book: ExcelJS.Workbook, companyName: string, about?: AboutState | null) {
  const data = about?.data || (about?.sources as unknown as import('./types').ScreenerAboutData)
  const shp = data?.shareholding
  if (!shp || (!shp.quarterly?.rows?.length && !shp.yearly?.rows?.length)) return

  const ws = book.addWorksheet('Shareholding Pattern', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.addRow([`${companyName} — Shareholding Pattern & Distribution`])
  ws.mergeCells('A1:J1')
  ws.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
  ws.addRow(['Source: Screener.in Quarterly & Yearly Shareholding Pattern Disclosures (values in %)'])
  ws.getRow(2).font = { italic: true, color: { argb: '475569' }, size: 9 }
  ws.addRow([])

  const addTable = (title: string, tbl: NonNullable<typeof shp.quarterly>) => {
    if (!tbl.periods.length || !tbl.rows.length) return
    const banner = ws.addRow([title])
    ws.mergeCells(banner.number, 1, banner.number, tbl.periods.length + 1)
    styleHeader(banner)

    const hdr = ws.addRow(['Holder Category', ...tbl.periods])
    hdr.eachCell((cell, colIdx) => {
      cell.fill = subHeaderFill
      cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFF' }, size: 9.5 }
      cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
    })

    for (const r of tbl.rows) {
      const row = ws.addRow([r.category, ...tbl.periods.map((_, i) => r.values[i] || '—')])
      row.eachCell((cell, colIdx) => {
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
        if (colIdx === 1) cell.font = { name: 'Aptos', bold: true, size: 9.5, color: { argb: '0F172A' } }
        if (r.is_total || r.is_shareholders) {
          cell.font = { name: 'Aptos', bold: true, size: 9.5, color: { argb: '102D2B' } }
          cell.fill = paleFill
        }
      })
    }
    ws.addRow([])
  }

  if (shp.quarterly) addTable(`QUARTERLY SHAREHOLDING PATTERN (${shp.quarterly.periods.length} QUARTERS)`, shp.quarterly)
  if (shp.yearly) addTable(`YEARLY SHAREHOLDING PATTERN (${shp.yearly.periods.length} YEARS)`, shp.yearly)
  ws.columns = [{ width: 30 }, ...Array.from({ length: 15 }, () => ({ width: 14 }))]
}

// -------------------------------------------------------------
// 5. DATA CHECKS & FORMULAS EXCEL SHEET
// -------------------------------------------------------------
function appendDataChecksExcelSheet(book: ExcelJS.Workbook, data: FinancialData) {
  const ws = book.addWorksheet('Data Checks & Formulas', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.columns = [
    { width: 32 },
    { width: 16 },
    { width: 18 },
    { width: 45 },
    { width: 55 },
    { width: 45 },
  ]
  ws.addRow([`${data.companyName} — Financial Dictionary, Formulas & Benchmark Guidelines`])
  ws.mergeCells('A1:F1')
  ws.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
  ws.addRow(['Detailed explanations of financial ratios, mathematical formulas, benchmarks, and data checks'])
  ws.getRow(2).font = { italic: true, color: { argb: '475569' }, size: 9 }

  const hdr = ws.addRow(['Metric / Ratio Name', 'Abbreviation', 'Category', 'Mathematical Formula', 'Financial Meaning', 'Benchmark & Notes'])
  styleHeader(hdr)

  const applicableDefs = RATIO_DEFINITIONS.filter(r => r.applicableTo === 'all' || r.applicableTo === data.mode)
  for (const def of applicableDefs) {
    const r = ws.addRow([def.name, def.abbr, def.category.toUpperCase(), def.formula, def.meaning, `${def.benchmark} | Note: ${def.notes}`])
    r.getCell(1).font = { name: 'Aptos', bold: true, size: 9.5, color: { argb: '102D2B' } }
    r.getCell(1).alignment = { vertical: 'top', wrapText: true }
    r.getCell(4).alignment = { vertical: 'top', wrapText: true }
    r.getCell(5).alignment = { vertical: 'top', wrapText: true }
    r.getCell(6).alignment = { vertical: 'top', wrapText: true }
    r.height = estimateRowHeight(def.meaning + def.benchmark, 60, 24)
  }

  if (data.warnings && data.warnings.length > 0) {
    ws.addRow([])
    const wBanner = ws.addRow(['SPECIFIC WORKBOOK DATA INTEGRITY CHECKS & WARNINGS'])
    ws.mergeCells(wBanner.number, 1, wBanner.number, 6)
    styleHeader(wBanner)
    for (const w of data.warnings) {
      const wr = ws.addRow(['Integrity Notice', '-', 'VALIDATION', w, 'Specific workbook parsing check', '-'])
      wr.getCell(4).font = { italic: true, color: { argb: 'B45309' } }
    }
  }
}

// -------------------------------------------------------------
// 6. MAIN EXCEL EXPORT (BANK & NON-BANK)
// -------------------------------------------------------------
async function exportBankExcel(data: BankData, button: HTMLButtonElement, about?: AboutState | null) {
  button.disabled = true
  const oldText = button.textContent
  button.textContent = 'Preparing workbook…'
  try {
    const { default: ExcelJSRuntime } = await import('exceljs')
    const charts = await captureCharts()
    const book = new ExcelJSRuntime.Workbook()
    book.creator = 'Ledger Financial Visualizer'
    book.created = new Date()

    // 1. About
    appendAboutExcelSheets(book, data.companyName, about)
    // 2. Peer Comparison
    appendPeerComparisonExcelSheet(book, data.companyName, about, true)
    // 3. Quarterly & Yearly Ratios
    appendRatioExcelSheets(book, data)
    // 4. Shareholding Pattern
    appendShareholdingExcelSheet(book, data.companyName, about)

    // 5. Overview Analysis
    const analysis = book.addWorksheet('Overview Analysis', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    analysis.addRow([data.companyName, 'Financial Analysis — Bank mode'])
    analysis.mergeCells('A1:B1')
    analysis.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: '102D2B' } }
    analysis.addRow(['Annual and quarterly metrics (Oldest → Newest)', '₹ crore unless stated; values use the bank prompt formulas.'])
    analysis.addRow(['Period','Interest earned','Interest paid','Interest gap (%)','Other income','Total revenue','Basic expense','Provision & other expense','Total expense','PBT','Net profit','OPM (%)','NPM (%)','Dividend','DPS (₹)','Payout (%)','EPS (₹)','Equity','Borrowings','Borrowings/equity (×)','ROE (%)','ROA (%)','Cash & Bank','Other liabilities','Liquidity (%)','Total assets','Other assets','Shares (Cr)','Loans & advances','Deposits','LDR (%)','Borrowings/deposits (%)'])
    styleHeader(analysis.getRow(3))
    for (const r of data.annual) {
      analysis.addRow([r.period,r.interestEarned,r.interestPaid,r.interestGap,r.otherIncome,r.totalRevenue,r.basicExpense,r.provisionOtherExpense,r.totalExpense,r.profitBeforeTax,r.netProfit,r.operatingProfitMargin,r.netProfitMargin,r.dividend,r.dividendPerShare,r.dividendPayout,r.eps,r.equity,r.borrowings,r.debtToEquity,r.roe,r.roa,r.cashBank,r.otherLiabilities,r.liquidity,r.totalAssets,r.otherAssets,r.sharesCr,r.loansAdvances,r.deposits,r.ldr,r.borrowingsToDeposits])
    }
    analysis.addRow([])
    analysis.addRow(['Quarterly metrics · ₹ crore unless stated (Oldest → Newest)'])
    analysis.addRow(['Period','Interest earned','Interest paid','Interest gap (%)','Other income','Total revenue','Expenses','Total expense','Operating profit','Net profit','OPM (%)','NPM (%)'])
    styleHeader(analysis.getRow(analysis.rowCount))
    for (const r of data.quarterly) {
      analysis.addRow([r.period,r.interestEarned,r.interestPaid,r.interestGap,r.otherIncome,r.totalRevenue,r.expenses,r.totalExpense,r.operatingProfit,r.netProfit,r.operatingProfitMargin,r.netProfitMargin])
    }
    analysis.columns.forEach((column, index) => { column.width = index === 0 ? 25 : 18 })
    analysis.getRow(2).font = { italic: true, color: { argb: '65776E' }, size: 9 }

    // 6. Data Checks & Formulas
    appendDataChecksExcelSheet(book, data)

    // 7. Data Sheet (Raw matrix)
    const source = book.addWorksheet('Data Sheet', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
    for (const sourceRow of data.sourceMatrix) source.addRow((sourceRow ?? []).map(excelValue))
    source.columns.forEach((column, index) => { column.width = index === 0 ? 32 : 15 })
    source.eachRow(row => {
      row.eachCell(cell => { cell.font = { name: 'Aptos', size: 9, color: { argb: '243831' } }; cell.alignment = { vertical: 'middle' } })
      const label = String(row.getCell(1).value ?? '').trim().toLowerCase().replace(/:$/, '')
      if (['company name','profit & loss','quarters','balance sheet','cash flow','price','derived'].includes(label)) {
        row.eachCell(cell => { cell.fill = headerFill; cell.font = { name: 'Aptos Display', bold: true, size: 11, color: { argb: 'FFFFFF' } } })
      } else if (label === 'report date') row.eachCell(cell => { cell.fill = paleFill; cell.font = { bold: true, color: { argb: '17473B' }, size: 9 } })
    })

    // 8. Charts Sheet
    const chartSheet = book.addWorksheet('Charts', { views: [{ showGridLines: false }] })
    chartSheet.columns = Array.from({ length: 22 }, (_, i) => ({ width: i === 0 || i === 11 ? 2 : 11 }))
    chartSheet.getCell('A1').value = `${data.companyName} — Bank financial charts`
    chartSheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'EAF7F1' } }
    chartSheet.mergeCells('A1:V1')
    const chartRows = 2 + Math.ceil(charts.length / 2) * 19
    for (let row = 1; row <= chartRows; row++) {
      for (let col = 1; col <= 22; col++) {
        const cell = chartSheet.getCell(row, col)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0B1513' } }
      }
    }
    chartSheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'EAF7F1' } }
    charts.forEach((chart, index) => {
      const col = index % 2 === 0 ? 0 : 11
      const row = 2 + Math.floor(index / 2) * 19
      chartSheet.getCell(row + 1, col + 1).value = chart.title
      chartSheet.getCell(row + 1, col + 1).font = { bold: true, size: 12, color: { argb: '67E3C1' } }
      const imageId = book.addImage({ base64: chart.dataUrl.split(',')[1], extension: 'png' })
      chartSheet.addImage(imageId, { tl: { col, row: row + 1 }, ext: { width: 580, height: 310 } })
    })

    const buffer = await book.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    triggerBlobDownload(blob, `${safeName(data.companyName)}_Complete_Report.xlsx`)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}

export async function exportExcel(data: FinancialData, button: HTMLButtonElement, about?: AboutState | null) {
  if (data.mode === 'bank') return exportBankExcel(data, button, about)
  button.disabled = true
  const oldText = button.textContent
  button.textContent = 'Preparing workbook…'
  try {
    const { default: ExcelJSRuntime } = await import('exceljs')
    const charts = await captureCharts()
    const book = new ExcelJSRuntime.Workbook()
    book.creator = 'Ledger Financial Visualizer'
    book.created = new Date()

    // 1. About
    appendAboutExcelSheets(book, data.companyName, about)
    // 2. Peer Comparison
    appendPeerComparisonExcelSheet(book, data.companyName, about, false)
    // 3. Quarterly & Yearly Ratios
    appendRatioExcelSheets(book, data)
    // 4. Shareholding Pattern
    appendShareholdingExcelSheet(book, data.companyName, about)

    // 5. Overview Analysis
    const analysis = book.addWorksheet('Overview Analysis', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    analysis.addRow([data.companyName, 'Financial Analysis — Non-bank mode'])
    analysis.mergeCells('A1:B1')
    analysis.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: '102D2B' } }
    analysis.addRow(['Annual metrics (Oldest → Newest) · ₹ crore unless stated', 'Derived values use the formulas shown in the application.'])
    analysis.addRow(['Period','Sales','Total income','Net profit','Operating profit','Operating cash flow','FCF: OCF − CWIP','Dividend amount','Dividend/share (₹)','Payout (%)','EPS (₹)','GPM (%)','OPM (%)','NPM (%)','Receivables','Inventory','Net block','CWIP','CWIP/Net block (%)','Equity','Borrowings','Debt/equity (×)','ROE (%)','ROA (%)','ROCE (%)','Interest coverage (×)','Other assets','Other liabilities','Current ratio · Other assets/liabilities (×)','Cash ratio (×)','Total assets','Other assets / total assets (%)','Cash / total assets (%)','Cash & bank','Adjusted shares (Cr)'])
    styleHeader(analysis.getRow(3))
    for (const r of data.annual) {
      analysis.addRow([r.period,r.sales,r.totalIncome,r.netProfit,r.operatingProfit,r.operatingCashFlow,r.freeCashFlow,r.dividend,r.dividendPerShare,r.dividendPayout,r.eps,r.grossProfitMargin,r.operatingProfitMargin,r.netProfitMargin,r.receivables,r.inventory,r.netBlock,r.cwip,r.netBlockToCwip,r.equity,r.borrowings,r.debtToEquity,r.roe,r.roa,r.roce,r.interestCoverage,r.otherAssets,r.otherLiabilities,r.currentRatio,r.cashRatio,r.totalAssets,r.currentAssetsToTotalAssets,r.cashToTotalAssets,r.cashBank,r.sharesCr])
    }
    analysis.addRow([])
    analysis.addRow(['Quarterly metrics · ₹ crore unless stated (Oldest → Newest)'])
    analysis.addRow(['Period','Sales','Net profit','Operating profit','OPM (%)','NPM (%)'])
    styleHeader(analysis.getRow(analysis.rowCount))
    for (const r of data.quarterly) {
      analysis.addRow([r.period,r.sales,r.netProfit,r.operatingProfit,r.operatingProfitMargin,r.netProfitMargin])
    }
    analysis.columns.forEach((column, index) => { column.width = index === 0 ? 23 : 17 })
    analysis.getRow(2).font = { italic: true, color: { argb: '65776E' }, size: 9 }

    // 6. Data Checks & Formulas
    appendDataChecksExcelSheet(book, data)

    // 7. Data Sheet (Raw Matrix)
    const source = book.addWorksheet('Data Sheet', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
    for (const sourceRow of data.sourceMatrix) source.addRow((sourceRow ?? []).map(excelValue))
    source.columns.forEach((column, index) => { column.width = index === 0 ? 32 : 15 })
    source.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.font = { name: 'Aptos', size: 9, color: { argb: '243831' } }
        cell.alignment = { vertical: 'middle' }
      })
      const label = String(row.getCell(1).value ?? '').trim().toLowerCase().replace(/:$/, '')
      if (['company name','profit & loss','quarters','balance sheet','cash flow','price','derived'].includes(label)) {
        row.eachCell(cell => { cell.fill = headerFill; cell.font = { name: 'Aptos Display', bold: true, size: 11, color: { argb: 'FFFFFF' } } })
        row.height = 22
      } else if (label === 'report date') {
        row.eachCell(cell => { cell.fill = paleFill; cell.font = { bold: true, color: { argb: '17473B' }, size: 9 } })
      }
      if (rowNumber === 1) row.height = 23
    })

    // 8. Charts Sheet
    const chartSheet = book.addWorksheet('Charts', { views: [{ showGridLines: false }] })
    chartSheet.columns = Array.from({ length: 22 }, (_, i) => ({ width: i === 0 || i === 11 ? 2 : 11 }))
    chartSheet.getCell('A1').value = `${data.companyName} — Financial charts`
    chartSheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'EAF7F1' } }
    chartSheet.mergeCells('A1:V1')
    const chartRows = 2 + Math.ceil(charts.length / 2) * 19
    for (let row = 1; row <= chartRows; row++) for (let col = 1; col <= 22; col++) {
      chartSheet.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0B1513' } }
    }
    chartSheet.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'EAF7F1' } }
    charts.forEach((chart, index) => {
      const col = index % 2 === 0 ? 0 : 11
      const row = 2 + Math.floor(index / 2) * 19
      chartSheet.getCell(row + 1, col + 1).value = chart.title
      chartSheet.getCell(row + 1, col + 1).font = { bold: true, size: 12, color: { argb: '67E3C1' } }
      const imageId = book.addImage({ base64: chart.dataUrl.split(',')[1], extension: 'png' })
      chartSheet.addImage(imageId, { tl: { col, row: row + 1 }, ext: { width: 580, height: 310 } })
    })

    const buffer = await book.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    triggerBlobDownload(blob, `${safeName(data.companyName)}_Complete_Report.xlsx`)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}
