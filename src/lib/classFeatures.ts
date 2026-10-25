/**
 * Class & subclass features from the PHB audit (scripts/phb_audit, merged into classes.json by build_data.py):
 * what a character has at their level, and limited-use resources (Lay on Hands, Rage, Ki…) with rest rules.
 */
import classFeaturesHe from '../data/classFeatures.he.json'
import { getHomebrew } from './homebrewRegistry'
import { classById, mod, profBonus, type Feature } from './rules'
import type { Ability, Character, HomebrewAbility } from './types'

const FEATURE_HE = classFeaturesHe as Record<string, { name?: string; summary?: string }>

/** Hebrew name of a class or subclass feature from the PHB translation table (undefined if not translated). */
export function featureNameHe(classId: string, subclass: string, name: string): string | undefined {
  return FEATURE_HE[`${classId}|${subclass}|${name}`]?.name ?? FEATURE_HE[`${classId}||${name}`]?.name
}

/** Stand-in for "Unlimited" (e.g. a 20th-level barbarian's rages). */
export const UNLIMITED = 999

export interface ResourceDef {
  key: string
  label: string
  /** Number, or expression: level, prof, str…cha, table:<Column>, + - *, max(), min(). */
  max?: number | string
  /** Value from that class level on (overrides max). */
  byLevel?: Record<string, number>
  recharge: 'short' | 'long'
  shortRestFrom?: number
}

export interface ClassFeature extends Feature {
  summary?: string
  resource?: ResourceDef | null
  subclass?: string
}

export interface ResourceState extends ResourceDef {
  total: number
  used: number
  /** Feature / trait / feat it comes from (English), and its Hebrew name when known. */
  source: string
  labelHe?: string
  origin: 'class' | 'race' | 'feat' | 'homebrew'
}

type ExtraResource = ResourceDef & { from?: number; labelHe: string; source: string }

/** Racial traits with limited uses (PHB). Keyed by race or subrace id. */
const RACE_RESOURCES: Record<string, ExtraResource[]> = {
  dragonborn: [{ key: 'breath-weapon', label: 'Breath Weapon', labelHe: 'נשיפת דרקון', max: 1, recharge: 'short', source: 'Breath Weapon' }],
  goliath: [{ key: 'stones-endurance', label: "Stone's Endurance", labelHe: 'סיבולת האבן', max: 1, recharge: 'short', source: "Stone's Endurance" }],
  'half-orc': [{ key: 'relentless-endurance', label: 'Relentless Endurance', labelHe: 'סיבולת בלתי נלאית', max: 1, recharge: 'long', source: 'Relentless Endurance' }],
  orc: [
    { key: 'adrenaline-rush', label: 'Adrenaline Rush', labelHe: 'פרץ אדרנלין', max: 'prof', recharge: 'short', source: 'Adrenaline Rush' },
    { key: 'relentless-endurance', label: 'Relentless Endurance', labelHe: 'סיבולת בלתי נלאית', max: 1, recharge: 'long', source: 'Relentless Endurance' },
  ],
  tiefling: [
    { key: 'hellish-rebuke', label: 'Hellish Rebuke (2nd level)', labelHe: 'נזיפה גיהנומית (דרגה 2)', max: 1, recharge: 'long', from: 3, source: 'Infernal Legacy' },
    { key: 'tiefling-darkness', label: 'Darkness', labelHe: 'חשכה', max: 1, recharge: 'long', from: 5, source: 'Infernal Legacy' },
  ],
  'dark-elf': [
    { key: 'drow-faerie-fire', label: 'Faerie Fire', labelHe: 'אש פיות', max: 1, recharge: 'long', from: 3, source: 'Drow Magic' },
    { key: 'drow-darkness', label: 'Darkness', labelHe: 'חשכה', max: 1, recharge: 'long', from: 5, source: 'Drow Magic' },
  ],
}

