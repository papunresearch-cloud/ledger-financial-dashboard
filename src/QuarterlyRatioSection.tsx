import { useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Check,
  Clock,
  Copy,
  Layers,
  Percent,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { computeQuarterlyRatios } from './ratioCalculations'
import type { FinancialData, RatioTableRow } from './types'
import './ratioSection.css'

type Props = {
  data: FinancialData
}

function formatInr(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—'
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 1,
  }).format(val)
}

function parseValNum(val: string): number | null {
  if (!val || val === '—' || val === '-') return null
  const clean = val.replace(/[%×₹+,\s]/g, '')
  const num = parseFloat(clean)
  return Number.isFinite(num) ? num : null
}

function getCellTone(label: string, val: string): string {
  if (!val || val === '—' || val === '-') return 'val-neutral'
  const isGrowth = /growth|yoy|qoq/i.test(label)
  if (isGrowth) {
    if (val.startsWith('+')) return 'val-pos'
    if (val.startsWith('-')) return 'val-neg'
  }
  const isNegativeExpense = /provision|expense|cost/i.test(label)
  const num = parseValNum(val)
  if (num !== null) {
    if (num < 0) return 'val-neg'
    if (isNegativeExpense && num > 70) return 'val-neg'
  }
  return 'val-neutral'
}

