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

const pdfText = (text: unknown) =>
  cleanMultilineCite(text)
    .replace(/₹/g, 'Rs. ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•●▪]/g, '-')
    .replace(/—/g, '-')
    .replace(/★/g, '*')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
    .trim()

const estimateRowHeight = (text: string, charsPerLine = 92, base = 22) => {
  const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  return Math.max(base, Math.min(409, lines * 14 + 10))
}

const display = (value: number | null | undefined, decimals = 2) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : Number(value.toFixed(decimals))

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
    { width: 32 },
    ...columns.map(() => ({ width: 14 })),
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

// -------------------------------------------------------------
// 7. COMPREHENSIVE PDF REPORT EXPORT
// -------------------------------------------------------------
type AutoTableFn = typeof import('jspdf-autotable').default

function appendAboutPdfSection(
  doc: import('jspdf').jsPDF,
  autoTable: AutoTableFn,
  startY: number,
  margin: number,
  about?: AboutState | null,
): number {
  const data = about?.data || (about?.sources as unknown as import('./types').ScreenerAboutData)
  if (!data?.about_intro && !about?.sources && !data?.company_info) return startY

  const baseTable = {
    theme: 'grid' as const,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.3,
      textColor: [15, 23, 42] as [number, number, number],
      lineColor: [203, 213, 225] as [number, number, number],
      overflow: 'linebreak' as const,
    },
    headStyles: {
      fillColor: [16, 45, 43] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  }

  const sectionHeading = (title: string, yPos: number) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(16, 45, 43)
    doc.text(pdfText(title), margin, yPos)
  }

  let y = startY

  if (data?.about_intro || data?.company_info) {
    sectionHeading('Screener.in Corporate Profile & Overview', y)
    const rows: Array<[string, string]> = []
    if (data.company_info?.name) rows.push(['Company Name', pdfText(data.company_info.name)])
    if (data.company_info?.symbol) rows.push(['Symbol', pdfText(data.company_info.symbol)])
    if (data.company_info?.sector) rows.push(['Sector & Industry', pdfText(data.company_info.sector)])
    if (data.about_intro?.text) rows.push(['About Description', pdfText(mergeBrokenLines(data.about_intro.text.split('\n')).join(' '))])
    if (data.ratios && data.ratios.length > 0) {
      rows.push(['Key Financial Metrics', pdfText(data.ratios.map(r => `${r.label}: ${r.value}`).join(' | '))])
    }
    autoTable(doc, {
      ...baseTable,
      startY: y + 4,
      head: [['Dimension', 'Screener Information']],
      body: rows,
      columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
    })

    const lastY1 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
    y = lastY1 + 8

    if (data.paragraphs && data.paragraphs.length > 0) {
      if (y > 150) { doc.addPage(); y = 18 }
      sectionHeading(`Read More Operational Insights (${data.paragraphs.length} Topics)`, y)
      const commRows: Array<[string, string]> = data.paragraphs.map(p => {
        const rawLines = p.lines && p.lines.length > 0 ? p.lines : (p.text ? p.text.split('\n').filter(Boolean) : [])
        const lines = mergeBrokenLines(rawLines)
        return [
          pdfText(p.title || `Dimension #${p.id}`),
          pdfText(lines.join('\n')),
        ]
      })
      autoTable(doc, {
        ...baseTable,
        startY: y + 4,
        head: [['Commentary Topic', 'Details & Operational Breakdown']],
        body: commRows,
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      })
      const lastY2 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60
      y = lastY2 + 8
    }

    if ((data.pros && data.pros.length > 0) || (data.cons && data.cons.length > 0)) {
      if (y > 150) { doc.addPage(); y = 18 }
      sectionHeading('Screener Analysis: Pros & Cons', y)
      const pcRows: Array<[string, string]> = []
      if (data.pros?.length) pcRows.push(['Strengths / Pros', pdfText(data.pros.map(pr => `✔ ${pr}`).join('\n'))])
      if (data.cons?.length) pcRows.push(['Points to Consider', pdfText(data.cons.map(cn => `⚠ ${cn}`).join('\n'))])
      autoTable(doc, {
        ...baseTable,
        startY: y + 4,
        head: [['Category', 'Checklist Points']],
        body: pcRows,
        columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      })
      const lastY3 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30
      y = lastY3 + 8
    }

    if (data.footnotes && data.footnotes.length > 0) {
      if (y > 160) { doc.addPage(); y = 18 }
      sectionHeading(`Verified Source Filings (${data.footnotes.length} References)`, y)
      autoTable(doc, {
        ...baseTable,
        startY: y + 4,
        head: [['Ref', 'Source / Filing Description', 'URL']],
        body: data.footnotes.map(fn => [pdfText(`[${fn.num}]`), pdfText(fn.title || 'Source Filing'), pdfText(fn.url)]),
        columnStyles: { 0: { cellWidth: 16, fontStyle: 'bold' }, 1: { cellWidth: 60 }, 2: { cellWidth: 'auto' } },
      })
      y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
    }
  }

  doc.addPage()
  return 18
}

