import { useState, useRef, useCallback, useEffect } from 'react'
import type { DashboardEntry } from '../types'
import type { Position } from '../components/battlefield/battlefieldConstants'
import { loadPositions, savePositions, getDefaultPositions } from '../components/battlefield/battlefieldStorage'

interface UseBattlefieldPositionsOptions {
  entries: DashboardEntry[]
  loading: boolean
}

export function useBattlefieldPositions({ entries, loading }: UseBattlefieldPositionsOptions) {
  const [positions, setPositions] = useState<Record<number, Position>>(() => {
    const stored = loadPositions()
    const defaults = getDefaultPositions(entries)
    return { ...defaults, ...stored }
  })
  const [relocatingId, setRelocatingId] = useState<number | null>(null)
  const [relocatingStart, setRelocatingStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null)

  const hasAutoCenteredRef = useRef(false)

  // Update positions when entries change (new repos arriving via SSE stream).
  useEffect(() => {
    if (entries.length === 0) return
    setPositions(prev => {
      const stored = loadPositions()
      const defaults = getDefaultPositions(entries)
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

  // Auto-center the camera on the bounding box of all loaded nodes after the initial data load completes.
  // Returns the suggested offset if auto-centering should happen, null otherwise.
  const getAutoCenterOffset = useCallback((): Position | null => {
    if (loading || entries.length === 0 || hasAutoCenteredRef.current) return null
    hasAutoCenteredRef.current = true
    const posArray = entries.map(e => positions[e.repo.id]).filter((p): p is Position => !!p)
    if (posArray.length === 0) return null
    const minX = Math.min(...posArray.map(p => p.x))
    const maxX = Math.max(...posArray.map(p => p.x))
    const minY = Math.min(...posArray.map(p => p.y))
    const maxY = Math.max(...posArray.map(p => p.y))
    return {
      x: window.innerWidth / 2 - (minX + maxX) / 2,
      y: window.innerHeight / 2 - (minY + maxY) / 2,
    }
  }, [loading, entries, positions])

  const handleStartRelocate = useCallback((id: number, mouseX: number, mouseY: number) => {
    const pos = positions[id]
    if (!pos) return
    setRelocatingId(id)
    setRelocatingStart({ mouseX, mouseY, nodeX: pos.x, nodeY: pos.y })
  }, [positions])

  return {
    positions,
    setPositions,
    relocatingId,
    setRelocatingId,
    relocatingStart,
    setRelocatingStart,
    handleStartRelocate,
    getAutoCenterOffset,
  }
}
