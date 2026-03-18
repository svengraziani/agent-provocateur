import { useAppStore } from '../store'
import { RepoCard } from './RepoCard'

export function Dashboard() {
  const entries = useAppStore((s) => s.entries)
  const loading = useAppStore((s) => s.loading)
  const loadDashboard = useAppStore((s) => s.loadDashboard)

  const totalConflicts = entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)

  return (
    <div>
      <div className="topbar">
        <h1>Dashboard</h1>
        <button className="btn btn-ghost" onClick={loadDashboard} disabled={loading}>
          <span className={loading ? 'spinning' : ''}>&#x21bb;</span>
          {loading ? ' Refreshing...' : ' Refresh'}
        </button>
      </div>

      {totalConflicts > 0 && (
        <div className="conflict-warning">
          &#x26a0; {totalConflicts} merge conflict{totalConflicts > 1 ? 's' : ''} detected across your repositories
        </div>
      )}

      {entries.length === 0 && !loading && (
        <div className="empty-state">
          <h3>No repositories added</h3>
          <p>Go to Repositories to add your first repo.</p>
        </div>
      )}

      {entries.length === 0 && loading && (
        <div className="loading">
          <span className="spinning">&#x21bb;</span> Loading dashboard...
        </div>
      )}

      <div className="cards-grid">
        {entries.map((entry) => (
          <RepoCard
            key={entry.repo.id}
            entry={entry}
          />
        ))}
      </div>
    </div>
  )
}
