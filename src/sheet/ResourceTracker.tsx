import { UNLIMITED, rechargeAt, type ResourceState } from '../lib/classFeatures'
import { useI18n } from '../lib/i18n'

/** Up to this many uses are shown as clickable bubbles; bigger pools (Lay on Hands…) get −/+ buttons. */
const MAX_BUBBLES = 20

/**
 * A usable feature you can click, like a spell slot: each bubble is one use (filled = used).
 * Pools show what's left with quick spend buttons. `compact` is the sheet's inline style.
 */
export default function ResourceTracker({ r, level, edit, onUsed, compact }: {
  r: ResourceState
  level: number
  edit: boolean
  onUsed(used: number): void
  compact?: boolean
}) {
  const { t } = useI18n()
  const left = r.total - r.used
  const set = (used: number) => onUsed(Math.max(0, Math.min(r.total, used)))
  const short = rechargeAt(r, level) === 'short'

  if (r.total >= UNLIMITED) return <span className={`rt ${compact ? 'rt-compact' : ''}`}><strong className="rt-left">∞</strong></span>

  if (r.total <= MAX_BUBBLES) {
    return (
      <span className={`rt ${compact ? 'rt-compact' : ''}`} dir="ltr">
        {Array.from({ length: r.total }, (_, i) => {
          const used = i < r.used
          return (
            <button
              key={i} type="button" disabled={!edit}
              className={`bubble bubble-slot rt-bubble ${used ? 'on' : ''}`}
              title={used ? t('rtRegain') : t('rtUse')}
              aria-label={`${r.label} ${i + 1}: ${used ? t('rtUsed') : t('rtAvailable')}`}
              // Like spell slots: clicking the first free bubble uses one; clicking a used one gives it back.
              onClick={() => set(used ? i : i + 1)}
            />
          )
        })}
        {!compact && <span className="rt-recharge">{short ? '☾' : '☀'}</span>}
      </span>
    )
  }

  return (
    <span className={`rt rt-pool ${compact ? 'rt-compact' : ''}`} dir="ltr">
      {edit && <button type="button" className="rt-btn" title={t('rtUse')} disabled={left <= 0} onClick={() => set(r.used + 1)}>−1</button>}
      {edit && r.total >= 20 && <button type="button" className="rt-btn" title={t('rtUse')} disabled={left < 5} onClick={() => set(r.used + 5)}>−5</button>}
      <span className="rt-count"><strong className="rt-left">{left}</strong>/{r.total}</span>
      {edit && <button type="button" className="rt-btn" title={t('rtRegain')} disabled={r.used <= 0} onClick={() => set(r.used - 1)}>+1</button>}
      {edit && !compact && <button type="button" className="rt-btn" title={t('cfReset')} disabled={r.used <= 0} onClick={() => set(0)}>↺</button>}
    </span>
  )
}
