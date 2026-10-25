// Class data integrity against the PHB audit. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { UNLIMITED, allFeatures, characterResources, evalExpr, resourceTotal, type ClassFeature } from '../src/lib/classFeatures'
import { featSlotLevels } from '../src/lib/feats'
import { CLASSES } from '../src/lib/rules'
import { cantripCount, spellAllowance, spellSlots } from '../src/lib/spellAccess'
import type { Character } from '../src/lib/types'

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/improvement/g, '').replace(/[^a-z0-9]/g, '')
const scores = { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 16 }
const ch = (classId: string, level: number, subclass = '', resources = {}): Character =>
  ({ classId, level, subclass, abilities: scores, resources } as unknown as Character)

for (const cls of CLASSES) {
  test(`${cls.id}: level table, features and subclasses are complete`, () => {
    assert.equal(cls.progression.length, 20)
    assert.deepEqual(cls.progression.map((p) => p.level), Array.from({ length: 20 }, (_, i) => i + 1))
    const subFeats = cls.subclasses.flatMap((s) => s.features)
    for (const row of cls.progression) {
      for (const n of row.features) {
        if (/feature$/i.test(n.trim())) continue
        const k = norm(n)
        const found = [...cls.features, ...subFeats].some((f) => f.level <= row.level && (norm(f.name) === k || k.startsWith(norm(f.name)) || norm(f.name).startsWith(k)))
        assert.ok(found, `${cls.id} L${row.level}: "${n}" has no matching feature`)
      }
    }
    assert.ok(cls.subclasses.length >= 2, 'every class has its PHB subclasses')
    for (const s of cls.subclasses) assert.ok(s.features.length > 0, `${cls.id}/${s.id} has no features`)
    for (const f of [...cls.features, ...subFeats] as ClassFeature[]) {
      assert.ok(f.desc || f.summary, `${cls.id}: "${f.name}" has neither rules text nor a summary`)
    }
  })

  test(`${cls.id}: every limited-use resource works out to a usable number`, () => {
    for (const s of ['', ...cls.subclasses.map((x) => x.id)]) {
      for (const f of allFeatures(cls.id, s)) {
        if (!f.resource) continue
        const total = resourceTotal(f.resource, ch(cls.id, Math.max(f.level, 20), s))
        assert.ok(total > 0, `${cls.id}/${s} "${f.name}" (${f.resource.key}) resolves to ${total} at level 20`)
      }
    }
  })
}

test('paladin: Lay on Hands, Divine Sense and friends', () => {
  const at = (lv: number) => Object.fromEntries(characterResources(ch('paladin', lv)).map((r) => [r.key, r.total]))
  const l1 = at(1)
  const loh = Object.keys(l1).find((k) => k.includes('lay'))!
  assert.equal(l1[loh], 5, 'Lay on Hands pool = 5 x level')
  assert.equal(at(7)[loh], 35)
  const sense = Object.keys(l1).find((k) => k.includes('sense'))!
  assert.equal(l1[sense], 1 + 3, 'Divine Sense = 1 + Cha modifier')
})

test('barbarian rages: 2 at 1st, 6 at 17th, unlimited at 20th', () => {
  const rage = (lv: number) => characterResources(ch('barbarian', lv)).find((r) => r.key.includes('rage'))!.total
  assert.equal(rage(1), 2)
  assert.equal(rage(17), 6)
  assert.equal(rage(20), UNLIMITED)
})

test('monk ki and sorcery points equal class level from 2nd', () => {
  assert.equal(characterResources(ch('monk', 7)).find((r) => r.key.includes('ki'))?.total, 7)
  assert.equal(characterResources(ch('sorcerer', 9)).find((r) => r.key.includes('sorcery'))?.total, 9)
})

test('ASI levels come from the class tables', () => {
  assert.deepEqual(featSlotLevels(ch('fighter', 20)), [4, 6, 8, 12, 14, 16, 19])
  assert.deepEqual(featSlotLevels(ch('rogue', 20)), [4, 8, 10, 12, 16, 19])
  assert.deepEqual(featSlotLevels(ch('wizard', 20)), [4, 8, 12, 16, 19])
})

test('expression evaluator', () => {
  assert.equal(evalExpr('5*level', ch('paladin', 3)), 15)
  assert.equal(evalExpr('max(1,cha)', ch('bard', 1)), 3)
  assert.equal(evalExpr('1+cha', ch('paladin', 1)), 4)
  assert.equal(evalExpr('max(1,min(prof,2))', ch('bard', 9)), 2)
})

test('Eldritch Knight and Arcane Trickster match the book tables', () => {
  for (const [file, classId, sub] of [['fighter', 'fighter', 'eldritch-knight'], ['rogue', 'rogue', 'arcane-trickster']] as const) {
    const audit = JSON.parse(readFileSync(new URL(`../scripts/phb_audit/${file}.json`, import.meta.url), 'utf8'))
    const book = audit.subclasses.find((s: { id: string }) => s.id === sub)?.spellcasting
    assert.ok(book, `${sub} spellcasting table in the audit`)
    for (const row of book.table) {
      assert.equal(cantripCount(classId, sub, row.level), row.cantrips, `${sub} L${row.level} cantrips`)
      assert.equal(spellAllowance(classId, sub, row.level, scores).spells, row.known, `${sub} L${row.level} spells known`)
      assert.deepEqual(spellSlots(classId, sub, row.level).slice(0, 4), row.slots.slice(0, 4), `${sub} L${row.level} slots`)
    }
  }
})

test('racial and feat uses join the class resources', () => {
  const keys = (c: Partial<Character>) => characterResources({ classId: 'fighter', subclass: '', level: 1, abilities: scores, resources: {}, race: '', subrace: '', feats: [], ...c } as Character).map((r) => r.key)
  assert.ok(keys({ race: 'dragonborn' }).includes('breath-weapon'))
  assert.ok(keys({ race: 'half-orc' }).includes('relentless-endurance'))
  assert.ok(!keys({ race: 'tiefling', level: 2 }).includes('hellish-rebuke'), 'Hellish Rebuke from 3rd level')
  assert.ok(keys({ race: 'tiefling', level: 5 }).includes('tiefling-darkness'))
  assert.ok(keys({ race: 'elf', subrace: 'dark-elf', level: 3 }).includes('drow-faerie-fire'))
  const lucky = characterResources({ classId: 'wizard', subclass: '', level: 4, abilities: scores, race: 'human', subrace: '', resources: { 'feat-lucky': 1 },
    feats: [{ uid: 'a', featId: 'lucky', level: 4, notes: '' }] } as unknown as Character).find((r) => r.key === 'feat-lucky')!
  assert.equal(lucky.total, 3)
  assert.equal(lucky.used, 1)
  assert.equal(lucky.origin, 'feat')
})
