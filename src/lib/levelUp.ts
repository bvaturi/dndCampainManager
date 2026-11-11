/**
 * Levelling up (2014 PHB): average hit points for the new level, and every ability it brings — the class's
 * features at that level, upgrades the class table names ("Channel Divinity (2/rest)", "Ability Score
 * Improvement"), and the subclass's own features. Pure functions (unit-tested).
 */
import { levelUpFeats } from './feats'
import { averageHpPerLevel, classById, mod } from './rules'
import type { Character, CharacterFeat } from './types'

/** Extra hit points per level from race or subclass (Hill Dwarf's Dwarven Toughness, Draconic Resilience). */
export function bonusHpPerLevel(ch: Pick<Character, 'subrace' | 'classId' | 'subclass'>): number {
  return (ch.subrace === 'hill-dwarf' ? 1 : 0) + (ch.classId === 'sorcerer' && ch.subclass === 'draconic' ? 1 : 0)
}

/** One ability a level brings. `subclass` is '' for class features; `summary` is the short rules description. */
export interface GainedFeature { subclass: string; name: string; summary?: string }

export interface LevelUpGain {
  level: number
  hp: number
  features: GainedFeature[]
  feats?: CharacterFeat[]
}

/** "Channel Divinity (1/rest)" → "channel divinity": table entries often carry a count the feature name doesn't. */
const baseName = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()

/** The abilities a class (and chosen subclass) gains at exactly this level. */
export function featuresAtLevel(classId: string, subclass: string, level: number): GainedFeature[] {
  const cls = classById(classId)
  if (!cls) return []
  const sub = cls.subclasses.find((s) => s.id === subclass)
  const out: GainedFeature[] = cls.features
    .filter((f) => f.level === level)
    .map((f) => ({ subclass: '', name: f.name, summary: f.summary }))
  for (const n of cls.progression.find((p) => p.level === level)?.features ?? []) {
    // "… feature" placeholders become the subclass's features below (kept as a reminder if none is chosen yet).
    if (sub && /feature$/i.test(n.trim())) continue
    if (out.some((f) => baseName(f.name) === baseName(n))) continue
    out.push({ subclass: '', name: n })
  }
  for (const f of sub?.features ?? []) {
    if (f.level === level && !out.some((x) => x.name === f.name)) out.push({ subclass: sub!.id, name: f.name, summary: f.summary })
  }
  return out
}

export function levelUpGain(ch: Character): LevelUpGain | null {
  const cls = classById(ch.classId)
  if (!cls || ch.level >= 20) return null
  const next = ch.level + 1
  const fromFeats = levelUpFeats(ch)
  const hp = averageHpPerLevel(cls.hitDie) + mod(ch.abilities.con) + bonusHpPerLevel(ch) + fromFeats.hp
  return { level: next, hp, features: featuresAtLevel(ch.classId, ch.subclass, next), feats: fromFeats.feats }
}
