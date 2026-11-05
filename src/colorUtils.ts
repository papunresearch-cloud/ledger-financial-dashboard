/**
 * Evaluates dynamic text color for an overview table cell value compared to its row's average value.
 *
 * Color brackets:
 * - value >= 0.90 * avg & <= 1.10 * avg -> #B0C7EB
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
 * - Fallback / confusion               -> #808080
 */
export function getRelativeColor(
  value: number | null | undefined,
  avg: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    avg === null ||
    avg === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(avg) ||
    avg <= 0
  ) {
    return '#808080'
  }

  const ratio = value / avg

  if (ratio > 2.0) return '#3DFF1F'
  if (ratio > 1.75) return '#1FFF39'
  if (ratio > 1.50) return '#1FFF62'
  if (ratio > 1.25) return '#1FFF87'
  if (ratio > 1.10) return '#1FFFD2'
  if (ratio >= 0.90) return '#B0C7EB'
  if (ratio >= 0.80) return '#D61FFF'
  if (ratio >= 0.70) return '#FF1FB8'
  if (ratio >= 0.60) return '#FD216E'
  if (ratio >= 0.50) return '#FF1F39'
  if (ratio < 0.50) return '#FE4820'

  return '#808080'
}
