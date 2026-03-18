import { useState, useEffect, useCallback } from 'react'
import type { Repo, GHUserRepo } from '../types'
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
  const user = useAppStore((s) => s.user)

  const [fullName, setFullName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState('')

  // Browse repos state
  const [addTab, setAddTab] = useState<'manual' | 'browse'>('manual')
  const [browseRepos, setBrowseRepos] = useState<GHUserRepo[]>([])
  const [browsePage, setBrowsePage] = useState(1)
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseSearchInput, setBrowseSearchInput] = useState('')
  const [browseTotalCount, setBrowseTotalCount] = useState<number | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)

  const handleReposChange = () => {
    loadRepos()
    loadDashboard()
  }

  const fetchBrowseRepos = useCallback(async (page: number, search: string) => {
    setBrowseLoading(true)
    try {
      const data = await api.getUserRepos(page, search)
      setBrowseRepos(data.repos)
      setBrowseTotalCount(data.totalCount)
    } catch (err: any) {
      addToast(`Failed to load repos: ${err.message}`, 'error')
    } finally {
      setBrowseLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (addTab === 'browse' && user) {
      fetchBrowseRepos(browsePage, browseSearch)
    }
  }, [addTab, browsePage, browseSearch, user, fetchBrowseRepos])

  const handleBrowseSearch = () => {
    setBrowsePage(1)
    setBrowseSearch(browseSearchInput)
  }

  const handleSelectBrowseRepo = async (ghRepo: GHUserRepo) => {
    setAdding(true)
    try {
      await api.addRepo(ghRepo.fullName, selectedColor)
      addToast(`Added ${ghRepo.fullName}`, 'success')
      handleReposChange()
    } catch (err: any) {
      addToast(`Failed to add: ${err.message}`, 'error')
    } finally {
      setAdding(false)
    }
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

        {user && (
          <div className="add-repo-tabs">
            <button
              className={`btn btn-sm${addTab === 'manual' ? ' btn-primary' : ' btn-ghost'}`}
              onClick={() => setAddTab('manual')}
            >
              Enter manually
            </button>
            <button
              className={`btn btn-sm${addTab === 'browse' ? ' btn-primary' : ' btn-ghost'}`}
              onClick={() => setAddTab('browse')}
            >
              Browse my repos
            </button>
          </div>
        )}

        {addTab === 'manual' || !user ? (
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
        ) : (
          <div className="browse-repos">
            <div className="form-row" style={{ marginBottom: 8 }}>
              <input
                className="input"
                type="text"
                placeholder="Search repos..."
                value={browseSearchInput}
                onChange={(e) => setBrowseSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBrowseSearch()}
              />
              <button className="btn btn-primary btn-sm" onClick={handleBrowseSearch}>
                Search
              </button>
            </div>

            <div className="color-picker-row" style={{ marginBottom: 8 }}>
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

            {browseLoading ? (
              <div className="empty-state">Loading...</div>
            ) : (
              <>
                <div className="browse-repo-list">
                  {browseRepos.map((r) => {
                    const alreadyTracked = repos.some((repo) => repo.fullName === r.fullName)
                    return (
                      <div key={r.fullName} className="browse-repo-item">
                        <div className="browse-repo-info">
                          <span className="browse-repo-name">{r.fullName}</span>
                          {r.isPrivate && <span className="badge badge-private">private</span>}
                          {r.language && <span className="badge">{r.language}</span>}
                          {r.description && (
                            <span className="browse-repo-desc">{r.description}</span>
                          )}
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={adding || alreadyTracked}
                          onClick={() => handleSelectBrowseRepo(r)}
                        >
                          {alreadyTracked ? 'Tracked' : 'Add'}
                        </button>
                      </div>
                    )
                  })}
                  {browseRepos.length === 0 && (
                    <div className="empty-state">No repositories found.</div>
                  )}
                </div>

                <div className="browse-pagination">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={browsePage <= 1}
                    onClick={() => setBrowsePage((p) => p - 1)}
                  >
                    &lsaquo; Prev
                  </button>
                  <span style={{ color: 'var(--text-2)' }}>Page {browsePage}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={browseRepos.length < 30}
                    onClick={() => setBrowsePage((p) => p + 1)}
                  >
                    Next &rsaquo;
                  </button>
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
