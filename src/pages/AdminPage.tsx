import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Empty, ErrorBox, Field, Loading, StatusPill, Tabs, formatDate } from '../components/ui'
import { useUser } from '../lib/auth'
import { BOOTSTRAP_ADMINS } from '../lib/backend'
import { useI18n } from '../lib/i18n'
import { classById, raceById } from '../lib/rules'
import type { Campaign, DungeonMaster } from '../lib/types'
import { useAsync } from '../lib/useAsync'

type Tab = 'campaigns' | 'dms' | 'characters' | 'users'

export default function AdminPage() {
  const { t } = useI18n()
  const params = useParams()
  const nav = useNavigate()
  const tab = (params['*'] || 'campaigns') as Tab
  return (
    <div className="page">
      <h1 className="page-title">{t('adminTitle')}</h1>
      <Tabs<Tab>
        value={tab}
        onChange={(v) => nav(`/admin/${v}`)}
        tabs={[
          { id: 'campaigns', label: t('tabCampaigns') },
          { id: 'dms', label: t('tabDms') },
          { id: 'characters', label: t('tabCharacters') },
          { id: 'users', label: t('tabUsers') },
        ]}
      />
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'dms' && <DmsTab />}
      {tab === 'characters' && <CharactersTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  )
}

function DmPicker({ dms, value, onChange }: { dms: DungeonMaster[]; value: string; onChange(email: string, name: string): void }) {
  const { t } = useI18n()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value, dms.find((d) => d.email === e.target.value)?.name || '')}>
      <option value="">{t('chooseDm')}</option>
      {dms.map((d) => <option key={d.email} value={d.email}>{d.name} — {d.email}</option>)}
    </select>
  )
}

