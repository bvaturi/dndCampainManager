import { useMemo, useState } from 'react'
import { SpellCard, spellLevelLabel } from '../components/SpellCard'
import { useI18n } from '../lib/i18n'
import { useHomebrew } from '../components/HomebrewScope'
import { HOMEBREW_SOURCE, findSpell, grantedSpells } from '../lib/homebrew'
import { ABILITY_NAMES, classById, mod, profBonus, signed, type Spell } from '../lib/rules'
import { cantripCount, castableMax, casterInfo, classSpellList, spellAllowance, spellSlots, unlockLevel } from '../lib/spellAccess'
import type { Character } from '../lib/types'
import { useSheetRolls } from './rolls'
import { useCaster } from './CastDialog'

type Filter = 'all' | 'mine'

/** The character's own spell list: every spell their class can learn, levels 0-9, gated by character level. */
export default function Spellbook({ ch, edit, onChange }: { ch: Character; edit: boolean; onChange(p: Partial<Character>): void }) {
  const { t, g, lang } = useI18n()
  const roll = useSheetRolls(ch, edit, onChange)
  const caster = useCaster(ch, onChange)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [allSources, setAllSources] = useState(true)
  const [open, setOpen] = useState<Spell | null>(null)
  const homebrew = useHomebrew()

  const info = casterInfo(ch.classId, ch.subclass)
  const allowance = spellAllowance(ch.classId, ch.subclass, ch.level, ch.abilities)
  const slots = spellSlots(ch.classId, ch.subclass, ch.level)
  // The homebrew library is read through the registry; `homebrew` changes when it does.
  const list = useMemo(() => classSpellList(ch.classId, ch.subclass, allSources), [ch.classId, ch.subclass, allSources, homebrew])
  const granted = grantedSpells(ch).filter((s) => !list.some((x) => x.id === s.id))
  const mine = new Map(ch.spells.map((s) => [s.id, s]))


  const pb = profBonus(ch.level)
  const abilityMod = info ? mod(ch.abilities[info.ability]) : 0
  const listClassName = info ? g('classes', info.listClass, classById(info.listClass)?.name) : ''

  // Counters
  const owned = ch.spells.map((s) => ({ ...s, spell: findSpell(s.id) })).filter((s) => s.spell)
  const cantripsOwned = owned.filter((s) => s.spell!.level === 0).length
  const leveledOwned = owned.filter((s) => s.spell!.level > 0)
  const preparedOwned = leveledOwned.filter((s) => s.prepared).length
  const counters: { label: string; n: number; max: number }[] = []
  if (allowance.cantrips) counters.push({ label: t('cantrips'), n: cantripsOwned, max: allowance.cantrips })
  if (allowance.mode === 'known') counters.push({ label: t('spellsKnown'), n: leveledOwned.length, max: allowance.spells })
  if (allowance.mode === 'spellbook') counters.push({ label: t('sbInBook'), n: leveledOwned.length, max: allowance.spells })
  if (allowance.mode === 'prepared' || allowance.mode === 'spellbook') counters.push({ label: t('spellsPrepared'), n: preparedOwned, max: allowance.preparedLimit })

  // Spell levels this class ever reaches
  const levels = Array.from({ length: 10 }, (_, i) => i).filter((lv) => unlockLevel(ch.classId, ch.subclass, lv) !== null)

  const needle = q.trim().toLowerCase()
  const visible = (s: Spell) =>
    (filter === 'all' || mine.has(s.id)) &&
    (!needle || s.name.toLowerCase().includes(needle) || g('spells', s.id, '').includes(q.trim()))

  // Spells already on the sheet that the class list doesn't include (imported or from older versions).
  const offList = owned.filter((s) => !list.some((x) => x.id === s.id) && !granted.some((x) => x.id === s.id) && !(allSources === false && s.spell!.source !== 'PHB'))

  const add = (s: Spell) => onChange({ spells: [...ch.spells, { id: s.id, prepared: true }] })
  const remove = (id: string) => onChange({ spells: ch.spells.filter((x) => x.id !== id) })
  const togglePrepared = (id: string) => onChange({ spells: ch.spells.map((x) => (x.id === id ? { ...x, prepared: !x.prepared } : x)) })
  const showPrepared = allowance.mode === 'prepared' || allowance.mode === 'spellbook'

  const row = (s: Spell, locked: boolean, warn?: string) => {
    const have = mine.get(s.id)
    return (
      <li key={s.id} className={`sb-row ${have ? 'have' : ''} ${locked ? 'locked' : ''}`}>
        {edit ? (
          have
            ? <button className="sb-add on" title={t('sbRemove')} onClick={() => remove(s.id)}>✓</button>
            : <button className="sb-add" disabled={locked} title={t('sbAdd')} onClick={() => add(s)}>+</button>
        ) : <span className={`sb-add static ${have ? 'on' : ''}`}>{have ? '✓' : ''}</span>}
        <button className="sb-name" onClick={() => setOpen(s)}>
          <span className="sb-title">{s.source === HOMEBREW_SOURCE && <span title={t('hbHomebrew')}>🏠 </span>}{g('spells', s.id, s.name)}</span>
          {lang === 'he' && <bdi className="sb-en">{s.name}</bdi>}
          {warn && <span className="sb-warn">{warn}</span>}
        </button>
        <span className="sb-meta">
          <span className={`school-dot school-${s.school}`} /> {t(`school_${s.school}` as 'school_evocation')}
          {s.concentration && <span className="tag">C</span>}
          {s.ritual && <span className="tag">R</span>}
          {s.source !== 'PHB' && s.source !== HOMEBREW_SOURCE && <span className="tag src">{s.source}</span>}
        </span>
        <span className="sb-cast" dir="ltr">{s.castingTime} · {s.range}</span>
        <span className="sb-actions">
          {showPrepared && have && s.level > 0 && (
            <button className={`sb-book ${have.prepared ? 'on' : ''}`} disabled={!edit} onClick={() => togglePrepared(s.id)}
              title={t(have.prepared ? 'preparedToggle' : 'unpreparedToggle')} aria-pressed={have.prepared}>
              📖 {have.prepared ? t('sbPreparedTag') : t('sbPrepare')}
            </button>
          )}
          {edit && have && !locked && <button className="btn btn-small sb-castbtn" onClick={() => caster.cast(s)}>✦ {t('castButton')}</button>}
        </span>
      </li>
    )
  }

  const grantedSection = granted.filter(visible).length > 0 && (
    <section className="sb-level card">
      <header className="sb-level-head"><h3>🎁 {t('hbGrantedSpells')}</h3></header>
      <ul className="sb-list">{granted.filter(visible).map((s) => row(s, false))}</ul>
    </section>
  )
  const overlays = (
    <>
      {caster.dialog}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}><SpellCard spell={open} onClose={() => setOpen(null)} /></div>
        </div>
      )}
    </>
  )

  // Not a spellcaster: only spells the DM granted (homebrew), if any.
  if (!info) {
    return (
      <div className="spellbook">
        {grantedSection || <div className="card"><p className="muted">{t('sbNoCasting')}</p></div>}
        {overlays}
      </div>
    )
  }

  return (
    <div className="spellbook">
      <div className="sb-head card">
        <div className="sb-stats">
          <div><span className="sb-stat-label">{t('sbAbility')}</span><strong>{ABILITY_NAMES[info.ability][lang]}</strong></div>
          <div><span className="sb-stat-label">{t('sbDC')}</span><strong dir="ltr">{8 + pb + abilityMod}</strong></div>
          <div>
            <span className="sb-stat-label">{t('sbAttack')}</span>
            <button className="rollable sb-attack" title={t('diceClickToRoll')} onClick={(e) => roll.spellAttack(e)}><strong dir="ltr">{signed(pb + abilityMod)}</strong> 🎲</button>
          </div>
          <div className="sb-slots">
            <span className="sb-stat-label">{t('sbSlots')}</span>
            <span dir="ltr">{slots.map((n, i) => (n ? <span key={i} className={`slot-chip ${n - (ch.slotsExpended[i] ?? 0) <= 0 ? 'slot-chip-empty' : ''}`}>{i + 1}{lang === 'en' && <sup>{['st', 'nd', 'rd'][i] ?? 'th'}</sup>}: {t('slotsLeft', { left: Math.max(0, n - (ch.slotsExpended[i] ?? 0)), total: n })}</span> : null))}{!slots.some(Boolean) && '—'}</span>
          </div>
        </div>
        <div className="sb-counters">
          {counters.map((c) => (
            <span key={c.label} className={`sb-counter ${c.n > c.max ? 'over' : ''}`} title={c.n > c.max ? t('sbOverLimit') : ''}>
              {c.label}: <strong dir="ltr">{c.n}/{c.max}</strong>
            </span>
          ))}
        </div>
        {info.listClass !== ch.classId && <p className="muted small">{t('sbListFrom', { cls: listClassName })}</p>}
        <div className="row wrap sb-controls">
          <input className="grow" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mode-toggle sb-filter">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('sbAll', { cls: listClassName })}</button>
            <button className={filter === 'mine' ? 'on' : ''} onClick={() => setFilter('mine')}>{t('sbMine')} ({ch.spells.length})</button>
          </div>
          <label className="check"><input type="checkbox" checked={allSources} onChange={(e) => setAllSources(e.target.checked)} /> {t('showAllSources')}</label>
        </div>
      </div>

      {levels.map((lv) => {
        const at = unlockLevel(ch.classId, ch.subclass, lv)!
        const locked = lv === 0 ? cantripCount(ch.classId, ch.subclass, ch.level) === 0 : lv > castableMax(ch.classId, ch.subclass, ch.level)
        const spells = list.filter((s) => s.level === lv && visible(s))
        if (!spells.length && (filter === 'mine' || needle)) return null
        const arcanum = ch.classId === 'warlock' && lv >= 6
        return (
          <section key={lv} className={`sb-level card ${locked ? 'locked' : ''}`}>
            <header className="sb-level-head">
              <span className="spell-lv-hex">{lv}</span>
              <h3>{lv === 0 ? t('cantrips') : spellLevelLabel(t, lv)}{arcanum && <span className="muted small"> · {t('sbArcanum')}</span>}</h3>
              {lv > 0 && !locked && slots[lv - 1] > 0 && <span className="slot-chip">{t('slotsLeft', { left: Math.max(0, slots[lv - 1] - (ch.slotsExpended[lv - 1] ?? 0)), total: slots[lv - 1] })}</span>}
              {locked && <span className="sb-lock">🔒 {t('sbLocked', { n: at })}</span>}
              <span className="muted small sb-count">{spells.length}</span>
            </header>
            <ul className="sb-list">{spells.map((s) => row(s, locked))}</ul>
          </section>
        )
      })}

      {grantedSection}

      {offList.length > 0 && (
        <section className="sb-level card">
          <header className="sb-level-head"><h3>{t('sbNotOnList')}</h3></header>
          <ul className="sb-list">{offList.map((s) => row(s.spell!, true, t('sbNotOnList')))}</ul>
        </section>
      )}

      {overlays}
    </div>
  )
}
