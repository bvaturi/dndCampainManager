// Dice engine tests. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { d20Test, parseExpr, rollDie, rollExpr } from '../src/lib/dice'

test('parses dice expressions and ignores trailing damage types', () => {
  assert.deepEqual(parseExpr('2d6+3'), { dice: [{ count: 2, sides: 6, negative: false }], flat: 3 })
  assert.deepEqual(parseExpr('1d4+3 pierc.'), { dice: [{ count: 1, sides: 4, negative: false }], flat: 3 })
  assert.deepEqual(parseExpr('d20 - 1'), { dice: [{ count: 1, sides: 20, negative: false }], flat: -1 })
  assert.deepEqual(parseExpr('1d8 + 2d6 - 1'), { dice: [{ count: 1, sides: 8, negative: false }, { count: 2, sides: 6, negative: false }], flat: -1 })
  assert.equal(parseExpr('5'), null)
  assert.equal(parseExpr('slashing'), null)
  assert.equal(parseExpr(''), null)
})

test('d20 test adds every labelled part and flags naturals', () => {
  for (let i = 0; i < 200; i++) {
    const r = d20Test({ title: 'Stealth', kind: 'check', parts: [{ label: 'Dexterity', value: 3 }, { label: 'Proficiency', value: 2 }, { label: 'Zero', value: 0 }] })
    const nat = r.dice[0].rolls[0]
    assert.equal(r.total, nat + 5)
    assert.equal(r.parts.length, 2, 'zero-value parts are hidden')
    assert.equal(r.natural, nat === 20 ? 'crit' : nat === 1 ? 'fumble' : undefined)
  }
})

test('advantage keeps the higher d20, disadvantage the lower', () => {
  for (let i = 0; i < 200; i++) {
    const adv = d20Test({ title: 'x', kind: 'check', parts: [], mode: 'advantage' })
    assert.equal(adv.dice[0].rolls.length, 2)
    assert.equal(adv.total, Math.max(...adv.dice[0].rolls))
    const dis = d20Test({ title: 'x', kind: 'check', parts: [], mode: 'disadvantage' })
    assert.equal(dis.total, Math.min(...dis.dice[0].rolls))
  }
})

test('damage rolls use the labelled breakdown when it matches, and crits double the dice', () => {
  const r = rollExpr('1d8+3 slash.', { title: 'Longsword', parts: [{ label: 'Strength', value: 3 }] })!
  assert.deepEqual(r.parts, [{ label: 'Strength', value: 3 }])
  assert.equal(r.total, r.dice[0].rolls[0] + 3)
  const mismatch = rollExpr('1d8+4', { title: 'x', parts: [{ label: 'Strength', value: 3 }], flatLabel: 'Modifier' })!
  assert.deepEqual(mismatch.parts, [{ label: 'Modifier', value: 4 }])
  const crit = rollExpr('2d6+1', { title: 'x', crit: true })!
  assert.equal(crit.dice[0].rolls.length, 4)
  assert.equal(crit.total, crit.dice[0].rolls.reduce((a, b) => a + b, 0) + 1)
})

test('every face of a die comes up, and nothing outside it', () => {
  const seen = new Map<number, number>()
  for (let i = 0; i < 20000; i++) {
    const v = rollDie(20)
    seen.set(v, (seen.get(v) || 0) + 1)
  }
  assert.deepEqual([...seen.keys()].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1))
  for (const n of seen.values()) assert.ok(n > 800 && n < 1200, `face count ${n} is far from 1000`)
})
