import { useMemo, useState } from 'react'
import { SpellCard, spellLevelLabel } from '../components/SpellCard'
import { useI18n } from '../lib/i18n'
import { CLASSES, SCHOOLS, SPELLS, type Spell } from '../lib/rules'

export default function SpellsPage() {
  const { t, g, lang } = useI18n()
  const [q, setQ] = useState('')
  const [cls, setCls] = useState('')
  const [level, setLevel] = useState('')
  const [school, setSchool] = useState('')
  const [source, setSource] = useState('')
  const [open, setOpen] = useState<Spell | null>(null)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return SPELLS.filter((s) =>
      (!cls || s.classes.includes(cls)) &&
      (level === '' || s.level === +level) &&
      (!school || s.school === school) &&
      (!source || s.source === source) &&
      (!needle || s.name.toLowerCase().includes(needle) || g('spells', s.id, '').includes(q.trim())))
  }, [q, cls, level, school, source, g])

  return (
    <div className="page">
      <h1 className="page-title">{t('spellbookTitle')}</h1>
      <div className="filters card">
        <input className="grow" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">{t('allClasses')}</option>
          {CLASSES.filter((c) => c.spellAbility).map((c) => <option key={c.id} value={c.id}>{g('classes', c.id, c.name)}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">{t('allLevels')}</option>
          {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{spellLevelLabel(t, i)}</option>)}
        </select>
        <select value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">{t('allSchools')}</option>
          {SCHOOLS.map((s) => <option key={s} value={s}>{t(`school_${s}` as 'school_evocation')}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{t('source')}: *</option>
          <option value="PHB">PHB</option>
          <option value="XGE">XGE</option>
          <option value="TCE">TCE</option>
        </select>
      </div>
      <p className="muted small">{t('results', { n: list.length })}</p>
      <div className="table-wrap">
        <table className="table spell-table">
          <thead>
            <tr><th>{t('name')}</th><th>{t('level')}</th><th>{t('castingTime')}</th><th>{t('range')}</th><th>{t('components')}</th><th>{t('source')}</th></tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                <td>
                  <strong>{g('spells', s.id, s.name)}</strong>
                  {lang === 'he' && <div className="muted small"><bdi>{s.name}</bdi></div>}
                  <div className="tags">
                    <span className={`school-dot school-${s.school}`} /> {t(`school_${s.school}` as 'school_evocation')}
                    {s.concentration && <span className="tag">C</span>}
                    {s.ritual && <span className="tag">R</span>}
                  </div>
                </td>
                <td>{s.level === 0 ? t('cantrip') : s.level}</td>
                <td dir="ltr">{s.castingTime}</td>
                <td dir="ltr">{s.range}</td>
                <td dir="ltr">{s.components}</td>
                <td>{s.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}><SpellCard spell={open} onClose={() => setOpen(null)} /></div>
        </div>
      )}
    </div>
  )
}
