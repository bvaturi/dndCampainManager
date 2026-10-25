/** Feats: PHB feat list, prerequisites, ASI/feat slots, and the sheet changes a feat makes. */
import featData from '../data/feats.json'
import { classById } from './rules'
import { casterInfo } from './spellAccess'
import { ABILITIES, type Ability, type Character, type CharacterFeat } from './types'

export interface FeatDef {
  id: string
  name: string
  summary: string
  /** Abilities the feat's +1 can go to (one of them). */
  asi?: Ability[]
  prereq?: {
    /** Any one of these minimums (e.g. Int 13 or Wis 13). */
    abilities?: Partial<Record<Ability, number>>[]
    spellcasting?: boolean
    armor?: 'light' | 'medium' | 'heavy'
  }
  effects?: { initiative?: number; passive?: number; hpPerLevel?: number; saveFromAsi?: boolean }
}

export const FEATS = featData as FeatDef[]
export const featById = (id: string) => FEATS.find((f) => f.id === id)

const ARMOR_FROM_FEAT: Record<string, 'light' | 'medium' | 'heavy'> = {
  'lightly-armored': 'light', 'moderately-armored': 'medium', 'heavily-armored': 'heavy',
}

function hasArmor(ch: Character, kind: 'light' | 'medium' | 'heavy') {
  const profs = (classById(ch.classId)?.proficiencies ?? []).map((p) => p.toLowerCase())
  if (profs.includes('all armor') || profs.includes(`${kind} armor`)) return true
  if (ch.subrace === 'mountain-dwarf' && kind !== 'heavy') return true
  return (ch.feats ?? []).some((f) => ARMOR_FROM_FEAT[f.featId] === kind)
}

export type PrereqProblem =
  | { kind: 'ability'; options: Partial<Record<Ability, number>>[] }
  | { kind: 'spellcasting' }
  | { kind: 'armor'; armor: 'light' | 'medium' | 'heavy' }

/** Unmet prerequisites (empty = the character qualifies). A warning, not a block: DMs can allow exceptions. */
export function prereqProblems(ch: Character, feat: FeatDef): PrereqProblem[] {
  const out: PrereqProblem[] = []
  const p = feat.prereq
  if (!p) return out
  if (p.abilities && !p.abilities.some((opt) => Object.entries(opt).every(([a, min]) => ch.abilities[a as Ability] >= (min as number)))) {
    out.push({ kind: 'ability', options: p.abilities })
  }
  if (p.spellcasting && !casterInfo(ch.classId, ch.subclass)) out.push({ kind: 'spellcasting' })
  if (p.armor && !hasArmor(ch, p.armor)) out.push({ kind: 'armor', armor: p.armor })
  return out
}

/** Class levels that grant an Ability Score Improvement (which can be taken as a feat instead). */
export function featSlotLevels(ch: Character): number[] {
  const cls = classById(ch.classId)
  if (!cls) return []
  // The level table names every ASI level (the feature list names the feature once).
  return cls.progression.filter((p) => p.features.some((n) => /ability score improvement/i.test(n))).map((p) => p.level)
}

export function featBonuses(ch: Character) {
  const owned = (ch.feats ?? []).map((f) => featById(f.featId)).filter(Boolean) as FeatDef[]
  return {
    initiative: owned.reduce((a, f) => a + (f.effects?.initiative ?? 0), 0),
    passive: owned.reduce((a, f) => a + (f.effects?.passive ?? 0), 0),
    hpPerLevel: owned.reduce((a, f) => a + (f.effects?.hpPerLevel ?? 0), 0),
    /** Feats (by name) that add to initiative, for the roll breakdown. */
    initiativeSources: owned.filter((f) => f.effects?.initiative).map((f) => ({ id: f.id, name: f.name, value: f.effects!.initiative! })),
  }
}

const newUid = () => Math.random().toString(36).slice(2, 10)

/** Add a feat and return the sheet patch (scores, saves, HP) it causes. */
export function addFeat(ch: Character, entry: Omit<CharacterFeat, 'uid' | 'applied'>): Partial<Character> {
  const def = featById(entry.featId)
  const abilities = { ...ch.abilities }
  const applied: NonNullable<CharacterFeat['applied']> = {}
  const bump = (a: Ability | undefined) => {
    if (!a || abilities[a] >= 20) return
    abilities[a] += 1
    applied.abilities = { ...applied.abilities, [a]: (applied.abilities?.[a] ?? 0) + 1 }
  }
  if (entry.featId === 'asi') { bump(entry.choice); bump(entry.choice2) }
  else if (def?.asi) bump(def.asi.length === 1 ? def.asi[0] : entry.choice)

  let saveProfs = ch.saveProfs
  const saveAbility = def?.effects?.saveFromAsi ? entry.choice : undefined
  if (saveAbility && !saveProfs.includes(saveAbility)) {
    saveProfs = [...saveProfs, saveAbility]
    applied.save = saveAbility
  }

  let { hpMax, hpCurrent } = ch
  if (def?.effects?.hpPerLevel) {
    applied.hp = def.effects.hpPerLevel * ch.level
    hpMax += applied.hp
    hpCurrent += applied.hp
  }

  const feat: CharacterFeat = { ...entry, uid: newUid(), applied }
  return { abilities, saveProfs, hpMax, hpCurrent, feats: [...(ch.feats ?? []), feat] }
}

/** Remove a feat and undo exactly what adding it changed. */
export function removeFeat(ch: Character, uid: string): Partial<Character> {
  const feat = (ch.feats ?? []).find((f) => f.uid === uid)
  if (!feat) return {}
  const abilities = { ...ch.abilities }
  for (const a of ABILITIES) abilities[a] -= feat.applied?.abilities?.[a] ?? 0
  const saveProfs = feat.applied?.save ? ch.saveProfs.filter((s) => s !== feat.applied!.save) : ch.saveProfs
  const hp = feat.applied?.hp ?? 0
  return {
    abilities,
    saveProfs,
    hpMax: ch.hpMax - hp,
    hpCurrent: Math.min(ch.hpCurrent, ch.hpMax - hp),
    feats: (ch.feats ?? []).filter((f) => f.uid !== uid),
  }
}

/** Extra HP per level from feats (Tough) when levelling up, plus the updated feat records. */
export function levelUpFeats(ch: Character): { hp: number; feats?: CharacterFeat[] } {
  const per = featBonuses(ch).hpPerLevel
  if (!per || !ch.feats) return { hp: 0 }
  return {
    hp: per,
    feats: ch.feats.map((f) => {
      const p = featById(f.featId)?.effects?.hpPerLevel
      return p ? { ...f, applied: { ...f.applied, hp: (f.applied?.hp ?? 0) + p } } : f
    }),
  }
}
