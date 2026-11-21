// Spell access rules. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPELLS } from '../src/lib/rules'
import { canUseSpell, cantripCount, castableMax, casterInfo, classSpellList, spellAllowance, spellSlots, unlockLevel } from '../src/lib/spellAccess'

const spell = (id: string) => SPELLS.find((s) => s.id === id)!
const scores = (wis = 10, int = 10, cha = 10) => ({ str: 10, dex: 10, con: 10, int, wis, cha })

test('full casters unlock a new spell level every odd level up to 9th', () => {
  assert.equal(castableMax('wizard', '', 1), 1)
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => unlockLevel('wizard', '', l)), [1, 3, 5, 7, 9, 11, 13, 15, 17])
  assert.equal(cantripCount('wizard', '', 1), 3)
  assert.equal(canUseSpell('wizard', '', 4, spell('fireball')), false)
  assert.equal(canUseSpell('wizard', '', 5, spell('fireball')), true)
})

test('only spells on the class list are usable', () => {
  assert.equal(canUseSpell('cleric', '', 20, spell('fireball')), false)
  assert.equal(canUseSpell('cleric', '', 1, spell('cure-wounds')), true)
  assert.ok(classSpellList('cleric', '').every((s) => s.classes.includes('cleric')))
  assert.ok(classSpellList('wizard', '', false).every((s) => s.source === 'PHB'))
})

test('half casters start at 2nd level and stop at 5th-level spells', () => {
  assert.equal(castableMax('paladin', '', 1), 0)
  assert.equal(unlockLevel('paladin', '', 1), 2)
  assert.equal(unlockLevel('paladin', '', 5), 17)
  assert.equal(unlockLevel('paladin', '', 6), null)
  assert.equal(unlockLevel('paladin', '', 0), null, 'paladins have no cantrips')
  assert.equal(unlockLevel('ranger', '', 1), 2)
})

test('warlock pact slots plus Mystic Arcanum for 6th-9th level', () => {
  assert.deepEqual(spellSlots('warlock', '', 5).slice(0, 4), [0, 0, 2, 0])
  assert.equal(castableMax('warlock', '', 10), 5)
  assert.equal(castableMax('warlock', '', 11), 6)
  assert.deepEqual([6, 7, 8, 9].map((l) => unlockLevel('warlock', '', l)), [11, 13, 15, 17])
})

test('Eldritch Knight and Arcane Trickster cast from the wizard list as one-third casters', () => {
  assert.equal(casterInfo('fighter', ''), null)
  assert.equal(casterInfo('fighter', 'champion'), null)
  assert.deepEqual(casterInfo('fighter', 'eldritch-knight'), { listClass: 'wizard', ability: 'int', third: true })
  assert.equal(unlockLevel('fighter', 'eldritch-knight', 1), 3)
  assert.equal(unlockLevel('fighter', 'eldritch-knight', 4), 19)
  assert.equal(unlockLevel('fighter', 'eldritch-knight', 5), null)
  assert.equal(cantripCount('fighter', 'eldritch-knight', 3), 2)
  assert.equal(cantripCount('rogue', 'arcane-trickster', 10), 4)
  assert.deepEqual(spellSlots('rogue', 'arcane-trickster', 7).slice(0, 2), [4, 2])
  assert.equal(canUseSpell('fighter', 'eldritch-knight', 3, spell('shield')), true)
  assert.equal(canUseSpell('fighter', 'eldritch-knight', 3, spell('misty-step')), false)
})

test('how many spells each caster type picks', () => {
  assert.deepEqual(
    spellAllowance('cleric', 'life', 3, scores(16)),
    { cantrips: 3, spells: 6, maxLevel: 2, mode: 'prepared', preparedLimit: 6 },
  )
  assert.equal(spellAllowance('wizard', '', 1, scores(10, 16)).spells, 6)
  assert.equal(spellAllowance('wizard', '', 1, scores(10, 16)).preparedLimit, 4)
  assert.equal(spellAllowance('fighter', 'eldritch-knight', 3, scores()).spells, 3)
  assert.equal(spellAllowance('fighter', '', 3, scores()).mode, 'none')
  assert.equal(spellAllowance('warlock', '', 11, scores()).maxLevel, 5, 'arcanum is picked separately from known spells')
})

test('spell limits: cantrips, spells known and spells prepared are capped by the class table', async () => {
  const { spellCounts, addBlocked } = await import('../src/lib/spellAccess')
  const { SPELLS } = await import('../src/lib/rules')
  const sp = (id: string) => SPELLS.find((s) => s.id === id)!
  const scores = { str: 18, dex: 10, con: 17, int: 8, wis: 18, cha: 20 }
  const k = (ids: string[], prepared = true) => ids.map((id) => ({ id, prepared }))

  // Tempest cleric 3, Wis 18: prepares 4 + 3 = 7; domain spells are free.
  const cleric = { id: 'c', classId: 'cleric', subclass: 'tempest', level: 3, abilities: scores,
    spells: [...k(['guidance', 'resistance', 'sacred-flame', 'thunderwave', 'shatter']), ...k(['command', 'cure-wounds', 'guiding-bolt', 'healing-word', 'inflict-wounds', 'hold-person']), ...k(['bless'], false)] }
  let c = spellCounts(cleric)
  assert.deepEqual([c.cantrips, c.leveled, c.prepared, c.allowance.preparedLimit], [3, 7, 6, 7])
  assert.equal(c.preparedFull, false)
  assert.equal(addBlocked(c, sp('light')), 'cantrips', 'a 4th cantrip is refused')
  assert.equal(addBlocked(c, sp('aid')), null, 'a cleric may list any cleric spell; only preparing is capped')
  c = spellCounts({ ...cleric, spells: cleric.spells.map((s) => ({ ...s, prepared: true })) })
  assert.deepEqual([c.prepared, c.preparedFull], [7, true])
  assert.equal(addBlocked(c, sp('fog-cloud')), null, 'domain spells never count')

  // Bard 3: 2 cantrips, 6 spells known.
  const bard = { id: 'b', classId: 'bard', subclass: 'valor', level: 3, abilities: scores,
    spells: k(['friends', 'prestidigitation', 'bane', 'charm-person', 'dissonant-whispers', 'faerie-fire', 'crown-of-madness']) }
  let b = spellCounts(bard)
  assert.deepEqual([b.cantrips, b.leveled, b.knownFull, b.cantripsFull, b.preparedFull], [2, 5, false, true, false])
  assert.equal(addBlocked(b, sp('sleep')), null)
  b = spellCounts({ ...bard, spells: [...bard.spells, ...k(['sleep'])] })
  assert.equal(addBlocked(b, sp('healing-word')), 'known', 'a 7th known spell is refused')

  // Wizard 1: the spellbook has no cap (spells can be copied in); preparing does.
  const wizard = { id: 'w', classId: 'wizard', subclass: '', level: 1, abilities: { ...scores, int: 16 },
    spells: k(['magic-missile', 'shield', 'sleep', 'mage-armor', 'detect-magic', 'identify', 'burning-hands']) }
  const w = spellCounts(wizard)
  assert.equal(addBlocked(w, sp('find-familiar')), null)
  assert.deepEqual([w.allowance.preparedLimit, w.preparedFull], [4, true])
})
