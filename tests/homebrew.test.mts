// Homebrew spells and abilities: library → spell lists, resources, rests. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { characterResources } from '../src/lib/classFeatures'
import {
  allSpells, characterAbilities, findSpell, grantedSpells, homebrewProblems, resolveDice, validDice, validUsesExpr,
} from '../src/lib/homebrew'
import { setHomebrew } from '../src/lib/homebrewRegistry'
import { longRestChanges, shortRestChanges, shortRestPatch } from '../src/lib/rest'
import { canUseSpell, classSpellList } from '../src/lib/spellAccess'
import type { Character, HomebrewAbility, HomebrewSpell } from '../src/lib/types'

const meta = { campaignId: 'c1', createdBy: 'dm', createdByName: 'Dana', createdAt: 1, desc: '', grantedTo: [] as string[] }
const spell = (p: Partial<HomebrewSpell> = {}): HomebrewSpell => ({
  ...meta, id: 'hb-frost', kind: 'spell', status: 'approved', name: "Rimewind's Bite", level: 2, school: 'evocation',
  castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', concentration: false, ritual: false,
  classes: ['wizard', 'sorcerer'], ...p,
})
const ability = (p: Partial<HomebrewAbility> = {}): HomebrewAbility => ({
  ...meta, id: 'hb-boon', kind: 'ability', status: 'approved', name: 'Blessing of the Storm', category: 'boon', activation: 'bonus',
  uses: { max: 'prof', recharge: 'short' }, grantedTo: ['ch1'], ...p,
})
const ch = (classId: string, level: number, extra: Partial<Character> = {}) => ({
  id: 'ch1', classId, subclass: '', level, race: 'human', subrace: '', hpMax: 30, hpCurrent: 30, hpTemp: 0, hitDiceUsed: 0,
  deathSaves: { successes: 0, failures: 0 }, slotsExpended: Array(9).fill(0), resources: {}, spells: [], feats: [],
  abilities: { str: 10, dex: 10, con: 12, int: 16, wis: 14, cha: 10 }, ...extra,
} as unknown as Character)

afterEach(() => setHomebrew([]))

test('approved homebrew spells join the class lists they name; pending ones do not', () => {
  setHomebrew([spell(), spell({ id: 'hb-pending', name: 'Not Yet', status: 'pending' })])
  assert.ok(allSpells().some((s) => s.id === 'hb-frost' && s.source === 'HB'))
  assert.ok(!allSpells().some((s) => s.id === 'hb-pending'))
  assert.ok(classSpellList('wizard', '', true).some((s) => s.id === 'hb-frost'))
  assert.ok(classSpellList('wizard', '', false).some((s) => s.id === 'hb-frost'), 'shown even with PHB only')
  assert.ok(!classSpellList('cleric', '', true).some((s) => s.id === 'hb-frost'))
  const s = findSpell('hb-frost')!
  assert.equal(s.level, 2)
  assert.ok(canUseSpell('wizard', '', 3, s), 'level 3 wizard casts 2nd level')
  assert.ok(!canUseSpell('wizard', '', 2, s), 'locked like any 2nd-level spell')
  assert.equal(findSpell('fireball')?.name, 'Fireball', 'book spells still found')
})

test('a spell granted to a character works off their class list', () => {
  setHomebrew([spell({ classes: ['wizard'], grantedTo: ['ch1'] })])
  assert.deepEqual(grantedSpells(ch('fighter', 5)).map((s) => s.id), ['hb-frost'])
  assert.deepEqual(grantedSpells(ch('fighter', 5, { id: 'other' } as Partial<Character>)), [])
})

test('ability uses become a resource: bubbles on the sheet, refilled by rests', () => {
  setHomebrew([ability()])
  const c = ch('fighter', 5, { resources: { 'hb-boon': 2 } })
  assert.equal(characterAbilities(c).length, 1)
  const r = characterResources(c).find((x) => x.key === 'hb-boon')!
  assert.equal(r.total, 3, 'prof bonus at level 5')
  assert.equal(r.used, 2)
  assert.equal(r.origin, 'homebrew')
  assert.ok(shortRestChanges(c, 'en').some((x) => x.key === 'hb-boon' && !x.full))
  assert.equal(shortRestPatch(c, { hitDiceSpent: 0, healing: 0 }).resources?.['hb-boon'], undefined)
  // long-rest ability waits
  setHomebrew([ability({ uses: { max: 'level*5', recharge: 'long' } })])
  const r2 = characterResources(c).find((x) => x.key === 'hb-boon')!
  assert.equal(r2.total, 25)
  assert.ok(!shortRestChanges(c, 'en').some((x) => x.key === 'hb-boon'))
  assert.ok(longRestChanges(c, 'en').some((x) => x.key === 'hb-boon'))
})

test('abilities only reach characters they are granted to, and only when approved', () => {
  setHomebrew([ability({ grantedTo: ['someone-else'] })])
  assert.equal(characterResources(ch('fighter', 5)).some((x) => x.key === 'hb-boon'), false)
  setHomebrew([ability({ status: 'pending' })])
  assert.equal(characterAbilities(ch('fighter', 5)).length, 0)
})

test('uses formulas and dice are validated', () => {
  for (const ok of ['3', 'prof', 'wis', 'level*5', 'max(1,cha)', 'WIS + 1']) assert.ok(validUsesExpr(ok), ok)
  for (const bad of ['', 'foo', '3 +', 'max(1,cha', 'alert("x")', 'level / 2']) assert.ok(!validUsesExpr(bad), bad)
  for (const ok of ['1d8+wis', '2d6 + prof + 1', 'd20', '3d10', '1d6-str']) assert.ok(validDice(ok), ok)
  for (const bad of ['', 'wis', '1d8+foo', '1d8++2', '5']) assert.ok(!validDice(bad), bad)
})

test('dice names resolve to the character\'s numbers with a breakdown', () => {
  const r = resolveDice('1d8+WIS+prof', ch('cleric', 5), 'en')
  assert.equal(r.expr, '1d8+2+3')
  assert.deepEqual(r.parts, [{ label: 'Wisdom', value: 2 }, { label: 'Proficiency', value: 3 }])
  assert.equal(resolveDice('2d6-str', ch('fighter', 1, { abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }), 'en').expr, '2d6+1')
})

test('editor problems', () => {
  assert.deepEqual(homebrewProblems({ kind: 'spell', name: ' ', level: 1, classes: [] }), ['name', 'classes'])
  assert.deepEqual(homebrewProblems({ kind: 'ability', name: 'X', uses: { max: 'oops', recharge: 'long' }, dice: '1d8+wis' }), ['uses'])
  assert.deepEqual(homebrewProblems(spell()), [])
})
