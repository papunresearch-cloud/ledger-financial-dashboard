import React, { useEffect, useMemo, useState } from 'react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { AnnualRow, BankAnnualRow, BankQuarterRow, QuarterRow } from './types'

type Metric = { key: string; label: string; color: string; kind?: 'line'; axis?: 'right'; unit?: 'percent' | 'ratio' | 'rupee' }
export type ChartSpec = { id: string; title: string; subtitle: string; data: Array<Record<string, unknown>>; metrics: Metric[]; type?: 'line' | 'bar' | 'combo'; category: 'annual' | 'quarterly'; yAxisMax?: number }

const fmt = (value: number, unit?: Metric['unit']) => {
  if (!Number.isFinite(value)) return '—'
  if (unit === 'percent') return `${value.toFixed(1)}%`
  if (unit === 'ratio') return `${value.toFixed(2)}×`
  if (unit === 'rupee') return `₹${value.toFixed(2)}`
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value)
}

function parseHex(hex: string): [number, number, number] {
  let c = hex.replace('#', '').trim()
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const num = parseInt(c, 16)
  if (Number.isNaN(num)) return [34, 211, 181]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function adjustBrightness(hex: string, factor: number): string {
  try {
    const [r, g, b] = parseHex(hex)
    const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))
    if (factor > 0) {
      return `rgb(${clamp(r + (255 - r) * factor)}, ${clamp(g + (255 - g) * factor)}, ${clamp(b + (255 - b) * factor)})`
    } else {
      const f = 1 + factor
      return `rgb(${clamp(r * f)}, ${clamp(g * f)}, ${clamp(b * f)})`
    }
  } catch {
    return hex
  }
}

type BarPalette = {
  top: string
  mid: string
  bottom: string
  stroke: string
}

function brightSeriesColor(color: string, theme: 'light' | 'dark' | 'bright'): string {
  if (theme !== 'bright') return color
  const c = color.toUpperCase().trim()
  if (c === '#00F5A0' || c === '#22D3B5' || c === '#38D9B4' || c === '#168B72') return '#059669'
  if (c === '#FFB800' || c === '#FFC857' || c === '#D7A743' || c === '#FFD000') return '#d97706'
  if (c === '#00D2FF' || c === '#5C9FFF' || c === '#38E1FF') return '#0284c7'
  if (c === '#FF2E93' || c === '#FF72B6' || c === '#FF3399') return '#db2777'
  if (c === '#B75CFF' || c === '#A78BFA' || c === '#B88BFF') return '#7c3aed'
  if (c === '#FF5353' || c === '#F97373' || c === '#E06961' || c === '#D68157') return '#dc2626'
  return color
}

function getBarPalette(color: string, theme: 'light' | 'dark' | 'bright' = 'dark'): BarPalette {
  const c = color.toUpperCase().trim()
  if (theme === 'bright') {
    if (c === '#00F5A0' || c === '#22D3B5' || c === '#38D9B4' || c === '#168B72') {
      return { top: '#34d399', mid: '#10b981', bottom: '#047857', stroke: '#065f46' }
    }
    if (c === '#FFB800' || c === '#FFC857' || c === '#D7A743' || c === '#FFD000') {
      return { top: '#fbbf24', mid: '#f59e0b', bottom: '#b45309', stroke: '#92400e' }
    }
    if (c === '#00D2FF' || c === '#5C9FFF' || c === '#38E1FF') {
      return { top: '#38bdf8', mid: '#0ea5e9', bottom: '#0369a1', stroke: '#075985' }
    }
    if (c === '#FF2E93' || c === '#FF72B6' || c === '#FF3399') {
      return { top: '#f472b6', mid: '#ec4899', bottom: '#be185d', stroke: '#9d174d' }
    }
    if (c === '#B75CFF' || c === '#A78BFA' || c === '#B88BFF') {
      return { top: '#a78bfa', mid: '#8b5cf6', bottom: '#6d28d9', stroke: '#5b21b6' }
    }
    if (c === '#FF5353' || c === '#F97373' || c === '#E06961' || c === '#D68157') {
      return { top: '#fb7185', mid: '#f43f5e', bottom: '#be123c', stroke: '#9f1239' }
    }
  }
  if (c === '#00F5A0' || c === '#22D3B5' || c === '#38D9B4' || c === '#168B72') {
    return { top: '#4EFFB9', mid: '#00F5A0', bottom: '#00593B', stroke: '#6BFFC9' }
  }
  if (c === '#FFB800' || c === '#FFC857' || c === '#D7A743' || c === '#FFD000') {
    return { top: '#FFE27A', mid: '#FFB800', bottom: '#7A5200', stroke: '#FFEC9E' }
  }
  if (c === '#00D2FF' || c === '#5C9FFF' || c === '#38E1FF') {
    return { top: '#6BE3FF', mid: '#00D2FF', bottom: '#00537A', stroke: '#8FE9FF' }
  }
  if (c === '#FF2E93' || c === '#FF72B6' || c === '#FF3399') {
    return { top: '#FF6BB5', mid: '#FF2E93', bottom: '#7A053D', stroke: '#FF8FC7' }
  }
  if (c === '#B75CFF' || c === '#A78BFA' || c === '#B88BFF') {
    return { top: '#D494FF', mid: '#B75CFF', bottom: '#4F1594', stroke: '#E3ACFF' }
  }
  if (c === '#FF5353' || c === '#F97373' || c === '#E06961' || c === '#D68157') {
    return { top: '#FF8080', mid: '#FF5353', bottom: '#7A1212', stroke: '#FFA3A3' }
  }
  if (c === '#6366F1' || c === '#6478BD') {
    return { top: '#8B95F8', mid: '#6366F1', bottom: '#262A7A', stroke: '#A5AEFA' }
  }
  return {
    top: adjustBrightness(color, 0.32),
    mid: color,
    bottom: adjustBrightness(color, -0.48),
    stroke: adjustBrightness(color, 0.42),
  }
}

const tooltipContentStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(49, 207, 173, 0.35)',
  background: 'linear-gradient(135deg, rgba(13, 27, 25, 0.96), rgba(11, 20, 31, 0.98))',
  color: '#eaf7f1',
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 245, 160, 0.1)',
  backdropFilter: 'blur(12px)',
  padding: '10px 14px',
}

const tooltipItemStyle: React.CSSProperties = {
  padding: '2px 0',
  fontSize: '12px',
  fontFamily: "'DM Mono', monospace",
}

const tooltipLabelStyle: React.CSSProperties = {
  color: '#49d7b5',
  fontWeight: 700,
  fontSize: '12px',
  marginBottom: 6,
  fontFamily: "'DM Mono', monospace",
  letterSpacing: '0.5px',
}

const legendWrapperStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: 'Manrope, sans-serif',
  fontWeight: 600,
  color: '#c5ddd3',
  paddingTop: 10,
}

type DualRangeSliderProps = {
  min: number
  max: number
  step?: number
  value: [number, number]
  onChange: (val: [number, number]) => void
  fillColor?: string
  minGap?: number
  idPrefix?: string
}

function DualRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  fillColor = '#0284c7',
  minGap = 1,
}: DualRangeSliderProps) {
  const [valLow, valHigh] = value
  const span = max - min
  const leftPct = span > 0 ? Math.max(0, Math.min(100, ((valLow - min) / span) * 100)) : 0
  const widthPct = span > 0 ? Math.max(0, Math.min(100 - leftPct, ((valHigh - valLow) / span) * 100)) : 100

  const handleLowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    const clamped = Math.min(next, valHigh - minGap)
    onChange([clamped, valHigh])
  }

  const handleHighChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    const clamped = Math.max(next, valLow + minGap)
    onChange([valLow, clamped])
  }

  return (
    <div className="dual-slider-container">
      <div className="dual-slider-track" />
      <div
        className="dual-slider-fill"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: fillColor,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valLow}
        onChange={handleLowChange}
        className="dual-slider-input slider-min"
        aria-label="Lower range handle"
        style={{ zIndex: valLow > max - minGap * 2 ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valHigh}
        onChange={handleHighChange}
        className="dual-slider-input slider-max"
        aria-label="Upper range handle"
        style={{ zIndex: 4 }}
      />
    </div>
  )
}

