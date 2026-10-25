import armorData from '../data/armor.json'
import backgroundData from '../data/backgrounds.json'
import classData from '../data/classes.json'
import raceData from '../data/races.json'
import spellData from '../data/spells.json'
import weaponData from '../data/weapons.json'
import type { Ability, AbilityScores, Character } from './types'

export interface Trait { id: string; name: string; desc: string }
export interface Subrace { id: string; name: string; bonuses: Partial<AbilityScores>; traits: Trait[]; speed?: number; srd?: boolean }
export interface Race {
  id: string; name: string; speed: number; size: string; bonuses: Partial<AbilityScores>
  languages: string[]; extraLanguages: number; traits: Trait[]; subraces: Subrace[]
  bonusChoice?: { choose: number; amount: number; from: Ability[] }
  /** Skill proficiencies the race always grants, and a choice of skills ('any' = any skill). */
  skills?: string[]
  skillChoice?: { choose: number; from: string[] | 'any' }
  /** 2024-style species: no fixed bonuses; the player picks +2/+1 or +1/+1/+1 (chosen abilities may repeat). */
  flexibleBonus?: boolean
  /** Book it comes from when not the 2014 Player's Handbook (VGM = Volo's Guide, ERLW = Eberron, PHB24 = 2024 PHB). */
  source?: string
}
export interface Feature { name: string; level: number; desc: string; summary?: string }
export interface LevelRow {
  level: number; prof: number; features: string[]; cantrips: number; known: number; slots: number[]
  /** Class-specific table columns from the PHB (Rages, Ki Points, Sneak Attack…). */
  columns?: Record<string, number | string>
}
export interface OptionGroup { feature: string; choices: { name: string; summary?: string; prerequisite?: string }[] }
export interface Subclass {
  id: string; name: string; srd: boolean; features: Feature[]; fullName?: string
  /** Subclass spell list (domain/oath/circle: keyed by class level; warlock patron: keyed by spell level). */
  spells?: Record<string, string[]>
  spellsByTerrain?: Record<string, Record<string, string[]>>
  options?: OptionGroup[]
}
export interface ClassDef {
  id: string; name: string; hitDie: number; saves: Ability[]; proficiencies: string[]
  skillChoice: { choose: number; from: string[] }; spellAbility: Ability | null
  prepared: 'full' | 'half' | null; subclassLevel: number; subclassFlavor: string
  progression: LevelRow[]; features: Feature[]; subclasses: Subclass[]
  startingEquipment: string[]; startingEquipmentOptions: { desc: string; options: string[] }[]
  options?: OptionGroup[]
}
export interface Background {
  id: string; name: string; skills: string[]; tools: string[]; languages: number
  feature: { name: string; desc: string }; gold: number; srd?: boolean
}
export interface Spell {
  id: string; name: string; level: number; school: string; castingTime: string; range: string
  components: string; concentration: boolean; ritual: boolean; source: string; srd: boolean
  classes: string[]; duration?: string; material?: string; desc?: string; higherLevel?: string
}
export interface Weapon {
  id: string; name: string; category: string; range: string; damage: string; damageType: string
  versatile?: string | null; properties: string[]; normalRange?: number | null; longRange?: number | null
}
export interface Armor { id: string; name: string; category: string; base: number; dex: boolean; maxDex?: number | null }

export const RACES = raceData as Race[]
export const CLASSES = classData as ClassDef[]
export const BACKGROUNDS = backgroundData as Background[]
export const SPELLS = spellData as Spell[]
export const WEAPONS = weaponData as Weapon[]
export const ARMOR = armorData as Armor[]

export const raceById = (id: string) => RACES.find((r) => r.id === id)
export const classById = (id: string) => CLASSES.find((c) => c.id === id)
export const backgroundById = (id: string) => BACKGROUNDS.find((b) => b.id === id)
export const spellById = (id: string) => SPELLS.find((s) => s.id === id)

export const ABILITY_NAMES: Record<Ability, { en: string; he: string; short: { en: string; he: string } }> = {
  str: { en: 'Strength', he: 'כוח', short: { en: 'Str', he: 'כוח' } },
  dex: { en: 'Dexterity', he: 'זריזות', short: { en: 'Dex', he: 'זרי' } },
  con: { en: 'Constitution', he: 'חוסן', short: { en: 'Con', he: 'חוס' } },
  int: { en: 'Intelligence', he: 'תבונה', short: { en: 'Int', he: 'תבו' } },
  wis: { en: 'Wisdom', he: 'חוכמה', short: { en: 'Wis', he: 'חוכ' } },
  cha: { en: 'Charisma', he: 'כריזמה', short: { en: 'Cha', he: 'כרי' } },
}

export const SKILLS: { id: string; ability: Ability; en: string; he: string }[] = [
  { id: 'acrobatics', ability: 'dex', en: 'Acrobatics', he: 'אקרובטיקה' },
  { id: 'animal-handling', ability: 'wis', en: 'Animal Handling', he: 'טיפול בחיות' },
  { id: 'arcana', ability: 'int', en: 'Arcana', he: 'תורת הנסתר' },
  { id: 'athletics', ability: 'str', en: 'Athletics', he: 'אתלטיקה' },
  { id: 'deception', ability: 'cha', en: 'Deception', he: 'הונאה' },
  { id: 'history', ability: 'int', en: 'History', he: 'היסטוריה' },
  { id: 'insight', ability: 'wis', en: 'Insight', he: 'תובנה' },
  { id: 'intimidation', ability: 'cha', en: 'Intimidation', he: 'הפחדה' },
  { id: 'investigation', ability: 'int', en: 'Investigation', he: 'חקירה' },
  { id: 'medicine', ability: 'wis', en: 'Medicine', he: 'רפואה' },
  { id: 'nature', ability: 'int', en: 'Nature', he: 'טבע' },
  { id: 'perception', ability: 'wis', en: 'Perception', he: 'תפיסה' },
  { id: 'performance', ability: 'cha', en: 'Performance', he: 'הופעה' },
  { id: 'persuasion', ability: 'cha', en: 'Persuasion', he: 'שכנוע' },
  { id: 'religion', ability: 'int', en: 'Religion', he: 'דת' },
  { id: 'sleight-of-hand', ability: 'dex', en: 'Sleight of Hand', he: 'קלות ידיים' },
  { id: 'stealth', ability: 'dex', en: 'Stealth', he: 'התגנבות' },
  { id: 'survival', ability: 'wis', en: 'Survival', he: 'הישרדות' },
]

