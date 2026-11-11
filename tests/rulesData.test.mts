// The rules data (2014 PHB + SRD): class tables, subclass spells and the spell list stay valid.
// Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import he from '../src/data/he.json'
import { CLASSES, SCHOOLS, SPELLS } from '../src/lib/rules'
import { canUseSpell, classSpellList, subclassSpells } from '../src/lib/spellAccess'

const FULL = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]]
const pad = (a: number[]) => [...a, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 9)

test('class tables: 20 levels, proficiency bonus, full-caster slots', () => {
  assert.equal(CLASSES.length, 12)
  for (const c of CLASSES) {
    assert.deepEqual(c.progression.map((r) => r.level), Array.from({ length: 20 }, (_, i) => i + 1), c.id)
    for (const r of c.progression) assert.equal(r.prof, 2 + Math.floor((r.level - 1) / 4), `${c.id} ${r.level}`)
    if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(c.id)) {
      c.progression.forEach((r, i) => assert.deepEqual(r.slots, pad(FULL[i]), `${c.id} ${r.level} slots`))
    }
    for (const s of c.subclasses) assert.ok(s.features.length > 0, `${c.id}/${s.id} has features`)
  }
})

test('every subclass spell names a real spell', () => {
  for (const c of CLASSES) {
    for (const s of c.subclasses) {
      if (!s.spells) continue
      const named = Object.values(s.spells).flat().length
      const got = c.id === 'warlock' ? subclassSpells(c.id, s.id, 20).expanded : subclassSpells(c.id, s.id, 20).always
      assert.equal(new Set(got.map((x) => x.id)).size, new Set(Object.values(s.spells).flat()).size, `${c.id}/${s.id}: ${named} named`)
    }
  }
})

test('spells: valid level, school, classes, timing and a Hebrew name', () => {
  const ids = new Set<string>()
  const classIds = new Set(CLASSES.map((c) => c.id))
  for (const s of SPELLS) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`)
    ids.add(s.id)
    assert.ok(s.level >= 0 && s.level <= 9, s.id)
    assert.ok(SCHOOLS.includes(s.school), `${s.id} school ${s.school}`)
    assert.ok(s.classes.some((c) => classIds.has(c)), `${s.id} has a class`)
    assert.ok(s.castingTime && s.range && s.duration, `${s.id} casting time / range / duration`)
    assert.ok(s.components.split(',').every((x) => ['V', 'S', 'M'].includes(x.trim())), `${s.id} components`)
    assert.ok((he.spells as Record<string, string>)[s.id], `${s.id} Hebrew name`)
  }
})

test('domain spells are always prepared by class level, even off the cleric list (Tempest)', () => {
  const at1 = subclassSpells('cleric', 'tempest', 1).always.map((s) => s.id)
  assert.deepEqual(at1.sort(), ['fog-cloud', 'thunderwave'])
  assert.equal(subclassSpells('cleric', 'tempest', 5).always.length, 6)
  assert.ok(!classSpellList('cleric', 'tempest').some((s) => s.id === 'thunderwave'), 'Thunderwave is not a cleric spell')
})

test("a warlock patron's expanded spells join the warlock's list", () => {
  const fireball = SPELLS.find((s) => s.id === 'fireball')!
  assert.ok(classSpellList('warlock', 'fiend').some((s) => s.id === 'fireball'))
  assert.ok(canUseSpell('warlock', 'fiend', 5, fireball))
  assert.ok(!canUseSpell('warlock', 'archfey', 5, fireball))
})
