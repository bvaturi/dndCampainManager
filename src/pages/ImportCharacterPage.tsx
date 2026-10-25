import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AiHelper from '../components/AiHelper'
import { ErrorBox, Field, Loading } from '../components/ui'
import { useUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { NoFormFieldsError, importCharacterPdf, type ImportResult } from '../lib/pdfImport'
import { ABILITY_NAMES, BACKGROUNDS, CLASSES, RACES, classById, raceById, signed, mod } from '../lib/rules'
import { ABILITIES } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { L } from '../sheet/labels'
import { useHomebrew } from '../components/HomebrewScope'

export default function ImportCharacterPage() {
  useHomebrew() // re-render when the campaign's homebrew changes (spell lists, abilities)
  const { cid = '' } = useParams()
  const { backend, user } = useUser()
  const { t, g, lang } = useI18n()
  const nav = useNavigate()
  const campaign = useAsync(async () => {
    const [c, members] = await Promise.all([backend.getCampaign(cid), backend.listMembers(cid)])
    return c && { campaign: c, member: members.some((m) => m.uid === user.uid) }
  }, [cid])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [draft, setDraft] = useState<ImportResult['character'] | null>(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [dragging, setDragging] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [noFields, setNoFields] = useState(false)

  if (campaign.loading) return <Loading />
  const ctx = campaign.data
  if (!ctx || !ctx.member) {
    return <div className="page"><p className="error-box">{t('notFound')}</p></div>
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setNoFields(false)
    setReading(true)
    try {
      const r = await importCharacterPdf(await file.arrayBuffer())
      setResult(r)
      setDraft(r.character)
    } catch (e) {
      if (e instanceof NoFormFieldsError) setNoFields(true)
      else setError(e)
      setResult(null)
      setShowAi(true)
    } finally {
      setReading(false)
    }
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const cls = classById(draft.classId)
      const id = await backend.createCharacter({
        ...draft,
        saveProfs: draft.saveProfs.length ? draft.saveProfs : cls?.saves ?? [],
        campaignId: cid,
        ownerUid: user.uid,
        ownerName: user.displayName,
      })
      nav(`/campaign/${cid}/character/${id}`)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  const race = draft ? raceById(draft.race) : undefined
  const cls = draft ? classById(draft.classId) : undefined
  const canSave = !!draft && !!draft.name.trim() && !!draft.race && !!draft.classId
  // Suggest the AI helper when the sheet was only partly understood.
  const poorRead = !!result && (
    result.warnings.some((w) => w === 'noClass' || w === 'noRace' || w === 'noName')
    || result.unmatchedSpells.length > 2
    || (draft?.skillProfs.length ?? 0) === 0
  )

  return (
    <div className="page import-page">
      <h1 className="page-title">{t('importTitle')} <span className="muted small">· {ctx.campaign.name}</span></h1>

      {!result && (
        <>
          <p className="import-explain">{t('importExplain')}</p>
          <label
            className={`drop-zone ${dragging ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]) }}
          >
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => readFile(e.target.files?.[0])} />
            <span className="drop-icon" aria-hidden="true">📜</span>
            <span>{reading ? t('importReading') : t('importDrop')}</span>
          </label>
          {noFields && <p className="error-box">{t('noFormFields')}</p>}
          {error != null && <ErrorBox error={error} />}
          {!showAi && (
            <button className="ai-link" onClick={() => setShowAi(true)}>🤖 {t('aiLink')}</button>
          )}
        </>
      )}

      {showAi && <AiHelper onClose={() => setShowAi(false)} characterName={draft?.name || undefined} />}

      {result && draft && (
        <div className="card import-preview">
          <p className="muted">{t('importCheck')}</p>
          {result.warnings.map((w) => <p key={w} className="notice">{t(`warn_${w}` as 'warn_noClass')}</p>)}

          <div className="form-grid">
            <Field label={t('charName')}>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label={t('stepRace')} hint={result.source.race ? t('importFromSheet', { v: result.source.race }) : undefined}>
              <div className="row">
                <select value={draft.race} onChange={(e) => setDraft({ ...draft, race: e.target.value, subrace: '' })}>
                  <option value="">{t('importNotRecognised')}</option>
                  {RACES.map((r) => <option key={r.id} value={r.id}>{g('races', r.id, r.name)}</option>)}
                </select>
                {race && race.subraces.length > 0 && (
                  <select value={draft.subrace} onChange={(e) => setDraft({ ...draft, subrace: e.target.value })}>
                    <option value="">—</option>
                    {race.subraces.map((s) => <option key={s.id} value={s.id}>{g('subraces', s.id, s.name)}</option>)}
                  </select>
                )}
              </div>
            </Field>
            <Field label={`${t('stepClass')} / ${t('level')}`} hint={result.source.classLevel ? t('importFromSheet', { v: result.source.classLevel }) : undefined}>
              <div className="row">
                <select value={draft.classId} onChange={(e) => setDraft({ ...draft, classId: e.target.value, subclass: '' })}>
                  <option value="">{t('importNotRecognised')}</option>
                  {CLASSES.map((c) => <option key={c.id} value={c.id}>{g('classes', c.id, c.name)}</option>)}
                </select>
                {cls && (
                  <select value={draft.subclass} onChange={(e) => setDraft({ ...draft, subclass: e.target.value })}>
                    <option value="">—</option>
                    {cls.subclasses.map((s) => <option key={s.id} value={s.id}>{g('subclasses', s.id, s.name)}</option>)}
                  </select>
                )}
                <input type="number" min={1} max={20} className="level-input" value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: Math.max(1, Math.min(20, +e.target.value || 1)) })} />
              </div>
            </Field>
            <Field label={L.background[lang]} hint={result.source.background ? t('importFromSheet', { v: result.source.background }) : undefined}>
              <select value={draft.background} onChange={(e) => setDraft({ ...draft, background: e.target.value })}>
                <option value="">—</option>
                {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{g('backgrounds', b.id, b.name)}</option>)}
              </select>
            </Field>
          </div>

          <div className="review-abilities">
            {ABILITIES.map((a) => (
              <div key={a} className="mini-ability">
                <span>{ABILITY_NAMES[a].short[lang]}</span><strong>{draft.abilities[a]}</strong><em>{signed(mod(draft.abilities[a]))}</em>
              </div>
            ))}
          </div>
          <p className="small">
            HP {draft.hpCurrent}/{draft.hpMax} · AC {draft.armorClass} · {t('speed')} {draft.speed} ·{' '}
            {t('importSkills', { n: draft.skillProfs.length })} · {t('importAttacks', { n: draft.attacks.length })} ·{' '}
            {t('importSpellsMatched', { n: draft.spells.length })}
          </p>
          {poorRead && !showAi && (
            <div className="notice ai-suggest">
              <span>{t('aiSuggest')}</span>
              <button className="btn btn-small" onClick={() => setShowAi(true)}>🤖 {t('aiTitle')}</button>
            </div>
          )}
          {result.unmatchedSpells.length > 0 && (
            <p className="notice">{t('importUnmatched', { list: result.unmatchedSpells.join(', ') })}</p>
          )}
          {error != null && <ErrorBox error={error} />}

          <div className="row end">
            <button className="btn btn-ghost" onClick={() => { setResult(null); setDraft(null); setError(null) }}>{t('importAnother')}</button>
            <button className="btn btn-primary btn-large" disabled={!canSave || busy} onClick={save}>⇪ {t('importConfirm')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
