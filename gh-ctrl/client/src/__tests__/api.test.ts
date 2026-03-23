import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getServerUrl, setServerUrl, api } from '../api'

function makeFetchMock(response: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(response),
  })
}

describe('setServerUrl / getServerUrl', () => {
  it('stores and retrieves a server URL', () => {
    setServerUrl('http://myserver:3001')
    expect(getServerUrl()).toBe('http://myserver:3001')
  })

  it('trims trailing slashes', () => {
    setServerUrl('http://myserver:3001/')
    expect(getServerUrl()).toBe('http://myserver:3001')
  })

  it('clears localStorage when given empty string', () => {
    setServerUrl('http://myserver:3001')
    setServerUrl('')
    expect(getServerUrl()).toBe('')
  })
})

describe('api.listRepos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches repos from /api/repos', async () => {
    const fetchMock = makeFetchMock([{ id: 1, fullName: 'org/repo' }])
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.listRepos()
    expect(result).toEqual([{ id: 1, fullName: 'org/repo' }])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/repos'),
      expect.any(Object)
    )
  })

  it('throws when response is not ok', async () => {
    const fetchMock = makeFetchMock({ error: 'Unauthorized' }, false, 401)
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.listRepos()).rejects.toThrow('Unauthorized')
  })
})

describe('api.addRepo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to /api/repos with fullName and color', async () => {
    const mockRepo = { id: 1, fullName: 'org/repo', color: '#00ff88' }
    const fetchMock = makeFetchMock(mockRepo)
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.addRepo('org/repo', '#00ff88')
    expect(result).toEqual(mockRepo)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/repos'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fullName: 'org/repo', color: '#00ff88' }),
      })
    )
  })
})

describe('api.updateRepo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('patches /api/repos/:id', async () => {
    const mockRepo = { id: 1, color: '#ff0000' }
    const fetchMock = makeFetchMock(mockRepo)
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.updateRepo(1, { color: '#ff0000' })
    expect(result).toEqual(mockRepo)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/repos/1'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

describe('api.deleteRepo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends DELETE to /api/repos/:id', async () => {
    const fetchMock = makeFetchMock({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.deleteRepo(1)
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/repos/1'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

describe('api.getSetupStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches setup status from /api/setup/status', async () => {
    const mockStatus = { ready: true, mode: 'local', checks: [] }
    const fetchMock = makeFetchMock(mockStatus)
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.getSetupStatus()
    expect(result).toEqual(mockStatus)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/setup/status'),
      expect.any(Object)
    )
  })
})

describe('api uses custom server URL when set', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setServerUrl('')
  })

  it('prefixes requests with serverUrl when set', async () => {
    setServerUrl('http://remote:4000')
    const fetchMock = makeFetchMock([])
    vi.stubGlobal('fetch', fetchMock)

    await api.listRepos()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://remote:4000/api/repos',
      expect.any(Object)
    )
  })
})
