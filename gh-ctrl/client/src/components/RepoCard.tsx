import { useState } from 'react'
import type { DashboardEntry, GHPR, GHIssue } from '../types'
import { api } from '../api'
import { ActionModal } from './ActionModal'
import type { ModalState } from './ActionModal'

interface Props {
  entry: DashboardEntry
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function RepoCard({ entry, onToast }: Props) {
  const { repo, data } = entry
  const { stats } = data
  const [modalState, setModalState] = useState<ModalState>(null)
  const [showAllPRs, setShowAllPRs] = useState(false)
  const [showAllIssues, setShowAllIssues] = useState(false)
  const [showBranches, setShowBranches] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [branchesLoading, setBranchesLoading] = useState(false)

  const hasConflicts = stats.conflicts > 0

  const openTriggerClaude = (number: number, type: 'pr' | 'issue') => {
    setModalState({ mode: 'trigger-claude', fullName: repo.fullName, number, type })
  }

  const openComment = (number: number, type: 'pr' | 'issue') => {
    setModalState({ mode: 'comment', fullName: repo.fullName, number, type })
  }

  const openLabel = (number: number, type: 'pr' | 'issue', currentLabels: string[]) => {
    setModalState({ mode: 'label', fullName: repo.fullName, number, type, currentLabels })
  }

  const openCreatePR = (head: string) => {
    setModalState({ mode: 'create-pr', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, head })
  }

  const openCreateIssue = () => {
    setModalState({ mode: 'create-issue', fullName: repo.fullName, owner: repo.owner, repoName: repo.name })
  }

  const openIssueDetail = (number: number) => {
    setModalState({ mode: 'issue-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number })
  }

  const toggleBranches = async () => {
    if (!showBranches && branches.length === 0) {
      setBranchesLoading(true)
      try {
        const result = await api.getBranches(repo.owner, repo.name)
        setBranches(result.branches)
        setDefaultBranch(result.defaultBranch)
      } catch (err: any) {
        onToast(`Failed to load branches: ${err.message}`, 'error')
      } finally {
        setBranchesLoading(false)
      }
    }
    setShowBranches((v) => !v)
  }

  const conflictSet = new Set(data.conflicts.map((p) => p.number))
  const reviewSet = new Set(data.needsReview.map((p) => p.number))
  const claudeSet = new Set(data.claudeIssues.map((i) => i.number))
  const activeClaudeSet = new Set(data.activeClaudeIssues ?? [])

  const remainingPRs = data.prs.filter((p) => !conflictSet.has(p.number) && !reviewSet.has(p.number))
  const remainingIssues = data.issues.filter((i) => !claudeSet.has(i.number))

  return (
    <>
      <ActionModal
        state={modalState}
        onClose={() => setModalState(null)}
        onSuccess={(msg) => onToast(msg, 'success')}
        onError={(msg) => onToast(msg, 'error')}
      />

      <div className={`repo-card${hasConflicts ? ' has-conflicts' : ''}`}>
        <div className="card-color-bar" style={{ background: repo.color }} />
        <div className="card-body">
          <div className="card-header">
            <div>
              <div className="card-repo-name">{repo.name}</div>
              <div className="card-repo-full">{repo.fullName}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={openCreateIssue} title="Create new issue">
              + Issue
            </button>
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
                <ItemRow
                  key={pr.number}
                  number={pr.number}
                  title={pr.title}
                  labels={pr.labels.map((l) => l.name)}
                  badge={<span className="badge badge-conflict">Conflict</span>}
                  onClaude={() => openTriggerClaude(pr.number, 'pr')}
                  onComment={() => openComment(pr.number, 'pr')}
                  onLabel={() => openLabel(pr.number, 'pr', pr.labels.map((l) => l.name))}
                />
              ))}
            </div>
          )}

          {data.needsReview.length > 0 && (
            <div className="card-section">
              <div className="card-section-title review">Needs Review</div>
              {data.needsReview.map((pr: GHPR) => (
                <ItemRow
                  key={pr.number}
                  number={pr.number}
                  title={pr.title}
                  labels={pr.labels.map((l) => l.name)}
                  badge={<span className="badge badge-review">Review</span>}
                  onClaude={() => openTriggerClaude(pr.number, 'pr')}
                  onComment={() => openComment(pr.number, 'pr')}
                  onLabel={() => openLabel(pr.number, 'pr', pr.labels.map((l) => l.name))}
                />
              ))}
            </div>
          )}

          {data.claudeIssues.length > 0 && (
            <div className="card-section">
              <div className="card-section-title claude">Claude Issues</div>
              {data.claudeIssues.map((issue: GHIssue) => (
                <ItemRow
                  key={issue.number}
                  number={issue.number}
                  title={issue.title}
                  labels={issue.labels.map((l) => l.name)}
                  isClaudeActive={activeClaudeSet.has(issue.number)}
                  onClaude={() => openTriggerClaude(issue.number, 'issue')}
                  onComment={() => openComment(issue.number, 'issue')}
                  onLabel={() => openLabel(issue.number, 'issue', issue.labels.map((l) => l.name))}
                  onDetail={() => openIssueDetail(issue.number)}
                />
              ))}
            </div>
          )}

          {remainingPRs.length > 0 && (
            <div className="card-section">
              <button className="section-toggle" onClick={() => setShowAllPRs((v) => !v)}>
                <span>{showAllPRs ? '▾' : '▸'}</span>
                All PRs ({remainingPRs.length} more)
              </button>
              {showAllPRs && remainingPRs.map((pr: GHPR) => (
                <ItemRow
                  key={pr.number}
                  number={pr.number}
                  title={pr.title}
                  labels={pr.labels.map((l) => l.name)}
                  badge={pr.isDraft ? <span className="badge badge-draft">Draft</span> : pr.reviewDecision === 'APPROVED' ? <span className="badge badge-approved">Approved</span> : undefined}
                  onClaude={() => openTriggerClaude(pr.number, 'pr')}
                  onComment={() => openComment(pr.number, 'pr')}
                  onLabel={() => openLabel(pr.number, 'pr', pr.labels.map((l) => l.name))}
                />
              ))}
            </div>
          )}

          {remainingIssues.length > 0 && (
            <div className="card-section">
              <button className="section-toggle" onClick={() => setShowAllIssues((v) => !v)}>
                <span>{showAllIssues ? '▾' : '▸'}</span>
                All Issues ({remainingIssues.length} more)
              </button>
              {showAllIssues && remainingIssues.map((issue: GHIssue) => (
                <ItemRow
                  key={issue.number}
                  number={issue.number}
                  title={issue.title}
                  labels={issue.labels.map((l) => l.name)}
                  isClaudeActive={activeClaudeSet.has(issue.number)}
                  onClaude={() => openTriggerClaude(issue.number, 'issue')}
                  onComment={() => openComment(issue.number, 'issue')}
                  onLabel={() => openLabel(issue.number, 'issue', issue.labels.map((l) => l.name))}
                  onDetail={() => openIssueDetail(issue.number)}
                />
              ))}
            </div>
          )}

          <div className="card-section">
            <button className="section-toggle" onClick={toggleBranches}>
              <span>{showBranches ? '▾' : '▸'}</span>
              Branches {branchesLoading ? '(loading...)' : branches.length > 0 ? `(${branches.length})` : ''}
            </button>
            {showBranches && !branchesLoading && (
              branches.length === 0 ? (
                <div className="no-items">No branches found</div>
              ) : (
                branches.map((branch) => (
                  <div key={branch} className="list-item">
                    <div className="list-item-left">
                      <span className="branch-icon">⎇</span>
                      <span className="list-item-title">{branch}</span>
                      {branch === defaultBranch && (
                        <span className="badge badge-default">default</span>
                      )}
                    </div>
                    <div className="list-item-right">
                      {branch !== defaultBranch && (
                        <button
                          className="btn btn-ghost btn-sm item-claude-btn"
                          onClick={() => openCreatePR(branch)}
                        >
                          Open PR
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ItemRow({
  number, title, labels, badge, isClaudeActive, onClaude, onComment, onLabel, onDetail,
}: {
  number: number
  title: string
  labels: string[]
  badge?: React.ReactNode
  isClaudeActive?: boolean
  onClaude: () => void
  onComment: () => void
  onLabel: () => void
  onDetail?: () => void
}) {
  return (
    <div className="list-item">
      <div className="list-item-left">
        <span className="list-item-number">#{number}</span>
        {isClaudeActive && (
          <span className="claude-active-indicator spinning" title="Claude is working on this">⟳</span>
        )}
        {onDetail ? (
          <button className="list-item-title list-item-title-btn" onClick={onDetail} title="View details">
            {title}
          </button>
        ) : (
          <span className="list-item-title">{title}</span>
        )}
        {labels.map((l) => (
          <span key={l} className="inline-label">{l}</span>
        ))}
      </div>
      <div className="list-item-right">
        {badge}
        <button className="btn btn-ghost btn-xs item-claude-btn" onClick={onLabel} title="Manage labels">
          &#x1F3F7;
        </button>
        <button className="btn btn-ghost btn-xs item-claude-btn" onClick={onComment} title="Post comment">
          &#x1F4AC;
        </button>
        <button className="btn btn-claude item-claude-btn" onClick={onClaude}>
          @claude
        </button>
      </div>
    </div>
  )
}
