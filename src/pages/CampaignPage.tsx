import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, CopyButton, Empty, ErrorBox, Field, Loading, StatusPill, Tabs, formatDate } from '../components/ui'
import { useUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Campaign, Character, Member, SessionLog } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { CharacterChip } from './Dashboard'
import HomebrewTab from './HomebrewTab'

type Tab = 'party' | 'invites' | 'sessions' | 'homebrew' | 'notes' | 'settings'

export default function CampaignPage() {
  const { cid = '' } = useParams()
  const { backend, user, isAdmin } = useUser()
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('party')
  const data = useAsync(async () => {
    const campaign = await backend.getCampaign(cid)
    if (!campaign) return null
    const [members, characters] = await Promise.all([backend.listMembers(cid), backend.listCharacters(cid)])
    return { campaign, members, characters }
  }, [cid])

  if (data.loading) return <Loading />
  if (data.error || !data.data) return <div className="page"><p className="error-box">{t('notFound')}</p></div>
  const { campaign, members, characters } = data.data
  const isDm = isAdmin || campaign.dmEmail === user.email
  if (!isDm && !members.some((m) => m.uid === user.uid)) {
    return <div className="page"><p className="error-box">{t('notFound')}</p></div>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'party', label: t('tabParty') },
    ...(isDm ? [{ id: 'invites' as Tab, label: t('tabInvites') }] : []),
    { id: 'sessions', label: t('tabSessions') },
    { id: 'homebrew', label: t('tabHomebrew') },
    ...(isDm ? [{ id: 'notes' as Tab, label: t('tabNotes') }, { id: 'settings' as Tab, label: t('tabSettings') }] : []),
  ]

  return (
    <div className="page">
      <div className="campaign-hero">
        <div>
          <div className="row"><StatusPill status={campaign.status} />{campaign.setting && <span className="muted small">{campaign.setting}</span>}</div>
          <h1 className="page-title">{campaign.name}</h1>
          <p className="small">{t('dmLabel')}: <strong>{campaign.dmName}</strong> <span className="muted">({campaign.dmEmail})</span></p>
          {campaign.description && <p className="campaign-desc">{campaign.description}</p>}
        </div>
        <Link to={`/campaign/${campaign.id}/combat`} className="btn btn-primary btn-large combat-link">⚔ {t('cbTitle')}</Link>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'party' && <PartyTab campaign={campaign} members={members} characters={characters} isDm={isDm} reload={data.reload} />}
      {tab === 'invites' && <InvitesTab campaign={campaign} />}
      {tab === 'sessions' && <SessionsTab campaign={campaign} isDm={isDm} />}
      {tab === 'homebrew' && <HomebrewTab campaign={campaign} characters={characters} isDm={isDm} />}
      {tab === 'notes' && <NotesTab campaign={campaign} />}
      {tab === 'settings' && <SettingsTab campaign={campaign} reload={data.reload} />}
    </div>
  )
}

