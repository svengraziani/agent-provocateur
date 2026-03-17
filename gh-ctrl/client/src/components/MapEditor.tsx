import { useState, useRef, useCallback, useEffect } from 'react'
import type { GameMap, MapTile } from '../types'
import { api } from '../api'

// ─── Tile type definitions ────────────────────────────────────────────────────

const TILE_TYPES: Record<string, { label: string; color: string }> = {
  ground:   { label: 'Ground',   color: '#4a6b2a' },
  grass:    { label: 'Grass',    color: '#5a9a2a' },
  water:    { label: 'Water',    color: '#1a4a7a' },
  sand:     { label: 'Sand',     color: '#9a8a4a' },
  rock:     { label: 'Rock',     color: '#5a5a6a' },
  forest:   { label: 'Forest',   color: '#1a5a1a' },
  mountain: { label: 'Mountain', color: '#7a7a8a' },
  lava:     { label: 'Lava',     color: '#9a2a0a' },
  snow:     { label: 'Snow',     color: '#aababa' },
  custom:   { label: 'Custom',   color: '#00ff88' },
}

type TileKey = keyof typeof TILE_TYPES
type Tool = 'paint' | 'erase' | 'fill'

// ─── Canvas constants ─────────────────────────────────────────────────────────

const TILE_W = 64
const TILE_H = 32
const TILE_DEPTH = 14

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  if (c.length !== 6) return [80, 80, 80]
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
}

function darkenColor(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - factor))},${Math.round(g * (1 - factor))},${Math.round(b * (1 - factor))})`
}

function lightenColor(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.round(r + (255 - r) * factor)},${Math.round(g + (255 - g) * factor)},${Math.round(b + (255 - b) * factor)})`
}

// ─── Coordinate conversion ────────────────────────────────────────────────────

function toScreenPos(col: number, row: number, offsetX: number, offsetY: number) {
  return {
    x: (col - row) * (TILE_W / 2) + offsetX,
    y: (col + row) * (TILE_H / 2) + offsetY,
  }
}

