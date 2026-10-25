import { useState } from 'react'
import { useI18n } from '../lib/i18n'

export type HpChange = (amount: number, kind: 'damage' | 'heal') => void

/** Number box with Damage (−) and Heal (+) for the current hit points. Never printed. */
export default function HpAdjust({ onApply, variant, hp }: { onApply: HpChange; variant: 'sheet' | 'bar'; hp?: { cur: number; max: number; temp: number } }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const amount = Math.abs(Math.round(+value || 0))
  const apply = (kind: 'damage' | 'heal') => {
    if (!amount) return
    onApply(amount, kind)
    setValue('')
  }
  return (
    <div className={`hp-adjust ${variant} no-print`}>
      {variant === 'bar' && hp && (
        <span className="hp-adjust-now" dir="ltr">❤ <strong>{hp.cur}</strong> / {hp.max}{hp.temp ? ` (+${hp.temp})` : ''}</span>
      )}
      <input
        type="number" inputMode="numeric" min={0} placeholder="#" value={value} aria-label={t('hpAmount')} title={t('hpAmount')}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="hp-adjust-btns">
        <button type="button" className="hp-dmg" disabled={!amount} title={t('cbDamage')} onClick={() => apply('damage')}>
          −{variant === 'bar' && <> {t('cbDamage')}</>}
        </button>
        <button type="button" className="hp-heal" disabled={!amount} title={t('cbHeal')} onClick={() => apply('heal')}>
          +{variant === 'bar' && <> {t('cbHeal')}</>}
        </button>
      </div>
    </div>
  )
}
