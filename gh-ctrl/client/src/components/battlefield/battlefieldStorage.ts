import type { DashboardEntry } from '../../types'
import type { Position } from './battlefieldConstants'
import { COLS, ISO_MAP_CENTER_X, ISO_MAP_OFFSET_Y, ISO_HALF_W, ISO_HALF_H } from './battlefieldConstants'

export function loadActiveMapId(): number | null {
  try {
    const stored = localStorage.getItem('battlefield-active-map-id')
    return stored ? parseInt(stored, 10) : null
  } catch {
    return null
  }
}

export function saveActiveMapId(id: number | null) {
  if (id === null) {
    localStorage.removeItem('battlefield-active-map-id')
  } else {
    localStorage.setItem('battlefield-active-map-id', String(id))
  }
}

export function loadPositions(): Record<number, Position> {
  try {
    const stored = localStorage.getItem('battlefield-positions')
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export function savePositions(positions: Record<number, Position>) {
  localStorage.setItem('battlefield-positions', JSON.stringify(positions))
}

export function getDefaultPositions(entries: DashboardEntry[]): Record<number, Position> {
  const positions: Record<number, Position> = {}
  entries.forEach((entry, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    positions[entry.repo.id] = {
      x: ISO_MAP_CENTER_X + (col - row) * ISO_HALF_W,
      y: ISO_MAP_OFFSET_Y + (col + row) * ISO_HALF_H,
    }
  })
  return positions
}
