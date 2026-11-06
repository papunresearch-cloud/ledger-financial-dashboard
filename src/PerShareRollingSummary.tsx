type ValueOrObj = number | null | { value: number | null }

type Props = {
  eps: ValueOrObj
  dividendPerShare: ValueOrObj
  freeCashFlowPerShare: ValueOrObj
  note: string
}

const moneyPerShare = (value: number | null) => value === null || !Number.isFinite(value)
  ? '—'
  : `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)} / share`

const resolveValue = (v: ValueOrObj): number | null =>
  v !== null && typeof v === 'object' && 'value' in v ? v.value : v

export function PerShareRollingSummary({ eps, dividendPerShare, freeCashFlowPerShare, note }: Props) {
  const metrics = [
    { label: 'Average EPS', value: resolveValue(eps), tone: 'mint' },
    { label: 'Average Dividend per Share', value: resolveValue(dividendPerShare), tone: 'gold' },
    { label: 'Average FCF per Share', value: resolveValue(freeCashFlowPerShare), tone: 'violet' },
  ]
  return <section className="per-share-summary">
    <div className="per-share-summary-heading"><div><span>PER-SHARE ANALYSIS</span><h3>Annual normalized average</h3></div><small>₹ / share</small></div>
    <div className="per-share-card-grid">{metrics.map(({ label, value, tone }) => <article className={`per-share-card per-share-${tone}`} key={label}>
      <span>{label}</span><strong>{moneyPerShare(value)}</strong>
    </article>)}</div>
    <p>{note}</p>
  </section>
}
