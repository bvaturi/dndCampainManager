/**
 * Casting a spell: which slots it can use (upcasting, warlock pact slots, Mystic Arcanum, rituals, cantrips)
 * and the sheet change that spends them. Pure functions (unit-tested).
 */
import { grantedSpells } from './homebrew'
import { casterInfo, spellAllowance, spellSlots, subclassSpells } from './spellAccess'
import type { Spell } from './rules'
import type { Character } from './types'

export type CastOption =
  | { kind: 'cantrip' }
  | { kind: 'slot'; level: number; total: number; left: number }
  | { kind: 'arcanum'; level: number; key: string; left: number }
  | { kind: 'ritual' }
  /** A homebrew spell the DM granted to this character: cast without a slot (the DM rules how often). */
  | { kind: 'granted' }

/** Classes that can cast ritual spells as rituals (2014 PHB: bard, cleric, druid, wizard; warlocks need an invocation). */
const RITUAL_CASTERS = new Set(['bard', 'cleric', 'druid', 'wizard'])
/** Clerics and druids must have the spell prepared to cast it as a ritual; a wizard only needs it in the spellbook. */
const RITUAL_NEEDS_PREPARED = new Set(['cleric', 'druid'])

/** Prepared on the sheet, or always prepared through the subclass (domain / oath spells). */
export function isPrepared(ch: Character, spell: Spell): boolean {
  return (ch.spells.find((s) => s.id === spell.id)?.prepared ?? false)
    || subclassSpells(ch.classId, ch.subclass, ch.level).always.some((s) => s.id === spell.id)
}

/**
 * A cleric, druid, paladin or wizard casts with spell slots only the spells prepared today (PHB); this spell is
 * one of theirs and isn't prepared.
 */
export function needsPreparing(ch: Character, spell: Spell): boolean {
  if (spell.level === 0) return false
  const mode = spellAllowance(ch.classId, ch.subclass, ch.level, ch.abilities).mode
  return (mode === 'prepared' || mode === 'spellbook') && !isPrepared(ch, spell)
}

export function castOptions(ch: Character, spell: Spell): CastOption[] {
  if (spell.level === 0) return [{ kind: 'cantrip' }]
  const out: CastOption[] = []
  const slots = spellSlots(ch.classId, ch.subclass, ch.level)
  const unprepared = needsPreparing(ch, spell)
  slots.forEach((total, i) => {
    const level = i + 1
    if (!unprepared && total > 0 && level >= spell.level) {
      out.push({ kind: 'slot', level, total, left: Math.max(0, total - (ch.slotsExpended[i] ?? 0)) })
    }
  })
  // Warlock 6th-9th level spells use Mystic Arcanum (once per long rest each), not slots.
  if (ch.classId === 'warlock' && spell.level >= 6) {
    const key = `mystic-arcanum-${spell.level}`
    out.push({ kind: 'arcanum', level: spell.level, key, left: Math.max(0, 1 - (ch.resources?.[key] ?? 0)) })
  }
  const info = casterInfo(ch.classId, ch.subclass)
  if (spell.ritual && info && !info.third && RITUAL_CASTERS.has(ch.classId) && (!RITUAL_NEEDS_PREPARED.has(ch.classId) || isPrepared(ch, spell))) {
    out.push({ kind: 'ritual' })
  }
  if (grantedSpells(ch).some((s) => s.id === spell.id)) out.push({ kind: 'granted' })
  return out
}

/** The sheet change for casting with an option (nothing for cantrips and rituals). */
export function castPatch(ch: Character, opt: CastOption): Partial<Character> {
  if (opt.kind === 'slot') {
    const next = [...ch.slotsExpended]
    next[opt.level - 1] = Math.min(opt.total, (next[opt.level - 1] ?? 0) + 1)
    return { slotsExpended: next }
  }
  if (opt.kind === 'arcanum') return { resources: { ...(ch.resources ?? {}), [opt.key]: 1 } }
  return {}
}

/** Undo a cast: give the slot (or arcanum use) back. */
export function uncastPatch(ch: Character, opt: CastOption): Partial<Character> {
  if (opt.kind === 'slot') {
    const next = [...ch.slotsExpended]
    next[opt.level - 1] = Math.max(0, (next[opt.level - 1] ?? 0) - 1)
    return { slotsExpended: next }
  }
  if (opt.kind === 'arcanum') return { resources: { ...(ch.resources ?? {}), [opt.key]: 0 } }
  return {}
}

/**
 * Dice to offer after casting. Cantrips scale at character levels 5/11/17 ("1d10 … (2d10) … (3d10) … (4d10)"),
 * so only the die for the caster's level is shown; leveled spells show the dice their text mentions.
 */
