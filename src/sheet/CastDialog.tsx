import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDice } from '../components/Dice'
import { castDice, castOptions, castPatch, defaultOption, isPrepared, needsAttackRoll, spellDice, uncastPatch, upcastEffect, type CastOption, type UpcastEffect } from '../lib/casting'
import { useSheetRolls } from './rolls'
import { rollExpr } from '../lib/dice'
import { useI18n } from '../lib/i18n'
import type { Spell } from '../lib/rules'
import { casterInfo, spellAllowance } from '../lib/spellAccess'
import type { Character } from '../lib/types'

/** `cast(spell)` opens the dialog; render `dialog` once in the page. */
export function useCaster(ch: Character, onChange: (p: Partial<Character>) => void): { cast(spell: Spell): void; dialog: ReactNode } {
  const [spell, setSpell] = useState<Spell | null>(null)
  return {
    cast: setSpell,
    // Portal: the sheet pages are CSS-transformed, which would trap a fixed-position dialog inside the page.
    dialog: spell ? createPortal(<CastDialog key={spell.id} ch={ch} spell={spell} onChange={onChange} onClose={() => setSpell(null)} />, document.body) : null,
  }
}

function CastDialog({ ch, spell, onChange, onClose }: { ch: Character; spell: Spell; onChange(p: Partial<Character>): void; onClose(): void }) {
  const { t, g } = useI18n()
  const { show } = useDice()
  const [done, setDone] = useState<CastOption | null>(null)
  const [message, setMessage] = useState('')
  const opts = castOptions(ch, spell)
  const preferred = defaultOption(opts)
  const name = g('spells', spell.id, spell.name)
  const mode = spellAllowance(ch.classId, ch.subclass, ch.level, ch.abilities).mode
  const prepares = mode === 'prepared' || mode === 'spellbook'
  // Domain / oath spells are always prepared.
  const prepared = isPrepared(ch, spell)
  // Dice to roll: with a higher slot, the stronger total replaces the spell's base roll.
  const dice = done?.kind === 'slot' ? castDice(spell, ch.level, done.level) : spellDice(spell, ch.level)
  const rolls = useSheetRolls(ch, true, onChange)

  /** What a higher slot adds, in words: "3d8 instead of 1d8 (+2d8)", "+2 targets"… */
  const effectText = (e: UpcastEffect) =>
    e.kind === 'dice' ? (e.total ? t('upDice', { total: e.total, base: e.base ?? '', extra: e.extra }) : t('upDiceExtra', { extra: e.extra }))
      : e.kind === 'targets' ? t(e.n === 1 ? 'upTarget1' : 'upTargets', { n: e.n })
      : e.kind === 'count' ? t('upCount', { n: e.n, noun: e.noun })
      : e.kind === 'flat' ? t('upFlat', { n: e.n, unit: e.unit })
      : e.kind === 'rule' ? t('upSeeRule')
      : e.kind === 'none' ? t('upNoGain') : t('upUnknown')
  /** The line under a slot button: normal strength, or what this higher slot gives. */
  const slotNote = (o: CastOption) => {
    if (o.kind !== 'slot') return null
    const up = upcastEffect(spell, o.level)
    if (!up) return <span className="cast-opt-sub">{t('castAsWritten')}{spellDice(spell, ch.level).length > 0 && <> · <bdi dir="ltr">{spellDice(spell, ch.level).join(' / ')}</bdi></>}</span>
    const gains = up.kind !== 'none' && up.kind !== 'unknown'
    return (
      <span className={`cast-opt-sub ${gains ? 'up' : ''}`}>
        {gains ? '▲ ' : ''}{t(o.level - spell.level === 1 ? 'castHigher1' : 'castHigherN', { n: o.level - spell.level })}: <bdi>{effectText(up)}</bdi>
      </span>
    )
  }
  const higherSlots = opts.some((o) => o.kind === 'slot' && o.level > spell.level)

  const doCast = (o: CastOption) => {
    if ((o.kind === 'slot' || o.kind === 'arcanum') && o.left <= 0) {
      setMessage(t('castNoSlots', { n: o.level }))
      return
    }
    onChange(castPatch(ch, o))
    setDone(o)
  }
  const undo = () => {
    if (done) onChange(uncastPatch(ch, done))
    onClose()
  }

  const label = (o: CastOption) =>
    o.kind === 'cantrip' ? t('castCantrip')
      : o.kind === 'ritual' ? t('castRitual')
      : o.kind === 'granted' ? t('castGranted')
      : o.kind === 'arcanum' ? t('castArcanum', { n: o.level, left: o.left })
      : t('castSlot', { n: o.level, left: o.left, total: o.total })

  const result = (o: CastOption) => {
    if (o.kind === 'granted') return t('castDoneGranted', { name })
    if (o.kind === 'cantrip' || o.kind === 'ritual') return t(o.kind === 'ritual' ? 'castDoneRitual' : 'castDoneCantrip', { name })
    const up = o.level > spell.level ? ` ${t('castUpcast')}` : ''
    const left = o.kind === 'slot' ? o.left - 1 : 0
    return t('castDone', { name, n: o.level, up, left })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <section className="cast-dialog card" role="dialog" aria-label={t('castTitle', { name })}>
          <header className="cast-head">
            <div>
              <h3>✨ {name}</h3>
              <div className="muted small">
                {spell.level === 0 ? t('cantrip') : t('levelN', { n: spell.level })} · <span dir="ltr">{spell.castingTime} · {spell.range}</span>
              </div>
            </div>
            <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>
          </header>

          {!done ? (
            <>
              {prepares && spell.level > 0 && !prepared && <p className="notice small">📖 {t('castNotPrepared')}</p>}
              {spell.concentration && <p className="muted small">◎ {t('castConcentration')}</p>}
              <p className="small cast-ask">{opts.length ? t('castUsing') : t('castNoOptions')}</p>
              <div className="cast-options">
                {opts.map((o, i) => (
                  <button key={i}
                    className={`btn cast-opt ${o === preferred ? 'btn-primary' : ''} ${(o.kind === 'slot' || o.kind === 'arcanum') && o.left <= 0 ? 'cast-empty' : ''}`}
                    onClick={() => doCast(o)}>
                    <span>{label(o)}</span>
                    {slotNote(o)}
                  </button>
                ))}
              </div>
              {/* What a higher slot does: the spell's own rule, or a plain statement that there is none. */}
              {higherSlots && (spell.higherLevel ? (
                <div className="cast-rule">
                  <strong>{t('upRuleTitle')}</strong>
                  <p dir="ltr" lang="en">{spell.higherLevel}</p>
                </div>
              ) : <p className="muted small">{t(spell.desc ? 'upNoGainHint' : 'upUnknownHint')}</p>)}
              {message && <p className="error-box small">{message}</p>}
            </>
          ) : (
            <>
              <p className="cast-result">{result(done)}</p>
              <div className="row wrap">
                {needsAttackRoll(spell) && casterInfo(ch.classId, ch.subclass) && <button className="btn btn-small" onClick={(e) => rolls.spellAttack(e)}>🎯 {t('diceSpellAttack')}</button>}
                {dice.map((d) => (
                  <button key={d} className="btn btn-small" onClick={() => show(rollExpr(d, { title: name, subtitle: d, kind: 'damage' }))}>🎲 {d}</button>
                ))}
                <span className="grow" />
                {(done.kind === 'slot' || done.kind === 'arcanum') && <button className="btn btn-small btn-ghost" onClick={undo}>↶ {t('castUndo')}</button>}
                <button className="btn btn-small" onClick={onClose}>{t('close')}</button>
              </div>
              {done.kind === 'slot' && upcastEffect(spell, done.level) && spell.higherLevel && (
                <div className="cast-rule">
                  <strong>▲ {t(done.level - spell.level === 1 ? 'castHigher1' : 'castHigherN', { n: done.level - spell.level })}: <bdi>{effectText(upcastEffect(spell, done.level)!)}</bdi></strong>
                  <p dir="ltr" lang="en">{spell.higherLevel}</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
