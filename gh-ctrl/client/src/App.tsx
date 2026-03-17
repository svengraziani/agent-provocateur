import { useState, useEffect, useCallback } from 'react'
import type { Repo, DashboardEntry } from './types'
import { api } from './api'
import { Dashboard } from './components/Dashboard'
import { Settings } from './components/Settings'
import { ToastArea, useToast } from './components/Toast'

type View = 'dashboard' | 'settings'

const REFRESH_INTERVAL = 2 * 60 * 1000 // 2 minutes

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [repos, setRepos] = useState<Repo[]>([])
  const [entries, setEntries] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const { toasts, addToast } = useToast()

  const loadRepos = useCallback(async () => {
    try {
      const data = await api.listRepos()
      setRepos(data)
    } catch (err: any) {
      addToast(`Failed to load repos: ${err.message}`, 'error')
    }
  }, [addToast])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getDashboard()
      setEntries(data)
      setLastRefresh(new Date())
    } catch (err: any) {
      addToast(`Failed to load dashboard: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadRepos()
    loadDashboard()
  }, [loadRepos, loadDashboard])

  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboard()
    }, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [loadDashboard])

  const handleReposChange = () => {
    loadRepos()
    loadDashboard()
  }

  const totalStats = entries.reduce(
    (acc, e) => ({
      prs: acc.prs + e.data.stats.openPRs,
      issues: acc.issues + e.data.stats.openIssues,
      conflicts: acc.conflicts + e.data.stats.conflicts,
    }),
    { prs: 0, issues: 0, conflicts: 0 }
  )

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">Agent Provocateur 🍆</div>

        <nav className="sidebar-nav">
          <button
            className={`nav-btn${view === 'dashboard' ? ' active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            &#x25a0; Dashboard
          </button>
          <button
            className={`nav-btn${view === 'settings' ? ' active' : ''}`}
            onClick={() => setView('settings')}
          >
            &#x2699; Repositories
          </button>
        </nav>

        <div className="sidebar-stats">
          <div className="sidebar-stat">
            <span className="label">Repos</span>
            <span className="value">{repos.length}</span>
          </div>
          <div className="sidebar-stat">
            <span className="label">Open PRs</span>
            <span className="value" style={{ color: 'var(--green)' }}>{totalStats.prs}</span>
          </div>
          <div className="sidebar-stat">
            <span className="label">Issues</span>
            <span className="value" style={{ color: 'var(--blue)' }}>{totalStats.issues}</span>
          </div>
          <div className="sidebar-stat">
            <span className="label">Conflicts</span>
            <span className="value" style={{ color: totalStats.conflicts > 0 ? 'var(--red)' : 'var(--text-2)' }}>
              {totalStats.conflicts}
            </span>
          </div>
        </div>

        <div className="sidebar-status">
          <span className="status-dot" />
          {lastRefresh
            ? `Updated ${lastRefresh.toLocaleTimeString()}`
            : 'Not refreshed yet'}
        </div>
      </aside>

      <main className="main-content">
        {view === 'dashboard' && (
          <Dashboard
            entries={entries}
            loading={loading}
            onRefresh={loadDashboard}
            onToast={addToast}
          />
        )}
        {view === 'settings' && (
          <Settings
            repos={repos}
            onReposChange={handleReposChange}
            onToast={addToast}
          />
        )}
      </main>

      <ToastArea toasts={toasts} />
    </div>
  )
}
