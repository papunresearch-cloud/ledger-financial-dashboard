export type RollingAverageResult = { value: number | null; windows: number }

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
