import { useState, useRef, useCallback, useEffect } from 'react'
import type { DashboardEntry } from '../types'
import { BaseNode } from './BaseNode'
import { ConstructDialog } from './ConstructDialog'
import { CreateBaseDialog } from './CreateBaseDialog'

interface Props {
  entries: DashboardEntry[]
  loading: boolean
  onRefresh: () => void
  onReposChange: () => void
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

interface Position {
  x: number
  y: number
}

// Isometric grid layout — diamond arrangement
const ISO_HALF_W = 180  // half tile width (horizontal offset per col/row step)
const ISO_HALF_H = 180  // half tile height (vertical offset per col/row step)
const COLS = 4
const ISO_MAP_CENTER_X = 600  // x anchor for the top of the diamond
const ISO_MAP_OFFSET_Y = 120  // y anchor for the top of the diamond
const MAP_PADDING = 100
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.15

function getDefaultPositions(entries: DashboardEntry[]): Record<number, Position> {
  const positions: Record<number, Position> = {}
  entries.forEach((entry, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    // Isometric projection: col pushes right+down, row pushes left+down
    positions[entry.repo.id] = {
      x: ISO_MAP_CENTER_X + (col - row) * ISO_HALF_W,
      y: ISO_MAP_OFFSET_Y + (col + row) * ISO_HALF_H,
    }
  })
  return positions
}

function loadPositions(): Record<number, Position> {
  try {
    const stored = localStorage.getItem('battlefield-positions')
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function savePositions(positions: Record<number, Position>) {
  localStorage.setItem('battlefield-positions', JSON.stringify(positions))
}

export function BattlefieldView({ entries, loading, onRefresh, onReposChange, onToast }: Props) {
  const [offset, setOffset] = useState<Position>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })
  const [positions, setPositions] = useState<Record<number, Position>>(() => {
    const stored = loadPositions()
    const defaults = getDefaultPositions(entries)
    return { ...defaults, ...stored }
  })
  const [relocatingId, setRelocatingId] = useState<number | null>(null)
  const [relocatingStart, setRelocatingStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null)
  const [constructTarget, setConstructTarget] = useState<DashboardEntry | null>(null)
  const [isRelocateMode, setIsRelocateMode] = useState(false)
  const [showCreateBase, setShowCreateBase] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const offsetRef = useRef(offset)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { offsetRef.current = offset }, [offset])

  // Update positions when entries change (new repos)
  useEffect(() => {
    setPositions(prev => {
      const defaults = getDefaultPositions(entries)
      const merged = { ...defaults, ...prev }
      const valid: Record<number, Position> = {}
      entries.forEach(e => { valid[e.repo.id] = merged[e.repo.id] ?? defaults[e.repo.id] })
      return valid
    })
  }, [entries])

