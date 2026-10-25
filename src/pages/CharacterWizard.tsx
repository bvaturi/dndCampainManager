import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SpellCard, spellLevelLabel } from '../components/SpellCard'
import { ErrorBox, Field, Loading } from '../components/ui'
import { useUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import {
  ABILITY_NAMES, ALIGNMENTS, BACKGROUNDS, CLASSES, POINT_COST, RACES, SKILLS, STANDARD_ARRAY, WEAPONS,
  armorClass, backgroundById, classById, findWeapon, mod, profBonus, raceById, racialBonuses, signed,
  splitItems, startingHp, weaponAttack, weaponsForCategory, type Spell, type Weapon,
} from '../lib/rules'
import { ABILITIES, type Ability, type AbilityScores, type NewCharacter } from '../lib/types'
import { casterInfo, spellAllowance } from '../lib/spellAccess'
import { featureNameHe } from '../lib/classFeatures'
import { allSpells, findSpell } from '../lib/homebrew'
import { useAsync } from '../lib/useAsync'
import { useHomebrew } from '../components/HomebrewScope'

type Method = 'standard' | 'pointbuy' | 'roll' | 'manual'
type StepId = 'race' | 'class' | 'abilities' | 'background' | 'equipment' | 'spells' | 'details' | 'review'

const blankScores = (v: number): AbilityScores => ({ str: v, dex: v, con: v, int: v, wis: v, cha: v })
const roll4d6 = () => {
  const d = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b)
  return d[1] + d[2] + d[3]
}

