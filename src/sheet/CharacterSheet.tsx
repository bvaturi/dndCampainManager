import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SpellCard } from '../components/SpellCard'
import { useI18n } from '../lib/i18n'
import {
  ABILITY_NAMES, ALIGNMENTS, BACKGROUNDS, RACES, SKILLS, backgroundById, classById, levelRow, mod,
  profBonus, raceById, signed, skillBonus, type Spell,
} from '../lib/rules'
import { ABILITIES, type Ability, type Character } from '../lib/types'
import { L, type LabelKey } from './labels'
import { useSheetRolls } from './rolls'
import { useCaster } from './CastDialog'
import { createPortal } from 'react-dom'
import { featBonuses } from '../lib/feats'
import { characterResources, rechargeAt, resourceLabel } from '../lib/classFeatures'
import { allSpells, findSpell, grantedSpells } from '../lib/homebrew'
import ResourceTracker from './ResourceTracker'
import HpAdjust, { type HpChange } from './HpAdjust'
import { canUseSpell, casterInfo, spellSlots } from '../lib/spellAccess'

interface SheetProps {
  ch: Character
  edit: boolean
  onChange(patch: Partial<Character>): void
  /** Damage / heal from the HP box (reads the latest HP first, so it doesn't undo the DM's changes in combat). */
  onHp?: HpChange
}

/** Scales a fixed-size sheet page down to fit narrow screens. */
function PageScaler({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = outer.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 860)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="page-scaler" ref={outer} style={{ height: 1112 * scale }}>
      <div className="page-scaled" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  )
}

export default function CharacterSheet(props: SheetProps) {
  return (
    <div className="sheet-stack">
      <PageScaler><PageOne {...props} /></PageScaler>
      <PageScaler><PageTwo {...props} /></PageScaler>
      <PageScaler><PageThree {...props} /></PageScaler>
    </div>
  )
}

// ------------------------------------------------------------------ helpers

function useLabel() {
  const { lang } = useI18n()
  return (k: LabelKey) => L[k][lang]
}

function Txt({ value, onChange, edit, className = '', rows, placeholder, type = 'text', center }: {
  value: string | number; onChange(v: string): void; edit: boolean; className?: string
  rows?: number; placeholder?: string; type?: string; center?: boolean
}) {
  const cls = `ink ${center ? 'center' : ''} ${className}`
  if (rows) {
    return <textarea dir="auto" className={cls} value={value} readOnly={!edit} placeholder={edit ? placeholder : ''} onChange={(e) => onChange(e.target.value)} />
  }
  return <input dir="auto" className={cls} type={type} value={value} readOnly={!edit} placeholder={edit ? placeholder : ''} onChange={(e) => onChange(e.target.value)} />
}

function Num({ value, onChange, edit, className = '' }: { value: number; onChange(v: number): void; edit: boolean; className?: string }) {
  return <Txt type="number" center value={Number.isFinite(value) ? value : 0} onChange={(v) => onChange(v === '' ? 0 : +v)} edit={edit} className={className} />
}

function Frame({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={`frame ${className}`}>
      <div className="frame-body">{children}</div>
      <h3 className="frame-label">{label}</h3>
    </section>
  )
}

