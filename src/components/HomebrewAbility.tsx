import type { ReactNode } from 'react'
import { useDice } from './Dice'
import { rollExpr } from '../lib/dice'
import { resolveDice } from '../lib/homebrew'
import { useI18n } from '../lib/i18n'
import type { Character, HomebrewAbility } from '../lib/types'

/** An ability's text and mechanics (library view). */
export function AbilityDetails({ h, ch, children }: { h: HomebrewAbility; ch?: Character; children?: ReactNode }) {
  const { t, lang } = useI18n()
  const { show } = useDice()
  const roll = () => {
    if (!ch || !h.dice) return
    const r = resolveDice(h.dice, ch, lang)
    show(rollExpr(r.expr, { title: h.name, subtitle: ch.name, kind: 'custom', parts: r.parts }))
  }
  return (
    <div className="hb-ability">
      <div className="row wrap">
        <span className="pill">{t(`hbCat_${h.category}` as 'hbCat_boon')}</span>
        <span className="pill">{t(`hbAct_${h.activation}` as 'hbAct_action')}</span>
        {h.uses && <span className="pill pill-active">⟳ <bdi dir="ltr">{h.uses.max}</bdi> · {t(h.uses.recharge === 'short' ? 'restShortTag' : 'restLongTag')}</span>}
        {h.dice && (ch
          ? <button className="btn btn-small" onClick={roll}>🎲 <bdi dir="ltr">{h.dice}</bdi></button>
          : <span className="pill">🎲 <bdi dir="ltr">{h.dice}</bdi></span>)}
      </div>
      {children}
      {h.desc ? <div className="hb-desc" dir="auto">{h.desc.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div> : <p className="muted">{t('noDescription')}</p>}
    </div>
  )
}

