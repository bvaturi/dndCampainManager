/**
 * Levelling up by the 2014 PHB ("Beyond 1st Level", p.15, and each class's table): one more Hit Die — rolled or
 * the class's fixed value — plus Constitution; the proficiency bonus; and everything the class gives at the new
 * level: features (class and subclass), spell slots, cantrips, spells known or prepared, always-prepared
 * subclass spells, table columns (Rages, Sneak Attack…) and limited uses. Pure functions (unit-tested).
 */
import { characterResources, type ResourceState } from './classFeatures'
import { addFeat, levelUpFeats } from './feats'
import { averageHpPerLevel, classById, mod, profBonus, type Spell } from './rules'
import { cantripCount, castableMax, casterInfo, spellAllowance, spellSlots, subclassSpells, type SpellMode } from './spellAccess'
import type { Ability, Character, CharacterFeat } from './types'

/** Extra hit points per level from race or subclass (Hill Dwarf's Dwarven Toughness, Draconic Resilience). */
export function bonusHpPerLevel(ch: Pick<Character, 'subrace' | 'classId' | 'subclass'>): number {
  return (ch.subrace === 'hill-dwarf' ? 1 : 0) + (ch.classId === 'sorcerer' && ch.subclass === 'draconic' ? 1 : 0)
}

/** One ability a level brings. `subclass` is '' for class features; `summary` is the short rules description. */
export interface GainedFeature { subclass: string; name: string; summary?: string }

/** "Channel Divinity (1/rest)" → "channel divinity": table entries often carry a count the feature name doesn't. */
const baseName = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()

/** The abilities a class (and chosen subclass) gains at exactly this level. */
export function featuresAtLevel(classId: string, subclass: string, level: number): GainedFeature[] {
  const cls = classById(classId)
  if (!cls) return []
  const sub = cls.subclasses.find((s) => s.id === subclass)
  const out: GainedFeature[] = cls.features
    .filter((f) => f.level === level)
    .map((f) => ({ subclass: '', name: f.name, summary: f.summary }))
  for (const n of cls.progression.find((p) => p.level === level)?.features ?? []) {
    // "… feature" placeholders become the subclass's features below (kept as a reminder if none is chosen yet).
    if (sub && /feature$/i.test(n.trim())) continue
    if (out.some((f) => baseName(f.name) === baseName(n))) continue
    out.push({ subclass: '', name: n })
  }
  for (const f of sub?.features ?? []) {
    if (f.level === level && !out.some((x) => x.name === f.name)) out.push({ subclass: sub!.id, name: f.name, summary: f.summary })
  }
  return out
}

export interface Change<T> { from: T; to: T }

export interface LevelUpPlan {
  level: number
  hitDie: number
  conMod: number
  /** The class's fixed hit point value for a level (average of the die, rounded up). */
  hpFixed: number
  /** Per-level extras on top: Dwarven Toughness, Draconic Resilience, Tough. */
  hpBonus: number
  prof: Change<number> | null
  /** Spell slots that change, by spell level (not warlocks: see `pact`). */
  slots: { level: number; from: number; to: number }[]
  /** Warlock Pact Magic: number of slots and their level. */
  pact: Change<{ count: number; level: number }> | null
  /** A spell level the character couldn't cast before. */
  newSpellLevel: number | null
  cantrips: Change<number> | null
  /** Spells known (bard, ranger, sorcerer, warlock, one-third casters) or in the wizard's spellbook. */
  spells: (Change<number> & { mode: SpellMode }) | null
  /** How many spells can be prepared (cleric, druid, paladin, wizard). */
  prepared: Change<number> | null
  /** Domain / oath spells that become always prepared at this level. */
  alwaysPrepared: Spell[]
  /** Class table columns that change (Rages, Sneak Attack, Ki Points…). */
  columns: { name: string; from: number | string; to: number | string }[]
  /** Limited-use features whose number of uses changes or that are new. */
  resources: { key: string; label: string; labelHe?: string; from: number; to: number }[]
  features: GainedFeature[]
  /** This level grants an Ability Score Improvement (+2 to one score or +1 to two, max 20; or a feat). */
  asi: boolean
  /** The class picks its subclass at or before this level and none is chosen yet. */
  needsSubclass: boolean
  feats?: CharacterFeat[]
}

const SPELL_COLUMN = /^\d+(st|nd|rd|th)$|slot|cantrip|spells known/i

