import { useState, useRef, useCallback, useEffect } from 'react'
import type { DashboardEntry, GameMap, MapTile, Building, Badge } from '../types'
import { BranchSiloPanel } from './BranchSiloPanel'
import { api } from '../api'
import { getServerUrl } from '../api'
import { getBranchState } from './BranchBuilding'
import { BaseNode, BaseDetailPanel } from './BaseNode'
import { ActionModal } from './ActionModal'
import type { ModalState } from './ActionModal'
import { ConstructDialog } from './ConstructDialog'
import { CloseIcon, RelocateIcon, ScanIcon, BuildIcon, MapIcon, FeedIcon } from './Icons'
import { FeedPanel } from './FeedPanel'
import { useSound } from '../hooks/useSound'
import { useAppStore } from '../store'
import { ClawComBuilding } from './ClawComBuilding'
import { BuildOptionsMenu } from './BuildOptionsMenu'
import type { PlacementParams } from './BuildOptionsMenu'
import { BadgeMarker } from './BadgeMarker'
import { BadgeLibraryDialog } from './BadgeLibraryDialog'

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
const ZOOM_MIN = 0.05
const ZOOM_MAX = 2.5
const ZOOM_FACTOR = 1.15

// Seeded PRNG (LCG) for stable terrain layout across renders
function seededRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

type TerrainType = 'tree' | 'rock' | 'crystal'
interface TerrainItem { id: number; x: number; y: number; type: TerrainType; scale: number }

const TERRAIN_ITEMS: TerrainItem[] = (() => {
  const rng = seededRng(0xCAFE1234)
  const types: TerrainType[] = ['tree', 'tree', 'tree', 'rock', 'rock', 'crystal']
  return Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: rng() * 2500 + 150,
    y: rng() * 2500 + 150,
    type: types[Math.floor(rng() * types.length)],
    scale: 0.75 + rng() * 0.55,
  }))
})()

const ORE_ROUTES = [1, 2, 3, 4, 5]

// ── Map tile rendering ────────────────────────────────────────────────────────

const MAP_TILE_W = 64
const MAP_TILE_H = 32
const MAP_TILE_DEPTH = 14

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  if (c.length !== 6) return [80, 80, 80]
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
}

function darkenHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - factor))},${Math.round(g * (1 - factor))},${Math.round(b * (1 - factor))})`
}

function loadActiveMapId(): number | null {
  try {
    const stored = localStorage.getItem('battlefield-active-map-id')
    return stored ? parseInt(stored, 10) : null
  } catch {
    return null
  }
}

function saveActiveMapId(id: number | null) {
  if (id === null) {
    localStorage.removeItem('battlefield-active-map-id')
  } else {
    localStorage.setItem('battlefield-active-map-id', String(id))
  }
}

// ── BattlefieldMapCanvas ──────────────────────────────────────────────────────

function BattlefieldMapCanvas({ map }: { map: GameMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const canvasW = (map.width + map.height) * (MAP_TILE_W / 2)
  const canvasH = (map.width + map.height) * (MAP_TILE_H / 2) + MAP_TILE_DEPTH + 10
  const offsetX = map.height * (MAP_TILE_W / 2)
  const offsetY = 10

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvasW
    canvas.height = canvasH
    canvas.style.width = `${canvasW}px`
    canvas.style.height = `${canvasH}px`

    ctx.clearRect(0, 0, canvasW, canvasH)

    let tiles: Record<string, MapTile> = {}
    try { tiles = JSON.parse(map.tiles) } catch { /* empty */ }

    const w2 = MAP_TILE_W / 2
    const h2 = MAP_TILE_H / 2

    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const key = `${col},${row}`
        const tile = tiles[key]
        if (!tile) continue

        const sx = (col - row) * w2 + offsetX
        const sy = (col + row) * h2 + offsetY
        const color = tile.color

        // Top face
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + w2, sy + h2)
        ctx.lineTo(sx, sy + MAP_TILE_H)
        ctx.lineTo(sx - w2, sy + h2)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        // Left face
        ctx.beginPath()
        ctx.moveTo(sx - w2, sy + h2)
        ctx.lineTo(sx, sy + MAP_TILE_H)
        ctx.lineTo(sx, sy + MAP_TILE_H + MAP_TILE_DEPTH)
        ctx.lineTo(sx - w2, sy + h2 + MAP_TILE_DEPTH)
        ctx.closePath()
        ctx.fillStyle = darkenHex(color, 0.35)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.stroke()

        // Right face
        ctx.beginPath()
        ctx.moveTo(sx, sy + MAP_TILE_H)
        ctx.lineTo(sx + w2, sy + h2)
        ctx.lineTo(sx + w2, sy + h2 + MAP_TILE_DEPTH)
        ctx.lineTo(sx, sy + MAP_TILE_H + MAP_TILE_DEPTH)
        ctx.closePath()
        ctx.fillStyle = darkenHex(color, 0.55)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.stroke()
      }
    }
  }, [map, canvasW, canvasH, offsetX, offsetY])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  )
}

// ── LoadBattlefieldMapDialog ──────────────────────────────────────────────────

function MapMiniPreview({ map }: { map: GameMap }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const W = 120
  const H = 72

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#0a1510'
    ctx.fillRect(0, 0, W, H)

    let tiles: Record<string, MapTile> = {}
    try { tiles = JSON.parse(map.tiles) } catch { /* empty */ }

    const scale = Math.min(W / (map.width * MAP_TILE_W * 0.8), H / (map.height * MAP_TILE_H * 1.4)) * 0.7
    const tw = MAP_TILE_W * scale
    const th = MAP_TILE_H * scale
    const depth = MAP_TILE_DEPTH * scale
    const ox = W / 2
    const oy = th * 1.5

    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const key = `${col},${row}`
        const tile = tiles[key]
        if (!tile) continue
        const sx = (col - row) * (tw / 2) + ox
        const sy = (col + row) * (th / 2) + oy
        const color = tile.color

        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + tw / 2, sy + th / 2)
        ctx.lineTo(sx, sy + th)
        ctx.lineTo(sx - tw / 2, sy + th / 2)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(sx - tw / 2, sy + th / 2)
        ctx.lineTo(sx, sy + th)
        ctx.lineTo(sx, sy + th + depth)
        ctx.lineTo(sx - tw / 2, sy + th / 2 + depth)
        ctx.closePath()
        ctx.fillStyle = darkenHex(color, 0.35)
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(sx, sy + th)
        ctx.lineTo(sx + tw / 2, sy + th / 2)
        ctx.lineTo(sx + tw / 2, sy + th / 2 + depth)
        ctx.lineTo(sx, sy + th + depth)
        ctx.closePath()
        ctx.fillStyle = darkenHex(color, 0.55)
        ctx.fill()
      }
    }
  }, [map])

  return <canvas ref={ref} style={{ display: 'block', borderRadius: 4 }} />
}

interface LoadBattlefieldMapDialogProps {
  maps: GameMap[]
  activeMapId: number | null
  onLoad: (map: GameMap) => void
  onClose: () => void
}

function LoadBattlefieldMapDialog({ maps, activeMapId, onLoad, onClose }: LoadBattlefieldMapDialogProps) {
  return (
    <div className="map-dialog-overlay" onClick={onClose} onWheel={(e) => e.stopPropagation()}>
      <div className="map-dialog map-dialog-load" onClick={e => e.stopPropagation()}>
        <div className="map-dialog-title">&#x25a0; SELECT MAP FOR BATTLEFIELD</div>
        {maps.length === 0 ? (
          <div className="map-dialog-empty">No saved maps. Create one in the Map Editor first.</div>
        ) : (
          <div className="map-load-list">
            {maps.map(m => (
              <div
                key={m.id}
                className={`map-load-item${activeMapId === m.id ? ' active' : ''}`}
                onClick={() => { onLoad(m); onClose() }}
              >
                <div className="map-load-preview">
                  <MapMiniPreview map={m} />
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
                {activeMapId === m.id && <span className="hud-stat" style={{ color: 'var(--green-neon)', fontSize: 11 }}>ACTIVE</span>}
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

export function BattlefieldView() {
  const repos = useAppStore((s) => s.repos)
  const entries = useAppStore((s) => s.entries)
  const loading = useAppStore((s) => s.loading)
  const onRefresh = useAppStore((s) => s.loadDashboard)
  const onRefreshRepo = useAppStore((s) => s.loadSingleRepo)
  const addToast = useAppStore((s) => s.addToast)
  const loadRepos = useAppStore((s) => s.loadRepos)
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  const storeBuildings = useAppStore((s) => s.buildings)
  const updateBuildingPosition = useAppStore((s) => s.updateBuildingPosition)
  const loadBadges = useAppStore((s) => s.loadBadges)
  const loadPlacedBadges = useAppStore((s) => s.loadPlacedBadges)
  const placedBadges = useAppStore((s) => s.placedBadges)
  const storePlaceBadge = useAppStore((s) => s.placeBadge)
  const updatePlacedBadgePosition = useAppStore((s) => s.updatePlacedBadgePosition)
  const onReposChange = () => { loadRepos(); onRefresh() }
  const [offset, setOffset] = useState<Position>(() => ({
    x: window.innerWidth / 2 - ISO_MAP_CENTER_X,
    y: window.innerHeight / 2 - ISO_MAP_OFFSET_Y,
  }))
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
  const [modalState, setModalState] = useState<ModalState>(null)
  const [activeMap, setActiveMap] = useState<GameMap | null>(null)
  const [allMaps, setAllMaps] = useState<GameMap[]>([])
  const [showMapSelector, setShowMapSelector] = useState(false)
  const [activeMapRepoIds, setActiveMapRepoIds] = useState<Set<number> | null>(null)
  const [showFeedPanel, setShowFeedPanel] = useState(false)
  const [branchSiloEntry, setBranchSiloEntry] = useState<DashboardEntry | null>(null)
  const [detailEntry, setDetailEntry] = useState<DashboardEntry | null>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null)
  const detailPanelRef = useRef<HTMLDivElement>(null)
  const [showBuildMenu, setShowBuildMenu] = useState(false)
  const [placementMode, setPlacementMode] = useState<PlacementParams | null>(null)
  const [ghostScreenPos, setGhostScreenPos] = useState<Position>({ x: 0, y: 0 })
  // Building positions: keyed by building id, stored in memory for smooth dragging
  const [buildingPositions, setBuildingPositions] = useState<Record<number, { x: number; y: number }>>({})
  const [relocatingBuildingId, setRelocatingBuildingId] = useState<number | null>(null)
  const [relocatingBuildingStart, setRelocatingBuildingStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null)
  const [showBadgeLibrary, setShowBadgeLibrary] = useState(false)
  const [placingBadge, setPlacingBadge] = useState<Badge | null>(null)
  const [badgePositions, setBadgePositions] = useState<Record<number, { x: number; y: number }>>({})
  const [relocatingBadgeId, setRelocatingBadgeId] = useState<number | null>(null)
  const [relocatingBadgeStart, setRelocatingBadgeStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null)

  useEffect(() => {
    const el = detailPanelRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [detailEntry])
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const offsetRef = useRef(offset)
  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAutoCenteredRef = useRef(false)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { offsetRef.current = offset }, [offset])

  const { play } = useSound()

  // Play sound when scan completes (loading transitions true → false)
  const prevLoadingRef = useRef(loading)
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      play('refreshed')
    }
    prevLoadingRef.current = loading
  }, [loading, play])

  // Play glass_poop when conflicts are first detected
  const prevConflictsRef = useRef(0)
  useEffect(() => {
    if (prevConflictsRef.current === 0 && entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0) > 0) {
      play('glass_poop')
    }
    prevConflictsRef.current = entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)
  }, [entries, play])

  // Load buildings on mount
  useEffect(() => {
    loadBuildings()
  }, [loadBuildings])

  // Load badges on mount
  useEffect(() => {
    loadBadges()
    loadPlacedBadges()
  }, [loadBadges, loadPlacedBadges])

  // Sync placed badge positions from store into local state
  useEffect(() => {
    setBadgePositions((prev) => {
      const next = { ...prev }
      for (const pb of placedBadges) {
        if (!next[pb.id]) {
          next[pb.id] = { x: pb.posX, y: pb.posY }
        }
      }
      for (const id of Object.keys(next).map(Number)) {
        if (!placedBadges.find((pb) => pb.id === id)) {
          delete next[id]
        }
      }
      return next
    })
  }, [placedBadges])

  // Sync building positions from store (DB) into local state
  useEffect(() => {
    setBuildingPositions((prev) => {
      const next = { ...prev }
      for (const b of storeBuildings) {
        if (!next[b.id]) {
          next[b.id] = { x: b.posX, y: b.posY }
        }
      }
      // Remove positions for deleted buildings
      for (const id of Object.keys(next).map(Number)) {
        if (!storeBuildings.find((b) => b.id === id)) {
          delete next[id]
        }
      }
      return next
    })
  }, [storeBuildings])

  // Load persisted active map on mount
  useEffect(() => {
    const savedId = loadActiveMapId()
    if (savedId !== null) {
      api.getMap(savedId).then(setActiveMap).catch(() => saveActiveMapId(null))
    }
  }, [])

  // Load assigned repos whenever activeMap changes
  useEffect(() => {
    if (!activeMap) {
      setActiveMapRepoIds(null)
      return
    }
    api.getMapRepos(activeMap.id)
      .then((repos) => setActiveMapRepoIds(new Set(repos.map((r) => r.id))))
      .catch(() => setActiveMapRepoIds(null))
  }, [activeMap])

  // Load all maps when selector opens
  useEffect(() => {
    if (showMapSelector) {
      api.listMaps().then(setAllMaps).catch(() => {})
    }
  }, [showMapSelector])

  // Clean up any pending auto-scan timer on unmount
  useEffect(() => {
    return () => {
      if (autoScanTimerRef.current !== null) clearTimeout(autoScanTimerRef.current)
    }
  }, [])

  const handleIssueCreated = useCallback((owner: string, repoName: string) => {
    if (autoScanTimerRef.current !== null) clearTimeout(autoScanTimerRef.current)
    addToast('Base scan scheduled in 15 seconds...', 'info')
    autoScanTimerRef.current = setTimeout(() => {
      autoScanTimerRef.current = null
      onRefreshRepo(owner, repoName)
    }, 15000)
  }, [onRefreshRepo, addToast])

  const handleLoadMap = useCallback((map: GameMap) => {
    setActiveMap(map)
    saveActiveMapId(map.id)
  }, [])

  const handleClearMap = useCallback(() => {
    setActiveMap(null)
    saveActiveMapId(null)
  }, [])

  // Update positions when entries change (new repos arriving via SSE stream).
  // Do NOT call savePositions here – during streaming entries arrive one at a time,
  // so saving mid-stream would overwrite localStorage with only the repos seen so far,
  // causing all other repos to lose their positions on the next load.
  useEffect(() => {
    if (entries.length === 0) return
    setPositions(prev => {
      const stored = loadPositions()
      const defaults = getDefaultPositions(entries)
      // Preserve ALL known positions so ghost nodes for pending repos stay at their
      // saved spots during streaming. Filtering to only current entries was causing
      // ghost nodes to jump to default fallback positions when the user had panned away.
      // Priority: in-memory (prev) > stored (localStorage) > computed defaults
      return { ...defaults, ...stored, ...prev }
    })
  }, [entries])

  // Persist positions once the full SSE stream has finished loading.
  useEffect(() => {
    if (!loading && entries.length > 0) {
      setPositions(prev => {
        savePositions(prev)
        return prev
      })
    }
  }, [loading])

  // Auto-center the camera on the bounding box of all loaded nodes after the
  // initial data load completes. Only runs once per mount.
  useEffect(() => {
    if (loading || entries.length === 0 || hasAutoCenteredRef.current) return
    hasAutoCenteredRef.current = true
    const posArray = entries.map(e => positions[e.repo.id]).filter((p): p is Position => !!p)
    if (posArray.length === 0) return
    const minX = Math.min(...posArray.map(p => p.x))
    const maxX = Math.max(...posArray.map(p => p.x))
    const minY = Math.min(...posArray.map(p => p.y))
    const maxY = Math.max(...posArray.map(p => p.y))
    setOffset({
      x: window.innerWidth / 2 - (minX + maxX) / 2,
      y: window.innerHeight / 2 - (minY + maxY) / 2,
    })
  }, [loading, entries, positions])

  const handleMapMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cnc-sidebar')) return
    if (placementMode) return  // handled in handleMapClick
    if (placingBadge) return  // handled in handleMapClick
    if ((e.target as HTMLElement).closest('.base-node')) return
    if (isRelocateMode) return
    setIsDraggingMap(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }, [offset, isRelocateMode, placementMode, placingBadge])

  const handleMapClick = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cnc-sidebar')) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mapX = (e.clientX - rect.left - offsetRef.current.x) / zoomRef.current
    const mapY = (e.clientY - rect.top - offsetRef.current.y) / zoomRef.current

    if (placingBadge) {
      try {
        await storePlaceBadge({ badgeId: placingBadge.id, posX: mapX, posY: mapY })
        addToast(`Badge "${placingBadge.name}" placed!`, 'success')
      } catch (err: any) {
        addToast(`Failed to place badge: ${err.message}`, 'error')
      }
      setPlacingBadge(null)
      return
    }

    if (!placementMode) return
    try {
      await api.createBuilding({ type: placementMode.type, name: placementMode.name, color: placementMode.color, posX: mapX, posY: mapY })
      await loadBuildings()
      addToast(`${placementMode.name} platziert!`, 'success')
    } catch (err: any) {
      addToast(`Bau fehlgeschlagen: ${err.message}`, 'error')
    }
    setPlacementMode(null)
  }, [placementMode, placingBadge, loadBuildings, addToast, storePlaceBadge])

  const handleMapMouseMove = useCallback((e: React.MouseEvent) => {
    if (placementMode) {
      setGhostScreenPos({ x: e.clientX, y: e.clientY })
      return
    }
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
    } else if (relocatingBuildingId !== null && relocatingBuildingStart !== null) {
      const dx = (e.clientX - relocatingBuildingStart.mouseX) / zoomRef.current
      const dy = (e.clientY - relocatingBuildingStart.mouseY) / zoomRef.current
      setBuildingPositions(prev => ({
        ...prev,
        [relocatingBuildingId]: {
          x: relocatingBuildingStart.nodeX + dx,
          y: relocatingBuildingStart.nodeY + dy,
        },
      }))
    } else if (relocatingBadgeId !== null && relocatingBadgeStart !== null) {
      const dx = (e.clientX - relocatingBadgeStart.mouseX) / zoomRef.current
      const dy = (e.clientY - relocatingBadgeStart.mouseY) / zoomRef.current
      setBadgePositions(prev => ({
        ...prev,
        [relocatingBadgeId]: {
          x: relocatingBadgeStart.nodeX + dx,
          y: relocatingBadgeStart.nodeY + dy,
        },
      }))
    }
  }, [isDraggingMap, dragStart, relocatingId, relocatingStart, relocatingBuildingId, relocatingBuildingStart, relocatingBadgeId, relocatingBadgeStart])

  const handleWheel = useCallback((e: WheelEvent) => {
    if ((e.target as HTMLElement).closest('.modal-overlay, .map-dialog-overlay, .silo-panel, .feed-panel, [class*="dialog"]')) return
    e.preventDefault()
    // Use actual deltaY magnitude for smooth trackpad support; clamp to avoid huge jumps
    const clampedDelta = Math.max(-100, Math.min(100, e.deltaY))
    const factor = Math.pow(ZOOM_FACTOR, -clampedDelta / 100)
    setZoom(prevZoom => {
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom * factor))
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  useEffect(() => {
    if (!placementMode && !placingBadge) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacementMode(null)
        setPlacingBadge(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placementMode, placingBadge])

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(ZOOM_MAX, prev * ZOOM_FACTOR)
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
      const newZoom = Math.max(ZOOM_MIN, prev / ZOOM_FACTOR)
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
    const posArray = Object.values(positions).filter((p): p is Position => !!p)
    if (posArray.length > 0) {
      const minX = Math.min(...posArray.map(p => p.x))
      const maxX = Math.max(...posArray.map(p => p.x))
      const minY = Math.min(...posArray.map(p => p.y))
      const maxY = Math.max(...posArray.map(p => p.y))
      setOffset({
        x: window.innerWidth / 2 - (minX + maxX) / 2,
        y: window.innerHeight / 2 - (minY + maxY) / 2,
      })
    } else {
      setOffset({
        x: window.innerWidth / 2 - ISO_MAP_CENTER_X,
        y: window.innerHeight / 2 - ISO_MAP_OFFSET_Y,
      })
    }
  }, [positions])

  const handleZoomToBase = useCallback((pos: Position) => {
    const targetZoom = Math.max(1.5, ZOOM_MAX * 0.5)
    setZoom(targetZoom)
    setOffset({
      x: window.innerWidth / 2 - pos.x * targetZoom,
      y: window.innerHeight / 2 - pos.y * targetZoom,
    })
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
    if (relocatingBuildingId !== null) {
      const pos = buildingPositions[relocatingBuildingId]
      if (pos) {
        updateBuildingPosition(relocatingBuildingId, pos.x, pos.y)
      }
      setRelocatingBuildingId(null)
      setRelocatingBuildingStart(null)
    }
    if (relocatingBadgeId !== null) {
      const pos = badgePositions[relocatingBadgeId]
      if (pos) {
        updatePlacedBadgePosition(relocatingBadgeId, pos.x, pos.y)
      }
      setRelocatingBadgeId(null)
      setRelocatingBadgeStart(null)
    }
  }, [relocatingId, relocatingBuildingId, buildingPositions, updateBuildingPosition, relocatingBadgeId, badgePositions, updatePlacedBadgePosition])

  const handleStartRelocate = useCallback((id: number, mouseX: number, mouseY: number) => {
    const pos = positions[id]
    if (!pos) return
    setRelocatingId(id)
    setRelocatingStart({ mouseX, mouseY, nodeX: pos.x, nodeY: pos.y })
  }, [positions])

  const handleStartBuildingRelocate = useCallback((id: number, mouseX: number, mouseY: number) => {
    const pos = buildingPositions[id]
    if (!pos) return
    setRelocatingBuildingId(id)
    setRelocatingBuildingStart({ mouseX, mouseY, nodeX: pos.x, nodeY: pos.y })
  }, [buildingPositions])

  const handleStartBadgeRelocate = useCallback((id: number, mouseX: number, mouseY: number) => {
    const pos = badgePositions[id]
    if (!pos) return
    setRelocatingBadgeId(id)
    setRelocatingBadgeStart({ mouseX, mouseY, nodeX: pos.x, nodeY: pos.y })
  }, [badgePositions])

  // When an active map is selected, filter to only its assigned repos
  const visibleEntries = activeMapRepoIds === null
    ? entries
    : entries.filter((e) => activeMapRepoIds.has(e.repo.id))

  const totalConflicts = visibleEntries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)
  const totalRunningActions = visibleEntries.reduce((sum, e) => sum + (e.data.stats.runningActions ?? 0), 0)
  const loadedFullNames = new Set(entries.map((e) => e.repo.fullName))
  const pendingRepos = loading ? repos.filter((r) => !loadedFullNames.has(r.fullName)) : []

  // Stale branch counts across visible repos
  const staleBranchStats = visibleEntries.reduce((acc, e) => {
    const defaultBranch = e.data.defaultBranch ?? 'main'
    const nonDefault = (e.data.branches ?? []).filter(b => b.name !== defaultBranch)
    const stale = nonDefault.filter(b => getBranchState(b.committedDate) === 'stale' || getBranchState(b.committedDate) === 'very-stale')
    if (stale.length > 0) acc.repos++
    acc.total += stale.length
    return acc
  }, { total: 0, repos: 0 })


  return (
    <div
      className="battlefield-container"
      onMouseDown={handleMapMouseDown}
      onMouseMove={handleMapMouseMove}
      onMouseUp={handleMapMouseUp}
      onMouseLeave={handleMapMouseUp}
      onClick={handleMapClick}
      ref={containerRef}
      style={{ cursor: (placementMode || placingBadge) ? 'crosshair' : isDraggingMap ? 'grabbing' : (isRelocateMode ? 'crosshair' : 'grab') }}
    >
      {/* Scanlines — fixed to viewport */}
      <div className="battlefield-scanlines" />

      {/* HUD */}
      <div className="battlefield-hud">
        <div className="hud-brand">
          &#x25a0;<span className="hud-label"> C&amp;C GITAGENTS</span>
        </div>
        <div className="hud-controls">
          <span className="hud-stat" title={`${visibleEntries.length} bases`}>
            &#x25a6; <strong>{visibleEntries.length}</strong>
            {activeMapRepoIds !== null && entries.length !== visibleEntries.length && <span style={{ opacity: 0.5, fontSize: 9 }}>/{entries.length}</span>}
            <span className="hud-label"> BASES</span>
          </span>
          {totalConflicts > 0 && (
            <span className="hud-stat hud-alert blink" title={`${totalConflicts} merge conflicts`}>
              &#x26a0; <strong>{totalConflicts}</strong><span className="hud-label"> CONFLICTS</span>
            </span>
          )}
          {totalRunningActions > 0 && (
            <span className="hud-stat hud-actions" title="Running GitHub Actions across all bases">
              <span className="spinning-process">&#x2699;</span> <strong>{totalRunningActions}</strong>
            </span>
          )}
          {staleBranchStats.total > 0 && (
            <span className="hud-stat hud-stale-branches" title={`${staleBranchStats.total} stale branch(es) across ${staleBranchStats.repos} repo(s)`}>
              &#x2387; <strong>{staleBranchStats.total}</strong><span className="hud-label"> STALE</span>
            </span>
          )}
          <button
            className="hud-btn"
            onClick={() => { play('peep'); onRefresh() }}
            disabled={loading}
            title="Scan all bases"
          >
            {loading ? <span className="spinning-process">&#x2699;</span> : <ScanIcon size={11} />}
            <span className="hud-label"> {loading ? 'SCANNING' : 'SCAN'}</span>
          </button>
          <button
            className={`hud-btn${isRelocateMode ? ' active' : ''}`}
            onClick={() => { play('hydraulic'); setIsRelocateMode(v => !v); setRelocatingId(null); setRelocatingStart(null) }}
            title={isRelocateMode ? 'Cancel relocate' : 'Relocate a base'}
          >
            {isRelocateMode ? <CloseIcon size={10} /> : <RelocateIcon size={11} />}
            <span className="hud-label"> {isRelocateMode ? 'CANCEL' : 'RELOCATE'}</span>
          </button>
          <button
            className="hud-btn"
            onClick={() => { play('hydraulic'); setShowBuildMenu(true) }}
            title="Bau Optionen (ClawCom, etc.)"
          >
            <BuildIcon size={11} /><span className="hud-label"> BUILD</span>
          </button>
          <button
            className={`hud-btn${showBadgeLibrary ? ' active' : ''}`}
            onClick={() => { play('peep'); setShowBadgeLibrary(true) }}
            title="Badge Library — place custom markers on the battlefield"
          >
            ◈<span className="hud-label"> BADGES</span>
          </button>
          <span className="hud-zoom-sep" />
          <button
            className="hud-btn"
            onClick={() => setShowMapSelector(true)}
            title="Load a map from the Map Editor"
          >
            <MapIcon size={11} /><span className="hud-label"> {activeMap ? activeMap.name : 'MAP'}</span>
          </button>
          {activeMap && (
            <button
              className="hud-btn hud-btn-icon"
              onClick={handleClearMap}
              title="Clear loaded map"
            >
              <CloseIcon size={9} />
            </button>
          )}
          <span className="hud-zoom-sep" />
          <button
            className={`hud-btn${showFeedPanel ? ' active' : ''}`}
            onClick={() => { play('peep'); setShowFeedPanel(v => !v) }}
            title="Toggle Intel Feed"
          >
            <FeedIcon size={11} /><span className="hud-label"> FEED</span>
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
        {/* Terrain grid — inside map layer so it pans/zooms with the bases */}
        {!activeMap && <div className="battlefield-terrain" />}

        {/* Map canvas — shown when a map is loaded */}
        {activeMap && <BattlefieldMapCanvas map={activeMap} />}

        {/* Terrain elements: trees, rocks, crystals — shown when no map is loaded */}
        {!activeMap && TERRAIN_ITEMS.map((item) => (
          <div
            key={item.id}
            className="terrain-el"
            style={{ left: item.x, top: item.y, transform: `scale(${item.scale})` }}
          >
            {item.type === 'tree' && (
              <div className="terrain-tree">
                <div className="terrain-tree-layer" />
                <div className="terrain-tree-layer" />
                <div className="terrain-tree-layer" />
                <div className="terrain-tree-trunk" />
              </div>
            )}
            {item.type === 'rock' && <div className="terrain-rock" />}
            {item.type === 'crystal' && <div className="terrain-crystal" />}
          </div>
        ))}

        {/* Ore collectors — shown when no map is loaded */}
        {!activeMap && ORE_ROUTES.map((route) => (
          <div key={route} className="ore-collector" data-route={String(route)}>
            <div className="ore-collector-body" />
            <div className="ore-collector-tracks" />
          </div>
        ))}

        {visibleEntries.map((entry) => {
          const pos = positions[entry.repo.id] ?? { x: 0, y: 0 }
          return (
            <BaseNode
              key={entry.repo.id}
              entry={entry}
              position={pos}
              isRelocateMode={isRelocateMode}
              isBeingRelocated={relocatingId === entry.repo.id}
              onConstruct={() => { play('hydraulic'); setConstructTarget(entry) }}
              onStartRelocate={(mouseX, mouseY) => handleStartRelocate(entry.repo.id, mouseX, mouseY)}
              onRefreshRepo={onRefreshRepo}
              addToast={addToast}
              onModalOpen={(state) => { play('peep'); setModalState(state) }}
              onBranchSiloClick={(e) => { play('peep'); setBranchSiloEntry(e); setDetailEntry(null); setSelectedBuildingId(null) }}
              onZoomToBase={() => handleZoomToBase(pos)}
              onBaseDetailOpen={(e) => { play('peep'); setDetailEntry(prev => prev?.repo.id === e.repo.id ? null : e); setBranchSiloEntry(null); setSelectedBuildingId(null) }}
              isSelected={detailEntry?.repo.id === entry.repo.id}
              isSiloSelected={branchSiloEntry?.repo.id === entry.repo.id}
            />
          )
        })}

        {pendingRepos.map((repo, i) => {
          const pos = positions[repo.id] ?? { x: ISO_MAP_CENTER_X + (i % COLS) * ISO_HALF_W, y: ISO_MAP_OFFSET_Y + Math.floor(i / COLS) * ISO_HALF_H }
          return (
            <div
              key={`pending-${repo.id}`}
              className="base-node base-node-ghost"
              style={{ left: pos.x, top: pos.y, borderColor: repo.color }}
            >
              <div className="base-node-ghost-label" style={{ color: repo.color }}>{repo.name}</div>
              <div className="base-node-ghost-status spinning-radar">&#x25CF;</div>
            </div>
          )
        })}

        {/* Custom buildings (ClawCom, etc.) */}
        {storeBuildings.map((building) => {
          const pos = buildingPositions[building.id] ?? { x: building.posX, y: building.posY }
          return (
            <ClawComBuilding
              key={`building-${building.id}`}
              building={building}
              position={pos}
              isRelocateMode={isRelocateMode}
              isBeingRelocated={relocatingBuildingId === building.id}
              onStartRelocate={(mouseX, mouseY) => handleStartBuildingRelocate(building.id, mouseX, mouseY)}
              addToast={addToast}
              isSelected={selectedBuildingId === building.id}
              onSelect={() => { play('peep'); setSelectedBuildingId(prev => prev === building.id ? null : building.id); setDetailEntry(null); setBranchSiloEntry(null) }}
              onDeselect={() => setSelectedBuildingId(null)}
            />
          )
        })}

        {/* Custom badge markers */}
        {placedBadges.map((pb) => {
          const pos = badgePositions[pb.id] ?? { x: pb.posX, y: pb.posY }
          return (
            <BadgeMarker
              key={`badge-${pb.id}`}
              placedBadge={pb}
              position={pos}
              isRelocateMode={isRelocateMode}
              isBeingRelocated={relocatingBadgeId === pb.id}
              onStartRelocate={(mouseX, mouseY) => handleStartBadgeRelocate(pb.id, mouseX, mouseY)}
              addToast={addToast}
              serverUrl={getServerUrl()}
            />
          )
        })}
      </div>

      {/* Minimap */}
      {(visibleEntries.length > 0 || pendingRepos.length > 0) && (
        <Minimap entries={visibleEntries} positions={positions} offset={offset} zoom={zoom} onJump={setOffset} />
      )}

      {/* Empty state */}
      {repos.length === 0 && !loading && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title">&#x25a0; NO BASES DETECTED</div>
          <div className="battlefield-empty-sub">Add repositories in the Repositories panel to deploy bases.</div>
        </div>
      )}

      {/* Active map with no assigned repos */}
      {activeMap && activeMapRepoIds !== null && activeMapRepoIds.size === 0 && !loading && entries.length > 0 && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title">&#x25a6; NO BASES ON THIS MAP</div>
          <div className="battlefield-empty-sub">Assign repositories to &quot;{activeMap.name}&quot; in the Repositories panel.</div>
        </div>
      )}

      {repos.length === 0 && loading && (
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

      {/* Action modal — rendered outside the transformed map to ensure correct fixed positioning */}
      <ActionModal
        state={modalState}
        onClose={() => setModalState(null)}
        onSuccess={(msg) => addToast(msg, 'success')}
        onError={(msg) => addToast(msg, 'error')}
        onIssueCreated={handleIssueCreated}
        onTransition={(newState) => setModalState(newState)}
      />

      {/* Construction dialog */}
      {constructTarget && (
        <ConstructDialog
          entry={constructTarget}
          onClose={() => setConstructTarget(null)}
          onSuccess={(msg) => { addToast(msg, 'success'); setConstructTarget(null) }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}

      {/* Map selector dialog */}
      {showMapSelector && (
        <LoadBattlefieldMapDialog
          maps={allMaps}
          activeMapId={activeMap?.id ?? null}
          onLoad={handleLoadMap}
          onClose={() => setShowMapSelector(false)}
        />
      )}

      {/* Build options menu */}
      {showBuildMenu && (
        <BuildOptionsMenu
          onClose={() => setShowBuildMenu(false)}
          onStartPlacement={async (params) => {
            if (params.type === 'new-base') {
              setShowBuildMenu(false)
              try {
                await api.createRepo({
                  name: params.name,
                  description: params.repoDescription,
                  visibility: params.repoVisibility ?? 'private',
                })
                addToast(`Base "${params.name}" established!`, 'success')
                loadRepos()
                onRefresh()
              } catch (err) {
                addToast(err instanceof Error ? err.message : 'Failed to create repository', 'error')
              }
            } else {
              setShowBuildMenu(false)
              setPlacementMode(params)
              setGhostScreenPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
            }
          }}
        />
      )}

      {/* Badge library dialog */}
      {showBadgeLibrary && (
        <BadgeLibraryDialog
          onClose={() => setShowBadgeLibrary(false)}
          onSelectForPlacement={(badge) => {
            setPlacingBadge(badge)
            setShowBadgeLibrary(false)
          }}
          serverUrl={getServerUrl()}
        />
      )}

      {/* Badge placement banner */}
      {placingBadge && (
        <div className="battlefield-placement-banner">
          ◈ BADGE MODE — Click on the battlefield to place <strong>{placingBadge.name}</strong> &nbsp;·&nbsp; ESC to cancel
        </div>
      )}

      {/* Placement mode: ghost + banner */}
      {placementMode && (
        <>
          <div
            className="placement-ghost"
            style={{ left: ghostScreenPos.x, top: ghostScreenPos.y }}
          >
            <img src={placementMode.buildImage} alt={placementMode.name} />
          </div>
          <div className="battlefield-placement-banner">
            &#x2295; PLATZIERUNGSMODUS — Klicke auf die Karte um <strong>{placementMode.name}</strong> zu setzen &nbsp;·&nbsp; ESC zum Abbrechen
          </div>
        </>
      )}

      {/* Intel Feed Panel */}
      <FeedPanel
        entries={visibleEntries}
        isOpen={showFeedPanel}
        onClose={() => setShowFeedPanel(false)}
      />

      {/* Branch Silo Panel — C&C-style right-side command panel */}
      <BranchSiloPanel
        entry={branchSiloEntry}
        onClose={() => setBranchSiloEntry(null)}
        addToast={addToast}
        onModalOpen={(state) => { play('peep'); setModalState(state) }}
      />

      {/* Base Detail Side Panel — C&C-style right-side info panel */}
      {detailEntry && (
        <div ref={detailPanelRef} className="base-detail-side-panel">
          <div className="base-detail-side-panel-header">
            <div className="base-detail-side-panel-title-row">
              <span className="base-detail-side-panel-icon" style={{ color: detailEntry.repo.color }}>&#x25a0;</span>
              <div>
                <div className="base-detail-side-panel-title">BASE INTEL</div>
                <div className="base-detail-side-panel-subtitle">{detailEntry.repo.name}</div>
              </div>
            </div>
            <button className="silo-panel-close" onClick={() => setDetailEntry(null)} title="Close [Esc]">✕</button>
          </div>
          <div className="base-detail-side-panel-body">
            <BaseDetailPanel
              entry={detailEntry}
              onClose={() => setDetailEntry(null)}
              onModalOpen={(state) => { play('peep'); setModalState(state) }}
            />
          </div>
        </div>
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
  const LABEL_H = 12
  const PADDING = 10

  // Compute bounding box of all base positions so the minimap auto-fits
  const posArray = entries.map(e => positions[e.repo.id]).filter((p): p is Position => !!p)
  const minX = posArray.length > 0 ? Math.min(...posArray.map(p => p.x)) : 0
  const maxX = posArray.length > 0 ? Math.max(...posArray.map(p => p.x)) : 800
  const minY = posArray.length > 0 ? Math.min(...posArray.map(p => p.y)) : 0
  const maxY = posArray.length > 0 ? Math.max(...posArray.map(p => p.y)) : 600

  const worldW = Math.max(maxX - minX, 1)
  const worldH = Math.max(maxY - minY, 1)
  const contentW = MINIMAP_W - PADDING * 2
  const contentH = MINIMAP_H - LABEL_H - PADDING * 2
  const scale = Math.min(contentW / worldW, contentH / worldH)

  // Origin: translate world coords → minimap pixel coords (below label, centered)
  const ox = PADDING + (contentW - worldW * scale) / 2 - minX * scale
  const oy = LABEL_H + PADDING + (contentH - worldH * scale) / 2 - minY * scale

  const toMiniX = (wx: number) => wx * scale + ox
  const toMiniY = (wy: number) => wy * scale + oy

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // Convert minimap pixel position back to world coordinates
    const wx = (e.clientX - rect.left - ox) / scale
    const wy = (e.clientY - rect.top - oy) / scale
    onJump({ x: -wx * zoom + window.innerWidth / 2, y: -wy * zoom + window.innerHeight / 2 })
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
        const hasConflicts = entry.data.stats.conflicts > 0
        const defaultBranch = entry.data.defaultBranch ?? 'main'
        const hasStale = (entry.data.branches ?? []).some(
          b => b.name !== defaultBranch && (getBranchState(b.committedDate) === 'stale' || getBranchState(b.committedDate) === 'very-stale')
        )
        return (
          <div
            key={entry.repo.id}
            className={`minimap-base${hasConflicts ? ' alert' : hasStale ? ' stale' : ''}`}
            style={{
              left: toMiniX(pos.x),
              top: toMiniY(pos.y),
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
          left: toMiniX(-offset.x / zoom),
          top: toMiniY(-offset.y / zoom),
          width: window.innerWidth / zoom * scale,
          height: window.innerHeight / zoom * scale,
        }}
      />
    </div>
  )
}
