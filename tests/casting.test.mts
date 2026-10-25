// Casting from slots, pact magic, arcanum, rituals. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { castOptions, castPatch, defaultOption, uncastPatch } from '../src/lib/casting'
import { SPELLS } from '../src/lib/rules'
import type { Character } from '../src/lib/types'

const sp = (id: string) => SPELLS.find((s) => s.id === id)!
const ch = (classId: string, level: number, slotsExpended = Array(9).fill(0), resources = {}) =>
  ({ classId, subclass: '', level, slotsExpended, resources, spells: [], abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 16, cha: 16 } } as unknown as Character)

test('a 1st-level spell can use any slot of its level or higher (upcasting)', () => {
  const opts = castOptions(ch('cleric', 5, [3, 0, 0, 0, 0, 0, 0, 0, 0]), sp('cure-wounds'))
  assert.deepEqual(opts.filter((o) => o.kind === 'slot').map((o) => [o.level, (o as { left: number }).left]), [[1, 1], [2, 3], [3, 2]])
  const d = defaultOption(opts)!
  assert.equal(d.kind === 'slot' && d.level, 1, 'defaults to the lowest slot with uses left')
})

test('casting spends one slot, undo gives it back, never past the total', () => {
  const c = ch('wizard', 3)
  const opt = castOptions(c, sp('magic-missile')).find((o) => o.kind === 'slot' && o.level === 2)!
  const after = { ...c, ...castPatch(c, opt) }
  assert.deepEqual(after.slotsExpended.slice(0, 2), [0, 1])
  assert.deepEqual({ ...after, ...uncastPatch(after, opt) }.slotsExpended.slice(0, 2), [0, 0])
  const full = ch('wizard', 1, [2, 0, 0, 0, 0, 0, 0, 0, 0])
  const o = castOptions(full, sp('magic-missile'))[0]
  assert.equal(o.kind === 'slot' && o.left, 0)
  assert.equal(defaultOption(castOptions(full, sp('magic-missile'))), undefined, 'no ritual for magic missile, no slots left')
})

test('cantrips need no slot; rituals can be cast without one by ritual casters', () => {
  assert.deepEqual(castOptions(ch('wizard', 1), sp('fire-bolt')), [{ kind: 'cantrip' }])
  assert.ok(castOptions(ch('wizard', 1), sp('detect-magic')).some((o) => o.kind === 'ritual'))
  assert.ok(!castOptions(ch('sorcerer', 1), sp('detect-magic')).some((o) => o.kind === 'ritual'), 'sorcerers cannot ritual-cast')
})

test('warlocks cast with their pact slot level, and 6th-9th through Mystic Arcanum', () => {
  const opts = castOptions(ch('warlock', 5), sp('hex'))
  assert.deepEqual(opts.map((o) => (o.kind === 'slot' ? o.level : o.kind)), [3], 'hex is cast with the 3rd-level pact slot')
  const arc = castOptions(ch('warlock', 11), sp('eyebite'))
  assert.ok(arc.some((o) => o.kind === 'arcanum' && o.level === 6 && o.left === 1))
  const c = ch('warlock', 11)
  const used = { ...c, ...castPatch(c, arc.find((o) => o.kind === 'arcanum')!) }
  assert.equal(castOptions(used, sp('eyebite')).find((o) => o.kind === 'arcanum')!.kind === 'arcanum' && (castOptions(used, sp('eyebite')).find((o) => o.kind === 'arcanum') as { left: number }).left, 0)
})

test('cantrip damage scales with character level; attack-roll spells are detected', async () => {
  const { spellDice, needsAttackRoll } = await import('../src/lib/casting')
  assert.deepEqual(spellDice(sp('fire-bolt'), 1), ['1d10'])
  assert.deepEqual(spellDice(sp('fire-bolt'), 5), ['2d10'])
  assert.deepEqual(spellDice(sp('fire-bolt'), 17), ['4d10'])
  assert.deepEqual(spellDice(sp('fireball'), 5), ['8d6'])
  assert.equal(needsAttackRoll(sp('fire-bolt')), true)
  assert.equal(needsAttackRoll(sp('fireball')), false)
})