/** Everything the next level gives this character. `subclass` lets the dialog preview a subclass being chosen. */
export function levelUpPlan(ch: Character, subclass = ch.subclass): LevelUpPlan | null {
  const cls = classById(ch.classId)
  if (!cls || ch.level >= 20) return null
  const next = ch.level + 1
  const after: Character = { ...ch, level: next, subclass }
  const fromFeats = levelUpFeats(ch)

  const before = spellSlots(ch.classId, ch.subclass, ch.level)
  const now = spellSlots(ch.classId, subclass, next)
  const isWarlock = ch.classId === 'warlock'
  const pactOf = (s: number[]) => { const i = s.findIndex((n) => n > 0); return { count: i < 0 ? 0 : s[i], level: i + 1 } }
  const slots = isWarlock ? [] : now.map((to, i) => ({ level: i + 1, from: before[i], to })).filter((s) => s.to !== s.from)
  const pact = isWarlock && JSON.stringify(pactOf(before)) !== JSON.stringify(pactOf(now)) ? { from: pactOf(before), to: pactOf(now) } : null
  const maxBefore = castableMax(ch.classId, ch.subclass, ch.level)
  const maxNow = castableMax(ch.classId, subclass, next)

  const change = (from: number, to: number) => (from !== to ? { from, to } : null)
  const caster = !!casterInfo(ch.classId, subclass)
  const a0 = spellAllowance(ch.classId, ch.subclass, ch.level, ch.abilities)
  const a1 = spellAllowance(ch.classId, subclass, next, ch.abilities)
  const counted = a1.mode === 'known' || a1.mode === 'spellbook'
  const spells = caster && counted && a0.spells !== a1.spells ? { from: a0.spells, to: a1.spells, mode: a1.mode } : null
  const prepares = a1.mode === 'prepared' || a1.mode === 'spellbook'
  const alwaysBefore = new Set(subclassSpells(ch.classId, ch.subclass, ch.level).always.map((s) => s.id))

  const rowBefore = cls.progression.find((p) => p.level === ch.level)?.columns ?? {}
  const rowNow = cls.progression.find((p) => p.level === next)?.columns ?? {}
  const columns = Object.entries(rowNow)
    .filter(([k, v]) => !SPELL_COLUMN.test(k) && String(rowBefore[k] ?? '') !== String(v))
    .map(([name, to]) => ({ name, from: rowBefore[name] ?? '—', to }))

  const resBefore = new Map(characterResources(ch).map((r) => [r.key, r]))
  const resources = characterResources(after)
    .filter((r: ResourceState) => (resBefore.get(r.key)?.total ?? 0) !== r.total)
    .map((r) => ({ key: r.key, label: r.label, labelHe: r.labelHe, from: resBefore.get(r.key)?.total ?? 0, to: r.total }))

  return {
    level: next,
    hitDie: cls.hitDie,
    conMod: mod(ch.abilities.con),
    hpFixed: averageHpPerLevel(cls.hitDie),
    hpBonus: bonusHpPerLevel(after) + fromFeats.hp,
    prof: change(profBonus(ch.level), profBonus(next)),
    slots,
    pact,
    newSpellLevel: maxNow > maxBefore ? maxNow : null,
    cantrips: caster ? change(cantripCount(ch.classId, ch.subclass, ch.level), cantripCount(ch.classId, subclass, next)) : null,
    spells,
    prepared: caster && prepares ? change(a0.preparedLimit, a1.preparedLimit) : null,
    alwaysPrepared: subclassSpells(ch.classId, subclass, next).always.filter((s) => !alwaysBefore.has(s.id)),
    columns,
    resources,
    features: featuresAtLevel(ch.classId, subclass, next),
    asi: (cls.progression.find((p) => p.level === next)?.features ?? []).some((n) => /ability score improvement/i.test(n)),
    needsSubclass: !subclass && next >= cls.subclassLevel && cls.subclasses.length > 0,
    feats: fromFeats.feats,
  }
}

/**
 * Hit points gained for a Hit Die result (a roll, or the class's fixed value): die + Constitution modifier,
 * at least 1 (official errata), plus the per-level extras.
 */
export const hpGain = (plan: LevelUpPlan, die: number) => Math.max(1, die + plan.conMod) + plan.hpBonus

export interface LevelUpChoices {
  subclass: string
  /** The Hit Die result used: a roll, or plan.hpFixed. */
  die: number
  /** Ability Score Improvement taken now (same ability twice = +2); omit to choose a feat later. */
  asi?: { choice: Ability; choice2: Ability }
  /** Lines to add to Features & Traits ("Name: what it does"), already in the sheet's language. */
  featureLines: string[]
}

/** The sheet change for levelling up with these choices. */
export function applyLevelUp(ch: Character, plan: LevelUpPlan, c: LevelUpChoices): Partial<Character> {
  const hp = hpGain(plan, c.die)
  const patch: Partial<Character> = {
    level: plan.level,
    subclass: c.subclass,
    hpMax: ch.hpMax + hp,
    hpCurrent: ch.hpCurrent + hp,
    features: c.featureLines.length ? `${ch.features}\n${c.featureLines.join('\n')}`.trim() : ch.features,
    ...(plan.feats ? { feats: plan.feats } : {}),
  }
  if (!c.asi) return patch
  // The improvement applies at the new level, so a higher Constitution modifier adds 1 HP for every level.
  return { ...patch, ...addFeat({ ...ch, ...patch } as Character, { featId: 'asi', level: plan.level, choice: c.asi.choice, choice2: c.asi.choice2, notes: '' }) }
}

/** The fixed-value level-up (kept for callers that only need HP and features). */
export function levelUpGain(ch: Character): { level: number; hp: number; features: GainedFeature[]; feats?: CharacterFeat[] } | null {
  const plan = levelUpPlan(ch)
  return plan && { level: plan.level, hp: hpGain(plan, plan.hpFixed), features: plan.features, feats: plan.feats }
}
