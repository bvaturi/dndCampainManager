// AI-helper import path. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument, PDFHexString } from 'pdf-lib'
import { buildImportPrompt } from '../src/lib/aiPrompt'
import { IMPORT_FIELDS, splitList } from '../src/lib/importSpec'
import { importCharacterPdf } from '../src/lib/pdfImport'

/** A PDF like the AI recipe produces: one text field per spec name, stacked down the page. */
async function aiPdf(values: Record<string, string>) {
  const doc = await PDFDocument.create()
  let page = doc.addPage([612, 792])
  const form = doc.getForm()
  let y = 760
  for (const f of IMPORT_FIELDS) {
    if (y < 40) { page = doc.addPage([612, 792]); y = 760 }
    const field = form.createTextField(f.name)
    field.addToPage(page, { x: 36, y, width: 540, height: 16 })
    if (values[f.name]) field.acroField.setValue(PDFHexString.fromText(values[f.name]))
    y -= 22
  }
  return doc.save({ updateFieldAppearances: false })
}

test('the prompt names every importable field and the official game names', () => {
  const p = buildImportPrompt({ lang: 'en' })
  for (const f of IMPORT_FIELDS) assert.ok(p.includes(`\`${f.name}\``), `missing field ${f.name}`)
  for (const name of ['Hill Dwarf', 'Eldritch Knight', 'Folk Hero', 'Sleight of Hand', 'War Caster']) assert.ok(p.includes(name), name)
  assert.ok(!p.includes('Please talk to me in Hebrew'))
  assert.ok(buildImportPrompt({ lang: 'he' }).includes('Please talk to me in Hebrew'))
})

test('list fields split on new lines, commas and bullets', () => {
  assert.deepEqual(splitList('- Stealth\n• Arcana, Insight;Perception\n\n'), ['Stealth', 'Arcana', 'Insight', 'Perception'])
})

test('explicit list fields import proficiencies, expertise, feats, spells and counters', async () => {
  const r = await importCharacterPdf(await aiPdf({
    CharacterName: 'נועה', ClassLevel: 'Rogue 6', Subclass: 'Arcane Trickster', Race: 'Lightfoot Halfling', Background: 'Criminal',
    STR: '8', DEX: '18', CON: '14', INT: '14', WIS: '12', CHA: '10',
    SaveProficiencies: 'Dexterity\nIntelligence', SkillProficiencies: 'Stealth\nPerception\nתובנה', SkillExpertise: 'Stealth',
    Feats: 'Alert\nSecret Homebrew Feat', HPMax: '45', HitDiceUsed: '2', DeathSaveFailures: '1', Inspiration: 'no',
    SpellsCantrips: 'Mage Hand', SpellsLevel1: 'Disguise Self\nCharm Person\nNot Real', SpellsPrepared: 'Charm Person', SlotsExpended1: '2',
  }))
  const c = r.character
  assert.deepEqual([c.race, c.subrace, c.classId, c.subclass, c.level, c.background], ['halfling', 'lightfoot-halfling', 'rogue', 'arcane-trickster', 6, 'criminal'])
  assert.deepEqual(c.saveProfs, ['dex', 'int'])
  assert.deepEqual(c.skillProfs, ['stealth', 'perception', 'insight'])
  assert.deepEqual(c.expertise, ['stealth'])
  assert.deepEqual(c.feats?.map((f) => f.featId), ['alert', 'custom'])
  assert.deepEqual(c.feats?.[0].applied, {}, 'scores on the sheet already include feat bonuses')
  assert.equal(c.inspiration, false)
  assert.equal(c.hitDiceUsed, 2)
  assert.equal(c.deathSaves.failures, 1)
  assert.equal(c.hpCurrent, 45)
  assert.deepEqual(c.spells, [
    { id: 'mage-hand', prepared: true },
    { id: 'disguise-self', prepared: false },
    { id: 'charm-person', prepared: true },
  ])
  assert.deepEqual(r.unmatchedSpells, ['Not Real'])
  assert.equal(c.slotsExpended[0], 2)
})

test('the prompt lists the extra races with their books, and full subclass names', () => {
  const p = buildImportPrompt({ lang: 'en' })
  assert.ok(p.includes("Goliath [Volo's Guide to Monsters]"))
  assert.ok(p.includes('Changeling [Eberron: Rising from the Last War]'))
  assert.ok(p.includes('Vengeance (Oath of Vengeance)'))
})

test('imports a Goliath and a Changeling, and full subclass names like "Oath of Vengeance"', async () => {
  const g = (await importCharacterPdf(await aiPdf({ CharacterName: 'Ukar', ClassLevel: 'Paladin 5', Subclass: 'Oath of Vengeance', Race: 'Goliath', STR: '17' }))).character
  assert.deepEqual([g.race, g.classId, g.subclass], ['goliath', 'paladin', 'vengeance'])
  const c = (await importCharacterPdf(await aiPdf({ CharacterName: 'Mask', ClassLevel: 'Sorcerer 3', Subclass: 'Draconic Bloodline', Race: 'Changeling' }))).character
  assert.deepEqual([c.race, c.classId, c.subclass], ['changeling', 'sorcerer', 'draconic'])
})