function PartyTab({ campaign, members, characters, isDm, reload }: {
  campaign: Campaign; members: Member[]; characters: Character[]; isDm: boolean; reload(): void
}) {
  const { backend, user } = useUser()
  const { t } = useI18n()
  const isMember = members.some((m) => m.uid === user.uid)
  const mine = characters.filter((c) => c.ownerUid === user.uid)
  return (
    <>
      {isMember && (
        <div className="cta-row">
          <Link className={mine.length ? 'btn' : 'btn btn-primary btn-large'} to={`/campaign/${campaign.id}/new-character`}>
            {mine.length ? `+ ${t('createAnother')}` : `⚔ ${t('createCharacter')}`}
          </Link>
          <Link className="btn" to={`/campaign/${campaign.id}/import`}>⇪ {t('importFromPdf')}</Link>
        </div>
      )}
      <section className="section">
        <h2 className="section-title">{t('characters')}</h2>
        {characters.length ? (
          <div className="grid">{characters.map((ch) => <CharacterChip key={ch.id} ch={ch} />)}</div>
        ) : <Empty>{t('partyEmpty')}</Empty>}
      </section>
      <section className="section">
        <h2 className="section-title">{t('membersTitle')}</h2>
        {members.length === 0 ? <Empty /> : (
          <ul className="plain-list card">
            {members.map((m) => {
              const count = characters.filter((c) => c.ownerUid === m.uid).length
              return (
                <li key={m.uid} className="row">
                  <Avatar name={m.displayName} photo={m.photoURL} />
                  <span className="grow"><strong>{m.displayName}</strong> <span className="muted small">{m.email}</span></span>
                  <span className="muted small">{count ? `${count} ${t('characters')}` : t('noCharacterYet')}</span>
                  {isDm && (
                    <button className="btn btn-small btn-danger" onClick={async () => {
                      if (!confirm(t('confirmRemovePlayer', { name: m.displayName }))) return
                      await backend.removeMember(campaign.id, m.uid); reload()
                    }}>{t('removePlayer')}</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

function InvitesTab({ campaign }: { campaign: Campaign }) {
  const { backend, user } = useUser()
  const { t, lang } = useI18n()
  const invites = useAsync(() => backend.listInvites(campaign.id), [campaign.id])
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(14)
  const [error, setError] = useState<unknown>(null)
  const linkFor = (token: string) => `${window.location.origin}/invite/${campaign.id}/${token}`

  return (
    <section className="section">
      <form className="card form-card" onSubmit={async (e) => {
        e.preventDefault()
        try {
          await backend.createInvite({
            campaignId: campaign.id, campaignName: campaign.name, dmName: campaign.dmName || user.displayName,
            email: email.trim() || null, expiresAt: Date.now() + days * 86400000,
          })
          setEmail('')
          invites.reload()
        } catch (err) { setError(err) }
      }}>
        <h3>{t('inviteTitle')}</h3>
        <p className="muted small">{t('inviteExplain')}</p>
        <div className="form-grid">
          <Field label={t('inviteEmailOptional')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="player@gmail.com" /></Field>
          <Field label={t('inviteDays')}><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(+e.target.value)} /></Field>
        </div>
        {error != null && <ErrorBox error={error} />}
        <div className="row end"><button className="btn btn-primary">{t('createInvite')}</button></div>
      </form>
      {invites.loading ? <Loading /> : invites.data?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('inviteLink')}</th><th>{t('inviteFor')}</th><th>{t('inviteUses')}</th><th>{t('inviteExpires')}</th><th /></tr></thead>
            <tbody>
              {invites.data.sort((a, b) => b.createdAt - a.createdAt).map((inv) => {
                const dead = inv.revoked || inv.expiresAt < Date.now()
                return (
                  <tr key={inv.token} className={dead ? 'dim' : ''}>
                    <td><code className="invite-code">{linkFor(inv.token)}</code></td>
                    <td className="small">{inv.email || t('anyone')}</td>
                    <td>{inv.uses}</td>
                    <td className="small">{inv.revoked ? t('revoked') : inv.expiresAt < Date.now() ? t('expired') : formatDate(inv.expiresAt, lang)}</td>
                    <td className="row end">
                      {!dead && <CopyButton text={linkFor(inv.token)} />}
                      {!dead && <button className="btn btn-small btn-danger" onClick={() => backend.revokeInvite(campaign.id, inv.token).then(invites.reload)}>{t('revoke')}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty />}
    </section>
  )
}

function SessionsTab({ campaign, isDm }: { campaign: Campaign; isDm: boolean }) {
  const { backend } = useUser()
  const { t } = useI18n()
  const sessions = useAsync(() => backend.listSessions(campaign.id), [campaign.id])
  const [editing, setEditing] = useState<Partial<SessionLog> | null>(null)

  const next = (sessions.data?.[0]?.number || 0) + 1
  return (
    <section className="section">
      {isDm && !editing && (
        <div className="cta-row">
          <button className="btn btn-primary" onClick={() => setEditing({ number: next, title: '', date: new Date().toISOString().slice(0, 10), summary: '' })}>
            + {t('sessionNew')}
          </button>
        </div>
      )}
      {editing && (
        <form className="card form-card" onSubmit={async (e) => {
          e.preventDefault()
          await backend.saveSession(campaign.id, editing as SessionLog)
          setEditing(null)
          sessions.reload()
        }}>
          <div className="form-grid">
            <Field label={t('sessionNumber')}><input type="number" value={editing.number} onChange={(e) => setEditing({ ...editing, number: +e.target.value })} /></Field>
            <Field label={t('sessionDate')}><input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></Field>
            <Field label={t('sessionTitle')}><input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
          </div>
          <Field label={t('sessionSummary')}><textarea rows={8} value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} /></Field>
          <div className="row end">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>{t('cancel')}</button>
            <button className="btn btn-primary">{t('save')}</button>
          </div>
        </form>
      )}
      {sessions.loading ? <Loading /> : sessions.data?.length ? (
        <div className="chronicle">
          {sessions.data.map((s) => (
            <article key={s.id} className="chronicle-entry card">
              <header className="row">
                <span className="session-no">#{s.number}</span>
                <h3 className="grow">{s.title}</h3>
                <span className="muted small">{s.date}</span>
                {isDm && <button className="btn btn-small" onClick={() => setEditing(s)}>{t('edit')}</button>}
                {isDm && <button className="btn btn-small btn-danger" onClick={() => {
                  if (confirm(t('confirmDelete', { name: s.title }))) backend.deleteSession(campaign.id, s.id).then(sessions.reload)
                }}>{t('delete')}</button>}
              </header>
              <p className="prewrap">{s.summary}</p>
            </article>
          ))}
        </div>
      ) : <Empty />}
    </section>
  )
}

function NotesTab({ campaign }: { campaign: Campaign }) {
  const { backend } = useUser()
  const { t } = useI18n()
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  useEffect(() => { backend.getDmNotes(campaign.id).then(setText) }, [backend, campaign.id])
  useEffect(() => {
    if (text === null || status !== 'saving') return
    const h = setTimeout(() => backend.saveDmNotes(campaign.id, text).then(() => setStatus('saved')), 800)
    return () => clearTimeout(h)
  }, [text, status, backend, campaign.id])
  if (text === null) return <Loading />
  return (
    <section className="section">
      <p className="muted small">{t('notesExplain')} <span className="save-state">{status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : ''}</span></p>
      <textarea className="parchment-notes" rows={20} value={text} onChange={(e) => { setText(e.target.value); setStatus('saving') }} />
    </section>
  )
}

function SettingsTab({ campaign, reload }: { campaign: Campaign; reload(): void }) {
  const { backend } = useUser()
  const { t } = useI18n()
  const [form, setForm] = useState(campaign)
  const [saved, setSaved] = useState(false)
  return (
    <form className="card form-card section" onSubmit={async (e) => {
      e.preventDefault()
      const { id: _id, ...patch } = form
      await backend.updateCampaign(campaign.id, patch)
      setSaved(true); reload()
    }}>
      <div className="form-grid">
        <Field label={t('campaignName')}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t('setting')}><input value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value })} /></Field>
        <Field label={t('status')}>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Campaign['status'] })}>
            {(['active', 'paused', 'finished'] as const).map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t('startingLevel')}><input type="number" min={1} max={20} value={form.startingLevel} onChange={(e) => setForm({ ...form, startingLevel: +e.target.value })} /></Field>
      </div>
      <Field label={t('description')}><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="row end">{saved && <span className="muted">{t('saved')}</span>}<button className="btn btn-primary">{t('save')}</button></div>
    </form>
  )
}