export function spellDice(spell: Spell, characterLevel: number): string[] {
  const all = [...new Set((spell.desc || '').match(/\b\d+d\d+\b/g) || [])]
  if (spell.level === 0 && all.length >= 2) {
    const tier = characterLevel >= 17 ? 3 : characterLevel >= 11 ? 2 : characterLevel >= 5 ? 1 : 0
    const sides = all[0].split('d')[1]
    const scaling = all.filter((d) => d.split('d')[1] === sides)
    if (scaling.length >= 2) return [scaling[Math.min(tier, scaling.length - 1)]]
  }
  return all.slice(0, 3)
}

/**
 * What a slot above the spell's own level adds, worked out from the spell's "At Higher Levels" rule:
 * - dice: more dice (`total` instead of `base` when the base roll is known)
 * - targets / count: more creatures, darts, rays…
 * - flat: a fixed amount (hit points, feet)
 * - rule: the spell has a higher-level rule that can't be reduced to a number (read the text)
 * - none: nothing extra at this slot level
 * - unknown: the app has no rules text for this spell (non-SRD), so it can't tell
 */
export type UpcastEffect =
  | { kind: 'dice'; extra: string; total?: string; base?: string }
  | { kind: 'targets'; n: number }
  | { kind: 'count'; n: number; noun: string }
  | { kind: 'flat'; n: number; unit: string }
  | { kind: 'rule' }
  | { kind: 'none' }
  | { kind: 'unknown' }

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }
const TARGET_NOUN = /^(creatures?|humanoids?|targets?|beasts?|persons?|people)$/

/** The effect of casting `spell` with a slot of `slotLevel`; null when that is the spell's own level (or lower). */
export function upcastEffect(spell: Spell, slotLevel: number): UpcastEffect | null {
  const steps = slotLevel - spell.level
  if (spell.level === 0 || steps <= 0) return null
  const text = (spell.higherLevel || '').toLowerCase()
  if (!text) return spell.desc ? { kind: 'none' } : { kind: 'unknown' }
  // "for each slot level above 1st" or "for every two slot levels above 2nd"
  const perStep = /for (each|every) /.test(text)
  if (!perStep) return { kind: 'rule' }
  const units = /every two/.test(text) ? Math.floor(steps / 2) : steps
  if (units === 0) return { kind: 'none' }

  const dice = /(\d+)d(\d+)/.exec(text)
  if (dice) {
    const [per, sides] = [+dice[1], +dice[2]]
    const extra = `${per * units}d${sides}`
    const base = (spell.desc || '').match(new RegExp(`\\b(\\d+)d${sides}\\b`))
    return base ? { kind: 'dice', extra, base: base[0], total: `${+base[1] + per * units}d${sides}` } : { kind: 'dice', extra }
  }
  const more = /\b(one|two|three|four|five|\d+) (?:additional|more) ([a-z ]+?)(?= for (?:each|every)|,|\.| of | or )/.exec(text)
  if (more) {
    const n = (NUMBER_WORDS[more[1]] ?? +more[1]) * units
    // "one additional bolt leaps from the first target…": keep just the thing that is added
    const words = more[2].trim().split(' ')
    const noun = words.length > 3 ? words[0] : words.join(' ')
    return TARGET_NOUN.test(noun) ? { kind: 'targets', n } : { kind: 'count', n, noun }
  }
  const flat = /increases? by (?:an additional )?(\d+)(?: (feet|foot|hours?|minutes?|days?))?\b/.exec(text)
  if (flat) {
    // "+5" alone says little: name what grows when the rule does ("hit points", "healing", "challenge rating")
    const subject = /(temporary hit points|hit points|healing|challenge rating)[^.]*?increases? by/.exec(text)?.[1]
    const unit = flat[2] ? flat[2].replace(/^foot$/, 'feet').replace(/^(hour|minute|day)$/, '$1s') : subject ?? ''
    return { kind: 'flat', n: +flat[1] * units, unit: unit && ` ${unit}` }
  }
  return { kind: 'rule' }
}

/** Dice to offer after casting with a slot of `slotLevel`: the spell's dice, with the upcast total in place of the base roll. */
export function castDice(spell: Spell, characterLevel: number, slotLevel: number): string[] {
  const dice = spellDice(spell, characterLevel)
  const up = upcastEffect(spell, slotLevel)
  if (up?.kind !== 'dice' || !up.total || !up.base) return dice
  return dice.includes(up.base) ? dice.map((d) => (d === up.base ? up.total! : d)) : [up.total, ...dice].slice(0, 3)
}

/** Whether the spell asks for a spell attack roll. */
export const needsAttackRoll = (spell: Spell) => /\b(ranged|melee) spell attack\b/i.test(spell.desc || '')

/** Lowest slot level with uses left — the default choice. */
export function defaultOption(opts: CastOption[]): CastOption | undefined {
  return opts.find((o) => o.kind === 'cantrip')
    ?? opts.find((o) => (o.kind === 'slot' || o.kind === 'arcanum') && o.left > 0)
    ?? opts.find((o) => o.kind === 'ritual')
    ?? opts.find((o) => o.kind === 'granted')
}
