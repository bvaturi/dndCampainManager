import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getBackend, type Backend } from './backend'
import type { AppUser } from './types'

interface AuthState {
  backend: Backend
  user: AppUser | null
  isAdmin: boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [state, setState] = useState<{ user: AppUser | null; isAdmin: boolean; ready: boolean }>({ user: null, isAdmin: false, ready: false })

  useEffect(() => {
    let unsub = () => {}
    getBackend().then((b) => {
      setBackend(b)
      unsub = b.onAuthChange(async (user) => {
        if (!user) return setState({ user: null, isAdmin: false, ready: true })
        await b.touchProfile(user).catch(() => {})
        const isAdmin = await b.isAdmin(user).catch(() => false)
        setState({ user, isAdmin, ready: true })
      })
    })
    return () => unsub()
  }, [])

  if (!backend || !state.ready) return <>{fallback}</>
  return <Ctx.Provider value={{ backend, user: state.user, isAdmin: state.isAdmin }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside provider')
  return v
}

/** Signed-in variant; only use under a route that requires sign-in. */
export function useUser() {
  const v = useAuth()
  if (!v.user) throw new Error('not signed in')
  return { ...v, user: v.user }
}
