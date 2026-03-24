import { useState, useRef, useCallback, useEffect } from 'react'
import type { Position } from '../components/battlefield/battlefieldConstants'
import { ISO_MAP_CENTER_X, ISO_MAP_OFFSET_Y, ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from '../components/battlefield/battlefieldConstants'

export function useBattlefieldCamera() {
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

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
