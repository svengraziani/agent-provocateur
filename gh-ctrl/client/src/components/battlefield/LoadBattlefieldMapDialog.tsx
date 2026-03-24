import { useRef, useEffect } from 'react'
import type { GameMap, MapTile } from '../../types'
import { MAP_TILE_W, MAP_TILE_H, MAP_TILE_DEPTH, darkenHex } from './battlefieldConstants'

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

export interface LoadBattlefieldMapDialogProps {
  maps: GameMap[]
  activeMapId: number | null
  onLoad: (map: GameMap) => void
  onClose: () => void
}

export function LoadBattlefieldMapDialog({ maps, activeMapId, onLoad, onClose }: LoadBattlefieldMapDialogProps) {
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
