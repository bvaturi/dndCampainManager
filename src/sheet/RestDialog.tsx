import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { rollExpr } from '../lib/dice'
import { useI18n } from '../lib/i18n'
import {
  hitDice, hitDieHealing, longRestChanges, longRestPatch, longRestOnly, recoveryCost, shortRestChanges, shortRestPatch,
  slotRecovery, songOfRestDie, type RestChange,
} from '../lib/rest'
import { mod } from '../lib/rules'
import type { Character } from '../lib/types'

type Kind = 'short' | 'long'

/** `open('short' | 'long')` shows the rest dialog; render `dialog` once in the page. */
export function useRest(ch: Character, onChange: (p: Partial<Character>) => void): { open(kind: Kind): void; dialog: ReactNode } {
  const [kind, setKind] = useState<Kind | null>(null)
  const close = () => setKind(null)
  return {
    open: setKind,
    // Portal: the sheet pages are CSS-transformed, which would trap a fixed-position dialog inside the page.
    dialog: kind ? createPortal(
      kind === 'short'
        ? <ShortRest ch={ch} onChange={onChange} onClose={close} />
        : <LongRest ch={ch} onChange={onChange} onClose={close} />,
      document.body,
    ) : null,
  }
}

/** Short / long rest buttons for a toolbar. */
export function RestButtons({ ch, onChange, small = true }: { ch: Character; onChange(p: Partial<Character>): void; small?: boolean }) {
  const { t } = useI18n()
  const rest = useRest(ch, onChange)
  const cls = `btn ${small ? 'btn-small' : ''}`
  return (
    <>
      <button className={cls} onClick={() => rest.open('short')} title={t('restShortIntro')}>☾ {t('cfShortRest')}</button>
      <button className={cls} onClick={() => rest.open('long')} title={t('restLongIntro')}>☀ {t('cfLongRest')}</button>
      {rest.dialog}
    </>
  )
}

function Shell({ title, icon, intro, onClose, children }: { title: string; icon: string; intro: string; onClose(): void; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <section className="rest-dialog card" role="dialog" aria-label={title}>
          <header className="cast-head">
            <div>
              <h3>{icon} {title}</h3>
              <div className="muted small">{intro}</div>
            </div>
            <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>
          </header>
          {children}
        </section>
      </div>
    </div>
  )
}

function ChangeList({ items }: { items: RestChange[] }) {
  const { t } = useI18n()
  const label = (c: RestChange) =>
    c.kind === 'resource' ? c.label
      : c.kind === 'slots' ? t('restSlots', { n: c.key })
      : c.kind === 'pact' ? t('restPact', { n: c.key })
      : t(c.kind === 'hp' ? 'restHp' : c.kind === 'temp' ? 'restTemp' : c.kind === 'hd' ? 'restHd' : 'restDeath')
  return (
    <ul className="rest-list">
      {items.map((c) => (
        <li key={`${c.kind}-${c.key}`} className={c.full ? 'full' : ''}>
          <span className="rest-name">{label(c)}</span>
          {c.full
            ? <span className="rest-val muted">✓ {t('restFull')}</span>
            : <span className="rest-val"><bdi dir="ltr">{c.from}</bdi> <span className="arrow">→</span> <strong><bdi dir="ltr">{c.to}</bdi></strong></span>}
        </li>
      ))}
    </ul>
  )
}

interface HdRoll { die: number; con: number; heal: number }

