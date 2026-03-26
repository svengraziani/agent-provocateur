import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionSetup } from '../../components/ConnectionSetup'
import { setServerUrl } from '../../api'

describe('ConnectionSetup', () => {
  beforeEach(() => {
    setServerUrl('')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the Connect button', () => {
    render(<ConnectionSetup onConnected={() => {}} />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })

  it('renders the URL input with default value', () => {
    render(<ConnectionSetup onConnected={() => {}} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('http://localhost:3001')
  })

  it('shows the stored server URL if one is set', () => {
    setServerUrl('http://myserver:4000')
    render(<ConnectionSetup onConnected={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('http://myserver:4000')
  })

  it('disables the Connect button when input is empty', async () => {
    const user = userEvent.setup()
    render(<ConnectionSetup onConnected={() => {}} />)
    const input = screen.getByRole('textbox')
    await user.clear(input)
    expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled()
  })

  it('calls onConnected when server responds with ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const onConnected = vi.fn()
    render(<ConnectionSetup onConnected={onConnected} />)

    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalled()
    })
  })

  it('shows error message when server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    render(<ConnectionSetup onConnected={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('shows error when server responds with non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    render(<ConnectionSetup onConnected={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => {
      expect(screen.getByText(/server responded with 503/i)).toBeInTheDocument()
    })
  })

  it('shows "Connecting…" while request is in flight', async () => {
    let resolveRequest!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      new Promise((resolve) => { resolveRequest = resolve })
    ))

    render(<ConnectionSetup onConnected={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    expect(screen.getByRole('button', { name: /connecting/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled()

    resolveRequest({ ok: true })
  })

  it('connects on Enter key in the URL input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const onConnected = vi.fn()
    render(<ConnectionSetup onConnected={onConnected} />)

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalled()
    })
  })
})