function toTileCoords(
  mouseX: number,
  mouseY: number,
  offsetX: number,
  offsetY: number,
  scale: number
): { col: number; row: number } {
  const wx = mouseX / scale - offsetX
  const wy = mouseY / scale - offsetY
  const col = Math.round((wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2)
  const row = Math.round((wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2)
  return { col, row }
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawIsoTile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  color: string,
  hovered: boolean
) {
  const w2 = TILE_W / 2
  const h2 = TILE_H / 2
  const topColor = hovered ? lightenColor(color, 0.25) : color

  // Top face
  ctx.beginPath()
  ctx.moveTo(sx,      sy)
  ctx.lineTo(sx + w2, sy + h2)
  ctx.lineTo(sx,      sy + TILE_H)
  ctx.lineTo(sx - w2, sy + h2)
  ctx.closePath()
  ctx.fillStyle = topColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 0.5
  ctx.stroke()

  // Left face
  ctx.beginPath()
  ctx.moveTo(sx - w2, sy + h2)
  ctx.lineTo(sx,      sy + TILE_H)
  ctx.lineTo(sx,      sy + TILE_H + TILE_DEPTH)
  ctx.lineTo(sx - w2, sy + h2 + TILE_DEPTH)
  ctx.closePath()
  ctx.fillStyle = darkenColor(color, 0.35)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.stroke()

  // Right face
  ctx.beginPath()
  ctx.moveTo(sx,      sy + TILE_H)
  ctx.lineTo(sx + w2, sy + h2)
  ctx.lineTo(sx + w2, sy + h2 + TILE_DEPTH)
  ctx.lineTo(sx,      sy + TILE_H + TILE_DEPTH)
  ctx.closePath()
  ctx.fillStyle = darkenColor(color, 0.55)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.stroke()
}

function drawEmptyTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, hovered: boolean) {
  const w2 = TILE_W / 2
  const h2 = TILE_H / 2
  ctx.beginPath()
  ctx.moveTo(sx,      sy)
  ctx.lineTo(sx + w2, sy + h2)
  ctx.lineTo(sx,      sy + TILE_H)
  ctx.lineTo(sx - w2, sy + h2)
  ctx.closePath()
  ctx.fillStyle = hovered ? 'rgba(57,255,20,0.12)' : 'rgba(0,0,0,0.18)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(57,255,20,0.2)'
  ctx.lineWidth = 0.5
  ctx.stroke()
}

// ─── Mini preview canvas ──────────────────────────────────────────────────────

function MapPreviewCanvas({ map, width = 120, height = 80 }: { map: GameMap; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0a1510'
    ctx.fillRect(0, 0, width, height)

    let tiles: Record<string, MapTile> = {}
    try { tiles = JSON.parse(map.tiles) } catch { /* empty */ }

    const scale = Math.min(width / (map.width * TILE_W * 0.8), height / (map.height * TILE_H * 1.4)) * 0.7
    const tw = TILE_W * scale
    const th = TILE_H * scale
    const depth = TILE_DEPTH * scale
    const offsetX = width / 2
    const offsetY = th * 1.5

    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const key = `${col},${row}`
        const tile = tiles[key]
        const sx = (col - row) * (tw / 2) + offsetX
        const sy = (col + row) * (th / 2) + offsetY

        if (!tile) {
          ctx.beginPath()
          ctx.moveTo(sx,        sy)
          ctx.lineTo(sx + tw/2, sy + th/2)
          ctx.lineTo(sx,        sy + th)
          ctx.lineTo(sx - tw/2, sy + th/2)
          ctx.closePath()
          ctx.fillStyle = 'rgba(0,0,0,0.2)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(57,255,20,0.1)'
          ctx.lineWidth = 0.3
          ctx.stroke()
          continue
        }

        const color = tile.color
        ctx.beginPath()
        ctx.moveTo(sx,        sy)
        ctx.lineTo(sx + tw/2, sy + th/2)
        ctx.lineTo(sx,        sy + th)
        ctx.lineTo(sx - tw/2, sy + th/2)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(sx - tw/2, sy + th/2)
        ctx.lineTo(sx,        sy + th)
        ctx.lineTo(sx,        sy + th + depth)
        ctx.lineTo(sx - tw/2, sy + th/2 + depth)
        ctx.closePath()
        ctx.fillStyle = darkenColor(color, 0.35)
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(sx,        sy + th)
        ctx.lineTo(sx + tw/2, sy + th/2)
        ctx.lineTo(sx + tw/2, sy + th/2 + depth)
        ctx.lineTo(sx,        sy + th + depth)
        ctx.closePath()
        ctx.fillStyle = darkenColor(color, 0.55)
        ctx.fill()
      }
    }
  }, [map, width, height])

  return <canvas ref={ref} width={width} height={height} style={{ display: 'block', borderRadius: 4 }} />
}

// ─── Flood fill ────────────────────────────────────────────────────────────────

function floodFill(
  tiles: Record<string, MapTile>,
  startCol: number,
  startRow: number,
  newTile: MapTile,
  mapWidth: number,
  mapHeight: number
): Record<string, MapTile> {
  const startKey = `${startCol},${startRow}`
  const startTile = tiles[startKey]
  const startType = startTile?.type ?? 'empty'
  const startColor = startTile?.color ?? ''

  if (startType === newTile.type && startColor === newTile.color) return tiles

  const result = { ...tiles }
  const queue: [number, number][] = [[startCol, startRow]]
  const visited = new Set<string>([startKey])

  while (queue.length > 0) {
    const [col, row] = queue.shift()!
    const key = `${col},${row}`
    if (newTile.type === 'empty') {
      delete result[key]
    } else {
      result[key] = newTile
    }

    const neighbors: [number, number][] = [
      [col + 1, row], [col - 1, row],
      [col, row + 1], [col, row - 1],
    ]
    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nc >= mapWidth || nr < 0 || nr >= mapHeight) continue
      const nk = `${nc},${nr}`
      if (visited.has(nk)) continue
      const nt = result[nk]
      const nType = nt?.type ?? 'empty'
      const nColor = nt?.color ?? ''
      if (nType === startType && nColor === startColor) {
        visited.add(nk)
        queue.push([nc, nr])
      }
    }
  }
  return result
}

// ─── New Map Dialog ───────────────────────────────────────────────────────────

