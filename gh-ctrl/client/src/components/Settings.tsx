import { useState, useEffect, useRef } from 'react'
import type { Repo } from '../types'
import { api, getServerUrl, setServerUrl } from '../api'
import { useAppStore } from '../store'

const COLORS = ['#39d353', '#58a6ff', '#f0883e', '#f85149', '#bc8cff', '#ffa657', '#ff7b72', '#79c0ff']

const REFRESH_OPTIONS = [
  { label: '30 seconds', value: 30 * 1000 },
  { label: '1 minute', value: 60 * 1000 },
  { label: '2 minutes', value: 2 * 60 * 1000 },
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '10 minutes', value: 10 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
]

export function Settings() {
  const repos = useAppStore((s) => s.repos)
  const refreshInterval = useAppStore((s) => s.refreshInterval)
  const addToast = useAppStore((s) => s.addToast)
  const loadRepos = useAppStore((s) => s.loadRepos)
  const loadDashboard = useAppStore((s) => s.loadDashboard)
  const handleRefreshIntervalChange = useAppStore((s) => s.handleRefreshIntervalChange)
  const updateRepoColor = useAppStore((s) => s.updateRepoColor)
  const [openColorPicker, setOpenColorPicker] = useState<number | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl())
  const [testingConn, setTestingConn] = useState(false)
  const [connStatus, setConnStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [connError, setConnError] = useState('')

  const handleSaveServerUrl = async () => {
    setTestingConn(true)
    setConnStatus('idle')
    setConnError('')
    const base = serverUrlInput.trim().replace(/\/$/, '')
    try {
      const url = base ? `${base}/api/health` : '/api/health'
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      setServerUrl(base)
      setConnStatus('ok')
      addToast('Server URL saved — reload to apply', 'success')
    } catch (err: any) {
      setConnError(err.message || 'Could not reach server')
      setConnStatus('error')
    } finally {
      setTestingConn(false)
    }
  }

  useEffect(() => {
    if (openColorPicker === null) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenColorPicker(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openColorPicker])

  const [fullName, setFullName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState('')

  // Browse tab state
  const [activeTab, setActiveTab] = useState<'manual' | 'browse'>('browse')
  const [browseRepos, setBrowseRepos] = useState<{ name: string; fullName: string; description: string | null; isPrivate: boolean }[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [browseSearch, setBrowseSearch] = useState('')
  const [browsePage, setBrowsePage] = useState(1)
  const [browseHasMore, setBrowseHasMore] = useState(true)
  const [ghAvailable, setGhAvailable] = useState(true)
  const [browseTruncated, setBrowseTruncated] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PER_PAGE = 30

  const fetchBrowseRepos = async (page: number, search: string) => {
    setBrowseLoading(true)
    setBrowseError('')
    try {
      const result = await api.getUserRepos({ page, per_page: PER_PAGE, search: search || undefined })
      if (!result.ghAvailable) {
        setGhAvailable(false)
        setBrowseError('GitHub CLI (gh) is not available or not authenticated.')
        return
      }
      setGhAvailable(true)
      if (page === 1) {
        setBrowseRepos(result.repos)
      } else {
        setBrowseRepos((prev) => [...prev, ...result.repos])
      }
      setBrowseHasMore(result.repos.length === PER_PAGE)
      setBrowseTruncated(result.truncated ?? false)
    } catch (err: any) {
      setBrowseError(err.message || 'Failed to load repos')
      setGhAvailable(false)
    } finally {
      setBrowseLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'browse') {
      setBrowsePage(1)
      setBrowseRepos([])
      fetchBrowseRepos(1, browseSearch)
    }
  }, [activeTab])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  const handleBrowseSearchChange = (value: string) => {
    setBrowseSearch(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setBrowsePage(1)
      setBrowseRepos([])
      fetchBrowseRepos(1, value)
    }, 400)
  }

  const handleLoadMore = () => {
    const nextPage = browsePage + 1
    setBrowsePage(nextPage)
    fetchBrowseRepos(nextPage, browseSearch)
  }

  const handleSelectBrowseRepo = async (repoFullName: string) => {
    setFullName(repoFullName)
    setFormError('')
    setAdding(true)
    try {
      await api.addRepo(repoFullName, selectedColor)
      addToast(`Added ${repoFullName}`, 'success')
      setFullName('')
      handleReposChange()
    } catch (err: any) {
      setFormError(err.message)
      addToast(`Failed to add: ${err.message}`, 'error')
      setActiveTab('manual')
    } finally {
      setAdding(false)
    }
  }

  const handleReposChange = () => {
    loadRepos()
    loadDashboard()
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!fullName.trim()) {
      setFormError('Enter owner/repo or a GitHub URL')
      return
    }

    setAdding(true)
    try {
      await api.addRepo(fullName.trim(), selectedColor)
      addToast(`Added ${fullName}`, 'success')
      setFullName('')
      handleReposChange()
    } catch (err: any) {
      setFormError(err.message)
      addToast(`Failed to add: ${err.message}`, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (repo: Repo) => {
    try {
      await api.deleteRepo(repo.id)
      addToast(`Removed ${repo.fullName}`, 'info')
      handleReposChange()
    } catch (err: any) {
      addToast(`Failed to delete: ${err.message}`, 'error')
    }
  }

  return (
    <div className="settings-page">
      <div className="topbar">
        <h1>Repositories</h1>
      </div>

      <div className="settings-section">
        <h2>Server Connection</h2>
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Set the server URL when using this app as a PWA or Chrome Extension. Leave blank for Directory mode (same host).
        </p>
        <div className="form-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            <input
              className="input"
              type="url"
              placeholder="http://localhost:3001  (leave blank for local)"
              value={serverUrlInput}
              onChange={(e) => { setServerUrlInput(e.target.value); setConnStatus('idle') }}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveServerUrl()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSaveServerUrl}
              disabled={testingConn}
              style={{ whiteSpace: 'nowrap' }}
            >
              {testingConn ? 'Testing…' : 'Save'}
            </button>
          </div>
          {connStatus === 'ok' && (
            <span style={{ color: 'var(--green)', fontSize: '0.82rem' }}>Connected successfully</span>
          )}
          {connStatus === 'error' && (
            <span className="form-error">{connError}</span>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h2>Preferences</h2>
        <div className="form-row">
          <label className="color-picker-label" htmlFor="refresh-interval">Auto-refresh interval:</label>
          <select
            id="refresh-interval"
            className="input"
            value={refreshInterval}
            onChange={(e) => handleRefreshIntervalChange(parseInt(e.target.value, 10))}
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h2>Add Repository</h2>
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === 'browse' ? ' active' : ''}`}
            onClick={() => setActiveTab('browse')}
            type="button"
          >
            Browse my repos
          </button>
          <button
            className={`tab-btn${activeTab === 'manual' ? ' active' : ''}`}
            onClick={() => setActiveTab('manual')}
            type="button"
          >
            Manual
          </button>
        </div>

        {activeTab === 'manual' && (
          <form className="add-repo-form" onSubmit={handleAdd}>
            <div className="form-row">
              <input
                className="input"
                type="text"
                placeholder="owner/repo or GitHub URL"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={adding}>
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
            <div className="color-picker-row">
              <span className="color-picker-label">Color:</span>
              {COLORS.map((c) => (
                <div
                  key={c}
                  className={`color-swatch${selectedColor === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            {formError && <div className="form-error">{formError}</div>}
          </form>
        )}

        {activeTab === 'browse' && (
          <div className="browse-repos">
            {!ghAvailable ? (
              <div className="browse-fallback">
                <p className="form-error">GitHub CLI (gh) not available. Use manual input instead.</p>
                <button className="btn btn-ghost" onClick={() => setActiveTab('manual')} type="button">
                  Switch to manual input
                </button>
              </div>
            ) : (
              <>
                <div className="form-row" style={{ marginBottom: '0.75rem' }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Search repositories..."
                    value={browseSearch}
                    onChange={(e) => handleBrowseSearchChange(e.target.value)}
                  />
                </div>
                {browseError && !browseLoading && <div className="form-error">{browseError}</div>}
                {!browseLoading && browseSearch && browseTruncated && (
                  <div className="browse-truncated-note">Showing top 100 matches — refine your search for more specific results.</div>
                )}
                <div className="browse-repo-list">
                  {browseRepos.map((repo) => (
                    <button
                      key={repo.fullName}
                      className="browse-repo-item"
                      onClick={() => handleSelectBrowseRepo(repo.fullName)}
                      type="button"
                      disabled={adding}
                    >
                      <div className="browse-repo-info">
                        <span className="browse-repo-name">{repo.fullName}</span>
                        {repo.isPrivate && <span className="browse-repo-badge">private</span>}
                        {repo.description && (
                          <span className="browse-repo-desc">{repo.description}</span>
                        )}
                      </div>
                      <span className="browse-repo-add">+ Add</span>
                    </button>
                  ))}
                  {browseLoading && (
                    <div className="browse-loading">Loading...</div>
                  )}
                  {!browseLoading && browseRepos.length === 0 && !browseError && (
                    <div className="empty-state"><p>No repositories found.</p></div>
                  )}
                </div>
                {!browseLoading && browseHasMore && browseRepos.length > 0 && !browseSearch && (
                  <div className="browse-load-more">
                    <button className="btn btn-ghost" onClick={handleLoadMore} type="button">
                      Load more
                    </button>
                  </div>
                )}
                <div className="color-picker-row" style={{ marginTop: '0.75rem' }}>
                  <span className="color-picker-label">Color:</span>
                  {COLORS.map((c) => (
                    <div
                      key={c}
                      className={`color-swatch${selectedColor === c ? ' active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setSelectedColor(c)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h2>Tracked Repositories ({repos.length})</h2>
        {repos.length === 0 ? (
          <div className="empty-state">
            <p>No repositories tracked yet.</p>
          </div>
        ) : (
          <div className="repo-list-settings">
            {repos.map((repo) => (
              <div key={repo.id} className="repo-list-item">
                <div className="repo-list-item-info">
                  <div style={{ position: 'relative' }}>
                    <div
                      className="color-swatch"
                      style={{ background: repo.color, cursor: 'pointer' }}
                      title="Change color"
                      onClick={() => setOpenColorPicker(openColorPicker === repo.id ? null : repo.id)}
                    />
                    {openColorPicker === repo.id && (
                      <div ref={popoverRef} className="color-picker-popover" style={{
                        position: 'absolute',
                        top: '20px',
                        left: 0,
                        zIndex: 100,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {COLORS.map((c) => (
                            <div
                              key={c}
                              className={`color-swatch${repo.color === c ? ' active' : ''}`}
                              style={{ background: c, cursor: 'pointer' }}
                              onClick={() => {
                                updateRepoColor(repo.id, c)
                                setOpenColorPicker(null)
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="color-picker-label">Custom:</span>
                          <input
                            type="color"
                            className="color-picker-input"
                            defaultValue={repo.color}
                            style={{ width: '48px', height: '24px', cursor: 'pointer' }}
                            onChange={(e) => updateRepoColor(repo.id, e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <span>{repo.fullName}</span>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(repo)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
