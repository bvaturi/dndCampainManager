/** Combat helpers: initiative order, turn stepping, HP changes. Pure functions (unit-tested). */
import type { Combatant, EnemyStatus } from './types'

export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
  'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion', 'concentrating',
] as const

/** Highest initiative first; ties go to the higher Dexterity modifier, then players before enemies, then name. Unrolled last. */
export function initiativeOrder(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.name.localeCompare(b.name)
    if (a.initiative === null) return 1
    if (b.initiative === null) return -1
    return b.initiative - a.initiative || b.dexMod - a.dexMod || (a.kind === b.kind ? 0 : a.kind === 'pc' ? -1 : 1) || a.name.localeCompare(b.name)
  })
}

/**
 * Next (or previous) combatant in the order, skipping anyone without initiative and enemies who are down.
 * Wrapping past the end starts a new round.
 */
export function stepTurn(list: Combatant[], turnId: string | null, round: number, dir: 1 | -1): { turnId: string | null; round: number } {
  const order = initiativeOrder(list).filter((c) => c.initiative !== null && !(c.kind === 'enemy' && c.status === 'down'))
  if (!order.length) return { turnId: null, round }
  const idx = order.findIndex((c) => c.id === turnId)
  if (idx < 0) return dir === 1 ? { turnId: order[0].id, round: Math.max(1, round) } : { turnId: order[order.length - 1].id, round }
  const next = idx + dir
  if (next >= order.length) return { turnId: order[0].id, round: round + 1 }
  if (next < 0) return round > 1 ? { turnId: order[order.length - 1].id, round: round - 1 } : { turnId: order[0].id, round }
  return { turnId: order[next].id, round }
}

/** Damage eats temporary HP first; healing can't exceed the maximum. */
export function applyHp(cur: { hp: number; temp: number; max: number }, amount: number, kind: 'damage' | 'heal') {
  if (kind === 'heal') return { hp: Math.min(cur.max, cur.hp + amount), temp: cur.temp }
  const fromTemp = Math.min(cur.temp, amount)
  return { hp: Math.max(0, cur.hp - (amount - fromTemp)), temp: cur.temp - fromTemp }
}

export function enemyStatus(hp: number, hpMax: number): EnemyStatus {
  if (hp <= 0) return 'down'
  if (hp <= hpMax / 2) return 'bloodied'
  return 'healthy'
}