function ShortRest({ ch, onChange, onClose }: { ch: Character; onChange(p: Partial<Character>): void; onClose(): void }) {
  const { t, lang } = useI18n()
  const [rolls, setRolls] = useState<HdRoll[]>([])
  const [song, setSong] = useState<number | null>(null)
  const [picks, setPicks] = useState<Record<number, number>>({})
  const hd = hitDice(ch)
  const con = mod(ch.abilities.con)
  const healing = rolls.reduce((a, r) => a + r.heal, 0) + (song ?? 0)
  const hpNow = Math.max(0, ch.hpCurrent)
  const hpAfter = Math.min(ch.hpMax, hpNow + healing)
  const left = hd.left - rolls.length
  const songDie = songOfRestDie(ch)
  const recovery = slotRecovery(ch)
  const spent = recoveryCost(picks)
  const recharges = shortRestChanges(ch, lang)
  const waits = longRestOnly(ch, lang)
  const dirty = rolls.length > 0 || spent > 0

  const rollHitDie = () => {
    const r = rollExpr(`1d${hd.die}${con >= 0 ? '+' : ''}${con}`, {
      title: t('diceHitDie', { n: hd.die }), subtitle: ch.name, kind: 'hitdie',
      parts: [{ label: t('restCon'), value: con }],
    })
    if (!r) return
    const die = r.dice[0]?.rolls[0] ?? 0
    setRolls((xs) => [...xs, { die, con, heal: hitDieHealing(ch, die) }])
  }
  const rollSong = () => {
    if (!songDie) return
    const r = rollExpr(`1d${songDie}`, { title: t('restSong'), subtitle: ch.name, kind: 'hitdie' })
    if (!r) return
    setSong(r.total)
  }
  const pick = (level: number, delta: number) => setPicks((p) => ({ ...p, [level]: Math.max(0, (p[level] ?? 0) + delta) }))
  const close = () => {
    if (dirty && !window.confirm(t('restDiscard'))) return
    onClose()
  }
  const finish = () => {
    onChange(shortRestPatch(ch, {
      hitDiceSpent: rolls.length,
      healing,
      recovery: recovery?.available && spent > 0 ? { key: recovery.key, picks } : undefined,
    }))
    onClose()
  }

  return (
    <Shell title={t('cfShortRest')} icon="☾" intro={t('restShortIntro')} onClose={close}>
      {/* Hit points & hit dice */}
      <div className="rest-block">
        <h4>{t('restHitDice')}</h4>
        <div className="rest-hp">
          <span>{t('restHp')}: <strong dir="ltr">{hpNow}{healing > 0 && <> → <span className="rest-up">{hpAfter}</span></>} / {ch.hpMax}</strong></span>
          <span>{t('restHdLeft', { left, total: hd.total })} <span className="muted" dir="ltr">(d{hd.die}{con >= 0 ? '+' : ''}{con})</span></span>
        </div>
        <div className="hd-pips" aria-hidden>
          {Array.from({ length: hd.total }, (_, i) => {
            const usedBefore = i >= hd.left
            const usedNow = !usedBefore && i >= left
            return <span key={i} className={`hd-pip ${usedBefore ? 'used' : usedNow ? 'now' : ''}`}>d{hd.die}</span>
          })}
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" disabled={left <= 0 || hpAfter >= ch.hpMax} onClick={rollHitDie}>🎲 {t('restRollHd', { n: hd.die })}</button>
          {rolls.length > 0 && <button className="btn btn-small btn-ghost" onClick={() => setRolls((xs) => xs.slice(0, -1))}>↶ {t('castUndo')}</button>}
        </div>
        {left <= 0 && <p className="muted small">{t('restNoHd')}</p>}
        {left > 0 && hpAfter >= ch.hpMax && <p className="muted small">{t('restHpFull')}</p>}
        {rolls.length > 0 && (
          <ul className="hd-log" dir="ltr">
            {rolls.map((r, i) => (
              <li key={i} className={i === rolls.length - 1 ? 'last' : ''}>
                <span className="hd-die">{r.die}</span>
                <span className="muted small">d{hd.die} {r.con >= 0 ? '+' : '−'} {Math.abs(r.con)} {t('restConShort')}</span>
                <strong className="rest-up">+{r.heal}</strong>
              </li>
            ))}
            <li className="hd-total">{t('restHealed')} <strong className="rest-up">+{healing}</strong></li>
          </ul>
        )}
        {songDie && (
          <div className="rest-song">
            <span>🎵 {t('restSongText', { n: songDie })}</span>
            {song === null
              ? <button className="btn btn-small" disabled={rolls.length === 0} onClick={rollSong}>🎲 d{songDie}</button>
              : <strong dir="ltr">+{song}</strong>}
          </div>
        )}
      </div>

      {/* Arcane / Natural Recovery */}
      {recovery && (
        <div className="rest-block">
          <h4>{recovery.key === 'arcane-recovery' ? t('restArcane') : t('restNatural')}</h4>
          {!recovery.available ? <p className="muted small">{t('restRecoveryUsed')}</p> : (() => {
            const levels = ch.slotsExpended.slice(0, 5).map((n, i) => ({ level: i + 1, used: n ?? 0 })).filter((x) => x.used > 0)
            if (!levels.length) return <p className="muted small">{t('restRecoveryNone', { n: recovery.budget })}</p>
            return (
              <>
                <p className="small">{t('restRecoveryText', { n: recovery.budget })} <strong dir="ltr">{spent}/{recovery.budget}</strong></p>
                <div className="rest-recover">
                  {levels.map(({ level, used }) => {
                    const n = picks[level] ?? 0
                    return (
                      <div key={level} className="slot-chip">
                        <span>{t('restSlots', { n: level })}</span>
                        <button className="btn btn-small" disabled={n <= 0} onClick={() => pick(level, -1)}>−</button>
                        <strong dir="ltr">{n}/{used}</strong>
                        <button className="btn btn-small" disabled={n >= used || spent + level > recovery.budget} onClick={() => pick(level, 1)}>+</button>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* What recharges */}
      <div className="rest-block">
        <h4>{t('restRecharges')}</h4>
        {recharges.length ? <ChangeList items={recharges} /> : <p className="muted small">{t('restNothingShort')}</p>}
      </div>
      {waits.length > 0 && (
        <div className="rest-block">
          <h4 className="muted">{t('restWaits')}</h4>
          <ChangeList items={waits.map((w) => ({ ...w, to: '☀' }))} />
        </div>
      )}

      <div className="row rest-actions">
        <span className="grow" />
        <button className="btn btn-ghost" onClick={close}>{t('cancel')}</button>
        <button className="btn btn-primary" onClick={finish}>☾ {t('restFinishShort')}</button>
      </div>
    </Shell>
  )
}

function LongRest({ ch, onChange, onClose }: { ch: Character; onChange(p: Partial<Character>): void; onClose(): void }) {
  const { t, lang } = useI18n()
  const changes = longRestChanges(ch, lang)
  return (
    <Shell title={t('cfLongRest')} icon="☀" intro={t('restLongIntro')} onClose={onClose}>
      <div className="rest-block">
        <h4>{t('restRestores')}</h4>
        {changes.length ? <ChangeList items={changes} /> : <p className="muted small">{t('restAlreadyRested')}</p>}
      </div>
      <div className="row rest-actions">
        <span className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-primary" onClick={() => { onChange(longRestPatch(ch)); onClose() }}>☀ {t('restFinishLong')}</button>
      </div>
    </Shell>
  )
}
