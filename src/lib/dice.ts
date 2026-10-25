/** Dice engine: d20 tests with advantage, and dice expressions like "2d6+3" or "1d8+1 slash.". */

export type RollMode = 'normal' | 'advantage' | 'disadvantage'

/** A labelled number added to the dice, e.g. { label: 'Dexterity', value: 3 }. */
export interface RollPart { label: string; value: number }

export interface DiceGroup {
  sides: number
  rolls: number[]
  /** Index into rolls of the die that counts (d20 with advantage/disadvantage); undefined = all count. */
  kept?: number
  negative?: boolean
}

export interface RollResult {
  id: string
  title: string
  subtitle?: string
  kind: 'check' | 'save' | 'attack' | 'damage' | 'initiative' | 'death' | 'hitdie' | 'custom'
  mode: RollMode
  dice: DiceGroup[]
  parts: RollPart[]
  total: number
  /** Natural 20 / natural 1 on a d20 test. */
  natural?: 'crit' | 'fumble'
  /** Damage expression to offer after an attack roll. */
  followUp?: { title: string; expr: string; parts?: RollPart[] }
  at: number
}

export function rollDie(sides: number): number {
  const buf = new Uint32Array(1)
  // Rejection sampling keeps every face equally likely.
  const limit = Math.floor(0x100000000 / sides) * sides
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return (buf[0] % sides) + 1
}

const newId = () => Math.random().toString(36).slice(2, 10)
const groupSum = (g: DiceGroup) =>
  (g.negative ? -1 : 1) * (g.kept !== undefined ? g.rolls[g.kept] : g.rolls.reduce((a, b) => a + b, 0))

/** d20 + parts. Advantage/disadvantage roll two d20s and keep the higher/lower. */
export function d20Test(
  opts: { title: string; subtitle?: string; kind: RollResult['kind']; parts: RollPart[]; mode?: RollMode; followUp?: RollResult['followUp'] },
): RollResult {
  const mode = opts.mode ?? 'normal'
  const rolls = mode === 'normal' ? [rollDie(20)] : [rollDie(20), rollDie(20)]
  let kept = 0
  if (mode === 'advantage' && rolls[1] > rolls[0]) kept = 1
  if (mode === 'disadvantage' && rolls[1] < rolls[0]) kept = 1
  const nat = rolls[kept]
  const parts = opts.parts.filter((p) => p.value !== 0)
  return {
    id: newId(),
    title: opts.title,
    subtitle: opts.subtitle,
    kind: opts.kind,
    mode,
    dice: [{ sides: 20, rolls, kept }],
    parts,
    total: nat + parts.reduce((a, p) => a + p.value, 0),
    natural: nat === 20 ? 'crit' : nat === 1 ? 'fumble' : undefined,
    followUp: opts.followUp,
    at: Date.now(),
  }
}

export interface ParsedExpr {
  dice: { count: number; sides: number; negative: boolean }[]
  flat: number
}

/**
 * Parse "2d6+3", "1d8 + 1d6 - 1", "d20", "1d4+3 pierc." (trailing words such as a damage type are ignored).
 * Returns null when there is nothing rollable.
 */
export function parseExpr(input: string): ParsedExpr | null {
  const s = input.toLowerCase().replace(/\s+/g, '')
  const term = /([+-]?)(?:(\d*)d(\d+)|(\d+))/y
  const out: ParsedExpr = { dice: [], flat: 0 }
  let pos = 0
  while (pos < s.length) {
    term.lastIndex = pos
    const m = term.exec(s)
    // Stop at the first non-dice text (e.g. "pierc."); terms after the first need a sign.
    if (!m || (pos > 0 && !m[1])) break
    const sign = m[1] === '-' ? -1 : 1
    if (m[3]) {
      const count = m[2] ? parseInt(m[2], 10) : 1
      const sides = parseInt(m[3], 10)
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null
      out.dice.push({ count, sides, negative: sign < 0 })
    } else {
      out.flat += sign * parseInt(m[4], 10)
    }
    pos = term.lastIndex
  }
  return out.dice.length ? out : null
}

/** Roll an expression. `crit` doubles the number of dice (5e critical hit). */
export function rollExpr(
  expr: string,
  opts: { title: string; subtitle?: string; kind?: RollResult['kind']; crit?: boolean; parts?: RollPart[]; flatLabel?: string },
): RollResult | null {
  const parsed = parseExpr(expr)
  if (!parsed) return null
  const dice: DiceGroup[] = parsed.dice.map((d) => ({
    sides: d.sides,
    negative: d.negative,
    rolls: Array.from({ length: d.count * (opts.crit ? 2 : 1) }, () => rollDie(d.sides)),
  }))
  // Prefer the caller's labelled breakdown when it adds up to the expression's flat bonus.
  const known = opts.parts?.filter((p) => p.value !== 0) ?? []
  const knownSum = known.reduce((a, p) => a + p.value, 0)
  const parts = known.length && knownSum === parsed.flat
    ? known
    : parsed.flat ? [{ label: opts.flatLabel ?? 'Modifier', value: parsed.flat }] : []
  return {
    id: newId(),
    title: opts.title,
    subtitle: opts.subtitle,
    kind: opts.kind ?? 'custom',
    mode: 'normal',
    dice,
    parts,
    total: dice.reduce((a, g) => a + groupSum(g), 0) + parts.reduce((a, p) => a + p.value, 0),
    at: Date.now(),
  }
}

export function describeDice(g: DiceGroup) {
  return `${g.negative ? '−' : ''}${g.kept !== undefined ? '' : g.rolls.length}d${g.sides}`
}
