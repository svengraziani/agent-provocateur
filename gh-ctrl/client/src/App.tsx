import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useAppStore } from './store'
import { Settings } from './components/Settings'
import { ContactsManager } from './components/ContactsManager'
import { BattlefieldView } from './components/BattlefieldView'
import { MapEditor } from './components/MapEditor'
import { ToastArea } from './components/Toast'
import { SetupScreen } from './components/SetupScreen'
import { ConnectionSetup } from './components/ConnectionSetup'
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner'
import { api, getServerUrl, setAuthTokenProvider } from './api'
import { useAuth } from './auth/useAuth'
import { useVersionCheck } from './hooks/useVersionCheck'
import type { SetupStatus } from './types'

export default function App() {
  const repos = useAppStore((s) => s.repos)
  const entries = useAppStore((s) => s.entries)
  const lastRefresh = useAppStore((s) => s.lastRefresh)
  const refreshInterval = useAppStore((s) => s.refreshInterval)
  const toasts = useAppStore((s) => s.toasts)
  const loadRepos = useAppStore((s) => s.loadRepos)
  const loadDashboard = useAppStore((s) => s.loadDashboard)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const loadContacts = useAppStore((s) => s.loadContacts)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [setupChecked, setSetupChecked] = useState(false)
  const [connectionChecked, setConnectionChecked] = useState(false)
  const [serverReachable, setServerReachable] = useState(false)
  const versionCheck = useVersionCheck()
  const auth = useAuth()

  // Register Keycloak token provider so api.ts can attach Bearer tokens
  useEffect(() => {
    setAuthTokenProvider(() => auth.token)
  }, [auth.token])

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
    loadSettings()
    loadRepos()
    loadDashboard()
    loadContacts()
    api.getVersion().then((r) => setAppVersion(r.version)).catch(() => {})
  }, [setupStatus?.ready, loadSettings, loadRepos, loadDashboard, loadContacts])

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
    <div className={`app-layout${versionCheck.updateAvailable ? ' update-banner-visible' : ''}`}>
      {versionCheck.updateAvailable && (
        <UpdateNotificationBanner
          current={versionCheck.current}
          latest={versionCheck.latest}
          releaseName={versionCheck.releaseName}
          releaseUrl={versionCheck.releaseUrl}
          onDismiss={versionCheck.dismiss}
        />
      )}

      {/* Mobile: hamburger button to open sidebar drawer */}
      <button
        className="sidebar-hamburger"
        onClick={() => setSidebarOpen(v => !v)}
        aria-label="Toggle navigation"
      >
        &#x2630;
      </button>

      {/* Mobile: backdrop to close sidebar drawer */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/logo-transparent.png" alt="V&C Command Center" className="sidebar-logo-img" />
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">&#x25a0;</span><span className="nav-label"> Battlefield</span>
          </NavLink>
          <NavLink
            to="/map-editor"
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">&#x25a6;</span><span className="nav-label"> Map Editor</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">&#x2699;</span><span className="nav-label"> Repositories</span>
          </NavLink>
          <NavLink
            to="/contacts"
            className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <span className="nav-icon">&#x2602;</span><span className="nav-label"> Contacts</span>
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
          <div className={`sidebar-version${versionCheck.updateAvailable ? ' sidebar-version--update' : ''}`}>
            v{appVersion}
            {versionCheck.updateAvailable && (
              <span className="sidebar-update-dot" title={`Update available: ${versionCheck.latest}`} />
            )}
          </div>
        )}

        {auth.enabled && auth.user && (
          <div className="sidebar-user">
            <span className="sidebar-user-name">
              {auth.user.name ?? auth.user.username ?? auth.user.email ?? 'User'}
            </span>
            <button className="sidebar-logout-btn" onClick={auth.logout} title="Logout">
              ⏻
            </button>
          </div>
        )}
      </aside>

      <main className="main-content" onClick={() => setSidebarOpen(false)}>
        <Routes>
          <Route path="/" element={<BattlefieldView />} />
          <Route path="/map-editor" element={<MapEditor />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/contacts" element={<ContactsManager />} />
        </Routes>
      </main>

      <ToastArea toasts={toasts} />
    </div>
  )
}