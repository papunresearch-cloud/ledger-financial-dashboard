import type { RollingAverageResult } from './rollingPerShare'

type Props = {
  eps: RollingAverageResult
  dividendPerShare: RollingAverageResult
  freeCashFlowPerShare: RollingAverageResult
  note: string
}

const moneyPerShare = (value: number | null) => value === null || !Number.isFinite(value)
  ? '—'
  : `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)} / share`

export function PerShareRollingSummary({ eps, dividendPerShare, freeCashFlowPerShare, note }: Props) {
  const metrics = [
    { label: 'EPS', result: eps, tone: 'mint' },
    { label: 'Dividend per Share', result: dividendPerShare, tone: 'gold' },
    { label: 'FCF per Share', result: freeCashFlowPerShare, tone: 'violet' },
  ]
  return <section className="per-share-summary">
    <div className="per-share-summary-heading"><div><span>ROLLING PER-SHARE ANALYSIS</span><h3>Average of 3-year rolling averages</h3></div><small>₹ / share</small></div>
    <div className="per-share-card-grid">{metrics.map(({ label, result, tone }) => <article className={`per-share-card per-share-${tone}`} key={label}>
      <span>{label}</span><strong>{moneyPerShare(result.value)}</strong><small>{result.windows ? `${result.windows} rolling windows combined` : 'No complete rolling window available'}</small>
    </article>)}</div>
    <p>{note}</p>
  </section>
}
