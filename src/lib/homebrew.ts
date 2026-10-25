/**
 * Homebrew spells and abilities: turning library items into the same shapes as book content (so the spell list,
 * casting, rests and the sheet need nothing special), plus validation for the editor. Pure functions (unit-tested).
 */
import { evalExpr } from './classFeatures'
import { getHomebrew } from './homebrewRegistry'
import { ABILITY_NAMES, SPELLS, mod, profBonus, type Spell } from './rules'
import type { Ability, Character, Homebrew, HomebrewAbility, HomebrewSpell } from './types'

/** Source tag of homebrew spells (shown as 🏠). */
export const HOMEBREW_SOURCE = 'HB'
export const isHomebrewId = (id: string) => id.startsWith('hb-')

export function toSpell(h: HomebrewSpell): Spell {
  return {
    id: h.id, name: h.name, level: h.level, school: h.school, castingTime: h.castingTime, range: h.range,
    components: h.components, material: h.material, duration: h.duration, concentration: h.concentration,
    ritual: h.ritual, desc: h.desc, higherLevel: h.higherLevel, classes: h.classes, source: HOMEBREW_SOURCE, srd: false,
  }
}

const approvedSpells = () => getHomebrew().filter((h): h is HomebrewSpell => h.kind === 'spell')

/** Book spells plus the campaign's approved homebrew spells. */
export const allSpells = (): Spell[] => [...SPELLS, ...approvedSpells().map(toSpell)]

export function findSpell(id: string): Spell | undefined {
  if (!isHomebrewId(id)) return SPELLS.find((s) => s.id === id)
  const h = approvedSpells().find((x) => x.id === id)
  return h ? toSpell(h) : undefined
}

/** Homebrew spells the DM granted to this character (usable even off their class list). */
export const grantedSpells = (ch: Pick<Character, 'id'>): Spell[] =>
  approvedSpells().filter((h) => h.grantedTo.includes(ch.id)).map(toSpell)

/** Approved homebrew abilities this character has. */
export const characterAbilities = (ch: Pick<Character, 'id'>): HomebrewAbility[] =>
  getHomebrew().filter((h): h is HomebrewAbility => h.kind === 'ability' && h.grantedTo.includes(ch.id))

// ---- editor helpers

const EXPR_TOKEN = /^(level|prof|str|dex|con|int|wis|cha|max|min)$/i

/** A uses expression the sheet can compute: numbers, level, prof, ability names, + - *, max(), min(). */
export function validUsesExpr(expr: string): boolean {
  const s = expr.trim()
  if (!s || !/^[\w\s+\-*(),]+$/.test(s)) return false
  if ((s.match(/[a-z]+/gi) ?? []).some((w) => !EXPR_TOKEN.test(w))) return false
  // No dangling or doubled operators ("3 +", "level**2", "max(,1)").
  const c = s.replace(/\s+/g, '')
  if (/^[+*,)]|[+\-*,(]$|[+\-*,(][+*,)]|\(\)/.test(c)) return false
  let depth = 0
  for (const c of s) { depth += c === '(' ? 1 : c === ')' ? -1 : 0; if (depth < 0) return false }
  return depth === 0
}

/** Uses at a given level and scores (shown as a preview in the editor). */
export const usesPreview = (expr: string, ch: Pick<Character, 'level' | 'abilities' | 'classId'>) => evalExpr(expr.toLowerCase(), ch)

/** Dice like "1d8+wis", "2d6 + prof + 1": dice, numbers and ability / prof / level names. */
export function validDice(expr: string): boolean {
  const s = expr.replace(/\s+/g, '').toLowerCase()
  if (!/\d*d\d+/.test(s)) return false
  return /^[+-]?(\d*d\d+|\d+|level|prof|str|dex|con|int|wis|cha)([+-](\d*d\d+|\d+|level|prof|str|dex|con|int|wis|cha))*$/.test(s)
}

/**
 * Resolve the names in a dice expression for this character: "1d8+wis" → "1d8+3", with a labelled breakdown
 * for the dice card.
 */
export function resolveDice(expr: string, ch: Pick<Character, 'level' | 'abilities'>, lang: 'en' | 'he') {
  const parts: { label: string; value: number }[] = []
  const out = expr.replace(/\s+/g, '').toLowerCase().replace(/([+-]?)(level|prof|str|dex|con|int|wis|cha)\b/g, (_, sign: string, name: string) => {
    const v = (sign === '-' ? -1 : 1) * (
      name === 'level' ? ch.level : name === 'prof' ? profBonus(ch.level) : mod(ch.abilities[name as Ability])
    )
    const label = name === 'level' ? (lang === 'he' ? 'דרגה' : 'Level') : name === 'prof' ? (lang === 'he' ? 'מיומנות' : 'Proficiency')
      : ABILITY_NAMES[name as Ability][lang]
    parts.push({ label, value: v })
    return v >= 0 ? `+${v}` : `${v}`
  })
  return { expr: out.replace(/^\+/, ''), parts }
}

/** Missing required fields, as string keys for the editor. */
export function homebrewProblems(h: Partial<Homebrew> & { kind: Homebrew['kind'] }): string[] {
  const out: string[] = []
  if (!h.name?.trim()) out.push('name')
  if (h.kind === 'spell') {
    const s = h as Partial<HomebrewSpell>
    if (s.level === undefined || s.level < 0 || s.level > 9) out.push('level')
    if (!s.classes?.length) out.push('classes')
  } else {
    const a = h as Partial<HomebrewAbility>
    if (a.uses && !validUsesExpr(a.uses.max)) out.push('uses')
    if (a.dice && !validDice(a.dice)) out.push('dice')
  }
  return out
}

export const newHomebrewId = () => `hb-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
