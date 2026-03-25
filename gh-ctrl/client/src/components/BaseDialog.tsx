import { useEffect, type ReactNode } from 'react'

interface BaseDialogProps {
  onClose: () => void
  className?: string
  children: ReactNode
}

/**
 * Shared dialog primitive.
 * Handles: Escape key to close, onClick/onMouseDown/wheel stopPropagation.
 */
export function BaseDialog({ onClose, className, children }: BaseDialogProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className={className}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
