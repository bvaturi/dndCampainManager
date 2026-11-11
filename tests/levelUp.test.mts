// Levelling up: HP per level and the features each level brings. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bonusHpPerLevel, levelUpGain } from '../src/lib/levelUp'
import { CLASSES, startingHp } from '../src/lib/rules'
import type { Character } from '../src/lib/types'

const ch = (classId: string, subclass: string, level: number, extra: Partial<Character> = {}) => ({
  id: 'c', classId, subclass, level, race: 'human', subrace: '', feats: [],
  abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, ...extra,
} as unknown as Character)
const names = (g: ReturnType<typeof levelUpGain>) => g!.features.map(([, n]) => n)

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
  assert.ok(cleric.some((n) => n.startsWith('Channel Divinity (')), cleric.join())
  assert.ok(cleric.some((n) => /Destructive Wrath/.test(n)), cleric.join())
  const wiz = names(levelUpGain(ch('wizard', 'evocation', 1)))
  assert.ok(wiz.includes('Evocation Savant') && wiz.includes('Sculpt Spells'), wiz.join())
  assert.ok(!wiz.some((n) => /feature$/i.test(n)), 'no "… feature" placeholder once a subclass is chosen')
})

test('every subclass feature is reached by levelling 1 → 20', () => {
  for (const cls of CLASSES) {
    for (const sub of cls.subclasses) {
      const got = new Set<string>()
      for (let lv = 1; lv < 20; lv++) for (const [, n] of levelUpGain(ch(cls.id, sub.id, lv))!.features) got.add(n)
      for (const f of sub.features.filter((f) => f.level > 1)) assert.ok(got.has(f.name), `${cls.id}/${sub.id}: ${f.name} (level ${f.level})`)
    }
  }
})

test('ASI levels appear when levelling (fighter 6, rogue 10)', () => {
  assert.ok(names(levelUpGain(ch('fighter', 'champion', 5))).includes('Ability Score Improvement'))
  assert.ok(names(levelUpGain(ch('rogue', 'thief', 9))).includes('Ability Score Improvement'))
})
