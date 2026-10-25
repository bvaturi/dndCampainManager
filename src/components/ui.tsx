import { useState, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'

export function Avatar({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  if (photo) return <img className="avatar" src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange(v: T): void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={tab.id === value} className={tab.id === value ? 'tab active' : 'tab'} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Loading() {
  const { t } = useI18n()
  return <div className="loading"><div className="d20-spin small" /> {t('loading')}</div>
}

export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useI18n()
  const msg = error instanceof Error ? error.message : String(error)
  const denied = /permission/i.test(msg)
  return <div className="error-box">{denied ? t('permissionError') : t('errorGeneric', { msg })}</div>
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n()
  return <p className="empty">{children ?? t('none')}</p>
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn btn-small"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}
    >
      {done ? t('copied') : t('copy')}
    </button>
  )
}

export function StatusPill({ status }: { status: string }) {
  const { t } = useI18n()
  return <span className={`pill pill-${status}`}>{t(`status_${status}` as 'status_active')}</span>
}

export function formatDate(ms: number, lang: string) {
  return new Date(ms).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