export default function CharacterWizard() {
  useHomebrew() // re-render when the campaign's homebrew changes (spell lists, abilities)
  const { cid = '' } = useParams()
  const { backend, user } = useUser()
  const { t, g, lang } = useI18n()
  const nav = useNavigate()
  const campaign = useAsync(() => backend.getCampaign(cid), [cid])

  // ---- choices
  const [race, setRace] = useState('')
  const [subrace, setSubrace] = useState('')
  const [bonusChoice, setBonusChoice] = useState<Ability[]>([])
  const [raceSkillChoice, setRaceSkillChoice] = useState<string[]>([])
  // 2024-style species: '+2/+1' (first pick +2, second +1) or '+1/+1/+1'.
  const [flexMode, setFlexMode] = useState<'21' | '111'>('21')
  const [classId, setClassId] = useState('')
  const [subclass, setSubclass] = useState('')
  const [level, setLevel] = useState<number | null>(null)
  const [method, setMethod] = useState<Method>('standard')
  const [pool, setPool] = useState<number[]>(STANDARD_ARRAY)
  const [assign, setAssign] = useState<Record<Ability, number | null>>({ str: null, dex: null, con: null, int: null, wis: null, cha: null })
  const [direct, setDirect] = useState<AbilityScores>(blankScores(8))
  const [background, setBackground] = useState('')
  const [classSkills, setClassSkills] = useState<string[]>([])
  const [equipPick, setEquipPick] = useState<Record<number, number>>({})
  const [weaponPick, setWeaponPick] = useState<Record<string, string>>({})
  const [cantrips, setCantrips] = useState<string[]>([])
  const [spells, setSpells] = useState<string[]>([])
  const [allSources, setAllSources] = useState(false)
  const [details, setDetails] = useState({
    name: '', alignment: '', personality: '', ideals: '', bonds: '', flaws: '', backstory: '', appearance: '',
    portraitUrl: '', age: '', height: '', weight: '', eyes: '', skin: '', hair: '',
  })
  const [step, setStep] = useState(0)
  // On phones the stepper scrolls sideways: keep the current step in view.
  const stepper = useRef<HTMLOListElement>(null)
  useEffect(() => {
    (stepper.current?.children[step] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [step])
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const lvl = level ?? campaign.data?.startingLevel ?? 1
  const raceDef = raceById(race)
  const subraceDef = raceDef?.subraces.find((s) => s.id === subrace)
  const cls = classById(classId)
  const bg = backgroundById(background)

  const base: AbilityScores = useMemo(() => {
    if (method === 'pointbuy' || method === 'manual') return direct
    const out = blankScores(0)
    for (const a of ABILITIES) out[a] = assign[a] == null ? 0 : pool[assign[a]!]
    return out
  }, [method, direct, assign, pool])
  const racial = racialBonuses(race, subrace, bonusChoice)
  // Skills the race grants: fixed ones plus the player's picks (Half-Elf, Changeling).
  const raceSkills = [...(raceDef?.skills ?? []), ...raceSkillChoice]
  const finalScores = ABILITIES.reduce((o, a) => ({ ...o, [a]: base[a] + racial[a] }), {} as AbilityScores)
  const pointsSpent = ABILITIES.reduce((s, a) => s + (POINT_COST[direct[a]] ?? 99), 0)
  const allowance = spellAllowance(classId, subclass, lvl, finalScores)
  const casts = allowance.cantrips > 0 || allowance.spells > 0

  const steps: StepId[] = ['race', 'class', 'abilities', 'background', 'equipment', ...(casts ? ['spells' as StepId] : []), 'details', 'review']
  const current = steps[Math.min(step, steps.length - 1)]

  // ---- derived equipment list
  const items = useMemo(() => {
    if (!cls) return [] as string[]
    const out = [...cls.startingEquipment]
    cls.startingEquipmentOptions.forEach((set, i) => {
      const label = set.options[equipPick[i] ?? 0]
      if (!label) return
      splitItems(label).forEach((part, j) => {
        const picked = weaponPick[`${i}-${equipPick[i] ?? 0}-${j}`]
        const countMatch = /^(\d+)\s*×\s*any/.exec(part)
        if (weaponsForCategory(part) && picked) out.push((countMatch ? `${countMatch[1]} × ` : '') + findWeaponName(picked))
        else out.push(part)
      })
    })
    return out
  }, [cls, equipPick, weaponPick])

  const valid: Record<StepId, boolean> = {
    race: !!race && (!raceDef?.subraces.length || !!subrace) && (!raceDef?.bonusChoice || bonusChoice.length === raceDef.bonusChoice.choose)
      && (!raceDef?.flexibleBonus || bonusChoice.length === 3)
      && (!raceDef?.skillChoice || raceSkillChoice.length === raceDef.skillChoice.choose),
    class: !!cls && (lvl < cls.subclassLevel || !!subclass),
    abilities: ABILITIES.every((a) => base[a] >= 3) && (method !== 'pointbuy' || pointsSpent <= 27),
    background: !!bg && classSkills.length === (cls?.skillChoice.choose ?? 0),
    equipment: true,
    spells: cantrips.length === allowance.cantrips && spells.length === allowance.spells,
    details: details.name.trim().length > 0,
    review: true,
  }

  const finish = async () => {
    if (!cls || !raceDef || !bg) return
    setBusy(true)
    try {
      const pb = profBonus(lvl)
      const owned = items.map(findWeapon).filter((w): w is Weapon => !!w)
      const weapons = owned.filter((w, i) => owned.findIndex((x) => x.id === w.id) === i).map((w) => weaponAttack(w, finalScores, pb))
      const feats = [
        ...raceDef.traits.map((tr) => g('traits', tr.id, tr.name)),
        ...(subraceDef?.traits.map((tr) => g('traits', tr.id, tr.name)) || []),
        ...cls.features.filter((f) => f.level <= lvl).map((f) => (lang === 'he' && featureNameHe(cls.id, '', f.name)) || g('features', f.name, f.name)),
        ...(cls.subclasses.find((s) => s.id === subclass)?.features.filter((f) => f.level <= lvl).map((f) => (lang === 'he' && featureNameHe(cls.id, subclass, f.name)) || g('features', f.name, f.name)) || []),
        `${g('backgroundFeatures', bg.feature.name, bg.feature.name)} (${g('backgrounds', bg.id, bg.name)})`,
      ]
      const langs = raceDef.languages.map((l) => g('languages', l, l))
      const extraLangs = raceDef.extraLanguages + bg.languages
      const otherProfs = [
        `${t('languages')}: ${langs.join(', ')}${extraLangs ? ` + ${t('extraLanguages', { n: extraLangs })}` : ''}`,
        `${t('proficiencies')}: ${cls.proficiencies.map((p) => g('classProficiencies', p, p)).join(', ')}`,
        ...(bg.tools.length ? [`${t('tools')}: ${bg.tools.map((x) => g('tools', x, x)).join(', ')}`] : []),
      ].join('\n')
      const preparedCount = cls.id === 'wizard' ? Math.max(1, mod(finalScores.int) + lvl) : Infinity
      const doc: NewCharacter = {
        campaignId: cid, ownerUid: user.uid, ownerName: user.displayName,
        name: details.name.trim(), race, subrace, classId, subclass, level: lvl, background,
        alignment: details.alignment, xp: 0,
        baseAbilities: base, abilities: finalScores,
        saveProfs: cls.saves, skillProfs: [...new Set([...raceSkills, ...bg.skills, ...classSkills])], expertise: [],
        inspiration: false,
        armorClass: armorClass(items, cls, subclass, finalScores),
        speed: subraceDef?.speed ?? raceDef.speed,
        hpMax: startingHp(cls, lvl, mod(finalScores.con), subrace),
        hpCurrent: startingHp(cls, lvl, mod(finalScores.con), subrace), hpTemp: 0, hitDiceUsed: 0,
        deathSaves: { successes: 0, failures: 0 },
        attacks: weapons.slice(0, 5),
        equipment: items.map((i) => g('equipmentOptions', i, i)).join('\n'),
        coins: { cp: 0, sp: 0, ep: 0, gp: bg.gold, pp: 0 },
        otherProficiencies: otherProfs,
        features: [...new Set(feats)].join('\n'),
        personality: details.personality, ideals: details.ideals, bonds: details.bonds, flaws: details.flaws,
        age: details.age, height: details.height, weight: details.weight, eyes: details.eyes, skin: details.skin, hair: details.hair,
        appearance: details.appearance, portraitUrl: details.portraitUrl, backstory: details.backstory,
        allies: '', symbolName: '', additionalFeatures: '', treasure: '',
        spells: [
          ...cantrips.map((id) => ({ id, prepared: true })),
          ...spells.map((id, i) => ({ id, prepared: i < preparedCount })),
        ],
        slotsExpended: Array(9).fill(0),
      }
      const id = await backend.createCharacter(doc)
      nav(`/campaign/${cid}/character/${id}`)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  if (campaign.loading) return <Loading />
  if (!campaign.data) return <div className="page"><p className="error-box">{t('notFound')}</p></div>

  const abilityName = (a: Ability) => ABILITY_NAMES[a][lang]
  const skillName = (id: string) => { const s = SKILLS.find((x) => x.id === id)!; return s[lang] }

  return (
    <div className="page wizard">
      <h1 className="page-title">{t('wizardTitle')} <span className="muted small">· {campaign.data.name}</span></h1>
      <ol className="stepper" ref={stepper}>
        {steps.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button disabled={i > step && !steps.slice(0, i).every((x) => valid[x])} onClick={() => setStep(i)}>
              <span className="step-no">{i + 1}</span> {t(`step${s[0].toUpperCase()}${s.slice(1)}` as 'stepRace')}
            </button>
          </li>
        ))}
      </ol>

      <div className="wizard-body card">
        {current === 'race' && (
          <>
            <div className="choice-grid">
              {RACES.map((r) => (
                <button key={r.id} className={`choice ${race === r.id ? 'on' : ''}`} onClick={() => { setRace(r.id); setSubrace(''); setBonusChoice([]); setRaceSkillChoice([]); setClassSkills([]); setFlexMode('21') }}>
                  <strong>{g('races', r.id, r.name)}</strong>
                  <small>{Object.entries(r.bonuses).map(([a, v]) => `${ABILITY_NAMES[a as Ability].short[lang]} ${signed(v as number)}`).join(' · ')}</small>
                  {r.source && <small className="tag src">{r.source === 'PHB24' ? 'PHB 2024' : r.source}</small>}
                </button>
              ))}
            </div>
            {raceDef && (
              <div className="detail-panel">
                <p className="small">{t('speed')}: {subraceDef?.speed ?? raceDef.speed} ft · {t('size')}: {raceDef.size} · {t('languages')}: {raceDef.languages.map((l) => g('languages', l, l)).join(', ')}</p>
                {raceDef.subraces.length > 0 && (
                  <Field label={t('subrace')}>
                    <div className="chip-row">
                      {raceDef.subraces.map((s) => (
                        <button key={s.id} className={`chip ${subrace === s.id ? 'on' : ''}`} onClick={() => setSubrace(s.id)}>
                          {g('subraces', s.id, s.name)} <small>{Object.entries(s.bonuses).map(([a, v]) => `${ABILITY_NAMES[a as Ability].short[lang]} ${signed(v as number)}`).join(' ')}</small>
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
                {raceDef.bonusChoice && (
                  <Field label={t('chooseBonus', { n: raceDef.bonusChoice.choose, amount: raceDef.bonusChoice.amount })}>
                    <div className="chip-row">
                      {raceDef.bonusChoice.from.map((a) => (
                        <button key={a} className={`chip ${bonusChoice.includes(a) ? 'on' : ''}`} onClick={() => setBonusChoice(toggle(bonusChoice, a, raceDef.bonusChoice!.choose))}>
                          {abilityName(a)}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
                {raceDef.flexibleBonus && (
                  <Field label={t('flexBonusTitle')} hint={t('flexBonusHint')}>
                    <div className="chip-row">
                      <button className={`chip ${flexMode === '21' ? 'on' : ''}`} onClick={() => { setFlexMode('21'); setBonusChoice([]) }}>+2 / +1</button>
                      <button className={`chip ${flexMode === '111' ? 'on' : ''}`} onClick={() => { setFlexMode('111'); setBonusChoice([]) }}>+1 / +1 / +1</button>
                    </div>
                    {flexMode === '21' ? (
                      <div className="row wrap">
                        <label className="small">+2 <select value={bonusChoice[0] ?? ''} onChange={(e) => {
                          const two = e.target.value as Ability
                          const one = bonusChoice[2] && bonusChoice[2] !== two ? bonusChoice[2] : undefined
                          setBonusChoice(one ? [two, two, one] : [two, two])
                        }}>
                          <option value="">—</option>
                          {ABILITIES.map((a) => <option key={a} value={a}>{abilityName(a)}</option>)}
                        </select></label>
                        <label className="small">+1 <select value={bonusChoice[2] ?? ''} disabled={!bonusChoice[0]} onChange={(e) => setBonusChoice([bonusChoice[0], bonusChoice[0], e.target.value as Ability])}>
                          <option value="">—</option>
                          {ABILITIES.filter((a) => a !== bonusChoice[0]).map((a) => <option key={a} value={a}>{abilityName(a)}</option>)}
                        </select></label>
                      </div>
                    ) : (
                      <div className="chip-row">
                        {ABILITIES.map((a) => (
                          <button key={a} className={`chip ${bonusChoice.includes(a) ? 'on' : ''}`} onClick={() => setBonusChoice(toggle(bonusChoice, a, 3))}>{abilityName(a)}</button>
                        ))}
                      </div>
                    )}
                  </Field>
                )}
                {raceDef.skills && raceDef.skills.length > 0 && (
                  <p className="small"><strong>{t('raceSkills')}:</strong> {raceDef.skills.map(skillName).join(', ')}</p>
                )}
                {raceDef.skillChoice && (
                  <Field label={t('raceChooseSkills', { n: raceDef.skillChoice.choose })}>
                    <div className="chip-row">
                      {SKILLS.filter((s) => raceDef.skillChoice!.from === 'any' || raceDef.skillChoice!.from.includes(s.id)).map((s) => (
                        <button key={s.id} className={`chip ${raceSkillChoice.includes(s.id) ? 'on' : ''}`}
                          onClick={() => setRaceSkillChoice(toggle(raceSkillChoice, s.id, raceDef.skillChoice!.choose))}>
                          {s[lang]}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
                <h4>{t('traits')}</h4>
                <ul className="trait-list">
                  {[...raceDef.traits, ...(subraceDef?.traits || [])].map((tr) => (
                    <li key={tr.id}><strong>{g('traits', tr.id, tr.name)}.</strong> {tr.desc && <span dir="ltr" lang="en" className="en-text">{tr.desc}</span>}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {current === 'class' && (
          <>
            <div className="choice-grid">
              {CLASSES.map((c) => (
                <button key={c.id} className={`choice ${classId === c.id ? 'on' : ''}`} onClick={() => { setClassId(c.id); setSubclass(''); setClassSkills([]); setEquipPick({}); setWeaponPick({}); setCantrips([]); setSpells([]) }}>
                  <strong>{g('classes', c.id, c.name)}</strong>
                  <small>d{c.hitDie} · {c.saves.map((s) => ABILITY_NAMES[s].short[lang]).join('/')}</small>
                </button>
              ))}
            </div>
            {cls && (
              <div className="detail-panel">
                <div className="form-grid">
                  <Field label={t('level')}>
                    <input type="number" min={1} max={20} value={lvl} onChange={(e) => { setLevel(Math.max(1, Math.min(20, +e.target.value))); setSpells([]); setCantrips([]) }} />
                  </Field>
                  {lvl >= cls.subclassLevel && (
                    <Field label={`${t('subclass')}${cls.subclassFlavor ? ` — ${cls.subclassFlavor}` : ''}`}>
                      <select value={subclass} onChange={(e) => setSubclass(e.target.value)}>
                        <option value="">—</option>
                        {cls.subclasses.map((s) => <option key={s.id} value={s.id}>{g('subclasses', s.id, s.name)}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
                <p className="small">
                  {t('hitDie')}: d{cls.hitDie} · {t('savingThrows')}: {cls.saves.map(abilityName).join(', ')}
                  {cls.spellAbility && <> · {t('stepSpells')}: {abilityName(cls.spellAbility)}</>}
                </p>
                <p className="small">{t('proficiencies')}: {cls.proficiencies.map((p) => g('classProficiencies', p, p)).join(', ')}</p>
                <h4>{t('level')} 1–{lvl}</h4>
                <ul className="trait-list">
                  {cls.features.filter((f) => f.level <= lvl).map((f) => (
                    <li key={f.name + f.level}><span className="lvl-badge">{f.level}</span> <strong>{(lang === 'he' && featureNameHe(cls.id, '', f.name)) || g('features', f.name, f.name)}</strong>{f.summary ? <span className="muted small"> — {f.summary}</span> : null}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {current === 'abilities' && (
          <>
            <div className="chip-row">
              {([['standard', t('methodStandard')], ['pointbuy', t('methodPointBuy')], ['roll', t('methodRoll')], ['manual', t('methodManual')]] as [Method, string][]).map(([m, label]) => (
                <button key={m} className={`chip ${method === m ? 'on' : ''}`} onClick={() => {
                  setMethod(m)
                  setAssign({ str: null, dex: null, con: null, int: null, wis: null, cha: null })
                  if (m === 'standard') setPool(STANDARD_ARRAY)
                  if (m === 'roll') setPool(Array.from({ length: 6 }, roll4d6).sort((a, b) => b - a))
                  if (m === 'pointbuy') setDirect(blankScores(8))
                  if (m === 'manual') setDirect(blankScores(10))
                }}>{label}</button>
              ))}
            </div>
            {(method === 'standard' || method === 'roll') && (
              <p className="small">
                {t('assignScores')}: {pool.map((v, i) => <span key={i} className={`pool-val ${Object.values(assign).includes(i) ? 'used' : ''}`}>{v}</span>)}
                {method === 'roll' && <button className="btn btn-small" onClick={() => { setPool(Array.from({ length: 6 }, roll4d6).sort((a, b) => b - a)); setAssign({ str: null, dex: null, con: null, int: null, wis: null, cha: null }) }}>🎲 {t('rollAgain')}</button>}
              </p>
            )}
            {method === 'pointbuy' && <p className={`small ${pointsSpent > 27 ? 'bad' : ''}`}>{t('pointsLeft', { n: 27 - pointsSpent })}</p>}
            <div className="ability-builder">
              {ABILITIES.map((a) => (
                <div key={a} className="ability-tile">
                  <div className="ability-tile-name">{abilityName(a)}</div>
                  {(method === 'standard' || method === 'roll') ? (
                    <select value={assign[a] ?? ''} onChange={(e) => {
                      const v = e.target.value === '' ? null : +e.target.value
                      const next = { ...assign }
                      for (const k of ABILITIES) if (next[k] === v) next[k] = null
                      next[a] = v
                      setAssign(next)
                    }}>
                      <option value="">—</option>
                      {pool.map((v, i) => <option key={i} value={i}>{v}</option>)}
                    </select>
                  ) : (
                    <input type="number" min={method === 'pointbuy' ? 8 : 3} max={method === 'pointbuy' ? 15 : 20} value={direct[a]}
                      onChange={(e) => setDirect({ ...direct, [a]: +e.target.value })} />
                  )}
                  <div className="ability-tile-math small">
                    {racial[a] ? <span>{t('racial')} {signed(racial[a])}</span> : <span>&nbsp;</span>}
                  </div>
                  <div className="ability-tile-total">{base[a] ? finalScores[a] : '—'}</div>
                  <div className="ability-tile-mod">{base[a] ? signed(mod(finalScores[a])) : ''}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {current === 'background' && cls && (
          <>
            <div className="choice-grid">
              {BACKGROUNDS.map((b) => (
                <button key={b.id} className={`choice ${background === b.id ? 'on' : ''}`} onClick={() => { setBackground(b.id); setClassSkills(classSkills.filter((s) => !b.skills.includes(s) && !raceSkills.includes(s))) }}>
                  <strong>{g('backgrounds', b.id, b.name)}</strong>
                  <small>{b.skills.map(skillName).join(', ')}</small>
                </button>
              ))}
            </div>
            {bg && (
              <div className="detail-panel">
                <p className="small"><strong>{t('backgroundFeature')}:</strong> {g('backgroundFeatures', bg.feature.name, bg.feature.name)}
                  {bg.tools.length > 0 && <> · <strong>{t('tools')}:</strong> {bg.tools.map((x) => g('tools', x, x)).join(', ')}</>}
                  {bg.languages > 0 && <> · {t('extraLanguages', { n: bg.languages })}</>}
                </p>
                {bg.feature.desc && <p className="small en-text" dir="ltr" lang="en">{bg.feature.desc}</p>}
              </div>
            )}
            <h4>{t('chooseSkills', { n: cls.skillChoice.choose })} <span className="muted small">({t('selected', { n: classSkills.length, max: cls.skillChoice.choose })})</span></h4>
            <div className="chip-row">
              {SKILLS.map((s) => {
                const fromBg = bg?.skills.includes(s.id)
                const fromRace = raceSkills.includes(s.id)
                const locked = fromBg || fromRace
                const allowed = cls.skillChoice.from.includes(s.id)
                return (
                  <button key={s.id} disabled={locked || !allowed}
                    className={`chip ${classSkills.includes(s.id) || locked ? 'on' : ''} ${locked ? 'locked' : ''}`}
                    title={fromBg ? t('fromBackground') : fromRace ? t('fromRace') : ''}
                    onClick={() => setClassSkills(toggle(classSkills, s.id, cls.skillChoice.choose))}>
                    {s[lang]} <small>({ABILITY_NAMES[s.ability].short[lang]})</small>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {current === 'equipment' && cls && (
          <>
            <h4>{t('alwaysGet')}</h4>
            <p className="small">{cls.startingEquipment.map((i) => g('equipmentOptions', i, i)).join(' · ') || '—'}</p>
            {cls.startingEquipmentOptions.map((set, i) => (
              <div key={i} className="equip-set">
                <h4>{t('chooseOne')}</h4>
                <div className="chip-row">
                  {set.options.map((opt, j) => (
                    <button key={j} className={`chip ${(equipPick[i] ?? 0) === j ? 'on' : ''}`} onClick={() => setEquipPick({ ...equipPick, [i]: j })}>
                      {splitItems(opt).map((p) => g('equipmentOptions', p, p)).join(' + ')}
                    </button>
                  ))}
                </div>
                {splitItems(set.options[equipPick[i] ?? 0] || '').map((part, k) => {
                  const list = weaponsForCategory(part)
                  if (!list) return null
                  const key = `${i}-${equipPick[i] ?? 0}-${k}`
                  return (
                    <select key={key} value={weaponPick[key] || ''} onChange={(e) => setWeaponPick({ ...weaponPick, [key]: e.target.value })}>
                      <option value="">{g('equipmentOptions', part, part)}…</option>
                      {list.map((w) => <option key={w.id} value={w.id}>{g('weapons', w.id, w.name)} ({w.damage})</option>)}
                    </select>
                  )
                })}
              </div>
            ))}
            {bg && <p className="small">{t('startingGold')}: {bg.gold} gp</p>}
          </>
        )}

        {current === 'spells' && cls && (
          <SpellStep
            listClass={casterInfo(cls.id, subclass)?.listClass ?? cls.id} allowance={allowance} cantrips={cantrips} setCantrips={setCantrips}
            spells={spells} setSpells={setSpells} allSources={allSources} setAllSources={setAllSources}
          />
        )}

        {current === 'details' && (
          <div className="form-grid">
            <Field label={`${t('charName')} *`}><input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} /></Field>
            <Field label={t('alignment')}>
              <select value={details.alignment} onChange={(e) => setDetails({ ...details, alignment: e.target.value })}>
                <option value="">—</option>
                {ALIGNMENTS.map((a) => <option key={a.en} value={a[lang]}>{a[lang]}</option>)}
              </select>
            </Field>
            {(['age', 'height', 'weight', 'eyes', 'skin', 'hair'] as const).map((k) => (
              <Field key={k} label={SHEET_SMALL[k][lang]}><input value={details[k]} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} /></Field>
            ))}
            <Field label={t('portraitUrl')}><input type="url" value={details.portraitUrl} onChange={(e) => setDetails({ ...details, portraitUrl: e.target.value })} placeholder="https://…" /></Field>
            {(['personality', 'ideals', 'bonds', 'flaws', 'appearance', 'backstory'] as const).map((k) => (
              <Field key={k} label={t(k)}><textarea rows={k === 'backstory' ? 6 : 3} value={details[k]} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} /></Field>
            ))}
          </div>
        )}

        {current === 'review' && cls && raceDef && bg && (
          <div className="review">
            <h2 className="review-name">{details.name}</h2>
            <p>
              {g('races', raceDef.id, raceDef.name)}{subraceDef && ` (${g('subraces', subraceDef.id, subraceDef.name)})`} ·{' '}
              {g('classes', cls.id, cls.name)} {lvl}{subclass && ` · ${g('subclasses', subclass, cls.subclasses.find((s) => s.id === subclass)?.name)}`} ·{' '}
              {g('backgrounds', bg.id, bg.name)}
            </p>
            <div className="review-abilities">
              {ABILITIES.map((a) => (
                <div key={a} className="mini-ability"><span>{ABILITY_NAMES[a].short[lang]}</span><strong>{finalScores[a]}</strong><em>{signed(mod(finalScores[a]))}</em></div>
              ))}
            </div>
            <p className="small">
              HP {startingHp(cls, lvl, mod(finalScores.con), subrace)} · AC {armorClass(items, cls, subclass, finalScores)} · {t('speed')} {subraceDef?.speed ?? raceDef.speed} ·{' '}
              {[...new Set([...raceSkills, ...bg.skills, ...classSkills])].map(skillName).join(', ')}
            </p>
            {casts && <p className="small">{t('cantrips')}: {cantrips.map((id) => g('spells', id, findSpell(id)?.name)).join(', ') || '—'}<br />{t('stepSpells')}: {spells.map((id) => g('spells', id, findSpell(id)?.name)).join(', ') || '—'}</p>}
            {error != null && <ErrorBox error={error} />}
          </div>
        )}
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><span className="arrow">←</span> {t('back')}</button>
        {current === 'review' ? (
          <button className="btn btn-primary btn-large" disabled={busy} onClick={finish}>⚔ {t('finish')}</button>
        ) : (
          <button className="btn btn-primary" disabled={!valid[current]} onClick={() => setStep(step + 1)}>{t('next')} <span className="arrow">→</span></button>
        )}
      </div>
    </div>
  )
}

function findWeaponName(id: string) {
  return WEAPONS.find((w) => w.id === id)?.name ?? id
}

function toggle<T>(list: T[], v: T, max: number): T[] {
  if (list.includes(v)) return list.filter((x) => x !== v)
  if (list.length >= max) return max === 1 ? [v] : list
  return [...list, v]
}

export const SHEET_SMALL = {
  age: { en: 'Age', he: 'גיל' },
  height: { en: 'Height', he: 'גובה' },
  weight: { en: 'Weight', he: 'משקל' },
  eyes: { en: 'Eyes', he: 'עיניים' },
  skin: { en: 'Skin', he: 'עור' },
  hair: { en: 'Hair', he: 'שיער' },
}

function SpellStep({ listClass, allowance, cantrips, setCantrips, spells, setSpells, allSources, setAllSources }: {
  listClass: string
  allowance: ReturnType<typeof spellAllowance>
  cantrips: string[]; setCantrips(v: string[]): void
  spells: string[]; setSpells(v: string[]): void
  allSources: boolean; setAllSources(v: boolean): void
}) {
  const { t, g } = useI18n()
  const [open, setOpen] = useState<Spell | null>(null)
  const [q, setQ] = useState('')
  const list = allSpells().filter((s) => s.classes.includes(listClass) && (allSources || s.source === 'PHB' || s.source === 'HB'))
    .filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || g('spells', s.id).includes(q))
  const cantripList = list.filter((s) => s.level === 0)
  const leveled = list.filter((s) => s.level >= 1 && s.level <= allowance.maxLevel)
  const heading = allowance.mode === 'spellbook' ? t('wizardSpellbook', { n: allowance.spells, max: allowance.maxLevel })
    : allowance.mode === 'prepared' ? t('choosePrepared', { n: allowance.spells, max: allowance.maxLevel })
    : t('chooseSpells', { n: allowance.spells, max: allowance.maxLevel })

  const SpellChip = ({ s, picked, onToggle }: { s: Spell; picked: boolean; onToggle(): void }) => (
    <span className={`spell-chip ${picked ? 'on' : ''}`}>
      <button className="spell-chip-main" onClick={onToggle}>{picked ? '◆' : '◇'} {g('spells', s.id, s.name)}</button>
      <button className="spell-chip-info" onClick={() => setOpen(s)} aria-label="info">i</button>
    </span>
  )

  return (
    <div className="spell-step">
      <div className="row wrap">
        <input className="grow" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={allSources} onChange={(e) => setAllSources(e.target.checked)} /> {t('showAllSources')}</label>
      </div>
      {allowance.cantrips > 0 && (
        <>
          <h4>{t('chooseCantrips', { n: allowance.cantrips })} <span className="muted small">{t('selected', { n: cantrips.length, max: allowance.cantrips })}</span></h4>
          <div className="chip-row">
            {cantripList.map((s) => <SpellChip key={s.id} s={s} picked={cantrips.includes(s.id)} onToggle={() => setCantrips(toggle(cantrips, s.id, allowance.cantrips))} />)}
          </div>
        </>
      )}
      {allowance.spells > 0 && (
        <>
          <h4>{heading} <span className="muted small">{t('selected', { n: spells.length, max: allowance.spells })}</span></h4>
          {Array.from({ length: allowance.maxLevel }, (_, i) => i + 1).map((lv) => (
            <div key={lv}>
              <h5 className="spell-level-head">{spellLevelLabel(t, lv)}</h5>
              <div className="chip-row">
                {leveled.filter((s) => s.level === lv).map((s) => <SpellChip key={s.id} s={s} picked={spells.includes(s.id)} onToggle={() => setSpells(toggle(spells, s.id, allowance.spells))} />)}
              </div>
            </div>
          ))}
        </>
      )}
      {open && <div className="modal-backdrop" onClick={() => setOpen(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><SpellCard spell={open} onClose={() => setOpen(null)} /></div></div>}
    </div>
  )
}
