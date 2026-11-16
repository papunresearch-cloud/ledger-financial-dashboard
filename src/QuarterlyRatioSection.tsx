import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { computeQuarterlyRatios } from './ratioCalculations'
import type { FinancialData, RatioTableRow } from './types'
import './ratioSection.css'

type Props = {
  data: FinancialData
}

type ArrowDir = 'up' | 'down' | 'none'

function getTrendArrow(rawCurr: number | null | undefined, rawPrev: number | null | undefined): ArrowDir {
  if (rawCurr === null || rawCurr === undefined || rawPrev === null || rawPrev === undefined) {
    return 'none'
  }
  const diff = rawCurr - rawPrev
  if (Math.abs(diff) < 0.005) return 'none'
  return diff > 0 ? 'up' : 'down'
}

function getValueSignClass(raw: number | null | undefined, valStr: string): string {
  if (!valStr || valStr === '—' || valStr === '-' || valStr === '--') return 'cell-val-neutral'
  if (raw !== null && raw !== undefined) {
    return raw < 0 ? 'cell-val-neg' : 'cell-val-pos'
  }
  if (valStr.startsWith('-')) return 'cell-val-neg'
  return 'cell-val-pos'
}

export function QuarterlyRatioSection({ data }: Props) {
  const ratioTable = useMemo(() => computeQuarterlyRatios(data), [data])
  const isBank = data.mode === 'bank'

  // Group rows by category
  const groupedCategories = useMemo(() => {
    const map = new Map<string, RatioTableRow[]>()
    ratioTable.rows.forEach(row => {
      const cat = row.category || 'RATIOS'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(row)
    })
    return Array.from(map.entries())
  }, [ratioTable])

  return (
    <div className="ratio-page-container">
      {/* 1. CLEAN COMPACT TOP STRIP */}
      <div className="ratio-page-strip">
        <div className="ratio-strip-title">
          <div className="ratio-strip-icon strip-icon-quarterly">
            <Clock size={18} />
          </div>
          <span className="ratio-strip-name">{data.companyName} — Quarterly Financial Ratios</span>
          <span className="ratio-strip-badge">
            {isBank ? 'Bank Analysis' : 'Corporate Non-Bank'}
          </span>
        </div>
        <div className="ratio-strip-legend">
          <span className="legend-item">
            <span className="legend-arrow-up">↑</span> Higher than previous
          </span>
          <span className="legend-item">
            <span className="legend-arrow-down">↓</span> Lower than previous
          </span>
        </div>
      </div>

      {/* 2. RATIO TABLE ONLY */}
      <div className="ratio-table-card">
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
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {groupedCategories.map(([category, rows]) => (
                <div key={category} style={{ display: 'contents' }}>
                  <tr className="category-section-header">
                    <td colSpan={ratioTable.headers.length + 1}>{category}</td>
                  </tr>
                  {rows.map((row, rIdx) => (
                    <tr key={`${row.label}-${rIdx}`}>
                      <td className="col-sticky">
                        <span className="ratio-row-label">{row.label}</span>
                      </td>
                      {ratioTable.headers.map((h, cIdx) => {
                        const isTtm = h.trim().toUpperCase() === 'TTM'
                        const val = row.values[cIdx] ?? '—'
                        const rawCurr = row.rawValues?.[cIdx]
                        const rawPrev = cIdx > 0 ? row.rawValues?.[cIdx - 1] : undefined
                        const arrow = getTrendArrow(rawCurr, rawPrev)
                        const valClass = getValueSignClass(rawCurr, val)

                        return (
                          <td
                            key={`${row.label}-${h}-${cIdx}`}
                            className={isTtm ? 'ratio-cell-ttm' : undefined}
                          >
                            <span className="ratio-cell-content">
                              <span className={`ratio-cell-num ${valClass}`}>{val}</span>
                              {arrow === 'up' && (
                                <span className="ratio-arrow arrow-up" title="Higher than previous quarter">
                                  ↑
                                </span>
                              )}
                              {arrow === 'down' && (
                                <span className="ratio-arrow arrow-down" title="Lower than previous quarter">
                                  ↓
                                </span>
                              )}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </div>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
