import type { DashboardEntry, GHPR, GHIssue } from '../types'
import { api } from '../api'

interface Props {
  entry: DashboardEntry
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function RepoCard({ entry, onToast }: Props) {
  const { repo, data } = entry
  const { stats } = data

  const handleTriggerClaude = async (number: number, type: 'pr' | 'issue') => {
    try {
      await api.triggerClaude({ fullName: repo.fullName, number, type })
      onToast(`@claude triggered on #${number}`, 'success')
    } catch (err: any) {
      onToast(`Failed: ${err.message}`, 'error')
    }
  }

  const hasConflicts = stats.conflicts > 0

  return (
    <div className={`repo-card${hasConflicts ? ' has-conflicts' : ''}`}>
      <div className="card-color-bar" style={{ background: repo.color }} />
      <div className="card-body">
        <div className="card-header">
          <div>
            <div className="card-repo-name">{repo.name}</div>
            <div className="card-repo-full">{repo.fullName}</div>
          </div>
        </div>

        {data.error && (
          <div className="card-error">{data.error}</div>
        )}

        <div className="stats-row">
          <div className="stat-cell green">
            <span className="stat-value">{stats.openPRs}</span>
            <span className="stat-label">PRs</span>
          </div>
          <div className="stat-cell blue">
            <span className="stat-value">{stats.openIssues}</span>
            <span className="stat-label">Issues</span>
          </div>
          <div className="stat-cell red">
            <span className="stat-value">{stats.conflicts}</span>
            <span className="stat-label">Conflicts</span>
          </div>
          <div className="stat-cell amber">
            <span className="stat-value">{stats.needsReview}</span>
            <span className="stat-label">Reviews</span>
          </div>
        </div>

        {data.conflicts.length > 0 && (
          <div className="card-section">
            <div className="card-section-title conflicts">Conflicts</div>
            {data.conflicts.map((pr: GHPR) => (
              <div key={pr.number} className="list-item">
                <div className="list-item-left">
                  <span className="list-item-number">#{pr.number}</span>
                  <span className="list-item-title">{pr.title}</span>
                </div>
                <div className="list-item-right">
                  <span className="badge badge-conflict">Conflict</span>
                  <button
                    className="btn btn-claude item-claude-btn"
                    onClick={() => handleTriggerClaude(pr.number, 'pr')}
                  >
                    @claude
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.needsReview.length > 0 && (
          <div className="card-section">
            <div className="card-section-title review">Needs Review</div>
            {data.needsReview.map((pr: GHPR) => (
              <div key={pr.number} className="list-item">
                <div className="list-item-left">
                  <span className="list-item-number">#{pr.number}</span>
                  <span className="list-item-title">{pr.title}</span>
                </div>
                <div className="list-item-right">
                  <span className="badge badge-review">Review</span>
                  <button
                    className="btn btn-claude item-claude-btn"
                    onClick={() => handleTriggerClaude(pr.number, 'pr')}
                  >
                    @claude
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.claudeIssues.length > 0 && (
          <div className="card-section">
            <div className="card-section-title claude">Claude Issues</div>
            {data.claudeIssues.map((issue: GHIssue) => (
              <div key={issue.number} className="list-item">
                <div className="list-item-left">
                  <span className="list-item-number">#{issue.number}</span>
                  <span className="list-item-title">{issue.title}</span>
                </div>
                <div className="list-item-right">
                  <button
                    className="btn btn-claude item-claude-btn"
                    onClick={() => handleTriggerClaude(issue.number, 'issue')}
                  >
                    @claude
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
