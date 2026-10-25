import { Link } from 'react-router-dom'
import { Empty, ErrorBox, Loading, StatusPill } from '../components/ui'
import { useUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { classById, raceById } from '../lib/rules'
import type { Campaign, Character } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function CampaignCard({ c, role }: { c: Campaign; role: string }) {
  const { t } = useI18n()
  return (
    <Link to={`/campaign/${c.id}`} className="card campaign-card">
      <div className="campaign-card-top">
        <span className="role-tag">{role}</span>
        <StatusPill status={c.status} />
      </div>
      <h3>{c.name}</h3>
      {c.setting && <p className="muted small">{c.setting}</p>}
      <p className="small">{t('dmLabel')}: {c.dmName || c.dmEmail}</p>
    </Link>
  )
}

export function CharacterChip({ ch, campaignName }: { ch: Character; campaignName?: string }) {
  const { t, g } = useI18n()
  const cls = classById(ch.classId)
  const race = raceById(ch.race)
  return (
    <Link to={`/campaign/${ch.campaignId}/character/${ch.id}`} className="card char-card">
      <div className="char-portrait">
        {ch.portraitUrl ? <img src={ch.portraitUrl} alt="" /> : <span>{(ch.name || '?')[0]}</span>}
      </div>
      <div>
        <h3>{ch.name || '—'}</h3>
        <p className="small">
          {race && g('races', race.id, race.name)} {cls && g('classes', cls.id, cls.name)} · {t('level')} {ch.level}
        </p>
        {campaignName && <p className="muted small">{campaignName}</p>}
        <p className="muted small">{ch.ownerName}</p>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { user, backend, isAdmin } = useUser()
  const { t } = useI18n()
  const data = useAsync(async () => {
    // One failing list (e.g. a Firestore index still building) should not blank the whole dashboard.
    const [dm, player, chars] = await Promise.allSettled([
      backend.listCampaignsAsDm(user.email),
      backend.listCampaignsAsPlayer(user.uid),
      backend.listMyCharacters(user.uid),
    ])
    const ok = <T,>(r: PromiseSettledResult<T[]>) => (r.status === 'fulfilled' ? r.value : [])
    const failed = [dm, player, chars].filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    if (failed.length === 3) throw failed[0].reason
    return { dm: ok(dm), player: ok(player), chars: ok(chars), indexBuilding: failed.some((f) => /index/i.test(String(f.reason))), partial: failed.length > 0 }
  }, [user.uid])

  if (data.loading) return <Loading />
  if (data.error) return <ErrorBox error={data.error} />
  const { dm, player, chars, indexBuilding, partial } = data.data!
  const campaignName = (id: string) => [...dm, ...player].find((c) => c.id === id)?.name

  return (
    <div className="page">
      <h1 className="page-title">{t('welcome', { name: user.displayName.split(' ')[0] })}</h1>
      {partial && <p className="notice">{t(indexBuilding ? 'indexBuilding' : 'partialLoad')}</p>}

      {isAdmin && (
        <Link to="/admin" className="banner-link">
          <span className="role-tag">{t('roleAdmin')}</span> {t('goToAdmin')} <span className="arrow">→</span>
        </Link>
      )}

      {(dm.length > 0 || isAdmin) && (
        <section className="section">
          <h2 className="section-title">{t('campaignsIRun')}</h2>
          {dm.length ? (
            <div className="grid">{dm.map((c) => <CampaignCard key={c.id} c={c} role={t('roleDm')} />)}</div>
          ) : <Empty>{t('noCampaignsDm')}</Empty>}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">{t('campaignsIPlay')}</h2>
        {player.length ? (
          <div className="grid">{player.map((c) => <CampaignCard key={c.id} c={c} role={t('rolePlayer')} />)}</div>
        ) : <Empty>{t('noCampaignsPlayer')}</Empty>}
      </section>

      {chars.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('myCharacters')}</h2>
          <div className="grid">{chars.map((ch) => <CharacterChip key={ch.id} ch={ch} campaignName={campaignName(ch.campaignId)} />)}</div>
        </section>
      )}
    </div>
  )
}
