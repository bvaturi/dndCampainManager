// Battle map geometry. Run with: npm run test:unit
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellAt, cellCenter, fitSize, freeCells, isStretched, squareRows, tokenInitials } from '../src/lib/battleMap'

const grid = { width: 2000, height: 1500, cols: 20, rows: 15, offsetX: 0, offsetY: 0 }

test('squares: centre, point → square (clamped), offset shifts the grid', () => {
  assert.deepEqual(cellCenter(grid, 0, 0), { cx: 50, cy: 50 })
  assert.deepEqual(cellCenter(grid, 19, 14), { cx: 1950, cy: 1450 })
  assert.deepEqual(cellAt(grid, 149, 51), { x: 1, y: 0 })
  assert.deepEqual(cellAt(grid, -20, 99999), { x: 0, y: 14 })
  const shifted = { ...grid, offsetX: 0.5, offsetY: 0.5 }
  assert.deepEqual(cellCenter(shifted, 0, 0), { cx: 100, cy: 100 })
  assert.deepEqual(cellAt(shifted, 140, 140), { x: 0, y: 0 })
  assert.deepEqual(cellAt(shifted, 160, 160), { x: 1, y: 1 })
})

test('square rows and stretch warning', () => {
  assert.equal(squareRows(2000, 1500, 20), 15)
  assert.equal(squareRows(1600, 900, 32), 18)
  assert.equal(isStretched(grid), false)
  assert.equal(isStretched({ ...grid, rows: 20 }), true)
})

test('token initials', () => {
  assert.equal(tokenInitials('Goblin 3'), 'G3')
  assert.equal(tokenInitials('Lia Moonwhisper'), 'LM')
  assert.equal(tokenInitials('Thorin'), 'TH')
  assert.equal(tokenInitials('גובלין 2'), 'ג2')
  assert.equal(tokenInitials('  '), '?')
})

test('auto-placement: players from the left, enemies from the right, skipping taken squares', () => {
  const small = { width: 300, height: 200, cols: 3, rows: 2, offsetX: 0, offsetY: 0 }
  assert.deepEqual(freeCells(small, [{ mapId: 'm', x: 0, y: 0 }], 3, 'start'), [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }])
  assert.deepEqual(freeCells(small, [], 2, 'end'), [{ x: 2, y: 0 }, { x: 2, y: 1 }])
  assert.equal(freeCells(small, [], 10, 'start').length, 6)
})

test('image fit keeps aspect ratio and never enlarges', () => {
  assert.deepEqual(fitSize(4000, 3000, 2000), { width: 2000, height: 1500 })
  assert.deepEqual(fitSize(800, 600, 2000), { width: 800, height: 600 })
})
