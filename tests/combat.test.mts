// Combat manager rules. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyHp, enemyStatus, initiativeOrder, stepTurn } from '../src/lib/combat'
import type { Combatant } from '../src/lib/types'

const c = (id: string, initiative: number | null, extra: Partial<Combatant> = {}): Combatant =>
  ({ id, kind: 'pc', name: id, initiative, dexMod: 0, hidden: false, conditions: [], createdAt: 0, ...extra })

test('initiative order: highest first, ties by Dex, players before enemies, unrolled last', () => {
  const list = [c('slow', 5), c('none', null), c('goblin', 15, { kind: 'enemy', dexMod: 2 }), c('lia', 15, { dexMod: 2 }), c('nimble', 15, { dexMod: 4 }), c('fast', 20)]
  assert.deepEqual(initiativeOrder(list).map((x) => x.id), ['fast', 'nimble', 'lia', 'goblin', 'slow', 'none'])
})

test('turns advance, wrap into a new round, skip the unrolled and downed enemies, and go back', () => {
  const list = [c('a', 20), c('b', 15, { kind: 'enemy', status: 'down' }), c('d', 10), c('x', null)]
  assert.deepEqual(stepTurn(list, null, 1, 1), { turnId: 'a', round: 1 })
  assert.deepEqual(stepTurn(list, 'a', 1, 1), { turnId: 'd', round: 1 }, 'skips the downed enemy')
  assert.deepEqual(stepTurn(list, 'd', 1, 1), { turnId: 'a', round: 2 }, 'wraps to a new round')
  assert.deepEqual(stepTurn(list, 'a', 2, -1), { turnId: 'd', round: 1 }, 'back across the round boundary')
  assert.deepEqual(stepTurn([], null, 1, 1), { turnId: null, round: 1 })
})

test('damage hits temporary HP first, healing caps at max, HP never below 0', () => {
  assert.deepEqual(applyHp({ hp: 20, temp: 5, max: 30 }, 8, 'damage'), { hp: 17, temp: 0 })
  assert.deepEqual(applyHp({ hp: 20, temp: 5, max: 30 }, 3, 'damage'), { hp: 20, temp: 2 })
  assert.deepEqual(applyHp({ hp: 4, temp: 0, max: 30 }, 50, 'damage'), { hp: 0, temp: 0 })
  assert.deepEqual(applyHp({ hp: 25, temp: 0, max: 30 }, 10, 'heal'), { hp: 30, temp: 0 })
})

test('enemy status for players: healthy, bloodied at half, down at 0', () => {
  assert.equal(enemyStatus(7, 7), 'healthy')
  assert.equal(enemyStatus(3, 7), 'bloodied')
  assert.equal(enemyStatus(0, 7), 'down')
})
