import { useState } from 'react'
import featsHe from '../data/feats.he.json'
import { FEATS, addFeat, featById, featSlotLevels, prereqProblems, removeFeat, type FeatDef, type PrereqProblem } from '../lib/feats'
import { useI18n } from '../lib/i18n'
import { ABILITY_NAMES } from '../lib/rules'
import { ABILITIES, type Ability, type Character, type CharacterFeat } from '../lib/types'

const he = featsHe as Record<string, { name: string; summary: string }>

type Draft = { featId: string; choice?: Ability; choice2?: Ability; level: number; name: string; description: string }

export default function FeatsTab({ ch, edit, onChange }: { ch: Character; edit: boolean; onChange(p: Partial<Character>): void }) {
  const { t, lang } = useI18n()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const feats = ch.feats ?? []
  const slots = featSlotLevels(ch)
  const earned = slots.filter((l) => l <= ch.level)
  const usedSlots = feats.filter((f) => f.featId !== 'custom').length

  const featName = (f: FeatDef) => (lang === 'he' && he[f.id]?.name) || f.name
  const featSummary = (f: FeatDef) => (lang === 'he' && he[f.id]?.summary) || f.summary
  const abilityName = (a: Ability) => ABILITY_NAMES[a][lang]

  const problemText = (p: PrereqProblem) =>
    p.kind === 'spellcasting' ? t('featNeedsSpellcasting')
      : p.kind === 'armor' ? t('featNeedsArmor', { armor: t(`armor_${p.armor}` as 'armor_light') })
      : t('featNeedsAbility', { list: p.options.map((o) => Object.entries(o).map(([a, n]) => `${abilityName(a as Ability)} ${n}`).join(' + ')).join(` ${t('or')} `) })

  const startDraft = (featId: string) => {
    const def = featById(featId)
    setDraft({ featId, level: ch.level, choice: def?.asi?.[0] ?? (featId === 'asi' ? 'str' : undefined), choice2: featId === 'asi' ? 'dex' : undefined, name: '', description: '' })
  }

  const confirm = () => {
    if (!draft) return
    if (draft.featId === 'custom' && !draft.name.trim()) return
    onChange(addFeat(ch, {
      featId: draft.featId,
      level: draft.level,
      choice: draft.choice,
      choice2: draft.choice2,
      notes: '',
      ...(draft.featId === 'custom' ? { name: draft.name.trim(), description: draft.description } : {}),
    }))
    setDraft(null)
    setAdding(false)
    setQ('')
  }

  const describeApplied = (f: CharacterFeat) => {
    const parts: string[] = []
    for (const [a, n] of Object.entries(f.applied?.abilities ?? {})) parts.push(`${abilityName(a as Ability)} +${n}`)
    if (f.applied?.save) parts.push(t('featSaveProf', { ability: abilityName(f.applied.save) }))
    if (f.applied?.hp) parts.push(t('featHp', { n: f.applied.hp }))
    const def = featById(f.featId)
    if (def?.effects?.initiative) parts.push(t('featInit', { n: def.effects.initiative }))
    if (def?.effects?.passive) parts.push(t('featPassive', { n: def.effects.passive }))
    return parts
  }

  const filtered = FEATS.filter((f) => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()) || (he[f.id]?.name ?? '').includes(q.trim()))

  return (
    <div className="feats-tab">
      <div className="card feats-head">
        <div>
          <h2 className="feats-title">{t('featsTitle')}</h2>
          <p className="muted small">
            {slots.length
              ? t('featSlots', { levels: slots.join(', '), used: usedSlots, earned: earned.length })
              : t('featNoSlots')}
          </p>
        </div>
        {edit && !adding && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ {t('featAdd')}</button>}
      </div>

      {adding && (
        <div className="card feat-picker">
          <div className="row wrap">
            <input className="grow" autoFocus placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-ghost" onClick={() => { setAdding(false); setDraft(null) }}>{t('cancel')}</button>
          </div>

          {draft ? (
            <DraftForm
              ch={ch} draft={draft} setDraft={setDraft} onConfirm={confirm} onBack={() => setDraft(null)}
              title={draft.featId === 'asi' ? t('featAsi') : draft.featId === 'custom' ? t('featCustom') : featName(featById(draft.featId)!)}
            />
          ) : (
            <ul className="feat-options">
              <li className="feat-option special" onClick={() => startDraft('asi')}>
                <strong>⬆ {t('featAsi')}</strong>
                <span className="muted small">{t('featAsiHint')}</span>
              </li>
              <li className="feat-option special" onClick={() => startDraft('custom')}>
                <strong>✎ {t('featCustom')}</strong>
                <span className="muted small">{t('featCustomHint')}</span>
              </li>
              {filtered.map((f) => {
                const problems = prereqProblems(ch, f)
                const taken = feats.some((x) => x.featId === f.id) && f.id !== 'elemental-adept'
                return (
                  <li key={f.id} className={`feat-option ${taken ? 'taken' : ''}`} onClick={() => !taken && startDraft(f.id)}>
                    <div className="feat-option-top">
                      <strong>{featName(f)}</strong>
                      {lang === 'he' && <bdi className="muted small">{f.name}</bdi>}
                      {taken ? <span className="pill">{t('featTaken')}</span>
                        : problems.length ? <span className="pill pill-warn">⚠ {problems.map(problemText).join(' · ')}</span>
                        : f.prereq ? <span className="pill pill-active">✓ {t('featQualifies')}</span> : null}
                    </div>
                    <span className="small">{featSummary(f)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {feats.length === 0 && !adding && <p className="empty">{t('featNone')}</p>}

      <div className="feat-list">
        {[...feats].sort((a, b) => a.level - b.level).map((f) => {
          const def = featById(f.featId)
          const title = f.featId === 'asi' ? t('featAsi') : f.featId === 'custom' ? f.name : def ? featName(def) : f.featId
          const desc = f.featId === 'custom' ? f.description : def ? featSummary(def) : ''
          const applied = describeApplied(f)
          const problems = def ? prereqProblems({ ...ch, feats: feats.filter((x) => x.uid !== f.uid) }, def) : []
          return (
            <article key={f.uid} className="card feat-card">
              <header className="feat-card-head">
                <span className="lvl-badge" title={t('level')}>{f.level}</span>
                <h3>{title}</h3>
                {lang === 'he' && def && <bdi className="muted small">{def.name}</bdi>}
                {edit && (
                  <button className="btn btn-small btn-danger" onClick={() => {
                    if (window.confirm(t('confirmDelete', { name: title ?? '' }))) onChange(removeFeat(ch, f.uid))
                  }}>{t('delete')}</button>
                )}
              </header>
              {desc && <p className="feat-desc prewrap">{desc}</p>}
              {applied.length > 0 && (
                <p className="feat-applied">{t('featApplied')}: {applied.map((a) => <span key={a} className="chip-applied">{a}</span>)}</p>
              )}
              {problems.length > 0 && <p className="notice small">⚠ {problems.map(problemText).join(' · ')}</p>}
              <textarea
                className="feat-notes" rows={2} dir="auto" placeholder={edit ? t('featNotes') : ''} readOnly={!edit}
                value={f.notes}
                onChange={(e) => onChange({ feats: feats.map((x) => (x.uid === f.uid ? { ...x, notes: e.target.value } : x)) })}
              />
            </article>
          )
        })}
      </div>
    </div>
  )
}

function DraftForm({ ch, draft, setDraft, onConfirm, onBack, title }: {
  ch: Character; draft: Draft; setDraft(d: Draft): void; onConfirm(): void; onBack(): void; title: string
}) {
  const { t, lang } = useI18n()
  const def = featById(draft.featId)
  const options: Ability[] = draft.featId === 'asi' ? ABILITIES : def?.asi ?? []
  const abilitySelect = (value: Ability | undefined, set: (a: Ability) => void) => (
    <select value={value} onChange={(e) => set(e.target.value as Ability)}>
      {options.map((a) => (
        <option key={a} value={a} disabled={ch.abilities[a] >= 20}>{ABILITY_NAMES[a][lang]} ({ch.abilities[a]})</option>
      ))}
    </select>
  )
  return (
    <div className="feat-draft">
      <h3>{title}</h3>
      {draft.featId === 'custom' && (
        <>
          <label className="field"><span className="field-label">{t('name')}</span>
            <input dir="auto" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="field"><span className="field-label">{t('description')}</span>
            <textarea dir="auto" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        </>
      )}
      <div className="row wrap">
        {options.length > 1 && draft.featId !== 'asi' && (
          <label className="field"><span className="field-label">{t('featChooseAbility')}</span>
            {abilitySelect(draft.choice, (a) => setDraft({ ...draft, choice: a }))}</label>
        )}
        {draft.featId === 'asi' && (
          <>
            <label className="field"><span className="field-label">+1</span>{abilitySelect(draft.choice, (a) => setDraft({ ...draft, choice: a }))}</label>
            <label className="field"><span className="field-label">+1</span>{abilitySelect(draft.choice2, (a) => setDraft({ ...draft, choice2: a }))}</label>
          </>
        )}
        <label className="field"><span className="field-label">{t('featLevelTaken')}</span>
          <input type="number" min={1} max={20} value={draft.level} onChange={(e) => setDraft({ ...draft, level: Math.max(1, Math.min(20, +e.target.value || 1)) })} /></label>
      </div>
      {draft.featId === 'asi' && <p className="muted small">{t('featAsiSame')}</p>}
      <div className="row end">
        <button className="btn btn-ghost" onClick={onBack}>{t('back')}</button>
        <button className="btn btn-primary" disabled={draft.featId === 'custom' && !draft.name.trim()} onClick={onConfirm}>{t('add')}</button>
      </div>
    </div>
  )
}
