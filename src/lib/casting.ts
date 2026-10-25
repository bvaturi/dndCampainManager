/**
 * Casting a spell: which slots it can use (upcasting, warlock pact slots, Mystic Arcanum, rituals, cantrips)
 * and the sheet change that spends them. Pure functions (unit-tested).
 */
import { grantedSpells } from './homebrew'
import { casterInfo, spellSlots } from './spellAccess'
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

export function castOptions(ch: Character, spell: Spell): CastOption[] {
  if (spell.level === 0) return [{ kind: 'cantrip' }]
  const out: CastOption[] = []
  const slots = spellSlots(ch.classId, ch.subclass, ch.level)
  slots.forEach((total, i) => {
    const level = i + 1
    if (total > 0 && level >= spell.level) {
      out.push({ kind: 'slot', level, total, left: Math.max(0, total - (ch.slotsExpended[i] ?? 0)) })
    }
  })
  // Warlock 6th-9th level spells use Mystic Arcanum (once per long rest each), not slots.
  if (ch.classId === 'warlock' && spell.level >= 6) {
    const key = `mystic-arcanum-${spell.level}`
    out.push({ kind: 'arcanum', level: spell.level, key, left: Math.max(0, 1 - (ch.resources?.[key] ?? 0)) })
  }
  const info = casterInfo(ch.classId, ch.subclass)
  if (spell.ritual && info && !info.third && RITUAL_CASTERS.has(ch.classId)) out.push({ kind: 'ritual' })
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

/** Whether the spell asks for a spell attack roll. */
export const needsAttackRoll = (spell: Spell) => /\b(ranged|melee) spell attack\b/i.test(spell.desc || '')

/** Lowest slot level with uses left — the default choice. */
export function defaultOption(opts: CastOption[]): CastOption | undefined {
  return opts.find((o) => o.kind === 'cantrip')
    ?? opts.find((o) => (o.kind === 'slot' || o.kind === 'arcanum') && o.left > 0)
    ?? opts.find((o) => o.kind === 'ritual')
    ?? opts.find((o) => o.kind === 'granted')
}
