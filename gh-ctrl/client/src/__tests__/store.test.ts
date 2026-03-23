import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '../store'

function resetStore() {
  useAppStore.setState({
    repos: [],
    entries: [],
    loading: false,
    lastRefresh: null,
    toasts: [],
    maps: [],
    buildings: [],
    badges: [],
    placedBadges: [],
  })
}

describe('toast actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('addToast adds a toast to the list', () => {
    useAppStore.getState().addToast('Hello', 'success')
    const { toasts } = useAppStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Hello')
    expect(toasts[0].type).toBe('success')
  })

  it('addToast defaults type to info', () => {
    useAppStore.getState().addToast('Info message')
    const { toasts } = useAppStore.getState()
    expect(toasts[0].type).toBe('info')
  })

  it('addToast assigns unique ids to multiple toasts', () => {
    useAppStore.getState().addToast('First')
    useAppStore.getState().addToast('Second')
    const { toasts } = useAppStore.getState()
    expect(toasts).toHaveLength(2)
    expect(toasts[0].id).not.toBe(toasts[1].id)
  })

  it('removeToast removes a specific toast', () => {
    useAppStore.getState().addToast('One')
    useAppStore.getState().addToast('Two')
    const id = useAppStore.getState().toasts[0].id
    useAppStore.getState().removeToast(id)
    const { toasts } = useAppStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Two')
  })

  it('toast auto-dismisses after 3500ms', () => {
    useAppStore.getState().addToast('Temporary')
    expect(useAppStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(3500)
    expect(useAppStore.getState().toasts).toHaveLength(0)
  })
})

describe('loadRepos', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sets repos on success', async () => {
    const mockRepos = [{ id: 1, fullName: 'org/repo', owner: 'org', name: 'repo', color: '#00ff88' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRepos),
    }))

    await useAppStore.getState().loadRepos()
    expect(useAppStore.getState().repos).toEqual(mockRepos)
  })

  it('adds error toast on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.resolve({ error: 'Server Error' }),
    }))

    await useAppStore.getState().loadRepos()
    vi.advanceTimersByTime(100)

    const { toasts } = useAppStore.getState()
    expect(toasts.some((t) => t.type === 'error')).toBe(true)
    expect(toasts.some((t) => t.message.includes('Failed to load repos'))).toBe(true)
  })
})

describe('updateRepoColor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
    useAppStore.setState({
      repos: [{ id: 1, fullName: 'org/repo', owner: 'org', name: 'repo', color: '#000000', createdAt: new Date(), description: null }],
      entries: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('updates repo color in state on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, color: '#ff0000' }),
    }))

    await useAppStore.getState().updateRepoColor(1, '#ff0000')
    const repo = useAppStore.getState().repos.find((r) => r.id === 1)
    expect(repo?.color).toBe('#ff0000')
  })

  it('adds error toast on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
      json: () => Promise.resolve({ error: 'Failed' }),
    }))

    await useAppStore.getState().updateRepoColor(1, '#ff0000')
    vi.advanceTimersByTime(100)
    const { toasts } = useAppStore.getState()
    expect(toasts.some((t) => t.type === 'error')).toBe(true)
  })
})

describe('handleRefreshIntervalChange', () => {
  beforeEach(resetStore)

  it('updates refreshInterval in state and localStorage', () => {
    useAppStore.getState().handleRefreshIntervalChange(60_000)
    expect(useAppStore.getState().refreshInterval).toBe(60_000)
    expect(localStorage.getItem('refreshInterval')).toBe('60000')
  })
})
