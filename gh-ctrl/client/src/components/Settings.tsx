import { useState, useEffect, useRef } from 'react'
import type { Repo } from '../types'
import { api } from '../api'
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
    setActiveTab('manual')
    setFormError('')
    // Auto-submit
    setAdding(true)
    try {
      await api.addRepo(repoFullName, selectedColor)
      addToast(`Added ${repoFullName}`, 'success')
      setFullName('')
      handleReposChange()
    } catch (err: any) {
      setFormError(err.message)
      addToast(`Failed to add: ${err.message}`, 'error')
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

    if (!fullName.includes('/')) {
      setFormError('Format must be owner/repo')
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
                placeholder="owner/repo"
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
                <button className="btn btn-secondary" onClick={() => setActiveTab('manual')} type="button">
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
                  <button className="btn btn-secondary" onClick={handleLoadMore} type="button">
                    Load more
                  </button>
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
                  <div
                    className="color-swatch"
                    style={{ background: repo.color }}
                  />
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
