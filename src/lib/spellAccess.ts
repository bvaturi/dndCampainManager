/**
 * Which spells a character can use: their class's spell list, the spell levels their slots reach,
 * and the character level at which each higher spell level unlocks.
 *
 * Covers full/half/pact casters from the class tables, the warlock's Mystic Arcanum (6th–9th),
 * and the PHB one-third casters (Eldritch Knight, Arcane Trickster) who use the wizard list.
 */
import { allSpells, findSpell, grantedSpells } from './homebrew'
import { classById, levelRow, mod, type Spell } from './rules'
import type { Ability, AbilityScores, Character } from './types'

// One-third caster table (PHB Eldritch Knight / Arcane Trickster): slots for spell levels 1-4 by character level.
const THIRD_SLOTS: number[][] = [
  [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0], [3, 0, 0, 0], [3, 0, 0, 0], [3, 0, 0, 0], [4, 2, 0, 0], [4, 2, 0, 0],
  [4, 2, 0, 0], [4, 3, 0, 0], [4, 3, 0, 0], [4, 3, 0, 0], [4, 3, 2, 0], [4, 3, 2, 0], [4, 3, 2, 0], [4, 3, 3, 0],
  [4, 3, 3, 0], [4, 3, 3, 0], [4, 3, 3, 1], [4, 3, 3, 1],
]
const THIRD_KNOWN = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13]
const THIRD_CASTERS: Record<string, { cantrips: [number, number] }> = {
  'eldritch-knight': { cantrips: [2, 3] },
  'arcane-trickster': { cantrips: [3, 4] },
}
// Warlock Mystic Arcanum: one spell each of 6th/7th/8th/9th level at these warlock levels.
const ARCANUM: Record<number, number> = { 6: 11, 7: 13, 8: 15, 9: 17 }

export interface CasterInfo {
  /** Class whose spell list is used (wizard for the one-third casters). */
  listClass: string
  ability: Ability
  third: boolean
}

export function casterInfo(classId: string, subclass: string): CasterInfo | null {
  const cls = classById(classId)
  if (!cls) return null
  if (cls.spellAbility) return { listClass: cls.id, ability: cls.spellAbility, third: false }
  if (THIRD_CASTERS[subclass]) return { listClass: 'wizard', ability: 'int', third: true }
  return null
}

const clampLevel = (level: number) => Math.max(1, Math.min(20, level))

/** Spell slots for spell levels 1-9 (index 0 = 1st level). */
export function spellSlots(classId: string, subclass: string, level: number): number[] {
  const info = casterInfo(classId, subclass)
  if (!info) return Array(9).fill(0)
  if (info.third) return [...THIRD_SLOTS[clampLevel(level) - 1], 0, 0, 0, 0, 0]
  return levelRow(classById(classId), clampLevel(level))?.slots ?? Array(9).fill(0)
}

/** Highest spell level the character can cast right now (0 = cantrips only / none). */
export function castableMax(classId: string, subclass: string, level: number): number {
  let max = 0
  spellSlots(classId, subclass, level).forEach((n, i) => { if (n > 0) max = i + 1 })
  if (classId === 'warlock') for (const [sl, at] of Object.entries(ARCANUM)) if (level >= at) max = Math.max(max, +sl)
  return max
}

/** Character level at which a spell level becomes castable, or null if this class never gets it. */
export function unlockLevel(classId: string, subclass: string, spellLevel: number): number | null {
  if (spellLevel === 0) return cantripCount(classId, subclass, 20) > 0 ? cantripUnlock(classId, subclass) : null
  for (let lv = 1; lv <= 20; lv++) if (castableMax(classId, subclass, lv) >= spellLevel) return lv
  return null
}

export function cantripCount(classId: string, subclass: string, level: number): number {
  const info = casterInfo(classId, subclass)
  if (!info) return 0
  if (info.third) {
    if (level < 3) return 0
    const [low, high] = THIRD_CASTERS[subclass].cantrips
    return level >= 10 ? high : low
  }
  return levelRow(classById(classId), clampLevel(level))?.cantrips ?? 0
}

