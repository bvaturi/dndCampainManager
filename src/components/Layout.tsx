import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { DiceProvider } from './Dice'
import { Avatar } from './ui'

export function LangToggle() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
      <button className={lang === 'he' ? 'on' : ''} onClick={() => setLang('he')}>עב</button>
    </div>
  )
}

export function Brand() {
  const { t } = useI18n()
  return (
    <span className="brand">
      <img src="/d20.svg" alt="" width={26} height={26} />
      <span>{t('appName')}</span>
    </span>
  )
}

export default function Layout() {
  const { user, isAdmin, backend } = useUser()
  const { t } = useI18n()
  const nav = useNavigate()
  return (
    <DiceProvider>
    <div className="app">
      <header className="topbar no-print">
        <NavLink to="/" className="brand-link"><Brand /></NavLink>
        <nav className="mainnav">
          <NavLink to="/" end>{t('navDashboard')}</NavLink>
          <NavLink to="/spells">{t('navSpells')}</NavLink>
          {isAdmin && <NavLink to="/admin">{t('navAdmin')}</NavLink>}
        </nav>
        <div className="topbar-end">
          {backend.kind === 'demo' && <span className="pill pill-demo">{t('demoMode')}</span>}
          <LangToggle />
          <span className="who" title={user.email}>
            <Avatar name={user.displayName} photo={user.photoURL} />
            <span className="who-name">{user.displayName}</span>
          </span>
          <button className="btn btn-ghost btn-small" onClick={() => backend.signOut().then(() => nav('/login'))}>{t('signOut')}</button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
    </DiceProvider>
  )
}
