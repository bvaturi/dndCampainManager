import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { featureNameHe, featureSummaryHe } from '../lib/classFeatures'
import { rollDie } from '../lib/dice'
import { useI18n } from '../lib/i18n'
import { applyLevelUp, hpGain, levelUpPlan, type GainedFeature } from '../lib/levelUp'
import { ABILITY_NAMES, SKILLS, classById, mod, signed } from '../lib/rules'
import { ABILITIES, type Ability, type Character } from '../lib/types'

/** The Level up button and its window: shows everything the new level gives before applying it. */
export function LevelUpButton({ ch, onChange }: { ch: Character; onChange(p: Partial<Character>): void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (ch.level >= 20) return null
  return (
    <>
      <button className="btn btn-small" onClick={() => setOpen(true)}>▲ {t('levelUp')}</button>
      {/* Portal: the sheet pages are CSS-transformed, which would trap a fixed-position dialog inside the page. */}
      {open && createPortal(<LevelUpDialog ch={ch} onChange={onChange} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <li><span className="rest-name">{label}</span><span className="rest-val">{children}</span></li>
}
const Arrow = ({ from, to }: { from: ReactNode; to: ReactNode }) => (
  <><bdi dir="ltr">{from}</bdi> <span className="arrow">→</span> <strong><bdi dir="ltr">{to}</bdi></strong></>
)

function LevelUpDialog({ ch, onChange, onClose }: { ch: Character; onChange(p: Partial<Character>): void; onClose(): void }) {
  const { t, g, lang } = useI18n()
  const cls = classById(ch.classId)!
  const [subclass, setSubclass] = useState(ch.subclass)
  const [rolled, setRolled] = useState<number | null>(null)
  const [asiMode, setAsiMode] = useState<'scores' | 'feat'>('scores')
  const [asi, setAsi] = useState<{ choice: Ability; choice2: Ability }>(() => {
    const open = ABILITIES.filter((a) => ch.abilities[a] < 20)
    return { choice: open[0] ?? 'str', choice2: open[0] ?? 'str' }
  })
  const [expertise, setExpertise] = useState<string[]>([])
  const plan = levelUpPlan(ch, subclass)
  if (!plan) return null
  // Expertise doubles the proficiency bonus for skills the character is already proficient in.
  const expertiseOptions = SKILLS.filter((s) => ch.skillProfs.includes(s.id) && !ch.expertise.includes(s.id))
  const toggleExpertise = (id: string) =>
    setExpertise((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < plan.expertise ? [...cur, id] : cur))

  const die = rolled ?? plan.hpFixed
  const hp = hpGain(plan, die)
  const featureName = (f: GainedFeature) => (lang === 'he' && featureNameHe(ch.classId, f.subclass, f.name)) || g('features', f.name, f.name)
  const featureSummary = (f: GainedFeature) => (lang === 'he' && featureSummaryHe(ch.classId, f.subclass, f.name)) || f.summary || ''
  const subName = (id: string) => g('subclasses', id, cls.subclasses.find((s) => s.id === id)?.name)
  const spellNames = (list: { id: string; name: string }[]) => list.map((s) => g('spells', s.id, s.name)).join(', ')

  // What the improvement would do (scores cap at 20; the same ability twice is +2).
  const scoresAfter = { ...ch.abilities }
  if (plan.asi && asiMode === 'scores') for (const a of [asi.choice, asi.choice2]) if (scoresAfter[a] < 20) scoresAfter[a] += 1
  const conHp = (mod(scoresAfter.con) - mod(ch.abilities.con)) * plan.level
  const hasSpellChanges = plan.slots.length > 0 || !!plan.pact || !!plan.cantrips || !!plan.spells || !!plan.prepared || plan.alwaysPrepared.length > 0

  const finish = () => {
    onChange(applyLevelUp(ch, plan, {
      subclass,
      die,
      asi: plan.asi && asiMode === 'scores' ? asi : undefined,
      expertise,
      featureLines: plan.features.map((f) => (featureSummary(f) ? `${featureName(f)}: ${featureSummary(f)}` : featureName(f))),
    }))
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <section className="rest-dialog levelup card" role="dialog" aria-label={t('luTitle', { level: plan.level })}>
          <header className="cast-head">
            <div>
              <h3>▲ {t('luTitle', { level: plan.level })}</h3>
              <div className="muted small"><bdi>{ch.name}</bdi> · {g('classes', cls.id, cls.name)}{subclass ? ` (${subName(subclass)})` : ''} {ch.level} <span className="arrow">→</span> {plan.level}</div>
            </div>
            <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>
          </header>

          {plan.needsSubclass && (
            <div className="rest-block">
              <h4>{cls.subclassFlavor || t('subclass')}</h4>
              <p className="notice small">{t('luPickSubclass', { flavor: cls.subclassFlavor || t('subclass'), level: cls.subclassLevel })}</p>
              <div className="chip-row">
                {cls.subclasses.map((s) => (
                  <button key={s.id} type="button" className={`chip ${subclass === s.id ? 'on' : ''}`} onClick={() => setSubclass(s.id)}>{subName(s.id)}</button>
                ))}
              </div>
            </div>
          )}
          {!ch.subclass && subclass && !plan.needsSubclass && (
            <div className="rest-block">
              <h4>{cls.subclassFlavor || t('subclass')}: {subName(subclass)}</h4>
              <button className="btn btn-small btn-ghost" onClick={() => setSubclass('')}>↶ {t('luChangeSubclass')}</button>
            </div>
          )}

          {/* Hit points: roll the Hit Die or take the class's fixed value (PHB p.15) */}
          <div className="rest-block">
            <h4>{t('restHp')}</h4>
            <div className="row wrap">
              <button className={`btn ${rolled === null ? 'btn-primary' : ''}`} disabled={rolled !== null}>{t('luFixed', { n: plan.hpFixed })}</button>
              <button className={`btn ${rolled !== null ? 'btn-primary' : ''}`} disabled={rolled !== null} onClick={() => setRolled(rollDie(plan.hitDie))}>
                🎲 {rolled === null ? t('luRoll', { n: plan.hitDie }) : t('luRolled', { n: plan.hitDie, roll: rolled })}
              </button>
            </div>
            <ul className="rest-list">
              <Row label={t('luHpGain')}>
                {/* Each piece isolated so the Hebrew ability name doesn't reorder the sum */}
                <span dir="ltr" className="lu-sum">
                  <bdi>{die}</bdi> <bdi>{plan.conMod >= 0 ? '+' : '−'} {Math.abs(plan.conMod)}</bdi> <bdi>{t('restConShort')}</bdi>
                  {plan.hpBonus > 0 && <bdi> + {plan.hpBonus}</bdi>} <bdi>=</bdi> <strong className="rest-up"><bdi>+{hp}</bdi></strong>
                </span>
              </Row>
              <Row label={t('luHpMax')}><Arrow from={ch.hpMax} to={ch.hpMax + hp + conHp} /></Row>
              <Row label={t('restHd')}><Arrow from={`${ch.level}d${plan.hitDie}`} to={`${plan.level}d${plan.hitDie}`} /></Row>
              {plan.prof && <Row label={t('luProf')}><Arrow from={signed(plan.prof.from)} to={signed(plan.prof.to)} /></Row>}
            </ul>
            {rolled === null && <p className="muted small">{t('luHpHint')}</p>}
          </div>

          {plan.asi && (
            <div className="rest-block">
              <h4>{t('featAsi')}</h4>
              <div className="mode-toggle">
                <button className={asiMode === 'scores' ? 'on' : ''} onClick={() => setAsiMode('scores')}>{t('luAsiScores')}</button>
                <button className={asiMode === 'feat' ? 'on' : ''} onClick={() => setAsiMode('feat')}>{t('luAsiFeat')}</button>
              </div>
              {asiMode === 'scores' ? (
                <>
                  <div className="row wrap">
                    {(['choice', 'choice2'] as const).map((k) => (
                      <label key={k} className="small">+1{' '}
                        <select value={asi[k]} onChange={(e) => setAsi({ ...asi, [k]: e.target.value as Ability })}>
                          {ABILITIES.map((a) => <option key={a} value={a} disabled={ch.abilities[a] >= 20}>{ABILITY_NAMES[a][lang]} ({ch.abilities[a]})</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <ul className="rest-list">
                    {ABILITIES.filter((a) => scoresAfter[a] !== ch.abilities[a]).map((a) => (
                      <Row key={a} label={ABILITY_NAMES[a][lang]}>
                        <Arrow from={`${ch.abilities[a]} (${signed(mod(ch.abilities[a]))})`} to={`${scoresAfter[a]} (${signed(mod(scoresAfter[a]))})`} />
                      </Row>
                    ))}
                    {conHp > 0 && <Row label={t('luConHp')}><strong className="rest-up" dir="ltr">+{conHp}</strong></Row>}
                  </ul>
                  <p className="muted small">{t('featAsiSame')}</p>
                </>
              ) : <p className="muted small">{t('luAsiFeatHint')}</p>}
            </div>
          )}

          {plan.expertise > 0 && (
            <div className="rest-block">
              <h4>{t('diceExpertise')} <span className="muted small" dir="ltr">{expertise.length}/{plan.expertise}</span></h4>
              <p className="muted small">{t('luExpertiseHint', { n: plan.expertise })}{ch.classId === 'rogue' ? ` ${t('luExpertiseTools')}` : ''}</p>
              <div className="chip-row">
                {expertiseOptions.map((s) => (
                  <button key={s.id} type="button" className={`chip ${expertise.includes(s.id) ? 'on' : ''}`} aria-pressed={expertise.includes(s.id)}
                    disabled={!expertise.includes(s.id) && expertise.length >= plan.expertise} onClick={() => toggleExpertise(s.id)}>{s[lang]}</button>
                ))}
              </div>
            </div>
          )}

          {hasSpellChanges && (
            <div className="rest-block">
              <h4>{t('luSpells')}</h4>
              <ul className="rest-list">
                {plan.slots.map((s) => <Row key={s.level} label={t('restSlots', { n: s.level })}><Arrow from={s.from} to={s.to} /></Row>)}
                {plan.pact && <Row label={t('luPact')}><Arrow from={`${plan.pact.from.count} × ${t('levelN', { n: plan.pact.from.level })}`} to={`${plan.pact.to.count} × ${t('levelN', { n: plan.pact.to.level })}`} /></Row>}
                {plan.cantrips && <Row label={t('cantrips')}><Arrow from={plan.cantrips.from} to={plan.cantrips.to} /></Row>}
                {plan.spells && <Row label={t(plan.spells.mode === 'spellbook' ? 'sbInBook' : 'spellsKnown')}><Arrow from={plan.spells.from} to={plan.spells.to} /></Row>}
                {plan.prepared && <Row label={t('spellsPrepared')}><Arrow from={plan.prepared.from} to={plan.prepared.to} /></Row>}
                {plan.alwaysPrepared.length > 0 && <Row label={`★ ${t('sbAlwaysTag')}`}><strong>{spellNames(plan.alwaysPrepared)}</strong></Row>}
              </ul>
              {plan.newSpellLevel && <p className="small">✨ {t('luNewSpellLevel', { n: plan.newSpellLevel })}</p>}
              {plan.cantrips && <p className="muted small">{t('luLearnCantrip')}</p>}
              {plan.spells?.mode === 'known' && <p className="muted small">{t('luLearnKnown')}</p>}
              {plan.spells?.mode === 'spellbook' && <p className="muted small">{t('luLearnBook')}</p>}
            </div>
          )}

          {(plan.columns.length > 0 || plan.resources.length > 0) && (
            <div className="rest-block">
              <h4>{t('luClassTable', { cls: g('classes', cls.id, cls.name) })}</h4>
              <ul className="rest-list">
                {plan.columns.map((c) => <Row key={c.name} label={c.name}><Arrow from={c.from} to={c.to} /></Row>)}
                {plan.resources.filter((r) => !plan.columns.some((c) => c.name.toLowerCase() === r.label.toLowerCase())).map((r) => (
                  <Row key={r.key} label={`⟳ ${(lang === 'he' && r.labelHe) || r.label}`}><Arrow from={r.from} to={r.to} /></Row>
                ))}
              </ul>
            </div>
          )}

          <div className="rest-block">
            <h4>{t('luFeatures')}</h4>
            {plan.features.length ? (
              <ul className="lu-features">
                {plan.features.map((f) => (
                  <li key={`${f.subclass}|${f.name}`}>
                    <strong>{featureName(f)}</strong>{f.subclass && <span className="pill">{subName(f.subclass)}</span>}
                    {featureSummary(f) && <p>{featureSummary(f)}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">{t('luNoFeatures')}</p>}
            {plan.features.length > 0 && <p className="muted small">{t('luFeaturesHint')}</p>}
          </div>

          <div className="row rest-actions">
            <span className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
            <button className="btn btn-primary" disabled={plan.needsSubclass} onClick={finish}>▲ {t('luFinish', { level: plan.level })}</button>
          </div>
        </section>
      </div>
    </div>
  )
}