export const ALIGNMENTS: { en: string; he: string }[] = [
  { en: 'Lawful Good', he: 'חוקי טוב' }, { en: 'Neutral Good', he: 'ניטרלי טוב' }, { en: 'Chaotic Good', he: 'כאוטי טוב' },
  { en: 'Lawful Neutral', he: 'חוקי ניטרלי' }, { en: 'True Neutral', he: 'ניטרלי' }, { en: 'Chaotic Neutral', he: 'כאוטי ניטרלי' },
  { en: 'Lawful Evil', he: 'חוקי רשע' }, { en: 'Neutral Evil', he: 'ניטרלי רשע' }, { en: 'Chaotic Evil', he: 'כאוטי רשע' },
]

export const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation']

export const XP_FOR_LEVEL = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

export const mod = (score: number) => Math.floor((score - 10) / 2)
export const profBonus = (level: number) => Math.ceil(level / 4) + 1
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }

export function racialBonuses(raceId: string, subraceId: string, chosen: Ability[]): AbilityScores {
  const out: AbilityScores = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
  const race = raceById(raceId)
  if (!race) return out
  const sub = race.subraces.find((s) => s.id === subraceId)
  for (const src of [race.bonuses, sub?.bonuses || {}]) {
    for (const [k, v] of Object.entries(src)) out[k as Ability] += v as number
  }
  if (race.bonusChoice) for (const a of chosen) out[a] += race.bonusChoice.amount
  else if (race.flexibleBonus) for (const a of chosen) out[a] += 1
  return out
}

export function levelRow(cls: ClassDef | undefined, level: number): LevelRow | undefined {
  return cls?.progression.find((p) => p.level === level)
}

export function averageHpPerLevel(hitDie: number) {
  return Math.floor(hitDie / 2) + 1
}

export function startingHp(cls: ClassDef, level: number, conMod: number, subrace: string) {
  const toughness = subrace === 'hill-dwarf' ? level : 0
  return cls.hitDie + conMod + (level - 1) * (averageHpPerLevel(cls.hitDie) + conMod) + toughness
}

const norm = (s: string) => s.toLowerCase().replace(/^\d+\s*×\s*/, '').trim()
export const findWeapon = (label: string) => WEAPONS.find((w) => norm(w.name) === norm(label))
export const findArmor = (label: string) => ARMOR.find((a) => norm(a.name) === norm(label))

/** Expand "Leather Armor + Longbow + 20 × Arrow" into item labels. */
export const splitItems = (label: string) => label.split(' + ').map((s) => s.trim()).filter(Boolean)

/** Weapons matching an "any Martial Melee Weapons" style category label, or null if not a weapon category. */
export function weaponsForCategory(label: string): Weapon[] | null {
  const m = /^(?:\d+\s*×\s*)?any (simple|martial)(?: (melee|ranged))? weapons?$/i.exec(label.trim())
  if (!m) return null
  return WEAPONS.filter((w) => w.category.toLowerCase() === m[1].toLowerCase() && (!m[2] || w.range.toLowerCase() === m[2].toLowerCase()))
}

export function armorClass(items: string[], cls: ClassDef | undefined, subclass: string, a: AbilityScores) {
  const dex = mod(a.dex)
  const armor = items.map(findArmor).filter(Boolean) as Armor[]
  const body = armor.find((x) => x.category !== 'Shield')
  const shield = armor.some((x) => x.category === 'Shield') ? 2 : 0
  if (body) {
    const dexPart = body.dex ? (body.maxDex != null ? Math.min(dex, body.maxDex) : dex) : 0
    return body.base + dexPart + shield
  }
  if (cls?.id === 'barbarian') return 10 + dex + mod(a.con) + shield
  if (cls?.id === 'monk' && !shield) return 10 + dex + mod(a.wis)
  if (cls?.id === 'sorcerer' && subclass === 'draconic') return 13 + dex + shield
  return 10 + dex + shield
}

const DAMAGE_SHORT: Record<string, string> = { bludgeoning: 'bludg.', piercing: 'pierc.', slashing: 'slash.' }

export function weaponAttack(w: Weapon, a: AbilityScores, prof: number) {
  const str = mod(a.str)
  const dex = mod(a.dex)
  const abil = w.properties.includes('finesse') ? Math.max(str, dex) : w.range === 'Ranged' ? dex : str
  const dmg = w.damage ? `${w.damage}${abil ? signed(abil) : ''} ${DAMAGE_SHORT[w.damageType] ?? w.damageType}` : ''
  return { name: w.name, bonus: signed(abil + prof), damage: dmg.trim() }
}

export function skillBonus(c: Pick<Character, 'abilities' | 'skillProfs' | 'expertise' | 'level'>, skillId: string) {
  const skill = SKILLS.find((s) => s.id === skillId)!
  const pb = profBonus(c.level)
  const p = c.expertise.includes(skillId) ? 2 * pb : c.skillProfs.includes(skillId) ? pb : 0
  return mod(c.abilities[skill.ability]) + p
}
