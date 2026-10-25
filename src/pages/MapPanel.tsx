import { useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '../lib/auth'
import { FEET_PER_SQUARE, cellAt, cellCenter, cellSize, freeCells, isStretched, squareRows, tokenInitials } from '../lib/battleMap'
import { useI18n } from '../lib/i18n'
import { MapImageError, compressMapImage } from '../lib/mapImage'
import type { BattleMap, Character, Combatant, CombatState, MapPos, MapView } from '../lib/types'

/** Players get shades of blue/teal, enemies red. */
const PC_COLORS = ['#2f5d8a', '#3a6ea5', '#2b7a8c', '#4a5fa8', '#1f6f6b', '#5b6fb5', '#2c4f7c', '#3d8a9e']
const ENEMY_COLOR = '#a3291c'
const ZOOMS = [1, 1.5, 2, 3]
const hash = (s: string) => Array.from(s).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
const tokenColor = (c: Combatant) => (c.kind === 'enemy' ? ENEMY_COLOR : PC_COLORS[hash(c.id) % PC_COLORS.length])
const samePos = (a?: MapPos | null, b?: MapPos | null) => (!a && !b) || (!!a && !!b && a.mapId === b.mapId && a.x === b.x && a.y === b.y)
const int = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(+v || min)))

type GridFields = Pick<BattleMap, 'cols' | 'rows' | 'offsetX' | 'offsetY' | 'gridOpacity' | 'gridColor'>