interface NewMapDialogProps {
  onClose: () => void
  onCreate: (map: GameMap) => void
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

function NewMapDialog({ onClose, onCreate, onToast }: NewMapDialogProps) {
  const [name, setName] = useState('New Map')
  const [width, setWidth] = useState(20)
  const [height, setHeight] = useState(20)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) { onToast('Map name required', 'error'); return }
    setCreating(true)
    try {
      const map = await api.createMap({ name: name.trim(), width, height })
      onCreate(map)
    } catch (err: any) {
      onToast(`Failed to create map: ${err.message}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="map-dialog-overlay" onClick={onClose}>
      <div className="map-dialog" onClick={e => e.stopPropagation()}>
        <div className="map-dialog-title">&#x2b; NEW MAP</div>
        <div className="map-dialog-field">
          <label>Map Name</label>
          <input
            className="map-dialog-input"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div className="map-dialog-row">
          <div className="map-dialog-field">
            <label>Width (cols)</label>
            <input
              className="map-dialog-input"
              type="number"
              min={2} max={80}
              value={width}
              onChange={e => setWidth(Math.min(80, Math.max(2, Number(e.target.value))))}
            />
          </div>
          <div className="map-dialog-field">
            <label>Height (rows)</label>
            <input
              className="map-dialog-input"
              type="number"
              min={2} max={80}
              value={height}
              onChange={e => setHeight(Math.min(80, Math.max(2, Number(e.target.value))))}
            />
          </div>
        </div>
        <div className="map-dialog-size-hint">{width} × {height} = {width * height} tiles</div>
        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>CANCEL</button>
          <button className="hud-btn hud-btn-new-base" onClick={handleCreate} disabled={creating}>
            {creating ? 'CREATING...' : 'CREATE MAP'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Load Map Dialog ──────────────────────────────────────────────────────────

interface LoadMapDialogProps {
  maps: GameMap[]
  currentMapId: number | null
  onLoad: (map: GameMap) => void
  onDelete: (id: number) => void
  onClose: () => void
}

function LoadMapDialog({ maps, currentMapId, onLoad, onDelete, onClose }: LoadMapDialogProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      await api.deleteMap(id)
      onDelete(id)
    } catch {
      /* silently ignore */
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="map-dialog-overlay" onClick={onClose}>
      <div className="map-dialog map-dialog-load" onClick={e => e.stopPropagation()}>
        <div className="map-dialog-title">&#x25a0; LOAD MAP</div>
        {maps.length === 0 ? (
          <div className="map-dialog-empty">No saved maps. Create one first.</div>
        ) : (
          <div className="map-load-list">
            {maps.map(m => (
              <div
                key={m.id}
                className={`map-load-item${currentMapId === m.id ? ' active' : ''}`}
                onClick={() => { onLoad(m); onClose() }}
              >
                <div className="map-load-preview">
                  <MapPreviewCanvas map={m} width={120} height={72} />
                </div>
                <div className="map-load-info">
                  <div className="map-load-name">{m.name}</div>
                  <div className="map-load-meta">{m.width}×{m.height} tiles</div>
                  <div className="map-load-meta">
                    {m.updatedAt
                      ? `Saved ${new Date(typeof m.updatedAt === 'number' ? m.updatedAt * 1000 : m.updatedAt).toLocaleDateString()}`
                      : 'Not saved yet'}
                  </div>
                </div>
                <button
                  className="map-load-delete"
                  title="Delete map"
                  onClick={e => { e.stopPropagation(); handleDelete(m.id) }}
                  disabled={deletingId === m.id}
                >
                  {deletingId === m.id ? '...' : '✕'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main MapEditor component ─────────────────────────────────────────────────

interface Props {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_FACTOR = 1.15

export function MapEditor({ onToast }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Map state
  const [allMaps, setAllMaps] = useState<GameMap[]>([])
  const [currentMap, setCurrentMap] = useState<GameMap | null>(null)
  const [tiles, setTiles] = useState<Record<string, MapTile>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Editor state
  const [tool, setTool] = useState<Tool>('paint')
  const [selectedType, setSelectedType] = useState<TileKey>('ground')
  const [customColor, setCustomColor] = useState('#00ff88')
  const [hoveredTile, setHoveredTile] = useState<{ col: number; row: number } | null>(null)
  const [isPainting, setIsPainting] = useState(false)

  // View state
  const [offset, setOffset] = useState({ x: 300, y: 80 })
  const [zoom, setZoom] = useState(1)
  const [isPanningMap, setIsPanningMap] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Dialog state
  const [showNewMap, setShowNewMap] = useState(false)
  const [showLoadMap, setShowLoadMap] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  // Refs for rendering
  const tilesRef = useRef(tiles)
  const hoveredRef = useRef(hoveredTile)
  const zoomRef = useRef(zoom)
  const offsetRef = useRef(offset)
  const mapRef = useRef(currentMap)

  useEffect(() => { tilesRef.current = tiles }, [tiles])
  useEffect(() => { hoveredRef.current = hoveredTile }, [hoveredTile])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { offsetRef.current = offset }, [offset])
  useEffect(() => { mapRef.current = currentMap }, [currentMap])

  // Load all maps on mount
  useEffect(() => {
    api.listMaps().then(setAllMaps).catch(() => {})
  }, [])

  // ── Canvas rendering ────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const map = mapRef.current
    if (!map) {
      ctx.fillStyle = '#0a1510'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(57,255,20,0.3)'
      ctx.font = '14px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('NO MAP LOADED — CREATE OR LOAD A MAP', canvas.width / 2, canvas.height / 2)
      return
    }

    const sc = zoomRef.current
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    const currentTiles = tilesRef.current
    const hov = hoveredRef.current

    ctx.save()
    ctx.fillStyle = '#0a1510'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(sc, sc)
    ctx.translate(ox, oy)

    // Draw rows back-to-front for correct depth
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const key = `${col},${row}`
        const tile = currentTiles[key]
        const { x: sx, y: sy } = toScreenPos(col, row, 0, 0)
        const isHovered = hov?.col === col && hov?.row === row

        if (tile) {
          drawIsoTile(ctx, sx, sy, tile.color, isHovered)
        } else {
          drawEmptyTile(ctx, sx, sy, isHovered)
        }
      }
    }

    ctx.restore()
  }, [])

  // Trigger render on state changes
  useEffect(() => { render() }, [tiles, hoveredTile, zoom, offset, currentMap, render])

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      render()
    })
    observer.observe(container)
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    render()
    return () => observer.disconnect()
  }, [render])

  // ── Active tile color ───────────────────────────────────────────────────────

  const getActiveTileColor = useCallback(() => {
    if (selectedType === 'custom') return customColor
    return TILE_TYPES[selectedType]?.color ?? '#4a6b2a'
  }, [selectedType, customColor])

  // ── Paint/erase a tile ──────────────────────────────────────────────────────

  const applyTool = useCallback((col: number, row: number) => {
    const map = mapRef.current
    if (!map) return
    if (col < 0 || col >= map.width || row < 0 || row >= map.height) return

    const key = `${col},${row}`

    if (tool === 'erase') {
      setTiles(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setIsDirty(true)
    } else if (tool === 'paint') {
      const color = getActiveTileColor()
      setTiles(prev => ({ ...prev, [key]: { type: selectedType, color } }))
      setIsDirty(true)
    } else if (tool === 'fill') {
      const color = getActiveTileColor()
      setTiles(prev => {
        const result = floodFill(prev, col, row, { type: selectedType, color }, map.width, map.height)
        return result
      })
      setIsDirty(true)
    }
  }, [tool, selectedType, getActiveTileColor])

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      // Middle click or alt+click = pan
      setIsPanningMap(true)
      setPanStart({ x: e.clientX - offsetRef.current.x * zoomRef.current, y: e.clientY - offsetRef.current.y * zoomRef.current })
      return
    }
    if (!currentMap) return

    const { x, y } = getCanvasPos(e)
    const { col, row } = toTileCoords(x, y, offsetRef.current.x, offsetRef.current.y, zoomRef.current)
    setIsPainting(true)
    applyTool(col, row)
  }, [currentMap, applyTool])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningMap) {
      const sc = zoomRef.current
      setOffset({
        x: (e.clientX - panStart.x) / sc,
        y: (e.clientY - panStart.y) / sc,
      })
      return
    }
    const { x, y } = getCanvasPos(e)
    const { col, row } = toTileCoords(x, y, offsetRef.current.x, offsetRef.current.y, zoomRef.current)
    setHoveredTile({ col, row })

    if (isPainting && currentMap) {
      applyTool(col, row)
    }
  }, [isPainting, isPanningMap, panStart, currentMap, applyTool])

  const handleMouseUp = useCallback(() => {
    setIsPainting(false)
    setIsPanningMap(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsPainting(false)
    setIsPanningMap(false)
    setHoveredTile(null)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const clamped = Math.max(-100, Math.min(100, e.deltaY))
    const factor = Math.pow(ZOOM_FACTOR, -clamped / 100)
    setZoom(prev => {
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev * factor))
      const canvas = canvasRef.current
      if (!canvas) return newZoom
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      setOffset(prevOff => ({
        x: cx / newZoom - (cx / prev - prevOff.x),
        y: cy / newZoom - (cy / prev - prevOff.y),
      }))
      return newZoom
    })
  }, [])

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault()

  // ── Zoom controls ───────────────────────────────────────────────────────────

  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, z * ZOOM_FACTOR))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, z / ZOOM_FACTOR))
  const zoomReset = () => { setZoom(1); setOffset({ x: 300, y: 80 }) }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!currentMap || !isDirty) return
    setIsSaving(true)
    try {
      const updated = await api.saveMap(currentMap.id, { tiles: JSON.stringify(tilesRef.current) })
      setCurrentMap(updated)
      setAllMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
      setIsDirty(false)
      onToast('Map saved', 'success')
    } catch (err: any) {
      onToast(`Save failed: ${err.message}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Rename ───────────────────────────────────────────────────────────────────

  const handleRenameSubmit = async () => {
    if (!currentMap || !nameInput.trim()) { setEditingName(false); return }
    try {
      const updated = await api.saveMap(currentMap.id, { name: nameInput.trim() })
      setCurrentMap(updated)
      setAllMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
      onToast('Map renamed', 'success')
    } catch (err: any) {
      onToast(`Rename failed: ${err.message}`, 'error')
    } finally {
      setEditingName(false)
    }
  }

  // ── Load map ─────────────────────────────────────────────────────────────────

  const handleLoadMap = (map: GameMap) => {
    let t: Record<string, MapTile> = {}
    try { t = JSON.parse(map.tiles) } catch { /* empty */ }
    setCurrentMap(map)
    setTiles(t)
    setIsDirty(false)
    setOffset({ x: 300, y: 80 })
    setZoom(1)
  }

  // ── New map created ───────────────────────────────────────────────────────────

  const handleMapCreated = (map: GameMap) => {
    setAllMaps(prev => [...prev, map])
    handleLoadMap(map)
    setShowNewMap(false)
    onToast(`Map "${map.name}" created`, 'success')
  }

  // ── Map deleted ───────────────────────────────────────────────────────────────

  const handleMapDeleted = (id: number) => {
    setAllMaps(prev => prev.filter(m => m.id !== id))
    if (currentMap?.id === id) {
      setCurrentMap(null)
      setTiles({})
      setIsDirty(false)
    }
  }

  // ── Clear all tiles ───────────────────────────────────────────────────────────

  const handleClearMap = () => {
    if (!currentMap) return
    if (!confirm('Clear all tiles from this map?')) return
    setTiles({})
    setIsDirty(true)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const activeTileColor = getActiveTileColor()

  return (
    <div className="map-editor-layout">
      {/* ── Top toolbar ── */}
      <div className="map-editor-hud">
        <div className="hud-brand">&#x25a0; MAP EDITOR</div>

        {/* Map info + rename */}
        <div className="map-editor-hud-name">
          {currentMap ? (
            editingName ? (
              <input
                className="map-name-input"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setEditingName(false) }}
                autoFocus
              />
            ) : (
              <span
                className="map-editor-map-name"
                onClick={() => { setNameInput(currentMap.name); setEditingName(true) }}
                title="Click to rename"
              >
                {currentMap.name} {isDirty ? <span className="map-dirty-dot">●</span> : ''}
              </span>
            )
          ) : (
            <span className="map-editor-map-name muted">No map loaded</span>
          )}
          {currentMap && (
            <span className="map-editor-size-label">{currentMap.width}×{currentMap.height}</span>
          )}
        </div>

        <div className="hud-controls">
          {/* Tool selection */}
          <span className="hud-section-label">TOOL</span>
          {(['paint', 'erase', 'fill'] as Tool[]).map(t => (
            <button
              key={t}
              className={`hud-btn${tool === t ? ' active' : ''}`}
              onClick={() => setTool(t)}
            >
              {t === 'paint' ? '✏ PAINT' : t === 'erase' ? '⌫ ERASE' : '⬛ FILL'}
            </button>
          ))}

          <span className="hud-zoom-sep" />

          {/* Map management */}
          <button className="hud-btn hud-btn-new-base" onClick={() => setShowNewMap(true)}>&#x2b; NEW</button>
          <button className="hud-btn" onClick={() => setShowLoadMap(true)}>&#x25bc; LOAD</button>
          <button
            className="hud-btn"
            onClick={handleSave}
            disabled={!currentMap || !isDirty || isSaving}
          >
            {isSaving ? '◌ SAVING...' : '&#x25ce; SAVE'}
          </button>
          <button
            className="hud-btn"
            onClick={handleClearMap}
            disabled={!currentMap}
            title="Clear all tiles"
          >
            &#x2715; CLEAR
          </button>

          <span className="hud-zoom-sep" />

          {/* Zoom */}
          <button className="hud-btn hud-zoom-btn" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>−</button>
          <span className="hud-zoom-level" onClick={zoomReset} title="Reset zoom">{Math.round(zoom * 100)}%</span>
          <button className="hud-btn hud-zoom-btn" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>+</button>
        </div>
      </div>

      {/* ── Editor body ── */}
      <div className="map-editor-body">
        {/* Tile palette sidebar */}
        <div className="map-editor-palette">
          <div className="palette-section-title">TILES</div>
          {Object.entries(TILE_TYPES).map(([key, def]) => (
            <button
              key={key}
              className={`palette-tile${selectedType === key ? ' selected' : ''}`}
              onClick={() => setSelectedType(key as TileKey)}
              title={def.label}
            >
              <span
                className="palette-tile-swatch"
                style={{ background: key === 'custom' ? customColor : def.color }}
              />
              <span className="palette-tile-label">{def.label}</span>
            </button>
          ))}

          {/* Custom color picker */}
          {selectedType === 'custom' && (
            <div className="palette-custom-color">
              <label className="palette-section-title">COLOR</label>
              <input
                type="color"
                className="color-picker-input"
                value={customColor}
                onChange={e => setCustomColor(e.target.value)}
              />
              <span className="color-hex-label">{customColor.toUpperCase()}</span>
            </div>
          )}

          <div className="palette-divider" />
          <div className="palette-section-title">ACTIVE</div>
          {tool !== 'erase' ? (
            <div className="palette-active-preview">
              <span
                className="palette-tile-swatch palette-tile-swatch-lg"
                style={{ background: activeTileColor }}
              />
              <span className="palette-tile-label">{TILE_TYPES[selectedType]?.label}</span>
            </div>
          ) : (
            <div className="palette-active-preview">
              <span className="palette-tile-label muted">Erase mode</span>
            </div>
          )}

          <div className="palette-divider" />
          <div className="palette-section-title">HINT</div>
          <div className="palette-hint">Click / drag to {tool}</div>
          <div className="palette-hint">Alt+drag to pan</div>
          <div className="palette-hint">Scroll to zoom</div>
        </div>

        {/* Canvas area */}
        <div className="map-canvas-container" ref={containerRef}>
          <div className="battlefield-scanlines" />
          <canvas
            ref={canvasRef}
            className="map-editor-canvas"
            style={{ cursor: tool === 'fill' ? 'cell' : tool === 'erase' ? 'not-allowed' : 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>

      {/* Dialogs */}
      {showNewMap && (
        <NewMapDialog
          onClose={() => setShowNewMap(false)}
          onCreate={handleMapCreated}
          onToast={onToast}
        />
      )}
      {showLoadMap && (
        <LoadMapDialog
          maps={allMaps}
          currentMapId={currentMap?.id ?? null}
          onLoad={handleLoadMap}
          onDelete={handleMapDeleted}
          onClose={() => setShowLoadMap(false)}
        />
      )}
    </div>
  )
}
