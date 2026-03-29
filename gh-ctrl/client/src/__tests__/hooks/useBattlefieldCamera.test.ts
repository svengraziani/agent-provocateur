import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBattlefieldCamera } from '../../hooks/useBattlefieldCamera'
import { ZOOM_MIN, ZOOM_MAX } from '../../components/battlefield/battlefieldConstants'

describe('useBattlefieldCamera', () => {
  beforeEach(() => {
    // Provide deterministic window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initialises with zoom 1', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    expect(result.current.zoom).toBe(1)
  })

  it('handleZoomIn increases zoom', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    const before = result.current.zoom
    act(() => {
      result.current.handleZoomIn()
    })
    expect(result.current.zoom).toBeGreaterThan(before)
  })

  it('handleZoomOut decreases zoom', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    act(() => {
      result.current.handleZoomIn()
    })
    const before = result.current.zoom
    act(() => {
      result.current.handleZoomOut()
    })
    expect(result.current.zoom).toBeLessThan(before)
  })

  it('handleZoomIn clamps at ZOOM_MAX', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    // Repeatedly zoom in beyond max
    for (let i = 0; i < 100; i++) {
      act(() => { result.current.handleZoomIn() })
    }
    expect(result.current.zoom).toBeLessThanOrEqual(ZOOM_MAX)
  })

  it('handleZoomOut clamps at ZOOM_MIN', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    for (let i = 0; i < 100; i++) {
      act(() => { result.current.handleZoomOut() })
    }
    expect(result.current.zoom).toBeGreaterThanOrEqual(ZOOM_MIN)
  })

  it('handleZoomReset restores zoom to 1 and centers on positions', () => {
    const { result } = renderHook(() => useBattlefieldCamera())

    // First zoom in
    act(() => { result.current.handleZoomIn() })
    expect(result.current.zoom).not.toBe(1)

    // Reset with known positions
    const positions = { 1: { x: 400, y: 300 } }
    act(() => { result.current.handleZoomReset(positions) })

    expect(result.current.zoom).toBe(1)
  })

  it('handleZoomReset with no positions uses default offset', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    act(() => { result.current.handleZoomIn() })
    act(() => { result.current.handleZoomReset({}) })
    expect(result.current.zoom).toBe(1)
  })

  it('handleZoomToBase centers camera on position and sets zoom >= 1.5', () => {
    const { result } = renderHook(() => useBattlefieldCamera())
    const pos = { x: 600, y: 400 }
    act(() => { result.current.handleZoomToBase(pos) })
    expect(result.current.zoom).toBeGreaterThanOrEqual(1.5)
    // Offset should place pos at center of screen
    expect(result.current.offset.x).toBe(window.innerWidth / 2 - pos.x * result.current.zoom)
    expect(result.current.offset.y).toBe(window.innerHeight / 2 - pos.y * result.current.zoom)
  })
})
