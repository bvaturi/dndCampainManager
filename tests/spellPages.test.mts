// Printed spell page layout. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPELL_PAGE, layoutSpellPages, type SpellSegment } from '../src/lib/spellPages'

const height = (col: SpellSegment[]) => col.reduce((h, s, i) =>
  h + SPELL_PAGE.block + (s.level === 1 && !s.continued ? SPELL_PAGE.legend : 0) + (s.to - s.from + s.pad) * SPELL_PAGE.line + (i ? SPELL_PAGE.gap : 0), 0)

test('a short spell list prints as the classic page: ten blocks in three columns', () => {
  const pages = layoutSpellPages([3, 7, 5])
  assert.equal(pages.length, 1)
  assert.deepEqual(pages[0].map((c) => c.map((s) => s.level)), [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]])
  assert.deepEqual(pages[0][0].map((s) => [s.to - s.from, s.pad]), [[3, 3], [7, 3], [5, 5]])
  assert.equal(layoutSpellPages([]).length, 1, 'a character without spells still gets the blank page')
})

test('a long spell list flows across columns and pages without losing or repeating a spell', () => {
  for (const counts of [[5, 20, 14, 9, 6, 4], [5, 60, 40, 30, 20, 10, 5, 4, 3, 2], [0, 45], [8, 0, 0, 12]]) {
    const pages = layoutSpellPages(counts, counts.map((n) => n > 0))
    const seen: number[][] = counts.map(() => [])
    for (const page of pages) {
      assert.equal(page.length, 3)
      for (const col of page) {
        assert.ok(height(col) <= SPELL_PAGE.capacity, `column fits the page (${height(col)})`)
        for (const s of col) for (let i = s.from; i < s.to; i++) seen[s.level].push(i)
      }
    }
    counts.forEach((n, lv) => assert.deepEqual(seen[lv], Array.from({ length: n }, (_, i) => i), `level ${lv}: every spell once, in order`))
  }
  const wizard = layoutSpellPages([5, 20, 14, 9, 6, 4], [false, true, true, true, true, true])
  assert.equal(wizard.length, 1, 'fits one page once it flows')
  assert.equal(wizard[0][0].at(-1)!.level, 2)
  assert.deepEqual([wizard[0][1][0].level, wizard[0][1][0].continued], [2, true], 'level 2 continues at the top of the next column')
})

test('when flowing, a level with slots but no spells keeps a small block and other empty levels are left out', () => {
  const pages = layoutSpellPages([4, 30, 12, 0, 0], [false, true, true, true, false])
  const levels = pages.flat(2).map((s) => s.level)
  assert.ok(levels.includes(3) && !levels.includes(4) && !levels.includes(9))
  assert.equal(pages.flat(2).find((s) => s.level === 3)!.pad, 3)
})
