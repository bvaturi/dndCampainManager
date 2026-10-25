import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'
import { d20Test, describeDice, rollDie, rollExpr, type RollMode, type RollResult } from '../lib/dice'
import { signed } from '../lib/rules'

interface DiceApi {
  mode: RollMode
  setMode(m: RollMode): void
  /** Mode for a click: Shift = advantage, Alt/Option = disadvantage, otherwise the tray setting. */
  modeFor(e?: { shiftKey?: boolean; altKey?: boolean }): RollMode
  show(r: RollResult | null): void
}

const Ctx = createContext<DiceApi | null>(null)
const LOG_KEY = 'codex-roll-log'

function loadLog(): RollResult[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}

export function DiceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RollMode>('normal')
  const [current, setCurrent] = useState<RollResult | null>(null)
  const [log, setLog] = useState<RollResult[]>(loadLog)
  const [trayOpen, setTrayOpen] = useState(false)

  const show = useCallback((r: RollResult | null) => {
    if (!r) return
    setCurrent(r)
    setLog((l) => {
      const next = [r, ...l].slice(0, 40)
      try { localStorage.setItem(LOG_KEY, JSON.stringify(next)) } catch { /* storage blocked */ }
      return next
    })
  }, [])

  const modeFor = useCallback((e?: { shiftKey?: boolean; altKey?: boolean }): RollMode =>
    e?.shiftKey ? 'advantage' : e?.altKey ? 'disadvantage' : mode, [mode])

  const api = useMemo(() => ({ mode, setMode, modeFor, show }), [mode, modeFor, show])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="no-print">
        {current && <RollCard key={current.id} r={current} onClose={() => setCurrent(null)} onRoll={show} />}
        <button className={`dice-fab ${trayOpen ? 'open' : ''}`} onClick={() => setTrayOpen(!trayOpen)} aria-label="Dice">
          <D20Icon />
        </button>
        {trayOpen && <DiceTray log={log} onRoll={show} onClear={() => { setLog([]); try { localStorage.removeItem(LOG_KEY) } catch { /* */ } }} onClose={() => setTrayOpen(false)} />}
      </div>
    </Ctx.Provider>
  )
}

export function useDice() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDice outside DiceProvider')
  return v
}

export function D20Icon({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <polygon points="32,3 58,18 58,46 32,61 6,46 6,18" fill="currentColor" />
      <polygon points="32,14 50,44 14,44" fill="none" stroke="var(--die-face, #f3e6c8)" strokeWidth="3" />
      <path d="M32 3 L32 14 M6 18 L14 44 M58 18 L50 44 M6 46 L14 44 M58 46 L50 44 M32 61 L32 44" stroke="var(--die-face, #f3e6c8)" strokeWidth="1.6" opacity="0.6" />
    </svg>
  )
}

// ------------------------------------------------------------------ result card

