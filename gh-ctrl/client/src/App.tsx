import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useAppStore } from './store'
import { Dashboard } from './components/Dashboard'
import { Settings } from './components/Settings'
import { BattlefieldView } from './components/BattlefieldView'
import { MapEditor } from './components/MapEditor'
import { ToastArea } from './components/Toast'
import { SetupScreen } from './components/SetupScreen'
import { ConnectionSetup } from './components/ConnectionSetup'
import { api, getServerUrl } from './api'
import type { SetupStatus } from './types'

export default function App() {
  const repos = useAppStore((s) => s.repos)
  const entries = useAppStore((s) => s.entries)
  const lastRefresh = useAppStore((s) => s.lastRefresh)
  const refreshInterval = useAppStore((s) => s.refreshInterval)
  const toasts = useAppStore((s) => s.toasts)
  const loadRepos = useAppStore((s) => s.loadRepos)
  const loadDashboard = useAppStore((s) => s.loadDashboard)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [setupChecked, setSetupChecked] = useState(false)
  const [connectionChecked, setConnectionChecked] = useState(false)
  const [serverReachable, setServerReachable] = useState(false)

  const checkConnection = useCallback(async () => {
    try {
      const base = getServerUrl() ? `${getServerUrl()}/api` : '/api'
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })
      setServerReachable(res.ok)
    } catch {
      setServerReachable(false)
    }
    setConnectionChecked(true)
  }, [])

  const checkSetup = useCallback(() => {
    api.getSetupStatus().then((s) => {
      setSetupStatus(s)
      setSetupChecked(true)
    }).catch(() => {
      // If setup endpoint fails, proceed to main app
      setSetupChecked(true)
    })
  }, [])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  useEffect(() => {
    if (serverReachable) checkSetup()
  }, [serverReachable, checkSetup])

  useEffect(() => {
    if (!setupStatus?.ready) return
    loadRepos()
    loadDashboard()
    api.getVersion().then((r) => setAppVersion(r.version)).catch(() => {})
  }, [setupStatus?.ready, loadRepos, loadDashboard])

  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboard()
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [loadDashboard, refreshInterval])

  const totalStats = entries.reduce(
    (acc, e) => ({
      prs: acc.prs + e.data.stats.openPRs,
      issues: acc.issues + e.data.stats.openIssues,
      conflicts: acc.conflicts + e.data.stats.conflicts,
    }),
    { prs: 0, issues: 0, conflicts: 0 }
  )

  if (!connectionChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-2)', fontSize: '0.9rem' }}>
        Connecting…
      </div>
    )
  }

  if (!serverReachable) {
    return (
      <ConnectionSetup
        onConnected={() => {
          setServerReachable(true)
        }}
      />
    )
  }

  if (!setupChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-2)', fontSize: '0.9rem' }}>
        Checking setup…
      </div>
    )
  }

  if (setupStatus && !setupStatus.ready) {
    return <SetupScreen status={setupStatus} onRecheck={checkSetup} />
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo-transparent.png" alt="V&C Command Center" className="sidebar-logo-img" />
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
          >
            &#x25a0; Dashboard
          </NavLink>
          <NavLink
            to="/battlefield"
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
          >
            &#x25a0; Battlefield
          </NavLink>
          <NavLink
            to="/map-editor"
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
          >
            &#x25a6; Map Editor
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
          >
            &#x2699; Repositories
          </NavLink>
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

        {appVersion && (
          <div className="sidebar-version">v{appVersion}</div>
        )}
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/battlefield" element={<BattlefieldView />} />
          <Route path="/map-editor" element={<MapEditor />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <ToastArea toasts={toasts} />
    </div>
  )
}
