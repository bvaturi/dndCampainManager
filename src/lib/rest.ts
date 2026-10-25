/**
 * Short and long rests (2014 PHB): hit dice, slot recovery (Arcane / Natural Recovery), Song of Rest, and the
 * exact list of what each rest refills for this character. Pure functions (unit-tested).
 */
import { characterResources, rechargeAt, restPatch } from './classFeatures'
import { classById, mod } from './rules'
import { spellSlots } from './spellAccess'
import type { Character } from './types'

export function hitDice(ch: Character) {
  const die = classById(ch.classId)?.hitDie ?? 8
  return { die, total: ch.level, left: Math.max(0, ch.level - ch.hitDiceUsed) }
}

/** HP regained from one hit die roll: roll + Con modifier (never below 0; Durable raises the minimum to 2 × Con mod). */
export function hitDieHealing(ch: Character, roll: number): number {
  const con = mod(ch.abilities.con)
  let heal = Math.max(0, roll + con)
  if ((ch.feats ?? []).some((f) => f.featId === 'durable')) heal = Math.max(heal, 2 * Math.max(1, con))
  return heal
}

/** Bard's Song of Rest die (2nd: d6, 9th: d8, 13th: d10, 17th: d12); null when the character doesn't have it. */
export function songOfRestDie(ch: Character): number | null {
  if (ch.classId !== 'bard' || ch.level < 2) return null
  return ch.level >= 17 ? 12 : ch.level >= 13 ? 10 : ch.level >= 9 ? 8 : 6
}

export interface SlotRecovery { key: string; feature: string; budget: number; available: boolean }

/**
 * Wizard Arcane Recovery / druid (Circle of the Land) Natural Recovery: once per day after a short rest, recover
 * expended slots with combined level up to half your class level (rounded up), none 6th level or higher.
 */
export function slotRecovery(ch: Character): SlotRecovery | null {
  const budget = Math.ceil(ch.level / 2)
  const available = (key: string) => (ch.resources?.[key] ?? 0) < 1
  if (ch.classId === 'wizard') return { key: 'arcane-recovery', feature: 'Arcane Recovery', budget, available: available('arcane-recovery') }
  if (ch.classId === 'druid' && ch.subclass === 'land' && ch.level >= 2) {
    return { key: 'natural-recovery', feature: 'Natural Recovery', budget, available: available('natural-recovery') }
  }
  return null
}

/** Combined level of a recovery pick ({slotLevel: count}). */
export const recoveryCost = (picks: Record<number, number>) =>
  Object.entries(picks).reduce((a, [lv, n]) => a + +lv * n, 0)

/** Validate a recovery pick against the budget and what's actually expended (6th level and up never). */
export function recoveryValid(ch: Character, picks: Record<number, number>, budget: number): boolean {
  for (const [lv, n] of Object.entries(picks)) {
    const level = +lv
    if (n < 0 || level < 1 || level > 5 || n > (ch.slotsExpended[level - 1] ?? 0)) return false
  }
  return recoveryCost(picks) <= budget
}

export interface RestChange {
  kind: 'resource' | 'pact' | 'hp' | 'temp' | 'hd' | 'slots' | 'death'
  /** Resource key, or the slot level for slots/pact. */
  key: string
  label: string
  from: string
  to: string
  /** Nothing to refill (shown so the player sees the feature is covered). */
  full: boolean
}

const resourceLabel = (r: { label: string; labelHe?: string }, lang: 'en' | 'he') => (lang === 'he' && r.labelHe) || r.label

/** Everything a short rest refills for this character: short-rest features and warlock pact slots. */
export function shortRestChanges(ch: Character, lang: 'en' | 'he'): RestChange[] {
  const out: RestChange[] = []
  for (const r of characterResources(ch)) {
    if (rechargeAt(r, ch.level) !== 'short') continue
    out.push({ kind: 'resource', key: r.key, label: resourceLabel(r, lang), from: `${r.total - r.used}/${r.total}`, to: `${r.total}/${r.total}`, full: r.used === 0 })
  }
  if (ch.classId === 'warlock') {
    spellSlots(ch.classId, ch.subclass, ch.level).forEach((n, i) => {
      if (n <= 0) return
      const used = Math.min(n, ch.slotsExpended[i] ?? 0)
      out.push({ kind: 'pact', key: String(i + 1), label: '', from: `${n - used}/${n}`, to: `${n}/${n}`, full: used === 0 })
    })
  }
  return out
}

