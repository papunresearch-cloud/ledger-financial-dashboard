export type RollingAverageResult = { value: number | null; windows: number }

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

/**
 * Calculates robust weighted average:
 * 1. Excludes bad data (null, undefined, non-finite). Preserves 0 and negative values.
 * 2. Fallbacks for small samples (N <= 5):
 *    - N = 5: average of middle 3 (dropping min and max)
 *    - N = 4: average of middle 2 (dropping min and max)
 *    - N = 3: middle 1 (median)
 *    - N = 2: average of 2
 *    - N = 1: single value
 *    - N = 0: null (blank)
 * 3. When N > 5:
 *    - Calculates IQR: Q1 (25th percentile) and Q3 (75th percentile).
 *    - Winsorizes outliers: data < Q1 - 1.5*IQR is replaced by Q1 - 1.5*IQR;
 *      data > Q3 + 1.5*IQR is replaced by Q3 + 1.5*IQR.
 *    - Applies gradual recency weights (linearly increasing from oldest to newest)
 *      with EQ = 100/N, the middle year(s) equal EQ, and 100 * (newest - oldest) / EQ = 50.
 */
export function calculateRobustWeightedAverage(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
  const N = valid.length
  if (N === 0) return null
  if (N === 1) return valid[0]
  if (N === 2) return (valid[0] + valid[1]) / 2

  const sorted = [...valid].sort((a, b) => a - b)
  if (N === 3) return sorted[1]
  if (N === 4) return (sorted[1] + sorted[2]) / 2
  if (N === 5) return (sorted[1] + sorted[2] + sorted[3]) / 3

  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr

  const winsorized = valid.map(v => {
    if (v < lowerBound) return lowerBound
    if (v > upperBound) return upperBound
    return v
  })

  const EQ = 100 / N
  let weights: number[]
  if (N % 2 === 1) {
    const m = (N - 1) / 2
    const step = (0.25 * EQ) / m
    weights = Array.from({ length: N }, (_, i) => 0.75 * EQ + i * step)
  } else {
    const m1 = N / 2 - 1
    const m2 = N / 2
    const step = (0.25 * EQ) / m1
    weights = Array.from({ length: N }, (_, i) => {
      if (i <= m1) return 0.75 * EQ + i * step
      return EQ + (i - m2) * step
    })
  }

  const weightedSum = winsorized.reduce((sum, val, idx) => sum + val * weights[idx], 0)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  return totalWeight > 0 ? weightedSum / totalWeight : null
}

/** Average each complete 3-period window, then average those window averages. */
export function averageOfThreeYearRollingAverages(values: Array<number | null>): RollingAverageResult {
  const rollingAverages: number[] = []
  for (let end = 2; end < values.length; end++) {
    const window = values.slice(end - 2, end + 1)
    const validValues = window.filter((value): value is number => value !== null && Number.isFinite(value))
    if (validValues.length !== 3) continue
    rollingAverages.push(validValues.reduce((sum, value) => sum + value, 0) / 3)
  }
  if (!rollingAverages.length) return { value: null, windows: 0 }
  const value = rollingAverages.reduce((sum, item) => sum + item, 0) / rollingAverages.length
  return { value: Number.isFinite(value) ? value : null, windows: rollingAverages.length }
}

/**
 * Calculates rolling cash ratio average for CFO/Sales, FCF/Sales, CFO/Net profit, FCF/Net profit:
 * 1. Takes 3-year rolling sums: CFO / Sales (%) = (3-Year Sum of CFO / 3-Year Sum of Sales) * 100
 *    and similarly for FCF/Sales, CFO/Net profit, FCF/Net profit.
 * 2. If the 3-year sum of denominator <= 0 (e.g. net loss or non-positive sales), skips that specific window.
 * 3. If valid rolling windows > 3, applies Recency Weighted Average.
 * 4. If valid rolling windows <= 3, applies simple average.
 * 5. If only 2 annual data points available (no 3Y rolling window possible), takes simple average of the 2 individual annual ratios.
 * 6. If only 1 annual data point available, takes that single annual ratio.
 * 7. If 0 valid points, returns null.
 */
export function calculateRollingCashRatioAverage(
  annualRows: Array<{
    numerator: number | null | undefined
    denominator: number | null | undefined
  }>,
): number | null {
  const validRows = annualRows.filter(
    (row): row is { numerator: number; denominator: number } =>
      row.numerator !== null &&
      row.numerator !== undefined &&
      Number.isFinite(row.numerator) &&
      row.denominator !== null &&
      row.denominator !== undefined &&
      Number.isFinite(row.denominator),
  )

  const N = validRows.length
  if (N === 0) return null

  if (N === 1) {
    const { numerator, denominator } = validRows[0]
    return denominator > 0 ? (numerator / denominator) * 100 : null
  }

  if (N === 2) {
    const r1 = validRows[0].denominator > 0 ? (validRows[0].numerator / validRows[0].denominator) * 100 : null
    const r2 = validRows[1].denominator > 0 ? (validRows[1].numerator / validRows[1].denominator) * 100 : null
    const valid = [r1, r2].filter((r): r is number => r !== null && Number.isFinite(r))
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
  }

  const windows: number[] = []

  for (let end = 2; end < N; end++) {
    const sumNum = validRows[end - 2].numerator + validRows[end - 1].numerator + validRows[end].numerator
    const sumDen = validRows[end - 2].denominator + validRows[end - 1].denominator + validRows[end].denominator

    if (sumDen > 0) {
      windows.push((sumNum / sumDen) * 100)
    }
  }

  if (windows.length === 0) {
    const annualRatios = validRows
      .filter(r => r.denominator > 0)
      .map(r => (r.numerator / r.denominator) * 100)
    if (annualRatios.length === 0) return null
    return annualRatios.reduce((a, b) => a + b, 0) / annualRatios.length
  }

  if (windows.length <= 3) {
    return windows.reduce((a, b) => a + b, 0) / windows.length
  }

  return calculateRobustWeightedAverage(windows)
}
