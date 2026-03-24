import type { MouseEvent } from 'react'
import type { DashboardEntry } from '../../types'
import type { Position } from './battlefieldConstants'
import { getBranchState } from '../BranchBuilding'

interface MinimapProps {
  entries: DashboardEntry[]
  positions: Record<number, Position>
  offset: Position
  zoom: number
  onJump: (pos: Position) => void
}

export function BattlefieldMinimap({ entries, positions, offset, zoom, onJump }: MinimapProps) {
  const MINIMAP_W = 160
  const MINIMAP_H = 100
  const LABEL_H = 12
  const PADDING = 10

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

  const ox = PADDING + (contentW - worldW * scale) / 2 - minX * scale
  const oy = LABEL_H + PADDING + (contentH - worldH * scale) / 2 - minY * scale

  const toMiniX = (wx: number) => wx * scale + ox
  const toMiniY = (wy: number) => wy * scale + oy

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
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
