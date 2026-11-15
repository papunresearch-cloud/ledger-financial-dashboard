import { useMemo, useState } from 'react'
import {
  Activity,
  Award,
  BarChart3,
  Calendar,
  Check,
  Copy,
  Gauge,
  Percent,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { computeYearlyRatios } from './ratioCalculations'
import type { FinancialData, RatioTableRow } from './types'
import './ratioSection.css'

type Props = {
  data: FinancialData
}

function parseValNum(val: string): number | null {
  if (!val || val === '—' || val === '-') return null
  const clean = val.replace(/[%×₹+,\s]/g, '')
  const num = parseFloat(clean)
  return Number.isFinite(num) ? num : null
}

function getCellTone(label: string, val: string): string {
  if (!val || val === '—' || val === '-') return 'val-neutral'
  const isGrowth = /growth|yoy/i.test(label)
  if (isGrowth) {
    if (val.startsWith('+')) return 'val-pos'
    if (val.startsWith('-')) return 'val-neg'
  }
  const isLeverage = /debt-to-equity|borrowings/i.test(label)
  const num = parseValNum(val)
  if (num !== null) {
    if (num < 0) return 'val-neg'
    if (isLeverage && num > 2) return 'val-neg'
  }
  return 'val-neutral'
}

export function YearlyRatioSection({ data }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [copied, setCopied] = useState(false)

  const ratioTable = useMemo(() => computeYearlyRatios(data), [data])
  const annual = data.annual
  const isBank = data.mode === 'bank'

  // Summary Metrics
  const summary = useMemo(() => {
    if (isBank) {
      const bAnnual = data.annual as any[]
      const bLatest = bAnnual.at(-1)
      const roe = bLatest?.roe ?? null
      const roa = bLatest?.roa ?? null
      const ldr = bLatest?.ldr ?? (bLatest?.loansAdvances && bLatest?.deposits ? (bLatest.loansAdvances / bLatest.deposits) * 100 : null)
      const bToD = bLatest?.borrowingsToDeposits ?? (bLatest?.borrowings && bLatest?.deposits ? (bLatest.borrowings / bLatest.deposits) * 100 : null)
      const opm = bLatest?.operatingProfitMargin ?? null
      const npm = bLatest?.netProfitMargin ?? null

      return {
        card1Label: 'Return on Equity (ROE)',
        card1Val: roe !== null ? `${roe.toFixed(2)}%` : '—',
        card1Sub: 'Shareholder Return',
        card2Label: 'Return on Assets (ROA)',
        card2Val: roa !== null ? `${roa.toFixed(2)}%` : '—',
        card2Sub: 'Asset Efficiency',
        card3Label: 'LDR (Credit/Deposit)',
        card3Val: ldr !== null ? `${ldr.toFixed(1)}%` : '—',
        card3Sub: 'Loan-to-Deposit',
        card4Label: 'Financing Margin',
        card4Val: opm !== null ? `${opm.toFixed(2)}%` : '—',
        card4Sub: 'Spread Health',
        card5Label: 'Borrowings / Deposits',
        card5Val: bToD !== null ? `${bToD.toFixed(1)}%` : '—',
        card5Sub: 'Wholesale Reliance',
        card6Label: 'Net Margin (NPM)',
        card6Val: npm !== null ? `${npm.toFixed(2)}%` : '—',
        card6Sub: 'Bottom Line Margin',
      }
    } else {
      const cAnnual = data.annual as any[]
      const cLatest = cAnnual.at(-1)
      const roe = cLatest?.roe ?? null
      const roce = cLatest?.roce ?? null
      const roa = cLatest?.roa ?? null
      const opm = cLatest?.operatingProfitMargin ?? null
      const de = cLatest?.debtToEquity ?? null
      const cr = cLatest?.currentRatio ?? null

      return {
        card1Label: 'Return on Equity (ROE)',
        card1Val: roe !== null ? `${roe.toFixed(2)}%` : '—',
        card1Sub: 'Net Profit / Avg Equity',
        card2Label: 'ROCE',
        card2Val: roce !== null ? `${roce.toFixed(2)}%` : '—',
        card2Sub: 'EBIT / Capital Employed',
        card3Label: 'Operating Margin (OPM)',
        card3Val: opm !== null ? `${opm.toFixed(2)}%` : '—',
        card3Sub: 'Core Operating Profit',
        card4Label: 'Current Ratio',
        card4Val: cr !== null ? `${cr.toFixed(2)}×` : '—',
        card4Sub: 'Short-Term Liquidity',
        card5Label: 'Debt to Equity',
        card5Val: de !== null ? `${de.toFixed(2)}×` : '—',
        card5Sub: 'Balance Sheet Leverage',
        card6Label: 'Return on Assets (ROA)',
        card6Val: roa !== null ? `${roa.toFixed(2)}%` : '—',
        card6Sub: 'Total Asset Efficiency',
      }
    }
  }, [data, annual, isBank])

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
          <div className="ratio-avatar-chip avatar-yearly">
            <Calendar size={24} />
          </div>
          <div>
            <div className="ratio-title-row">
              <span className="ratio-company-name">{data.companyName}</span>
              <span className="ratio-scope-tag">
                <Sparkles size={13} /> {isBank ? 'Annual Banking Ratios' : 'Annual Corporate Ratios'}
              </span>
            </div>
            <p className="ratio-banner-sub">
              Computed across {annual.length} annual periods ({annual[0]?.period ?? '—'} to {annual.at(-1)?.period ?? '—'})
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
        <div className="ratio-kpi-card kpi-accent-emerald">
          <div className="ratio-kpi-header">
            <span>{summary.card1Label}</span>
            <span className="ratio-kpi-icon">
              <Award size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">{summary.card1Val}</div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-pos">Key Metric</span>
            <small>{summary.card1Sub}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-cyan">
          <div className="ratio-kpi-header">
            <span>{summary.card2Label}</span>
            <span className="ratio-kpi-icon">
              <Activity size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">{summary.card2Val}</div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Efficiency</span>
            <small>{summary.card2Sub}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-purple">
          <div className="ratio-kpi-header">
            <span>{summary.card3Label}</span>
            <span className="ratio-kpi-icon">
              <Percent size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">{summary.card3Val}</div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Core Health</span>
            <small>{summary.card3Sub}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-amber">
          <div className="ratio-kpi-header">
            <span>{summary.card4Label}</span>
            <span className="ratio-kpi-icon">
              <Gauge size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">{summary.card4Val}</div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Liquidity</span>
            <small>{summary.card4Sub}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-rose">
          <div className="ratio-kpi-header">
            <span>{summary.card5Label}</span>
            <span className="ratio-kpi-icon">
              <ShieldAlert size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">{summary.card5Val}</div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Solvency</span>
            <small>{summary.card5Sub}</small>
          </div>
        </div>

        <div className="ratio-kpi-card kpi-accent-indigo">
          <div className="ratio-kpi-header">
            <span>{summary.card6Label}</span>
            <span className="ratio-kpi-icon">
              <BarChart3 size={15} />
            </span>
          </div>
          <div className="ratio-kpi-value">{summary.card6Val}</div>
          <div className="ratio-kpi-footer">
            <span className="ratio-kpi-badge badge-neutral">Performance</span>
            <small>{summary.card6Sub}</small>
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
                {ratioTable.headers.map(h => (
                  <th key={h}>{h}</th>
                ))}
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
                      const val = row.values[cIdx] ?? '—'
                      const toneClass = getCellTone(row.label, val)

                      return (
                        <td
                          key={`${row.label}-${h}-${cIdx}`}
                          className={toneClass}
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