  const handleMapMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.base-node')) return
    if (isRelocateMode) return
    setIsDraggingMap(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }, [offset, isRelocateMode])

  const handleMapMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingMap) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    } else if (relocatingId !== null && relocatingStart !== null) {
      const dx = (e.clientX - relocatingStart.mouseX) / zoomRef.current
      const dy = (e.clientY - relocatingStart.mouseY) / zoomRef.current
      setPositions(prev => ({
        ...prev,
        [relocatingId]: {
          x: relocatingStart.nodeX + dx,
          y: relocatingStart.nodeY + dy,
        },
      }))
    }
  }, [isDraggingMap, dragStart, relocatingId, relocatingStart])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -Math.sign(e.deltaY) * ZOOM_STEP
    setZoom(prevZoom => {
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom + delta))
      // Zoom toward cursor position
      const cursorX = e.clientX
      const cursorY = e.clientY
      setOffset(prevOffset => ({
        x: cursorX - (cursorX - prevOffset.x) * (newZoom / prevZoom),
        y: cursorY - (cursorY - prevOffset.y) * (newZoom / prevZoom),
      }))
      return newZoom
    })
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(ZOOM_MAX, prev + ZOOM_STEP)
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      setOffset(prevOffset => ({
        x: cx - (cx - prevOffset.x) * (newZoom / prev),
        y: cy - (cy - prevOffset.y) * (newZoom / prev),
      }))
      return newZoom
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(ZOOM_MIN, prev - ZOOM_STEP)
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      setOffset(prevOffset => ({
        x: cx - (cx - prevOffset.x) * (newZoom / prev),
        y: cy - (cy - prevOffset.y) * (newZoom / prev),
      }))
      return newZoom
    })
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const handleMapMouseUp = useCallback(() => {
    setIsDraggingMap(false)
    if (relocatingId !== null) {
      setPositions(prev => {
        savePositions(prev)
        return prev
      })
      setRelocatingId(null)
      setRelocatingStart(null)
    }
  }, [relocatingId])

  const handleStartRelocate = useCallback((id: number, mouseX: number, mouseY: number) => {
    const pos = positions[id]
    if (!pos) return
    setRelocatingId(id)
    setRelocatingStart({ mouseX, mouseY, nodeX: pos.x, nodeY: pos.y })
  }, [positions])

  const totalConflicts = entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)

  return (
    <div
      className="battlefield-container"
      onMouseDown={handleMapMouseDown}
      onMouseMove={handleMapMouseMove}
      onMouseUp={handleMapMouseUp}
      onMouseLeave={handleMapMouseUp}
      onWheel={handleWheel}
      ref={containerRef}
      style={{ cursor: isDraggingMap ? 'grabbing' : (isRelocateMode ? 'crosshair' : 'grab') }}
    >
      {/* Terrain layers */}
      <div className="battlefield-terrain" />
      <div className="battlefield-scanlines" />

      {/* HUD */}
      <div className="battlefield-hud">
        <div className="hud-brand">&#x25a0; C&amp;C GITAGENTS — TACTICAL COMMAND</div>
        <div className="hud-controls">
          <span className="hud-stat">BASES: <strong>{entries.length}</strong></span>
          {totalConflicts > 0 && (
            <span className="hud-stat hud-alert blink">&#x26a0; CONFLICTS: <strong>{totalConflicts}</strong></span>
          )}
          <button
            className="hud-btn"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? '◌ SCANNING...' : '&#x27F3; SCAN'}
          </button>
          <button
            className={`hud-btn${isRelocateMode ? ' active' : ''}`}
            onClick={() => { setIsRelocateMode(v => !v); setRelocatingId(null); setRelocatingStart(null) }}
          >
            {isRelocateMode ? '✕ CANCEL RELOCATE' : '&#x2295; RELOCATE BASE'}
          </button>
          <button
            className="hud-btn hud-btn-new-base"
            onClick={() => setShowCreateBase(true)}
          >
            &#x2b; NEW BASE
          </button>
          <span className="hud-zoom-sep" />
          <button className="hud-btn hud-zoom-btn" onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out">−</button>
          <span className="hud-zoom-level" title="Click to reset zoom" onClick={handleZoomReset}>{Math.round(zoom * 100)}%</span>
          <button className="hud-btn hud-zoom-btn" onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in">+</button>
        </div>
      </div>

      {/* Scrollable map layer */}
      <div
        className="battlefield-map"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        {entries.map((entry) => {
          const pos = positions[entry.repo.id] ?? { x: 0, y: 0 }
          return (
            <BaseNode
              key={entry.repo.id}
              entry={entry}
              position={pos}
              isRelocateMode={isRelocateMode}
              isBeingRelocated={relocatingId === entry.repo.id}
              onConstruct={() => setConstructTarget(entry)}
              onStartRelocate={(mouseX, mouseY) => handleStartRelocate(entry.repo.id, mouseX, mouseY)}
              onToast={onToast}
            />
          )
        })}
      </div>

      {/* Minimap */}
      {entries.length > 0 && (
        <Minimap entries={entries} positions={positions} offset={offset} zoom={zoom} onJump={setOffset} />
      )}

      {/* Empty state */}
      {entries.length === 0 && !loading && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title">&#x25a0; NO BASES DETECTED</div>
          <div className="battlefield-empty-sub">Add repositories in the Repositories panel to deploy bases.</div>
        </div>
      )}

      {entries.length === 0 && loading && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title spinning-radar">&#x25CF;</div>
          <div className="battlefield-empty-sub">SCANNING TERRITORY...</div>
        </div>
      )}

      {/* Relocate mode banner */}
      {isRelocateMode && (
        <div className="battlefield-relocate-banner">
          &#x2295; RELOCATE MODE — Drag a base to reposition it. Click again to cancel.
        </div>
      )}

      {/* Construction dialog */}
      {constructTarget && (
        <ConstructDialog
          entry={constructTarget}
          onClose={() => setConstructTarget(null)}
          onSuccess={(msg) => { onToast(msg, 'success'); setConstructTarget(null) }}
          onError={(msg) => onToast(msg, 'error')}
        />
      )}

      {/* Create new base dialog */}
      {showCreateBase && (
        <CreateBaseDialog
          onClose={() => setShowCreateBase(false)}
          onSuccess={(msg) => {
            onToast(msg, 'success')
            setShowCreateBase(false)
            onReposChange()
          }}
          onError={(msg) => onToast(msg, 'error')}
        />
      )}
    </div>
  )
}

interface MinimapProps {
  entries: DashboardEntry[]
  positions: Record<number, Position>
  offset: Position
  zoom: number
  onJump: (pos: Position) => void
}

function Minimap({ entries, positions, offset, zoom, onJump }: MinimapProps) {
  const MINIMAP_W = 160
  const MINIMAP_H = 100
  const SCALE = 0.12

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / SCALE
    const my = (e.clientY - rect.top) / SCALE
    onJump({ x: -mx * zoom + window.innerWidth / 2, y: -my * zoom + window.innerHeight / 2 })
  }

  return (
    <div
      className="minimap"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="minimap-label">MINIMAP</div>
      {entries.map((entry) => {
        const pos = positions[entry.repo.id]
        if (!pos) return null
        const mx = pos.x * SCALE
        const my = pos.y * SCALE
        const hasConflicts = entry.data.stats.conflicts > 0
        return (
          <div
            key={entry.repo.id}
            className={`minimap-base${hasConflicts ? ' alert' : ''}`}
            style={{
              left: mx,
              top: my + 12,
              background: entry.repo.color,
            }}
            title={entry.repo.name}
          />
        )
      })}
      {/* viewport indicator */}
      <div
        className="minimap-viewport"
        style={{
          left: -offset.x / zoom * SCALE,
          top: -offset.y / zoom * SCALE + 12,
          width: window.innerWidth / zoom * SCALE,
          height: window.innerHeight / zoom * SCALE,
        }}
      />
    </div>
  )
}
