import { useState } from 'react'
import type { Repo } from '../types'
import { api } from '../api'

const COLORS = ['#39d353', '#58a6ff', '#f0883e', '#f85149', '#bc8cff', '#ffa657', '#ff7b72', '#79c0ff']

interface Props {
  repos: Repo[]
  onReposChange: () => void
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function Settings({ repos, onReposChange, onToast }: Props) {
  const [fullName, setFullName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState('')

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
      onToast(`Added ${fullName}`, 'success')
      setFullName('')
      onReposChange()
    } catch (err: any) {
      setFormError(err.message)
      onToast(`Failed to add: ${err.message}`, 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (repo: Repo) => {
    try {
      await api.deleteRepo(repo.id)
      onToast(`Removed ${repo.fullName}`, 'info')
      onReposChange()
    } catch (err: any) {
      onToast(`Failed to delete: ${err.message}`, 'error')
    }
  }

  return (
    <div className="settings-page">
      <div className="topbar">
        <h1>Repositories</h1>
      </div>

      <div className="settings-section">
        <h2>Add Repository</h2>
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
