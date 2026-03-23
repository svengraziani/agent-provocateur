import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ToastArea, useToast } from '../../components/Toast'

describe('ToastArea', () => {
  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<ToastArea toasts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a single toast with message', () => {
    const toasts = [{ id: 1, message: 'Hello world', type: 'success' as const }]
    render(<ToastArea toasts={toasts} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('applies the correct CSS class for toast type', () => {
    const toasts = [
      { id: 1, message: 'Success msg', type: 'success' as const },
      { id: 2, message: 'Error msg', type: 'error' as const },
      { id: 3, message: 'Info msg', type: 'info' as const },
    ]
    const { container } = render(<ToastArea toasts={toasts} />)
    const toastEls = container.querySelectorAll('.toast')
    expect(toastEls[0].classList.contains('success')).toBe(true)
    expect(toastEls[1].classList.contains('error')).toBe(true)
    expect(toastEls[2].classList.contains('info')).toBe(true)
  })

  it('renders multiple toasts', () => {
    const toasts = [
      { id: 1, message: 'First toast', type: 'info' as const },
      { id: 2, message: 'Second toast', type: 'success' as const },
    ]
    render(<ToastArea toasts={toasts} />)
    expect(screen.getByText('First toast')).toBeInTheDocument()
    expect(screen.getByText('Second toast')).toBeInTheDocument()
  })
})

describe('useToast hook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with empty toasts', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toasts).toHaveLength(0)
  })

  it('addToast adds a toast', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.addToast('Test message', 'success')
    })
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Test message')
    expect(result.current.toasts[0].type).toBe('success')
  })

  it('addToast defaults type to info', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.addToast('Info toast')
    })
    expect(result.current.toasts[0].type).toBe('info')
  })

  it('toast auto-dismisses after 3500ms', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.addToast('Auto dismiss')
    })
    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('multiple toasts get unique IDs', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.addToast('First')
      result.current.addToast('Second')
    })
    const ids = result.current.toasts.map((t) => t.id)
    expect(new Set(ids).size).toBe(2)
  })
})