function CampaignsTab() {
  const { backend, user } = useUser()
  const { t, lang } = useI18n()
  const data = useAsync(async () => {
    const [campaigns, dms] = await Promise.all([backend.listAllCampaigns(), backend.listDms()])
    return { campaigns, dms }
  }, [])
  const blank = { name: '', description: '', setting: '', dmEmail: '', dmName: '', startingLevel: 1 }
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (data.loading) return <Loading />
  if (data.error) return <ErrorBox error={data.error} />
  const { campaigns, dms } = data.data!

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const email = form.dmEmail.trim().toLowerCase()
      if (!dms.some((d) => d.email === email)) {
        await backend.saveDm({ email, name: form.dmName || email.split('@')[0], addedAt: Date.now() })
      }
      await backend.createCampaign({
        ...form, dmEmail: email, dmName: form.dmName || email.split('@')[0], status: 'active', createdBy: user.email,
      })
      setForm(blank)
      setShowForm(false)
      data.reload()
    } catch (err) { setError(err) }
  }

  const reassign = async (c: Campaign, email: string, name: string) => {
    if (!email) return
    await backend.updateCampaign(c.id, { dmEmail: email, dmName: name }).catch(setError)
    data.reload()
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{t('tabCampaigns')}</h2>
        {!showForm && <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ {t('newCampaign')}</button>}
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={submit}>
          <h3>{t('newCampaign')}</h3>
          <div className="form-grid">
            <Field label={t('campaignName')}>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('setting')}>
              <input value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value })} placeholder="Forgotten Realms…" />
            </Field>
            <Field label={t('assignDm')} hint={t('dmEmailHint')}>
              <DmPicker dms={dms} value={dms.some((d) => d.email === form.dmEmail) ? form.dmEmail : ''}
                onChange={(dmEmail, dmName) => setForm({ ...form, dmEmail, dmName })} />
            </Field>
            <Field label={t('newDmEmail')}>
              <div className="row">
                <input type="email" required value={form.dmEmail} onChange={(e) => setForm({ ...form, dmEmail: e.target.value })} placeholder="dm@gmail.com" />
                <input value={form.dmName} onChange={(e) => setForm({ ...form, dmName: e.target.value })} placeholder={t('name')} />
              </div>
            </Field>
            <Field label={t('startingLevel')}>
              <input type="number" min={1} max={20} value={form.startingLevel} onChange={(e) => setForm({ ...form, startingLevel: +e.target.value })} />
            </Field>
            <Field label={t('description')}>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          {error != null && <ErrorBox error={error} />}
          <div className="row end">
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>{t('cancel')}</button>
            <button className="btn btn-primary">{t('create')}</button>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? <Empty /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('campaignName')}</th><th>{t('assignDm')}</th><th>{t('status')}</th><th>{t('created')}</th><th /></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/campaign/${c.id}`}><strong>{c.name}</strong></Link>{c.setting && <div className="muted small">{c.setting}</div>}</td>
                  <td><DmPicker dms={dms} value={c.dmEmail} onChange={(email, name) => reassign(c, email, name)} /></td>
                  <td><StatusPill status={c.status} /></td>
                  <td className="small">{formatDate(c.createdAt, lang)}</td>
                  <td className="row end">
                    <Link className="btn btn-small" to={`/campaign/${c.id}`}>{t('open')}</Link>
                    <button className="btn btn-small btn-danger" onClick={async () => {
                      if (!confirm(t('confirmDelete', { name: c.name }))) return
                      await backend.deleteCampaign(c.id).catch(setError)
                      data.reload()
                    }}>{t('delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DmsTab() {
  const { backend } = useUser()
  const { t, lang } = useI18n()
  const data = useAsync(async () => {
    const [dms, campaigns] = await Promise.all([backend.listDms(), backend.listAllCampaigns()])
    return { dms, campaigns }
  }, [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  if (data.loading) return <Loading />
  if (data.error) return <ErrorBox error={data.error} />
  const { dms, campaigns } = data.data!
  return (
    <section className="section">
      <form className="card form-card row wrap" onSubmit={async (e) => {
        e.preventDefault()
        await backend.saveDm({ name, email, addedAt: Date.now() })
        setName(''); setEmail(''); data.reload()
      }}>
        <input required placeholder={t('name')} value={name} onChange={(e) => setName(e.target.value)} />
        <input required type="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary">+ {t('addDm')}</button>
      </form>
      {dms.length === 0 ? <Empty /> : (
        <div className="grid">
          {dms.map((d) => {
            const mine = campaigns.filter((c) => c.dmEmail === d.email)
            return (
              <div key={d.email} className="card dm-card">
                <div className="row">
                  <Avatar name={d.name} size={40} />
                  <div className="grow">
                    <h3>{d.name}</h3>
                    <p className="muted small">{d.email} · {formatDate(d.addedAt, lang)}</p>
                  </div>
                </div>
                <p className="small"><strong>{t('dmCampaigns')}:</strong> {mine.length ? mine.map((c, i) => (
                  <span key={c.id}>{i > 0 && ', '}<Link to={`/campaign/${c.id}`}>{c.name}</Link></span>
                )) : '—'}</p>
                <div className="row end">
                  <button className="btn btn-small btn-danger" onClick={async () => {
                    if (!confirm(t('confirmDelete', { name: d.name }))) return
                    await backend.removeDm(d.email); data.reload()
                  }}>{t('delete')}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CharactersTab() {
  const { backend } = useUser()
  const { t, g } = useI18n()
  const data = useAsync(async () => {
    const [chars, campaigns] = await Promise.all([backend.listAllCharacters(), backend.listAllCampaigns()])
    return { chars, campaigns }
  }, [])
  if (data.loading) return <Loading />
  if (data.error) return <ErrorBox error={data.error} />
  const { chars, campaigns } = data.data!
  if (!chars.length) return <Empty />
  return (
    <div className="table-wrap section">
      <table className="table">
        <thead><tr><th>{t('name')}</th><th>{t('stepRace')}</th><th>{t('stepClass')}</th><th>{t('level')}</th><th>{t('owner')}</th><th>{t('campaign')}</th></tr></thead>
        <tbody>
          {chars.map((ch) => {
            const race = raceById(ch.race)
            const cls = classById(ch.classId)
            return (
              <tr key={ch.id}>
                <td><Link to={`/campaign/${ch.campaignId}/character/${ch.id}`}><strong>{ch.name}</strong></Link></td>
                <td>{race ? g('races', race.id, race.name) : ''}</td>
                <td>{cls ? g('classes', cls.id, cls.name) : ''}</td>
                <td>{ch.level}</td>
                <td>{ch.ownerName}</td>
                <td>{campaigns.find((c) => c.id === ch.campaignId)?.name}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function UsersTab() {
  const { backend } = useUser()
  const { t, lang } = useI18n()
  const data = useAsync(async () => {
    const [users, admins] = await Promise.all([backend.listUsers(), backend.listAdmins()])
    return { users, admins }
  }, [])
  const [email, setEmail] = useState('')
  if (data.loading) return <Loading />
  if (data.error) return <ErrorBox error={data.error} />
  const { users, admins } = data.data!
  return (
    <>
      <section className="section">
        <h2 className="section-title">{t('admins')}</h2>
        <div className="card">
          <ul className="plain-list">
            {admins.map((a) => (
              <li key={a} className="row">
                <span className="grow">{a}</span>
                {BOOTSTRAP_ADMINS.includes(a)
                  ? <span className="muted small">{t('bootstrapAdmin')}</span>
                  : <button className="btn btn-small btn-danger" onClick={() => backend.removeAdmin(a).then(data.reload)}>{t('delete')}</button>}
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={(e) => { e.preventDefault(); backend.addAdmin(email).then(() => { setEmail(''); data.reload() }) }}>
            <input type="email" required placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn">+ {t('addAdmin')}</button>
          </form>
        </div>
      </section>
      <section className="section">
        <h2 className="section-title">{t('tabUsers')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('lastSeen')}</th><th /></tr></thead>
            <tbody>
              {users.sort((a, b) => b.lastSeen - a.lastSeen).map((u) => (
                <tr key={u.uid}>
                  <td className="row"><Avatar name={u.displayName} photo={u.photoURL} /> {u.displayName}</td>
                  <td>{u.email}</td>
                  <td className="small">{formatDate(u.lastSeen, lang)}</td>
                  <td>{admins.includes(u.email)
                    ? <span className="role-tag">{t('roleAdmin')}</span>
                    : <button className="btn btn-small" onClick={() => backend.addAdmin(u.email).then(data.reload)}>{t('makeAdmin')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
