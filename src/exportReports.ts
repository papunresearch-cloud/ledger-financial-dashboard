import type ExcelJS from 'exceljs'
import type { AboutState, BankData, FinancialData } from './types'
import { PEER_METRIC_COLUMNS, PEER_TABLE_HEADERS, resolvePeerComparison, type NormalizedPeerRow } from './peerComparison'
import { formatPromoterProfileText, normalizePromoterProfile, resolveShareholding } from './promoterProfile'

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

const formatArchetypeText = (bm?: AboutState['ai'] extends infer T ? T extends { summary_report?: infer S } ? S extends { business_model_type?: infer B } ? B : unknown : unknown : unknown): string => {
  if (!bm) return ''
  if (typeof bm === 'string') return bm.trim()
  if (typeof bm === 'object' && !Array.isArray(bm)) {
    const obj = bm as { primary_tags?: unknown; note?: unknown }
    const tags = Array.isArray(obj.primary_tags) ? obj.primary_tags.map(safeTextVal).filter(Boolean).join(', ') : safeTextVal(obj.primary_tags)
    const note = safeTextVal(obj.note).trim()
    return [tags, note].filter(Boolean).join(' — ')
  }
  return safeTextVal(bm)
}
const stripEmphasis = (txt: string) =>
  txt
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/<\/?u>/gi, '')

