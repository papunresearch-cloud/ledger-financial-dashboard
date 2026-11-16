import type {
  AboutPromoterProfile,
  AboutShareholding,
  AboutShareholdingTable,
  AboutState,
} from './types'

export interface NormalizedPromoterProfile {
  isStructured: boolean
  flatText: string
  mainGroup: string
  shortHistory: string
  reputation: string
  positives: string[]
  negatives: string[]
  ownershipTakeaway: string
  hasContent: boolean
}

function cleanStr(val: unknown): string {
  return typeof val === 'string' ? val.trim() : val == null ? '' : String(val).trim()
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map(cleanStr).filter(Boolean)
  }
  const s = cleanStr(val)
  if (!s) return []
  return s
    .split(/\r?\n/)
    .map(line => line.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean)
}

export function normalizePromoterProfile(
  raw?: AboutPromoterProfile | string | null,
): NormalizedPromoterProfile {
  if (!raw) {
    return {
      isStructured: false,
      flatText: '',
      mainGroup: '',
      shortHistory: '',
      reputation: '',
      positives: [],
      negatives: [],
      ownershipTakeaway: '',
      hasContent: false,
    }
  }
  if (typeof raw === 'string') {
    const flatText = raw.trim()
    return {
      isStructured: false,
      flatText,
      mainGroup: flatText,
      shortHistory: '',
      reputation: '',
      positives: [],
      negatives: [],
      ownershipTakeaway: '',
      hasContent: Boolean(flatText),
    }
  }
  const mainGroup = cleanStr(raw.main_promoter_group)
  const shortHistory = cleanStr(raw.short_history)
  const reputation = cleanStr(raw.reputation)
  const positives = toStringArray(raw.positives)
  const negatives = toStringArray(raw.negatives_and_risks)
  const ownershipTakeaway = cleanStr(raw.ownership_takeaway)
  const hasContent = Boolean(
    mainGroup || shortHistory || reputation || positives.length || negatives.length || ownershipTakeaway,
  )
  return {
    isStructured: true,
    flatText: '',
    mainGroup,
    shortHistory,
    reputation,
    positives,
    negatives,
    ownershipTakeaway,
    hasContent,
  }
}

function normalizeTable(tbl?: AboutShareholdingTable | null): AboutShareholdingTable {
  if (!tbl || !Array.isArray(tbl.headers) || !Array.isArray(tbl.rows)) {
    return { headers: [], rows: [], note: '' }
  }
  return {
    headers: tbl.headers.map(h => cleanStr(h)).filter(Boolean),
    rows: tbl.rows.map(r => ({
      label: cleanStr(r.label),
      values: Array.isArray(r.values) ? r.values.map(v => cleanStr(v) || '-') : [],
      is_count: Boolean(r.is_count),
    })),
    note: cleanStr(tbl.note),
  }
}

export interface ResolvedShareholding extends AboutShareholding {
  hasQuarterly: boolean
  hasYearly: boolean
  hasAny: boolean
}

export function resolveShareholding(about?: AboutState | null): ResolvedShareholding {
  const sh = about?.sources?.shareholding
  const quarterly = normalizeTable(sh?.quarterly)
  const yearly = normalizeTable(sh?.yearly)
  const hasQuarterly = quarterly.headers.length > 0 && quarterly.rows.length > 0
  const hasYearly = yearly.headers.length > 0 && yearly.rows.length > 0
  const named_promoters = Array.isArray(sh?.named_promoters) ? sh!.named_promoters : []
  return {
    screener_url: cleanStr(sh?.screener_url),
    pledged_pct: cleanStr(sh?.pledged_pct),
    quarterly,
    yearly,
    named_promoters,
    hasQuarterly,
    hasYearly,
    hasAny: hasQuarterly || hasYearly || named_promoters.length > 0,
  }
}

export function formatPromoterProfileText(
  profile: NormalizedPromoterProfile,
  cleanFn: (s: string) => string = s => s,
): string {
  if (!profile.hasContent) return ''
  if (!profile.isStructured) return cleanFn(profile.flatText)
  const parts: string[] = []
  if (profile.mainGroup) parts.push(`Main Promoter Group: ${cleanFn(profile.mainGroup)}`)
  if (profile.shortHistory) parts.push(`Short History: ${cleanFn(profile.shortHistory)}`)
  if (profile.reputation) parts.push(`Reputation: ${cleanFn(profile.reputation)}`)
  if (profile.positives.length) {
    parts.push(`Positives: ${profile.positives.map(p => cleanFn(p)).join(' ; ')}`)
  }
  if (profile.negatives.length) {
    parts.push(`Concerns & Risks: ${profile.negatives.map(n => cleanFn(n)).join(' ; ')}`)
  }
  if (profile.ownershipTakeaway) parts.push(`Ownership Trend: ${cleanFn(profile.ownershipTakeaway)}`)
  return parts.join('\n')
}
