// Levelling up: HP per level and the features each level brings. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addFeat, removeFeat } from '../src/lib/feats'
import { applyLevelUp, bonusHpPerLevel, hpGain, levelUpGain, levelUpPlan } from '../src/lib/levelUp'
import { CLASSES, startingHp } from '../src/lib/rules'
import type { Character } from '../src/lib/types'

const ch = (classId: string, subclass: string, level: number, extra: Partial<Character> = {}) => ({
  id: 'c', classId, subclass, level, race: 'human', subrace: '', feats: [],
  abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, ...extra,
} as unknown as Character)
const names = (g: ReturnType<typeof levelUpGain>) => g!.features.map((f) => f.name)

test('average HP per level: half the hit die + 1, plus Con', () => {
  assert.equal(levelUpGain(ch('barbarian', '', 1))!.hp, 7 + 2)
  assert.equal(levelUpGain(ch('wizard', '', 1))!.hp, 4 + 2)
  assert.equal(levelUpGain(ch('fighter', '', 19)) !== null, true)
  assert.equal(levelUpGain(ch('fighter', '', 20)), null, 'no level 21')
})

test('Hill Dwarf, Draconic Resilience and Tough add HP every level', () => {
  assert.equal(bonusHpPerLevel(ch('sorcerer', 'draconic', 1)), 1)
  assert.equal(bonusHpPerLevel(ch('sorcerer', 'wild-magic', 1)), 0)
  assert.equal(levelUpGain(ch('sorcerer', 'draconic', 1))!.hp, 4 + 2 + 1)
  assert.equal(levelUpGain(ch('cleric', 'life', 1, { subrace: 'hill-dwarf' }))!.hp, 5 + 2 + 1)
  const tough = ch('fighter', '', 3, { feats: [{ uid: 'u', featId: 'tough', applied: { hp: 6 } }] } as Partial<Character>)
  const g = levelUpGain(tough)!
  assert.equal(g.hp, 6 + 2 + 2)
  assert.equal(g.feats![0].applied!.hp, 8, 'Tough remembers the HP it added')
  // starting HP uses the same per-level bonuses
  const sorc = CLASSES.find((c) => c.id === 'sorcerer')!
  assert.equal(startingHp(sorc, 3, 2, '', 'draconic'), 6 + 2 + 2 * (4 + 2) + 3)
})

test('the subclass level brings the subclass features, not just its name', () => {
  assert.deepEqual(names(levelUpGain(ch('barbarian', 'berserker', 2))), ['Primal Path', 'Frenzy'])
  const cleric = names(levelUpGain(ch('cleric', 'tempest', 1)))
  assert.deepEqual(cleric, ['Channel Divinity', 'Channel Divinity: Turn Undead', 'Channel Divinity: Destructive Wrath'])
  assert.ok(cleric.some((n) => /Destructive Wrath/.test(n)), cleric.join())
  const wiz = names(levelUpGain(ch('wizard', 'evocation', 1)))
  assert.ok(wiz.includes('Evocation Savant') && wiz.includes('Sculpt Spells'), wiz.join())
  assert.ok(!wiz.some((n) => /feature$/i.test(n)), 'no "… feature" placeholder once a subclass is chosen')
})

test('every subclass feature is reached by levelling 1 → 20', () => {
  for (const cls of CLASSES) {
    for (const sub of cls.subclasses) {
      const got = new Set<string>()
      for (let lv = 1; lv < 20; lv++) for (const f of levelUpGain(ch(cls.id, sub.id, lv))!.features) got.add(f.name)
      for (const f of sub.features.filter((f) => f.level > 1)) assert.ok(got.has(f.name), `${cls.id}/${sub.id}: ${f.name} (level ${f.level})`)
    }
  }
})

test('each ability comes with its description; table upgrades by name', () => {
  const g = levelUpGain(ch('cleric', 'tempest', 1))!
  for (const f of g.features) assert.ok(f.summary && f.summary.length > 20, `${f.name} has a summary`)
  assert.ok(names(levelUpGain(ch('cleric', 'tempest', 5))).includes('Channel Divinity (2/rest)'))
  assert.ok(names(levelUpGain(ch('fighter', 'champion', 10))).includes('Extra Attack (2)'))
})