/** Used features that a short rest does NOT bring back (they wait for a long rest). */
export function longRestOnly(ch: Character, lang: 'en' | 'he'): RestChange[] {
  return characterResources(ch)
    .filter((r) => rechargeAt(r, ch.level) === 'long' && r.used > 0)
    .map((r) => ({ kind: 'resource' as const, key: r.key, label: resourceLabel(r, lang), from: `${r.total - r.used}/${r.total}`, to: `${r.total}/${r.total}`, full: false }))
}

/** Hit dice a long rest gives back: half your total (at least one), up to what was spent. */
export const longRestHitDice = (ch: Character) => Math.min(ch.hitDiceUsed, Math.max(1, Math.floor(ch.level / 2)))

/** What a long rest restores (only what actually changes). */
export function longRestChanges(ch: Character, lang: 'en' | 'he'): RestChange[] {
  const out: RestChange[] = []
  const add = (c: Omit<RestChange, 'full'>) => out.push({ ...c, full: false })
  if (ch.hpCurrent < ch.hpMax) add({ kind: 'hp', key: 'hp', label: '', from: `${ch.hpCurrent}/${ch.hpMax}`, to: `${ch.hpMax}/${ch.hpMax}` })
  if (ch.hpTemp > 0) add({ kind: 'temp', key: 'temp', label: '', from: String(ch.hpTemp), to: '0' })
  const hd = hitDice(ch)
  const regain = longRestHitDice(ch)
  if (regain > 0) add({ kind: 'hd', key: 'hd', label: '', from: `${hd.left}/${hd.total}`, to: `${hd.left + regain}/${hd.total}` })
  spellSlots(ch.classId, ch.subclass, ch.level).forEach((n, i) => {
    const used = Math.min(n, ch.slotsExpended[i] ?? 0)
    if (n > 0 && used > 0) add({ kind: ch.classId === 'warlock' ? 'pact' : 'slots', key: String(i + 1), label: '', from: `${n - used}/${n}`, to: `${n}/${n}` })
  })
  for (const r of characterResources(ch)) {
    if (r.used > 0) add({ kind: 'resource', key: r.key, label: resourceLabel(r, lang), from: `${r.total - r.used}/${r.total}`, to: `${r.total}/${r.total}` })
  }
  if (ch.deathSaves.successes || ch.deathSaves.failures) {
    add({ kind: 'death', key: 'death', label: '', from: `${ch.deathSaves.successes}✓ ${ch.deathSaves.failures}✗`, to: '0' })
  }
  return out
}

export interface ShortRestPlan {
  /** Hit dice spent during this rest. */
  hitDiceSpent: number
  /** HP regained (hit dice + Song of Rest), before capping at max. */
  healing: number
  /** Arcane / Natural Recovery picks: {slotLevel: count}. */
  recovery?: { key: string; picks: Record<number, number> }
}

/** The whole short rest as one sheet change. */
export function shortRestPatch(ch: Character, plan: ShortRestPlan): Partial<Character> {
  const patch = restPatch(ch, 'short')
  const spent = Math.max(0, Math.min(plan.hitDiceSpent, ch.level - ch.hitDiceUsed))
  if (spent > 0) patch.hitDiceUsed = ch.hitDiceUsed + spent
  if (plan.healing > 0) patch.hpCurrent = Math.min(ch.hpMax, Math.max(0, ch.hpCurrent) + plan.healing)
  // Back on your feet: regaining hit points at 0 ends dying.
  if (plan.healing > 0 && ch.hpCurrent <= 0) patch.deathSaves = { successes: 0, failures: 0 }
  const rec = plan.recovery
  if (rec && recoveryCost(rec.picks) > 0) {
    const slots = [...(patch.slotsExpended ?? ch.slotsExpended)]
    for (const [lv, n] of Object.entries(rec.picks)) slots[+lv - 1] = Math.max(0, (slots[+lv - 1] ?? 0) - n)
    patch.slotsExpended = slots
    patch.resources = { ...(patch.resources ?? {}), [rec.key]: 1 }
  }
  return patch
}

export const longRestPatch = (ch: Character) => restPatch(ch, 'long')
