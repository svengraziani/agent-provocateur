import { useState, useEffect, useCallback } from 'react'
import type { Repo, DashboardEntry } from './types'
import { api } from './api'
import { Dashboard } from './components/Dashboard'
import { Settings } from './components/Settings'
import { BattlefieldView } from './components/BattlefieldView'
import { ToastArea, useToast } from './components/Toast'

type View = 'dashboard' | 'settings' | 'battlefield'

const DEFAULT_REFRESH_INTERVAL = 2 * 60 * 1000 // 2 minutes

function getStoredRefreshInterval(): number {
  const stored = localStorage.getItem('refreshInterval')
  return stored ? parseInt(stored, 10) : DEFAULT_REFRESH_INTERVAL
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [repos, setRepos] = useState<Repo[]>([])
  const [entries, setEntries] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshInterval, setRefreshInterval] = useState<number>(getStoredRefreshInterval)
  const { toasts, addToast } = useToast()

  const handleRefreshIntervalChange = useCallback((ms: number) => {
    localStorage.setItem('refreshInterval', String(ms))
    setRefreshInterval(ms)
  }, [])

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
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [loadDashboard, refreshInterval])

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
        <div className="sidebar-logo">
          <img src="/logo-transparent.png" alt="V&C Command Center" className="sidebar-logo-img" />
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-btn${view === 'dashboard' ? ' active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            &#x25a0; Dashboard
          </button>
          <button
            className={`nav-btn${view === 'battlefield' ? ' active' : ''}`}
            onClick={() => setView('battlefield')}
          >
            &#x25a0; Battlefield
          </button>
          <button
            className={`nav-btn${view === 'settings' ? ' active' : ''}`}
            onClick={() => setView('settings')}
          >
            &#x2699; Repositories
          </button>
          <div className="sidebar-nav-divider" />
          <a
            className="nav-btn nav-btn-feedback"
            href="mailto:?subject=Bug%20Report%3A%20Agent%20Provocateur&body=Describe%20the%20bug%20you%20encountered%3A%0A%0ASteps%20to%20reproduce%3A%0A1.%20%0A2.%20%0A3.%20%0A%0AExpected%20behavior%3A%0A%0AActual%20behavior%3A"
          >
            &#x1f41b; Report a Bug
          </a>
          <a
            className="nav-btn nav-btn-feedback"
            href="mailto:?subject=Feature%20Request%3A%20Agent%20Provocateur&body=Describe%20the%20feature%20you%27d%20like%3A%0A%0AUse%20case%2FMotivation%3A%0A%0AAdditional%20context%3A"
          >
            &#x2b50; Request a Feature
          </a>
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
        {view === 'battlefield' && (
          <BattlefieldView
            entries={entries}
            loading={loading}
            onRefresh={loadDashboard}
            onReposChange={handleReposChange}
            onToast={addToast}
          />
        )}
        {view === 'settings' && (
          <Settings
            repos={repos}
            onReposChange={handleReposChange}
            onToast={addToast}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={handleRefreshIntervalChange}
          />
        )}
      </main>

      <ToastArea toasts={toasts} />
    </div>
  )
}
