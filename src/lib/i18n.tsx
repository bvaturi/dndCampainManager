import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import heNames from '../data/he.json'
import { en, he, type StringKey } from './strings'

export type Lang = 'en' | 'he'
type NameGroup = keyof typeof heNames

interface I18n {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang(l: Lang): void
  t(key: StringKey, vars?: Record<string, string | number>): string
  /** Game term: Hebrew from the translation table when in Hebrew, else the English name. */
  g(group: NameGroup, key: string, english?: string): string
}

const Ctx = createContext<I18n | null>(null)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('codex-lang')
    if (saved === 'en' || saved === 'he') return saved
  } catch { /* storage blocked */ }
  return navigator.language?.startsWith('he') ? 'he' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const dir = lang === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('codex-lang', l) } catch { /* storage blocked */ }
  }, [])

  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => {
    let s = (lang === 'he' ? he : en)[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
    return s
  }, [lang])

  const g = useCallback((group: NameGroup, key: string, english?: string) => {
    if (lang === 'he') {
      const hit = (heNames[group] as Record<string, string>)[key]
      if (hit) return hit
    }
    return english ?? key
  }, [lang])

  const value = useMemo(() => ({ lang, dir, setLang, t, g }), [lang, dir, setLang, t, g]) as I18n
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside provider')
  return v
}