test('every class feature is reached by levelling 1 → 20', () => {
  for (const cls of CLASSES) {
    const got = new Set<string>()
    for (let lv = 1; lv < 20; lv++) for (const f of levelUpGain(ch(cls.id, cls.subclasses[0].id, lv))!.features) got.add(f.name)
    for (const f of cls.features.filter((f) => f.level > 1)) assert.ok(got.has(f.name), `${cls.id}: ${f.name} (level ${f.level})`)
  }
})

test('ASI levels appear when levelling (fighter 6, rogue 10)', () => {
  assert.ok(names(levelUpGain(ch('fighter', 'champion', 5))).includes('Ability Score Improvement'))
  assert.ok(names(levelUpGain(ch('rogue', 'thief', 9))).includes('Ability Score Improvement'))
})

// ---- the full plan (PHB p.15 and the class tables)

const full = (classId: string, subclass: string, level: number, extra: Partial<Character> = {}) => ch(classId, subclass, level, {
  hpMax: 20, hpCurrent: 20, features: '', resources: {}, saveProfs: [], spells: [], slotsExpended: Array(9).fill(0),
  abilities: { str: 10, dex: 10, con: 17, int: 10, wis: 18, cha: 14 }, ...extra,
} as Partial<Character>)

test('Hit Die: roll or fixed value, plus Constitution, at least 1', () => {
  const p = levelUpPlan(full('cleric', 'tempest', 3))!
  assert.equal(p.hitDie, 8)
  assert.equal(p.hpFixed, 5, '1d8 (or 5)')
  assert.equal(hpGain(p, p.hpFixed), 8)
  assert.equal(hpGain(p, 1), 4, 'rolled a 1')
  assert.equal(hpGain(p, 8), 11, 'rolled an 8')
  const frail = levelUpPlan(full('wizard', 'evocation', 1, { abilities: { str: 10, dex: 10, con: 5, int: 16, wis: 10, cha: 10 } }))!
  assert.equal(hpGain(frail, 1), 1, 'never less than 1')
})

test('proficiency bonus rises at 5, 9, 13 and 17', () => {
  for (let lv = 1; lv < 20; lv++) {
    const p = levelUpPlan(full('fighter', 'champion', lv))!
    assert.equal(!!p.prof, [5, 9, 13, 17].includes(lv + 1), `level ${lv + 1}`)
  }
})

test('cleric 4 → 5: 3rd-level slots, one more prepared, domain spells, Destroy Undead', () => {
  const p = levelUpPlan(full('cleric', 'tempest', 4))!
  assert.deepEqual(p.slots, [{ level: 3, from: 0, to: 2 }])
  assert.equal(p.newSpellLevel, 3)
  assert.deepEqual(p.prepared, { from: 8, to: 9 }, 'Wis modifier + cleric level')
  assert.deepEqual(p.alwaysPrepared.map((s) => s.id).sort(), ['call-lightning', 'sleet-storm'])
  assert.deepEqual(p.prof, { from: 2, to: 3 })
  assert.ok(p.features.some((f) => f.name === 'Destroy Undead'))
  assert.equal(p.asi, false)
})

test('cleric 5 → 6: a second Channel Divinity use', () => {
  const p = levelUpPlan(full('cleric', 'tempest', 5))!
  assert.deepEqual(p.resources.find((r) => r.key === 'channel-divinity'), { key: 'channel-divinity', label: p.resources[0].label, labelHe: p.resources[0].labelHe, from: 1, to: 2 })
})

test('class tables: sneak attack, rages, pact slots, spells known', () => {
  assert.deepEqual(levelUpPlan(full('rogue', 'thief', 2))!.columns, [{ name: 'Sneak Attack', from: '1d6', to: '2d6' }])
  assert.ok(levelUpPlan(full('barbarian', 'berserker', 2))!.columns.some((c) => c.name === 'Rages' && c.from === 2 && c.to === 3))
  const lock = levelUpPlan(full('warlock', 'fiend', 2))!
  assert.deepEqual(lock.pact, { from: { count: 2, level: 1 }, to: { count: 2, level: 2 } })
  assert.deepEqual(lock.slots, [])
  assert.deepEqual(lock.spells, { from: 3, to: 4, mode: 'known' })
  assert.deepEqual(levelUpPlan(full('wizard', 'evocation', 1))!.spells, { from: 6, to: 8, mode: 'spellbook' }, 'two spells per wizard level')
  assert.equal(levelUpPlan(full('fighter', 'champion', 3))!.spells, null)
})