/** The 🗺 Map tab of the combat page: the map on the table, its grid and tokens, and the DM's map library. */
export default function MapPanel({ cid, isDm, view, order, chars, state, onStep, onError }: {
  cid: string; isDm: boolean; view: MapView | null; order: Combatant[]; chars: Character[]
  state: CombatState | null | undefined; onStep(dir: 1 | -1): void; onError(e: unknown): void
}) {
  const { backend, user } = useUser()
  const { t } = useI18n()
  const [library, setLibrary] = useState<BattleMap[]>([])
  const [preview, setPreview] = useState<{ id: string; image: string } | null>(null)
  const [draft, setDraft] = useState<{ id: string; fields: Partial<GridFields> } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, MapPos | null>>({})
  const [zoom, setZoom] = useState(1)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => (isDm ? backend.watchMaps(cid, setLibrary, onError) : undefined), [backend, cid, isDm, onError])

  // Grid edits show at once and are saved shortly after the DM stops dragging a slider.
  useEffect(() => {
    if (!draft) return
    const h = setTimeout(() => { backend.updateMap(cid, draft.id, draft.fields).catch(onError) }, 350)
    return () => clearTimeout(h)
  }, [backend, cid, draft, onError])

  // Drop local token moves once the live data has caught up.
  useEffect(() => {
    setOptimistic((o) => {
      const done = Object.keys(o).filter((id) => samePos(order.find((c) => c.id === id)?.mapPos, o[id]))
      if (!done.length) return o
      const next = { ...o }
      done.forEach((id) => delete next[id])
      return next
    })
  }, [order])

  const activeId = view?.state?.mapId ?? null
  const playersMove = view?.state?.playersMove ?? true
  const previewing = isDm && preview && preview.id !== activeId ? preview : null
  const base = previewing ? library.find((m) => m.id === previewing.id) ?? null : view?.map ?? null
  const image = previewing ? previewing.image : view?.image ?? null
  const map: BattleMap | null = base && draft?.id === base.id ? { ...base, ...draft.fields } : base
  const onTable = !!map && map.id === activeId

  const posOf = (c: Combatant) => (c.id in optimistic ? optimistic[c.id] : c.mapPos) ?? null
  const onMap = map ? order.filter((c) => posOf(c)?.mapId === map.id) : []
  const offMap = map ? order.filter((c) => posOf(c)?.mapId !== map.id) : []
  const isDown = (c: Combatant) => {
    if (c.kind === 'enemy') return c.status === 'down'
    const ch = chars.find((x) => x.id === c.id)
    return !!ch && ch.hpCurrent <= 0
  }
  const canMove = (c: Combatant) => isDm || (onTable && playersMove && c.kind === 'pc' && c.ownerUid === user.uid)
  const selectedC = order.find((c) => c.id === selected)

  const setGrid = (patch: Partial<GridFields>) => {
    if (!map) return
    setDraft((d) => ({ id: map.id, fields: { ...(d?.id === map.id ? d.fields : {}), ...patch } }))
  }
  const setPos = (c: Combatant, pos: MapPos | null) => {
    setOptimistic((o) => ({ ...o, [c.id]: pos }))
    backend.updateCombatant(cid, c.id, { mapPos: pos }).catch((e) => {
      setOptimistic((o) => { const n = { ...o }; delete n[c.id]; return n })
      onError(e)
    })
  }
  const place = (c: Combatant, x: number, y: number) => { if (map && canMove(c)) setPos(c, { mapId: map.id, x, y }) }
  const tapCell = (x: number, y: number) => {
    if (selectedC && canMove(selectedC)) place(selectedC, x, y)
    setSelected(null)
  }
  const placeAll = () => {
    if (!map) return
    const taken = onMap.map(posOf).filter((p): p is MapPos => !!p)
    const pcs = offMap.filter((c) => c.kind === 'pc')
    const foes = offMap.filter((c) => c.kind === 'enemy')
    const left = freeCells(map, taken, pcs.length, 'start')
    pcs.forEach((c, i) => left[i] && place(c, left[i].x, left[i].y))
    const right = freeCells(map, [...taken, ...left.map((p) => ({ ...p, mapId: map.id }))], foes.length, 'end')
    foes.forEach((c, i) => right[i] && place(c, right[i].x, right[i].y))
  }

  const showMap = (id: string | null) => {
    setPreview(null)
    backend.saveMapState(cid, { mapId: id, playersMove }).catch(onError)
  }
  const previewMap = async (id: string) => {
    if (id === activeId) { setPreview(null); return }
    try {
      const img = await backend.getMapImage(cid, id)
      if (img) setPreview({ id, image: img })
    } catch (e) { onError(e) }
  }
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen?.().catch(() => { /* not allowed */ })
  }

  return (
    <div className="map-panel">
      {state?.active && order.length > 0 && (
        <div className="map-order card">
          {isDm && <button className="btn btn-small" onClick={() => onStep(-1)} title={t('cbPrev')}><span className="arrow">⏮</span></button>}
          <div className="map-order-chips">
            {order.map((c) => (
              <button key={c.id} className={`order-chip ${c.kind} ${c.id === state.turnId ? 'turn' : ''} ${isDown(c) ? 'down' : ''} ${c.id === selected ? 'on' : ''}`}
                onClick={() => setSelected(c.id === selected ? null : c.id)}>
                <span className="order-dot" style={{ background: tokenColor(c) }}>{tokenInitials(c.name)}</span>
                <bdi>{c.name}</bdi>
                {c.initiative !== null && <span className="muted small">{c.initiative}</span>}
              </button>
            ))}
          </div>
          {isDm && (
            <button className="btn btn-primary btn-small" onClick={() => onStep(1)}>
              {state.turnId === null ? t('cbBegin') : t('cbNext')} <span className="arrow">▶</span>
            </button>
          )}
        </div>
      )}

      {!map || !image ? (
        <div className="card combat-empty map-empty">
          {activeId && !isDm ? <div className="loading"><div className="d20-spin small" /> {t('loading')}</div>
            : isDm ? t('mapNoneDm') : <><span className="live-dot" /> {t('mapNone')}</>}
        </div>
      ) : (
        <>
          {previewing && <div className="map-preview-note">👁 {t('mapPreviewNote')}</div>}
          {isDm && <GridEditor map={map} onChange={setGrid} />}
          <div className="map-stage" ref={stageRef}>
            <div className="map-toolbar">
              <span className="small muted map-size">{t('mapSize', { cols: map.cols, rows: map.rows, w: map.cols * FEET_PER_SQUARE, h: map.rows * FEET_PER_SQUARE })}</span>
              <span className="grow" />
              {isDm && onTable && (
                <label className="check small">
                  <input type="checkbox" checked={playersMove} onChange={(e) => backend.saveMapState(cid, { mapId: activeId, playersMove: e.target.checked }).catch(onError)} />
                  {t('mapPlayersMove')}
                </label>
              )}
              {isDm && selectedC && posOf(selectedC)?.mapId === map.id && (
                <button className="btn btn-small btn-ghost" onClick={() => { setPos(selectedC, null); setSelected(null) }}>✕ {t('mapRemoveToken')}</button>
              )}
              {isDm && offMap.length > 0 && <button className="btn btn-small" onClick={placeAll}>⬚ {t('mapPlaceAll')}</button>}
              <div className="btn-group">
                <button className="btn btn-small" title={t('mapZoomOut')} disabled={zoom === ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}>−</button>
                <span className="small zoom-level" dir="ltr">{Math.round(zoom * 100)}%</span>
                <button className="btn btn-small" title={t('mapZoomIn')} disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}>+</button>
              </div>
              <button className="btn btn-small" title={t('mapFullscreen')} onClick={fullscreen}>⛶</button>
            </div>
            <MapBoard
              map={map} image={image} zoom={zoom} tokens={onMap.map((c) => ({ c, pos: posOf(c)! }))}
              turnId={state?.active ? state.turnId : null} selected={selected} userUid={user.uid}
              isDown={isDown} canMove={canMove}
              onSelect={(id) => setSelected(id === selected ? null : id)}
              onPlace={place} onCell={tapCell}
            />
          </div>
          {offMap.some(canMove) && (
            <div className="map-tray">
              <span className="small muted">{t('mapTray')}</span>
              {offMap.filter(canMove).map((c) => (
                <button key={c.id} className={`order-chip ${c.kind} ${c.id === selected ? 'on' : ''}`} onClick={() => setSelected(c.id === selected ? null : c.id)}>
                  <span className="order-dot" style={{ background: tokenColor(c) }}>{tokenInitials(c.name)}</span>
                  <bdi>{c.name}</bdi>
                </button>
              ))}
            </div>
          )}
          <p className="muted small">
            {order.length === 0 ? t('mapNoTokens') : isDm ? t('mapHint') : onTable && playersMove && order.some(canMove) ? t('mapHintPlayer') : ''}
          </p>
        </>
      )}

      {isDm && (
        <MapLibrary
          cid={cid} maps={library} activeId={activeId} previewId={previewing?.id ?? null}
          onShow={showMap} onPreview={previewMap} onError={onError}
          onUploaded={(id, img) => { if (!activeId && !preview) setPreview({ id, image: img }) }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ the board

function MapBoard({ map, image, zoom, tokens, turnId, selected, userUid, isDown, canMove, onSelect, onPlace, onCell }: {
  map: BattleMap; image: string; zoom: number; tokens: { c: Combatant; pos: MapPos }[]; turnId: string | null
  selected: string | null; userUid: string; isDown(c: Combatant): boolean; canMove(c: Combatant): boolean
  onSelect(id: string): void; onPlace(c: Combatant, x: number, y: number): void; onCell(x: number, y: number): void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ c: Combatant; px: number; py: number; sx: number; sy: number; moved: boolean } | null>(null)
  const tap = useRef<{ sx: number; sy: number } | null>(null)
  const { w, h } = cellSize(map)
  const r = Math.min(w, h) * 0.42

  const gridPath = useMemo(() => {
    const parts: string[] = []
    for (let i = 0; i <= map.cols; i++) {
      const x = (map.offsetX + i) * w
      if (x >= 0 && x <= map.width) parts.push(`M${x} 0V${map.height}`)
    }
    for (let j = 0; j <= map.rows; j++) {
      const y = (map.offsetY + j) * h
      if (y >= 0 && y <= map.height) parts.push(`M0 ${y}H${map.width}`)
    }
    return parts.join('')
  }, [map.cols, map.rows, map.offsetX, map.offsetY, map.width, map.height, w, h])

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }
  const tokenDown = (e: React.PointerEvent, c: Combatant) => {
    e.stopPropagation()
    tap.current = null
    if (!canMove(c)) { onSelect(c.id); return }
    svgRef.current!.setPointerCapture(e.pointerId)
    const p = toSvg(e)
    setDrag({ c, px: p.x, py: p.y, sx: e.clientX, sy: e.clientY, moved: false })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const p = toSvg(e)
    setDrag({ ...drag, px: p.x, py: p.y, moved: drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4 })
  }
  const up = (e: React.PointerEvent) => {
    const p = toSvg(e)
    if (drag) {
      if (drag.moved) {
        const cell = cellAt(map, p.x, p.y)
        onPlace(drag.c, cell.x, cell.y)
      } else onSelect(drag.c.id)
      setDrag(null)
    } else if (tap.current && Math.hypot(e.clientX - tap.current.sx, e.clientY - tap.current.sy) < 6) {
      const cell = cellAt(map, p.x, p.y)
      onCell(cell.x, cell.y)
    }
    tap.current = null
  }
  const target = drag?.moved ? cellAt(map, drag.px, drag.py) : null

  return (
    <div className="map-viewport" dir="ltr">
      <svg
        ref={svgRef} className={`map-svg ${zoom === 1 ? 'fit' : ''}`} viewBox={`0 0 ${map.width} ${map.height}`}
        style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
        onPointerDown={(e) => { tap.current = { sx: e.clientX, sy: e.clientY } }}
        onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDrag(null); tap.current = null }}
      >
        <image href={image} x={0} y={0} width={map.width} height={map.height} preserveAspectRatio="none" />
        {map.gridOpacity > 0 && (
          <path d={gridPath} fill="none" stroke={map.gridColor === 'light' ? '#fff' : '#1b120d'} strokeOpacity={map.gridOpacity}
            strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        {target && (
          <rect className="map-target" x={(map.offsetX + target.x) * w} y={(map.offsetY + target.y) * h} width={w} height={h} />
        )}
        {tokens.map(({ c, pos }) => {
          const dragging = drag?.c.id === c.id && drag.moved
          const { cx, cy } = dragging ? { cx: drag!.px, cy: drag!.py } : cellCenter(map, pos.x, pos.y)
          const isTurn = c.id === turnId
          const showName = isTurn || c.id === selected || dragging
          const cls = ['token', c.kind, isTurn && 'turn', isDown(c) && 'down', c.hidden && 'hidden-token',
            c.ownerUid === userUid && 'mine', c.id === selected && 'selected', canMove(c) && 'movable', dragging && 'dragging']
          return (
            <g key={c.id} className={cls.filter(Boolean).join(' ')} transform={`translate(${cx} ${cy})`} onPointerDown={(e) => tokenDown(e, c)}>
              <title>{c.name}</title>
              {isTurn && <circle className="token-ring" r={r * 1.18} />}
              <circle className="token-disc" r={r} fill={tokenColor(c)} />
              <text className="token-initials" fontSize={r * 0.75} dy="0.35em" textAnchor="middle">{tokenInitials(c.name)}</text>
              {showName && <text className="token-label" y={r + r * 0.75} fontSize={Math.max(r * 0.5, map.width / 90)} textAnchor="middle">{c.name}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ------------------------------------------------------------------ DM tools

function GridEditor({ map, onChange }: { map: BattleMap; onChange(p: Partial<GridFields>): void }) {
  const { t } = useI18n()
  return (
    <div className="card map-grid-editor">
      <strong className="map-grid-title">▦ {t('mapGrid')}</strong>
      <label>{t('mapCols')} <input type="number" min={1} max={200} value={map.cols} onChange={(e) => onChange({ cols: int(e.target.value, 1, 200) })} /></label>
      <label>{t('mapRows')} <input type="number" min={1} max={200} value={map.rows} onChange={(e) => onChange({ rows: int(e.target.value, 1, 200) })} /></label>
      <button className="btn btn-small" onClick={() => onChange({ rows: squareRows(map.width, map.height, map.cols) })}>⬜ {t('mapSquare')}</button>
      <label>{t('mapShiftX')} <input dir="ltr" type="range" min={0} max={0.95} step={0.05} value={map.offsetX} onChange={(e) => onChange({ offsetX: +e.target.value })} /></label>
      <label>{t('mapShiftY')} <input dir="ltr" type="range" min={0} max={0.95} step={0.05} value={map.offsetY} onChange={(e) => onChange({ offsetY: +e.target.value })} /></label>
      <label>{t('mapLines')} <input dir="ltr" type="range" min={0} max={1} step={0.05} value={map.gridOpacity} onChange={(e) => onChange({ gridOpacity: +e.target.value })} /></label>
      <select value={map.gridColor} onChange={(e) => onChange({ gridColor: e.target.value as BattleMap['gridColor'] })}>
        <option value="dark">{t('mapDark')}</option>
        <option value="light">{t('mapLight')}</option>
      </select>
      {isStretched(map) && <span className="pill pill-warn">{t('mapStretched')}</span>}
    </div>
  )
}

function MapLibrary({ cid, maps, activeId, previewId, onShow, onPreview, onUploaded, onError }: {
  cid: string; maps: BattleMap[]; activeId: string | null; previewId: string | null
  onShow(id: string | null): void; onPreview(id: string): void; onUploaded(id: string, image: string): void; onError(e: unknown): void
}) {
  const { backend } = useUser()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<MapImageError['code'] | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const upload = async (files: File[]) => {
    setBusy(true)
    setProblem(null)
    try {
      for (const f of files) {
        const img = await compressMapImage(f)
        const cols = 20
        const id = await backend.createMap(cid, {
          name: f.name.replace(/\.[^.]+$/, '').trim() || t('mapUntitled'), thumb: img.thumb, width: img.width, height: img.height,
          cols, rows: squareRows(img.width, img.height, cols), offsetX: 0, offsetY: 0, gridOpacity: 0.5, gridColor: 'dark',
        }, img.image)
        onUploaded(id, img.image)
      }
    } catch (e) {
      if (e instanceof MapImageError) setProblem(e.code)
      else onError(e)
    } finally {
      setBusy(false)
    }
  }
  const rename = () => {
    if (renaming?.name.trim()) backend.updateMap(cid, renaming.id, { name: renaming.name.trim() }).catch(onError)
    setRenaming(null)
  }

  return (
    <section className="card map-library">
      <div className="row wrap">
        <h2>🗺 {t('mapLibrary')}</h2>
        <span className="grow" />
        {activeId && <button className="btn btn-small btn-ghost" onClick={() => onShow(null)}>{t('mapStopShowing')}</button>}
        <label className={`btn btn-primary ${busy ? 'disabled' : ''}`}>
          {busy ? <><div className="d20-spin small" /> {t('mapProcessing')}</> : <>＋ {t('mapUpload')}</>}
          <input type="file" accept="image/*" multiple hidden disabled={busy}
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) upload(files) }} />
        </label>
      </div>
      <p className="muted small">{t('mapUploadHint')}</p>
      {problem && <p className="error-box">{t(problem)}</p>}
      {maps.length === 0 ? <p className="empty">{t('mapEmptyLibrary')}</p> : (
        <div className="map-cards">
          {maps.map((m) => (
            <div key={m.id} className={`map-card ${m.id === activeId ? 'active' : ''} ${m.id === previewId ? 'previewing' : ''}`}>
              <button className="map-thumb" onClick={() => onPreview(m.id)} title={t('mapPreview')}>
                <img src={m.thumb} alt="" />
                {m.id === activeId && <span className="pill pill-active">{t('mapOnTable')}</span>}
                {m.id === previewId && <span className="pill">👁 {t('mapPreview')}</span>}
              </button>
              {renaming?.id === m.id ? (
                <form onSubmit={(e) => { e.preventDefault(); rename() }}>
                  <input dir="auto" autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onBlur={rename} />
                </form>
              ) : <strong className="map-card-name"><bdi>{m.name}</bdi></strong>}
              <span className="small muted">{t('mapSizeShort', { cols: m.cols, rows: m.rows, w: m.cols * FEET_PER_SQUARE, h: m.rows * FEET_PER_SQUARE })}</span>
              <div className="row wrap">
                {m.id !== activeId && <button className="btn btn-small btn-primary" onClick={() => onShow(m.id)}>{t('mapShow')}</button>}
                <button className="btn btn-small btn-ghost" onClick={() => setRenaming({ id: m.id, name: m.name })} title={t('mapRename')}>✎</button>
                <button className="btn btn-small btn-ghost" title={t('delete')}
                  onClick={() => { if (window.confirm(t('confirmDelete', { name: m.name }))) backend.deleteMap(cid, m.id).catch(onError) }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
