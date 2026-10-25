import { useI18n } from '../lib/i18n'
import type { CustomTab } from '../lib/types'

/** A player-named free-text page, e.g. "Enchanted items" or "Quest notes". */
export default function CustomTabView({ tab, edit, onUpdate, onDelete, onMove, isFirst, isLast }: {
  tab: CustomTab
  edit: boolean
  onUpdate(patch: Partial<CustomTab>): void
  onDelete(): void
  onMove(dir: -1 | 1): void
  isFirst: boolean
  isLast: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="custom-tab card">
      <div className="custom-tab-head">
        {edit ? (
          <input className="custom-tab-title" dir="auto" value={tab.title} placeholder={t('tabTitlePlaceholder')}
            onChange={(e) => onUpdate({ title: e.target.value })} aria-label={t('tabTitlePlaceholder')} />
        ) : <h2 className="custom-tab-title" dir="auto">{tab.title}</h2>}
        {edit && (
          <div className="row">
            <button className="btn btn-small" disabled={isFirst} onClick={() => onMove(-1)} title={t('tabMoveLeft')}><span className="arrow">←</span></button>
            <button className="btn btn-small" disabled={isLast} onClick={() => onMove(1)} title={t('tabMoveRight')}><span className="arrow">→</span></button>
            <button className="btn btn-small btn-danger" onClick={() => { if (window.confirm(t('confirmDelete', { name: tab.title || t('tabNewTitle') }))) onDelete() }}>
              {t('tabDelete')}
            </button>
          </div>
        )}
      </div>
      <textarea
        className="custom-tab-body" dir="auto" readOnly={!edit} value={tab.content}
        placeholder={edit ? t('tabBodyPlaceholder') : ''}
        onChange={(e) => onUpdate({ content: e.target.value })}
      />
    </div>
  )
}
