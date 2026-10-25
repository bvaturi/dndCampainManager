import { rollExpr } from '../lib/dice'
import { useI18n } from '../lib/i18n'
import { useDice } from './Dice'
import { classById, type Spell } from '../lib/rules'

export function spellLevelLabel(t: ReturnType<typeof useI18n>['t'], level: number) {
  return level === 0 ? t('cantrip') : t('levelN', { n: level })
}

export function SpellCard({ spell, onClose }: { spell: Spell; onClose?(): void }) {
  const { t, g, lang } = useI18n()
  const homebrew = spell.source === 'HB'
  const { show } = useDice()
  const diceInText = [...new Set((spell.desc || '').match(/\b\d+d\d+\b/g) || [])].slice(0, 4)
  return (
    <article className="spell-card">
      <header>
        <div>
          <h3>{homebrew && <span title={t('hbHomebrew')}>🏠 </span>}{g('spells', spell.id, spell.name)}</h3>
          {lang === 'he' && !homebrew && <div className="muted small"><bdi>{spell.name}</bdi></div>}
          <div className="spell-sub">
            {spellLevelLabel(t, spell.level)} · {t(`school_${spell.school}` as 'school_evocation')}
            {spell.ritual && <> · {t('ritual')}</>}
          </div>
        </div>
        {onClose && <button className="btn btn-small btn-ghost" onClick={onClose} aria-label={t('close')}>✕</button>}
      </header>
      <dl className="spell-stats">
        <div><dt>{t('castingTime')}</dt><dd dir={homebrew ? 'auto' : 'ltr'}>{spell.castingTime}</dd></div>
        <div><dt>{t('range')}</dt><dd dir={homebrew ? 'auto' : 'ltr'}>{spell.range}</dd></div>
        <div><dt>{t('components')}</dt><dd dir={homebrew ? 'auto' : 'ltr'}>{spell.components}{spell.material ? ` (${spell.material})` : ''}</dd></div>
        <div><dt>{t('duration')}</dt><dd dir={homebrew ? 'auto' : 'ltr'}>{spell.concentration ? 'Concentration, ' : ''}{spell.duration || '—'}</dd></div>
      </dl>
      {spell.desc ? (
        <div className="spell-desc" dir={homebrew ? 'auto' : 'ltr'} lang={homebrew ? undefined : 'en'}>
          {lang === 'he' && !homebrew && <p className="muted small">{t('srdText')}</p>}
          {spell.desc.split('\n').map((p, i) => <p key={i}>{p}</p>)}
          {spell.higherLevel && <p><strong>{t('atHigherLevels')}.</strong> {spell.higherLevel}</p>}
        </div>
      ) : (
        <p className="muted">{t('noDescription')}</p>
      )}
      {diceInText.length > 0 && (
        <div className="spell-dice">
          {diceInText.map((expr) => (
            <button key={expr} className="btn btn-small" onClick={() => show(rollExpr(expr, { title: g('spells', spell.id, spell.name), subtitle: expr, kind: 'damage' }))}>
              🎲 {expr}
            </button>
          ))}
        </div>
      )}
      <footer className="spell-foot">
        <span className="small">{t('classes')}: {spell.classes.map((c) => g('classes', c, classById(c)?.name || c)).join(', ')}</span>
        <span className="small">
          {homebrew ? <>{t('source')}: 🏠 {t('hbHomebrew')}</> : <>
            {t('source')}: {spell.source} ·{' '}
            <a href={`https://www.aidedd.org/dnd/sorts.php?vo=${spell.id}`} target="_blank" rel="noreferrer">{t('readMore')} ↗</a>
          </>}
        </span>
      </footer>
    </article>
  )
}
