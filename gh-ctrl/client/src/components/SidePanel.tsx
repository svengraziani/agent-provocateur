import { useEffect, useRef, type ReactNode } from 'react'

interface SidePanelProps {
  onClose: () => void
  className?: string
  children: ReactNode
}

/**
 * Shared side panel primitive.
 * Handles: Escape key to close, onClick/onMouseDown/wheel stopPropagation.
 */
export function SidePanel({ onClose, className, children }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className={className}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
