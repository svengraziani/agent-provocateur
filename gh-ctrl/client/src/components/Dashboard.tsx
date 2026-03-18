import { useAppStore } from '../store'
import { RepoCard } from './RepoCard'
import type { Repo } from '../types'

function RepoCardSkeleton({ repo }: { repo: Repo }) {
  return (
    <div className="repo-card repo-card-skeleton">
      <div className="card-color-bar" style={{ background: repo.color }} />
      <div className="card-body">
        <div className="card-header">
          <div>
            <div className="card-repo-name">{repo.name}</div>
            <div className="skeleton-line" style={{ width: 120, marginTop: 6 }} />
          </div>
          <span className="spinning" style={{ opacity: 0.4, fontSize: 14 }}>&#x21bb;</span>
        </div>
        <div className="skeleton-line" style={{ width: '70%', marginTop: 12 }} />
        <div className="skeleton-line" style={{ width: '50%', marginTop: 8 }} />
      </div>
    </div>
  )
}

export function Dashboard() {
  const repos = useAppStore((s) => s.repos)
  const entries = useAppStore((s) => s.entries)
  const loading = useAppStore((s) => s.loading)
  const loadDashboard = useAppStore((s) => s.loadDashboard)

  const totalConflicts = entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)
  const loadedFullNames = new Set(entries.map((e) => e.repo.fullName))
  const pendingRepos = loading ? repos.filter((r) => !loadedFullNames.has(r.fullName)) : []

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

      {repos.length === 0 && !loading && (
        <div className="empty-state">
          <h3>No repositories added</h3>
          <p>Go to Repositories to add your first repo.</p>
        </div>
      )}

      {repos.length === 0 && loading && (
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
        {pendingRepos.map((repo) => (
          <RepoCardSkeleton key={repo.id} repo={repo} />
        ))}
      </div>
    </div>
  )
}