function appendPeerComparisonPdfSection(
  doc: import('jspdf').jsPDF,
  autoTable: AutoTableFn,
  startY: number,
  margin: number,
  about?: AboutState | null,
  isBank: boolean = false,
): number {
  const peerComp = resolvePeerComparison(about, isBank)
  const columns = getPeerMetricColumns(isBank)
  const headers = getPeerTableHeaders(isBank)
  const peerRowsAll = peerComp.median ? [...peerComp.rows, peerComp.median] : peerComp.rows
  if (peerRowsAll.length === 0) return startY

  let y = startY
  if (y > 150) { doc.addPage(); y = 18 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(16, 45, 43)
  doc.text('Peers Comparison & Market Position', margin, y)

  autoTable(doc, {
    theme: 'grid',
    startY: y + 4,
    margin: { left: margin, right: margin },
    styles: { fontSize: 5.6, cellPadding: 1.2, textColor: [15, 23, 42], lineColor: [203, 213, 225] },
    headStyles: { fillColor: [16, 45, 43], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 5.6, halign: 'right' },
    head: [headers],
    body: peerRowsAll.map(pr => [
      pdfText(`${pr.s_no && !pr.is_median ? `${pr.s_no} ` : ''}${pr.company}`),
      ...columns.map(col => pdfText(pr[col.key] || '-')),
    ]),
    columnStyles: {
      0: { cellWidth: 32, halign: 'left' },
    },
    didParseCell: hookData => {
      if (hookData.column.index === 0) {
        hookData.cell.styles.halign = 'left'
      } else {
        hookData.cell.styles.halign = 'right'
      }
      if (hookData.section === 'body') {
        const rowItem = peerRowsAll[hookData.row.index]
        if (rowItem?.is_target) {
          hookData.cell.styles.fillColor = [224, 242, 254]
          hookData.cell.styles.fontStyle = 'bold'
          hookData.cell.styles.textColor = [12, 74, 110]
        } else if (rowItem?.is_median) {
          hookData.cell.styles.fillColor = [241, 245, 249]
          hookData.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  const tableEndY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? (y + 24)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(71, 85, 105)
  doc.text(pdfText(peerComp.footnote), margin, tableEndY + 4)

  doc.addPage()
  return 18
}

function appendRatioPdfSections(
  doc: import('jspdf').jsPDF,
  autoTable: AutoTableFn,
  startY: number,
  margin: number,
  data: FinancialData,
): number {
  let y = startY

  // 1. Quarterly Ratios
  const qRatios = computeQuarterlyRatios(data)
  if (qRatios.headers.length > 0 && qRatios.rows.length > 0) {
    if (y > 150) { doc.addPage(); y = 18 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(16, 45, 43)
    doc.text(`Quarterly Financial Ratios (${qRatios.headers.length} Quarters · Q1-25 format)`, margin, y)

    autoTable(doc, {
      theme: 'grid',
      startY: y + 4,
      margin: { left: margin, right: margin },
      styles: { fontSize: 6.2, cellPadding: 1.5, textColor: [15, 23, 42], lineColor: [203, 213, 225] },
      headStyles: { fillColor: [16, 45, 43], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.2, halign: 'right' },
      head: [['Financial Ratio', ...qRatios.headers.map(h => pdfText(h))]],
      body: qRatios.rows.map(r => [pdfText(r.label), ...r.values.map(v => pdfText(v))]),
      columnStyles: { 0: { cellWidth: 54, halign: 'left', fontStyle: 'bold' } },
      didParseCell: hookData => {
        if (hookData.section === 'head' && hookData.column.index === 0) {
          hookData.cell.styles.halign = 'left'
        } else if (hookData.section === 'body' && hookData.column.index > 0) {
          hookData.cell.styles.halign = 'right'
        }
      },
    })
    doc.addPage()
    y = 18
  }

  // 2. Yearly Ratios (with Creditor Days)
  const yRatios = computeYearlyRatios(data)
  if (yRatios.headers.length > 0 && yRatios.rows.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(16, 45, 43)
    doc.text(`Yearly Financial Ratios (${yRatios.headers.length} Periods · Creditor Days included)`, margin, y)

    autoTable(doc, {
      theme: 'grid',
      startY: y + 4,
      margin: { left: margin, right: margin },
      styles: { fontSize: 6.2, cellPadding: 1.5, textColor: [15, 23, 42], lineColor: [203, 213, 225] },
      headStyles: { fillColor: [16, 45, 43], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.2, halign: 'right' },
      head: [['Financial Ratio', ...yRatios.headers.map(h => pdfText(h))]],
      body: yRatios.rows.map(r => [pdfText(r.label), ...r.values.map(v => pdfText(v))]),
      columnStyles: { 0: { cellWidth: 54, halign: 'left', fontStyle: 'bold' } },
      didParseCell: hookData => {
        if (hookData.section === 'head' && hookData.column.index === 0) {
          hookData.cell.styles.halign = 'left'
        } else if (hookData.section === 'body' && hookData.column.index > 0) {
          hookData.cell.styles.halign = 'right'
        }
      },
    })
    doc.addPage()
    y = 18
  }

  return y
}

function appendShareholdingPdfSection(
  doc: import('jspdf').jsPDF,
  autoTable: AutoTableFn,
  startY: number,
  margin: number,
  about?: AboutState | null,
): number {
  const data = about?.data || (about?.sources as unknown as import('./types').ScreenerAboutData)
  const shp = data?.shareholding
  if (!shp || (!shp.quarterly?.rows?.length && !shp.yearly?.rows?.length)) return startY

  let y = startY
  if (y > 150) { doc.addPage(); y = 18 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(16, 45, 43)
  doc.text('Shareholding Pattern & Distribution (Quarterly & Yearly)', margin, y)

  const renderTable = (labelTitle: string, tbl: NonNullable<typeof shp.quarterly>) => {
    if (!tbl.periods.length || !tbl.rows.length) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(16, 45, 43)
    doc.text(pdfText(labelTitle), margin, y + 4)

    autoTable(doc, {
      theme: 'grid',
      startY: y + 6,
      margin: { left: margin, right: margin },
      styles: { fontSize: 6.8, cellPadding: 1.8, textColor: [15, 23, 42], lineColor: [203, 213, 225] },
      headStyles: { fillColor: [16, 45, 43], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.8, halign: 'right' },
      head: [['Holder Category', ...tbl.periods.map(h => pdfText(h))]],
      body: tbl.rows.map(r => [pdfText(r.category), ...tbl.periods.map((_, i) => pdfText(r.values[i] || '-'))]),
      columnStyles: { 0: { cellWidth: 48, halign: 'left', fontStyle: 'bold' } },
      didParseCell: hookData => {
        if (hookData.section === 'head' && hookData.column.index === 0) {
          hookData.cell.styles.halign = 'left'
        } else if (hookData.section === 'body' && hookData.column.index > 0) {
          hookData.cell.styles.halign = 'right'
        }
        if (hookData.section === 'body') {
          const rowItem = tbl.rows[hookData.row.index]
          if (rowItem?.is_total || rowItem?.is_shareholders) {
            hookData.cell.styles.fillColor = [224, 242, 254]
            hookData.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20) + 8
  }

  if (shp.quarterly) renderTable(`Quarterly Shareholding (Last ${shp.quarterly.periods.length} Quarters)`, shp.quarterly)
  if (shp.yearly) {
    if (y > 150) { doc.addPage(); y = 18 }
    renderTable(`Yearly Shareholding (Last ${shp.yearly.periods.length} Years)`, shp.yearly)
  }

  doc.addPage()
  return 18
}

function appendDataChecksPdfSection(
  doc: import('jspdf').jsPDF,
  autoTable: AutoTableFn,
  startY: number,
  margin: number,
  data: FinancialData,
): number {
  let y = startY
  if (y > 150) { doc.addPage(); y = 18 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(16, 45, 43)
  doc.text('Financial Definitions, Formulas & Benchmark Guidelines', margin, y)

  const applicableDefs = RATIO_DEFINITIONS.filter(r => r.applicableTo === 'all' || r.applicableTo === data.mode)
  autoTable(doc, {
    theme: 'grid',
    startY: y + 4,
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 1.8, textColor: [15, 23, 42], lineColor: [203, 213, 225] },
    headStyles: { fillColor: [16, 45, 43], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    head: [['Ratio / Metric', 'Category', 'Mathematical Formula', 'Meaning & Benchmark']],
    body: applicableDefs.map(d => [
      pdfText(d.name),
      pdfText(d.category.toUpperCase()),
      pdfText(d.formula),
      pdfText(`${d.meaning}\nBenchmark: ${d.benchmark}`),
    ]),
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 26 },
      2: { cellWidth: 70 },
      3: { cellWidth: 'auto' },
    },
  })

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) + 8
  if (data.warnings && data.warnings.length > 0) {
    if (y > 165) { doc.addPage(); y = 18 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(16, 45, 43)
    doc.text('Workbook Data Integrity Notes', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(63, 78, 69)
    let wY = y + 5
    for (const w of data.warnings) {
      const lines = doc.splitTextToSize(`• ${pdfText(w)}`, doc.internal.pageSize.getWidth() - 2 * margin)
      doc.text(lines, margin, wY)
      wY += lines.length * 4.2 + 2
    }
  }

  return y
}

async function exportBankPdf(data: BankData, button: HTMLButtonElement, about?: AboutState | null) {
  button.disabled = true
  const oldText = button.textContent
  button.textContent = 'Building report…'
  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const autoTable = autoTableModule.default
    const charts = await captureCharts()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 12
    const title = (text: string, y: number) => { doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(31,55,47); doc.text(text, margin, y) }
    const tableOptions = { theme: 'grid' as const, styles: { fontSize: 6.8, cellPadding: 2, textColor: [39,56,48] as [number,number,number], lineColor: [222,231,225] as [number,number,number] }, headStyles: { fillColor: [16,45,43] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontStyle: 'bold' as const }, alternateRowStyles: { fillColor: [244,248,245] as [number,number,number] }, margin: { left: margin, right: margin } }

    // Cover Page
    doc.setFillColor(16,45,43); doc.rect(0,0,pageWidth,42,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(23); doc.text(data.companyName,margin,20)
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text('Complete Corporate Intelligence & Bank Financial Report',margin,30)
    doc.text(`Source: ${data.sourceFileName}   •   ${data.annual[0]?.period ?? ''} to ${data.annual.at(-1)?.period ?? ''}`,margin,37)

    // 1. About
    appendAboutPdfSection(doc, autoTable, 50, margin, about)
    // 2. Peer Comparison
    appendPeerComparisonPdfSection(doc, autoTable, 18, margin, about, true)
    // 3. Quarterly & Yearly Ratios
    appendRatioPdfSections(doc, autoTable, 18, margin, data)
    // 4. Shareholding Pattern
    appendShareholdingPdfSection(doc, autoTable, 18, margin, about)

    // 5. Overview Tables
    title('Annual earnings, income & returns (Oldest → Newest)', 18)
    autoTable(doc, { ...tableOptions, startY: 23, head: [['Year','Interest earned','Interest paid','Gap %','Other income','Total revenue','Total expense','PBT','Net profit','OPM %','NPM %','ROE %','ROA %']], body: data.annual.map(r => [r.period,display(r.interestEarned,0),display(r.interestPaid,0),display(r.interestGap,1),display(r.otherIncome,0),display(r.totalRevenue,0),display(r.totalExpense,0),display(r.profitBeforeTax,0),display(r.netProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1),display(r.roe,1),display(r.roa,1)]), ...tableOptions })

    doc.addPage(); title('Annual balance sheet & shareholder metrics (Oldest → Newest)', 18)
    autoTable(doc, { ...tableOptions, startY: 23, head: [['Year','Dividend','DPS ₹','Payout %','EPS ₹','Equity','Borrowings','Borrowings/equity ×','Cash & Bank','Other liabilities','Liquidity %','Total assets','Other assets']], body: data.annual.map(r => [r.period,display(r.dividend,0),display(r.dividendPerShare),display(r.dividendPayout,1),display(r.eps),display(r.equity,0),display(r.borrowings,0),display(r.debtToEquity),display(r.cashBank,0),display(r.otherLiabilities,0),display(r.liquidity,1),display(r.totalAssets,0),display(r.otherAssets,0)]), ...tableOptions })

    let qY = ((doc as unknown as {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY ?? 160) + 12
    if (qY > 178) { doc.addPage(); qY = 18 }
    title('Quarterly analysis (Oldest → Newest)', qY)
    autoTable(doc, { ...tableOptions, startY: qY + 5, head: [['Quarter','Interest earned','Interest paid','Gap %','Other income','Total revenue','Expenses','Total expense','Operating profit','Net profit','OPM %','NPM %']], body: data.quarterly.map(r => [r.period,display(r.interestEarned,0),display(r.interestPaid,0),display(r.interestGap,1),display(r.otherIncome,0),display(r.totalRevenue,0),display(r.expenses,0),display(r.totalExpense,0),display(r.operatingProfit,0),display(r.netProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1)]), ...tableOptions })

    // 6. Data Checks
    doc.addPage()
    appendDataChecksPdfSection(doc, autoTable, 18, margin, data)

    // 7. Charts
    for (let i = 0; i < charts.length; i += 2) {
      doc.addPage()
      for (let j = 0; j < 2 && i + j < charts.length; j++) {
        const chart = charts[i + j], top = 10 + j * 95
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(16,45,43); doc.text(chart.title,margin,top+6)
        doc.addImage(chart.dataUrl,'PNG',margin,top+9,pageWidth-2*margin,78,undefined,'FAST')
      }
    }

    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page)
      doc.setFont('helvetica','normal')
      doc.setFontSize(8)
      doc.setTextColor(119,132,124)
      doc.text(`${data.companyName} · Ledger Bank Analysis`,margin,doc.internal.pageSize.getHeight()-5)
      doc.text(`${page} / ${pages}`,pageWidth-margin,doc.internal.pageSize.getHeight()-5,{align:'right'})
    }
    doc.save(`${safeName(data.companyName)}_Complete_Report.pdf`)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}

export async function exportPdf(data: FinancialData, button: HTMLButtonElement, about?: AboutState | null) {
  if (data.mode === 'bank') return exportBankPdf(data, button, about)
  button.disabled = true
  const oldText = button.textContent
  button.textContent = 'Building report…'
  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const autoTable = autoTableModule.default
    const charts = await captureCharts()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 12

    // Cover Page
    doc.setFillColor(16, 45, 43)
    doc.rect(0, 0, pageWidth, 42, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(23)
    doc.text(data.companyName, margin, 20)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Complete Corporate Intelligence & Financial Report · Non-bank analysis', margin, 30)
    doc.text(`Source: ${data.sourceFileName}   •   ${data.annual[0]?.period ?? ''} to ${data.annual.at(-1)?.period ?? ''}`, margin, 37)

    // 1. About
    appendAboutPdfSection(doc, autoTable, 50, margin, about)
    // 2. Peer Comparison
    appendPeerComparisonPdfSection(doc, autoTable, 18, margin, about, false)
    // 3. Quarterly & Yearly Ratios
    appendRatioPdfSections(doc, autoTable, 18, margin, data)
    // 4. Shareholding Pattern
    appendShareholdingPdfSection(doc, autoTable, 18, margin, about)

    // 5. Overview Tables
    doc.setTextColor(31, 55, 47)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Annual analysis table (Oldest → Newest)', margin, 18)
    const annualBody = data.annual.map(r => [
      r.period,
      display(r.sales,0),
      display(r.netProfit,0),
      display(r.operatingProfit,0),
      display(r.grossProfitMargin,1),
      display(r.operatingProfitMargin,1),
      display(r.netProfitMargin,1),
      display(r.operatingCashFlow,0),
      display(r.freeCashFlow,0),
      display(r.eps),
      display(r.dividendPerShare),
      display(r.dividendPayout,1),
      display(r.debtToEquity),
      display(r.roe,1),
      display(r.roa,1),
    ])
    autoTable(doc, {
      startY: 23,
      head: [['Year','Sales','Net profit','Op. profit','GPM %','OPM %','NPM %','CFO','FCF*','EPS ₹','DPS ₹','Payout %','D/E ×','ROE %','ROA %']],
      body: annualBody,
      theme: 'grid',
      styles: { fontSize: 6.7, cellPadding: 2.1, textColor: [39,56,48], lineColor: [222,231,225] },
      headStyles: { fillColor: [16,45,43], textColor: [255,255,255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244,248,245] },
      margin: { left: margin, right: margin },
    })

    let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 140
    y += 8
    if (y > 175) { doc.addPage(); y = 18 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Quarterly snapshot (Oldest → Newest)', margin, y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Quarter','Sales','Net profit','Operating profit','OPM %','NPM %']],
      body: data.quarterly.map(r => [r.period,display(r.sales,0),display(r.netProfit,0),display(r.operatingProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1)]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [22,139,114] },
      margin: { left: margin, right: margin },
    })

    doc.addPage()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(31,55,47)
    doc.text('Annual balance sheet, investment & return metrics (Oldest → Newest)', margin, 18)
    autoTable(doc, {
      startY: 23,
      head: [['Year','Receivables','Inventory','Net block','CWIP','CWIP/Net block %','Equity','Borrowings','D/E ×','ROE %','ROA %','Assets','Current assets/assets %','Cash/bank']],
      body: data.annual.map(r => [r.period,display(r.receivables,0),display(r.inventory,0),display(r.netBlock,0),display(r.cwip,0),display(r.netBlockToCwip,1),display(r.equity,0),display(r.borrowings,0),display(r.debtToEquity),display(r.roe,1),display(r.roa,1),display(r.totalAssets,0),display(r.currentAssetsToTotalAssets,1),display(r.cashBank,0)]),
      theme: 'grid',
      styles: { fontSize: 6.7, cellPadding: 2.1, textColor: [39,56,48], lineColor: [222,231,225] },
      headStyles: { fillColor: [16,45,43], textColor: [255,255,255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244,248,245] },
      margin: { left: margin, right: margin },
    })

    // 6. Data Checks
    doc.addPage()
    appendDataChecksPdfSection(doc, autoTable, 18, margin, data)

    // 7. Charts
    for (let i = 0; i < charts.length; i += 2) {
      doc.addPage()
      for (let j = 0; j < 2 && i + j < charts.length; j++) {
        const chart = charts[i + j]
        const top = 10 + j * 95
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(16,45,43)
        doc.text(chart.title, margin, top + 6)
        doc.addImage(chart.dataUrl, 'PNG', margin, top + 9, pageWidth - 2 * margin, 78, undefined, 'FAST')
      }
    }

    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page)
      doc.setFont('helvetica','normal')
      doc.setFontSize(8)
      doc.setTextColor(119,132,124)
      doc.text(`${data.companyName}  ·  Ledger Financial Visualizer`, margin, doc.internal.pageSize.getHeight() - 5)
      doc.text(`${page} / ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 5, { align: 'right' })
    }
    doc.save(`${safeName(data.companyName)}_Complete_Report.pdf`)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}
