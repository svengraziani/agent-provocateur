import { useState, useEffect, useRef, useCallback } from 'react'
import type { DashboardEntry, Building } from '../../types'
import type { Position } from './battlefieldConstants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory = 'BASE' | 'BUILDING' | 'ACTION' | 'NAV' | 'CREATE'

export interface PaletteCommand {
  id: string
  category: CommandCategory
  label: string
  execute: () => void
}

interface CommandPaletteProps {
  entries: DashboardEntry[]
  buildings: Building[]
  positions: Record<number, Position>
  buildingPositions: Record<number, Position>
  onZoomToBase: (pos: Position) => void
  onScan: () => void
  onToggleFeed: () => void
  onToggleTimers: () => void
  onZoomReset: () => void
  onOpenSettings?: () => void
  onOpenMapEditor?: () => void
  onCreateIssue?: (entry: DashboardEntry) => void
  onConstructBuilding?: () => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// localStorage persistence for recently-used commands
// ---------------------------------------------------------------------------

const RECENT_KEY = 'command-palette-recent'
const MAX_RECENT = 5

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveRecent(ids: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
}

function addRecent(id: string) {
  const current = loadRecent().filter(r => r !== id)
  saveRecent([id, ...current])
}

// ---------------------------------------------------------------------------
// Fuzzy match helper
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<CommandCategory, string> = {
  BASE: 'BASE',
  BUILDING: 'BUILD',
  ACTION: 'ACTION',
  NAV: 'NAV',
  CREATE: 'CREATE',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
  entries,
  buildings,
  positions,
  buildingPositions,
  onZoomToBase,
  onScan,
  onToggleFeed,
  onToggleTimers,
  onZoomReset,
  onOpenSettings,
  onOpenMapEditor,
  onCreateIssue,
  onConstructBuilding,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Build the full command list
  const allCommands = useCallback((): PaletteCommand[] => {
    const cmds: PaletteCommand[] = []

    // BASE commands
    for (const entry of entries) {
      const pos = positions[entry.repo.id]
      if (pos) {
        cmds.push({
          id: `base-${entry.repo.id}`,
          category: 'BASE',
          label: `Jump to ${entry.repo.name}`,
          execute: () => onZoomToBase(pos),
        })
      }
    }

    // BUILDING commands
    for (const building of buildings) {
      const pos = buildingPositions[building.id] ?? { x: building.posX, y: building.posY }
      cmds.push({
        id: `building-${building.id}`,
        category: 'BUILDING',
        label: `Go to ${building.name}`,
        execute: () => onZoomToBase(pos),
      })
    }

    // ACTION commands
    cmds.push(
      { id: 'action-scan', category: 'ACTION', label: 'Scan / Refresh', execute: onScan },
      { id: 'action-feed', category: 'ACTION', label: 'Toggle Intel Feed', execute: onToggleFeed },
      { id: 'action-timers', category: 'ACTION', label: 'Toggle Timers', execute: onToggleTimers },
      { id: 'action-reset', category: 'ACTION', label: 'Reset View', execute: onZoomReset },
    )

    // NAV commands
    if (onOpenSettings) {
      cmds.push({ id: 'nav-settings', category: 'NAV', label: 'Open Settings', execute: onOpenSettings })
    }
    if (onOpenMapEditor) {
      cmds.push({ id: 'nav-map-editor', category: 'NAV', label: 'Open Map Editor', execute: onOpenMapEditor })
    }

    // CREATE commands
    for (const entry of entries) {
      if (onCreateIssue) {
        cmds.push({
          id: `create-issue-${entry.repo.id}`,
          category: 'CREATE',
          label: `Create issue in ${entry.repo.name}`,
          execute: () => onCreateIssue(entry),
        })
      }
    }
    if (onConstructBuilding) {
      cmds.push({ id: 'create-building', category: 'CREATE', label: 'Construct building', execute: onConstructBuilding })
    }

    return cmds
  }, [entries, buildings, positions, buildingPositions, onZoomToBase, onScan, onToggleFeed, onToggleTimers, onZoomReset, onOpenSettings, onOpenMapEditor, onCreateIssue, onConstructBuilding])

  // Sort: recent first, then by category order
  const getFilteredCommands = useCallback((): PaletteCommand[] => {
    const recent = loadRecent()
    const cmds = allCommands()
    const filtered = cmds.filter(c => fuzzyMatch(query, `${c.category} ${c.label}`))
    filtered.sort((a, b) => {
      const ai = recent.indexOf(a.id)
      const bi = recent.indexOf(b.id)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return 0
    })
    return filtered
  }, [allCommands, query])

  const filtered = getFilteredCommands()

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const executeCommand = useCallback((cmd: PaletteCommand) => {
    addRecent(cmd.id)
    cmd.execute()
    onClose()
  }, [onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[selectedIndex]
      if (cmd) executeCommand(cmd)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [filtered, selectedIndex, executeCommand, onClose])

  return (
    <div
      className="command-palette-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div className="command-palette-panel">
        <div className="command-palette-input-row">
          <span className="command-palette-prompt">&gt;</span>
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Command search"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[selectedIndex] ? `cmd-item-${filtered[selectedIndex].id}` : undefined}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="command-palette-empty" role="status">No commands found</div>
        ) : (
          <ul
            ref={listRef}
            id="command-palette-list"
            className="command-palette-list"
            role="listbox"
          >
            {filtered.map((cmd, index) => (
              <li
                key={cmd.id}
                id={`cmd-item-${cmd.id}`}
                className={`command-palette-item${index === selectedIndex ? ' selected' : ''}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className={`command-palette-category command-palette-category-${cmd.category.toLowerCase()}`}>
                  [{CATEGORY_LABEL[cmd.category]}]
                </span>
                <span className="command-palette-label">{cmd.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
