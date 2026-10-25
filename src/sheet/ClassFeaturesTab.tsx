import { useState } from 'react'
import classFeaturesHe from '../data/classFeatures.he.json'
import { UNLIMITED, allFeatures, characterResources, rechargeAt, resourceLabel, type ClassFeature, type ResourceState } from '../lib/classFeatures'
import ResourceTracker from './ResourceTracker'
import { AbilityDetails } from '../components/HomebrewAbility'
import { characterAbilities } from '../lib/homebrew'
import { useRest } from './RestDialog'
import { useI18n } from '../lib/i18n'
import { SPELLS, classById, type OptionGroup, type Spell } from '../lib/rules'
import { SpellCard } from '../components/SpellCard'
import type { Character } from '../lib/types'

const HE = classFeaturesHe as Record<string, { name?: string; summary?: string }>

/** Everything the character's class and subclass give them, with trackers for limited uses and rest buttons. */
export default function ClassFeaturesTab({ ch, edit, onChange }: { ch: Character; edit: boolean; onChange(p: Partial<Character>): void }) {
  const { t, g, lang } = useI18n()
  const [showFuture, setShowFuture] = useState(false)
  const [openSpell, setOpenSpell] = useState<Spell | null>(null)
  const rest = useRest(ch, onChange)
  const cls = classById(ch.classId)
  if (!cls) return <p className="empty">{t('notFound')}</p>
  const sub = cls.subclasses.find((s) => s.id === ch.subclass)
  const features = allFeatures(ch.classId, ch.subclass)
  const have = features.filter((f) => f.level <= ch.level)
  const future = features.filter((f) => f.level > ch.level)
  const resources = characterResources(ch)
  const row = cls.progression.find((p) => p.level === ch.level)
  const columns = Object.entries(row?.columns ?? {}).filter(([k]) => !/^\d+(st|nd|rd|th)$|slot|cantrip|spells known/i.test(k))

  const heKey = (f: ClassFeature) => `${ch.classId}|${f.subclass ?? ''}|${f.name}`
  const name = (f: ClassFeature) => (lang === 'he' && (HE[heKey(f)]?.name || g('features', f.name, ''))) || f.name
  const summary = (f: ClassFeature) => (lang === 'he' && HE[heKey(f)]?.summary) || f.summary || ''

  const setUsed = (r: ResourceState, used: number) =>
    onChange({ resources: { ...(ch.resources ?? {}), [r.key]: Math.max(0, Math.min(r.total, used)) } })


  return (
    <div className="class-features">
      {rest.dialog}
      <div className="card cf-head">
        <div>
          <h2>{g('classes', cls.id, cls.name)} {ch.level}{sub ? <span className="muted"> · {g('subclasses', sub.id, sub.name)}</span> : null}</h2>
          {columns.length > 0 && (
            <div className="cf-columns">
              {columns.map(([k, v]) => <span key={k} className="slot-chip">{k}: <strong dir="ltr">{String(v)}</strong></span>)}
            </div>
          )}
        </div>
        {edit && (
          <div className="row">
            <button className="btn" onClick={() => rest.open('short')}>☾ {t('cfShortRest')}</button>
            <button className="btn btn-primary" onClick={() => rest.open('long')}>☀ {t('cfLongRest')}</button>
          </div>
        )}
      </div>

      {resources.length > 0 && (
        <section className="cf-resources">
          {resources.map((r) => <ResourceCard key={r.key} r={r} level={ch.level} edit={edit} onUsed={(u) => setUsed(r, u)} label={resourceLabel(r, lang)} />)}
        </section>
      )}

      {!sub && ch.level >= cls.subclassLevel && (
        <p className="notice">{t('cfNoSubclass', { flavor: cls.subclassFlavor || t('subclass') })}</p>
      )}

      <section className="cf-list">
        {have.map((f) => {
          const r = f.resource ? resources.find((x) => x.key === f.resource!.key) : undefined
          return (
            <FeatureCard key={`${f.subclass ?? ''}${f.name}${f.level}`} f={f} name={name(f)} summary={summary(f)} sub={f.subclass ? g('subclasses', f.subclass, sub?.name) : ''}>
              {r && <div className="cf-card-tracker"><span className="muted small">{resourceLabel(r, lang)}</span><ResourceTracker r={r} level={ch.level} edit={edit} onUsed={(u) => setUsed(r, u)} /></div>}
            </FeatureCard>
          )
        })}
      </section>

      {characterAbilities(ch).length > 0 && (
        <section className="cf-homebrew">
          <h3 className="cf-section-title">🏠 {t('hbSheetTitle')}</h3>
          <div className="cf-list">
            {characterAbilities(ch).map((h) => {
              const r = resources.find((x) => x.key === h.id)
              return (
                <article key={h.id} className="cf-card card hb-card">
                  <header className="cf-card-head">
                    <span className="lvl-badge" title={t('hbHomebrew')}>🏠</span>
                    <h3><bdi>{h.name}</bdi></h3>
                    {h.uses && <span className="pill pill-active">⟳</span>}
                  </header>
                  <AbilityDetails h={h} ch={ch}>
                    {r && <div className="cf-card-tracker"><span className="muted small">{t(rechargeAt(r, ch.level) === 'short' ? 'restShortTag' : 'restLongTag')}</span><ResourceTracker r={r} level={ch.level} edit={edit} onUsed={(u) => setUsed(r, u)} /></div>}
                  </AbilityDetails>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {sub && (sub.spells || sub.spellsByTerrain) && (
        <SubclassSpells ch={ch} spells={sub.spells} byTerrain={sub.spellsByTerrain} patron={ch.classId === 'warlock'} onOpen={setOpenSpell} />
      )}

      {[...(cls.options ?? []), ...(sub?.options ?? [])].length > 0 && (
        <section className="card cf-options">
          <h3>{t('cfOptions')}</h3>
          {[...(cls.options ?? []), ...(sub?.options ?? [])].map((grp) => <OptionList key={grp.feature} classId={ch.classId} grp={grp} />)}
        </section>
      )}

      {future.length > 0 && (
        <section className="cf-future">
          <button className="btn btn-ghost" onClick={() => setShowFuture(!showFuture)}>
            {showFuture ? '▾' : '▸'} {t('cfUpcoming', { n: future.length })}
          </button>
          {showFuture && (
            <div className="cf-list future">
              {future.map((f) => <FeatureCard key={`${f.subclass ?? ''}${f.name}${f.level}`} f={f} name={name(f)} summary={summary(f)} sub={f.subclass ? g('subclasses', f.subclass, sub?.name) : ''} />)}
            </div>
          )}
        </section>
      )}
      {openSpell && (
        <div className="modal-backdrop" onClick={() => setOpenSpell(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}><SpellCard spell={openSpell} onClose={() => setOpenSpell(null)} /></div>
        </div>
      )}
    </div>
  )
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const findSpell = (name: string) => SPELLS.find((s) => normName(s.name) === normName(name) || normName(s.name.replace(/^\w+'s /, '')) === normName(name))

function SpellRow({ list, locked, onOpen }: { list: string[]; locked: boolean; onOpen(s: Spell): void }) {
  const { g } = useI18n()
  return (
    <span className={`cf-spell-names ${locked ? 'locked' : ''}`}>
      {list.map((n) => {
        const s = findSpell(n)
        return s
          ? <button key={n} className="chip" onClick={() => onOpen(s)}>{g('spells', s.id, s.name)}</button>
          : <span key={n} className="chip">{n}</span>
      })}
    </span>
  )
}

/** Domain / oath / circle spells (always prepared, by class level) or a warlock patron's expanded list (by spell level). */
function SubclassSpells({ ch, spells, byTerrain, patron, onOpen }: {
  ch: Character; spells?: Record<string, string[]>; byTerrain?: Record<string, Record<string, string[]>>; patron: boolean; onOpen(s: Spell): void
}) {
  const { t } = useI18n()
  const rows = (map: Record<string, string[]>) => Object.entries(map).sort((a, b) => +a[0] - +b[0]).map(([lv, list]) => (
    <div key={lv} className="cf-spell-row">
      <span className="lvl-badge">{lv}</span>
      <span className="muted small">{patron ? t('cfSpellLevel', { n: lv }) : t('cfClassLevel', { n: lv })}</span>
      <SpellRow list={list} locked={!patron && ch.level < +lv} onOpen={onOpen} />
    </div>
  ))
  return (
    <section className="card cf-spells">
      <h3>{patron ? t('cfExpandedList') : t('cfAlwaysPrepared')}</h3>
      {spells && rows(spells)}
      {byTerrain && Object.entries(byTerrain).map(([terrain, map]) => (
        <details key={terrain} className="cf-terrain"><summary>{terrain}</summary>{rows(map)}</details>
      ))}
    </section>
  )
}

function OptionList({ classId, grp }: { classId: string; grp: OptionGroup }) {
  const { lang } = useI18n()
  return (
    <details className="cf-option-group">
      <summary><strong>{(lang === 'he' && HE[`${classId}||${grp.feature}`]?.name) || grp.feature}</strong> <span className="muted small">({grp.choices.length})</span></summary>
      <ul className="cf-choice-list">
        {grp.choices.map((c) => {
          const he = lang === 'he' ? HE[`${classId}|opt|${grp.feature}|${c.name}`] : undefined
          return (
            <li key={c.name}>
              <strong>{he?.name || c.name}</strong>
              {c.prerequisite && <span className="pill pill-warn">{c.prerequisite}</span>}
              {(he?.summary || c.summary) && <span className="small"> — {he?.summary || c.summary}</span>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function FeatureCard({ f, name, summary, sub, children }: { f: ClassFeature; name: string; summary: string; sub: string; children?: React.ReactNode }) {
  const { t, lang } = useI18n()
  return (
    <article className="cf-card card">
      <header className="cf-card-head">
        <span className="lvl-badge" title={t('level')}>{f.level}</span>
        <h3>{name}</h3>
        {lang === 'he' && name !== f.name && <bdi className="muted small">{f.name}</bdi>}
        {sub && <span className="pill">{sub}</span>}
        {f.resource && <span className="pill pill-active">⟳</span>}
      </header>
      {summary && <p className="cf-summary">{summary}</p>}
      {children}
      {f.desc && (
        <details className="cf-srd">
          <summary>{t('cfRulesText')}</summary>
          <div dir="ltr" lang="en">{f.desc.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>
        </details>
      )}
    </article>
  )
}

function ResourceCard({ r, level, edit, label, onUsed }: { r: ResourceState; level: number; edit: boolean; label: string; onUsed(used: number): void }) {
  const { t } = useI18n()
  const left = r.total - r.used
  return (
    <div className={`cf-res card ${left === 0 ? 'empty-res' : ''}`}>
      <div className="cf-res-top">
        <strong>{label}</strong>
        {r.total < UNLIMITED && <span className="pill">{t(rechargeAt(r, level) === 'short' ? 'cfShort' : 'cfLong')}</span>}
      </div>
      {r.total < UNLIMITED && <div className="cf-res-count" dir="ltr"><strong>{left}</strong> / {r.total}</div>}
      <ResourceTracker r={r} level={level} edit={edit} onUsed={onUsed} />
      <span className="muted small">{r.source}</span>
    </div>
  )
}
