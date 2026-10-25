import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Brand, LangToggle } from '../components/Layout'
import { ErrorBox } from '../components/ui'
import { useAuth } from '../lib/auth'
import type { Backend } from '../lib/backend'
import { DEMO_PERSONAS } from '../lib/demoBackend'
import { useI18n } from '../lib/i18n'
import type { AppUser } from '../lib/types'

type DemoBackend = Backend & { signInAs(u: AppUser): Promise<void> }

export function SignInPanel() {
  const { backend } = useAuth()
  const { t } = useI18n()
  const [error, setError] = useState<unknown>(null)
  const [email, setEmail] = useState('')

  if (backend.kind === 'demo') {
    const demo = backend as DemoBackend
    return (
      <DemoPersonas
        onPick={(u) => demo.signInAs(u)}
        email={email}
        setEmail={setEmail}
        label={t('demoExplain')}
        customLabel={t('demoCustom')}
      />
    )
  }
  return (
    <div className="signin">
      <button className="btn btn-google" onClick={() => backend.signIn().catch(setError)}>
        <GoogleG /> {t('signInGoogle')}
      </button>
      {error != null && <ErrorBox error={error} />}
    </div>
  )
}

function DemoPersonas({ onPick, email, setEmail, label, customLabel }: {
  onPick(u: AppUser): void; email: string; setEmail(s: string): void; label: string; customLabel: string
}) {
  return (
    <div className="signin">
      <p className="muted">{label}</p>
      <div className="persona-grid">
        {DEMO_PERSONAS.map((p) => (
          <button key={p.uid} className="btn persona" onClick={() => onPick(p)}>
            <strong>{p.displayName}</strong>
            <small>{p.email}</small>
          </button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => {
        e.preventDefault()
        if (email.includes('@')) onPick({ uid: 'demo-' + email.toLowerCase(), email, displayName: email.split('@')[0] })
      }}>
        <input type="email" placeholder={customLabel} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn"><span className="arrow">→</span></button>
      </form>
    </div>
  )
}

export function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export default function LoginPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [params] = useSearchParams()
  if (user) return <Navigate to={params.get('next') || '/'} replace />
  return (
    <div className="login-screen">
      <div className="login-lang"><LangToggle /></div>
      <div className="login-card">
        <div className="login-crest"><img src="/d20.svg" alt="" width={72} height={72} /></div>
        <h1><Brand /></h1>
        <p className="tagline">{t('tagline')}</p>
        <SignInPanel />
      </div>
    </div>
  )
}
