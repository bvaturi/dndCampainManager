import { useDice } from '../components/Dice'
import { d20Test, parseExpr, rollExpr, type RollPart } from '../lib/dice'
import { useI18n } from '../lib/i18n'
import { casterInfo } from '../lib/spellAccess'
import { featBonuses } from '../lib/feats'
import featsHe from '../data/feats.he.json'
import { ABILITY_NAMES, SKILLS, classById, findWeapon, mod, profBonus } from '../lib/rules'
import type { Ability, Character } from '../lib/types'

type Click = { shiftKey?: boolean; altKey?: boolean }

/** Initiative parts for a character: Dexterity plus feat bonuses such as Alert. */
export function initiativeParts(ch: Character, lang: 'en' | 'he'): RollPart[] {
  return [
    { label: ABILITY_NAMES.dex[lang], value: mod(ch.abilities.dex) },
    ...featBonuses(ch).initiativeSources.map((f) => ({
      label: (lang === 'he' && (featsHe as Record<string, { name: string }>)[f.id]?.name) || f.name, value: f.value,
    })),
  ]
}

/** Every roll the sheet can make, each with a labelled breakdown of what is added to the die. */
export function useSheetRolls(ch: Character, edit: boolean, onChange: (p: Partial<Character>) => void) {
  const { show, modeFor } = useDice()
  const { t, lang, g } = useI18n()
  const pb = profBonus(ch.level)
  const abilityPart = (a: Ability): RollPart => ({ label: ABILITY_NAMES[a][lang], value: mod(ch.abilities[a]) })
  const profPart: RollPart = { label: t('diceProficiency'), value: pb }
  const who = ch.name

  const check = (a: Ability, e?: Click) =>
    show(d20Test({ title: t('diceCheck', { name: ABILITY_NAMES[a][lang] }), subtitle: who, kind: 'check', mode: modeFor(e), parts: [abilityPart(a)] }))

  const save = (a: Ability, e?: Click) =>
    show(d20Test({
      title: t('diceSave', { name: ABILITY_NAMES[a][lang] }), subtitle: who, kind: 'save', mode: modeFor(e),
      parts: [abilityPart(a), ...(ch.saveProfs.includes(a) ? [profPart] : [])],
    }))

  const skill = (id: string, e?: Click) => {
    const s = SKILLS.find((x) => x.id === id)!
    const parts = [abilityPart(s.ability)]
    if (ch.skillProfs.includes(id) || ch.expertise.includes(id)) parts.push(profPart)
    if (ch.expertise.includes(id)) parts.push({ label: t('diceExpertise'), value: pb })
    show(d20Test({ title: s[lang], subtitle: who, kind: 'check', mode: modeFor(e), parts }))
  }

  const initiative = (e?: Click) =>
    show(d20Test({ title: t('diceInitiative'), subtitle: who, kind: 'initiative', mode: modeFor(e), parts: initiativeParts(ch, lang) }))

  /** Explain an attack row's bonus as ability + proficiency when the numbers add up, else as one "Attack bonus". */
  const attackParts = (name: string, bonus: number): { hit: RollPart[]; damage?: RollPart[] } => {
    const candidates: Ability[] = []
    const w = findWeapon(name)
    if (w) candidates.push(...(w.properties.includes('finesse') ? (['str', 'dex'] as Ability[]) : w.range === 'Ranged' ? (['dex'] as Ability[]) : (['str'] as Ability[])))
    const spellAbility = casterInfo(ch.classId, ch.subclass)?.ability
    if (spellAbility) candidates.push(spellAbility)
    candidates.push('str', 'dex')
    for (const a of candidates) {
      if (mod(ch.abilities[a]) + pb === bonus) return { hit: [abilityPart(a), profPart], damage: [abilityPart(a)] }
    }
    return { hit: [{ label: t('diceAttackBonus'), value: bonus }] }
  }

  const attack = (i: number, e?: Click) => {
    const row = ch.attacks[i]
    if (!row) return
    const bonus = parseInt(row.bonus.replace(/[^\d+-]/g, ''), 10) || 0
    const { hit, damage } = attackParts(row.name, bonus)
    const label = row.name || t('diceAttackBonus')
    show(d20Test({
      title: t('diceAttack', { name: label }), subtitle: who, kind: 'attack', mode: modeFor(e), parts: hit,
      followUp: parseExpr(row.damage) ? { title: t('diceDamage', { name: label }), expr: row.damage, parts: damage } : undefined,
    }))
  }

  const damage = (i: number) => {
    const row = ch.attacks[i]
    if (!row) return
    const bonus = parseInt(row.bonus.replace(/[^\d+-]/g, ''), 10) || 0
    show(rollExpr(row.damage, {
      title: t('diceDamage', { name: row.name }), subtitle: who, kind: 'damage',
      parts: attackParts(row.name, bonus).damage, flatLabel: t('diceModifier'),
    }))
  }

  const hitDie = () => {
    const sides = classById(ch.classId)?.hitDie ?? 8
    const con = mod(ch.abilities.con)
    show(rollExpr(`1d${sides}${con >= 0 ? '+' : ''}${con}`, {
      title: t('diceHitDie', { n: sides }), subtitle: who, kind: 'hitdie', parts: [abilityPart('con')],
    }))
  }

  /** Death save: 10+ succeeds, natural 1 counts as two failures, natural 20 brings you back with 1 HP. */
  const deathSave = (e?: Click) => {
    const r = d20Test({ title: t('diceDeathSave'), subtitle: who, kind: 'death', mode: modeFor(e), parts: [] })
    show(r)
    if (!edit) return
    const ds = ch.deathSaves
    if (r.natural === 'crit') onChange({ hpCurrent: Math.max(1, ch.hpCurrent), deathSaves: { successes: 0, failures: 0 } })
    else if (r.natural === 'fumble') onChange({ deathSaves: { ...ds, failures: Math.min(3, ds.failures + 2) } })
    else if (r.total >= 10) onChange({ deathSaves: { ...ds, successes: Math.min(3, ds.successes + 1) } })
    else onChange({ deathSaves: { ...ds, failures: Math.min(3, ds.failures + 1) } })
  }

  const spellAttack = (e?: Click) => {
    const a = casterInfo(ch.classId, ch.subclass)?.ability
    if (!a) return
    show(d20Test({ title: t('diceSpellAttack'), subtitle: `${who} · ${g('classes', ch.classId)}`, kind: 'attack', mode: modeFor(e), parts: [abilityPart(a), profPart] }))
  }

  return { check, save, skill, initiative, attack, damage, hitDie, deathSave, spellAttack }
}
