/**
 * The PDF form fields the character importer understands. The AI helper prompt is generated from this list,
 * so the prompt and the importer can never drift apart.
 *
 * Names match the official form-fillable 5e sheet where one exists; the "list" fields are extras that make
 * AI-made PDFs reliable (text lists instead of position-dependent checkboxes).
 */
export type FieldFormat = 'text' | 'number' | 'multiline' | 'list'

export interface FieldSpec {
  name: string
  format: FieldFormat
  /** What goes in the field, written for the AI. */
  hint: string
  group: 'identity' | 'abilities' | 'proficiencies' | 'combat' | 'gear' | 'personality' | 'details' | 'spells'
}

const n = (name: string, hint: string, group: FieldSpec['group']): FieldSpec => ({ name, format: 'number', hint, group })
const tx = (name: string, hint: string, group: FieldSpec['group']): FieldSpec => ({ name, format: 'text', hint, group })
const ml = (name: string, hint: string, group: FieldSpec['group']): FieldSpec => ({ name, format: 'multiline', hint, group })
const ls = (name: string, hint: string, group: FieldSpec['group']): FieldSpec => ({ name, format: 'list', hint, group })

export const IMPORT_FIELDS: FieldSpec[] = [
  tx('CharacterName', 'Character name', 'identity'),
  tx('PlayerName', 'Player name', 'identity'),
  tx('ClassLevel', 'Class and level, e.g. "Wizard 5". Multiclass: "Fighter 3 / Wizard 2"', 'identity'),
  tx('Subclass', 'Subclass name only, e.g. "Evocation" or "Battle Master" (blank if none yet)', 'identity'),
  tx('Race', 'Race including subrace, e.g. "Hill Dwarf", "High Elf", "Tiefling"', 'identity'),
  tx('Background', 'Background, e.g. "Sage"', 'identity'),
  tx('Alignment', 'Alignment, e.g. "Neutral Good"', 'identity'),
  n('XP', 'Experience points', 'identity'),

  n('STR', 'Strength score (the score, e.g. 15 — not the modifier)', 'abilities'),
  n('DEX', 'Dexterity score', 'abilities'),
  n('CON', 'Constitution score', 'abilities'),
  n('INT', 'Intelligence score', 'abilities'),
  n('WIS', 'Wisdom score', 'abilities'),
  n('CHA', 'Charisma score', 'abilities'),

  ls('SaveProficiencies', 'Abilities whose saving throws are proficient, e.g. "Wisdom, Charisma"', 'proficiencies'),
  ls('SkillProficiencies', 'Proficient skills, e.g. "Insight, Medicine, Religion" (include expertise skills here too)', 'proficiencies'),
  ls('SkillExpertise', 'Skills with expertise (double proficiency), e.g. "Stealth, Perception"', 'proficiencies'),
  ml('ProficienciesLang', 'Other proficiencies and languages (armor, weapons, tools, languages), as on the sheet', 'proficiencies'),
  ls('Feats', 'Feats the character has, e.g. "War Caster, Alert" (blank if none)', 'proficiencies'),

  n('AC', 'Armor Class', 'combat'),
  n('Speed', 'Walking speed in feet, number only, e.g. 30', 'combat'),
  n('HPMax', 'Hit point maximum', 'combat'),
  n('HPCurrent', 'Current hit points (blank = same as maximum)', 'combat'),
  n('HPTemp', 'Temporary hit points', 'combat'),
  n('HitDiceUsed', 'Hit dice already spent (0 if fresh)', 'combat'),
  n('DeathSaveSuccesses', 'Death save successes marked (0-3)', 'combat'),
  n('DeathSaveFailures', 'Death save failures marked (0-3)', 'combat'),
  tx('Inspiration', 'Write "yes" if the character has inspiration, otherwise leave blank', 'combat'),
  tx('Wpn Name', 'Attack 1 name, e.g. "Longsword"', 'combat'),
  tx('Wpn1 AtkBonus', 'Attack 1 bonus to hit, e.g. "+5"', 'combat'),
  tx('Wpn1 Damage', 'Attack 1 damage, e.g. "1d8+3 slashing"', 'combat'),
  tx('Wpn Name 2', 'Attack 2 name', 'combat'),
  tx('Wpn2 AtkBonus', 'Attack 2 bonus to hit', 'combat'),
  tx('Wpn2 Damage', 'Attack 2 damage', 'combat'),
  tx('Wpn Name 3', 'Attack 3 name', 'combat'),
  tx('Wpn3 AtkBonus', 'Attack 3 bonus to hit', 'combat'),
  tx('Wpn3 Damage', 'Attack 3 damage', 'combat'),
  ml('AttacksSpellcasting', 'Any extra attack/spellcasting notes from that box on the sheet', 'combat'),

  n('CP', 'Copper pieces', 'gear'),
  n('SP', 'Silver pieces', 'gear'),
  n('EP', 'Electrum pieces', 'gear'),
  n('GP', 'Gold pieces', 'gear'),
  n('PP', 'Platinum pieces', 'gear'),
  ml('Equipment', 'Equipment, one item per line', 'gear'),
  ml('Treasure', 'Treasure, one item per line', 'gear'),

  ml('PersonalityTraits', 'Personality traits', 'personality'),
  ml('Ideals', 'Ideals', 'personality'),
  ml('Bonds', 'Bonds', 'personality'),
  ml('Flaws', 'Flaws', 'personality'),
  ml('Features and Traits', 'Features & traits (class, race, background features), one per line', 'personality'),
  ml('Feat+Traits', 'Additional features & traits (page 2)', 'personality'),

  tx('Age', 'Age', 'details'),
  tx('Height', 'Height', 'details'),
  tx('Weight', 'Weight', 'details'),
  tx('Eyes', 'Eyes', 'details'),
  tx('Skin', 'Skin', 'details'),
  tx('Hair', 'Hair', 'details'),
  ml('Appearance', 'Character appearance description', 'details'),
  ml('Backstory', 'Character backstory', 'details'),
  ml('Allies', 'Allies & organizations', 'details'),
  tx('FactionName', 'Name of the faction/symbol', 'details'),

  ls('SpellsCantrips', 'Cantrips known, one per line', 'spells'),
  ...Array.from({ length: 9 }, (_, i) => ls(`SpellsLevel${i + 1}`, `Level ${i + 1} spells, one per line`, 'spells')),
  ls('SpellsPrepared', 'Which of the leveled spells above are prepared, one per line (blank = all of them)', 'spells'),
  ...Array.from({ length: 9 }, (_, i) => n(`SlotsExpended${i + 1}`, `Level ${i + 1} spell slots already used (0 if none)`, 'spells')),
]

/** Split a list field: commas, semicolons or new lines; drops bullets and empty items. */
export function splitList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^\s*[-•*·]\s*/, '').trim())
    .filter(Boolean)
}
