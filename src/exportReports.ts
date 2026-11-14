import type ExcelJS from 'exceljs'
import type { AboutState, BankData, FinancialData } from './types'

type CapturedChart = { title: string; dataUrl: string }
const safeName = (value: string) => value.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'COMPANY'
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
const cleanMultilineCite = (text: unknown) =>
  safeTextVal(text)
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
const display = (value: number | null, decimals = 2) => value === null || !Number.isFinite(value) ? '—' : Number(value.toFixed(decimals))
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

function appendAboutExcelSheets(book: ExcelJS.Workbook, companyName: string, about?: AboutState | null) {
  const data = about?.data || (about?.sources as unknown as import('./types').ScreenerAboutData)
  if (!data?.about_intro && !about?.ai && !about?.sources) return

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
  ws.addRow(['Updated / Status', data?.generated_at || about?.sources?.generated_at || about?.status])
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
    addKV('Corporate Overview', data.about_intro.text)
    ws.addRow([])
  }

  if (data?.paragraphs && data.paragraphs.length > 0) {
    addBanner(`READ MORE COMMENTARY & OPERATIONAL DIMENSIONS (${data.paragraphs.length} TOPICS)`)
    for (const p of data.paragraphs) {
      const title = p.title || `Dimension #${p.id}`
      const content = p.bullets && p.bullets.length > 0
        ? p.bullets.map(b => `• ${b}`).join('\n')
        : p.text
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
    appendAboutExcelSheets(book, data.companyName, about)
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
    const analysis = book.addWorksheet('Bank Analysis', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    analysis.addRow([data.companyName, 'Financial Analysis — Bank mode'])
    analysis.mergeCells('A1:B1')
    analysis.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: '102D2B' } }
    analysis.addRow(['Annual and quarterly metrics', '₹ crore unless stated; values use the bank prompt formulas.'])
    analysis.addRow(['Period','Interest earned','Interest paid','Interest gap (%)','Other income','Total revenue','Basic expense (available rows)','Provision & other expense','Total expense','Expense method','PBT','Net profit','OPM (%)','NPM (%)','Dividend','DPS (₹)','Payout (%)','EPS (₹)','Equity','Borrowings','Borrowings/equity (×)','ROE (%)','ROA (%)','Cash & Bank','Other liabilities','Liquidity (%)','Total assets','Other assets','Shares (Cr)'])
    styleHeader(analysis.getRow(3))
    for (const r of data.annual) analysis.addRow([r.period,r.interestEarned,r.interestPaid,r.interestGap,r.otherIncome,r.totalRevenue,r.basicExpense,r.provisionOtherExpense,r.totalExpense,r.expenseMethod,r.profitBeforeTax,r.netProfit,r.operatingProfitMargin,r.netProfitMargin,r.dividend,r.dividendPerShare,r.dividendPayout,r.eps,r.equity,r.borrowings,r.debtToEquity,r.roe,r.roa,r.cashBank,r.otherLiabilities,r.liquidity,r.totalAssets,r.otherAssets,r.sharesCr])
    analysis.addRow([])
    analysis.addRow(['Quarterly metrics · ₹ crore unless stated'])
    analysis.addRow(['Period','Interest earned','Interest paid','Interest gap (%)','Other income','Total revenue','Expenses','Total expense','Operating profit (reported)','Net profit','OPM (%)','NPM (%)'])
    styleHeader(analysis.getRow(analysis.rowCount))
    for (const r of data.quarterly) analysis.addRow([r.period,r.interestEarned,r.interestPaid,r.interestGap,r.otherIncome,r.totalRevenue,r.expenses,r.totalExpense,r.operatingProfit,r.netProfit,r.operatingProfitMargin,r.netProfitMargin])
    analysis.columns.forEach((column, index) => { column.width = index === 0 ? 25 : 18 })
    analysis.getRow(2).font = { italic: true, color: { argb: '65776E' }, size: 9 }
    analysis.views = [{ state: 'frozen', ySplit: 3 }]
    const defs = book.addWorksheet('Definitions')
    defs.addRows([
      ['Metric','Definition used'],
      ['Annual / quarterly interest earned','Source Sales row'],
      ['Annual / quarterly interest paid','Source Interest row'],
      ['Total revenue','Interest earned + Other Income'],
      ['Interest gap (%)','100 × (interest earned − interest paid) ÷ interest earned'],
      ['Annual total expense','Available itemized expense rows + Other Expenses + Interest when all inputs are available; otherwise Total Revenue − reported PBT'],
      ['Quarterly total expense','Expenses + Interest'],
      ['OPM','100 × (Total Revenue − Total expense) ÷ Total Revenue'],
      ['NPM','100 × Net profit ÷ Total Revenue'],
      ['Equity','Equity share capital + reserves'],
      ['Borrowings / equity','Borrowings ÷ Equity, shown as the requested bank-mode measure'],
      ['EPS / dividend per share','₹ crore ÷ adjusted equity shares in crore'],
      ['Dividend payout','100 × Dividend amount ÷ Net profit; explicit zero dividend gives zero payout and DPS; missing stays blank'],
      ['ROE / ROA','Net profit ÷ average equity / average total assets; first period blank without prior period'],
      ['Liquidity','100 × Cash & Bank ÷ (Borrowings + Other Liabilities)'],
      ['Unavailable data','NIM, advances/loans, deposits/CASA, NPAs/provisions and capital adequacy are not in this Data Sheet and are not estimated.'],
      ...data.warnings.map(note => ['Data note', note]),
      ['Source file', data.sourceFileName],
    ])
    styleHeader(defs.getRow(1))
    defs.columns = [{ width: 31 }, { width: 120 }]
    defs.eachRow((row, number) => { if (number > 1) row.alignment = { wrapText: true, vertical: 'top' } })
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
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${safeName(data.companyName)}_Complete_Report.xlsx`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  } finally { button.disabled = false; button.textContent = oldText }
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
    appendAboutExcelSheets(book, data.companyName, about)
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

    const analysis = book.addWorksheet('Analysis Tables', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    analysis.addRow([data.companyName, 'Financial Analysis — Non-bank mode'])
    analysis.mergeCells('A1:B1')
    analysis.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: '102D2B' } }
    analysis.addRow(['Annual metrics · ₹ crore unless stated', 'Derived values use the formulas shown in the application.'])
    analysis.addRow(['Period','Sales','Total income','Net profit','Operating profit','Operating cash flow','FCF: OCF − CWIP','Dividend amount','Dividend/share (₹)','Payout (%)','EPS (₹)','GPM (%)','OPM (%)','NPM (%)','Receivables','Inventory','Net block','CWIP','CWIP/Net block (%)','Equity','Borrowings','Debt/equity (×)','ROE (%)','ROA (%)','ROCE (%)','Interest coverage (×)','Other assets','Other liabilities','Current ratio · Other assets/liabilities (×)','Cash ratio (×)','Total assets','Other assets / total assets (%)','Cash / total assets (%)','Cash & bank','Adjusted shares (Cr)'])
    styleHeader(analysis.getRow(3))
    for (const r of data.annual) analysis.addRow([r.period,r.sales,r.totalIncome,r.netProfit,r.operatingProfit,r.operatingCashFlow,r.freeCashFlow,r.dividend,r.dividendPerShare,r.dividendPayout,r.eps,r.grossProfitMargin,r.operatingProfitMargin,r.netProfitMargin,r.receivables,r.inventory,r.netBlock,r.cwip,r.netBlockToCwip,r.equity,r.borrowings,r.debtToEquity,r.roe,r.roa,r.roce,r.interestCoverage,r.otherAssets,r.otherLiabilities,r.currentRatio,r.cashRatio,r.totalAssets,r.currentAssetsToTotalAssets,r.cashToTotalAssets,r.cashBank,r.sharesCr])
    analysis.addRow([])
    analysis.addRow(['Quarterly metrics · ₹ crore unless stated'])
    analysis.addRow(['Period','Sales','Net profit','Operating profit','OPM (%)','NPM (%)'])
    styleHeader(analysis.getRow(analysis.rowCount))
    for (const r of data.quarterly) analysis.addRow([r.period,r.sales,r.netProfit,r.operatingProfit,r.operatingProfitMargin,r.netProfitMargin])
    analysis.columns.forEach((column, index) => { column.width = index === 0 ? 23 : 17 })
    analysis.getRow(2).font = { italic: true, color: { argb: '65776E' }, size: 9 }
    analysis.views = [{ state: 'frozen', ySplit: 3 }]
    const defs = book.addWorksheet('Definitions')
    defs.addRows([
      ['Metric','Definition used'],
      ['GPM (annual)','100 × (Sales + Change in Inventory − Raw Material Cost) ÷ Sales'],
      ['OPM (annual)','100 × (Sales + Change in Inventory − Raw Material Cost − Power & Fuel − Other Manufacturing − Employee − Selling/Admin − Other Expenses) ÷ Sales'],
      ['NPM','100 × Net profit ÷ Sales'],
      ['EPS','Net profit (₹ crore) ÷ adjusted equity shares (crore)'],
      ['Dividend/share','Dividend amount (₹ crore) ÷ adjusted equity shares (crore)'],
      ['Dividend payout','100 × Dividend amount ÷ Net profit; explicit zero dividend produces zero per share and payout'],
      ['Equity','Share capital + reserves'],
      ['Debt to equity','Borrowings ÷ equity'],
      ['ROE / ROA','Net profit ÷ average equity / average total assets; first period is blank if no prior year is available'],
      ['FCF (user-defined)','Operating cash flow − Capital Work in Progress (CWIP)'],
      ['CapEx proxy','CWIP is used as the requested proxy; CWIP is a balance-sheet amount, not cash capex incurred during the year'],
      ['Asset ratio','Other Assets ÷ Total Assets, following the selected proxy'],
      ['Current ratio','Other Assets ÷ Other Liabilities, as requested for this report'],
      ['Cash ratio','Cash & Bank ÷ Other Liabilities'],
      ['Quarterly OPM / NPM','100 × Operating profit / Sales; 100 × Net profit / Sales'],
      ['Units','Financial statements are shown as supplied; share count in crore and per-share values in ₹.'],
      ['Source file',data.sourceFileName],
    ])
    styleHeader(defs.getRow(1))
    defs.columns = [{ width: 26 }, { width: 115 }]
    defs.eachRow((row, number) => { if (number > 1) row.alignment = { wrapText: true, vertical: 'top' } })

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
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${safeName(data.companyName)}_Complete_Report.xlsx`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}

