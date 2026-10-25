import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AbilityDetails } from '../components/HomebrewAbility'
import { SpellCard } from '../components/SpellCard'
import { Empty, ErrorBox, Field } from '../components/ui'
import { useUser } from '../lib/auth'
import { homebrewProblems, newHomebrewId, toSpell, usesPreview, validDice, validUsesExpr } from '../lib/homebrew'
import { useI18n } from '../lib/i18n'
import { CLASSES, SCHOOLS, classById } from '../lib/rules'
import type {
  AbilityActivation, AbilityCategory, Campaign, Character, Homebrew, HomebrewAbility, HomebrewSpell,
} from '../lib/types'

type Kind = Homebrew['kind']
const CATEGORIES: AbilityCategory[] = ['class', 'race', 'item', 'boon', 'other']
const ACTIVATIONS: AbilityActivation[] = ['action', 'bonus', 'reaction', 'passive', 'other']
const CASTER_CLASSES = CLASSES.filter((c) => c.spellAbility).map((c) => c.id)

/**
 * The campaign's homebrew library. The DM creates, edits, grants and approves; players see what's approved and
 * can suggest spells and abilities (for one of their characters), editable until the DM decides.
 */
export default function HomebrewTab({ campaign, characters, isDm }: { campaign: Campaign; characters: Character[]; isDm: boolean }) {
  const { backend, user } = useUser()
  const { t, g } = useI18n()
  const [items, setItems] = useState<Homebrew[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [kind, setKind] = useState<Kind>('spell')
  const [editing, setEditing] = useState<Homebrew | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => backend.watchHomebrew(campaign.id, { all: isDm, uid: user.uid }, setItems, setError), [backend, campaign.id, isDm, user.uid])

  if (error) return <ErrorBox error={error} />
  if (!items) return null
  const pending = items.filter((h) => h.status === 'pending')
  const shown = items.filter((h) => h.kind === kind && (h.status === 'approved' || !isDm))
  const charName = (id: string) => characters.find((c) => c.id === id)?.name ?? '?'
  const mine = characters.filter((c) => c.ownerUid === user.uid)

  const create = (k: Kind) => {
    const base = {
      id: newHomebrewId(), campaignId: campaign.id, status: isDm ? 'approved' as const : 'pending' as const,
      createdBy: user.uid, createdByName: user.displayName || user.email, createdAt: Date.now(),
      name: '', desc: '', grantedTo: !isDm && mine.length === 1 ? [mine[0].id] : [],
    }
    setEditing(k === 'spell'
      ? { ...base, kind: 'spell', level: 1, school: 'evocation', castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', concentration: false, ritual: false, classes: [] }
      : { ...base, kind: 'ability', category: 'boon', activation: 'action', uses: null })
  }
  const save = async (h: Homebrew) => { await backend.saveHomebrew(campaign.id, h); setEditing(null) }
  const remove = async (h: Homebrew) => {
    if (!confirm(t(h.status === 'pending' && !isDm ? 'hbWithdrawConfirm' : 'hbDeleteConfirm', { name: h.name }))) return
    await backend.deleteHomebrew(campaign.id, h.id)
  }
  const approve = (h: Homebrew) => backend.saveHomebrew(campaign.id, { ...h, status: 'approved' })

  const row = (h: Homebrew) => {
    const canEdit = isDm || (h.createdBy === user.uid && h.status === 'pending')
    return (
      <li key={h.id} className={`hb-row card ${h.status}`}>
        <div className="hb-row-head">
          <button className="hb-name" onClick={() => setOpen(open === h.id ? null : h.id)}>
            <span className="hb-badge" title={t('hbHomebrew')}>🏠</span>
            <strong>{h.name}</strong>
            <span className="muted small">
              {h.kind === 'spell'
                ? `${h.level === 0 ? t('cantrip') : t('levelN', { n: h.level })} · ${t(`school_${h.school}` as 'school_evocation')}`
                : `${t(`hbCat_${h.category}` as 'hbCat_boon')} · ${t(`hbAct_${h.activation}` as 'hbAct_action')}${h.uses ? ` · ${h.uses.max} / ${t(h.uses.recharge === 'short' ? 'cfShort' : 'cfLong')}` : ''}`}
            </span>
          </button>
          {h.status === 'pending' && <span className="pill pill-pending">{t('hbPending')}</span>}
          <span className="grow" />
          {isDm && h.status === 'pending' && <button className="btn btn-small btn-primary" onClick={() => approve(h)}>✓ {t('hbApprove')}</button>}
          {canEdit && <button className="btn btn-small" onClick={() => setEditing(h)}>{t('edit')}</button>}
          {canEdit && <button className="btn btn-small btn-danger" onClick={() => remove(h)}>{isDm ? (h.status === 'pending' ? t('hbReject') : t('delete')) : t('hbWithdraw')}</button>}
        </div>
        <div className="hb-row-meta small muted">
          {h.kind === 'spell' && <span>{t('classes')}: {h.classes.map((c) => g('classes', c, classById(c)?.name ?? c)).join(', ') || '—'}</span>}
          {h.grantedTo.length > 0 && <span>🎁 {t('hbGrantedTo')}: {h.grantedTo.map(charName).join(', ')}</span>}
          {h.status === 'pending' && <span>{t('hbSuggestedBy', { name: h.createdByName })}</span>}
          {h.note && <span>💬 {h.note}</span>}
        </div>
        {open === h.id && (h.kind === 'spell'
          ? <SpellCard spell={toSpell(h)} />
          : <AbilityDetails h={h} />)}
      </li>
    )
  }

  return (
    <section className="section homebrew">
      <p className="muted">{isDm ? t('hbIntroDm') : t('hbIntroPlayer')}</p>

      {isDm && pending.length > 0 && (
        <div className="hb-pending">
          <h2 className="section-title">⏳ {t('hbWaiting', { n: pending.length })}</h2>
          <ul className="hb-list">{pending.map(row)}</ul>
        </div>
      )}

      <div className="row wrap hb-bar">
        <div className="mode-toggle">
          <button className={kind === 'spell' ? 'on' : ''} onClick={() => setKind('spell')}>✨ {t('hbSpells')} ({items.filter((h) => h.kind === 'spell' && (h.status === 'approved' || !isDm)).length})</button>
          <button className={kind === 'ability' ? 'on' : ''} onClick={() => setKind('ability')}>⚜ {t('hbAbilities')} ({items.filter((h) => h.kind === 'ability' && (h.status === 'approved' || !isDm)).length})</button>
        </div>
        <span className="grow" />
        <button className="btn btn-primary" onClick={() => create(kind)}>
          + {isDm ? t(kind === 'spell' ? 'hbNewSpell' : 'hbNewAbility') : t(kind === 'spell' ? 'hbSuggestSpell' : 'hbSuggestAbility')}
        </button>
      </div>

      {shown.length ? <ul className="hb-list">{shown.map(row)}</ul> : <Empty>{t(kind === 'spell' ? 'hbNoSpells' : 'hbNoAbilities')}</Empty>}

      {editing && createPortal(
        <Editor key={editing.id} initial={editing} isDm={isDm} characters={isDm ? characters : mine} onSave={save} onClose={() => setEditing(null)} />,
        document.body,
      )}
    </section>
  )
}

function Editor({ initial, isDm, characters, onSave, onClose }: {
  initial: Homebrew; isDm: boolean; characters: Character[]; onSave(h: Homebrew): Promise<void>; onClose(): void
}) {
  const { t, g } = useI18n()
  const [h, setH] = useState<Homebrew>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [tried, setTried] = useState(false)
  const problems = homebrewProblems(h)
  const bad = (k: string) => tried && problems.includes(k)
  const set = (p: Partial<HomebrewSpell> | Partial<HomebrewAbility>) => setH((x) => ({ ...x, ...p } as Homebrew))
  const isNew = !initial.name

  const submit = async () => {
    setTried(true)
    if (problems.length) return
    setBusy(true)
    try { await onSave({ ...h, name: h.name.trim() }) } catch (e) { setError(e); setBusy(false) }
  }
  const toggleGrant = (id: string) => set({
    grantedTo: isDm
      ? (h.grantedTo.includes(id) ? h.grantedTo.filter((x) => x !== id) : [...h.grantedTo, id])
      : (h.grantedTo.includes(id) ? [] : [id]), // a suggestion is for at most one of your characters
  })
  const sample = characters.find((c) => h.grantedTo.includes(c.id)) ?? characters[0]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal hb-modal" onClick={(e) => e.stopPropagation()}>
        <section className="card hb-editor" role="dialog" aria-label={t('hbHomebrew')}>
          <header className="cast-head">
            <h3>🏠 {isNew
              ? t(isDm ? (h.kind === 'spell' ? 'hbNewSpell' : 'hbNewAbility') : (h.kind === 'spell' ? 'hbSuggestSpell' : 'hbSuggestAbility'))
              : h.name}</h3>
            <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>
          </header>

          <div className="form-grid">
            <Field label={t('hbName')}>
              <input className={bad('name') ? 'invalid' : ''} value={h.name} dir="auto" autoFocus onChange={(e) => set({ name: e.target.value })} />
            </Field>
            {h.kind === 'spell' ? (
              <>
                <Field label={t('level')}>
                  <select value={h.level} onChange={(e) => set({ level: +e.target.value })}>
                    {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i === 0 ? t('cantrip') : t('levelN', { n: i })}</option>)}
                  </select>
                </Field>
                <Field label={t('school')}>
                  <select value={h.school} onChange={(e) => set({ school: e.target.value })}>
                    {SCHOOLS.map((s) => <option key={s} value={s}>{t(`school_${s}` as 'school_evocation')}</option>)}
                  </select>
                </Field>
                <Field label={t('castingTime')}><input dir="auto" value={h.castingTime} onChange={(e) => set({ castingTime: e.target.value })} /></Field>
                <Field label={t('range')}><input dir="auto" value={h.range} onChange={(e) => set({ range: e.target.value })} /></Field>
                <Field label={t('components')} hint={t('hbComponentsHint')}><input dir="auto" value={h.components} onChange={(e) => set({ components: e.target.value })} /></Field>
                <Field label={t('hbMaterial')}><input dir="auto" value={h.material ?? ''} onChange={(e) => set({ material: e.target.value || undefined })} /></Field>
                <Field label={t('duration')}><input dir="auto" value={h.duration} onChange={(e) => set({ duration: e.target.value })} /></Field>
              </>
            ) : (
              <>
                <Field label={t('hbCategory')}>
                  <select value={h.category} onChange={(e) => set({ category: e.target.value as AbilityCategory })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{t(`hbCat_${c}` as 'hbCat_boon')}</option>)}
                  </select>
                </Field>
                <Field label={t('hbActivation')}>
                  <select value={h.activation} onChange={(e) => set({ activation: e.target.value as AbilityActivation })}>
                    {ACTIVATIONS.map((a) => <option key={a} value={a}>{t(`hbAct_${a}` as 'hbAct_action')}</option>)}
                  </select>
                </Field>
                <Field label={t('hbDice')} hint={t('hbDiceHint')}>
                  <input className={bad('dice') ? 'invalid' : ''} dir="ltr" value={h.dice ?? ''} placeholder="1d8+wis" onChange={(e) => set({ dice: e.target.value || undefined })} />
                </Field>
              </>
            )}
          </div>

          {h.kind === 'spell' ? (
            <>
              <div className="row wrap">
                <label className="check"><input type="checkbox" checked={h.concentration} onChange={(e) => set({ concentration: e.target.checked })} /> {t('concentration')}</label>
                <label className="check"><input type="checkbox" checked={h.ritual} onChange={(e) => set({ ritual: e.target.checked })} /> {t('ritual')}</label>
              </div>
              <div className={`hb-field ${bad('classes') ? 'invalid' : ''}`}>
                <span className="field-label">{t('hbClassLists')}</span>
                <div className="chip-row">
                  {CASTER_CLASSES.map((c) => (
                    <button key={c} type="button" className={`chip ${h.classes.includes(c) ? 'on' : ''}`}
                      onClick={() => set({ classes: h.classes.includes(c) ? h.classes.filter((x) => x !== c) : [...h.classes, c] })}>
                      {g('classes', c, classById(c)?.name ?? c)}
                    </button>
                  ))}
                </div>
                <span className="field-hint">{t('hbClassListsHint')}</span>
              </div>
            </>
          ) : (
            <div className="hb-field">
              <label className="check">
                <input type="checkbox" checked={!!h.uses} onChange={(e) => set({ uses: e.target.checked ? { max: '1', recharge: 'long' } : null })} />
                {t('hbLimited')}
              </label>
              {h.uses && (
                <div className="row wrap hb-uses">
                  <Field label={t('hbUses')} hint={t('hbUsesHint')}>
                    <input className={bad('uses') || (h.uses.max && !validUsesExpr(h.uses.max)) ? 'invalid' : ''} dir="ltr" value={h.uses.max}
                      onChange={(e) => set({ uses: { ...h.uses!, max: e.target.value } })} />
                  </Field>
                  <Field label={t('hbRecharge')}>
                    <select value={h.uses.recharge} onChange={(e) => set({ uses: { ...h.uses!, recharge: e.target.value as 'short' | 'long' } })}>
                      <option value="short">☾ {t('cfShortRest')}</option>
                      <option value="long">☀ {t('cfLongRest')}</option>
                    </select>
                  </Field>
                  {sample && validUsesExpr(h.uses.max) && (
                    <span className="muted small hb-preview">{t('hbUsesPreview', { name: sample.name, level: sample.level, n: usesPreview(h.uses.max, sample) })}</span>
                  )}
                </div>
              )}
              {h.dice && !validDice(h.dice) && <p className="error-box small">{t('hbDiceBad')}</p>}
            </div>
          )}

          <Field label={t('hbDescription')}>
            <textarea rows={6} dir="auto" value={h.desc} onChange={(e) => set({ desc: e.target.value })} />
          </Field>
          {h.kind === 'spell' && (
            <Field label={t('atHigherLevels')}>
              <textarea rows={2} dir="auto" value={h.higherLevel ?? ''} onChange={(e) => set({ higherLevel: e.target.value || undefined })} />
            </Field>
          )}

          {characters.length > 0 && (
            <div className="hb-field">
              <span className="field-label">🎁 {t(isDm ? 'hbGrantTitle' : 'hbForCharacter')}</span>
              <div className="chip-row">
                {characters.map((c) => (
                  <button key={c.id} type="button" className={`chip ${h.grantedTo.includes(c.id) ? 'on' : ''}`} onClick={() => toggleGrant(c.id)}>
                    {c.name} <small>{g('classes', c.classId, classById(c.classId)?.name ?? c.classId)} {c.level}</small>
                  </button>
                ))}
              </div>
              <span className="field-hint">{t(h.kind === 'spell' ? 'hbGrantSpellHint' : 'hbGrantAbilityHint')}</span>
            </div>
          )}

          {!isDm && (
            <Field label={t('hbNote')}>
              <input dir="auto" value={h.note ?? ''} placeholder={t('hbNotePlaceholder')} onChange={(e) => set({ note: e.target.value || undefined })} />
            </Field>
          )}

          {tried && problems.length > 0 && <p className="error-box small">{t('hbFixFields')}</p>}
          {error ? <ErrorBox error={error} /> : null}
          <div className="row">
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              {isDm ? t('save') : isNew ? t('hbSendSuggestion') : t('save')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
