// Casting from slots, pact magic, arcanum, rituals. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { castOptions, castPatch, defaultOption, uncastPatch } from '../src/lib/casting'
import { SPELLS } from '../src/lib/rules'
import type { Character } from '../src/lib/types'

const sp = (id: string) => SPELLS.find((s) => s.id === id)!
const ch = (classId: string, level: number, slotsExpended = Array(9).fill(0), resources = {}) =>
  ({ classId, subclass: '', level, slotsExpended, resources, spells: ['cure-wounds', 'magic-missile', 'hex', 'eyebite'].map((id) => ({ id, prepared: true })), abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 16, cha: 16 } } as unknown as Character)

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

test('a cleric or druid casts a ritual only when the spell is prepared; a wizard needs it only in the book', () => {
  const base = { level: 3, subclass: '', slotsExpended: [0, 0, 0, 0, 0, 0, 0, 0, 0], abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 16, cha: 10 } }
  const detect = SPELLS.find((s) => s.id === 'detect-magic')!
  const kinds = (ch: unknown) => castOptions(ch as Character, detect).map((o) => o.kind)
  assert.ok(!kinds({ ...base, classId: 'cleric', spells: [{ id: 'detect-magic', prepared: false }] }).includes('ritual'))
  assert.ok(kinds({ ...base, classId: 'cleric', spells: [{ id: 'detect-magic', prepared: true }] }).includes('ritual'))
  assert.ok(!kinds({ ...base, classId: 'druid', spells: [{ id: 'detect-magic', prepared: false }] }).includes('ritual'))
  assert.ok(kinds({ ...base, classId: 'wizard', spells: [{ id: 'detect-magic', prepared: false }] }).includes('ritual'))
})

test('a class that prepares spells casts with slots only what is prepared', () => {
  const base = { level: 3, subclass: 'tempest', slotsExpended: Array(9).fill(0), abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 16, cha: 16 } }
  const kinds = (c: unknown, id: string) => castOptions(c as Character, sp(id)).map((o) => o.kind)
  const cleric = { ...base, classId: 'cleric', spells: [{ id: 'bless', prepared: true }, { id: 'detect-evil-and-good', prepared: false }] }
  assert.deepEqual(kinds(cleric, 'bless'), ['slot', 'slot'])
  assert.deepEqual(kinds(cleric, 'detect-evil-and-good'), [], 'not prepared: nothing to cast it with')
  assert.deepEqual(kinds(cleric, 'thunderwave'), ['slot', 'slot'], 'domain spells are always prepared')
  assert.deepEqual(kinds(cleric, 'guidance'), ['cantrip'])
  const wizard = { ...base, subclass: '', classId: 'wizard', spells: [{ id: 'detect-magic', prepared: false }, { id: 'magic-missile', prepared: false }] }
  assert.deepEqual(kinds(wizard, 'detect-magic'), ['ritual'], 'a wizard still casts a ritual from the spellbook')
  assert.deepEqual(kinds(wizard, 'magic-missile'), [])
  const bard = { ...base, subclass: '', classId: 'bard', spells: [{ id: 'bane', prepared: false }] }
  assert.deepEqual(kinds(bard, 'bane'), ['slot', 'slot'], 'a class that knows its spells has nothing to prepare')
})

test('a higher slot: what it adds is worked out from the spell\'s rule', async () => {
  const { upcastEffect, castDice } = await import('../src/lib/casting')
  assert.equal(upcastEffect(sp('cure-wounds'), 1), null, 'the spell\'s own level is not an upcast')
  assert.deepEqual(upcastEffect(sp('cure-wounds'), 3), { kind: 'dice', extra: '2d8', base: '1d8', total: '3d8' })
  assert.deepEqual(upcastEffect(sp('guiding-bolt'), 2), { kind: 'dice', extra: '1d6', base: '4d6', total: '5d6' })
  assert.deepEqual(upcastEffect(sp('fireball'), 5), { kind: 'dice', extra: '2d6', base: '8d6', total: '10d6' })
  // every two slot levels above 2nd
  assert.deepEqual(upcastEffect(sp('spiritual-weapon'), 3), { kind: 'none' })
  assert.deepEqual(upcastEffect(sp('spiritual-weapon'), 4), { kind: 'dice', extra: '1d8', base: '1d8', total: '2d8' })
  assert.deepEqual(upcastEffect(sp('spiritual-weapon'), 6), { kind: 'dice', extra: '2d8', base: '1d8', total: '3d8' })
  assert.deepEqual(upcastEffect(sp('hold-person'), 4), { kind: 'targets', n: 2 })
  assert.deepEqual(upcastEffect(sp('bless'), 2), { kind: 'targets', n: 1 })
  assert.deepEqual(upcastEffect(sp('magic-missile'), 3), { kind: 'count', n: 2, noun: 'dart' })
  assert.deepEqual(upcastEffect(sp('aid'), 4), { kind: 'flat', n: 10, unit: ' hit points' })
  assert.deepEqual(upcastEffect(sp('heal'), 7), { kind: 'flat', n: 10, unit: ' healing' })
  assert.deepEqual(upcastEffect(sp('fog-cloud'), 2), { kind: 'flat', n: 20, unit: ' feet' })
  assert.deepEqual(upcastEffect(sp('counterspell'), 5), { kind: 'rule' }, 'a rule that is not a number: read the text')
  assert.deepEqual(upcastEffect(sp('detect-magic'), 3), { kind: 'none' }, 'no higher-level rule')
  assert.deepEqual(upcastEffect(sp('chromatic-orb'), 2), { kind: 'unknown' }, 'no rules text in the app')
  assert.deepEqual(upcastEffect(sp('shatter'), 3), { kind: 'dice', extra: '1d8', base: '3d8', total: '4d8' })
  assert.deepEqual(upcastEffect(sp('moonbeam'), 3), { kind: 'dice', extra: '1d10', base: '2d10', total: '3d10' })
  // the dice offered after casting use the stronger total
  assert.deepEqual(castDice(sp('guiding-bolt'), 3, 1), ['4d6'])
  assert.deepEqual(castDice(sp('guiding-bolt'), 3, 2), ['5d6'])
  assert.deepEqual(castDice(sp('cure-wounds'), 3, 2), ['2d8'])
})
