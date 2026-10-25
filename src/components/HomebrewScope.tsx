import { createContext, useContext, useEffect, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useUser } from '../lib/auth'
import { setHomebrew } from '../lib/homebrewRegistry'
import type { Homebrew } from '../lib/types'

const Ctx = createContext<readonly Homebrew[]>([])

/**
 * Wraps the campaign pages: keeps the campaign's approved homebrew live in the rules registry, so spell lists,
 * casting, resources and rests include it. Pages call `useHomebrew()` to re-render when it changes.
 */
export default function HomebrewScope() {
  const { cid = '' } = useParams()
  const { backend } = useUser()
  const [items, setItems] = useState<readonly Homebrew[]>([])
  useEffect(() => {
    const off = backend.watchHomebrew(cid, {}, (list) => {
      setHomebrew(list)
      setItems(list)
    }, () => { /* not a member (yet): no homebrew */ })
    return () => { off(); setHomebrew([]) }
  }, [backend, cid])
  return <Ctx.Provider value={items}><Outlet /></Ctx.Provider>
}

/** The campaign's approved homebrew (subscribes the page to changes). */
export const useHomebrew = () => useContext(Ctx)
