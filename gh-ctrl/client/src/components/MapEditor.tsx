import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Pencil, Eraser, PaintBucket, Plus, FolderOpen, Save, Trash2, ZoomIn, ZoomOut, Stamp } from 'lucide-react'
import type { GameMap, MapTile } from '../types'
import { api } from '../api'
import { useAppStore } from '../store'

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

// Precomputed face color cache — avoids recalculating darkenColor per tile per frame.
// Since tile colors are finite, results are memoized indefinitely.
const tileColorCache = new Map<string, { left: string; right: string }>()

function getTileSideColors(color: string): { left: string; right: string } {
  if (tileColorCache.has(color)) return tileColorCache.get(color)!
  const result = { left: darkenColor(color, 0.35), right: darkenColor(color, 0.55) }
  tileColorCache.set(color, result)
  return result
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

function findNearestTileType(r: number, g: number, b: number, customColor: string): { type: string; color: string } {
  let bestType = 'ground'
  let bestColor = TILE_TYPES['ground'].color
  let bestDist = Infinity

  for (const [key, def] of Object.entries(TILE_TYPES)) {
    const color = key === 'custom' ? customColor : def.color
    const [cr, cg, cb] = hexToRgb(color)
    const dist = colorDistance(r, g, b, cr, cg, cb)
    if (dist < bestDist) {
      bestDist = dist
      bestType = key
      bestColor = color
    }
  }
  return { type: bestType, color: bestColor }
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

  const { left: leftColor, right: rightColor } = getTileSideColors(color)

  // Left face
  ctx.beginPath()
  ctx.moveTo(sx - w2, sy + h2)
  ctx.lineTo(sx,      sy + TILE_H)
  ctx.lineTo(sx,      sy + TILE_H + TILE_DEPTH)
  ctx.lineTo(sx - w2, sy + h2 + TILE_DEPTH)
  ctx.closePath()
  ctx.fillStyle = leftColor
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
  ctx.fillStyle = rightColor
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

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

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
        const { left: previewLeft, right: previewRight } = getTileSideColors(color)
        ctx.fillStyle = previewLeft
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(sx,        sy + th)
        ctx.lineTo(sx + tw/2, sy + th/2)
        ctx.lineTo(sx + tw/2, sy + th/2 + depth)
        ctx.lineTo(sx,        sy + th + depth)
        ctx.closePath()
        ctx.fillStyle = previewRight
        ctx.fill()
      }
    }
  }, [map.tiles, map.width, map.height, width, height])

  return <canvas ref={ref} style={{ display: 'block', borderRadius: 4 }} />
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

  let head = 0
  while (head < queue.length) {
    const [col, row] = queue[head++]
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

// ─── Rename Map Dialog ────────────────────────────────────────────────────────

interface RenameMapDialogProps {
  currentName: string
  onClose: () => void
  onRename: (name: string) => Promise<void>
}

function RenameMapDialog({ currentName, onClose, onRename }: RenameMapDialogProps) {
  const [name, setName] = useState(currentName)
  const [renaming, setRenaming] = useState(false)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === currentName) { onClose(); return }
    setRenaming(true)
    try {
      await onRename(trimmed)
      onClose()
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className="map-dialog-overlay" onClick={onClose}>
      <div className="map-dialog" onClick={e => e.stopPropagation()}>
        <div className="map-dialog-title">&#x270e; RENAME MAP</div>
        <div className="map-dialog-field">
          <label>New Name</label>
          <input
            className="map-dialog-input"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
          />
        </div>
        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>CANCEL</button>
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleSubmit}
            disabled={renaming || !name.trim() || name.trim() === currentName}
          >
            {renaming ? 'RENAMING...' : 'RENAME'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Map Dialog ───────────────────────────────────────────────────────────

interface NewMapDialogProps {
  onClose: () => void
  onCreate: (map: GameMap) => void
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

function NewMapDialog({ onClose, onCreate, onToast }: NewMapDialogProps) {
  const [name, setName] = useState('New Map')
  const [widthRaw, setWidthRaw] = useState('20')
  const [heightRaw, setHeightRaw] = useState('20')
  const [creating, setCreating] = useState(false)

  const clamp = (v: number) => Math.min(256, Math.max(2, v))
  const width = clamp(Number(widthRaw) || 2)
  const height = clamp(Number(heightRaw) || 2)

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
              min={2} max={256}
              value={widthRaw}
              onChange={e => setWidthRaw(e.target.value)}
              onBlur={() => setWidthRaw(String(clamp(Number(widthRaw) || 2)))}
            />
          </div>
          <div className="map-dialog-field">
            <label>Height (rows)</label>
            <input
              className="map-dialog-input"
              type="number"
              min={2} max={256}
              value={heightRaw}
              onChange={e => setHeightRaw(e.target.value)}
              onBlur={() => setHeightRaw(String(clamp(Number(heightRaw) || 2)))}
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

// ─── Stamp Image Dialog ───────────────────────────────────────────────────────

interface StampImageDialogProps {
  mapWidth: number
  mapHeight: number
  customColor: string
  onClose: () => void
  onStamp: (stampedTiles: Record<string, MapTile>, offsetCol: number, offsetRow: number) => void
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

function StampImageDialog({ mapWidth, mapHeight, customColor, onClose, onStamp, onToast }: StampImageDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [stampWidth, setStampWidth] = useState(mapWidth)
  const [stampHeight, setStampHeight] = useState(mapHeight)
  const [offsetCol, setOffsetCol] = useState(0)
  const [offsetRow, setOffsetRow] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onToast('Please select an image file', 'error')
      return
    }
    const url = URL.createObjectURL(file)
    setImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleStamp = () => {
    if (!imageUrl || !imgRef.current) return
    const img = imgRef.current
    if (!img.complete || img.naturalWidth === 0) {
      onToast('Image not loaded yet', 'error')
      return
    }
    setIsProcessing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = stampWidth
      canvas.height = stampHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, stampWidth, stampHeight)
      const imageData = ctx.getImageData(0, 0, stampWidth, stampHeight)
      const data = imageData.data

      const stampedTiles: Record<string, MapTile> = {}
      // Process image in chunks of rows to avoid blocking the UI thread on large stamps
      const CHUNK_ROWS = 10
      let currentRow = 0

      const processChunk = () => {
        try {
          const endRow = Math.min(currentRow + CHUNK_ROWS, stampHeight)
          for (let row = currentRow; row < endRow; row++) {
            for (let col = 0; col < stampWidth; col++) {
              const idx = (row * stampWidth + col) * 4
              const a = data[idx + 3]
              if (a < 128) continue // skip transparent pixels
              const r = data[idx]
              const g = data[idx + 1]
              const b = data[idx + 2]
              const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
              stampedTiles[`${col},${row}`] = { type: 'custom', color }
            }
          }
          currentRow = endRow
          if (currentRow < stampHeight) {
            setTimeout(processChunk, 0)
          } else {
            onStamp(stampedTiles, offsetCol, offsetRow)
            onClose()
          }
        } catch (err: any) {
          onToast(`Stamp failed: ${err.message}`, 'error')
          setIsProcessing(false)
        }
      }

      processChunk()
    } catch (err: any) {
      onToast(`Stamp failed: ${err.message}`, 'error')
      setIsProcessing(false)
    }
  }

  return (
    <div className="map-dialog-overlay" onClick={onClose}>
      <div className="map-dialog map-dialog-stamp" onClick={e => e.stopPropagation()}>
        <div className="map-dialog-title">&#x25a3; STAMP IMAGE TO MAP</div>

        {/* Drop zone / image preview */}
        <div
          className={`stamp-drop-zone${isDragging ? ' drag-over' : ''}${imageUrl ? ' has-image' : ''}`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {imageUrl ? (
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Stamp preview"
              className="stamp-preview-img"
            />
          ) : (
            <div className="stamp-drop-hint">
              <span className="stamp-drop-icon">🖼</span>
              <span>Drop image here or click to browse</span>
              <span className="stamp-drop-sub">PNG · JPG · SVG · WebP · transparent supported</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>

        {imageUrl && (
          <button className="hud-btn stamp-change-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
            &#x21ba; CHANGE IMAGE
          </button>
        )}

        {/* Stamp dimensions */}
        <div className="palette-section-title">STAMP SIZE (tiles)</div>
        <div className="map-dialog-row">
          <div className="map-dialog-field">
            <label>Width</label>
            <input
              className="map-dialog-input"
              type="number"
              min={1} max={mapWidth}
              value={stampWidth}
              onChange={e => setStampWidth(Math.min(mapWidth, Math.max(1, Number(e.target.value))))}
            />
          </div>
          <div className="map-dialog-field">
            <label>Height</label>
            <input
              className="map-dialog-input"
              type="number"
              min={1} max={mapHeight}
              value={stampHeight}
              onChange={e => setStampHeight(Math.min(mapHeight, Math.max(1, Number(e.target.value))))}
            />
          </div>
        </div>

        {/* Position offset */}
        <div className="palette-section-title">POSITION OFFSET</div>
        <div className="map-dialog-row">
          <div className="map-dialog-field">
            <label>Col</label>
            <input
              className="map-dialog-input"
              type="number"
              min={0} max={mapWidth - 1}
              value={offsetCol}
              onChange={e => setOffsetCol(Math.min(mapWidth - 1, Math.max(0, Number(e.target.value))))}
            />
          </div>
          <div className="map-dialog-field">
            <label>Row</label>
            <input
              className="map-dialog-input"
              type="number"
              min={0} max={mapHeight - 1}
              value={offsetRow}
              onChange={e => setOffsetRow(Math.min(mapHeight - 1, Math.max(0, Number(e.target.value))))}
            />
          </div>
        </div>

        <div className="map-dialog-size-hint">
          Stamps {stampWidth}×{stampHeight} tiles starting at col {offsetCol}, row {offsetRow} · each pixel → nearest tile color
        </div>

        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>CANCEL</button>
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleStamp}
            disabled={!imageUrl || isProcessing}
          >
            {isProcessing ? 'STAMPING...' : '▣ STAMP'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main MapEditor component ─────────────────────────────────────────────────

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_FACTOR = 1.15

export function MapEditor() {
  const onToast = useAppStore((s) => s.addToast)
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
  const [brushSize, setBrushSize] = useState(1)
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
  const [showRenameMap, setShowRenameMap] = useState(false)
  const [showStampImage, setShowStampImage] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  // Refs for rendering — assigned directly during render for immediate sync (no useEffect overhead)
  const tilesRef = useRef(tiles)
  const hoveredRef = useRef(hoveredTile)
  const zoomRef = useRef(zoom)
  const offsetRef = useRef(offset)
  const mapRef = useRef(currentMap)
  const brushSizeRef = useRef(brushSize)
  const activeTileColorRef = useRef('')
  const hasPendingPaintRef = useRef(false)
  const isPaintingRef = useRef(false)

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
    const dpr = window.devicePixelRatio || 1
    const logW = canvas.width / dpr
    const logH = canvas.height / dpr
    const map = mapRef.current
    if (!map) {
      ctx.fillStyle = '#0a1510'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.fillStyle = 'rgba(57,255,20,0.3)'
      ctx.font = '14px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('NO MAP LOADED — CREATE OR LOAD A MAP', logW / 2, logH / 2)
      ctx.restore()
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
    ctx.scale(dpr * sc, dpr * sc)
    ctx.translate(ox, oy)

    // Draw rows back-to-front for correct depth
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const key = `${col},${row}`
        const tile = currentTiles[key]
        const { x: sx, y: sy } = toScreenPos(col, row, 0, 0)
        const bs = brushSizeRef.current
        const isHovered = hov !== null &&
          Math.abs(col - hov.col) < bs && Math.abs(row - hov.row) < bs

        if (tile) {
          drawIsoTile(ctx, sx, sy, tile.color, isHovered)
        } else {
          drawEmptyTile(ctx, sx, sy, isHovered)
        }
      }
    }

    ctx.restore()
  }, [])

  // rAF-batched render scheduler — coalesces multiple state changes into a single canvas redraw per frame
  const rafRef = useRef<number | null>(null)
  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      render()
    })
  }, [render])

  // Trigger render on state changes (batched via rAF)
  useEffect(() => { scheduleRender() }, [tiles, hoveredTile, zoom, offset, currentMap, scheduleRender])

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = container.clientWidth * dpr
      canvas.height = container.clientHeight * dpr
      canvas.style.width = `${container.clientWidth}px`
      canvas.style.height = `${container.clientHeight}px`
      render()
    }

    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    resizeCanvas()
    return () => observer.disconnect()
  }, [render])

  // ── Active tile color ───────────────────────────────────────────────────────

  const activeTileColor = useMemo(() => {
    if (selectedType === 'custom') return customColor
    return TILE_TYPES[selectedType]?.color ?? '#4a6b2a'
  }, [selectedType, customColor])

  // ── Paint/erase a tile ──────────────────────────────────────────────────────

  const applyTool = useCallback((col: number, row: number) => {
    const map = mapRef.current
    if (!map) return

    if (tool === 'fill') {
      if (col < 0 || col >= map.width || row < 0 || row >= map.height) return
      const color = activeTileColorRef.current
      setTiles(prev => {
        const result = floodFill(prev, col, row, { type: selectedType, color }, map.width, map.height)
        return result
      })
      setIsDirty(true)
      return
    }

    // paint / erase: mutate tilesRef directly and schedule a canvas redraw.
    // React state is flushed once on mouseUp to avoid O(n) re-renders during drag.
    const radius = brushSizeRef.current - 1
    const color = activeTileColorRef.current
    const next = { ...tilesRef.current }
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const c = col + dc
        const r = row + dr
        if (c < 0 || c >= map.width || r < 0 || r >= map.height) continue
        const key = `${c},${r}`
        if (tool === 'erase') {
          delete next[key]
        } else {
          next[key] = { type: selectedType, color }
        }
      }
    }
    tilesRef.current = next
    hasPendingPaintRef.current = true
    scheduleRender()
    setIsDirty(true)
  }, [tool, selectedType, scheduleRender])

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
    isPaintingRef.current = true
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

    if (isPaintingRef.current && mapRef.current) {
      applyTool(col, row)
    }
  }, [isPanningMap, panStart, applyTool])

  // Flush accumulated paint changes to React state (called on mouseUp / mouseLeave)
  const flushPendingPaint = useCallback(() => {
    if (hasPendingPaintRef.current) {
      setTiles({ ...tilesRef.current })
      hasPendingPaintRef.current = false
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    flushPendingPaint()
    isPaintingRef.current = false
    setIsPainting(false)
    setIsPanningMap(false)
  }, [flushPendingPaint])

  const handleMouseLeave = useCallback(() => {
    flushPendingPaint()
    isPaintingRef.current = false
    setIsPainting(false)
    setIsPanningMap(false)
    setHoveredTile(null)
  }, [flushPendingPaint])

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

  const handleRenameDialog = async (newName: string) => {
    if (!currentMap) return
    const updated = await api.saveMap(currentMap.id, { name: newName })
    setCurrentMap(updated)
    setAllMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
    onToast('Map renamed', 'success')
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

  // ── Stamp image to map ────────────────────────────────────────────────────────

  const handleStampImage = useCallback((stampedTiles: Record<string, MapTile>, offsetCol: number, offsetRow: number) => {
    const map = mapRef.current
    if (!map) return
    setTiles(prev => {
      const next = { ...prev }
      for (const [key, tile] of Object.entries(stampedTiles)) {
        const [c, r] = key.split(',').map(Number)
        const fc = c + offsetCol
        const fr = r + offsetRow
        if (fc < 0 || fc >= map.width || fr < 0 || fr >= map.height) continue
        next[`${fc},${fr}`] = tile
      }
      return next
    })
    setIsDirty(true)
    onToast('Image stamped to map', 'success')
  }, [onToast])

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Sync refs during render so rAF callbacks and event handlers always see current values
  // Skip tilesRef sync when a paint is in progress — applyTool mutates tilesRef directly
  // and a re-render (triggered by setIsDirty) would otherwise reset it to the stale tiles state.
  if (!hasPendingPaintRef.current) tilesRef.current = tiles
  hoveredRef.current = hoveredTile
  zoomRef.current = zoom
  offsetRef.current = offset
  mapRef.current = currentMap
  brushSizeRef.current = brushSize
  activeTileColorRef.current = activeTileColor

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
              {t === 'paint' ? <><Pencil size={12} /> PAINT</> : t === 'erase' ? <><Eraser size={12} /> ERASE</> : <><PaintBucket size={12} /> FILL</>}
            </button>
          ))}

          <span className="hud-zoom-sep" />

          {/* Map management */}
          <button className="hud-btn hud-btn-new-base" onClick={() => setShowNewMap(true)}><Plus size={12} /> NEW</button>
          <button className="hud-btn" onClick={() => setShowLoadMap(true)}><FolderOpen size={12} /> LOAD</button>
          <button
            className="hud-btn"
            onClick={() => setShowRenameMap(true)}
            disabled={!currentMap}
            title="Rename current map"
          >
            &#x270e; RENAME
          </button>
          <button
            className="hud-btn"
            onClick={handleSave}
            disabled={!currentMap || !isDirty || isSaving}
          >
            <Save size={12} /> {isSaving ? 'SAVING...' : 'SAVE'}
          </button>
          <button
            className="hud-btn"
            onClick={handleClearMap}
            disabled={!currentMap}
            title="Clear all tiles"
          >
            <Trash2 size={12} /> CLEAR
          </button>
          <button
            className="hud-btn"
            onClick={() => setShowStampImage(true)}
            disabled={!currentMap}
            title="Stamp image to map"
          >
            <Stamp size={12} /> STAMP
          </button>

          <span className="hud-zoom-sep" />

          {/* Zoom */}
          <button className="hud-btn hud-zoom-btn" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}><ZoomOut size={12} /></button>
          <span className="hud-zoom-level" onClick={zoomReset} title="Reset zoom">{Math.round(zoom * 100)}%</span>
          <button className="hud-btn hud-zoom-btn" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}><ZoomIn size={12} /></button>
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
          <div className="palette-section-title">BRUSH SIZE</div>
          <div className="palette-brush-size">
            {[1, 2, 3, 4, 5].map(size => (
              <button
                key={size}
                className={`brush-size-btn${brushSize === size ? ' active' : ''}`}
                onClick={() => setBrushSize(size)}
                title={`${size * 2 - 1}×${size * 2 - 1} brush`}
              >
                {size}
              </button>
            ))}
          </div>

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
      {showRenameMap && currentMap && (
        <RenameMapDialog
          currentName={currentMap.name}
          onClose={() => setShowRenameMap(false)}
          onRename={handleRenameDialog}
        />
      )}
      {showStampImage && currentMap && (
        <StampImageDialog
          mapWidth={currentMap.width}
          mapHeight={currentMap.height}
          customColor={customColor}
          onClose={() => setShowStampImage(false)}
          onStamp={handleStampImage}
          onToast={onToast}
        />
      )}
    </div>
  )
}
