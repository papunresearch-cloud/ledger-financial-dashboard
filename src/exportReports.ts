import type ExcelJS from 'exceljs'
import type { BankData, FinancialData } from './types'

type CapturedChart = { title: string; dataUrl: string }
const safeName = (value: string) => value.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'COMPANY'
const display = (value: number | null, decimals = 2) => value === null || !Number.isFinite(value) ? '—' : Number(value.toFixed(decimals))
const excelValue = (value: unknown): string | number | boolean | Date | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

async function captureCharts(): Promise<CapturedChart[]> {
  const { default: html2canvas } = await import('html2canvas')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-export-chart-card]'))
  const captured: CapturedChart[] = []
  for (const card of cards) {
    const snapshot = card.querySelector<HTMLElement>('.chart-snapshot')
    if (!snapshot) continue
    const darkChart = card.classList.contains('chart-card-dark')
    const canvas = await html2canvas(snapshot, { backgroundColor: darkChart ? '#10211e' : '#ffffff', scale: 1.5, logging: false, useCORS: true })
    const title = card.querySelector('h3')?.textContent?.trim() ?? 'Financial chart'
    captured.push({ title, dataUrl: canvas.toDataURL('image/png') })
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

async function exportBankExcel(data: BankData, button: HTMLButtonElement) {
  button.disabled = true
  const oldText = button.textContent
  button.textContent = 'Preparing workbook…'
  try {
    const { default: ExcelJSRuntime } = await import('exceljs')
    const charts = await captureCharts()
    const book = new ExcelJSRuntime.Workbook()
    book.creator = 'Ledger Financial Visualizer'
    book.created = new Date()
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
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${safeName(data.companyName)}_Bank_Analysis.xlsx`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  } finally { button.disabled = false; button.textContent = oldText }
}

export async function exportExcel(data: FinancialData, button: HTMLButtonElement) {
  if (data.mode === 'bank') return exportBankExcel(data, button)
  button.disabled = true
  const oldText = button.textContent
  button.textContent = 'Preparing workbook…'
  try {
    const { default: ExcelJSRuntime } = await import('exceljs')
    const charts = await captureCharts()
    const book = new ExcelJSRuntime.Workbook()
    book.creator = 'Ledger Financial Visualizer'
    book.created = new Date()
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
    link.download = `${safeName(data.companyName)}_Financial_Analysis.xlsx`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}

async function exportBankPdf(data: BankData, button: HTMLButtonElement) {
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
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text('Bank Financial Visual Report',margin,30)
    doc.text(`Source: ${data.sourceFileName}   •   ${data.annual[0]?.period ?? ''} to ${data.annual.at(-1)?.period ?? ''}`,margin,37)
    title('Annual earnings, income & returns', 53)
    autoTable(doc, { ...tableOptions, startY: 58, head: [['Year','Interest earned','Interest paid','Gap %','Other income','Total revenue','Total expense','PBT','Net profit','OPM %','NPM %','ROE %','ROA %']], body: data.annual.map(r => [r.period,display(r.interestEarned,0),display(r.interestPaid,0),display(r.interestGap,1),display(r.otherIncome,0),display(r.totalRevenue,0),display(r.totalExpense,0),display(r.profitBeforeTax,0),display(r.netProfit,0),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1),display(r.roe,1),display(r.roa,1)]), ...tableOptions })
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
    doc.save(`${safeName(data.companyName)}_Bank_Analysis.pdf`)
  } finally { button.disabled = false; button.textContent = oldText }
}

export async function exportPdf(data: FinancialData, button: HTMLButtonElement) {
  if (data.mode === 'bank') return exportBankPdf(data, button)
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
    doc.text('Financial Statement Visual Report · Non-bank analysis', margin, 30)
    doc.text(`Source: ${data.sourceFileName}   •   ${data.annual[0]?.period ?? ''} to ${data.annual.at(-1)?.period ?? ''}`, margin, 37)
    doc.setTextColor(31, 55, 47)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Annual analysis table', margin, 53)
    const annualBody = data.annual.map(r => [r.period,display(r.sales,0),display(r.netProfit,0),display(r.operatingProfit,0),display(r.grossProfitMargin,1),display(r.operatingProfitMargin,1),display(r.netProfitMargin,1),display(r.operatingCashFlow,0),display(r.freeCashFlow,0),display(r.eps),display(r.dividendPerShare),display(r.dividendPayout,1),display(r.debtToEquity),display(r.roe,1),display(r.roa,1)])
    autoTable(doc, { startY: 58, head: [['Year','Sales','Net profit','Op. profit','GPM %','OPM %','NPM %','CFO','FCF*','EPS ₹','DPS ₹','Payout %','D/E ×','ROE %','ROA %']], body: annualBody, theme: 'grid', styles: { fontSize: 6.7, cellPadding: 2.1, textColor: [39,56,48], lineColor: [222,231,225] }, headStyles: { fillColor: [16,45,43], textColor: [255,255,255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244,248,245] }, margin: { left: margin, right: margin } })
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
    doc.save(`${safeName(data.companyName)}_Financial_Analysis.pdf`)
  } finally {
    button.disabled = false
    button.textContent = oldText
  }
}

