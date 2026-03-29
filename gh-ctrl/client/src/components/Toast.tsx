import { useState, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

let nextId = 0

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return { toasts, addToast }
}

export function ToastArea({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-area" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