export function QuarterlyRatioSection({ data }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [copied, setCopied] = useState(false)

  const ratioTable = useMemo(() => computeQuarterlyRatios(data), [data])
  const quarters = data.quarterly
  const isBank = data.mode === 'bank'

  // Summary Metrics
  const summary = useMemo(() => {
    const last4 = quarters.slice(-4)

    if (isBank) {
      const bQuarters = data.quarterly as any[]
      const bLatest = bQuarters.at(-1)
      const bPrevY = bQuarters.length >= 5 ? bQuarters.at(-5) : null
      const rev = bLatest?.totalRevenue ?? bLatest?.interestEarned ?? null
      const prevRev = bPrevY?.totalRevenue ?? bPrevY?.interestEarned ?? null
      const revYoY = rev && prevRev && prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : null
      const np = bLatest?.netProfit ?? null
      const prevNp = bPrevY?.netProfit ?? null
      const npYoY = np && prevNp && prevNp > 0 ? ((np - prevNp) / Math.abs(prevNp)) * 100 : null
      const opm = bLatest?.operatingProfitMargin ?? null
      const npm = bLatest?.netProfitMargin ?? null
      const ttmRev = last4.reduce((s, q: any) => s + (q.totalRevenue ?? q.interestEarned ?? 0), 0)
      const ttmNp = last4.reduce((s, q: any) => s + (q.netProfit ?? 0), 0)

      return {
        titleRev: 'Latest Qtr Revenue',
        revVal: rev,
        revYoY,
        titleNp: 'Latest Qtr Net Profit',
        npVal: np,
        npYoY,
        opmLabel: 'Financing Margin',
        opm,
        npmLabel: 'Net Profit Margin',
        npm,
        ttmRev,
        ttmNp,
      }
    } else {
      const cQuarters = data.quarterly as any[]
      const cLatest = cQuarters.at(-1)
      const cPrevY = cQuarters.length >= 5 ? cQuarters.at(-5) : null
      const sales = cLatest?.sales ?? null
      const prevSales = cPrevY?.sales ?? null
      const salesYoY = sales && prevSales && prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : null
      const np = cLatest?.netProfit ?? null
      const prevNp = cPrevY?.netProfit ?? null
      const npYoY = np && prevNp && prevNp > 0 ? ((np - prevNp) / Math.abs(prevNp)) * 100 : null
      const opm = cLatest?.operatingProfitMargin ?? null
      const npm = cLatest?.netProfitMargin ?? null
      const ttmSales = last4.reduce((s, q: any) => s + (q.sales ?? 0), 0)
      const ttmNp = last4.reduce((s, q: any) => s + (q.netProfit ?? 0), 0)

      return {
        titleRev: 'Latest Qtr Sales',
        revVal: sales,
        revYoY: salesYoY,
        titleNp: 'Latest Qtr Net Profit',
        npVal: np,
        npYoY,
        opmLabel: 'Operating Margin (OPM)',
        opm,
        npmLabel: 'Net Margin (NPM)',
        npm,
        ttmRev: ttmSales,
        ttmNp,
      }
    }
  }, [data, quarters, isBank])

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>()
    ratioTable.rows.forEach(r => {
      if (r.category) set.add(r.category)
    })
    return ['All', ...Array.from(set)]
  }, [ratioTable])

  // Filter rows
  const filteredRows = useMemo(() => {
    return ratioTable.rows.filter(row => {
      const matchesCat = selectedCategory === 'All' || row.category === selectedCategory
      const matchesSearch =
        !searchTerm.trim() ||
        row.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (row.formula && row.formula.toLowerCase().includes(searchTerm.toLowerCase()))
      return matchesCat && matchesSearch
    })
  }, [ratioTable, selectedCategory, searchTerm])

  const copyAsTsv = () => {
    const headerLine = ['Financial Ratio', 'Category', ...ratioTable.headers].join('\t')
    const rowLines = filteredRows.map(r => [r.label, r.category, ...r.values].join('\t'))
    const fullText = [headerLine, ...rowLines].join('\n')
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="ratio-page-container">
      {/* 1. TOP HEADER BANNER */}
      <section className="ratio-top-banner">
        <div className="ratio-banner-left">
          <div className="ratio-avatar-chip avatar-quarterly">
            <Clock size={24} />
          </div>
          <div>
            <div className="ratio-title-row">
              <span className="ratio-company-name">{data.companyName}</span>
              <span className="ratio-scope-tag">
                <Sparkles size={13} /> {isBank ? 'Quarterly Banking Ratios' : 'Quarterly Corporate Ratios'}
              </span>
            </div>
            <p className="ratio-banner-sub">
              Computed directly from {quarters.length} quarterly disclosures · Trailing 4-quarter TTM included
            </p>
          </div>
        </div>
        <div className="ratio-banner-actions">
          <button
            type="button"
            className="ratio-action-btn"
            onClick={copyAsTsv}
            title="Copy table data as tab-separated values for Excel or Google Sheets"
          >
            {copied ? (
              <>
                <Check size={15} /> Copied to Clipboard
              </>
            ) : (
              <>
                <Copy size={15} /> Copy Table (Excel TSV)
              </>
            )}
          </button>
        </div>
      </section>

      {/* 2. TOP KPI CARDS */}
      <div className="ratio-kpi-grid">
        <div className="ratio-kpi-card kpi-accent-cyan">
          <div className="ratio-kpi-header">
            <span>{summary.titleRev}</span>
            <span className="ratio-kpi-icon">
              <Zap size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">
            {summary.revVal !== null ? `₹ ${formatInr(summary.revVal)} Cr` : '—'}
          </div>
          <div className="ratio-kpi-footer">
            {summary.revYoY !== null ? (
              <span className={`ratio-kpi-badge ${summary.revYoY >= 0 ? 'badge-pos' : 'badge-neg'}`}>
                {summary.revYoY >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {summary.revYoY >= 0 ? '+' : ''}
                {summary.revYoY.toFixed(1)}% YoY
              </span>
            ) : (
              <span className="ratio-kpi-badge badge-neutral">Latest Period</span>
            )}
            <small>{quarters.at(-1)?.period ?? ''}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-emerald">
          <div className="ratio-kpi-header">
            <span>{summary.titleNp}</span>
            <span className="ratio-kpi-icon">
              <Activity size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">
            {summary.npVal !== null ? `₹ ${formatInr(summary.npVal)} Cr` : '—'}
          </div>
          <div className="ratio-kpi-footer">
            {summary.npYoY !== null ? (
              <span className={`ratio-kpi-badge ${summary.npYoY >= 0 ? 'badge-pos' : 'badge-neg'}`}>
                {summary.npYoY >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {summary.npYoY >= 0 ? '+' : ''}
                {summary.npYoY.toFixed(1)}% YoY
              </span>
            ) : (
              <span className="ratio-kpi-badge badge-neutral">Net Profit</span>
            )}
            <small>{quarters.at(-1)?.period ?? ''}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-purple">
          <div className="ratio-kpi-header">
            <span>{summary.opmLabel}</span>
            <span className="ratio-kpi-icon">
              <Percent size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">
            {summary.opm !== null ? `${summary.opm.toFixed(2)}%` : '—'}
          </div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Operating Health</span>
            <small>Qtr margin</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-amber">
          <div className="ratio-kpi-header">
            <span>{summary.npmLabel}</span>
            <span className="ratio-kpi-icon">
              <BarChart3 size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">
            {summary.npm !== null ? `${summary.npm.toFixed(2)}%` : '—'}
          </div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Bottom-Line</span>
            <small>Net margin</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-indigo">
          <div className="ratio-kpi-header">
            <span>TTM Revenue (Trailing 4Q)</span>
            <span className="ratio-kpi-icon">
              <Layers size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">
            ₹ {formatInr(summary.ttmRev)} Cr
          </div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-ttm">TTM Rolling</span>
            <small>Sum of 4 quarters</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-rose">
          <div className="ratio-kpi-header">
            <span>TTM Net Profit</span>
            <span className="ratio-kpi-icon">
              <Sparkles size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">
            ₹ {formatInr(summary.ttmNp)} Cr
          </div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-ttm">TTM Rolling</span>
            <small>Sum of 4 quarters</small>
          </div>
        </div>
      </div>

      {/* 3. TABLE CONTROLS & RATIO TABLE */}
      <div className="ratio-table-card">
        <div className="ratio-table-header-bar">
          <div className="ratio-search-wrap">
            <Search size={15} className="ratio-search-icon" />
            <input
              type="text"
              className="ratio-search-input"
              placeholder="Filter by ratio name or formula..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="ratio-search-clear"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>

          <div className="ratio-category-pills">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`ratio-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="ratio-table-wrapper">
          <table className="ratio-table">
            <thead>
              <tr>
                <th className="col-sticky">Financial Ratio</th>
                {ratioTable.headers.map(h => {
                  const isTtm = h.trim().toUpperCase() === 'TTM'
                  return (
                    <th key={h} className={isTtm ? 'col-header-ttm' : undefined}>
                      {h}
                      {isTtm && <span className="ttm-sub-badge">ROLLING</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row: RatioTableRow, rIdx: number) => {
                const prevRow = filteredRows[rIdx - 1]
                const isNewCategory = !prevRow || prevRow.category !== row.category

                return (
                  <tr key={`${row.label}-${rIdx}`}>
                    <td className="col-sticky">
                      <div className="ratio-row-meta">
                        <span className="ratio-row-title">{row.label}</span>
                        {isNewCategory && (
                          <span className="ratio-category-badge">{row.category}</span>
                        )}
                      </div>
                      {row.formula && (
                        <div className="ratio-row-formula" title={row.formula}>
                          {row.formula}
                        </div>
                      )}
                    </td>
                    {ratioTable.headers.map((h, cIdx) => {
                      const isTtm = h.trim().toUpperCase() === 'TTM'
                      const val = row.values[cIdx] ?? '—'
                      const toneClass = getCellTone(row.label, val)

                      return (
                        <td
                          key={`${row.label}-${h}-${cIdx}`}
                          className={[isTtm ? 'ratio-cell-ttm' : '', toneClass]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className="ratio-cell-val">{val}</span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