/** Feats with limited uses. */
const FEAT_RESOURCES: Record<string, ExtraResource> = {
  lucky: { key: 'feat-lucky', label: 'Luck points', labelHe: 'נקודות מזל', max: 3, recharge: 'long', source: 'Lucky' },
  'martial-adept': { key: 'feat-martial-adept', label: 'Superiority die (d6)', labelHe: 'קוביית עליונות (d6)', max: 1, recharge: 'short', source: 'Martial Adept' },
  'magic-initiate': { key: 'feat-magic-initiate', label: 'Free 1st-level cast', labelHe: 'הטלת דרגה 1 חינם', max: 1, recharge: 'long', source: 'Magic Initiate' },
}

/** Evaluate a resource expression for a character. Unknown tokens count as 0; result is never negative. */
export function evalExpr(expr: number | string, ch: Pick<Character, 'level' | 'abilities' | 'classId'>): number {
  if (typeof expr === 'number') return expr
  const cls = classById(ch.classId)
  const row = cls?.progression.find((p) => p.level === ch.level)
  const vars: Record<string, number> = { level: ch.level, prof: profBonus(ch.level) }
  for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]) vars[a] = mod(ch.abilities[a])

  // Tiny recursive-descent parser: expr := term (('+'|'-') term)* ; term := factor ('*' factor)* ;
  // factor := number | name | table:<Column> | fn '(' expr ',' expr ')' | '(' expr ')'
  const s = expr.replace(/\s+/g, '')
  let i = 0
  const peek = () => s[i]
  const parseExpr = (): number => {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r }
    return v
  }
  const parseTerm = (): number => {
    let v = parseFactor()
    while (peek() === '*') { i++; v *= parseFactor() }
    return v
  }
  const parseFactor = (): number => {
    if (peek() === '(') { i++; const v = parseExpr(); i++; return v }
    if (peek() === '-') { i++; return -parseFactor() }
    const num = /^\d+/.exec(s.slice(i))
    if (num) { i += num[0].length; return parseInt(num[0], 10) }
    if (s.startsWith('table:', i)) {
      i += 6
      const m = /^[^+\-*(),]+/.exec(s.slice(i))
      const col = m ? m[0] : ''
      i += col.length
      const cols = row?.columns ?? {}
      const key = Object.keys(cols).find((k) => k.replace(/\s+/g, '').toLowerCase() === col.toLowerCase())
      const raw = key ? cols[key] : 0
      if (typeof raw === 'number') return raw
      if (/unlimited/i.test(String(raw))) return UNLIMITED
      return parseInt(String(raw).replace(/[^\d-]/g, ''), 10) || 0
    }
    const name = /^[a-z]+/i.exec(s.slice(i))
    if (name) {
      i += name[0].length
      if ((name[0] === 'max' || name[0] === 'min') && peek() === '(') {
        i++
        const a = parseExpr(); i++ // ','
        const b = parseExpr(); i++ // ')'
        return name[0] === 'max' ? Math.max(a, b) : Math.min(a, b)
      }
      return vars[name[0].toLowerCase()] ?? 0
    }
    i++
    return 0
  }
  return Math.max(0, Math.floor(parseExpr()))
}

export function resourceTotal(def: ResourceDef, ch: Pick<Character, 'level' | 'abilities' | 'classId'>): number {
  if (def.byLevel) {
    let v = 0
    for (const [lv, n] of Object.entries(def.byLevel)) if (ch.level >= +lv) v = n
    return v
  }
  return def.max !== undefined ? evalExpr(def.max, ch) : 0
}

/** Every class + subclass feature (any level), each tagged with its subclass id when it comes from one. */
export function allFeatures(classId: string, subclass: string): ClassFeature[] {
  const cls = classById(classId)
  if (!cls) return []
  const sub = cls.subclasses.find((s) => s.id === subclass)
  return [
    ...(cls.features as ClassFeature[]),
    ...((sub?.features ?? []) as ClassFeature[]).map((f) => ({ ...f, subclass: sub!.id })),
  ].sort((a, b) => a.level - b.level)
}

