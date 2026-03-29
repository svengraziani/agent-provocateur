import { useEffect, useCallback, useState } from 'react'
import type { DashboardEntry, Building } from '../types'
import type { Position } from '../components/battlefield/battlefieldConstants'

const STORAGE_KEY = 'battlefield-shortcuts'

export interface ShortcutConfig {
  bases: Record<number, string>     // repoId -> key
  buildings: Record<number, string>  // buildingId -> key
}

function loadShortcuts(): ShortcutConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { bases: {}, buildings: {} }
}

function saveShortcuts(config: ShortcutConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

interface UseBattlefieldKeyboardShortcutsOptions {
  entries: DashboardEntry[]
  buildings: Building[]
  positions: Record<number, Position>
  buildingPositions: Record<number, Position>
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomToBase: (pos: Position) => void
  onScan: () => void
  onToggleFeed: () => void
  onToggleTimers: () => void
  onPan: (dx: number, dy: number) => void
  onToggleShortcutsOverlay: () => void
  onToggleCommandPalette?: () => void
  enabled: boolean
}

export function useBattlefieldKeyboardShortcuts({
  entries,
  buildings,
  positions,
  buildingPositions,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onScan,
  onToggleFeed,
  onToggleTimers,
  onPan,
  onToggleShortcutsOverlay,
  onToggleCommandPalette,
  onZoomToBase,
  enabled,
}: UseBattlefieldKeyboardShortcutsOptions) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(loadShortcuts)
  const [assigningFor, setAssigningFor] = useState<{ type: 'base' | 'building'; id: number } | null>(null)

  const assignShortcut = useCallback((type: 'base' | 'building', id: number, key: string) => {
    setShortcuts(prev => {
      const next: ShortcutConfig = {
        bases: { ...prev.bases },
        buildings: { ...prev.buildings },
      }
      // Remove same key from other entries to avoid conflicts
      for (const k of Object.keys(next.bases)) {
        if (next.bases[Number(k)] === key) delete next.bases[Number(k)]
      }
      for (const k of Object.keys(next.buildings)) {
        if (next.buildings[Number(k)] === key) delete next.buildings[Number(k)]
      }
      if (type === 'base') next.bases[id] = key
      else next.buildings[id] = key
      saveShortcuts(next)
      return next
    })
    setAssigningFor(null)
  }, [])

  const clearShortcut = useCallback((type: 'base' | 'building', id: number) => {
    setShortcuts(prev => {
      const next: ShortcutConfig = {
        bases: { ...prev.bases },
        buildings: { ...prev.buildings },
      }
      if (type === 'base') delete next.bases[id]
      else delete next.buildings[id]
      saveShortcuts(next)
      return next
    })
  }, [])

  const startAssigning = useCallback((type: 'base' | 'building', id: number) => {
    setAssigningFor({ type, id })
  }, [])

  const cancelAssigning = useCallback(() => {
    setAssigningFor(null)
  }, [])

  const PAN_STEP = 120

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't fire if typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      // Don't fire if a modal/dialog is open
      if ((e.target as HTMLElement).closest('.modal-overlay, .map-dialog-overlay, [class*="dialog"], [class*="overlay"]')) return

      // Handle assignment mode
      if (assigningFor) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setAssigningFor(null)
          return
        }
        // Skip modifier-only keys
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
        e.preventDefault()
        const key = e.key.toLowerCase()
        assignShortcut(assigningFor.type, assigningFor.id, key)
        return
      }

      // Ctrl+K / Cmd+K — Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onToggleCommandPalette?.()
        return
      }

      // Built-in shortcuts
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault()
          onZoomIn()
          return
        case '-':
          e.preventDefault()
          onZoomOut()
          return
        case '0':
          e.preventDefault()
          onZoomReset()
          return
        case 'ArrowUp':
          e.preventDefault()
          onPan(0, PAN_STEP)
          return
        case 'ArrowDown':
          e.preventDefault()
          onPan(0, -PAN_STEP)
          return
        case 'ArrowLeft':
          e.preventDefault()
          onPan(PAN_STEP, 0)
          return
        case 'ArrowRight':
          e.preventDefault()
          onPan(-PAN_STEP, 0)
          return
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            onScan()
          }
          return
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            onToggleFeed()
          }
          return
        case 't':
        case 'T':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            onToggleTimers()
          }
          return
        case '?':
          e.preventDefault()
          onToggleShortcutsOverlay()
          return
      }

      // User-assigned shortcuts — base jump
      const pressedKey = e.key.toLowerCase()
      for (const [idStr, key] of Object.entries(shortcuts.bases)) {
        if (key === pressedKey) {
          const id = Number(idStr)
          const pos = positions[id]
          if (pos) {
            e.preventDefault()
            onZoomToBase(pos)
          }
          return
        }
      }

      // User-assigned shortcuts — building jump
      for (const [idStr, key] of Object.entries(shortcuts.buildings)) {
        if (key === pressedKey) {
          const id = Number(idStr)
          const building = buildings.find(b => b.id === id)
          const pos = buildingPositions[id] ?? (building ? { x: building.posX, y: building.posY } : null)
          if (pos) {
            e.preventDefault()
            onZoomToBase(pos)
          }
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    enabled, assigningFor, shortcuts, entries, buildings, positions, buildingPositions,
    onZoomIn, onZoomOut, onZoomReset, onZoomToBase, onScan, onToggleFeed, onToggleTimers,
    onPan, onToggleShortcutsOverlay, onToggleCommandPalette, assignShortcut,
  ])

  return { shortcuts, assigningFor, startAssigning, cancelAssigning, clearShortcut, assignShortcut }
}
