// PDF character import tests. Run with: npm run test:import
// Builds small synthetic PDFs that use the official 5e sheet's field names and positions.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument, PDFHexString } from 'pdf-lib'
import { NoFormFieldsError, importCharacterPdf } from '../src/lib/pdfImport'

type Box = [x: number, y: number, w: number, h: number]

async function sheet(texts: Record<string, [string, Box, number?]>, checks: Record<string, [boolean, Box, number?]>) {
  const doc = await PDFDocument.create()
  const pages = [doc.addPage([612, 792]), doc.addPage([612, 792]), doc.addPage([612, 792])]
  const form = doc.getForm()
  for (const [name, [value, [x, y, width, height], page = 0]] of Object.entries(texts)) {
    const f = form.createTextField(name)
    f.addToPage(pages[page], { x, y, width, height })
    f.acroField.setValue(PDFHexString.fromText(value)) // raw UTF-16 value, like a real filled form (no font needed)
  }
  for (const [name, [on, [x, y, width, height], page = 0]] of Object.entries(checks)) {
    const c = form.createCheckBox(name)
    c.addToPage(pages[page], { x, y, width, height })
    if (on) c.check()
  }
  return doc.save({ updateFieldAppearances: false })
}

test('reads identity, scores, proficiency dots, spells and slots', async () => {
  const pdf = await sheet({
    CharacterName: ['Thorin', [48, 710, 173, 21]],
    ClassLevel: ['Cleric (Life) 3', [270, 728, 106, 16]],
    'Race ': ['Hill Dwarf', [269, 702, 107, 16]],
    Background: ['Acolyte', [384, 728, 86, 16]],
    STR: ['13', [37, 612, 41, 26]], DEX: ['8', [37, 540, 41, 26]], CON: ['16', [37, 469, 41, 26]],
    INT: ['10', [37, 397, 41, 26]], WIS: ['16', [37, 326, 41, 26]], CHA: ['12', [37, 254, 41, 26]],
    'ST Wisdom': ['+5', [113, 523, 14, 9]],
    'ST Charisma': ['+3', [113, 509, 14, 9]],
    Insight: ['+5', [112, 381, 14, 9]],
    Medicine: ['+3', [112, 340, 14, 9]],
    HPMax: ['30', [291, 585, 89, 11]],
    'Spells 1014': ['Sacred Flame', [40, 607, 158, 13], 2],
    'Spells 1015': ['Bless', [41, 422, 158, 13], 2],
    'Spells 1023': ['Cure Wounds', [41, 408, 158, 13], 2],
    'Spells 1024': ['Not A Real Spell', [41, 394, 158, 13], 2],
    'SlotsTotal 19': ['4', [52, 457, 39, 21], 2],
    'SlotsRemaining 19': ['2', [103, 457, 93, 21], 2],
  }, {
    'Check Box 21': [true, [101, 522, 9, 9]],   // Wisdom save
    'Check Box 22': [true, [101, 509, 9, 9]],   // Charisma save
    'Check Box 29': [true, [101, 380, 9, 9]],   // Insight
    'Check Box 32': [false, [101, 340, 9, 9]],  // Medicine (unticked)
    'Check Box 251': [true, [32, 421, 9, 9], 2], // Bless prepared
    'Check Box 309': [false, [32, 407, 9, 9], 2], // Cure Wounds not prepared
  })

  const r = await importCharacterPdf(pdf)
  const c = r.character
  assert.equal(c.name, 'Thorin')
  assert.deepEqual([c.race, c.subrace, c.classId, c.subclass, c.level, c.background], ['dwarf', 'hill-dwarf', 'cleric', 'life', 3, 'acolyte'])
  assert.deepEqual(c.abilities, { str: 13, dex: 8, con: 16, int: 10, wis: 16, cha: 12 })
  assert.deepEqual(c.saveProfs, ['wis', 'cha'])
  assert.deepEqual(c.skillProfs, ['insight'])
  assert.equal(c.hpMax, 30)
  assert.equal(c.hpCurrent, 30, 'missing current HP falls back to max')
  assert.deepEqual(c.spells, [
    { id: 'sacred-flame', prepared: true },
    { id: 'bless', prepared: true },
    { id: 'cure-wounds', prepared: false },
  ])
  assert.deepEqual(r.unmatchedSpells, ['Not A Real Spell'])
  assert.match(c.additionalFeatures, /Not A Real Spell/)
  assert.equal(c.slotsExpended[0], 2)
  assert.deepEqual(r.warnings, [])
})

test('recognises Hebrew names and flags multiclass', async () => {
  const pdf = await sheet({
    CharacterName: ['נועה', [48, 710, 173, 21]],
    ClassLevel: ['לוחם 3 / קוסם 2', [270, 728, 106, 16]],
    'Race ': ['חצי-אלף', [269, 702, 107, 16]],
  }, {})
  const r = await importCharacterPdf(pdf)
  assert.equal(r.character.classId, 'fighter')
  assert.equal(r.character.level, 5)
  assert.equal(r.character.race, 'half-elf')
  assert.ok(r.warnings.includes('multiclass'))
})

test('rejects a PDF without filled-in form fields', async () => {
  const doc = await PDFDocument.create()
  doc.addPage()
  await assert.rejects(importCharacterPdf(await doc.save()), NoFormFieldsError)
})