/** Limited-use resources the character currently has (from features at or below their level). */
export function characterResources(ch: Character): ResourceState[] {
  const seen = new Set<string>()
  const out: ResourceState[] = []
  for (const f of allFeatures(ch.classId, ch.subclass)) {
    if (f.level > ch.level || !f.resource || seen.has(f.resource.key)) continue
    // Pact Magic slots are the warlock's spell slots, tracked (and spent by casting) on the spell page.
    if (f.resource.key === 'pact-slots') continue
    const total = resourceTotal(f.resource, ch)
    if (total <= 0) continue
    seen.add(f.resource.key)
    out.push({
      ...f.resource, total, used: Math.min(total, ch.resources?.[f.resource.key] ?? 0), source: f.name,
      labelHe: FEATURE_HE[`${ch.classId}|res|${f.resource.key}`]?.name, origin: 'class',
    })
  }
  const extra = (r: ExtraResource, origin: 'race' | 'feat') => {
    if ((r.from ?? 0) > ch.level || seen.has(r.key)) return
    seen.add(r.key)
    const total = resourceTotal(r, ch)
    out.push({ ...r, total, used: Math.min(total, ch.resources?.[r.key] ?? 0), origin })
  }
  for (const r of [...(RACE_RESOURCES[ch.race] ?? []), ...(RACE_RESOURCES[ch.subrace] ?? [])]) extra(r, 'race')
  for (const f of ch.feats ?? []) if (FEAT_RESOURCES[f.featId]) extra(FEAT_RESOURCES[f.featId], 'feat')
  // Homebrew abilities the DM granted (the campaign's approved library). Keyed by the item id.
  for (const h of getHomebrew()) {
    if (h.kind !== 'ability' || !h.uses || !h.grantedTo.includes(ch.id) || seen.has(h.id)) continue
    const a = h as HomebrewAbility
    const def: ResourceDef = { key: a.id, label: a.name, max: a.uses!.max.toLowerCase(), recharge: a.uses!.recharge }
    const total = resourceTotal(def, ch)
    if (total <= 0) continue
    seen.add(a.id)
    out.push({ ...def, total, used: Math.min(total, ch.resources?.[a.id] ?? 0), source: a.name, origin: 'homebrew' })
  }
  return out
}

/** Display name of a resource in the current language. */
export function resourceLabel(r: ResourceState, lang: 'en' | 'he') {
  return (lang === 'he' && r.labelHe) || r.label
}

/** Which recharge a resource follows at this level (some switch to short rest later). */
export function rechargeAt(def: ResourceDef, level: number): 'short' | 'long' {
  return def.shortRestFrom && level >= def.shortRestFrom ? 'short' : def.recharge
}

/**
 * Sheet changes for a rest. Short: refills short-rest resources (and warlock pact slots).
 * Long: refills everything, HP to max, regains half of total hit dice (min 1), clears death saves and spell slots.
 */
export function restPatch(ch: Character, kind: 'short' | 'long'): Partial<Character> {
  const resources = { ...(ch.resources ?? {}) }
  for (const r of characterResources(ch)) {
    if (kind === 'long' || rechargeAt(r, ch.level) === 'short') delete resources[r.key]
  }
  if (kind === 'short') {
    return { resources, ...(ch.classId === 'warlock' ? { slotsExpended: Array(9).fill(0) } : {}) }
  }
  const regain = Math.max(1, Math.floor(ch.level / 2))
  return {
    resources,
    hpCurrent: ch.hpMax,
    hpTemp: 0,
    hitDiceUsed: Math.max(0, ch.hitDiceUsed - regain),
    deathSaves: { successes: 0, failures: 0 },
    slotsExpended: Array(9).fill(0),
  }
}
