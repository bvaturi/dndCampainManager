import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LangToggle } from '../components/Layout'
import { ErrorBox, Loading } from '../components/ui'
import { useAuth } from '../lib/auth'
import { inviteProblem } from '../lib/backend'
import { useI18n } from '../lib/i18n'
import { useAsync } from '../lib/useAsync'
import { SignInPanel } from './LoginPage'

export default function InvitePage() {
  const { cid = '', token = '' } = useParams()
  const { backend, user } = useAuth()
  const { t } = useI18n()
  const nav = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const invite = useAsync(() => (user ? backend.getInvite(cid, token) : Promise.resolve(null)), [cid, token, user?.uid])

  const problem = user && !invite.loading ? inviteProblem(invite.data ?? null, user) : null

  return (
    <div className="login-screen">
      <div className="login-lang"><LangToggle /></div>
      <div className="login-card invite-card">
        <div className="wax-seal" aria-hidden="true">✦</div>
        <h1>{t('inviteHeading')}</h1>
        {!user ? (
          <>
            <p className="tagline">{t('inviteSignIn')}</p>
            <SignInPanel />
          </>
        ) : invite.loading ? (
          <Loading />
        ) : problem ? (
          <>
            <p className="error-box">{t(problem as 'inviteExpired')}</p>
            <p className="muted">{t('signedInAs', { email: user.email })}</p>
            <div className="row center">
              <button className="btn btn-ghost" onClick={() => backend.signOut()}>{t('signOut')}</button>
              <Link className="btn" to="/">{t('navDashboard')}</Link>
            </div>
          </>
        ) : (
          <>
            <p className="tagline">{t('inviteBody', { dm: invite.data!.dmName })}</p>
            <h2 className="invite-campaign">{invite.data!.campaignName}</h2>
            <p className="muted">{t('signedInAs', { email: user.email })}</p>
            <button
              className="btn btn-primary btn-large"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await backend.acceptInvite(cid, token, user)
                  nav(`/campaign/${cid}`)
                } catch (e) {
                  setError(e)
                  setBusy(false)
                }
              }}
            >
              {t('acceptInvite')}
            </button>
            {error != null && <ErrorBox error={error} />}
          </>
        )}
      </div>
    </div>
  )
}
