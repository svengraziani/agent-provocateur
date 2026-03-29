import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBattlefieldPositions } from '../../hooks/useBattlefieldPositions'
import type { DashboardEntry } from '../../types'

function makeEntry(id: number): DashboardEntry {
  return {
    repo: { id, owner: 'owner', name: `repo-${id}`, fullName: `owner/repo-${id}`, description: null, color: '#fff', provider: 'github' },
    data: {
      prs: [], issues: [], branches: [], stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, runningActions: 0 },
      defaultBranch: 'main',
    },
  } as unknown as DashboardEntry
}

describe('useBattlefieldPositions', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
  })

  it('initialises positions for provided entries', () => {
    const entries = [makeEntry(1), makeEntry(2)]
    const { result } = renderHook(() => useBattlefieldPositions({ entries, loading: false }))
    expect(result.current.positions[1]).toBeDefined()
    expect(result.current.positions[2]).toBeDefined()
  })

  it('handleStartRelocate sets relocatingId and relocatingStart', () => {
    const entries = [makeEntry(1)]
    const { result } = renderHook(() => useBattlefieldPositions({ entries, loading: false }))
    const pos = result.current.positions[1]

    act(() => {
      result.current.handleStartRelocate(1, 300, 400)
    })

    expect(result.current.relocatingId).toBe(1)
    expect(result.current.relocatingStart).toEqual({
      mouseX: 300,
      mouseY: 400,
      nodeX: pos.x,
      nodeY: pos.y,
    })
  })

  it('handleStartRelocate does nothing when id has no position', () => {
    const { result } = renderHook(() => useBattlefieldPositions({ entries: [], loading: false }))
    act(() => {
      result.current.handleStartRelocate(999, 0, 0)
    })
    expect(result.current.relocatingId).toBeNull()
  })

  it('getAutoCenterOffset returns null while loading', () => {
    const entries = [makeEntry(1)]
    const { result } = renderHook(() => useBattlefieldPositions({ entries, loading: true }))
    expect(result.current.getAutoCenterOffset()).toBeNull()
  })

  it('getAutoCenterOffset returns null when entries are empty', () => {
    const { result } = renderHook(() => useBattlefieldPositions({ entries: [], loading: false }))
    expect(result.current.getAutoCenterOffset()).toBeNull()
  })

  it('getAutoCenterOffset returns an offset centered on positions', () => {
    const entries = [makeEntry(1), makeEntry(2)]
    const { result } = renderHook(() => useBattlefieldPositions({ entries, loading: false }))
    const offset = result.current.getAutoCenterOffset()
    // Should return a valid Position (not null) on first call
    expect(offset).not.toBeNull()
    expect(typeof offset?.x).toBe('number')
    expect(typeof offset?.y).toBe('number')
  })

  it('getAutoCenterOffset only returns non-null once (hasAutoCenteredRef guard)', () => {
    const entries = [makeEntry(1)]
    const { result } = renderHook(() => useBattlefieldPositions({ entries, loading: false }))
    const first = result.current.getAutoCenterOffset()
    const second = result.current.getAutoCenterOffset()
    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })
})
