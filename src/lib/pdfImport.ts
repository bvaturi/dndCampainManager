/**
 * Import a character from a filled-in 5e character sheet PDF (the official three-page form-fillable sheet,
 * or anything that uses similar field names). Checkbox names on that sheet are meaningless ("Check Box 23"),
 * so each checkbox is paired with the text field on the same row just to its right.
 */
import featsHe from '../data/feats.he.json'
import heNames from '../data/he.json'
import { FEATS } from './feats'
import { splitList } from './importSpec'
import { allSpells } from './homebrew'
import { BACKGROUNDS, CLASSES, RACES, SKILLS, mod, profBonus } from './rules'
import { ABILITIES, type Ability, type AbilityScores, type Attack, type CharacterFeat, type KnownSpell, type NewCharacter } from './types'
import { ABILITY_NAMES } from './rules'

export interface PdfField {
  name: string
  kind: 'text' | 'check' | 'other'
  value: string
  checked: boolean
  page: number
  x: number
  y: number
  w: number
  h: number
}

export interface ImportResult {
  /** Everything except campaign/owner, which the caller fills in. */
  character: Omit<NewCharacter, 'campaignId' | 'ownerUid' | 'ownerName'>
  /** Raw text the guesses were made from, so the user can see what was read. */
  source: { race: string; classLevel: string; background: string; playerName: string }
  unmatchedSpells: string[]
  warnings: string[]
}

export class NoFormFieldsError extends Error {
  constructor() { super('noFormFields') }
}

// ------------------------------------------------------------------ reading the PDF

export async function readPdfFields(data: ArrayBuffer | Uint8Array): Promise<PdfField[]> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFName, PDFArray, PDFRef } = await import('pdf-lib')
  const doc = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false })
  const pages = doc.getPages()
  // widget ref -> page index, for PDFs whose widgets lack a /P entry
  const widgetPage = new Map<unknown, number>()
  pages.forEach((p, i) => {
    const annots = p.node.lookup(PDFName.of('Annots'))
    if (annots instanceof PDFArray) {
      for (let k = 0; k < annots.size(); k++) {
        const ref = annots.get(k)
        if (ref instanceof PDFRef) widgetPage.set(ref.toString(), i)
      }
    }
  })

  const out: PdfField[] = []
  for (const f of doc.getForm().getFields()) {
    const widgets = f.acroField.getWidgets()
    if (!widgets.length) continue
    const w = widgets[0]
    const r = w.getRectangle()
    let page = pages.findIndex((p) => p.ref === w.P())
    if (page < 0) {
      const ref = doc.context.getObjectRef(w.dict)
      page = ref ? widgetPage.get(ref.toString()) ?? 0 : 0
    }
    const base = { name: f.getName(), page, x: r.x, y: r.y, w: r.width, h: r.height }
    if (f instanceof PDFTextField) out.push({ ...base, kind: 'text', value: (f.getText() || '').trim(), checked: false })
    else if (f instanceof PDFCheckBox) out.push({ ...base, kind: 'check', value: '', checked: f.isChecked() })
    else out.push({ ...base, kind: 'other', value: '', checked: false })
  }
  return out
}

// ------------------------------------------------------------------ helpers

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')

function num(s: string | undefined): number | null {
  if (!s) return null
  const m = /[-+]?\d+/.exec(s.replace(/,/g, ''))
  return m ? parseInt(m[0], 10) : null
}

/** Best (longest) candidate whose name appears inside the text. */
function bestMatch<T>(text: string, candidates: { item: T; names: string[] }[]): T | null {
  const t = norm(text)
  if (!t) return null
  let best: { item: T; len: number } | null = null
  for (const c of candidates) {
    for (const n of c.names) {
      const k = norm(n)
      if (k.length >= 3 && t.includes(k) && (!best || k.length > best.len)) best = { item: c.item, len: k.length }
    }
  }
  return best?.item ?? null
}

const he = heNames as Record<string, Record<string, string>>

const SKILL_FIELD: Record<string, string> = {
  acrobatics: 'acrobatics', animal: 'animal-handling', animalhandling: 'animal-handling', arcana: 'arcana',
  athletics: 'athletics', deception: 'deception', history: 'history', insight: 'insight', intimidation: 'intimidation',
  investigation: 'investigation', medicine: 'medicine', nature: 'nature', perception: 'perception',
  performance: 'performance', persuasion: 'persuasion', religion: 'religion', sleightofhand: 'sleight-of-hand',
  stealth: 'stealth', survival: 'survival',
}
const SAVE_FIELD: Record<string, Ability> = {
  ststrength: 'str', stdexterity: 'dex', stconstitution: 'con', stintelligence: 'int', stwisdom: 'wis', stcharisma: 'cha',
}

