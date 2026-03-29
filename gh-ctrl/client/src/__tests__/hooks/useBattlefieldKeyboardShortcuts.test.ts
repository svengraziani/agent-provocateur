import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBattlefieldKeyboardShortcuts } from '../../hooks/useBattlefieldKeyboardShortcuts'
import type { DashboardEntry, Building } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(id: number, name = `repo-${id}`): DashboardEntry {
  return {
    repo: { id, owner: 'owner', name, fullName: `owner/${name}`, description: null, color: '#ff0000', provider: 'github' },
    data: {
      prs: [], issues: [], branches: [], stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, runningActions: 0 },
      defaultBranch: 'main',
    },
  } as unknown as DashboardEntry
}

function makeBuilding(id: number, name = `building-${id}`): Building {
  return { id, name, type: 'clawcom', posX: 100, posY: 200 } as Building
}

function fireKeydown(key: string, options: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  window.dispatchEvent(event)
  return event
}

function defaultOptions() {
  return {
    entries: [] as DashboardEntry[],
    buildings: [] as Building[],
    positions: {} as Record<number, { x: number; y: number }>,
    buildingPositions: {} as Record<number, { x: number; y: number }>,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    onZoomToBase: vi.fn(),
    onScan: vi.fn(),
    onToggleFeed: vi.fn(),
    onToggleTimers: vi.fn(),
    onPan: vi.fn(),
    onToggleShortcutsOverlay: vi.fn(),
    onToggleCommandPalette: vi.fn(),
    enabled: true,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBattlefieldKeyboardShortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  // ── Persistence ──────────────────────────────────────────────────────────

  it('loads shortcut config from localStorage on init', () => {
    const stored = { bases: { 1: 'a' }, buildings: { 2: 'b' } }
    localStorage.setItem('battlefield-shortcuts', JSON.stringify(stored))

    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    expect(result.current.shortcuts.bases[1]).toBe('a')
    expect(result.current.shortcuts.buildings[2]).toBe('b')
  })

  it('uses empty config when localStorage has no shortcuts', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    expect(result.current.shortcuts.bases).toEqual({})
    expect(result.current.shortcuts.buildings).toEqual({})
  })

  // ── assignShortcut ───────────────────────────────────────────────────────

  it('assignShortcut stores to localStorage and updates state', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.assignShortcut('base', 1, 'q')
    })

    expect(result.current.shortcuts.bases[1]).toBe('q')
    const stored = JSON.parse(localStorage.getItem('battlefield-shortcuts')!)
    expect(stored.bases[1]).toBe('q')
  })

  it('assignShortcut removes duplicate key from other bases', () => {
    localStorage.setItem('battlefield-shortcuts', JSON.stringify({ bases: { 1: 'q', 2: 'w' }, buildings: {} }))
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.assignShortcut('base', 3, 'q')
    })

    expect(result.current.shortcuts.bases[3]).toBe('q')
    expect(result.current.shortcuts.bases[1]).toBeUndefined()
    expect(result.current.shortcuts.bases[2]).toBe('w')
  })

  it('assignShortcut removes duplicate key from buildings', () => {
    localStorage.setItem('battlefield-shortcuts', JSON.stringify({ bases: {}, buildings: { 10: 'z' } }))
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.assignShortcut('base', 1, 'z')
    })

    expect(result.current.shortcuts.bases[1]).toBe('z')
    expect(result.current.shortcuts.buildings[10]).toBeUndefined()
  })

  // ── clearShortcut ────────────────────────────────────────────────────────

  it('clearShortcut removes entry and saves to localStorage', () => {
    localStorage.setItem('battlefield-shortcuts', JSON.stringify({ bases: { 1: 'q' }, buildings: {} }))
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.clearShortcut('base', 1)
    })

    expect(result.current.shortcuts.bases[1]).toBeUndefined()
    const stored = JSON.parse(localStorage.getItem('battlefield-shortcuts')!)
    expect(stored.bases[1]).toBeUndefined()
  })

  // ── startAssigning / cancelAssigning ─────────────────────────────────────

  it('startAssigning sets assigningFor', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.startAssigning('base', 42)
    })

    expect(result.current.assigningFor).toEqual({ type: 'base', id: 42 })
  })

  it('cancelAssigning clears assigningFor', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.startAssigning('building', 7)
    })
    act(() => {
      result.current.cancelAssigning()
    })

    expect(result.current.assigningFor).toBeNull()
  })

  // ── Built-in zoom/pan shortcuts ──────────────────────────────────────────

  it('+ fires onZoomIn', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('+')
    expect(opts.onZoomIn).toHaveBeenCalled()
  })

  it('= fires onZoomIn', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('=')
    expect(opts.onZoomIn).toHaveBeenCalled()
  })

  it('- fires onZoomOut', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('-')
    expect(opts.onZoomOut).toHaveBeenCalled()
  })

  it('0 fires onZoomReset', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('0')
    expect(opts.onZoomReset).toHaveBeenCalled()
  })

  it('ArrowUp calls onPan(0, +PAN_STEP)', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('ArrowUp')
    expect(opts.onPan).toHaveBeenCalledWith(0, 120)
  })

  it('ArrowDown calls onPan(0, -PAN_STEP)', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('ArrowDown')
    expect(opts.onPan).toHaveBeenCalledWith(0, -120)
  })

  it('ArrowLeft calls onPan(+PAN_STEP, 0)', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('ArrowLeft')
    expect(opts.onPan).toHaveBeenCalledWith(120, 0)
  })

  it('ArrowRight calls onPan(-PAN_STEP, 0)', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('ArrowRight')
    expect(opts.onPan).toHaveBeenCalledWith(-120, 0)
  })

  it('r fires onScan', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('r')
    expect(opts.onScan).toHaveBeenCalled()
  })

  it('R fires onScan', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('R')
    expect(opts.onScan).toHaveBeenCalled()
  })

  it('f fires onToggleFeed', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('f')
    expect(opts.onToggleFeed).toHaveBeenCalled()
  })

  it('t fires onToggleTimers', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('t')
    expect(opts.onToggleTimers).toHaveBeenCalled()
  })

  it('? fires onToggleShortcutsOverlay', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('?')
    expect(opts.onToggleShortcutsOverlay).toHaveBeenCalled()
  })

  // ── Ctrl+K / Command Palette ─────────────────────────────────────────────

  it('Ctrl+K fires onToggleCommandPalette', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('k', { ctrlKey: true })
    expect(opts.onToggleCommandPalette).toHaveBeenCalled()
  })

  it('Meta+K fires onToggleCommandPalette', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('k', { metaKey: true })
    expect(opts.onToggleCommandPalette).toHaveBeenCalled()
  })

  // ── User-assigned shortcuts ──────────────────────────────────────────────

  it('user-assigned base key fires onZoomToBase with correct position', () => {
    localStorage.setItem('battlefield-shortcuts', JSON.stringify({ bases: { 5: 'g' }, buildings: {} }))
    const opts = {
      ...defaultOptions(),
      entries: [makeEntry(5)],
      positions: { 5: { x: 300, y: 400 } },
    }
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('g')
    expect(opts.onZoomToBase).toHaveBeenCalledWith({ x: 300, y: 400 })
  })

  it('user-assigned building key fires onZoomToBase', () => {
    localStorage.setItem('battlefield-shortcuts', JSON.stringify({ bases: {}, buildings: { 20: 'h' } }))
    const building = makeBuilding(20)
    const opts = {
      ...defaultOptions(),
      buildings: [building],
      buildingPositions: { 20: { x: 500, y: 600 } },
    }
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('h')
    expect(opts.onZoomToBase).toHaveBeenCalledWith({ x: 500, y: 600 })
  })

  // ── Disabled / ignored states ────────────────────────────────────────────

  it('does nothing when enabled = false', () => {
    const opts = { ...defaultOptions(), enabled: false }
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    fireKeydown('+')
    expect(opts.onZoomIn).not.toHaveBeenCalled()
  })

  it('ignores keydown when target is INPUT', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }))
    document.body.removeChild(input)
    expect(opts.onZoomIn).not.toHaveBeenCalled()
  })

  it('ignores keydown when target is TEXTAREA', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }))
    document.body.removeChild(textarea)
    expect(opts.onZoomIn).not.toHaveBeenCalled()
  })

  it('ignores keydown when target is contentEditable', () => {
    const opts = defaultOptions()
    renderHook(() => useBattlefieldKeyboardShortcuts(opts))
    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    div.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }))
    document.body.removeChild(div)
    expect(opts.onZoomIn).not.toHaveBeenCalled()
  })

  // ── Assignment mode ──────────────────────────────────────────────────────

  it('Escape while in assignment mode cancels assignment', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.startAssigning('base', 1)
    })

    expect(result.current.assigningFor).not.toBeNull()

    act(() => {
      fireKeydown('Escape')
    })

    expect(result.current.assigningFor).toBeNull()
    expect(opts.onZoomReset).not.toHaveBeenCalled()
  })

  it('pressing a key while in assignment mode assigns it', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.startAssigning('base', 1)
    })

    act(() => {
      fireKeydown('x')
    })

    expect(result.current.shortcuts.bases[1]).toBe('x')
    expect(result.current.assigningFor).toBeNull()
  })

  it('modifier-only keys are skipped during assignment mode', () => {
    const opts = defaultOptions()
    const { result } = renderHook(() => useBattlefieldKeyboardShortcuts(opts))

    act(() => {
      result.current.startAssigning('base', 1)
    })

    act(() => {
      fireKeydown('Shift')
    })

    expect(result.current.assigningFor).not.toBeNull()
    expect(result.current.shortcuts.bases[1]).toBeUndefined()
  })
})