type AutoTableFn = typeof import('jspdf-autotable').default

function appendAboutPdfSection(
  doc: import('jspdf').jsPDF,
  autoTable: AutoTableFn,
  startY: number,
  margin: number,
  about?: AboutState | null,
): void {
  const data = about?.data || (about?.sources as unknown as import('./types').ScreenerAboutData)
  if (!data?.about_intro && !about?.ai && !about?.sources) return
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

  if (data?.about_intro) {
    sectionHeading('Screener.in Corporate Profile & Overview', y)
    const rows: Array<[string, string]> = []
    if (data.company_info?.name) rows.push(['Company Name', pdfText(data.company_info.name)])
    if (data.company_info?.symbol) rows.push(['Symbol', pdfText(data.company_info.symbol)])
    if (data.company_info?.sector) rows.push(['Sector & Industry', pdfText(data.company_info.sector)])
    if (data.about_intro.text) rows.push(['About Description', pdfText(data.about_intro.text)])
    if (data.ratios && data.ratios.length > 0) {
      rows.push(['Key Financial Ratios', pdfText(data.ratios.map(r => `${r.label}: ${r.value}`).join(' | '))])
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
      if (y > 220) { doc.addPage(); y = 18 }
      sectionHeading(`Read More Operational Insights (${data.paragraphs.length} Topics)`, y)
      const commRows: Array<[string, string]> = data.paragraphs.map(p => [
        pdfText(p.title || `Dimension #${p.id}`),
        pdfText(p.bullets && p.bullets.length > 0 ? p.bullets.map(b => `• ${b}`).join('\n') : p.text),
      ])
      autoTable(doc, {
        ...baseTable,
        startY: y + 4,
        head: [['Commentary Topic', 'Details & Operational Breakdown']],
        body: commRows,
        columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      })
      const lastY2 = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60
      y = lastY2 + 8
    }

    if ((data.pros && data.pros.length > 0) || (data.cons && data.cons.length > 0)) {
      if (y > 220) { doc.addPage(); y = 18 }
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
      if (y > 230) { doc.addPage(); y = 18 }
      sectionHeading(`Verified Source Filings (${data.footnotes.length} References)`, y)
      autoTable(doc, {
        ...baseTable,
        startY: y + 4,
        head: [['Ref', 'Source / Filing Description', 'URL']],
        body: data.footnotes.map(fn => [pdfText(`[${fn.num}]`), pdfText(fn.title || 'Source Filing'), pdfText(fn.url)]),
        columnStyles: { 0: { cellWidth: 16, fontStyle: 'bold' }, 1: { cellWidth: 60 }, 2: { cellWidth: 'auto' } },
      })
    }
  }



  if (data?.about_intro) {
    doc.addPage()
  }
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
    doc.setFillColor(16,45,43); doc.rect(0,0,pageWidth,42,'F')
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(23); doc.text(data.companyName,margin,20)
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text('Complete Corporate Intelligence & Bank Financial Report',margin,30)
    doc.text(`Source: ${data.sourceFileName}   •   ${data.annual[0]?.period ?? ''} to ${data.annual.at(-1)?.period ?? ''}`,margin,37)
    appendAboutPdfSection(doc, autoTable, 50, margin, about)
    const finStartY = about?.data || about?.sources ? 23 : 58
    title('Annual earnings, income & returns', finStartY - 5)
    autoTable(doc, { ...tableOptions, startY: finStartY, head: [['Year','Interest earned','Interest paid','Gap %','Other income','Total revenue','Total expense','PBT','Net profit','OPM %','NPM %','ROE %','ROA %']], body: data.annual.map(r => [r.period,display(r.interestEarned,0),display(r.interestPaid,0),display(r.interestGap,1),display(r.otherIncome,0),display(r.totalRevenue,0),display(r.totalExpense,0),display(r.profitBeforeTax,0),display(r.netProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1),display(r.roe,1),display(r.roa,1)]), ...tableOptions })
    doc.addPage(); title('Annual balance sheet & shareholder metrics', 18)
    autoTable(doc, { ...tableOptions, startY: 23, head: [['Year','Dividend','DPS ₹','Payout %','EPS ₹','Equity','Borrowings','Borrowings/equity ×','Cash & Bank','Other liabilities','Liquidity %','Total assets','Other assets']], body: data.annual.map(r => [r.period,display(r.dividend,0),display(r.dividendPerShare),display(r.dividendPayout,1),display(r.eps),display(r.equity,0),display(r.borrowings,0),display(r.debtToEquity),display(r.cashBank,0),display(r.otherLiabilities,0),display(r.liquidity,1),display(r.totalAssets,0),display(r.otherAssets,0)]), ...tableOptions })
    let qY = ((doc as unknown as {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY ?? 160) + 12
    if (qY > 178) { doc.addPage(); qY = 18 }
    title('Quarterly analysis', qY)
    autoTable(doc, { ...tableOptions, startY: qY + 5, head: [['Quarter','Interest earned','Interest paid','Gap %','Other income','Total revenue','Expenses','Total expense','Operating profit','Net profit','OPM %','NPM %']], body: data.quarterly.map(r => [r.period,display(r.interestEarned,0),display(r.interestPaid,0),display(r.interestGap,1),display(r.otherIncome,0),display(r.totalRevenue,0),display(r.expenses,0),display(r.totalExpense,0),display(r.operatingProfit,0),display(r.netProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1)]), ...tableOptions })
    doc.addPage(); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.setTextColor(16,45,43); doc.text('Method & data availability',margin,18)
    const notes = [
      'Annual and quarterly interest earned = Sales. Interest paid = Interest. Total revenue = interest earned + Other Income.',
      'Annual total expense uses reported components when complete; otherwise it uses Total Revenue − reported PBT. Quarterly total expense = Expenses + Interest.',
      'OPM = 100 × (Total Revenue − Total expense) ÷ Total Revenue. NPM = 100 × Net profit ÷ Total Revenue. Interest gap = 100 × (interest earned − interest paid) ÷ interest earned.',
      'ROE / ROA use net profit divided by average equity / average total assets. Liquidity = 100 × Cash & Bank ÷ (Borrowings + Other Liabilities).',
      'Borrowings/equity is displayed as requested in the bank prompt; interpret as a user-defined bank funding ratio.',
      ...data.warnings,
      ...data.missingMetrics,
    ]
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(63,78,69)
    let y = 30
    for (const note of notes) { const lines = doc.splitTextToSize(`• ${note}`, pageWidth - 2 * margin); doc.text(lines, margin, y); y += lines.length * 4.5 + 3 }
    for (let i = 0; i < charts.length; i += 2) {
      doc.addPage()
      for (let j = 0; j < 2 && i + j < charts.length; j++) {
        const chart = charts[i + j], top = 10 + j * 95
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(16,45,43); doc.text(chart.title,margin,top+6)
        doc.addImage(chart.dataUrl,'PNG',margin,top+9,pageWidth-2*margin,78,undefined,'FAST')
      }
    }
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(119,132,124); doc.text(`${data.companyName} · Ledger Bank Analysis`,margin,doc.internal.pageSize.getHeight()-5); doc.text(`${page} / ${pages}`,pageWidth-margin,doc.internal.pageSize.getHeight()-5,{align:'right'}) }
    doc.save(`${safeName(data.companyName)}_Complete_Report.pdf`)
  } finally { button.disabled = false; button.textContent = oldText }
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
    appendAboutPdfSection(doc, autoTable, 50, margin, about)
    const finStartY = about?.data || about?.sources ? 23 : 58
    doc.setTextColor(31, 55, 47)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Annual analysis table', margin, finStartY - 5)
    const annualBody = data.annual.map(r => [r.period,display(r.sales,0),display(r.netProfit,0),display(r.operatingProfit,0),display(r.grossProfitMargin,1),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1),display(r.operatingCashFlow,0),display(r.freeCashFlow,0),display(r.eps),display(r.dividendPerShare),display(r.dividendPayout,1),display(r.debtToEquity),display(r.roe,1),display(r.roa,1)])
    autoTable(doc, { startY: finStartY, head: [['Year','Sales','Net profit','Op. profit','GPM %','OPM %','NPM %','CFO','FCF*','EPS ₹','DPS ₹','Payout %','D/E ×','ROE %','ROA %']], body: annualBody, theme: 'grid', styles: { fontSize: 6.7, cellPadding: 2.1, textColor: [39,56,48], lineColor: [222,231,225] }, headStyles: { fillColor: [16,45,43], textColor: [255,255,255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244,248,245] }, margin: { left: margin, right: margin } })
    let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 140
    y += 8
    if (y > 180) { doc.addPage(); y = 18 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Quarterly snapshot', margin, y)
    autoTable(doc, { startY: y + 4, head: [['Quarter','Sales','Net profit','Operating profit','OPM %','NPM %']], body: data.quarterly.map(r => [r.period,display(r.sales,0),display(r.netProfit,0),display(r.operatingProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1)]), theme: 'grid', styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [22,139,114] }, margin: { left: margin, right: margin } })
    doc.addPage()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(31,55,47)
    doc.text('Annual balance sheet, investment & return metrics', margin, 18)
    autoTable(doc, { startY: 23,
      head: [['Year','Receivables','Inventory','Net block','CWIP','CWIP/Net block %','Equity','Borrowings','D/E ×','ROE %','ROA %','Assets','Current assets/assets %','Cash/bank']],
      body: data.annual.map(r => [r.period,display(r.receivables,0),display(r.inventory,0),display(r.netBlock,0),display(r.cwip,0),display(r.netBlockToCwip,1),display(r.equity,0),display(r.borrowings,0),display(r.debtToEquity),display(r.roe,1),display(r.roa,1),display(r.totalAssets,0),display(r.currentAssetsToTotalAssets,1),display(r.cashBank,0)]),
      theme: 'grid', styles: { fontSize: 6.7, cellPadding: 2.1, textColor: [39,56,48], lineColor: [222,231,225] }, headStyles: { fillColor: [16,45,43], textColor: [255,255,255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244,248,245] }, margin: { left: margin, right: margin } })
    const notes = [
      '* FCF is the user-defined measure Operating Cash Flow − CWIP; CWIP is a balance-sheet balance and is not the same as cash CapEx incurred during a year.',
      'EPS and dividend/share = ₹ crore ÷ adjusted shares in crore. Debt/equity = borrowings ÷ (share capital + reserves). ROE/ROA use average equity/assets.',
      'The requested Current Assets proxy is Other Assets. Blank source values remain missing; explicit zero dividend produces zero DPS and payout.',
      ...data.warnings,
    ]
    doc.addPage()
    doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.setTextColor(16,45,43); doc.text('Method & data checks', margin, 18)
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(63,78,69)
    let noteY = 31
    for (const note of notes) {
      const lines = doc.splitTextToSize(`- ${note}`, pageWidth - 2 * margin)
      doc.text(lines, margin, noteY)
      noteY += lines.length * 5.3 + 4
    }
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
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(119,132,124)
      doc.text(`${data.companyName}  ·  Ledger Financial Visualizer`, margin, doc.internal.pageSize.getHeight() - 5)
      doc.text(`${page} / ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 5, { align: 'right' })
    }
    doc.save(`${safeName(data.companyName)}_Complete_Report.pdf`)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}

