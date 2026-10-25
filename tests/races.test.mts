// Race data: PHB race skills, Goliath (Volo's Guide) and Changeling (Eberron). Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { characterResources } from '../src/lib/classFeatures'
import { raceById, racialBonuses } from '../src/lib/rules'
import type { Character } from '../src/lib/types'

test('PHB races grant their skills', () => {
  assert.deepEqual(raceById('elf')!.skills, ['perception'])
  assert.deepEqual(raceById('half-orc')!.skills, ['intimidation'])
  assert.deepEqual(raceById('half-elf')!.skillChoice, { choose: 2, from: 'any' })
})

test('Goliath: +2 Str +1 Con, Athletics, Stone\'s Endurance once per short rest', () => {
  const r = raceById('goliath')!
  assert.equal(r.source, 'VGM')
  assert.deepEqual(racialBonuses('goliath', '', []), { str: 2, dex: 0, con: 1, int: 0, wis: 0, cha: 0 })
  assert.deepEqual(r.skills, ['athletics'])
  assert.deepEqual(r.languages, ['Common', 'Giant'])
  assert.deepEqual(r.traits.map((t) => t.id), ['natural-athlete', 'stones-endurance', 'powerful-build', 'mountain-born'])
  const res = characterResources({ classId: 'fighter', subclass: '', level: 1, race: 'goliath', subrace: '', resources: {}, feats: [],
    abilities: { str: 17, dex: 10, con: 15, int: 8, wis: 10, cha: 10 } } as unknown as Character).find((x) => x.key === 'stones-endurance')!
  assert.equal(res.total, 1)
  assert.equal(res.recharge, 'short')
})

test('Changeling (Eberron): +2 Cha, +1 to one other, two of four skills, Common + two languages', () => {
  const r = raceById('changeling')!
  assert.equal(r.source, 'ERLW')
  assert.deepEqual(r.bonusChoice, { choose: 1, amount: 1, from: ['str', 'dex', 'con', 'int', 'wis'] })
  assert.deepEqual(racialBonuses('changeling', '', ['dex']), { str: 0, dex: 1, con: 0, int: 0, wis: 0, cha: 2 })
  assert.deepEqual(r.skillChoice, { choose: 2, from: ['deception', 'insight', 'intimidation', 'persuasion'] })
  assert.equal(r.extraLanguages, 2)
})

test('Orc (2024 PHB): flexible +2/+1 or +1/+1/+1, Adrenaline Rush = proficiency bonus per short rest', async () => {
  const r = raceById('orc')!
  assert.equal(r.source, 'PHB24')
  assert.equal(r.flexibleBonus, true)
  assert.deepEqual(racialBonuses('orc', '', []), { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 })
  assert.deepEqual(racialBonuses('orc', '', ['str', 'str', 'con']), { str: 2, dex: 0, con: 1, int: 0, wis: 0, cha: 0 })
  assert.deepEqual(racialBonuses('orc', '', ['str', 'dex', 'con']), { str: 1, dex: 1, con: 1, int: 0, wis: 0, cha: 0 })
  const res = (level: number) => characterResources({ classId: 'fighter', subclass: '', level, race: 'orc', subrace: '', resources: {}, feats: [],
    abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } } as unknown as Character)
  assert.equal(res(1).find((x) => x.key === 'adrenaline-rush')!.total, 2)
  assert.equal(res(5).find((x) => x.key === 'adrenaline-rush')!.recharge, 'short')
  assert.equal(res(5).find((x) => x.key === 'adrenaline-rush')!.total, 3)
  assert.ok(res(1).some((x) => x.key === 'relentless-endurance'))
  const { buildImportPrompt } = await import('../src/lib/aiPrompt')
  assert.ok(buildImportPrompt({ lang: 'en' }).includes("Orc [Player's Handbook (2024)]"))
})