function cantripUnlock(classId: string, subclass: string) {
  for (let lv = 1; lv <= 20; lv++) if (cantripCount(classId, subclass, lv) > 0) return lv
  return null
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** Spells named in a subclass's table, resolved to spell data (also matches "Tasha's" names without the owner). */
function resolveNames(names: string[]): Spell[] {
  const all = allSpells()
  return names.map((n) => all.find((s) => normName(s.name) === normName(n) || normName(s.name.replace(/^\w+'s /, '')) === normName(n)))
    .filter((s): s is Spell => !!s)
}

/**
 * Subclass spells: domain / oath spells are always prepared from the class level in their table (they don't count
 * against the prepared limit and may be off the class list, e.g. Tempest's Thunderwave). A warlock patron's
 * expanded list adds spells the warlock may pick (keyed by spell level).
 */
export function subclassSpells(classId: string, subclass: string, level: number): { always: Spell[]; expanded: Spell[] } {
  const sub = classById(classId)?.subclasses.find((s) => s.id === subclass)
  if (!sub?.spells) return { always: [], expanded: [] }
  if (classId === 'warlock') return { always: [], expanded: resolveNames(Object.values(sub.spells).flat()) }
  const names = Object.entries(sub.spells).filter(([lv]) => level >= +lv).flatMap(([, list]) => list)
  return { always: resolveNames(names), expanded: [] }
}

/** Spells on the character's class list (optionally PHB only), any level, plus a warlock patron's expanded spells. */
export function classSpellList(classId: string, subclass: string, allSources = true): Spell[] {
  const info = casterInfo(classId, subclass)
  if (!info) return []
  // Homebrew spells (the campaign's approved library) always count, like PHB ones.
  const list = allSpells().filter((s) => s.classes.includes(info.listClass) && (allSources || s.source === 'PHB' || s.source === 'HB'))
  const extra = subclassSpells(classId, subclass, 20).expanded.filter((s) => !list.some((x) => x.id === s.id))
  return [...list, ...extra]
}

/** Can this character take this spell at their current level? */
export function canUseSpell(classId: string, subclass: string, level: number, spell: Spell): boolean {
  const info = casterInfo(classId, subclass)
  const onList = !!info && (spell.classes.includes(info.listClass) || subclassSpells(classId, subclass, level).expanded.some((s) => s.id === spell.id))
  if (!info || !onList) return false
  if (spell.level === 0) return cantripCount(classId, subclass, level) > 0
  return spell.level <= castableMax(classId, subclass, level)
}

export type SpellMode = 'none' | 'known' | 'prepared' | 'spellbook'

/**
 * How many cantrips and leveled spells the character picks (known casters), prepares (clerics, druids,
 * paladins) or writes in their spellbook (wizards).
 */
export function spellAllowance(classId: string, subclass: string, level: number, abilities: AbilityScores) {
  const info = casterInfo(classId, subclass)
  const lv = clampLevel(level)
  const maxLevel = Math.min(castableMax(classId, subclass, lv), classId === 'warlock' ? 5 : 9)
  const cantrips = cantripCount(classId, subclass, lv)
  if (!info) return { cantrips: 0, spells: 0, maxLevel: 0, mode: 'none' as SpellMode, preparedLimit: 0 }
  const abilityMod = mod(abilities[info.ability])
  const cls = classById(classId)!
  if (info.third) return { cantrips, spells: THIRD_KNOWN[lv - 1], maxLevel, mode: 'known' as SpellMode, preparedLimit: 0 }
  if (classId === 'wizard') {
    return { cantrips, spells: 6 + 2 * (lv - 1), maxLevel, mode: 'spellbook' as SpellMode, preparedLimit: Math.max(1, abilityMod + lv) }
  }
  if (cls.prepared === 'full') {
    const n = Math.max(1, abilityMod + lv)
    return { cantrips, spells: n, maxLevel, mode: 'prepared' as SpellMode, preparedLimit: n }
  }
  if (cls.prepared === 'half') {
    const n = maxLevel ? Math.max(1, abilityMod + Math.floor(lv / 2)) : 0
    return { cantrips, spells: n, maxLevel, mode: 'prepared' as SpellMode, preparedLimit: n }
  }
  return { cantrips, spells: levelRow(cls, lv)?.known ?? 0, maxLevel, mode: 'known' as SpellMode, preparedLimit: 0 }
}

/**
 * Where the character stands against each limit of their class (PHB): cantrips known, spells known (bard, ranger,
 * sorcerer, warlock, one-third casters) and spells prepared (cleric, druid, paladin, wizard). Domain / oath spells
 * are always prepared and never count; neither do homebrew spells the DM granted. A wizard's spellbook has no cap
 * (spells can be copied into it), only the number prepared.
 */
export function spellCounts(ch: Pick<Character, 'id' | 'classId' | 'subclass' | 'level' | 'abilities' | 'spells'>) {
  const allowance = spellAllowance(ch.classId, ch.subclass, ch.level, ch.abilities)
  const free = new Set([...subclassSpells(ch.classId, ch.subclass, ch.level).always, ...grantedSpells(ch)].map((s) => s.id))
  let cantrips = 0, leveled = 0, prepared = 0
  for (const k of ch.spells) {
    const spell = findSpell(k.id)
    if (!spell || free.has(spell.id)) continue
    if (spell.level === 0) cantrips++
    else { leveled++; if (k.prepared) prepared++ }
  }
  const prepares = allowance.mode === 'prepared' || allowance.mode === 'spellbook'
  return {
    allowance, cantrips, leveled, prepared, prepares,
    /** Spells that never count against a limit (always prepared, or granted by the DM). */
    isFree: (id: string) => free.has(id),
    cantripsFull: allowance.mode !== 'none' && cantrips >= allowance.cantrips,
    knownFull: allowance.mode === 'known' && leveled >= allowance.spells,
    preparedFull: prepares && prepared >= allowance.preparedLimit,
  }
}

/** Why this spell can't be added to the sheet right now ('cantrips' or 'known' limit reached), or null if it can. */
export function addBlocked(counts: ReturnType<typeof spellCounts>, spell: Spell): 'cantrips' | 'known' | null {
  if (counts.isFree(spell.id)) return null
  if (spell.level === 0) return counts.cantripsFull ? 'cantrips' : null
  return counts.knownFull ? 'known' : null
}