const cleanCite = (text: unknown) =>
  stripEmphasis(safeTextVal(text))
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[+([\d\s,]+)\]+/g, '[$1]')
    .replace(/\s+/g, ' ')
    .trim()
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
  if (!about?.ai && !about?.sources) return

  const ws = book.addWorksheet('About & Summary', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [
    { width: 32 },
    { width: 95 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
  ]
  const compInfo = about.sources?.company_info
  ws.addRow([compInfo?.name || companyName, compInfo?.symbol ? `Symbol: ${compInfo.symbol}` : 'Corporate Intelligence & Summary Report'])
  ws.mergeCells('A1:F1')
  ws.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: '102D2B' } }
  ws.addRow(['Updated / Status', about.sources?.generated_at || about.status])
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

  const ai = about.ai
  const sum = ai?.summary_report
  const promoterProf = normalizePromoterProfile(sum?.promoter_and_owner)
  const shareholding = resolveShareholding(about)
  if (sum) {
    addBanner('SUMMARY REPORT')
    addKV('Company Name & Listed Identity', sum.company_name || companyName)
    addKV('Promoter Group & Ownership Profile', formatPromoterProfileText(promoterProf))
    addKV('Sector & Industry Classification', sum.sector_and_industry)
    addKV('Market Position & Peers Narrative', sum.market_position_and_peers)
    const overviewCombined = [
      formatArchetypeText(sum.business_model_type) ? `Business Model Archetype: ${formatArchetypeText(sum.business_model_type)}` : '',
      ai?.executive_summary || '',
    ].filter(Boolean).join('\n')
    addKV('Business Overview (Integrated)', overviewCombined)
    addKV('Business Model, Products & Services', sum.business_model_short)
    addKV('Primary Revenue Sources', sum.revenue_sources_short)
    if (sum.revenue_breakups) {
      if (typeof sum.revenue_breakups === 'string') {
        addKV('Revenue Breakups', sum.revenue_breakups)
      } else {
        const parts = [
          sum.revenue_breakups.product_wise ? `Product-Wise: ${cleanCite(sum.revenue_breakups.product_wise)}` : '',
          sum.revenue_breakups.geography_wise ? `Geography-Wise: ${cleanCite(sum.revenue_breakups.geography_wise)}` : '',
          sum.revenue_breakups.consolidated_vs_standalone ? `Consolidated vs Standalone: ${cleanCite(sum.revenue_breakups.consolidated_vs_standalone)}` : '',
        ].filter(Boolean)
        if (parts.length) addKV('Revenue Breakups', parts.join('\n'))
      }
    }
    if (sum.profitability_analysis) {
      if (typeof sum.profitability_analysis === 'string') {
        addKV('Profitability Analysis', sum.profitability_analysis)
      } else {
        const parts = [
          sum.profitability_analysis.current_vs_avg_margin ? `Current vs Average Margin: ${cleanCite(sum.profitability_analysis.current_vs_avg_margin)}` : '',
          sum.profitability_analysis.profitability_factors ? `Margin Drivers: ${cleanCite(sum.profitability_analysis.profitability_factors)}` : '',
          sum.profitability_analysis.profit_contribution_consol_vs_standalone ? `Profit Contribution (Consol vs Standalone): ${cleanCite(sum.profitability_analysis.profit_contribution_consol_vs_standalone)}` : '',
        ].filter(Boolean)
        if (parts.length) addKV('Profitability, Margins & Drivers', parts.join('\n'))
      }
    }
    addKV('Major Financial Issues (CF, Debt & Watch)', sum.financial_issues)
    addKV('Subsidiaries, Associates & Partners', sum.partners_and_subsidiaries)
    addKV('Growth Probability, Order Book & Capex', sum.growth_capex_orderbook)
    addKV('Current Legal, Regulatory & Operational Issues', sum.current_issues)
    if (sum.investor_risks_and_opportunities) {
      if (typeof sum.investor_risks_and_opportunities === 'string') {
        addKV('Opportunities & Key Risks', sum.investor_risks_and_opportunities)
      } else {
        addKV('Investor Opportunities', sum.investor_risks_and_opportunities.opportunities)
        addKV('Investor Key Risks', sum.investor_risks_and_opportunities.risks)
      }
    }
    addKV('Additional Strategic Highlights', sum.additional_insights)
  }

  const peerComp = resolvePeerComparison(about)
  const peerRowsAll: NormalizedPeerRow[] = peerComp.median ? [...peerComp.rows, peerComp.median] : peerComp.rows
  if (peerRowsAll.length > 0) {
    const peerSheet = book.addWorksheet('Peer Comparison', { views: [{ state: 'frozen', ySplit: 4 }] })
    peerSheet.columns = [
      { width: 32 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 11 },
      { width: 11 },
      { width: 11 },
      { width: 11 },
      { width: 13 },
      { width: 18 },
      { width: 16 },
      { width: 11 },
      { width: 11 },
    ]
    peerSheet.addRow([`${compInfo?.name || companyName} — Peer Comparison & Market Position`])
    peerSheet.mergeCells('A1:N1')
    peerSheet.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
    peerSheet.addRow([
      peerComp.sectorPath.length
        ? `Sector: ${peerComp.sectorPath.join(' > ')}`
        : 'Source: Screener Peer Comparison Section',
    ])
    peerSheet.mergeCells('A2:N2')
    peerSheet.getRow(2).font = { italic: true, color: { argb: '475569' }, size: 9 }
    peerSheet.addRow([])

    const hdr = peerSheet.addRow(PEER_TABLE_HEADERS)
    styleHeader(hdr)
    hdr.eachCell((cell, colIdx) => {
      cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right', wrapText: true }
    })
    for (const peer of peerRowsAll) {
      const prefix = peer.s_no && !peer.is_median ? `${peer.s_no} ` : ''
      const pr = peerSheet.addRow([
        `${prefix}${peer.company}${peer.is_target ? ' ★' : ''}`,
        ...PEER_METRIC_COLUMNS.map(col => peer[col.key] || '-'),
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
    peerSheet.mergeCells(`A${fnRow.number}:N${fnRow.number}`)
    fnRow.getCell(1).font = { name: 'Aptos', italic: true, size: 9, color: { argb: '475569' } }
  }

  if (shareholding.hasAny) {
    const shpSheet = book.addWorksheet('Shareholding & Promoters')
    shpSheet.columns = [
      { width: 32 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ]
    shpSheet.addRow([`${compInfo?.name || companyName} — Shareholding Pattern (5Q & 5Y)`])
    shpSheet.mergeCells('A1:F1')
    shpSheet.getCell('A1').font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: '102D2B' } }
    if (shareholding.pledged_pct) {
      shpSheet.addRow([`Promoter Pledged Holding: ${shareholding.pledged_pct}`])
    }

    const writeShpTable = (heading: string, headers: string[], rows: typeof shareholding.quarterly.rows, note?: string) => {
      if (!headers.length || !rows.length) return
      shpSheet.addRow([])
      const bRow = shpSheet.addRow([heading])
      bRow.getCell(1).font = { name: 'Aptos', bold: true, size: 11, color: { argb: '102D2B' } }
      const hdrRow = shpSheet.addRow(['Holder Category', ...headers])
      styleHeader(hdrRow)
      hdrRow.eachCell((cell, colIdx) => {
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
      })
      for (const r of rows) {
        const dRow = shpSheet.addRow([r.label, ...headers.map((_, idx) => r.values[idx] || '-')])
        dRow.eachCell((cell, colIdx) => {
          cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
          if (r.is_count) {
            cell.fill = paleFill
            cell.font = { name: 'Aptos', bold: true, size: 10, color: { argb: '102D2B' } }
          }
        })
      }
      if (note) {
        const nRow = shpSheet.addRow([note])
        nRow.getCell(1).font = { italic: true, size: 9, color: { argb: '475569' } }
      }
    }

    writeShpTable(
      `QUARTERLY SHAREHOLDING PATTERN (Last ${shareholding.quarterly.headers.length} Quarters)`,
      shareholding.quarterly.headers,
      shareholding.quarterly.rows,
      shareholding.quarterly.note,
    )
    writeShpTable(
      `YEARLY SHAREHOLDING PATTERN (Last ${shareholding.yearly.headers.length} Years)`,
      shareholding.yearly.headers,
      shareholding.yearly.rows,
      shareholding.yearly.note,
    )

    if ((shareholding.named_promoters ?? []).length > 0) {
      shpSheet.addRow([])
      const nBanner = shpSheet.addRow(['NAMED PROMOTER SHAREHOLDERS'])
      nBanner.getCell(1).font = { name: 'Aptos', bold: true, size: 11, color: { argb: '102D2B' } }
      const nh = shpSheet.addRow(['Promoter / Entity', 'Latest %', 'Prev %', 'Period'])
      styleHeader(nh)
      for (const p of shareholding.named_promoters ?? []) {
        shpSheet.addRow([p.name, p.latest_pct, p.prev_pct, p.period])
      }
    }
  }

  if (ai) {
    if ((ai.revenue_breakup ?? []).length > 0) {
      ws.addRow([])
      addBanner('BUSINESS DETAILS — SEGMENTS & REVENUE MIX')
      const h = ws.addRow(['Segment', 'Details', 'Share (%)'])
      styleHeader(h)
      for (const seg of ai.revenue_breakup ?? []) {
        const r = ws.addRow([seg.category, seg.details || '', `${Number(seg.percentage || 0).toFixed(1)}%`])
        r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      }
    }

    if ((ai.geographical_reach ?? []).length > 0) {
      ws.addRow([])
      addBanner('BUSINESS DETAILS — GEOGRAPHICAL DISTRIBUTION & REACH')
      const h = ws.addRow(['Region', 'Presence Details', 'Share (%)'])
      styleHeader(h)
      for (const geo of ai.geographical_reach ?? []) {
        const r = ws.addRow([geo.region, geo.details || '', `${Number(geo.percentage || 0).toFixed(1)}%`])
        r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      }
    }

    if ((ai.factories_and_plants ?? []).length > 0) {
      ws.addRow([])
      addBanner('FACTORIES, PLANTS & OPERATING FACILITIES')
      const h = ws.addRow(['Facility / Plant', 'Location', 'Details'])
      styleHeader(h)
      for (const fac of ai.factories_and_plants ?? []) {
        const r = ws.addRow([fac.name, fac.location || '-', fac.details || ''])
        r.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      }
    }

    if ((ai.subsidiaries_list ?? []).length > 0) {
      ws.addRow([])
      addBanner('SUBSIDIARIES, ASSOCIATES & JOINT VENTURES')
      const h = ws.addRow(['Entity Name', 'Relationship', 'Details'])
      styleHeader(h)
      for (const sub of ai.subsidiaries_list ?? []) {
        const r = ws.addRow([sub.name, sub.relationship || '-', sub.details || ''])
        r.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      }
    }

    const fp = ai.financial_position_summary
    if (fp && (fp.overall_stance || fp.sales_yearly_and_ttm || fp.sales_quarterly_momentum || fp.pnl_yearly_and_ttm || fp.balance_sheet_health || fp.cash_flow_quality)) {
      ws.addRow([])
      addBanner('FINANCIAL POSITION & STATEMENT SUMMARY')
      addKV('Overall Financial Stance', [fp.trend_status ? `[${fp.trend_status}]` : '', fp.overall_stance].filter(Boolean).join(' '))
      addKV('Sales Trajectory (Yearly & TTM)', fp.sales_yearly_and_ttm)
      addKV('Quarterly Sales Momentum (QoQ & YoY)', fp.sales_quarterly_momentum)
      addKV('P&L Trajectory (Yearly & TTM)', fp.pnl_yearly_and_ttm)
      addKV('Quarterly P&L Momentum (QoQ & YoY)', fp.pnl_quarterly_trend)
      addKV('Balance Sheet Health & Solvency', fp.balance_sheet_health)
      addKV('Cash Flow & Free Cash Flow Quality', fp.cash_flow_quality)
      if ((fp.strengths_good ?? []).length > 0) {
        addKV('Financial Strengths (Good)', (fp.strengths_good ?? []).join('\n'))
      }
      if ((fp.watchpoints_bad ?? []).length > 0) {
        addKV('Financial Watchpoints (Bad)', (fp.watchpoints_bad ?? []).join('\n'))
      }
      addKV('Current Financial Trend', fp.current_trend_verdict)
    }

    const finSnap = about.sources?.financial_snapshot
    const exportRatioSheet = (sheetName: string, title: string, tbl?: NonNullable<typeof finSnap>['quarterly_ratios']) => {
      if (!tbl?.headers?.length || !tbl?.rows?.length) return
      const rSheet = book.addWorksheet(sheetName)
      rSheet.columns = [{ width: 34 }, ...tbl.headers.map(() => ({ width: 15 }))]
      rSheet.addRow([title])
      rSheet.mergeCells(1, 1, 1, tbl.headers.length + 1)
      rSheet.getCell('A1').font = { name: 'Aptos Display', size: 14, bold: true, color: { argb: '102D2B' } }
      rSheet.addRow([])
      const hdr = rSheet.addRow(['Financial Ratio', ...tbl.headers])
      styleHeader(hdr)
      hdr.eachCell((cell, colIdx) => {
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
      })
      for (const rr of tbl.rows) {
        const dRow = rSheet.addRow([rr.label, ...tbl.headers.map((_, i) => rr.values[i] || '-')])
        dRow.eachCell((cell, colIdx) => {
          cell.alignment = { vertical: 'middle', horizontal: colIdx === 1 ? 'left' : 'right' }
          if (colIdx === 1) cell.font = { name: 'Aptos', bold: true, size: 10, color: { argb: '0F172A' } }
        })
      }
      if ((tbl.formulas ?? []).length > 0) {
        rSheet.addRow([])
        const fRow = rSheet.addRow([`Formulas Used (Screener Data): ${(tbl.formulas ?? []).join(' · ')}`])
        rSheet.mergeCells(fRow.number, 1, fRow.number, tbl.headers.length + 1)
        fRow.getCell(1).font = { name: 'Aptos', italic: true, size: 9, color: { argb: '475569' } }
        fRow.getCell(1).alignment = { wrapText: true }
        fRow.height = estimateRowHeight(String(fRow.getCell(1).value || ''), 120)
      }
    }
    const qHasTtm = Boolean(finSnap?.quarterly_ratios?.headers?.some(h => h.trim().toUpperCase() === 'TTM'))
    const qCnt = Math.max(0, (finSnap?.quarterly_ratios?.headers?.length ?? 0) - (qHasTtm ? 1 : 0))
    const yCnt = finSnap?.yearly_ratios?.headers?.length ?? 0
    const qScope = finSnap?.quarterly_ratios?.scope ? ` [${finSnap.quarterly_ratios.scope}]` : ''
    const yScope = finSnap?.yearly_ratios?.scope ? ` [${finSnap.yearly_ratios.scope}]` : ''
    exportRatioSheet(`Quarterly Ratios (${qCnt}Q${qHasTtm ? '+TTM' : ''})`, `${compInfo?.name || companyName} — Quarterly Financial Ratios (Last ${qCnt} Quarters${qHasTtm ? ' + TTM' : ''})${qScope}`, finSnap?.quarterly_ratios)
    exportRatioSheet(`Yearly Ratios (${yCnt}Y)`, `${compInfo?.name || companyName} — Yearly Financial Ratios (Last ${yCnt} Years)${yScope}`, finSnap?.yearly_ratios)

    if (ai.official_site_highlights && (ai.official_site_highlights.headline || ai.official_site_highlights.core_assets)) {
      ws.addRow([])
      addBanner('OFFICIAL CORPORATE DISCLOSURES')
      addKV('Official Website Headline', ai.official_site_highlights.headline)
      addKV('Official Website Core Assets', ai.official_site_highlights.core_assets)
    }

    if ((ai.capex_and_order_book ?? []).length > 0) {
      ws.addRow([])
      addBanner('MAJOR CAPEX ANNOUNCEMENTS & ORDER BOOK')
      const h = ws.addRow(['Headline', 'Details', 'Date / Quarter', 'Ref'])
      styleHeader(h)
      for (const cap of ai.capex_and_order_book ?? []) {
        const det = cleanCite(cap.details)
        const r = ws.addRow([cap.headline, det, cap.date || '', cap.source_num ? `[${cap.source_num}]` : ''])
        r.getCell(1).alignment = { wrapText: true, vertical: 'top' }
        r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
        r.height = estimateRowHeight(det, 90)
      }
    }

    if ((ai.regulatory_and_litigation ?? []).length > 0) {
      ws.addRow([])
      addBanner('REGULATORY ACTIONS, PENALTIES & LITIGATION')
      const h = ws.addRow(['Issue', 'Details', 'Severity', 'Ref'])
      styleHeader(h)
      for (const reg of ai.regulatory_and_litigation ?? []) {
        const det = cleanCite(reg.details)
        const r = ws.addRow([reg.issue, det, reg.severity || 'Medium', reg.source_num ? `[${reg.source_num}]` : ''])
        r.getCell(1).alignment = { wrapText: true, vertical: 'top' }
        r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
        r.height = estimateRowHeight(det, 90)
      }
    }
  }

  const newsList = about.sources?.live_intel?.recent_news_12m ?? []
  if (newsList.length > 0) {
    ws.addRow([])
    addBanner('RECENT CORPORATE NEWS (LAST 12 MONTHS — NEWEST FIRST)')
    const h = ws.addRow(['Date', 'Headline', 'Publisher', 'Ref'])
    styleHeader(h)
    for (const item of newsList) {
      const r = ws.addRow([item.date || 'Recent', item.headline || item.title, item.publisher || 'News', item.ref_id ? `[${item.ref_id}]` : ''])
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    }
  }

  if ((ai?.sections ?? []).length > 0) {
    ws.addRow([])
    addBanner('COMPREHENSIVE OPERATIONAL INTELLIGENCE (18 DIMENSIONS)')
    for (const sec of ai?.sections ?? []) {
      const cleanTitle = cleanCite(sec.title).replace(/^\d+[\.\-\s:]+/, '').trim()
      addKV(cleanTitle, sec.content)
    }
  }

  const masterSources = about.sources?.master_sources ?? []
  if (masterSources.length > 0) {
    const srcSheet = book.addWorksheet('Verified Sources', { views: [{ state: 'frozen', ySplit: 1 }] })
    srcSheet.columns = [
      { width: 10 },
      { width: 24 },
      { width: 16 },
      { width: 52 },
      { width: 65 },
    ]
    srcSheet.addRow(['Ref #', 'Source Type', 'Date', 'Document / Article Title', 'URL'])
    styleHeader(srcSheet.getRow(1))
    for (const src of masterSources) {
      const r = srcSheet.addRow([`[${src.id}]`, src.type, src.date || '', src.title || 'Reference Link', src.url])
      r.getCell(4).alignment = { wrapText: true, vertical: 'top' }
      if (src.url && src.url.startsWith('http')) {
        r.getCell(5).value = { text: src.url, hyperlink: src.url }
        r.getCell(5).font = { color: { argb: '0369A1' }, underline: true, size: 9 }
      }
    }
  }
}

async function exportBankExcel(data: BankData, button: HTMLButtonElement, about?: AboutState | null) {
  button.disabled = true
  const oldHtml = button.innerHTML
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
    triggerBlobDownload(blob, `${safeName(data.companyName)}_Complete_Report.xlsx`)
  } finally { button.disabled = false; button.innerHTML = oldHtml }
}

export async function exportExcel(data: FinancialData, button: HTMLButtonElement, about?: AboutState | null) {
  if (data.mode === 'bank') return exportBankExcel(data, button, about)
  button.disabled = true
  const oldHtml = button.innerHTML
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
    triggerBlobDownload(blob, `${safeName(data.companyName)}_Complete_Report.xlsx`)
  } finally {
    button.disabled = false
    button.innerHTML = oldHtml
  }
}