test('the subclass is chosen at the class\'s subclass level', () => {
  const p = levelUpPlan(full('rogue', '', 2))!
  assert.equal(p.needsSubclass, true)
  const chosen = levelUpPlan(full('rogue', '', 2), 'assassin')!
  assert.equal(chosen.needsSubclass, false)
  assert.ok(chosen.features.some((f) => f.name === 'Assassinate' && f.subclass === 'assassin'))
  assert.equal(levelUpPlan(full('rogue', '', 1))!.needsSubclass, false, 'not yet at level 2')
  const patch = applyLevelUp(full('rogue', '', 2), chosen, { subclass: 'assassin', die: chosen.hpFixed, featureLines: ['Assassinate: …'] })
  assert.equal(patch.subclass, 'assassin')
  assert.equal(patch.level, 3)
})

test('Ability Score Improvement: +2 or +1/+1, max 20, and Constitution adds 1 HP per level', () => {
  const c = full('cleric', 'tempest', 3)
  const p = levelUpPlan(c)!
  assert.equal(p.asi, true)
  const patch = applyLevelUp(c, p, { subclass: 'tempest', die: p.hpFixed, asi: { choice: 'con', choice2: 'wis' }, featureLines: [] })
  assert.equal(patch.abilities!.con, 18)
  assert.equal(patch.abilities!.wis, 19)
  // +8 for the level (5 + 3), then Con 17 → 18 raises the modifier: +1 for each of the 4 levels
  assert.equal(patch.hpMax, 20 + 8 + 4)
  assert.equal(patch.feats!.at(-1)!.featId, 'asi')
  const same = applyLevelUp(c, p, { subclass: 'tempest', die: p.hpFixed, asi: { choice: 'wis', choice2: 'wis' }, featureLines: [] })
  assert.equal(same.abilities!.wis, 20)
  assert.equal(same.hpMax, 28, 'no Constitution change, no extra HP')
  const capped = applyLevelUp(full('cleric', 'tempest', 3, { abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 20, cha: 10 } }), p, { subclass: 'tempest', die: 5, asi: { choice: 'wis', choice2: 'wis' }, featureLines: [] })
  assert.equal(capped.abilities!.wis, 20, 'scores never pass 20')
  // without an improvement chosen now, the scores stay
  assert.equal(applyLevelUp(c, p, { subclass: 'tempest', die: 5, featureLines: [] }).abilities, undefined)
})

test('removing an improvement takes back the Constitution HP', () => {
  const c = full('fighter', 'champion', 4, { hpMax: 40, hpCurrent: 40, abilities: { str: 16, dex: 10, con: 15, int: 10, wis: 10, cha: 10 } })
  const withAsi = { ...c, ...addFeat(c, { featId: 'asi', level: 4, choice: 'con', choice2: 'str', notes: '' }) } as Character
  assert.equal(withAsi.abilities.con, 16)
  assert.equal(withAsi.hpMax, 44, '+1 modifier × 4 levels')
  const back = { ...withAsi, ...removeFeat(withAsi, withAsi.feats!.at(-1)!.uid) } as Character
  assert.equal(back.hpMax, 40)
  assert.equal(back.abilities.con, 15)
})

test('levelling writes the new abilities into Features & Traits', () => {
  const c = full('cleric', 'tempest', 1, { features: 'Stone\'s Endurance: …' })
  const p = levelUpPlan(c)!
  const patch = applyLevelUp(c, p, { subclass: 'tempest', die: p.hpFixed, featureLines: p.features.map((f) => `${f.name}: ${f.summary}`) })
  assert.ok(patch.features!.startsWith('Stone\'s Endurance'))
  assert.ok(/Channel Divinity: Turn Undead: Action/.test(patch.features!))
  assert.ok(/Destructive Wrath/.test(patch.features!))
})
