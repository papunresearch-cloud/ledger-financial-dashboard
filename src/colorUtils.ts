/**
 * Evaluates dynamic text color for an overview table cell value compared to its row's average value.
 *
 * Color brackets:
 * - value >= 0.90 * avg & <= 1.10 * avg -> #1FDAFF
 * - value > 1.10 * avg & <= 1.25 * avg -> #1FFFD2
 * - value > 1.25 * avg & <= 1.50 * avg -> #1FFF87
 * - value > 1.50 * avg & <= 1.75 * avg -> #1FFF62
 * - value > 1.75 * avg & <= 2.00 * avg -> #1FFF39
 * - value > 2.00 * avg                 -> #3DFF1F
 * - value < 0.90 * avg & >= 0.80 * avg -> #D61FFF
 * - value < 0.80 * avg & >= 0.70 * avg -> #FF1FB8
 * - value < 0.70 * avg & >= 0.60 * avg -> #FD216E
 * - value < 0.60 * avg & >= 0.50 * avg -> #FF1F39
 * - value < 0.50 * avg                 -> #FE4820
 */
export function getRelativeColor(
  value: number | null | undefined,
  avg: number | null | undefined
): string | undefined {
  if (
    value === null ||
    value === undefined ||
    avg === null ||
    avg === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(avg) ||
    avg === 0
  ) {
    return undefined
  }

  const diffRatio = (value - avg) / Math.abs(avg)

  if (diffRatio > 1.0) return '#3DFF1F'
  if (diffRatio > 0.75) return '#1FFF39'
  if (diffRatio > 0.50) return '#1FFF62'
  if (diffRatio > 0.25) return '#1FFF87'
  if (diffRatio > 0.10) return '#1FFFD2'
  if (diffRatio >= -0.10) return '#1FDAFF'
  if (diffRatio >= -0.20) return '#D61FFF'
  if (diffRatio >= -0.30) return '#FF1FB8'
  if (diffRatio >= -0.40) return '#FD216E'
  if (diffRatio >= -0.50) return '#FF1F39'
  return '#FE4820'
}
