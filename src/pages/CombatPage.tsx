import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDice } from '../components/Dice'
import { ErrorBox, Loading, Tabs } from '../components/ui'
import { useUser } from '../lib/auth'
import { CONDITIONS, applyHp, enemyStatus, initiativeOrder, stepTurn } from '../lib/combat'
import { d20Test, type RollResult } from '../lib/dice'
import { useI18n } from '../lib/i18n'
import { mod } from '../lib/rules'
import type { Character, Combatant, CombatSnapshot, EnemySecret, MapView } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { initiativeParts } from '../sheet/rolls'
import MapPanel from './MapPanel'

const newId = () => Math.random().toString(36).slice(2, 10)
const rollToStored = (r: RollResult, manual = false): Combatant['roll'] =>
  ({ dice: r.dice[0]?.rolls ?? [], kept: r.dice[0]?.kept ?? 0, parts: r.parts, manual })

export default function CombatPage() {
  const { cid = '' } = useParams()
  const { backend, user, isAdmin } = useUser()
  const { t, lang } = useI18n()
  const { show, modeFor } = useDice()
  const ctx = useAsync(async () => {
    const [campaign, members] = await Promise.all([backend.getCampaign(cid), backend.listMembers(cid)])
    return campaign && { campaign, isMember: members.some((m) => m.uid === user.uid) }
  }, [cid])
  const isDm = !!ctx.data && (isAdmin || ctx.data.campaign.dmEmail === user.email)
  const canView = !!ctx.data && (isDm || ctx.data.isMember)

  const [snap, setSnap] = useState<CombatSnapshot | null>(null)
  const [chars, setChars] = useState<Character[]>([])
  const [error, setError] = useState<unknown>(null)
  const [mapView, setMapView] = useState<MapView | null>(null)
  const [params, setParams] = useSearchParams()
  const tab = params.get('view') === 'map' ? 'map' : 'order'
  useEffect(() => {
    if (!canView) return
    const a = backend.watchCombat(cid, isDm, setSnap, setError)
    const b = backend.watchCharacters(cid, setChars, setError)
    const c = backend.watchMap(cid, setMapView, setError)
    return () => { a(); b(); c() }
  }, [backend, cid, isDm, canView])

  const order = useMemo(() => initiativeOrder(snap?.combatants ?? []), [snap])
  const charById = (id: string) => chars.find((c) => c.id === id)
  const state = snap?.state
  const active = !!state?.active

  if (ctx.loading) return <Loading />
  if (!ctx.data || !canView) return <div className="page"><p className="error-box">{t('notFound')}</p></div>
  const { campaign } = ctx.data

  const act = (p: Promise<unknown>) => p.catch(setError)

  // ---------------------------------------------------------------- DM actions
  const startEncounter = async (name: string, addParty: boolean) => {
    await backend.saveCombatState(cid, { active: true, name, round: 1, turnId: null, startedAt: Date.now() })
    if (addParty) await addParty_()
  }
  const addParty_ = async () => {
    const existing = new Set((snap?.combatants ?? []).map((c) => c.id))
    await Promise.all(chars.filter((c) => !existing.has(c.id)).map((c) => backend.saveCombatant(cid, pcEntry(c))))
  }
  const pcEntry = (c: Character): Combatant => ({
    id: c.id, kind: 'pc', name: c.name, initiative: null, roll: null, dexMod: mod(c.abilities.dex),
    hidden: false, conditions: [], ownerUid: c.ownerUid, createdAt: Date.now(),
  })
  const addEnemies = async (e: { name: string; count: number; hp: number; ac: number; initBonus: number; hidden: boolean }) => {
    const now = Date.now()
    for (let i = 1; i <= e.count; i++) {
      const id = newId()
      const name = e.count > 1 ? `${e.name} ${i}` : e.name
      await backend.saveCombatant(cid, {
        id, kind: 'enemy', name, initiative: null, roll: null, dexMod: e.initBonus, hidden: e.hidden, conditions: [],
        status: 'healthy', createdAt: now + i,
      })
      await backend.saveEnemySecret(cid, id, { hp: e.hp, hpMax: e.hp, ac: e.ac, initBonus: e.initBonus, notes: '' })
    }
  }
  const rollEnemies = async () => {
    for (const c of order.filter((x) => x.kind === 'enemy' && x.initiative === null)) {
      const bonus = snap?.secrets[c.id]?.initBonus ?? 0
      const r = d20Test({ title: c.name, kind: 'initiative', parts: [{ label: t('cbInitBonus'), value: bonus }] })
      await backend.updateCombatant(cid, c.id, { initiative: r.total, roll: rollToStored(r) })
    }
  }
  const step = (dir: 1 | -1) => state && act(backend.saveCombatState(cid, { ...state, ...stepTurn(snap!.combatants, state.turnId, state.round, dir) }))
  const endCombat = () => { if (window.confirm(t('cbEndConfirm'))) act(backend.clearCombat(cid)) }

  // ---------------------------------------------------------------- rolls (players for their own PC, DM for anyone)
  const rollFor = (c: Combatant, e: React.MouseEvent) => {
    const ch = charById(c.id)
    const r = c.kind === 'pc' && ch
      ? d20Test({ title: t('diceInitiative'), subtitle: c.name, kind: 'initiative', mode: modeFor(e), parts: initiativeParts(ch, lang) })
      : d20Test({ title: t('diceInitiative'), subtitle: c.name, kind: 'initiative', mode: modeFor(e), parts: [{ label: t('cbInitBonus'), value: snap?.secrets[c.id]?.initBonus ?? c.dexMod }] })
    show(r)
    act(backend.updateCombatant(cid, c.id, { initiative: r.total, roll: rollToStored(r) }))
  }
  const setManual = (c: Combatant, value: number) =>
    act(backend.updateCombatant(cid, c.id, { initiative: value, roll: { dice: [], kept: 0, parts: [], manual: true } }))
  const join = (ch: Character) => act(backend.saveCombatant(cid, pcEntry(ch)))

  // ---------------------------------------------------------------- HP
  const changeHp = (c: Combatant, amount: number, kind: 'damage' | 'heal') => {
    if (!amount) return
    if (c.kind === 'pc') {
      const ch = charById(c.id)
      if (!ch) return
      const r = applyHp({ hp: ch.hpCurrent, temp: ch.hpTemp, max: ch.hpMax }, amount, kind)
      act(backend.updateCharacter(cid, ch.id, { hpCurrent: r.hp, hpTemp: r.temp }))
    } else {
      const sec = snap?.secrets[c.id]
      if (!sec) return
      const r = applyHp({ hp: sec.hp, temp: 0, max: sec.hpMax }, amount, kind)
      act(backend.saveEnemySecret(cid, c.id, { ...sec, hp: r.hp }))
      act(backend.updateCombatant(cid, c.id, { status: enemyStatus(r.hp, sec.hpMax) }))
    }
  }

  const myChars = chars.filter((c) => c.ownerUid === user.uid)
  const notJoined = myChars.filter((c) => !(snap?.combatants ?? []).some((x) => x.id === c.id))
  const turnVisible = order.some((c) => c.id === state?.turnId)
  const current = order.find((c) => c.id === state?.turnId)

  return (
    <div className="page combat-page">
      <div className="combat-top">
        <div>
          <Link to={`/campaign/${cid}`} className="muted small"><span className="arrow">←</span> {campaign.name}</Link>
          <h1 className="page-title">⚔ {t('cbTitle')}{active && state?.name ? <span className="muted"> · {state.name}</span> : null}</h1>
        </div>
        {active && <div className="round-badge"><span>{t('cbRound')}</span><strong>{state!.round}</strong></div>}
      </div>
      {error != null && <ErrorBox error={error} />}
      <Tabs
        tabs={[{ id: 'order', label: `⚔ ${t('cbTabOrder')}` }, { id: 'map', label: `🗺 ${t('cbTabMap')}${mapView?.state?.mapId ? ' ●' : ''}` }]}
        value={tab} onChange={(v) => setParams(v === 'map' ? { view: 'map' } : {}, { replace: true })}
      />
      {tab === 'map' ? (
        <MapPanel cid={cid} isDm={isDm} view={mapView} order={order} chars={chars} state={state} onStep={(d) => step(d)} onError={setError} />
      ) : !snap ? <Loading /> : !active ? (
        isDm ? <StartForm onStart={(n, p) => act(startEncounter(n, p))} /> : (
          <div className="card combat-empty">
            <span className="live-dot" /> {t('cbWaiting')}
            {mapView?.state?.mapId && <p><button className="btn btn-primary" onClick={() => setParams({ view: 'map' }, { replace: true })}>🗺 {t('mapOpenShown')}</button></p>}
          </div>
        )
      ) : (
        <>
          <div className={`turn-banner card ${current?.kind === 'enemy' ? 'enemy' : ''}`}>
            {state!.turnId === null ? t('cbNotStarted')
              : turnVisible ? <>{t('cbTurnOf')} <strong>{current!.name}</strong>{current!.ownerUid === user.uid ? ` — ${t('cbYourTurn')}` : ''}</>
              : t('cbHiddenTurn')}
          </div>

          {isDm && (
            <div className="dm-bar card">
              <div className="row wrap">
                <button className="btn" onClick={() => step(-1)}><span className="arrow">⏮</span> {t('cbPrev')}</button>
                <button className="btn btn-primary btn-large" onClick={() => step(1)}>{state!.turnId === null ? t('cbBegin') : t('cbNext')} <span className="arrow">▶</span></button>
                <span className="grow" />
                <button className="btn btn-small" onClick={() => act(rollEnemies())}>🎲 {t('cbRollEnemies')}</button>
                <button className="btn btn-small" onClick={() => act(addParty_())}>👥 {t('cbAddParty')}</button>
                <button className="btn btn-small btn-danger" onClick={endCombat}>{t('cbEnd')}</button>
              </div>
              <EnemyForm onAdd={(e) => act(addEnemies(e))} />
            </div>
          )}

          {!isDm && notJoined.length > 0 && (
            <div className="card join-card">
              {notJoined.map((ch) => <button key={ch.id} className="btn btn-primary" onClick={() => join(ch)}>⚔ {t('cbJoin', { name: ch.name })}</button>)}
            </div>
          )}

          {!isDm && order.filter((c) => c.ownerUid === user.uid && c.initiative === null).map((c) => (
            <InitPrompt key={c.id} name={c.name} onRoll={(e) => rollFor(c, e)} onManual={(v) => setManual(c, v)} />
          ))}

          <ol className="init-list">
            {order.length === 0 && <li className="empty">{t('cbEmpty')}</li>}
            {order.map((c, i) => (
              <CombatRow
                key={c.id} c={c} index={i} isTurn={c.id === state!.turnId} isDm={isDm}
                mine={c.ownerUid === user.uid} ch={c.kind === 'pc' ? charById(c.id) : undefined} secret={snap.secrets[c.id]}
                onRoll={(e) => rollFor(c, e)} onManual={(v) => setManual(c, v)} onHp={(n, k) => changeHp(c, n, k)}
                onUpdate={(p) => act(backend.updateCombatant(cid, c.id, p))}
                onSecret={(s) => act(backend.saveEnemySecret(cid, c.id, s))}
                onRemove={() => { if (window.confirm(t('confirmDelete', { name: c.name }))) act(backend.removeCombatant(cid, c.id)) }}
              />
            ))}
          </ol>
          <p className="muted small">{t('cbTip')}</p>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ pieces

function StartForm({ onStart }: { onStart(name: string, addParty: boolean): void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [party, setParty] = useState(true)
  return (
    <form className="card start-form" onSubmit={(e) => { e.preventDefault(); onStart(name.trim() || t('cbDefaultName'), party) }}>
      <h2>{t('cbStartTitle')}</h2>
      <p className="muted small">{t('cbStartHint')}</p>
      <div className="row wrap">
        <input className="grow" dir="auto" placeholder={t('cbEncounterName')} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="check"><input type="checkbox" checked={party} onChange={(e) => setParty(e.target.checked)} /> {t('cbAddPartyNow')}</label>
        <button className="btn btn-primary btn-large">⚔ {t('cbStart')}</button>
      </div>
    </form>
  )
}

/** A player's character without initiative yet: roll it here, or type what they rolled on real dice. */
function InitPrompt({ name, onRoll, onManual }: { name: string; onRoll(e: React.MouseEvent): void; onManual(v: number): void }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  return (
    <div className="card init-prompt">
      <strong className="init-prompt-title">{t('cbInitPrompt', { name })}</strong>
      <div className="init-prompt-choices">
        <button className="btn btn-primary btn-large" onClick={onRoll}>🎲 {t('cbRoll')}</button>
        <span className="init-prompt-or">{t('cbOr')}</span>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (value !== '') onManual(Math.round(+value)) }}>
          <label className="init-prompt-manual">{t('cbTypeRoll')}
            <input type="number" inputMode="numeric" min={-5} max={50} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <button className="btn" disabled={value === ''}>✓ {t('cbSetInit')}</button>
        </form>
      </div>
    </div>
  )
}

function EnemyForm({ onAdd }: { onAdd(e: { name: string; count: number; hp: number; ac: number; initBonus: number; hidden: boolean }): void }) {
  const { t } = useI18n()
  const blank = { name: '', count: 1, hp: 7, ac: 13, initBonus: 0, hidden: false }
  const [f, setF] = useState(blank)
  return (
    <form className="enemy-form" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) { onAdd({ ...f, name: f.name.trim() }); setF({ ...blank, hidden: f.hidden }) } }}>
      <strong className="enemy-form-title">👹 {t('cbAddEnemy')}</strong>
      <input dir="auto" className="grow" placeholder={t('cbEnemyName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <label>× <input type="number" min={1} max={20} value={f.count} onChange={(e) => setF({ ...f, count: Math.max(1, +e.target.value || 1) })} /></label>
      <label>HP <input type="number" min={1} value={f.hp} onChange={(e) => setF({ ...f, hp: Math.max(1, +e.target.value || 1) })} /></label>
      <label>AC <input type="number" min={0} value={f.ac} onChange={(e) => setF({ ...f, ac: +e.target.value || 0 })} /></label>
      <label>{t('cbInitShort')} <input type="number" value={f.initBonus} onChange={(e) => setF({ ...f, initBonus: +e.target.value || 0 })} /></label>
      <label className="check"><input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} /> {t('cbHidden')}</label>
      <button className="btn btn-primary" disabled={!f.name.trim()}>+ {t('add')}</button>
    </form>
  )
}

function CombatRow({ c, index, isTurn, isDm, mine, ch, secret, onRoll, onManual, onHp, onUpdate, onSecret, onRemove }: {
  c: Combatant; index: number; isTurn: boolean; isDm: boolean; mine: boolean; ch?: Character; secret?: EnemySecret
  onRoll(e: React.MouseEvent): void; onManual(v: number): void; onHp(n: number, k: 'damage' | 'heal'): void
  onUpdate(p: Partial<Combatant>): void; onSecret(s: EnemySecret): void; onRemove(): void
}) {
  const { t } = useI18n()
  const [amount, setAmount] = useState('')
  const [manual, setManual] = useState('')
  const [showConds, setShowConds] = useState(false)
  const canRoll = isDm || mine
  const canHp = isDm || mine
  const hp = c.kind === 'pc' ? (ch ? { cur: ch.hpCurrent, max: ch.hpMax, temp: ch.hpTemp } : null) : secret ? { cur: secret.hp, max: secret.hpMax, temp: 0 } : null
  const ac = c.kind === 'pc' ? ch?.armorClass : secret?.ac
  const showNumbers = c.kind === 'pc' || isDm
  const down = c.kind === 'enemy' ? c.status === 'down' : !!hp && hp.cur <= 0

  return (
    <li className={`init-row card ${c.kind} ${isTurn ? 'turn' : ''} ${down ? 'down' : ''} ${c.hidden ? 'hidden-enemy' : ''}`}>
      <div className="init-pos">{isTurn ? '▶' : index + 1}</div>
      <div className="init-score" title={t('diceInitiative')}>
        {c.initiative !== null ? <strong>{c.initiative}</strong> : <span className="muted">—</span>}
      </div>
      <div className="init-main">
        <div className="init-name">
          <span className="kind-icon">{c.kind === 'pc' ? '🛡' : '👹'}</span>
          <bdi>{c.name}</bdi>
          {c.hidden && <span className="pill">{t('cbHidden')}</span>}
          {c.kind === 'enemy' && !isDm && c.status && <span className={`pill status-${c.status}`}>{t(`cbStatus_${c.status}` as 'cbStatus_healthy')}</span>}
          {mine && <span className="pill pill-active">{t('cbYou')}</span>}
        </div>
        <div className="init-roll" dir="ltr">
          {c.roll?.manual ? <span className="muted small">{t('cbManual')}</span>
            : c.roll && c.roll.dice.length ? (
              <span className="small">
                d20 [{c.roll.dice.map((v, i) => (c.roll!.dice.length > 1 && i !== c.roll!.kept ? `(${v})` : v)).join(', ')}]
                {c.roll.parts.map((p) => ` ${p.value < 0 ? '−' : '+'} ${Math.abs(p.value)} ${p.label}`).join('')}
              </span>
            ) : c.initiative === null ? <span className="muted small">{t('cbWaitingRoll')}</span> : null}
        </div>
        {c.conditions.length > 0 && (
          <div className="cond-chips">{c.conditions.map((x) => <span key={x} className="cond-chip">{t(`cond_${x}` as 'cond_prone')}</span>)}</div>
        )}
      </div>

      {showNumbers && hp && (
        <div className="init-hp">
          <div className="hp-bar"><span style={{ width: `${Math.max(0, Math.min(100, (hp.cur / Math.max(1, hp.max)) * 100))}%` }} /></div>
          <span className="small" dir="ltr">HP {hp.cur}/{hp.max}{hp.temp ? ` +${hp.temp}` : ''}{ac !== undefined ? ` · AC ${ac}` : ''}</span>
        </div>
      )}

      <div className="init-actions">
        {canRoll && (
          <div className="row">
            <button className="btn btn-small" onClick={onRoll}>🎲 {c.initiative === null ? t('cbRoll') : t('cbReroll')}</button>
            <form className="manual-form" onSubmit={(e) => { e.preventDefault(); if (manual !== '') { onManual(+manual); setManual('') } }}>
              <input type="number" placeholder="#" title={t('cbManualHint')} aria-label={t('cbManualHint')} value={manual} onChange={(e) => setManual(e.target.value)} />
              {manual !== '' && <button className="btn btn-small" title={t('cbSetInit')}>✓</button>}
            </form>
          </div>
        )}
        {canHp && hp && (
          <div className="row hp-form">
            <input type="number" min={0} placeholder="HP" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn btn-small btn-danger" title={t('cbDamage')} onClick={() => { onHp(+amount || 0, 'damage'); setAmount('') }}>−</button>
            <button className="btn btn-small" title={t('cbHeal')} onClick={() => { onHp(+amount || 0, 'heal'); setAmount('') }}>+</button>
          </div>
        )}
        {isDm && (
          <div className="row">
            <button className="btn btn-small btn-ghost" onClick={() => setShowConds(!showConds)}>{t('cbConditions')}</button>
            {c.kind === 'enemy' && (
              <button className="btn btn-small btn-ghost" onClick={() => onUpdate({ hidden: !c.hidden })}>{c.hidden ? `👁 ${t('cbReveal')}` : t('cbHide')}</button>
            )}
            <button className="btn btn-small btn-ghost" onClick={onRemove} title={t('delete')}>✕</button>
          </div>
        )}
      </div>

      {isDm && showConds && (
        <div className="cond-picker">
          {CONDITIONS.map((x) => (
            <button key={x} className={`chip ${c.conditions.includes(x) ? 'on' : ''}`}
              onClick={() => onUpdate({ conditions: c.conditions.includes(x) ? c.conditions.filter((y) => y !== x) : [...c.conditions, x] })}>
              {t(`cond_${x}` as 'cond_prone')}
            </button>
          ))}
          {c.kind === 'enemy' && secret && (
            <label className="field secret-notes"><span className="field-label">{t('cbDmNotes')}</span>
              <input dir="auto" value={secret.notes} onChange={(e) => onSecret({ ...secret, notes: e.target.value })} /></label>
          )}
        </div>
      )}
    </li>
  )
}