export function ChartPanel({ spec, exportMode = false, staticRender = false, gradientPrefix, theme = 'light' }: { spec: ChartSpec; exportMode?: boolean; staticRender?: boolean; gradientPrefix?: string; theme?: 'light' | 'dark' | 'bright' }) {
  const totalPeriods = spec.data.length
  const [xRange, setXRange] = useState<[number, number]>([0, Math.max(0, totalPeriods - 1)])
  const [yRange, setYRange] = useState<[number, number]>([0, 100])
  const [showSliders, setShowSliders] = useState(true)

  useEffect(() => {
    setXRange([0, Math.max(0, spec.data.length - 1)])
    setYRange([0, 100])
  }, [spec.data.length])

  const gradPrefix = gradientPrefix ?? (exportMode ? 'export-' : '')
  const hasData = spec.data.some(point => spec.metrics.some(metric => typeof point[metric.key] === 'number' && Number.isFinite(point[metric.key] as number)))
  const allLine = spec.type === 'line'
  const isDark = theme === 'dark'
  const tickColor = isDark ? '#8eb0a4' : '#000000'
  const gridColor = isDark ? '#1c352e' : '#cbd5e1'
  const axisLineColor = isDark ? '#22463b' : '#94a3b8'
  const activeTooltipContentStyle: React.CSSProperties = isDark ? tooltipContentStyle : {
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#000000',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
    padding: '10px 14px',
  }
  const activeTooltipLabelStyle: React.CSSProperties = isDark ? tooltipLabelStyle : {
    ...tooltipLabelStyle,
    color: '#0369a1',
  }
  const activeLegendStyle: React.CSSProperties = {
    ...legendWrapperStyle,
    color: isDark ? '#c5ddd3' : '#000000',
  }
  const axisMetric = spec.metrics.find(metric => metric.kind !== 'line') ?? spec.metrics[0]
  const rightMetric = spec.metrics.find(metric => metric.axis === 'right')
  const tickFormatter = (value: number, metric?: Metric) => metric?.unit
    ? fmt(Number(value), metric.unit)
    : new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))

  const leftMetrics = useMemo(() => spec.metrics.filter(m => m.axis !== 'right'), [spec.metrics])

  const leftValues = useMemo(() => {
    const vals: number[] = []
    spec.data.forEach(d => {
      leftMetrics.forEach(m => {
        const val = d[m.key]
        if (typeof val === 'number' && Number.isFinite(val)) {
          vals.push(val)
        }
      })
    })
    return vals
  }, [spec.data, leftMetrics])

  const rightValues = useMemo(() => {
    if (!rightMetric) return []
    const vals: number[] = []
    spec.data.forEach(d => {
      const val = d[rightMetric.key]
      if (typeof val === 'number' && Number.isFinite(val)) {
        vals.push(val)
      }
    })
    return vals
  }, [spec.data, rightMetric])

  const maxVal = spec.yAxisMax ?? (leftValues.length > 0 ? Math.max(...leftValues) : 100)
  const minVal = leftValues.length > 0 ? Math.min(...leftValues) : 0

  const { mappedYMin, mappedYMax } = useMemo(() => {
    if (yRange[0] === 0 && yRange[1] === 100) {
      return {
        mappedYMin: minVal < 0 ? minVal : 0,
        mappedYMax: maxVal,
      }
    }
    const [yLow, yHigh] = yRange
    const normHigh = Math.max(0.01, yHigh / 100)
    let sMax = maxVal > 0 ? maxVal * Math.pow(normHigh, 3.0) : maxVal
    const normLow = Math.max(0, yLow / 100)
    let sMin = 0
    if (minVal < 0) {
      sMin = minVal * Math.pow((100 - yLow) / 100, 3.0)
    } else {
      sMin = (sMax * 0.95) * Math.pow(normLow, 1.8)
    }
    if (sMax <= sMin) {
      sMax = sMin + (Math.abs(maxVal) > 0 ? Math.abs(maxVal) * 0.005 : 1)
    }
    return { mappedYMin: sMin, mappedYMax: sMax }
  }, [yRange, minVal, maxVal])

  const domainLeft = useMemo<[number, number] | undefined>(() => {
    if (yRange[0] === 0 && yRange[1] === 100 && !spec.yAxisMax) return undefined
    return [mappedYMin, mappedYMax]
  }, [yRange, mappedYMin, mappedYMax, spec.yAxisMax])

  const domainRight = useMemo<[number, number] | undefined>(() => {
    if (!rightMetric) return undefined
    if (rightValues.length === 0) return undefined
    if (yRange[0] === 0 && yRange[1] === 100) return undefined

    const rMaxVal = Math.max(...rightValues)
    const rMinVal = Math.min(...rightValues)

    const normHigh = Math.max(0.01, yRange[1] / 100)
    let rMax = rMaxVal * Math.pow(normHigh, 3.0)
    const normLow = Math.max(0, yRange[0] / 100)
    let rMin = rMinVal < 0 ? rMinVal * Math.pow((100 - yRange[0]) / 100, 3.0) : (rMax * 0.95) * Math.pow(normLow, 1.8)
    if (rMax <= rMin) rMax = rMin + 1
    return [rMin, rMax]
  }, [rightMetric, rightValues, yRange])

  const displayedData = useMemo(() => {
    if (totalPeriods <= 1) return spec.data
    const start = Math.max(0, Math.min(xRange[0], totalPeriods - 1))
    const end = Math.max(start, Math.min(xRange[1], totalPeriods - 1))
    return spec.data.slice(start, end + 1)
  }, [spec.data, xRange, totalPeriods])

  const isAdjusted = xRange[0] > 0 || xRange[1] < totalPeriods - 1 || yRange[0] > 0 || yRange[1] < 100

  const handleResetRange = () => {
    setXRange([0, Math.max(0, totalPeriods - 1)])
    setYRange([0, 100])
  }

  const allowOverflow = Boolean(spec.yAxisMax || yRange[0] > 0 || yRange[1] < 100)

  return <article className={`chart-card ${isDark ? 'chart-card-dark' : 'chart-card-bright'}`} data-chart-card={spec.id} data-export-chart-card={exportMode ? spec.id : undefined}>
    <div className="chart-heading">
      <div><span className="eyebrow">{spec.category === 'annual' ? 'YEARLY' : 'QUARTERLY'}</span><h3>{spec.title}</h3><p>{spec.subtitle}</p></div>
      <div className="chart-heading-actions">
        {hasData && isAdjusted && (
          <button
            type="button"
            className="chart-reset-range-btn"
            onClick={handleResetRange}
            title="Reset both X-axis and Y-axis sliders to full default range"
            aria-label="Reset sliders"
          >
            <RotateCcw size={12} strokeWidth={2.5} />
            <span>Reset</span>
          </button>
        )}
        {hasData && (
          <button
            type="button"
            className={`chart-slider-toggle-btn ${showSliders ? 'active' : ''}`}
            onClick={() => setShowSliders(s => !s)}
            title={showSliders ? 'Hide range sliders' : 'Show X-axis & Y-axis range zoom sliders'}
            aria-label="Toggle sliders"
          >
            <SlidersHorizontal size={13} strokeWidth={2.2} />
            <span>Range</span>
          </button>
        )}
        <span className="chart-spark" aria-hidden="true">✳</span>
      </div>
    </div>
    <div className="chart-snapshot">
      {hasData ? <ResponsiveContainer width="100%" height={286}>
        {allLine ? <LineChart data={displayedData} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={gridColor} strokeOpacity={0.55} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tick={{ fill: tickColor, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: axisLineColor, strokeOpacity: 0.7 }} tickLine={false} />
          <YAxis yAxisId="left" domain={domainLeft || (spec.yAxisMax ? ['auto', spec.yAxisMax] : undefined)} allowDataOverflow={allowOverflow} tick={{ fill: tickColor, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => tickFormatter(v, spec.metrics[0])} />
          <Tooltip formatter={(v, name) => [fmt(Number(v), spec.metrics.find(m => m.label === name)?.unit), name]} contentStyle={activeTooltipContentStyle} itemStyle={tooltipItemStyle} labelStyle={activeTooltipLabelStyle} cursor={{ stroke: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 23, 42, 0.18)', strokeDasharray: '3 3' }} />
          <Legend wrapperStyle={activeLegendStyle} />
          {spec.metrics.map(metric => {
            const lineColor = brightSeriesColor(metric.color, theme)
            return (
              <Line
                key={metric.key}
                yAxisId="left"
                type="monotone"
                dataKey={metric.key as string}
                name={metric.label}
                stroke={lineColor}
                strokeWidth={3}
                isAnimationActive={!staticRender && !exportMode}
                dot={{ r: 3.5, fill: isDark ? '#0a141a' : '#ffffff', stroke: lineColor, strokeWidth: 2.2 }}
                activeDot={{ r: 5.5, fill: lineColor, stroke: '#ffffff', strokeWidth: 2 }}
                connectNulls={false}
              />
            )
          })}
        </LineChart> : <ComposedChart data={displayedData} margin={{ top: 12, right: rightMetric ? 18 : 12, bottom: 4, left: 0 }}>
          <defs>
            {spec.metrics.filter(m => m.kind !== 'line').map(metric => {
              const palette = getBarPalette(metric.color, theme)
              return (
                <linearGradient
                  key={`${gradPrefix}grad-${spec.id}-${metric.key}`}
                  id={`${gradPrefix}grad-${spec.id}-${metric.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={palette.top} stopOpacity={1} />
                  <stop offset="55%" stopColor={palette.mid} stopOpacity={0.88} />
                  <stop offset="100%" stopColor={palette.bottom} stopOpacity={isDark ? 0.42 : 0.78} />
                </linearGradient>
              )
            })}
          </defs>
          <CartesianGrid stroke={gridColor} strokeOpacity={0.55} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tick={{ fill: tickColor, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: axisLineColor, strokeOpacity: 0.7 }} tickLine={false} />
          <YAxis yAxisId="left" domain={domainLeft || (spec.yAxisMax ? ['auto', spec.yAxisMax] : undefined)} allowDataOverflow={allowOverflow} tick={{ fill: tickColor, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => tickFormatter(v, axisMetric)} />
          {rightMetric && <YAxis yAxisId="right" orientation="right" domain={domainRight} allowDataOverflow={allowOverflow} tick={{ fill: tickColor, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} width={62} tickFormatter={(v) => tickFormatter(v, rightMetric)} />}
          <Tooltip formatter={(v, name) => [fmt(Number(v), spec.metrics.find(m => m.label === name)?.unit), name]} contentStyle={activeTooltipContentStyle} itemStyle={tooltipItemStyle} labelStyle={activeTooltipLabelStyle} cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.05)' }} />
          <Legend wrapperStyle={activeLegendStyle} />
          {spec.metrics.map(metric => {
            if (metric.kind === 'line') {
              const lineColor = brightSeriesColor(metric.color, theme)
              return (
                <Line
                  key={metric.key}
                  yAxisId={metric.axis === 'right' ? 'right' : 'left'}
                  type="monotone"
                  dataKey={metric.key as string}
                  name={metric.label}
                  stroke={lineColor}
                  strokeWidth={3}
                  isAnimationActive={!staticRender && !exportMode}
                  dot={{ r: 3.5, fill: isDark ? '#0a141a' : '#ffffff', stroke: lineColor, strokeWidth: 2.2 }}
                  activeDot={{ r: 5.5, fill: lineColor, stroke: '#ffffff', strokeWidth: 2 }}
                  connectNulls={false}
                />
              )
            }
            const palette = getBarPalette(metric.color, theme)
            return (
              <Bar
                key={metric.key}
                yAxisId="left"
                dataKey={metric.key as string}
                name={metric.label}
                fill={`url(#${gradPrefix}grad-${spec.id}-${metric.key})`}
                stroke={palette.stroke}
                strokeWidth={1.8}
                radius={[6, 6, 1, 1]}
                maxBarSize={38}
                isAnimationActive={!staticRender && !exportMode}
              />
            )
          })}
        </ComposedChart>}
      </ResponsiveContainer> : <div className="chart-empty"><span>◌</span><strong>Not enough data to plot</strong><small>Check the data-quality notes below.</small></div>}
    </div>

    {hasData && showSliders && (
      <div
        className="chart-sliders-box"
        data-chart-sliders={spec.id}
        data-total-periods={totalPeriods}
        data-periods={JSON.stringify(spec.data.map(d => String(d.period || '')))}
        data-min-val={minVal}
        data-max-val={maxVal}
        data-axis-unit={axisMetric.unit || ''}
      >
        <div className="chart-slider-row">
          <div className="chart-slider-meta">
            <span className="chart-slider-axis-badge axis-x">X-axis</span>
          </div>
          <DualRangeSlider
            min={0}
            max={Math.max(1, totalPeriods - 1)}
            value={xRange}
            onChange={setXRange}
            fillColor="#0284c7"
            minGap={1}
            idPrefix={`x-${spec.id}`}
          />
        </div>

        <div className="chart-slider-row">
          <div className="chart-slider-meta">
            <span className="chart-slider-axis-badge axis-y">Y-axis</span>
          </div>
          <DualRangeSlider
            min={0}
            max={100}
            value={yRange}
            onChange={setYRange}
            fillColor="#059669"
            minGap={1}
            idPrefix={`y-${spec.id}`}
          />
        </div>
      </div>
    )}
  </article>
}

const annualSpec = <T extends { period: string },>(rows: T[], id: string, title: string, subtitle: string, metrics: Metric[], type: ChartSpec['type'] = 'bar'): ChartSpec => ({
  id, title, subtitle, metrics, type, category: 'annual', data: rows.map(row => ({ ...row, period: row.period.replace(/FY(?:20)?(\d{2})/g, 'FY$1') })),
})
const quarterSpec = <T extends { period: string },>(rows: T[], id: string, title: string, subtitle: string, metrics: Metric[], type: ChartSpec['type'] = 'bar'): ChartSpec => ({
  id, title, subtitle, metrics, type, category: 'quarterly', data: rows.map(row => ({ ...row, period: row.period.replace(/FY(?:20)?(\d{2})/g, 'FY$1') })),
})

export function makeChartSpecs(annual: AnnualRow[], quarterly: QuarterRow[]): { annual: ChartSpec[]; margins: ChartSpec[]; quarterly: ChartSpec[]; special: ChartSpec[] } {
  const A = (key: keyof AnnualRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const Q = (key: keyof QuarterRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const annualWithRoaOverlay = annual.map(row => ({ ...row, roaOverlay: row.roa }))
  const suppressGpm = annual.length > 0 && annual.every(row => row.grossProfitMargin !== null && row.grossProfitMargin > 95)
  const ttmValue = (key: 'sales' | 'netProfit' | 'operatingProfit' | 'profitBeforeTax' | 'depreciation' | 'pbtLessDepreciation'): number | null => {
    const slice = quarterly.slice(-4)
    if (slice.length < 4 || slice.some(row => row[key] === null || row[key] === undefined)) return null
    return slice.reduce((sum, row) => sum + (row[key] as number), 0)
  }
  const ttmSales = ttmValue('sales')
  const ttmOperatingProfit = ttmValue('operatingProfit')
  const ttmNetProfit = ttmValue('netProfit')
  const ttmOperatingMargin = ttmSales === null || ttmSales === 0 || ttmOperatingProfit === null ? null : 100 * ttmOperatingProfit / ttmSales
  const ttmNetMargin = ttmSales === null || ttmSales === 0 || ttmNetProfit === null ? null : 100 * ttmNetProfit / ttmSales
  const ttmProfitBeforeTax = ttmValue('profitBeforeTax')
  const ttmDepreciation = ttmValue('depreciation')
  const ttmPbtLessDepreciation = ttmProfitBeforeTax !== null ? ttmProfitBeforeTax - (ttmDepreciation ?? 0) : null
  const annualTtm: AnnualRow[] = [...annual, {
    ...(annual.at(-1) ?? {} as AnnualRow), period: 'TTM', sales: ttmSales, netProfit: ttmNetProfit,
    operatingProfit: ttmOperatingProfit, operatingProfitMargin: ttmOperatingMargin, netProfitMargin: ttmNetMargin,
    grossProfitMargin: null,
    profitBeforeTax: ttmProfitBeforeTax,
    depreciation: ttmDepreciation,
    pbtLessDepreciation: ttmPbtLessDepreciation,
  }]
  const ratio = (numerator: number | null, denominator: number | null, percent = false): number | null =>
    numerator === null || denominator === null || denominator <= 0 ? null : (percent ? 100 : 1) * numerator / denominator
  const specialAnnual = annual.map(row => ({
    ...row,
    salesToNetBlock: ratio(row.sales, row.netBlock),
    liabilitiesToTotalAssets: ratio(row.otherLiabilities, row.totalAssets, true),
    currentAssetsToTotalAssetsSpecial: ratio(row.otherAssets, row.totalAssets, true),
    receivablesToCurrentAssets: ratio(row.receivables, row.otherAssets, true),
    inventoryToCurrentAssets: ratio(row.inventory, row.otherAssets, true),
    cashToCurrentAssets: ratio(row.cashBank, row.otherAssets, true),
  }))
  const growth = (current: number | null, previous: number | null): number | null =>
    current === null || previous === null || previous <= 0 ? null : 100 * (current - previous) / previous
  const specialGrowthAnnual = specialAnnual.map((row, index) => {
    const previous = specialAnnual[index - 1]
    return {
      ...row,
      salesGrowth: previous ? growth(row.sales, previous.sales) : null,
      operatingProfitGrowth: previous ? growth(row.operatingProfit, previous.operatingProfit) : null,
      netProfitGrowth: previous ? growth(row.netProfit, previous.netProfit) : null,
    }
  })
  const marginLines = [
    ...(!suppressGpm ? [A('grossProfitMargin', 'GPM', '#FFB800', 'line', 'right', 'percent')] : []),
    A('operatingProfitMargin', 'OPM', '#00F5A0', 'line', 'right', 'percent'),
    A('netProfitMargin', 'NPM', '#B75CFF', 'line', 'right', 'percent'),
  ]
  const marginOnlyLines = [
    ...(!suppressGpm ? [A('grossProfitMargin', 'GPM', '#FFB800', 'line', undefined, 'percent')] : []),
    A('operatingProfitMargin', 'OPM', '#00F5A0', 'line', undefined, 'percent'),
    A('netProfitMargin', 'NPM', '#B75CFF', 'line', undefined, 'percent'),
  ]
  const yearOnYearGrowthSpec = annualSpec(specialGrowthAnnual, 'special-yoy-growth', 'Year-on-year growth', 'Change from previous year · %', [
    { key: 'salesGrowth', label: 'Sales growth', color: '#00F5A0', unit: 'percent' },
    { key: 'operatingProfitGrowth', label: 'Operating profit growth', color: '#00D2FF', unit: 'percent' },
    { key: 'netProfitGrowth', label: 'Net profit growth', color: '#FFB800', unit: 'percent' },
  ])
  yearOnYearGrowthSpec.yAxisMax = 100
  return {
    annual: [
      annualSpec(annualTtm, 'annual-sales', 'Sales', 'Annual and TTM sales · ₹ crore', [A('sales', 'Sales', '#00F5A0')]),
      quarterSpec(quarterly, 'quarter-sales', 'Quarterly sales', 'Quarterly revenue · ₹ crore', [Q('sales', 'Sales', '#00F5A0')]),
      annualSpec(annualTtm, 'annual-pbt', 'Profit before tax (PBT) & [PBT - Depreciation]', 'Annual and TTM PBT & PBT less depreciation · ₹ crore', [A('profitBeforeTax', 'PBT', '#00D2FF'), A('pbtLessDepreciation', 'PBT - Depreciation', '#FFB800')]),
      quarterSpec(quarterly, 'quarter-pbt', 'Quarterly Profit before tax (PBT) & [PBT - Depreciation]', 'Quarterly PBT & PBT less depreciation · ₹ crore', [Q('profitBeforeTax', 'PBT', '#00D2FF'), Q('pbtLessDepreciation', 'PBT - Depreciation', '#FFB800')]),
      annualSpec(annualTtm, 'annual-profit', 'Net profit', 'Annual and TTM net profit · ₹ crore', [A('netProfit', 'Net profit', '#FFB800')]),
      quarterSpec(quarterly, 'quarter-profit', 'Quarterly net profit', 'Quarterly bottom-line earnings · ₹ crore', [Q('netProfit', 'Net profit', '#FFB800')]),
      annualSpec(annualTtm, 'annual-margins', 'Profit margins', 'Annual GPM, OPM and NPM · TTM OPM and NPM · %', marginOnlyLines, 'line'),
      quarterSpec(quarterly, 'quarter-margins', 'Quarterly operating & net margins', 'OPM and NPM · %', [Q('operatingProfitMargin', 'OPM', '#00F5A0', 'line', undefined, 'percent'), Q('netProfitMargin', 'NPM', '#B75CFF', 'line', undefined, 'percent')], 'line'),
      annualSpec(annualTtm, 'annual-sales-operating-net-profit', 'Sales, operating profit & net profit', suppressGpm ? '₹ crore columns · OPM & NPM · % lines' : '₹ crore columns · GPM, OPM & NPM · % lines', [A('sales','Sales','#00F5A0'), A('operatingProfit','Operating profit','#00D2FF'), A('netProfit','Net profit','#FFB800'), ...marginLines], 'combo'),
      annualSpec(annual, 'annual-dividend', 'Dividend & payout', 'Dividend amount · ₹ crore; payout ratio · %', [A('dividend', 'Dividend amount', '#FFB800'), A('dividendPayout', 'Payout ratio', '#FF2E93', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annual, 'annual-eps-dividend', 'EPS, dividend per share & payout', 'EPS & dividend per share in ₹; payout ratio · %', [A('eps', 'EPS', '#00F5A0', undefined, undefined, 'rupee'), A('dividendPerShare', 'Dividend per share', '#FFB800', undefined, undefined, 'rupee'), A('dividendPayout', 'Payout ratio', '#FF2E93', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annual, 'annual-cash-flow-activities', 'Cash flow activities', 'Operating, investing, financing and net cash flow · ₹ crore', [A('operatingCashFlow', 'Cash from Operating Activity', '#00F5A0'), A('investingCashFlow', 'Cash from Investing Activity', '#00D2FF'), A('financingCashFlow', 'Cash from Financing Activity', '#FFB800'), A('netCashFlow', 'Net Cash Flow', '#FF2E93')]),
      annualSpec(annual, 'annual-cash-profit', 'Profit & cash generation', 'Operating profit, OCF, FCF & net profit · ₹ crore', [A('operatingProfit', 'Operating profit', '#00D2FF'), A('operatingCashFlow', 'Operating cash flow', '#00F5A0'), A('freeCashFlow', 'Free cash flow', '#FFB800'), A('netProfit','Net profit','#FF2E93')]),
      annualSpec(annual, 'annual-sales-wc-cfo', 'Sales vs Working capital vs Cash from operation', 'Sales, working capital & cash from operations · ₹ crore', [A('sales', 'Sales', '#00F5A0'), A('workingCapital', 'Working capital', '#00D2FF'), A('operatingCashFlow', 'Cash from operation', '#FFB800')]),
      annualSpec(annual, 'annual-cfo-wc-breakdown', 'Cash from operation vs receivables vs inventory vs payables', 'CFO, receivables, inventory & payables · ₹ crore', [A('operatingCashFlow', 'Cash from operation', '#00F5A0'), A('receivables', 'Receivables', '#FFB800'), A('inventory', 'Inventory', '#00D2FF'), A('payables', 'Payables', '#FF2E93')]),
      annualSpec(annual, 'annual-working-capital', 'Sales, receivables & inventory', 'Sales, receivables & inventory in ₹ crore', [A('sales', 'Sales', '#00F5A0'), A('receivables', 'Receivables', '#FFB800'), A('inventory', 'Inventory', '#00D2FF')]),
      annualSpec(annual, 'annual-net-block', 'Net block & CWIP / net block', 'Net block · ₹ crore; CWIP / net block · %', [A('netBlock', 'Net block', '#00D2FF'), A('netBlockToCwip', 'CWIP / net block', '#FF5353', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annual, 'annual-cwip', 'Capital work in progress', 'CWIP in ₹ crore', [A('cwip', 'CWIP', '#FF2E93')]),
      annualSpec(annual, 'annual-equity', 'Equity', 'Share capital plus reserves · ₹ crore', [A('equity', 'Equity', '#B75CFF')]),
      annualSpec(annual, 'annual-cash-bank', 'Cash & cash-equivalent', 'Cash & bank · ₹ crore; cash / total assets · %', [A('cashBank', 'Cash & bank', '#00D2FF'), A('cashToTotalAssets','Cash & bank / total assets','#FFB800','line','right','percent')], 'combo'),
      annualSpec(annual, 'annual-de', 'Debt to equity', 'Borrowings · ₹ crore; debt to equity · ×', [A('borrowings', 'Borrowings', '#FFB800'), A('debtToEquity', 'Debt / equity', '#FF5353', 'line', 'right', 'ratio')], 'combo'),
      annualSpec(annualWithRoaOverlay, 'annual-returns', 'Return on equity & assets', 'ROE & ROA · %; ROA also shown as a line on a separate scale', [A('roe', 'ROE', '#00F5A0', undefined, undefined, 'percent'), A('roa', 'ROA', '#00D2FF', undefined, undefined, 'percent'), { key: 'roaOverlay', label: 'ROA line', color: '#FF2E93', kind: 'line', axis: 'right', unit: 'percent' }], 'combo'),
      annualSpec(annual, 'annual-asset-mix', 'Current assets / total assets', 'Current assets, net block and investments as a share of total assets · %', [A('currentAssetsToTotalAssets', 'Current assets / total assets', '#B75CFF', 'line', undefined, 'percent'), A('netBlockToTotalAssets', 'Net block / total assets', '#00F5A0', 'line', undefined, 'percent'), A('investmentsToTotalAssets', 'Investments / total assets', '#FFB800', 'line', undefined, 'percent')], 'line'),
    ],
    margins: [],
    quarterly: [],
    special: [
      yearOnYearGrowthSpec,
      annualSpec(specialAnnual, 'special-sales-net-block', 'Sales / net block', 'Net block · ₹ crore; annual sales / net block · ×', [
        A('netBlock', 'Net block', '#B75CFF'),
        { key: 'salesToNetBlock', label: 'Sales / net block', color: '#00F5A0', kind: 'line', axis: 'right', unit: 'ratio' },
      ], 'combo'),
      annualSpec(specialAnnual, 'special-current-asset-composition', 'Current asset composition', 'Annual balance-sheet components as a share of current assets or total assets · %', [
        { key: 'liabilitiesToTotalAssets', label: 'Current liabilities / total assets', color: '#FF5353', kind: 'line', unit: 'percent' },
        { key: 'currentAssetsToTotalAssetsSpecial', label: 'Current assets / total assets', color: '#B75CFF', kind: 'line', unit: 'percent' },
        { key: 'receivablesToCurrentAssets', label: 'Receivables / current assets', color: '#FFB800', kind: 'line', unit: 'percent' },
        { key: 'inventoryToCurrentAssets', label: 'Inventory / current assets', color: '#00D2FF', kind: 'line', unit: 'percent' },
        { key: 'cashToCurrentAssets', label: 'Cash & cash-equivalent / current assets', color: '#00F5A0', kind: 'line', unit: 'percent' },
      ], 'line'),
    ],
  }
}

export type BankChartSpecs = { annual: ChartSpec[]; quarterly: ChartSpec[] }

export function makeBankChartSpecs(annual: BankAnnualRow[], quarterly: BankQuarterRow[]): BankChartSpecs {
  const A = (key: keyof BankAnnualRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const Q = (key: keyof BankQuarterRow, label: string, color: string, kind?: 'line', axis?: 'right', unit?: Metric['unit']): Metric => ({ key, label, color, kind, axis, unit })
  const shortPeriod = (period: string) => period.replace(/FY(?:20)?(\d{2})/g, 'FY$1')
  const annualRows = annual.map(row => {
    const loansAdv = row.loansAdvances ?? row.otherAssets
    const dep = row.deposits
    const borr = row.borrowings
    const eq = row.equity
    const totAssets = row.totalAssets
    const pbt = row.profitBeforeTax
    const depr = row.depreciation
    return {
      ...row,
      period: shortPeriod(row.period),
      roaOverlay: row.roa,
      interestRatio: row.interestRatio ?? (row.interestEarned && row.interestPaid !== null ? (row.interestPaid / row.interestEarned) * 100 : null),
      interestIncomeContribution: row.interestIncomeContribution ?? (row.totalRevenue && row.interestEarned !== null ? (row.interestEarned / row.totalRevenue) * 100 : null),
      loansAdvances: loansAdv,
      deposits: dep,
      pbtLessDepreciation: row.pbtLessDepreciation ?? (pbt !== null ? pbt - (depr ?? 0) : null),
      ldr: row.ldr ?? (loansAdv !== null && dep !== null && dep > 0 ? 100 * loansAdv / dep : null),
      borrowingsToDeposits: row.borrowingsToDeposits ?? (borr !== null && dep !== null && dep > 0 ? 100 * borr / dep : null),
      equityToTotalAssets: row.equityToTotalAssets ?? (eq !== null && totAssets !== null && totAssets > 0 ? 100 * eq / totAssets : null),
    }
  })
  const quarterRows = quarterly.map(row => ({
    ...row,
    period: shortPeriod(row.period),
    interestRatio: row.interestRatio ?? (row.interestEarned && row.interestPaid !== null ? (row.interestPaid / row.interestEarned) * 100 : null),
    interestIncomeContribution: row.interestIncomeContribution ?? (row.totalRevenue && row.interestEarned !== null ? (row.interestEarned / row.totalRevenue) * 100 : null),
    pbtLessDepreciation: row.pbtLessDepreciation ?? (row.profitBeforeTax !== null ? row.profitBeforeTax - (row.depreciation ?? 0) : null),
  }))
  return {
    annual: [
      annualSpec(annualRows, 'bank-interest-gap', 'Interest earned & interest paid', '₹ crore · Interest Ratio = Interest Paid / Interest Earned (%)', [A('interestEarned','Interest earned','#00F5A0'), A('interestPaid','Interest paid','#FFB800'), A('interestRatio','Interest Ratio','#B75CFF','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-interest-other-income', 'Interest earned & other income', '₹ crore · Interest income contribution = Interest income \\ Total income (%)', [A('interestEarned','Interest earned','#00F5A0'), A('otherIncome','Other income','#00D2FF'), A('interestIncomeContribution','Interest income contribution','#FF2E93','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-revenue-expense-opm', 'Total revenue & total expense', '₹ crore · OPM = [(total revenue − total expense) ÷ total revenue] % | Total revenue = Sales (Interest Earned) + Other Income | Total Expense=Operating Expenses+Other Expenses (Provisions)+Interest Paid', [A('totalRevenue','Total revenue','#00F5A0'), A('totalExpense','Total expense','#FF5353'), A('operatingProfitMargin','OPM','#00D2FF','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-pbt', 'Profit before tax (PBT) & [PBT - Depreciation]', 'Annual PBT & PBT less depreciation · ₹ crore', [A('profitBeforeTax','PBT','#00D2FF'), A('pbtLessDepreciation','PBT - Depreciation','#FFB800')]),
      annualSpec(annualRows, 'bank-profit-npm', 'Net profit & NPM', 'Net profit · ₹ crore; NPM = net profit ÷ total revenue · %', [A('netProfit','Net profit','#FFB800'), A('netProfitMargin','NPM','#FF2E93','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-dividend', 'Dividend & payout', 'Dividend amount · ₹ crore; payout ratio · %', [A('dividend','Dividend amount','#FFB800'), A('dividendPayout','Dividend payout','#B75CFF','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-eps-dps', 'EPS, dividend per share & payout', 'Per-share values · ₹; payout ratio · %', [A('eps','EPS','#00F5A0',undefined,undefined,'rupee'), A('dividendPerShare','Dividend per share','#FFB800',undefined,undefined,'rupee'), A('dividendPayout','Dividend payout','#FF2E93','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-returns', 'ROE & ROA', 'ROE and ROA columns share one scale; ROA is overlaid as a line on the right scale', [A('roe','ROE','#00F5A0',undefined,undefined,'percent'), A('roa','ROA','#00D2FF',undefined,undefined,'percent'), { key: 'roaOverlay', label: 'ROA line', color: '#FF2E93', kind: 'line', axis: 'right', unit: 'percent' }], 'combo'),
      annualSpec(annualRows, 'bank-equity-de', 'Equity & borrowings/equity', 'Equity and borrowings columns · ₹ crore; ratio line · ×', [A('equity','Equity','#00F5A0'), A('borrowings','Borrowings','#FFB800'), A('debtToEquity','Borrowings / equity','#FF5353','line','right','ratio')], 'combo'),
      annualSpec(annualRows, 'bank-liquidity', 'Cash & liquidity', 'Cash & Bank · ₹ crore; liquidity = cash ÷ (borrowings + other liabilities) · %', [A('cashBank','Cash & Bank','#00D2FF'), A('liquidity','Liquidity','#B75CFF','line','right','percent')], 'combo'),
      annualSpec(annualRows, 'bank-assets', 'Total assets, Loans- Advances & borrowings', '₹ crore · Total assets, Loans & Advances & borrowings', [A('totalAssets','Total assets','#00F5A0'), A('loansAdvances','Loans & Advances','#00D2FF'), A('borrowings','Borrowings','#FFB800')]),
      annualSpec(annualRows, 'bank-ldr', 'LDR (%) [Credit-to-Deposit Ratio]', 'Loans & Advances & Deposits · ₹ crore (left axis) · LDR · % (right axis)', [A('loansAdvances', 'Loans & Advances', '#00D2FF'), A('deposits', 'Deposits', '#00F5A0'), A('ldr', 'LDR', '#FFB800', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annualRows, 'bank-borrowings-deposits', 'Borrowings / Deposits (%)', 'Wholesale Borrowings & Deposits · ₹ crore (left axis) · Borrowings / Deposits · % (right axis)', [A('borrowings', 'Borrowings', '#FFB800'), A('deposits', 'Deposits', '#00F5A0'), A('borrowingsToDeposits', 'Borrowings / Deposits', '#FF5353', 'line', 'right', 'percent')], 'combo'),
      annualSpec(annualRows, 'bank-equity-assets', 'Equity / Total Assets (%)', 'Equity & Total Assets · ₹ crore (left axis) · Equity / Total Assets · % (right axis)', [A('equity', 'Equity', '#00F5A0'), A('totalAssets', 'Total assets', '#00D2FF'), A('equityToTotalAssets', 'Equity / Total Assets', '#B75CFF', 'line', 'right', 'percent')], 'combo'),
    ],
    quarterly: [
      quarterSpec(quarterRows, 'bank-quarter-interest-gap', 'Interest earned & interest paid', '₹ crore · Interest Ratio = Interest Paid / Interest Earned (%)', [Q('interestEarned','Interest earned','#00F5A0'), Q('interestPaid','Interest paid','#FFB800'), Q('interestRatio','Interest Ratio','#B75CFF','line','right','percent')], 'combo'),
      quarterSpec(quarterRows, 'bank-quarter-income', 'Interest earned & other income', '₹ crore · Interest income contribution = Interest income \\ Total income (%)', [Q('interestEarned','Interest earned','#00F5A0'), Q('otherIncome','Other income','#00D2FF'), Q('interestIncomeContribution','Interest income contribution','#FF2E93','line','right','percent')], 'combo'),
      quarterSpec(quarterRows, 'bank-quarter-revenue-expense', 'Total revenue & total expense', '₹ crore · OPM = [(total revenue − total expense) ÷ total revenue] % | Total revenue = Sales (Interest Earned) + Other Income | Total Expense=Operating Expenses+Other Expenses (Provisions)+Interest Paid', [Q('totalRevenue','Total revenue','#00F5A0'), Q('totalExpense','Total expense','#FF5353'), Q('operatingProfitMargin','OPM','#00D2FF','line','right','percent')], 'combo'),
      quarterSpec(quarterRows, 'bank-quarter-pbt', 'Profit before tax (PBT) & [PBT - Depreciation]', 'Quarterly PBT & PBT less depreciation · ₹ crore', [Q('profitBeforeTax','PBT','#00D2FF'), Q('pbtLessDepreciation','PBT - Depreciation','#FFB800')]),
      quarterSpec(quarterRows, 'bank-quarter-profit', 'Net profit & NPM', 'Net profit · ₹ crore; NPM = net profit ÷ total revenue · %', [Q('netProfit','Net profit','#FFB800'), Q('netProfitMargin','NPM','#FF2E93','line','right','percent')], 'combo'),
    ],
  }
}
