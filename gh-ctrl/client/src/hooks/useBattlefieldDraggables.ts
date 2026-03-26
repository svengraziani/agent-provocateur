import { useState, useCallback, useEffect } from 'react'
import type { Building, PlacedBadge } from '../types'

interface UseBattlefieldDraggablesOptions {
  storeBuildings: Building[]
  placedBadges: PlacedBadge[]
  updateBuildingPosition: (id: number, x: number, y: number) => void
  updatePlacedBadgePosition: (id: number, x: number, y: number) => void
}

export function useBattlefieldDraggables({
  storeBuildings,
  placedBadges,
  updateBuildingPosition,
  updatePlacedBadgePosition,
}: UseBattlefieldDraggablesOptions) {
  const [buildingPositions, setBuildingPositions] = useState<Record<number, { x: number; y: number }>>({})
  const [relocatingBuildingId, setRelocatingBuildingId] = useState<number | null>(null)
  const [relocatingBuildingStart, setRelocatingBuildingStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null)

  const [badgePositions, setBadgePositions] = useState<Record<number, { x: number; y: number }>>({})
  const [relocatingBadgeId, setRelocatingBadgeId] = useState<number | null>(null)
  const [relocatingBadgeStart, setRelocatingBadgeStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null)

  // Sync building positions from store (DB) into local state
  useEffect(() => {
    setBuildingPositions((prev) => {
      const next = { ...prev }
      for (const b of storeBuildings) {
        if (!next[b.id]) {
          next[b.id] = { x: b.posX, y: b.posY }
        }
      }
      for (const id of Object.keys(next).map(Number)) {
        if (!storeBuildings.find((b) => b.id === id)) {
          delete next[id]
        }
      }
      return next
    })
  }, [storeBuildings])

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

  const commitBuildingRelocate = useCallback(() => {
    if (relocatingBuildingId !== null) {
      const pos = buildingPositions[relocatingBuildingId]
      if (pos) {
        updateBuildingPosition(relocatingBuildingId, pos.x, pos.y)
      }
      setRelocatingBuildingId(null)
      setRelocatingBuildingStart(null)
    }
  }, [relocatingBuildingId, buildingPositions, updateBuildingPosition])

  const commitBadgeRelocate = useCallback(() => {
    if (relocatingBadgeId !== null) {
      const pos = badgePositions[relocatingBadgeId]
      if (pos) {
        updatePlacedBadgePosition(relocatingBadgeId, pos.x, pos.y)
      }
      setRelocatingBadgeId(null)
      setRelocatingBadgeStart(null)
    }
  }, [relocatingBadgeId, badgePositions, updatePlacedBadgePosition])

  return {
    buildingPositions,
    setBuildingPositions,
    relocatingBuildingId,
    setRelocatingBuildingId,
    relocatingBuildingStart,
    setRelocatingBuildingStart,
    badgePositions,
    setBadgePositions,
    relocatingBadgeId,
    setRelocatingBadgeId,
    relocatingBadgeStart,
    setRelocatingBadgeStart,
    handleStartBuildingRelocate,
    handleStartBadgeRelocate,
    commitBuildingRelocate,
    commitBadgeRelocate,
  }
}
