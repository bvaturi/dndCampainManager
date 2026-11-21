/**
 * Lays the spell page out for printing. The classic sheet has ten fixed blocks in three columns; a character with
 * more spells than a column holds would run off the paper, so then the blocks flow column by column and continue
 * on further pages, splitting a level where needed. Pure function (unit-tested).
 */

/** Part of one spell level's block: lines [from, to) of that level's spells, plus blank lines to write on. */
export interface SpellSegment { level: number; from: number; to: number; pad: number; continued: boolean }
/** One printed spell page: three columns of segments. */
export type SpellPage = SpellSegment[][]

/** Heights in sheet pixels (see sheet.css: .spell-block, .spell-block-head, .spell-lines li, .p3-col gap). */
export const SPELL_PAGE = { capacity: 915, block: 52, line: 20, gap: 10, legend: 14 }
const CLASSIC_COLUMNS = [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]]
const CLASSIC_LINES = [6, 10, 10, 8, 8, 8, 5, 5, 5, 5]

const blockHeight = (level: number, lines: number, continued = false) =>
  SPELL_PAGE.block + (level === 1 && !continued ? SPELL_PAGE.legend : 0) + lines * SPELL_PAGE.line

/**
 * @param counts spells on the sheet per spell level (index 0 = cantrips … 9)
 * @param castable levels the character has slots for; an empty block is still printed for these when flowing
 */
export function layoutSpellPages(counts: number[], castable: boolean[] = []): SpellPage[] {
  const n = (lv: number) => counts[lv] ?? 0
  // The classic layout, when every column fits.
  const classic = CLASSIC_COLUMNS.map((col) => col.map((level): SpellSegment => ({
    level, from: 0, to: n(level), pad: Math.max(0, CLASSIC_LINES[level] - n(level)), continued: false,
  })))
  const height = (col: SpellSegment[]) => col.reduce((h, s, i) => h + blockHeight(s.level, s.to - s.from + s.pad, s.continued) + (i ? SPELL_PAGE.gap : 0), 0)
  if (classic.every((col) => height(col) <= SPELL_PAGE.capacity)) return [classic]

  // Flow: every level with spells or slots, in order, filling column after column and page after page.
  const pages: SpellPage[] = []
  let page: SpellPage = [[], [], []]
  let col = 0
  let used = 0
  const nextColumn = () => {
    col++
    used = 0
    if (col === 3) { pages.push(page); page = [[], [], []]; col = 0 }
  }
  for (let level = 0; level <= 9; level++) {
    const total = n(level)
    if (!total && !(castable[level] && level > 0)) continue
    let from = 0
    let continued = false
    // A level with slots but no spells yet keeps a few lines to write on; a full one gets one spare line.
    const spare = total ? 1 : 3
    while (from < total || (total === 0 && !continued)) {
      const gap = used ? SPELL_PAGE.gap : 0
      const room = Math.floor((SPELL_PAGE.capacity - used - gap - blockHeight(level, 0, continued)) / SPELL_PAGE.line)
      const left = total - from
      // Not even three lines fit here (or the whole empty block doesn't): start it in the next column.
      if (room < Math.min(3, left + spare) && used > 0) { nextColumn(); continue }
      const take = Math.min(left, room)
      const pad = take === left ? Math.min(spare, room - take) : 0
      page[col].push({ level, from, to: from + take, pad, continued })
      used += gap + blockHeight(level, take + pad, continued)
      from += take
      continued = true
      if (from < total) nextColumn()
    }
  }
  if (page.some((c) => c.length) || !pages.length) pages.push(page)
  return pages
}
