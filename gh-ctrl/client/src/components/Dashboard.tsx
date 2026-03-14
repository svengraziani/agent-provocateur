import type { DashboardEntry } from '../types'
import { RepoCard } from './RepoCard'

interface Props {
  entries: DashboardEntry[]
  loading: boolean
  onRefresh: () => void
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function Dashboard({ entries, loading, onRefresh, onToast }: Props) {
  const totalConflicts = entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)

  return (
    <div>
      <div className="topbar">
        <h1>Dashboard</h1>
        <button className="btn btn-ghost" onClick={onRefresh} disabled={loading}>
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
            onToast={onToast}
          />
        ))}
      </div>
    </div>
  )
}