function Bubble({ on, onClick, kind = 'prof', title }: { on: boolean | 'double'; onClick?(): void; kind?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      className={`bubble bubble-${kind} ${on ? 'on' : ''} ${on === 'double' ? 'double' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={!!on}
    />
  )
}

/** A sheet value you can click to roll; looks like plain ink until hovered. */
function Rollable({ onRoll, children, className = '', title }: { onRoll(e: React.MouseEvent): void; children: ReactNode; className?: string; title?: string }) {
  return (
    <button type="button" className={`rollable ${className}`} title={title} onClick={onRoll}>{children}</button>
  )
}

/** "Prepared" mark for a spell line: a small book, filled when prepared (distinct from the round slot bubbles). */
function PrepMark({ on, onClick, title }: { on: boolean; onClick?(): void; title?: string }) {
  return (
    <button type="button" className={`prep-mark ${on ? 'on' : ''}`} onClick={onClick} disabled={!onClick} title={title} aria-pressed={on} aria-label={title}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M2 3.2c2-.9 4-.9 6 .4 2-1.3 4-1.3 6-.4v9.6c-2-.9-4-.9-6 .4-2-1.3-4-1.3-6-.4z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 3.6v9.6" stroke={on ? '#fff' : 'currentColor'} strokeWidth="1" />
      </svg>
    </button>
  )
}

function SheetHeader({ ch, edit, onChange, children, emblem }: SheetProps & { children: ReactNode; emblem?: ReactNode }) {
  const l = useLabel()
  return (
    <header className="sheet-header">
      <div className="name-scroll">
        <div className="sheet-logo">{emblem ?? <SheetEmblem />}</div>
        <div className="scroll-ribbon">
          <svg className="ribbon-svg" viewBox="0 0 340 70" preserveAspectRatio="none" aria-hidden="true">
            <path d="M8 18 L332 10 L326 36 L334 60 L12 62 L18 40 Z" fill="#fff" stroke="#1c1c1c" strokeWidth="2" />
            <path d="M8 18 L-2 10 L4 26 Z M332 10 L342 18 L334 26 Z" fill="#d9d9d9" stroke="#1c1c1c" strokeWidth="1.5" />
          </svg>
          <Txt className="name-input" value={ch.name} onChange={(v) => onChange({ name: v })} edit={edit} />
          <span className="tiny-label name-label">{l('characterName')}</span>
        </div>
      </div>
      <div className="header-box">{children}</div>
    </header>
  )
}

function SheetEmblem() {
  return (
    <svg viewBox="0 0 200 60" className="emblem-svg" aria-hidden="true">
      <path d="M2 40 C40 10, 90 6, 198 22 C120 18, 70 24, 30 52 Z" fill="#d6d6d6" />
      <polygon points="30,6 52,18 52,42 30,54 8,42 8,18" fill="#1c1c1c" />
      <polygon points="30,14 45,40 15,40" fill="none" stroke="#fff" strokeWidth="2.4" />
      <text x="62" y="36" fontFamily="Cinzel, serif" fontWeight="900" fontSize="17" fill="#1c1c1c">CAMPAIGN</text>
      <text x="62" y="52" fontFamily="Cinzel, serif" fontWeight="700" fontSize="12" letterSpacing="5" fill="#1c1c1c">CODEX</text>
    </svg>
  )
}

function HeaderCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="header-cell">
      <div className="header-value">{children}</div>
      <span className="tiny-label">{label}</span>
    </div>
  )
}

// ------------------------------------------------------------------ page 1

function PageOne({ ch, edit, onChange, onHp }: SheetProps) {
  const l = useLabel()
  const { lang, g } = useI18n()
  const cls = classById(ch.classId)
  const race = raceById(ch.race)
  const sub = race?.subraces.find((s) => s.id === ch.subrace)
  const pb = profBonus(ch.level)
  const setAbility = (a: Ability, v: number) => onChange({ abilities: { ...ch.abilities, [a]: v } })
  const toggleSave = (a: Ability) => onChange({ saveProfs: ch.saveProfs.includes(a) ? ch.saveProfs.filter((x) => x !== a) : [...ch.saveProfs, a] })
  const cycleSkill = (id: string) => {
    const prof = ch.skillProfs.includes(id)
    const exp = ch.expertise.includes(id)
    if (!prof) onChange({ skillProfs: [...ch.skillProfs, id] })
    else if (!exp) onChange({ expertise: [...ch.expertise, id] })
    else onChange({ skillProfs: ch.skillProfs.filter((x) => x !== id), expertise: ch.expertise.filter((x) => x !== id) })
  }
  const bonuses = featBonuses(ch)
  const passive = 10 + skillBonus(ch, 'perception') + bonuses.passive
  const setAttack = (i: number, k: 'name' | 'bonus' | 'damage', v: string) => {
    const next = ch.attacks.map((a, j) => (j === i ? { ...a, [k]: v } : a))
    onChange({ attacks: next })
  }
  const attackRows = [...ch.attacks, ...Array(Math.max(0, 3 - ch.attacks.length)).fill(null)]
  const roll = useSheetRolls(ch, edit, onChange)
  const { t } = useI18n()
  const tip = t('diceClickToRoll')

  return (
    <div className="sheet-page page-1">
      <SheetHeader ch={ch} edit={edit} onChange={onChange}>
        <div className="header-grid">
          <HeaderCell label={l('classLevel')}>
            <span className="ink">
              {cls ? g('classes', cls.id, cls.name) : ''}{ch.subclass && cls ? ` (${g('subclasses', ch.subclass, cls.subclasses.find((s) => s.id === ch.subclass)?.name)})` : ''} {ch.level}
            </span>
          </HeaderCell>
          <HeaderCell label={l('background')}>
            {edit ? (
              <select className="ink" value={ch.background} onChange={(e) => onChange({ background: e.target.value })}>
                {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{g('backgrounds', b.id, b.name)}</option>)}
              </select>
            ) : <span className="ink">{(() => { const b = backgroundById(ch.background); return b ? g('backgrounds', b.id, b.name) : '' })()}</span>}
          </HeaderCell>
          <HeaderCell label={l('playerName')}><span className="ink">{ch.ownerName}</span></HeaderCell>
          <HeaderCell label={l('race')}>
            {edit ? (
              <select className="ink" value={ch.race} onChange={(e) => onChange({ race: e.target.value, subrace: '' })}>
                {RACES.map((r) => <option key={r.id} value={r.id}>{g('races', r.id, r.name)}</option>)}
              </select>
            ) : <span className="ink">{race ? (sub ? g('subraces', sub.id, sub.name) : g('races', race.id, race.name)) : ''}</span>}
          </HeaderCell>
          <HeaderCell label={l('alignment')}>
            {edit ? (
              <select className="ink" value={ch.alignment} onChange={(e) => onChange({ alignment: e.target.value })}>
                <option value="" />
                {ALIGNMENTS.map((a) => <option key={a.en} value={a[lang]}>{a[lang]}</option>)}
                {ch.alignment && !ALIGNMENTS.some((a) => a[lang] === ch.alignment) && <option value={ch.alignment}>{ch.alignment}</option>}
              </select>
            ) : <span className="ink">{ch.alignment}</span>}
          </HeaderCell>
          <HeaderCell label={l('xp')}><Num value={ch.xp} onChange={(v) => onChange({ xp: v })} edit={edit} className="left" /></HeaderCell>
        </div>
      </SheetHeader>

      <div className="p1-grid">
        {/* ---------- left block: abilities / saves / skills */}
        <div className="p1-left">
          <div className="p1-abilities-wrap">
            <div className="ability-column">
              {ABILITIES.map((a) => (
                <div key={a} className="ability-box">
                  <span className="ability-name">{ABILITY_NAMES[a][lang]}</span>
                  <Rollable className="ability-mod ink" title={tip} onRoll={(e) => roll.check(a, e)}>{signed(mod(ch.abilities[a]))}</Rollable>
                  <div className="ability-score"><Num value={ch.abilities[a]} onChange={(v) => setAbility(a, v)} edit={edit} /></div>
                </div>
              ))}
            </div>
            <div className="p1-saves-col">
              <div className="pill-box inspiration">
                <div className="pill-square"><Bubble kind="insp" on={ch.inspiration} onClick={edit ? () => onChange({ inspiration: !ch.inspiration }) : undefined} /></div>
                <span className="pill-label">{l('inspiration')}</span>
              </div>
              <div className="pill-box">
                <div className="pill-circle ink">{signed(pb)}</div>
                <span className="pill-label">{l('profBonus')}</span>
              </div>
              <Frame label={l('savingThrows')} className="saves-frame">
                <ul className="check-list">
                  {ABILITIES.map((a) => (
                    <li key={a}>
                      <Bubble on={ch.saveProfs.includes(a)} onClick={edit ? () => toggleSave(a) : undefined} />
                      <Rollable className="check-roll" title={tip} onRoll={(e) => roll.save(a, e)}>
                        <span className="check-val ink">{signed(mod(ch.abilities[a]) + (ch.saveProfs.includes(a) ? pb : 0))}</span>
                        <span className="check-name">{ABILITY_NAMES[a][lang]}</span>
                      </Rollable>
                    </li>
                  ))}
                </ul>
              </Frame>
              <Frame label={l('skills')} className="skills-frame">
                <ul className="check-list">
                  {SKILLS.map((s) => (
                    <li key={s.id}>
                      <Bubble on={ch.expertise.includes(s.id) ? 'double' : ch.skillProfs.includes(s.id)} onClick={edit ? () => cycleSkill(s.id) : undefined} />
                      <Rollable className="check-roll" title={tip} onRoll={(e) => roll.skill(s.id, e)}>
                        <span className="check-val ink">{signed(skillBonus(ch, s.id))}</span>
                        <span className="check-name">{s[lang]} <span className="check-abil">({ABILITY_NAMES[s.ability].short[lang]})</span></span>
                      </Rollable>
                    </li>
                  ))}
                </ul>
              </Frame>
            </div>
          </div>
          <div className="pill-box wide passive">
            <div className="pill-circle ink">{passive}</div>
            <span className="pill-label">{l('passive')}</span>
          </div>
          <Frame label={l('otherProfs')} className="grow-frame">
            <Txt rows={8} value={ch.otherProficiencies} onChange={(v) => onChange({ otherProficiencies: v })} edit={edit} />
          </Frame>
        </div>

        {/* ---------- middle block: combat */}
        <div className="p1-mid">
          <div className="combat-panel">
            <div className="combat-row">
              <div className="shield-box">
                <svg viewBox="0 0 80 92" className="shield-svg" aria-hidden="true">
                  <path d="M40 3 L76 14 C76 52 64 74 40 89 C16 74 4 52 4 14 Z" fill="#fff" stroke="#1c1c1c" strokeWidth="2.4" />
                  <path d="M40 9 L70 18 C70 50 60 69 40 82 C20 69 10 50 10 18 Z" fill="none" stroke="#1c1c1c" strokeWidth="1" />
                </svg>
                <div className="shield-content">
                  <Num value={ch.armorClass} onChange={(v) => onChange({ armorClass: v })} edit={edit} className="big" />
                  <span className="tiny-label">{l('ac')}</span>
                </div>
              </div>
              <div className="stat-box">
                <Rollable className="ink big" title={tip} onRoll={(e) => roll.initiative(e)}>{signed(mod(ch.abilities.dex) + bonuses.initiative)}</Rollable>
                <span className="tiny-label">{l('initiative')}</span>
              </div>
              <div className="stat-box">
                <Num value={ch.speed} onChange={(v) => onChange({ speed: v })} edit={edit} className="big" />
                <span className="tiny-label">{l('speed')}</span>
              </div>
            </div>
            <div className="hp-box">
              <div className="hp-max">
                <span className="tiny-label muted-label">{l('hpMax')}</span>
                <Num value={ch.hpMax} onChange={(v) => onChange({ hpMax: v })} edit={edit} className="line-input" />
              </div>
              <Num value={ch.hpCurrent} onChange={(v) => onChange({ hpCurrent: v })} edit={edit} className="huge" />
              <span className="tiny-label">{l('hpCurrent')}</span>
              {edit && onHp && <HpAdjust variant="sheet" onApply={onHp} />}
            </div>
            <div className="hp-box temp">
              <Num value={ch.hpTemp} onChange={(v) => onChange({ hpTemp: v })} edit={edit} className="huge" />
              <span className="tiny-label">{l('hpTemp')}</span>
            </div>
            <div className="combat-row two">
              <div className="small-box">
                <div className="hp-max">
                  <span className="tiny-label muted-label">{l('total')}</span>
                  <span className="ink line-input">{ch.level}d{cls?.hitDie ?? 8}</span>
                </div>
                <div className="hit-dice-used">
                  <span className="tiny-label muted-label">{l('used')}</span>
                  <Num value={ch.hitDiceUsed} onChange={(v) => onChange({ hitDiceUsed: Math.max(0, Math.min(ch.level, v)) })} edit={edit} className="big" />
                </div>
                <span className="tiny-label">{l('hitDice')} <button type="button" className="mini-die no-print" title={tip} onClick={() => roll.hitDie()}>🎲</button></span>
              </div>
              <div className="small-box">
                <div className="death-row">
                  <span className="tiny-label muted-label">{l('successes')}</span>
                  <span className="death-pips">
                    {[0, 1, 2].map((i) => (
                      <Bubble key={i} kind="death" on={ch.deathSaves.successes > i}
                        onClick={edit ? () => onChange({ deathSaves: { ...ch.deathSaves, successes: ch.deathSaves.successes > i ? i : i + 1 } }) : undefined} />
                    ))}
                  </span>
                </div>
                <div className="death-row">
                  <span className="tiny-label muted-label">{l('failures')}</span>
                  <span className="death-pips">
                    {[0, 1, 2].map((i) => (
                      <Bubble key={i} kind="death" on={ch.deathSaves.failures > i}
                        onClick={edit ? () => onChange({ deathSaves: { ...ch.deathSaves, failures: ch.deathSaves.failures > i ? i : i + 1 } }) : undefined} />
                    ))}
                  </span>
                </div>
                <span className="tiny-label">{l('deathSaves')} <button type="button" className="mini-die no-print" title={tip} onClick={(e) => roll.deathSave(e)}>🎲</button></span>
              </div>
            </div>
          </div>

          <Frame label={l('attacks')} className="attacks-frame">
            <table className="attack-table">
              <thead><tr><th>{l('atkName')}</th><th>{l('atkBonus')}</th><th>{l('damage')}</th><th className="roll-col" />{edit && <th />}</tr></thead>
              <tbody>
                {attackRows.map((a, i) => (
                  <tr key={i}>
                    {a ? (
                      <>
                        <td><Txt value={a.name} onChange={(v) => setAttack(i, 'name', v)} edit={edit} /></td>
                        <td><Txt value={a.bonus} onChange={(v) => setAttack(i, 'bonus', v)} edit={edit} center /></td>
                        <td><Txt value={a.damage} onChange={(v) => setAttack(i, 'damage', v)} edit={edit} /></td>
                        <td className="roll-col"><button type="button" className="mini-die no-print" title={tip} onClick={(e) => roll.attack(i, e)}>🎲</button></td>
                        {edit && <td><button className="x-btn" title={l('remove')} onClick={() => onChange({ attacks: ch.attacks.filter((_, j) => j !== i) })}>×</button></td>}
                      </>
                    ) : (
                      <><td><span className="ink">&nbsp;</span></td><td /><td /><td className="roll-col" />{edit && <td />}</>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {edit && <button className="add-line" onClick={() => onChange({ attacks: [...ch.attacks, { name: '', bonus: '', damage: '' }] })}>{l('addAttack')}</button>}
            <SpellSummary ch={ch} />
          </Frame>

          <Frame label={l('equipment')} className="equipment-frame grow-frame">
            <div className="equipment-inner">
              <div className="coins">
                {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((c) => (
                  <div key={c} className="coin">
                    <span className="coin-label">{c.toUpperCase()}</span>
                    <Num value={ch.coins[c]} onChange={(v) => onChange({ coins: { ...ch.coins, [c]: v } })} edit={edit} />
                  </div>
                ))}
              </div>
              <Txt rows={10} value={ch.equipment} onChange={(v) => onChange({ equipment: v })} edit={edit} className="lined" />
            </div>
          </Frame>
        </div>

        {/* ---------- right block: personality & features */}
        <div className="p1-right">
          <div className="persona-panel">
            {(['personality', 'ideals', 'bonds', 'flaws'] as const).map((k) => (
              <Frame key={k} label={l(k)} className="persona-frame">
                <Txt rows={3} value={ch[k]} onChange={(v) => onChange({ [k]: v })} edit={edit} />
              </Frame>
            ))}
          </div>
          <Frame label={l('features')} className="grow-frame features-frame">
            <SheetResources ch={ch} edit={edit} onChange={onChange} />
            <Txt rows={20} value={ch.features} onChange={(v) => onChange({ features: v })} edit={edit} className="lined" />
          </Frame>
        </div>
      </div>
      <footer className="sheet-foot">{cls && levelRow(cls, ch.level) ? '' : ''}Campaign Codex · 5e</footer>
    </div>
  )
}

/** Limited-use features (Lay on Hands, Rage, Breath Weapon, Lucky…) as clickable bubbles, like spell slots. */
function SheetResources({ ch, edit, onChange }: SheetProps) {
  const { lang, t } = useI18n()
  const resources = characterResources(ch)
  if (!resources.length) return null
  return (
    <ul className="sheet-resources">
      {resources.map((r) => (
        <li key={r.key}>
          <span className="sr-name" title={r.source}>
            {resourceLabel(r, lang)}
            {rechargeAt(r, ch.level) === 'short'
              ? <span className="sr-rest short" title={t('restShortTag')}>☾</span>
              : <span className="sr-rest" title={t('restLongTag')}>☀</span>}
          </span>
          <ResourceTracker compact r={r} level={ch.level} edit={edit}
            onUsed={(u) => onChange({ resources: { ...(ch.resources ?? {}), [r.key]: u } })} />
        </li>
      ))}
    </ul>
  )
}

function SpellSummary({ ch }: { ch: Character }) {
  const { g } = useI18n()
  const cantrips = ch.spells.map((s) => findSpell(s.id)).filter((s) => s && s.level === 0) as Spell[]
  if (!cantrips.length) return null
  return <p className="ink spell-summary">{cantrips.map((s) => g('spells', s.id, s.name)).join(' · ')}</p>
}

// ------------------------------------------------------------------ page 2

function PageTwo({ ch, edit, onChange }: SheetProps) {
  const l = useLabel()
  const { lang } = useI18n()
  const small = { age: { en: 'Age', he: 'גיל' }, height: { en: 'Height', he: 'גובה' }, weight: { en: 'Weight', he: 'משקל' }, eyes: { en: 'Eyes', he: 'עיניים' }, skin: { en: 'Skin', he: 'עור' }, hair: { en: 'Hair', he: 'שיער' } }
  return (
    <div className="sheet-page page-2">
      <SheetHeader ch={ch} edit={edit} onChange={onChange}>
        <div className="header-grid">
          {(['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const).map((k) => (
            <HeaderCell key={k} label={small[k][lang]}><Txt value={ch[k]} onChange={(v) => onChange({ [k]: v })} edit={edit} /></HeaderCell>
          ))}
        </div>
      </SheetHeader>
      <div className="p2-grid">
        <Frame label={l('appearance')} className="appearance-frame scalloped">
          <div className="portrait">
            {ch.portraitUrl ? <img src={ch.portraitUrl} alt="" /> : <div className="portrait-empty">✧</div>}
          </div>
          {edit && <Txt value={ch.portraitUrl} onChange={(v) => onChange({ portraitUrl: v })} edit={edit} placeholder={l('portraitHint')} className="url-input" />}
          <Txt rows={4} value={ch.appearance} onChange={(v) => onChange({ appearance: v })} edit={edit} />
        </Frame>
        <Frame label={l('allies')} className="allies-frame">
          <div className="allies-inner">
            <Txt rows={14} value={ch.allies} onChange={(v) => onChange({ allies: v })} edit={edit} className="lined" />
            <div className="symbol-box">
              <span className="tiny-label muted-label">{l('atkName')}</span>
              <Txt value={ch.symbolName} onChange={(v) => onChange({ symbolName: v })} edit={edit} className="symbol-name" />
              <div className="symbol-art">⚜</div>
              <span className="tiny-label">{l('symbol')}</span>
            </div>
          </div>
        </Frame>
        <Frame label={l('backstory')} className="backstory-frame scalloped">
          <Txt rows={30} value={ch.backstory} onChange={(v) => onChange({ backstory: v })} edit={edit} className="lined" />
        </Frame>
        <div className="p2-right-bottom">
          <Frame label={l('additional')} className="grow-frame">
            <Txt rows={16} value={ch.additionalFeatures} onChange={(v) => onChange({ additionalFeatures: v })} edit={edit} className="lined" />
          </Frame>
          <Frame label={l('treasure')} className="grow-frame">
            <Txt rows={10} value={ch.treasure} onChange={(v) => onChange({ treasure: v })} edit={edit} className="lined" />
          </Frame>
        </div>
      </div>
      <footer className="sheet-foot">Campaign Codex · 5e</footer>
    </div>
  )
}

// ------------------------------------------------------------------ page 3

function PageThree({ ch, edit, onChange }: SheetProps) {
  const l = useLabel()
  const { lang, g } = useI18n()
  const [open, setOpen] = useState<Spell | null>(null)
  const cls = classById(ch.classId)
  const ability = casterInfo(ch.classId, ch.subclass)?.ability
  const pb = profBonus(ch.level)
  const slots = spellSlots(ch.classId, ch.subclass, ch.level)
  const known = ch.spells.map((s) => ({ ...s, spell: findSpell(s.id) })).filter((s) => s.spell)
  const granted = grantedSpells(ch)
  const rolls = useSheetRolls(ch, edit, onChange)
  const { t } = useI18n()
  const roll = { ...rolls, tip: t('diceClickToRoll') }
  const caster = useCaster(ch, onChange)

  const emblem = (
    <svg viewBox="0 0 200 60" className="emblem-svg" aria-hidden="true">
      <path d="M0 44 C50 4, 120 0, 200 26 C130 14, 70 22, 26 56 Z" fill="#cfcfcf" />
      <path d="M40 8 C60 20 60 40 40 52 C70 46 80 20 40 8 Z" fill="#1c1c1c" />
      <text x="88" y="40" fontFamily="Cinzel, serif" fontWeight="900" fontSize="22" fill="#1c1c1c">✦ ✦ ✦</text>
    </svg>
  )

  const addSpell = (id: string) => {
    if (!id || ch.spells.some((s) => s.id === id)) return
    onChange({ spells: [...ch.spells, { id, prepared: true }] })
  }

  const block = (lv: number) => {
    const list = known.filter((s) => s.spell!.level === lv)
    const minLines = lv === 0 ? 6 : lv <= 2 ? 10 : lv <= 5 ? 8 : 5
    const pad = Math.max(0, minLines - list.length)
    const total = lv > 0 ? slots[lv - 1] ?? 0 : 0
    const addable = [...allSpells().filter((s) => canUseSpell(ch.classId, ch.subclass, ch.level, s)), ...granted]
      .filter((s, i, all) => s.level === lv && !ch.spells.some((x) => x.id === s.id) && all.findIndex((x) => x.id === s.id) === i)
    const used = ch.slotsExpended[lv - 1] ?? 0
    return (
      <section key={lv} className={`spell-block ${lv === 0 ? 'cantrip-block' : ''}`}>
        <div className="spell-block-head">
          <span className="spell-lv-hex">{lv}</span>
          {lv === 0 ? (
            <span className="spell-head-banner single">{l('cantrips')}</span>
          ) : (
            <>
              <span className="spell-head-total ink">{total || ''}</span>
              <span className="spell-head-banner">
                {Array.from({ length: total }, (_, i) => (
                  <Bubble key={i} kind="slot" on={used > i} onClick={edit ? () => {
                    const next = [...ch.slotsExpended]
                    next[lv - 1] = used > i ? i : i + 1
                    onChange({ slotsExpended: next })
                  } : undefined} />
                ))}
                {total > 0 && <span className="slot-left no-print">{t('slotsLeft', { left: total - used, total })}</span>}
              </span>
            </>
          )}
        </div>
        {lv === 1 && <div className="slot-legend"><span>{l('slotsTotal')}</span><span>{l('slotsExpended')}</span></div>}
        <ul className="spell-lines">
          {list.map((s) => (
            <li key={s.id}>
              {lv > 0 && (
                <PrepMark on={s.prepared} title={t(s.prepared ? 'preparedToggle' : 'unpreparedToggle')}
                  onClick={edit ? () => onChange({ spells: ch.spells.map((x) => (x.id === s.id ? { ...x, prepared: !x.prepared } : x)) }) : undefined} />
              )}
              <button className="spell-link ink" onClick={() => setOpen(s.spell!)}>{g('spells', s.id, s.spell!.name)}</button>
              {edit && <button className="cast-btn no-print" title={t('castTitle', { name: g('spells', s.id, s.spell!.name) })} onClick={() => caster.cast(s.spell!)}>✦ {t('castButton')}</button>}
              {edit && <button className="x-btn" title={l('remove')} onClick={() => onChange({ spells: ch.spells.filter((x) => x.id !== s.id) })}>×</button>}
            </li>
          ))}
          {Array.from({ length: pad }, (_, i) => <li key={`pad${i}`}>{lv > 0 && <PrepMark on={false} />}<span className="ink">&nbsp;</span></li>)}
        </ul>
        {edit && addable.length > 0 && (
          <select className="add-spell" value="" onChange={(e) => addSpell(e.target.value)}>
            <option value="">{l('addSpell')}</option>
            {addable
              .map((s) => <option key={s.id} value={s.id}>{g('spells', s.id, s.name)}{s.source !== 'PHB' ? ` (${s.source})` : ''}</option>)}
          </select>
        )}
      </section>
    )
  }

  return (
    <div className="sheet-page page-3">
      <header className="sheet-header">
        <div className="name-scroll">
          <div className="sheet-logo">{emblem}</div>
          <div className="scroll-ribbon">
            <svg className="ribbon-svg" viewBox="0 0 340 70" preserveAspectRatio="none" aria-hidden="true">
              <path d="M8 18 L332 10 L326 36 L334 60 L12 62 L18 40 Z" fill="#fff" stroke="#1c1c1c" strokeWidth="2" />
            </svg>
            <span className="ink name-input as-text">{cls ? g('classes', cls.id, cls.name) : ''}</span>
            <span className="tiny-label name-label">{l('spellClass')}</span>
          </div>
        </div>
        <div className="header-box spell-header">
          <div className="spell-stat"><span className="ink big">{ability ? ABILITY_NAMES[ability][lang] : '—'}</span><span className="tiny-label">{l('spellAbility')}</span></div>
          <div className="spell-stat"><span className="ink big">{ability ? 8 + pb + mod(ch.abilities[ability]) : '—'}</span><span className="tiny-label">{l('spellDC')}</span></div>
          <div className="spell-stat">{ability ? <Rollable className="ink big" title={roll.tip} onRoll={(e) => roll.spellAttack(e)}>{signed(pb + mod(ch.abilities[ability]))}</Rollable> : <span className="ink big">—</span>}<span className="tiny-label">{l('spellAtk')}</span></div>
        </div>
      </header>
      <div className="p3-grid">
        <div className="p3-col">{block(0)}{block(1)}{block(2)}</div>
        <div className="p3-col">{block(3)}{block(4)}{block(5)}</div>
        <div className="p3-col">{block(6)}{block(7)}{block(8)}{block(9)}</div>
      </div>
      <footer className="sheet-foot">Campaign Codex · 5e</footer>
      {open && createPortal(
        <div className="modal-backdrop no-print" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}><SpellCard spell={open} onClose={() => setOpen(null)} /></div>
        </div>,
        document.body,
      )}
      {caster.dialog}
    </div>
  )
}