const cleanSpell = (s: string) => s.replace(/\((?:r|c|ritual|conc\.?|concentration)\)|\*/gi, '').trim()

function matchAbility(s: string): Ability | null {
  const k = norm(s)
  for (const a of ABILITIES) {
    const n = ABILITY_NAMES[a]
    if ([a, n.en, n.he, n.short.en, n.short.he].some((x) => norm(x) === k)) return a
  }
  return null
}

function matchSkill(s: string): string | null {
  const k = norm(s.replace(/\(.*\)/, ''))
  if (SKILL_FIELD[k]) return SKILL_FIELD[k]
  return SKILLS.find((x) => norm(x.en) === k || norm(x.he) === k)?.id ?? null
}

// ------------------------------------------------------------------ mapping

export function mapFields(fields: PdfField[]): ImportResult {
  if (!fields.some((f) => f.kind === 'text' && f.value)) throw new NoFormFieldsError()

  const byName = new Map<string, PdfField>()
  for (const f of fields) if (!byName.has(norm(f.name))) byName.set(norm(f.name), f)
  const text = (...names: string[]) => {
    for (const n of names) {
      const f = byName.get(norm(n))
      if (f?.value) return f.value
    }
    return ''
  }
  const warnings: string[] = []

  // Pair every checkbox with the text field on its row, immediately to the right.
  const texts = fields.filter((f) => f.kind === 'text')
  const pairedChecks = new Map<string, boolean>() // normalized text-field name -> checked
  const loose: PdfField[] = []
  for (const c of fields.filter((f) => f.kind === 'check')) {
    const cy = c.y + c.h / 2
    let best: PdfField | null = null
    let bestDx = Infinity
    for (const t of texts) {
      if (t.page !== c.page) continue
      const dy = Math.abs(t.y + t.h / 2 - cy)
      const dx = t.x - (c.x + c.w)
      if (dy <= 4 && dx >= -2 && dx < 30 && dx < bestDx) { best = t; bestDx = dx }
    }
    if (best) pairedChecks.set(norm(best.name), c.checked || pairedChecks.get(norm(best.name)) === true)
    else loose.push(c)
  }

  // ---- identity
  const classLevel = text('ClassLevel', 'Class Level', 'Class & Level', 'Class')
  const raceText = text('Race', 'Species')
  const bgText = text('Background')

  const cls = bestMatch(classLevel, CLASSES.map((c) => ({ item: c, names: [c.name, he.classes?.[c.id] || ''] })))
  const levels = [...classLevel.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10)).filter((n) => n >= 1 && n <= 20)
  const level = Math.min(20, Math.max(1, levels.reduce((a, b) => a + b, 0) || 1))
  if (levels.length > 1) warnings.push('multiclass')
  const subclassText = text('Subclass')
  const subclass = cls
    ? bestMatch(subclassText || classLevel, cls.subclasses.map((s) => ({ item: s, names: [s.name, s.fullName ?? '', he.subclasses?.[s.id] || ''] })))
    : null

  const subraceHit = bestMatch(raceText, RACES.flatMap((r) => r.subraces.map((s) => ({
    item: { race: r, sub: s },
    names: [s.name, s.name.replace(/\s*\(.*\)/, ''), (/\((.*)\)/.exec(s.name) || [])[1] || '', he.subraces?.[s.id] || ''],
  }))))
  const race = subraceHit?.race ?? bestMatch(raceText, RACES.map((r) => ({ item: r, names: [r.name, he.races?.[r.id] || ''] })))
  const bg = bestMatch(bgText, BACKGROUNDS.map((b) => ({ item: b, names: [b.name, he.backgrounds?.[b.id] || ''] })))

  // ---- abilities
  const abilities = {} as AbilityScores
  for (const a of ABILITIES) abilities[a] = num(text(a.toUpperCase(), a)) ?? 10
  const pb = profBonus(level)

  // Explicit list fields (used by AI-made PDFs) win over checkbox guessing.
  const explicitSaves = text('SaveProficiencies')
  const saveProfs = explicitSaves
    ? splitList(explicitSaves).map(matchAbility).filter((a): a is Ability => !!a)
    : ABILITIES.filter((a) => Object.entries(SAVE_FIELD).some(([field, ab]) => ab === a && pairedChecks.get(field)))
  if (!saveProfs.length && cls) saveProfs.push(...cls.saves)

  const skillProfs: string[] = []
  const expertise: string[] = []
  for (const [field, id] of Object.entries(SKILL_FIELD)) {
    const f = byName.get(field)
    if (!f || skillProfs.includes(id)) continue
    const skill = SKILLS.find((s) => s.id === id)!
    const shown = num(f.value)
    const base = mod(abilities[skill.ability])
    if (pairedChecks.get(field) || (shown !== null && shown >= base + pb)) skillProfs.push(id)
    if (shown !== null && shown >= base + 2 * pb) expertise.push(id)
  }
  const explicitSkills = text('SkillProficiencies')
  const explicitExpertise = text('SkillExpertise')
  if (explicitSkills || explicitExpertise) {
    const exp = splitList(explicitExpertise).map(matchSkill).filter((s): s is string => !!s)
    const prof = splitList(explicitSkills).map(matchSkill).filter((s): s is string => !!s)
    skillProfs.splice(0, skillProfs.length, ...new Set([...prof, ...exp]))
    expertise.splice(0, expertise.length, ...new Set(exp))
  }

  // ---- death saves: the unpaired checkbox rows on page 1 (successes above failures)
  const deathRows = new Map<number, PdfField[]>()
  for (const c of loose.filter((c) => c.page === 0 && c.x > 200)) {
    const key = Math.round(c.y / 6)
    deathRows.set(key, [...(deathRows.get(key) || []), c])
  }
  const rows = [...deathRows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.filter((c) => c.checked).length)

  // ---- attacks
  const attacks: Attack[] = []
  for (let i = 1; i <= 3; i++) {
    const name = text(i === 1 ? 'Wpn Name' : `Wpn Name ${i}`, `Wpn${i} Name`)
    if (!name) continue
    attacks.push({ name, bonus: text(`Wpn${i} AtkBonus`), damage: text(`Wpn${i} Damage`) })
  }

  // ---- spells: every "Spells NNNN" field; the spell's level comes from the compendium
  // Book spells and the campaign's homebrew, matched by English (or Hebrew) name.
  const SPELLS = allSpells()
  const spellIndex = new Map<string, string>()
  for (const s of SPELLS) {
    spellIndex.set(norm(s.name), s.id)
    spellIndex.set(norm(s.name.replace(/^\w+'s /, '')), s.id)
    if (he.spells?.[s.id]) spellIndex.set(norm(he.spells[s.id]), s.id)
  }
  const spells: KnownSpell[] = []
  const unmatchedSpells: string[] = []
  for (const f of texts) {
    if (!/^spells?\s*\d+/i.test(f.name.trim()) || !f.value) continue
    const id = spellIndex.get(norm(cleanSpell(f.value)))
    if (!id) { unmatchedSpells.push(f.value); continue }
    if (spells.some((s) => s.id === id)) continue
    const spell = SPELLS.find((s) => s.id === id)!
    spells.push({ id, prepared: spell.level === 0 || pairedChecks.get(norm(f.name)) === true })
  }
  // Explicit per-level lists (AI-made PDFs): the level comes from the compendium either way.
  const listed = ['SpellsCantrips', ...Array.from({ length: 9 }, (_, i) => `SpellsLevel${i + 1}`)].flatMap((f) => splitList(text(f)))
  const preparedNames = new Set(splitList(text('SpellsPrepared')).map((s) => spellIndex.get(norm(cleanSpell(s)))).filter(Boolean))
  for (const name of listed) {
    const id = spellIndex.get(norm(cleanSpell(name)))
    if (!id) { if (!unmatchedSpells.includes(name)) unmatchedSpells.push(name); continue }
    if (spells.some((s) => s.id === id)) continue
    const spell = SPELLS.find((s) => s.id === id)!
    spells.push({ id, prepared: spell.level === 0 || preparedNames.has(id) })
  }
  // If the sheet never marked "prepared", treat every listed spell as prepared.
  if (spells.length && !spells.some((s) => s.prepared && SPELLS.find((x) => x.id === s.id)!.level > 0)) {
    spells.forEach((s) => { s.prepared = true })
  }

  const slotsExpended = Array(9).fill(0)
  for (let lv = 1; lv <= 9; lv++) {
    const total = num(text(`SlotsTotal ${18 + lv}`))
    const left = num(text(`SlotsRemaining ${18 + lv}`))
    if (total !== null && left !== null && left <= total) slotsExpended[lv - 1] = total - left
    const used = num(text(`SlotsExpended${lv}`))
    if (used !== null) slotsExpended[lv - 1] = Math.max(0, used)
  }

  // ---- feats (scores on the sheet already include their bonuses, so nothing is re-applied)
  const feats: CharacterFeat[] = splitList(text('Feats')).map((name, i) => {
    const def = FEATS.find((f) => norm(f.name) === norm(name) || norm((featsHe as Record<string, { name: string }>)[f.id]?.name ?? '') === norm(name))
    return def
      ? { uid: `imp${i}`, featId: def.id, level, notes: '', applied: {} }
      : { uid: `imp${i}`, featId: 'custom', name, description: '', level, notes: '', applied: {} }
  })

  // ---- free text
  const attackNotes = text('AttacksSpellcasting', 'Attacks & Spellcasting')
  const additional = [
    text('Feat+Traits', 'Additional Features & Traits', 'Additional Features and Traits'),
    attackNotes,
    unmatchedSpells.length ? unmatchedSpells.join('\n') : '',
  ].filter(Boolean).join('\n\n')

  const hpMax = num(text('HPMax', 'Max HP', 'Hit Point Maximum')) ?? 0
  const character: ImportResult['character'] = {
    name: text('CharacterName', 'Character Name', 'CharacterName 2'),
    race: race?.id ?? '',
    subrace: subraceHit?.sub.id ?? '',
    classId: cls?.id ?? '',
    subclass: subclass?.id ?? '',
    level,
    background: bg?.id ?? '',
    alignment: text('Alignment'),
    xp: num(text('XP', 'Experience Points')) ?? 0,
    baseAbilities: { ...abilities },
    abilities,
    saveProfs,
    skillProfs,
    expertise,
    inspiration: !!text('Inspiration') && !/^(no|false|0|לא)$/i.test(text('Inspiration')),
    armorClass: num(text('AC', 'Armor Class')) ?? 10 + mod(abilities.dex),
    speed: num(text('Speed')) ?? (subraceHit?.sub.speed ?? race?.speed ?? 30),
    hpMax,
    hpCurrent: num(text('HPCurrent', 'Current HP')) ?? hpMax,
    hpTemp: num(text('HPTemp', 'Temp HP')) ?? 0,
    hitDiceUsed: Math.max(0, Math.min(level, num(text('HitDiceUsed')) ?? 0)),
    deathSaves: {
      successes: Math.min(3, num(text('DeathSaveSuccesses')) ?? rows[0] ?? 0),
      failures: Math.min(3, num(text('DeathSaveFailures')) ?? rows[1] ?? 0),
    },
    attacks,
    equipment: text('Equipment'),
    coins: {
      cp: num(text('CP')) ?? 0, sp: num(text('SP')) ?? 0, ep: num(text('EP')) ?? 0,
      gp: num(text('GP')) ?? 0, pp: num(text('PP')) ?? 0,
    },
    otherProficiencies: text('ProficienciesLang', 'Other Proficiencies & Languages'),
    features: text('Features and Traits', 'Features & Traits'),
    personality: text('PersonalityTraits', 'Personality Traits'),
    ideals: text('Ideals'),
    bonds: text('Bonds'),
    flaws: text('Flaws'),
    age: text('Age'), height: text('Height'), weight: text('Weight'),
    eyes: text('Eyes'), skin: text('Skin'), hair: text('Hair'),
    appearance: text('Appearance', 'Character Appearance'),
    portraitUrl: '',
    backstory: text('Backstory', 'Character Backstory'),
    allies: text('Allies', 'Allies & Organizations'),
    symbolName: text('FactionName'),
    additionalFeatures: additional,
    treasure: text('Treasure'),
    spells,
    slotsExpended,
    ...(feats.length ? { feats } : {}),
  }

  if (!character.name) warnings.push('noName')
  if (!cls) warnings.push('noClass')
  if (!race) warnings.push('noRace')
  if (!hpMax) warnings.push('noHp')

  return {
    character,
    source: { race: raceText, classLevel, background: bgText, playerName: text('PlayerName', 'Player Name') },
    unmatchedSpells,
    warnings,
  }
}

export async function importCharacterPdf(data: ArrayBuffer | Uint8Array): Promise<ImportResult> {
  const fields = await readPdfFields(data)
  if (!fields.length) throw new NoFormFieldsError()
  return mapFields(fields)
}
