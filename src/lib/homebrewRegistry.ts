/**
 * The approved homebrew of the campaign being viewed. Set by <HomebrewScope> from a live listener, read by the
 * rules helpers (spell lists, resources) so homebrew works everywhere book content does. No imports on purpose:
 * classFeatures and spellAccess read it without import cycles.
 */
import type { Homebrew } from './types'

let current: Homebrew[] = []

export function setHomebrew(items: Homebrew[]) {
  current = items.filter((h) => h.status === 'approved')
}
export const getHomebrew = (): readonly Homebrew[] => current
