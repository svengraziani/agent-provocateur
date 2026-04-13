import { useState, useRef, useCallback, useEffect } from 'react'
import type { Position } from '../components/battlefield/battlefieldConstants'
import { ISO_MAP_CENTER_X, ISO_MAP_OFFSET_Y, ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from '../components/battlefield/battlefieldConstants'

export interface BattlefieldCameraOptions {
  onTap?: (clientX: number, clientY: number) => void
  onLongPress?: (clientX: number, clientY: number) => void
}

function getTouchDist(t1: Touch, t2: Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

function getTouchMid(t1: Touch, t2: Touch) {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }
}

export function useBattlefieldCamera(options?: BattlefieldCameraOptions) {
  const onTapRef = useRef(options?.onTap)
  const onLongPressRef = useRef(options?.onLongPress)
  useEffect(() => { onTapRef.current = options?.onTap }, [options?.onTap])
  useEffect(() => { onLongPressRef.current = options?.onLongPress }, [options?.onLongPress])

  const [offset, setOffset] = useState<Position>(() => ({
    x: window.innerWidth / 2 - ISO_MAP_CENTER_X,
    y: window.innerHeight / 2 - ISO_MAP_OFFSET_Y,
  }))
  const [zoom, setZoom] = useState(1)
  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })

  const zoomRef = useRef(zoom)
  const offsetRef = useRef(offset)
  const containerRef = useRef<HTMLDivElement>(null)

  // Touch state — all stored in refs so event handlers always see latest values
  const touchPanStartRef = useRef<{ touchX: number; touchY: number; offsetX: number; offsetY: number } | null>(null)
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  const touchMetaRef = useRef<{
    singleStart: { x: number; y: number; time: number; moved: boolean } | null
    twoFingerActive: boolean
    longPressTimer: ReturnType<typeof setTimeout> | null
    longPressTriggered: boolean
  }>({ singleStart: null, twoFingerActive: false, longPressTimer: null, longPressTriggered: false })

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { offsetRef.current = offset }, [offset])

  const handleWheel = useCallback((e: WheelEvent) => {
    if ((e.target as HTMLElement).closest('.modal-overlay, .map-dialog-overlay, .silo-panel, .feed-panel, [class*="dialog"]')) return
    e.preventDefault()
    const clampedDelta = Math.max(-100, Math.min(100, e.deltaY))
    const factor = Math.pow(ZOOM_FACTOR, -clampedDelta / 100)
    setZoom(prevZoom => {
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom * factor))
      const cursorX = e.clientX
      const cursorY = e.clientY
      setOffset(prevOffset => ({
        x: cursorX - (cursorX - prevOffset.x) * (newZoom / prevZoom),
        y: cursorY - (cursorY - prevOffset.y) * (newZoom / prevZoom),
      }))
      return newZoom
    })
  }, [])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.modal-overlay, .map-dialog-overlay, .silo-panel, .feed-panel, [class*="dialog"], .battlefield-hud, .minimap, .battlefield-context-menu, .battlefield-placement-banner, .battlefield-relocate-banner, .hud-overflow-panel, .mph-cancel, .battlefield-context-backdrop, .battlefield-landscape-overlay, .cnc-sidebar, .dt-panel, .base-detail-side-panel')) return
    e.preventDefault()

    const tc = touchMetaRef.current

    if (e.touches.length === 1) {
      const t = e.touches[0]
      tc.singleStart = { x: t.clientX, y: t.clientY, time: Date.now(), moved: false }
      tc.twoFingerActive = false
      touchPanStartRef.current = { touchX: t.clientX, touchY: t.clientY, offsetX: offsetRef.current.x, offsetY: offsetRef.current.y }

      if (tc.longPressTimer) clearTimeout(tc.longPressTimer)
      tc.longPressTriggered = false
      tc.longPressTimer = setTimeout(() => {
        if (tc.singleStart && !tc.singleStart.moved) {
          tc.longPressTriggered = true
          touchPanStartRef.current = null
          onLongPressRef.current?.(tc.singleStart.x, tc.singleStart.y)
        }
      }, 500)
    } else if (e.touches.length >= 2) {
      if (tc.longPressTimer) { clearTimeout(tc.longPressTimer); tc.longPressTimer = null }
      tc.singleStart = null
      tc.twoFingerActive = true
      touchPanStartRef.current = null

      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const mid = getTouchMid(t1, t2)
      pinchRef.current = { dist: getTouchDist(t1, t2), midX: mid.x, midY: mid.y }
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.modal-overlay, .map-dialog-overlay, .silo-panel, .feed-panel, [class*="dialog"], .battlefield-hud, .minimap, .battlefield-context-menu, .mph-cancel, .battlefield-context-backdrop, .battlefield-landscape-overlay, .cnc-sidebar, .dt-panel, .base-detail-side-panel')) return
    e.preventDefault()

    const tc = touchMetaRef.current

    if (e.touches.length === 1 && !tc.twoFingerActive) {
      const t = e.touches[0]
      if (tc.singleStart) {
        const dx = Math.abs(t.clientX - tc.singleStart.x)
        const dy = Math.abs(t.clientY - tc.singleStart.y)
        if (dx > 6 || dy > 6) {
          tc.singleStart.moved = true
          if (tc.longPressTimer) { clearTimeout(tc.longPressTimer); tc.longPressTimer = null }
        }
      }
      if (touchPanStartRef.current) {
        const start = touchPanStartRef.current
        setOffset({
          x: start.offsetX + (t.clientX - start.touchX),
          y: start.offsetY + (t.clientY - start.touchY),
        })
      }
    } else if (e.touches.length >= 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const newDist = getTouchDist(t1, t2)
      const newMid = getTouchMid(t1, t2)

      if (pinchRef.current) {
        const { dist: oldDist, midX: oldMidX, midY: oldMidY } = pinchRef.current
        const factor = newDist / oldDist
        setZoom(prevZoom => {
          const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom * factor))
          setOffset(prevOffset => ({
            x: newMid.x - (newMid.x - prevOffset.x) * (newZoom / prevZoom) + (newMid.x - oldMidX),
            y: newMid.y - (newMid.y - prevOffset.y) * (newZoom / prevZoom) + (newMid.y - oldMidY),
          }))
          return newZoom
        })
      }
      pinchRef.current = { dist: newDist, midX: newMid.x, midY: newMid.y }
    }
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const tc = touchMetaRef.current
    if (tc.longPressTimer) { clearTimeout(tc.longPressTimer); tc.longPressTimer = null }

    if (e.touches.length === 1) {
      // Transitioned from 2-finger to 1-finger: restart single-finger pan
      const t = e.touches[0]
      tc.twoFingerActive = false
      pinchRef.current = null
      touchPanStartRef.current = { touchX: t.clientX, touchY: t.clientY, offsetX: offsetRef.current.x, offsetY: offsetRef.current.y }
      return
    }

    if (e.touches.length === 0) {
      pinchRef.current = null
      tc.twoFingerActive = false

      // Tap detection
      if (tc.singleStart && !tc.singleStart.moved && !tc.longPressTriggered) {
        const elapsed = Date.now() - tc.singleStart.time
        if (elapsed < 350) {
          const { x, y } = tc.singleStart
          // Defer tap slightly so any setState from move handlers settle
          setTimeout(() => onTapRef.current?.(x, y), 0)
        }
      }

      tc.singleStart = null
      touchPanStartRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('touchstart', handleTouchStart, { passive: false })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    el.addEventListener('touchcancel', handleTouchEnd)
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd])

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(ZOOM_MAX, prev * ZOOM_FACTOR)
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      setOffset(prevOffset => ({
        x: cx - (cx - prevOffset.x) * (newZoom / prev),
        y: cy - (cy - prevOffset.y) * (newZoom / prev),
      }))
      return newZoom
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(ZOOM_MIN, prev / ZOOM_FACTOR)
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      setOffset(prevOffset => ({
        x: cx - (cx - prevOffset.x) * (newZoom / prev),
        y: cy - (cy - prevOffset.y) * (newZoom / prev),
      }))
      return newZoom
    })
  }, [])

  const handleZoomReset = useCallback((positions: Record<number, Position>) => {
    setZoom(1)
    const posArray = Object.values(positions).filter((p): p is Position => !!p)
    if (posArray.length > 0) {
      const minX = Math.min(...posArray.map(p => p.x))
      const maxX = Math.max(...posArray.map(p => p.x))
      const minY = Math.min(...posArray.map(p => p.y))
      const maxY = Math.max(...posArray.map(p => p.y))
      setOffset({
        x: window.innerWidth / 2 - (minX + maxX) / 2,
        y: window.innerHeight / 2 - (minY + maxY) / 2,
      })
    } else {
      setOffset({
        x: window.innerWidth / 2 - ISO_MAP_CENTER_X,
        y: window.innerHeight / 2 - ISO_MAP_OFFSET_Y,
      })
    }
  }, [])

  const handleZoomToBase = useCallback((pos: Position) => {
    const targetZoom = Math.max(1.5, ZOOM_MAX * 0.5)
    setZoom(targetZoom)
    setOffset({
      x: window.innerWidth / 2 - pos.x * targetZoom,
      y: window.innerHeight / 2 - pos.y * targetZoom,
    })
  }, [])

  return {
    offset,
    setOffset,
    zoom,
    isDraggingMap,
    setIsDraggingMap,
    dragStart,
    setDragStart,
    zoomRef,
    offsetRef,
    containerRef,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToBase,
  }
}
