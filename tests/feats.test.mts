// Feat rules. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addFeat, featBonuses, featSlotLevels, levelUpFeats, prereqProblems, removeFeat, featById } from '../src/lib/feats'
import type { Character } from '../src/lib/types'

const base = (over: Partial<Character> = {}): Character => ({
  id: 'c', campaignId: 'x', ownerUid: 'u', ownerName: 'P', name: 'Hero', race: 'human', subrace: '', classId: 'fighter', subclass: '',
  level: 4, background: 'soldier', alignment: '', xp: 0,
  baseAbilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  saveProfs: ['str', 'con'], skillProfs: [], expertise: [], inspiration: false, armorClass: 16, speed: 30,
  hpMax: 40, hpCurrent: 35, hpTemp: 0, hitDiceUsed: 0, deathSaves: { successes: 0, failures: 0 }, attacks: [],
  equipment: '', coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, otherProficiencies: '', features: '', personality: '', ideals: '',
  bonds: '', flaws: '', age: '', height: '', weight: '', eyes: '', skin: '', hair: '', appearance: '', portraitUrl: '', backstory: '',
  allies: '', symbolName: '', additionalFeatures: '', treasure: '', spells: [], slotsExpended: Array(9).fill(0), createdAt: 0, updatedAt: 0,
  ...over,
})

test('fighters get extra ASI/feat levels', () => {
  assert.deepEqual(featSlotLevels(base()), [4, 6, 8, 12, 14, 16, 19])
  assert.deepEqual(featSlotLevels(base({ classId: 'wizard' })), [4, 8, 12, 16, 19])
})

test('prerequisites: ability minimums, spellcasting and armor', () => {
  assert.equal(prereqProblems(base(), featById('grappler')!).length, 0)
  assert.equal(prereqProblems(base({ abilities: { ...base().abilities, str: 12 } }), featById('grappler')!)[0].kind, 'ability')
  assert.equal(prereqProblems(base(), featById('war-caster')!)[0].kind, 'spellcasting')
  assert.equal(prereqProblems(base({ classId: 'wizard' }), featById('war-caster')!).length, 0)
  assert.equal(prereqProblems(base(), featById('heavy-armor-master')!).length, 0, 'fighters have all armor')
  assert.equal(prereqProblems(base({ classId: 'wizard' }), featById('heavy-armor-master')!)[0].kind, 'armor')
  assert.equal(prereqProblems(base({ abilities: { ...base().abilities, int: 13, wis: 8 } }), featById('ritual-caster')!).length, 0, 'Int 13 OR Wis 13')
})

test('ASI and half-feats raise scores (max 20) and removing undoes it', () => {
  let ch = base({ abilities: { ...base().abilities, str: 19 } })
  ch = { ...ch, ...addFeat(ch, { featId: 'asi', choice: 'str', choice2: 'str', level: 4, notes: '' }) }
  assert.equal(ch.abilities.str, 20, 'capped at 20')
  assert.deepEqual(ch.feats![0].applied?.abilities, { str: 1 })
  ch = { ...ch, ...removeFeat(ch, ch.feats![0].uid) }
  assert.equal(ch.abilities.str, 19)
  assert.equal(ch.feats!.length, 0)

  ch = { ...ch, ...addFeat(ch, { featId: 'athlete', choice: 'dex', level: 4, notes: '' }) }
  assert.equal(ch.abilities.dex, 14)
  ch = { ...ch, ...addFeat(ch, { featId: 'durable', level: 6, notes: '' }) }
  assert.equal(ch.abilities.con, 15, 'single-ability half-feat needs no choice')
})

test('Resilient adds the save proficiency only if new; Tough adds HP and grows on level up', () => {
  let ch = base()
  ch = { ...ch, ...addFeat(ch, { featId: 'resilient', choice: 'wis', level: 4, notes: '' }) }
  assert.deepEqual(ch.saveProfs, ['str', 'con', 'wis'])
  const res = ch.feats![0].uid
  ch = { ...ch, ...addFeat(ch, { featId: 'resilient', choice: 'con', level: 6, notes: '' }) }
  assert.deepEqual(ch.saveProfs, ['str', 'con', 'wis'], 'already proficient: nothing added')
  ch = { ...ch, ...removeFeat(ch, res) }
  assert.deepEqual(ch.saveProfs, ['str', 'con'])

  ch = { ...ch, ...addFeat(ch, { featId: 'tough', level: 4, notes: '' }) }
  assert.equal(ch.hpMax, 48)
  assert.equal(ch.hpCurrent, 43)
  const up = levelUpFeats(ch)
  assert.equal(up.hp, 2)
  ch = { ...ch, level: 5, hpMax: ch.hpMax + 2, feats: up.feats }
  ch = { ...ch, ...removeFeat(ch, ch.feats!.find((f) => f.featId === 'tough')!.uid) }
  assert.equal(ch.hpMax, 40, 'removes all Tough HP including the level-up bonus')
})

test('Alert and Observant bonuses', () => {
  let ch = base()
  ch = { ...ch, ...addFeat(ch, { featId: 'alert', level: 4, notes: '' }) }
  ch = { ...ch, ...addFeat(ch, { featId: 'observant', choice: 'wis', level: 8, notes: '' }) }
  const b = featBonuses(ch)
  assert.equal(b.initiative, 5)
  assert.equal(b.passive, 5)
  assert.equal(ch.abilities.wis, 13)
})
