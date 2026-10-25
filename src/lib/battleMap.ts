/** Battle map helpers: grid geometry, token labels, auto-placement. Pure functions (unit-tested). */
import type { BattleMap, MapPos } from './types'

/** One square on the grid, per the 5e rules. */
export const FEET_PER_SQUARE = 5

type Grid = Pick<BattleMap, 'width' | 'height' | 'cols' | 'rows' | 'offsetX' | 'offsetY'>

export function cellSize(m: Grid) {
  return { w: m.width / Math.max(1, m.cols), h: m.height / Math.max(1, m.rows) }
}

/** Centre of square (x, y) in image pixels. */
export function cellCenter(m: Grid, x: number, y: number) {
  const { w, h } = cellSize(m)
  return { cx: (m.offsetX + x + 0.5) * w, cy: (m.offsetY + y + 0.5) * h }
}

/** Square under a point in image pixels, clamped to the grid. */
export function cellAt(m: Grid, px: number, py: number) {
  const { w, h } = cellSize(m)
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v))
  return { x: clamp(Math.floor(px / w - m.offsetX), m.cols), y: clamp(Math.floor(py / h - m.offsetY), m.rows) }
}

/** Rows that make the squares square for a given number of columns. */
export function squareRows(width: number, height: number, cols: number) {
  return Math.max(1, Math.round((cols * height) / Math.max(1, width)))
}

/** True when the squares are visibly stretched (more than 5% off square). */
export function isStretched(m: Grid) {
  const { w, h } = cellSize(m)
  return Math.abs(w / h - 1) > 0.05
}

/** Short label for a round token: "Goblin 3" → "G3", "Lia Moonwhisper" → "LM", "Thorin" → "TH". */
export function tokenInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const last = words[words.length - 1]
  if (words.length > 1 && /^\d+$/.test(last)) return (words[0][0] + last).toUpperCase()
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase()
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase()
}

/**
 * Free squares for tokens not yet on the map: players fill from the left column, enemies from the right,
 * top to bottom, skipping occupied squares.
 */
export function freeCells(m: Grid, taken: MapPos[], count: number, side: 'start' | 'end') {
  const used = new Set(taken.map((p) => `${p.x},${p.y}`))
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < m.cols && out.length < count; i++) {
    const x = side === 'start' ? i : m.cols - 1 - i
    for (let y = 0; y < m.rows && out.length < count; y++) {
      const key = `${x},${y}`
      if (!used.has(key)) { used.add(key); out.push({ x, y }) }
    }
  }
  return out
}

/** Scale a picture so its longest side is at most `max`. */
export function fitSize(width: number, height: number, max: number) {
  const k = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}
