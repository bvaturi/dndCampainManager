// Short and long rests: hit dice, recharges, Arcane Recovery, Song of Rest. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hitDice, hitDieHealing, longRestChanges, longRestOnly, longRestPatch, recoveryValid, shortRestChanges, shortRestPatch,
  slotRecovery, songOfRestDie,
} from '../src/lib/rest'
import type { Character } from '../src/lib/types'

const ch = (classId: string, level: number, extra: Partial<Character> = {}) => ({
  classId, subclass: '', level, race: 'human', subrace: '', hpMax: 40, hpCurrent: 40, hpTemp: 0, hitDiceUsed: 0,
  deathSaves: { successes: 0, failures: 0 }, slotsExpended: Array(9).fill(0), resources: {}, spells: [], feats: [],
  abilities: { str: 10, dex: 10, con: 14, int: 16, wis: 16, cha: 16 }, ...extra,
} as unknown as Character)

test('hit dice: die from the class, one per level, minus those spent', () => {
  assert.deepEqual(hitDice(ch('fighter', 5, { hitDiceUsed: 2 })), { die: 10, total: 5, left: 3 })
  assert.equal(hitDice(ch('wizard', 3)).die, 6)
})

test('a hit die heals roll + Con (never below 0); Durable sets a minimum of 2 × Con', () => {
  assert.equal(hitDieHealing(ch('fighter', 1), 4), 6)
  assert.equal(hitDieHealing(ch('fighter', 1, { abilities: { str: 10, dex: 10, con: 6, int: 10, wis: 10, cha: 10 } }), 1), 0)
  const durable = ch('fighter', 1, { feats: [{ featId: 'durable' }] } as Partial<Character>)
  assert.equal(hitDieHealing(durable, 1), 4)
  assert.equal(hitDieHealing(durable, 8), 10)
})

test('fighter short rest lists Second Wind and Action Surge; long-rest features wait', () => {
  const f = ch('fighter', 9, { resources: { 'second-wind': 1, 'action-surge': 1, indomitable: 1 } })
  const short = shortRestChanges(f, 'en')
  assert.ok(short.some((c) => /second wind/i.test(c.label) && !c.full), 'second wind recharges')
  assert.ok(short.some((c) => /action surge/i.test(c.label) && !c.full), 'action surge recharges')
  assert.ok(!short.some((c) => /indomitable/i.test(c.label)), 'indomitable is a long-rest feature')
  assert.ok(longRestOnly(f, 'en').some((c) => /indomitable/i.test(c.label)))
  const after = { ...f, ...shortRestPatch(f, { hitDiceSpent: 0, healing: 0 }) }
  assert.equal(after.resources?.['second-wind'] ?? 0, 0)
  assert.equal(after.resources?.indomitable, 1)
})

test('warlock pact slots come back on a short rest', () => {
  const w = ch('warlock', 5, { slotsExpended: [0, 0, 2, 0, 0, 0, 0, 0, 0] })
  const pact = shortRestChanges(w, 'en').filter((c) => c.kind === 'pact')
  assert.deepEqual(pact.map((c) => [c.key, c.from, c.to]), [['3', '0/2', '2/2']])
  assert.deepEqual(shortRestPatch(w, { hitDiceSpent: 0, healing: 0 }).slotsExpended?.slice(0, 3), [0, 0, 0])
})

test('spending hit dice: HP capped at max, dice marked spent, never more than are left', () => {
  const f = ch('fighter', 4, { hpCurrent: 10, hpMax: 40, hitDiceUsed: 1 })
  const p = shortRestPatch(f, { hitDiceSpent: 2, healing: 15 })
  assert.equal(p.hpCurrent, 25)
  assert.equal(p.hitDiceUsed, 3)
  assert.equal(shortRestPatch(f, { hitDiceSpent: 2, healing: 99 }).hpCurrent, 40)
  assert.equal(shortRestPatch(f, { hitDiceSpent: 9, healing: 1 }).hitDiceUsed, 4)
  // from 0 HP: healing ends dying
  const down = ch('fighter', 4, { hpCurrent: 0, hitDiceUsed: 0, deathSaves: { successes: 1, failures: 2 } })
  assert.deepEqual(shortRestPatch(down, { hitDiceSpent: 1, healing: 5 }).deathSaves, { successes: 0, failures: 0 })
})

test('Arcane Recovery: half the wizard level rounded up, no 6th+ slots, once per day', () => {
  const w = ch('wizard', 5, { slotsExpended: [2, 1, 1, 0, 0, 0, 0, 0, 0] })
  const r = slotRecovery(w)!
  assert.equal(r.budget, 3)
  assert.ok(r.available)
  assert.ok(recoveryValid(w, { 3: 1 }, r.budget))
  assert.ok(recoveryValid(w, { 1: 1, 2: 1 }, r.budget))
  assert.ok(!recoveryValid(w, { 2: 1, 3: 1 }, r.budget), 'over budget')
  assert.ok(!recoveryValid(w, { 2: 2 }, r.budget), 'more than expended')
  const after = { ...w, ...shortRestPatch(w, { hitDiceSpent: 0, healing: 0, recovery: { key: r.key, picks: { 1: 1, 2: 1 } } }) }
  assert.deepEqual(after.slotsExpended.slice(0, 3), [1, 0, 1])
  assert.equal(after.resources?.['arcane-recovery'], 1)
  assert.equal(slotRecovery(after)!.available, false)
  assert.equal(slotRecovery({ ...after, ...longRestPatch(after) })!.available, true, 'a long rest restores it')
  assert.equal(slotRecovery(ch('druid', 4)), null, 'only Circle of the Land druids')
  assert.equal(slotRecovery(ch('druid', 4, { subclass: 'land' }))!.key, 'natural-recovery')
})

test('Song of Rest die grows with bard level', () => {
  assert.equal(songOfRestDie(ch('bard', 1)), null)
  assert.equal(songOfRestDie(ch('bard', 2)), 6)
  assert.equal(songOfRestDie(ch('bard', 9)), 8)
  assert.equal(songOfRestDie(ch('bard', 13)), 10)
  assert.equal(songOfRestDie(ch('bard', 17)), 12)
  assert.equal(songOfRestDie(ch('fighter', 17)), null)
})

test('long rest: HP, half the hit dice, slots, features, death saves', () => {
  const c = ch('cleric', 6, {
    hpCurrent: 12, hpMax: 45, hpTemp: 5, hitDiceUsed: 5, slotsExpended: [3, 1, 0, 0, 0, 0, 0, 0, 0],
    resources: { 'channel-divinity': 2 }, deathSaves: { successes: 1, failures: 0 },
  })
  const kinds = longRestChanges(c, 'en').map((x) => x.kind)
  for (const k of ['hp', 'temp', 'hd', 'slots', 'resource', 'death']) assert.ok(kinds.includes(k as never), k)
  assert.equal(longRestChanges(c, 'en').find((x) => x.kind === 'hd')!.to, '4/6', '3 of 6 back')
  const after = { ...c, ...longRestPatch(c) }
  assert.equal(after.hpCurrent, 45)
  assert.equal(after.hitDiceUsed, 2)
  assert.deepEqual(longRestChanges(after, 'en').map((x) => x.kind), ['hd'], 'only spent hit dice remain')
})