function RollCard({ r, onClose, onRoll }: { r: RollResult; onClose(): void; onRoll(r: RollResult | null): void }) {
  const { t } = useI18n()
  const [settled, setSettled] = useState(false)
  const [flicker, setFlicker] = useState(1)
  const sides = r.dice[0]?.sides ?? 20

  useEffect(() => {
    const iv = setInterval(() => setFlicker(rollDie(sides)), 60)
    const done = setTimeout(() => { clearInterval(iv); setSettled(true) }, 650)
    return () => { clearInterval(iv); clearTimeout(done) }
  }, [sides])

  const tone = r.natural === 'crit' ? 'crit' : r.natural === 'fumble' ? 'fumble' : ''
  return (
    <div className={`roll-card ${tone} ${settled ? 'settled' : 'rolling'}`} role="status" aria-live="polite">
      <header className="roll-head">
        <div>
          <div className="roll-title">{r.title}</div>
          {r.subtitle && <div className="roll-sub">{r.subtitle}</div>}
        </div>
        {r.mode !== 'normal' && <span className={`mode-badge ${r.mode}`}>{t(r.mode === 'advantage' ? 'diceAdvantage' : 'diceDisadvantage')}</span>}
        <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>
      </header>

      <div className="roll-body" dir="ltr">
        <div className={`roll-die ${settled ? '' : 'spin'}`}>
          <D20Icon size={64} />
          <span className="roll-die-num">{settled ? r.total : flicker}</span>
        </div>
        <div className="roll-math">
          {r.dice.map((g, gi) => (
            <span key={gi} className="chip-die">
              <span className="chip-label">{describeDice(g)}</span>
              {g.rolls.map((v, i) => (
                <span key={i} className={`die-face ${g.kept !== undefined && g.kept !== i ? 'dropped' : ''} ${g.sides === 20 && g.kept === i && v === 20 ? 'nat20' : ''} ${g.sides === 20 && g.kept === i && v === 1 ? 'nat1' : ''}`}>
                  {settled ? v : '?'}
                </span>
              ))}
            </span>
          ))}
          {r.parts.map((p, i) => (
            <span key={i} className="chip-part">
              <span className="op">{p.value < 0 ? '−' : '+'}</span>
              <span className="part-val">{Math.abs(p.value)}</span>
              <span className="part-label" dir="auto">{p.label}</span>
            </span>
          ))}
          <span className="chip-total"><span className="op">=</span><strong>{settled ? r.total : '…'}</strong></span>
        </div>
      </div>

      {settled && r.natural && (
        <div className={`roll-banner ${tone}`}>{t(r.natural === 'crit' ? 'diceCrit' : 'diceFumble')}</div>
      )}

      {settled && r.followUp && (
        <div className="roll-actions">
          <button className="btn btn-small" onClick={() => onRoll(rollExpr(r.followUp!.expr, { title: r.followUp!.title, subtitle: r.subtitle, kind: 'damage', parts: r.followUp!.parts, flatLabel: t('diceModifier') }))}>
            🎲 {t('diceRollDamage')}
          </button>
          {r.natural === 'crit' && (
            <button className="btn btn-small btn-primary" onClick={() => onRoll(rollExpr(r.followUp!.expr, { title: `${r.followUp!.title} · ${t('diceCrit')}`, subtitle: r.subtitle, kind: 'damage', crit: true, parts: r.followUp!.parts, flatLabel: t('diceModifier') }))}>
              💥 {t('diceCritDamage')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ tray + log

const SIDES = [4, 6, 8, 10, 12, 20, 100]

function DiceTray({ log, onRoll, onClear, onClose }: { log: RollResult[]; onRoll(r: RollResult | null): void; onClear(): void; onClose(): void }) {
  const { t, lang } = useI18n()
  const { mode, setMode } = useDice()
  const [pool, setPool] = useState<Record<number, number>>({})
  const [bonus, setBonus] = useState(0)
  const [expr, setExpr] = useState('')
  const [bad, setBad] = useState(false)

  const poolExpr = Object.entries(pool).filter(([, n]) => n > 0).map(([s, n]) => `${n}d${s}`).join('+')
  const fullExpr = poolExpr ? `${poolExpr}${bonus ? signed(bonus) : ''}` : ''

  const rollPool = () => {
    if (!fullExpr) return
    // A single d20 respects advantage/disadvantage.
    if (poolExpr === '1d20') {
      onRoll(d20Test({ title: 'd20', kind: 'custom', mode, parts: bonus ? [{ label: t('diceModifier'), value: bonus }] : [] }))
    } else {
      onRoll(rollExpr(fullExpr, { title: fullExpr, flatLabel: t('diceModifier') }))
    }
    setPool({})
    setBonus(0)
  }

  const rollTyped = () => {
    const r = rollExpr(expr, { title: expr.trim(), flatLabel: t('diceModifier') })
    setBad(!r)
    if (r) { onRoll(r); setExpr('') }
  }

  return (
    <aside className="dice-tray">
      <header className="tray-head">
        <strong>{t('diceTray')}</strong>
        <button className="roll-x" onClick={onClose} aria-label={t('close')}>✕</button>
      </header>

      <div className="mode-toggle" role="group">
        {(['disadvantage', 'normal', 'advantage'] as RollMode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {t(m === 'advantage' ? 'diceAdvantage' : m === 'disadvantage' ? 'diceDisadvantage' : 'diceNormal')}
          </button>
        ))}
      </div>
      <p className="tray-hint">{t('diceHint')}</p>

      <div className="die-buttons" dir="ltr">
        {SIDES.map((s) => (
          <button key={s} className="die-btn" onClick={() => setPool({ ...pool, [s]: (pool[s] || 0) + 1 })}>
            d{s}{pool[s] ? <span className="die-count">{pool[s]}</span> : null}
          </button>
        ))}
      </div>
      <div className="row tray-row" dir="ltr">
        <button className="btn btn-small" onClick={() => setBonus(bonus - 1)}>−</button>
        <span className="tray-bonus">{signed(bonus)}</span>
        <button className="btn btn-small" onClick={() => setBonus(bonus + 1)}>+</button>
        <code className="tray-expr grow">{fullExpr || '—'}</code>
        {fullExpr && <button className="btn btn-small btn-ghost" onClick={() => { setPool({}); setBonus(0) }}>{t('cancel')}</button>}
        <button className="btn btn-small btn-primary" disabled={!fullExpr} onClick={rollPool}>{t('diceRoll')}</button>
      </div>
      <form className="row tray-row" onSubmit={(e) => { e.preventDefault(); rollTyped() }}>
        <input dir="ltr" className={`grow ${bad ? 'bad-input' : ''}`} placeholder="2d6+3" value={expr} onChange={(e) => { setExpr(e.target.value); setBad(false) }} />
        <button className="btn btn-small" disabled={!expr.trim()}>{t('diceRoll')}</button>
      </form>

      <div className="tray-log-head">
        <strong>{t('diceLog')}</strong>
        {log.length > 0 && <button className="btn btn-small btn-ghost" onClick={onClear}>{t('diceClear')}</button>}
      </div>
      <ol className="tray-log">
        {log.length === 0 && <li className="muted small">{t('none')}</li>}
        {log.map((r) => (
          <li key={r.id} className={r.natural ?? ''}>
            <div className="log-top">
              <span className="log-title">{r.title}</span>
              <span className="log-total">{r.total}</span>
            </div>
            <div className="log-math" dir="ltr">
              {r.dice.map((g) => `${describeDice(g)} [${g.rolls.map((v, i) => (g.kept !== undefined && g.kept !== i ? `(${v})` : v)).join(', ')}]`).join(' + ')}
              {r.parts.map((p) => ` ${p.value < 0 ? '−' : '+'} ${Math.abs(p.value)} ${p.label}`).join('')}
            </div>
            <div className="log-time">
              {r.subtitle && <span>{r.subtitle} · </span>}
              {new Date(r.at).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}
