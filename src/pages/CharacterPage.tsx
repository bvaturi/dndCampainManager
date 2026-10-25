import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ErrorBox, Loading } from '../components/ui'
import { useUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { averageHpPerLevel, classById, mod } from '../lib/rules'
import type { Campaign, Character } from '../lib/types'
import { casterInfo } from '../lib/spellAccess'
import CharacterSheet from '../sheet/CharacterSheet'
import HpAdjust from '../sheet/HpAdjust'
import { applyHp } from '../lib/combat'
import Spellbook from '../sheet/Spellbook'
import CustomTabView from '../sheet/CustomTabView'
import FeatsTab from '../sheet/FeatsTab'
import ClassFeaturesTab from '../sheet/ClassFeaturesTab'
import { levelUpFeats } from '../lib/feats'
import { RestButtons } from '../sheet/RestDialog'
import { featureNameHe } from '../lib/classFeatures'
import type { CustomTab } from '../lib/types'
import { L } from '../sheet/labels'
import { useHomebrew } from '../components/HomebrewScope'
import { grantedSpells } from '../lib/homebrew'

export default function CharacterPage() {
  useHomebrew() // re-render when the campaign's homebrew changes (spell lists, abilities)
  const { cid = '', chid = '' } = useParams()
  const { backend, user, isAdmin } = useUser()
  const { t, g, lang } = useI18n()
  const nav = useNavigate()
  const [ch, setCh] = useState<Character | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hand, setHand] = useState(() => {
    try { return localStorage.getItem('codex-handwriting') !== 'off' } catch { return true }
  })
  const [params, setParams] = useSearchParams()
  const pending = useRef<Partial<Character>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    Promise.all([backend.getCharacter(cid, chid), backend.getCampaign(cid), backend.listMembers(cid)])
      .then(([c, camp, members]) => { setCh(c); setCampaign(camp); setIsMember(members.some((m) => m.uid === user.uid)) })
      .catch(setLoadError)
      .finally(() => setLoaded(true))
  }, [backend, cid, chid, user.uid])

  const flush = () => {
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length) return
    backend.updateCharacter(cid, chid, patch).then(() => setStatus('saved'), () => setStatus('error'))
  }
  useEffect(() => () => { clearTimeout(timer.current); flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <Loading />
  if (loadError) return <div className="page"><ErrorBox error={loadError} /></div>
  const isDm = isAdmin || campaign?.dmEmail === user.email
  if (!ch || (!isDm && !isMember)) return <div className="page"><p className="error-box">{t('notFound')}</p></div>

  const canEdit = ch.ownerUid === user.uid || isDm
  // Non-casters get the spell tab too when the DM granted them a homebrew spell.
  const casts = !!casterInfo(ch.classId, ch.subclass) || grantedSpells(ch).length > 0
  const tabs = ch.tabs ?? []
  const rawView = params.get('view') || 'sheet'
  const view = rawView === 'spells' && casts ? 'spells'
    : rawView === 'feats' ? 'feats'
    : rawView === 'class' ? 'class'
    : rawView.startsWith('tab:') && tabs.some((x) => x.id === rawView.slice(4)) ? rawView
    : 'sheet'
  const go = (v: string) => setParams(v === 'sheet' ? {} : { view: v }, { replace: true })
  const setTabs = (next: CustomTab[]) => onChange({ tabs: next })
  const addTab = () => {
    const id = Math.random().toString(36).slice(2, 10)
    setTabs([...tabs, { id, title: t('tabNewTitle'), content: '' }])
    go(`tab:${id}`)
  }

  const onChange = (patch: Partial<Character>) => {
    // Only the owner, the DM and managers may change a sheet (the database enforces this too).
    if (!canEdit) return
    setCh((c) => (c ? { ...c, ...patch } : c))
    pending.current = { ...pending.current, ...patch }
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }

  // Damage / heal. HP may have changed elsewhere (the DM in combat), so start from the saved values
  // unless this page has unsaved HP edits of its own.
  const adjustHp = async (amount: number, kind: 'damage' | 'heal') => {
    let cur = ch
    if (!('hpCurrent' in pending.current) && !('hpTemp' in pending.current)) {
      cur = await backend.getCharacter(cid, chid).catch(() => null) ?? ch
    }
    const r = applyHp({ hp: cur.hpCurrent, temp: cur.hpTemp, max: ch.hpMax }, amount, kind)
    // 5e: regaining any hit points at 0 ends dying, so the death saves reset.
    const revived = kind === 'heal' && cur.hpCurrent <= 0 && r.hp > 0
    onChange({ hpCurrent: r.hp, hpTemp: r.temp, ...(revived ? { deathSaves: { successes: 0, failures: 0 } } : {}) })
  }

  const levelUp = () => {
    const cls = classById(ch.classId)
    if (!cls || ch.level >= 20) return
    const next = ch.level + 1
    const fromFeats = levelUpFeats(ch)
    const hp = averageHpPerLevel(cls.hitDie) + mod(ch.abilities.con) + (ch.subrace === 'hill-dwarf' ? 1 : 0) + fromFeats.hp
    if (!confirm(t('levelUpConfirm', { name: ch.name, level: next, hp }))) return
    // The book's level table names what the new level brings; "… feature" placeholders resolve to the subclass.
    const sub = cls.subclasses.find((s) => s.id === ch.subclass)
    const row = cls.progression.find((p) => p.level === next)
    const label = (subId: string, n: string) => (lang === 'he' && featureNameHe(ch.classId, subId, n)) || g('features', n, n)
    const added = (row?.features ?? []).flatMap((n) => /feature$/i.test(n.trim())
      ? (sub?.features.filter((f) => f.level === next).map((f) => label(sub.id, f.name)) ?? [label('', n)])
      : [label('', n)])
    onChange({
      level: next,
      hpMax: ch.hpMax + hp,
      hpCurrent: ch.hpCurrent + hp,
      features: added.length ? `${ch.features}\n${added.join('\n')}`.trim() : ch.features,
      ...(fromFeats.feats ? { feats: fromFeats.feats } : {}),
    })
  }

  return (
    <div className={`page sheet-page-wrap ${hand ? 'handwriting' : ''}`}>
      <div className="sheet-toolbar no-print">
        <Link to={`/campaign/${cid}`} className="btn btn-ghost btn-small"><span className="arrow">←</span> {campaign?.name}</Link>
        <span className="grow" />
        {!canEdit && <span className="pill">{t('readOnly')}</span>}
        <span className="save-state">{status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : status === 'error' ? t('permissionError') : ''}</span>
        <label className="check"><input type="checkbox" checked={hand} onChange={(e) => {
          setHand(e.target.checked)
          try { localStorage.setItem('codex-handwriting', e.target.checked ? 'on' : 'off') } catch { /* storage blocked */ }
        }} /> {L.handwriting[lang]}</label>
        {canEdit && <RestButtons ch={ch} onChange={onChange} />}
        {canEdit && ch.level < 20 && <button className="btn btn-small" onClick={levelUp}>▲ {t('levelUp')}</button>}
        <button className="btn btn-small" onClick={() => window.print()}>🖨️ {t('print')}</button>
        {canEdit && (
          <button className="btn btn-small btn-danger" onClick={async () => {
            if (!confirm(t('confirmDelete', { name: ch.name }))) return
            await backend.deleteCharacter(cid, chid)
            nav(`/campaign/${cid}`)
          }}>{t('deleteCharacter')}</button>
        )}
      </div>
      <div className="view-tabs no-print" role="tablist">
        <button role="tab" aria-selected={view === 'sheet'} className={view === 'sheet' ? 'on' : ''} onClick={() => go('sheet')}>📜 {t('tabSheet')}</button>
        <button role="tab" aria-selected={view === 'class'} className={view === 'class' ? 'on' : ''} onClick={() => go('class')}>⚜ {t('tabClassFeatures')}</button>
        {casts && <button role="tab" aria-selected={view === 'spells'} className={view === 'spells' ? 'on' : ''} onClick={() => go('spells')}>✨ {t('tabSpellbook')}</button>}
        <button role="tab" aria-selected={view === 'feats'} className={view === 'feats' ? 'on' : ''} onClick={() => go('feats')}>🏅 {t('tabFeats')}{ch.feats?.length ? ` (${ch.feats.length})` : ''}</button>
        {tabs.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={view === `tab:${tab.id}`} className={view === `tab:${tab.id}` ? 'on' : ''} onClick={() => go(`tab:${tab.id}`)}>
            <bdi>{tab.title || t('tabNewTitle')}</bdi>
          </button>
        ))}
        {canEdit && <button className="add-tab" onClick={addTab} title={t('tabAdd')}>+ {t('tabAdd')}</button>}
      </div>
      {view === 'spells' ? <Spellbook ch={ch} edit={canEdit} onChange={onChange} />
        : view === 'feats' ? <FeatsTab ch={ch} edit={canEdit} onChange={onChange} />
        : view === 'class' ? <ClassFeaturesTab ch={ch} edit={canEdit} onChange={onChange} />
        : view.startsWith('tab:') ? (() => {
          const idx = tabs.findIndex((x) => x.id === view.slice(4))
          const tab = tabs[idx]
          return (
            <CustomTabView
              key={tab.id} tab={tab} edit={canEdit} isFirst={idx === 0} isLast={idx === tabs.length - 1}
              onUpdate={(patch) => setTabs(tabs.map((x) => (x.id === tab.id ? { ...x, ...patch } : x)))}
              onDelete={() => { setTabs(tabs.filter((x) => x.id !== tab.id)); go('sheet') }}
              onMove={(d) => { const next = [...tabs]; [next[idx], next[idx + d]] = [next[idx + d], next[idx]]; setTabs(next) }}
            />
          )
        })()
        : <>
          {canEdit && <HpAdjust variant="bar" onApply={adjustHp} hp={{ cur: ch.hpCurrent, max: ch.hpMax, temp: ch.hpTemp }} />}
          <CharacterSheet ch={ch} edit={canEdit} onChange={onChange} onHp={adjustHp} />
        </>}
    </div>
  )
}
