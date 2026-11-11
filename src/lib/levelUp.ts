/**
 * Levelling up (2014 PHB): average hit points for the new level, and every feature it brings — the class table's
 * features plus the subclass's own features at that level. Pure functions (unit-tested).
 */
import { levelUpFeats } from './feats'
import { averageHpPerLevel, classById, mod } from './rules'
import type { Character, CharacterFeat } from './types'

/** Extra hit points per level from race or subclass (Hill Dwarf's Dwarven Toughness, Draconic Resilience). */
export function bonusHpPerLevel(ch: Pick<Character, 'subrace' | 'classId' | 'subclass'>): number {
  return (ch.subrace === 'hill-dwarf' ? 1 : 0) + (ch.classId === 'sorcerer' && ch.subclass === 'draconic' ? 1 : 0)
}

export interface LevelUpGain {
  level: number
  hp: number
  /** Feature names the new level gives, as [subclass id ('' for the class), English name]. */
  features: [string, string][]
  feats?: CharacterFeat[]
}

export function levelUpGain(ch: Character): LevelUpGain | null {
  const cls = classById(ch.classId)
  if (!cls || ch.level >= 20) return null
  const next = ch.level + 1
  const fromFeats = levelUpFeats(ch)
  const hp = averageHpPerLevel(cls.hitDie) + mod(ch.abilities.con) + bonusHpPerLevel(ch) + fromFeats.hp
  const sub = cls.subclasses.find((s) => s.id === ch.subclass)
  const row = cls.progression.find((p) => p.level === next)
  // The table writes subclass levels as "… feature" placeholders; those become the subclass's features below.
  const features: [string, string][] = (row?.features ?? [])
    .filter((n) => !(sub && /feature$/i.test(n.trim())))
    .map((n) => ['', n])
  for (const f of sub?.features ?? []) {
    if (f.level === next && !features.some(([, n]) => n === f.name)) features.push([sub!.id, f.name])
  }
  return { level: next, hp, features, feats: fromFeats.feats }
}
