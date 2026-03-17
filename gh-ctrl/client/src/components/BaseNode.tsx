import { useState, useCallback, useEffect } from 'react'
import type { DashboardEntry, GHPR, GHIssue, Branch } from '../types'
import type { ModalState } from './ActionModal'
import { CloseIcon, LinkIcon, LabelIcon, CommentIcon, RefreshIcon, ExternalLinkIcon } from './Icons'
import { api } from '../api'

interface Position {
  x: number
  y: number
}

interface Props {
  entry: DashboardEntry
  position: Position
  isRelocateMode: boolean
  isBeingRelocated: boolean
  onConstruct: () => void
  onStartRelocate: (mouseX: number, mouseY: number) => void
  onRefreshRepo: (owner: string, name: string) => Promise<void>
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
  onModalOpen: (state: ModalState) => void
}

export function BaseNode({ entry, position, isRelocateMode, isBeingRelocated, onConstruct, onStartRelocate, onRefreshRepo, onToast, onModalOpen }: Props) {
  const { repo, data } = entry
  const { stats } = data
  const [showDetail, setShowDetail] = useState(false)
  const [scanning, setScanning] = useState(false)

  const handleScanBase = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setScanning(true)
    try {
      await onRefreshRepo(repo.owner, repo.name)
    } finally {
      setScanning(false)
    }
  }, [onRefreshRepo, repo.owner, repo.name])

  const hasConflicts = stats.conflicts > 0
  const hasReviews = stats.needsReview > 0
  const hasClaudeActive = (data.activeClaudeIssues?.length ?? 0) > 0

  // Detect PRs created by Claude (branch starts with "claude/") when no active work remains
  const claudeDonePRs = hasClaudeActive
    ? []
    : data.prs.filter((pr) => pr.headRefName?.startsWith('claude/'))

  const statusClass = hasConflicts
    ? 'base-conflict'
    : hasReviews
    ? 'base-review'
    : hasClaudeActive
    ? 'base-claude'
    : 'base-ok'

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isRelocateMode) return
    e.stopPropagation()
    onStartRelocate(e.clientX, e.clientY)
  }, [isRelocateMode, onStartRelocate])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isRelocateMode) return
    e.stopPropagation()
    setShowDetail(v => !v)
  }, [isRelocateMode])

  return (
    <>
      <div
        className={`base-node ${statusClass}${isBeingRelocated ? ' relocating' : ''}${isRelocateMode ? ' relocate-mode' : ''}`}
        style={{
          left: position.x,
          top: position.y,
          '--base-color': repo.color,
          cursor: isRelocateMode ? 'move' : 'pointer',
        } as React.CSSProperties}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {/* Status beacons */}
        <div className="base-beacons">
          {hasConflicts && (
            <span className="base-beacon beacon-conflict blink" title={`${stats.conflicts} conflict(s) — BASE UNDER ATTACK`}>
              &#x26a0;
            </span>
          )}
          {hasReviews && !hasConflicts && (
            <span className="base-beacon beacon-review" title={`${stats.needsReview} PR(s) awaiting review`}>
              &#x25cf;
            </span>
          )}
          {hasClaudeActive && (
            <span className="base-beacon beacon-claude spinning-radar" title="Claude is active on this base">
              &#x2605;
            </span>
          )}
          {claudeDonePRs.length > 0 && (
            <a
              className="beacon-claude-done"
              href={`https://github.com/${repo.fullName}/pulls?q=is%3Aopen+head%3Aclaude%2F`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Claude created ${claudeDonePRs.length} PR(s) — click to review`}
              onClick={(e) => e.stopPropagation()}
            >
              &#x2605; PR READY
            </a>
          )}
        </div>

        {/* Building graphic */}
        <div className="base-building">
          <div className="base-antenna" />
          <div className="base-tower" />
          <div className="base-wing base-wing-left" />
          <div className="base-body" />
          <div className="base-wing base-wing-right" />
          <div className="base-radar spinning-radar" />
        </div>

        {/* Base info */}
        <div className="base-name">{repo.name}</div>
        <div className="base-stats-mini">
          <span className="bsm green" title="Open PRs">▲{stats.openPRs}</span>
          <span className="bsm blue" title="Open Issues">◆{stats.openIssues}</span>
          {stats.conflicts > 0 && <span className="bsm red" title="Conflicts"><CloseIcon size={10} />{stats.conflicts}</span>}
          {stats.needsReview > 0 && <span className="bsm amber" title="Needs Review">◎{stats.needsReview}</span>}
        </div>

        {/* Construct button (shows on hover) */}
        {!isRelocateMode && (
          <button
            className="base-construct-btn"
            onClick={(e) => { e.stopPropagation(); onConstruct() }}
            title="Construct new issue for this base"
          >
            + CONSTRUCT
          </button>
        )}

        {/* Scan base button (shows on hover) */}
        {!isRelocateMode && (
          <button
            className="base-scan-btn"
            onClick={handleScanBase}
            disabled={scanning}
            title="Scan only this base"
          >
            {scanning ? <><RefreshIcon size={10} /> SCANNING...</> : <><RefreshIcon size={10} /> SCAN BASE</>}
          </button>
        )}
      </div>

      {/* Floating detail panel */}
      {showDetail && !isRelocateMode && (
        <BaseDetailPanel
          entry={entry}
          position={position}
          onClose={() => setShowDetail(false)}
          onModalOpen={onModalOpen}
        />
      )}
    </>
  )
}

function BaseDetailPanel({ entry, position, onClose, onModalOpen }: {
  entry: DashboardEntry
  position: Position
  onClose: () => void
  onModalOpen: (state: ModalState) => void
}) {
  const { repo, data } = entry
  const [showAllPRs, setShowAllPRs] = useState(false)
  const [showAllIssues, setShowAllIssues] = useState(false)
  const [showBranches, setShowBranches] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [branchesLoading, setBranchesLoading] = useState(false)
  const panelX = position.x + 145
  const panelY = position.y

  const toggleBranches = async () => {
    if (!showBranches && branches.length === 0) {
      setBranchesLoading(true)
      try {
        const result = await api.getBranches(repo.owner, repo.name)
        setBranches(result.branches)
        setDefaultBranch(result.defaultBranch)
      } catch {
        // silently fail — branches section will show empty
      } finally {
        setBranchesLoading(false)
      }
    }
    setShowBranches((v) => !v)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const activeClaudeSet = new Set(data.activeClaudeIssues ?? [])
  const conflictSet = new Set(data.conflicts.map((p) => p.number))
  const reviewSet = new Set(data.needsReview.map((p) => p.number))
  const claudeSet = new Set(data.claudeIssues.map((i) => i.number))
  const remainingPRs = data.prs.filter((p) => !conflictSet.has(p.number) && !reviewSet.has(p.number))
  const remainingIssues = data.issues.filter((i) => !claudeSet.has(i.number))

  return (
    <div
      className="base-detail-panel"
      style={{ left: panelX, top: panelY }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="bdp-header">
        <a
          href={`https://github.com/${repo.fullName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bdp-title"
        >
          {repo.fullName} <ExternalLinkIcon size={11} />
        </a>
        <button
          className="bdp-action-btn"
          onClick={() => onModalOpen({ mode: 'create-issue', fullName: repo.fullName, owner: repo.owner, repoName: repo.name })}
          title="Create new issue"
        >
          + Issue
        </button>
        <button className="bdp-close" onClick={onClose}><CloseIcon size={12} /></button>
      </div>

      <div className="bdp-stats">
        <span className="bdp-stat green">{data.stats.openPRs} PRs</span>
        <span className="bdp-stat blue">{data.stats.openIssues} Issues</span>
        <span className="bdp-stat red">{data.stats.conflicts} Conflicts</span>
        <span className="bdp-stat amber">{data.stats.needsReview} Reviews</span>
      </div>

      {data.conflicts.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title conflict">&#x26a0; CONFLICTS</div>
          {data.conflicts.slice(0, 4).map((pr: GHPR) => (
            <BdpItemRow
              key={pr.number}
              number={pr.number}
              title={pr.title}
              previewUrl={pr.previewUrl}
              type="pr"
              repo={repo}
              onModalOpen={onModalOpen}
              labels={pr.labels}
            />
          ))}
          {data.conflicts.length > 4 && <div className="bdp-more">+{data.conflicts.length - 4} more</div>}
        </div>
      )}

      {data.needsReview.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title review">&#x25cf; NEEDS REVIEW</div>
          {data.needsReview.slice(0, 4).map((pr: GHPR) => (
            <BdpItemRow
              key={pr.number}
              number={pr.number}
              title={pr.title}
              previewUrl={pr.previewUrl}
              type="pr"
              repo={repo}
              onModalOpen={onModalOpen}
              labels={pr.labels}
            />
          ))}
          {data.needsReview.length > 4 && <div className="bdp-more">+{data.needsReview.length - 4} more</div>}
        </div>
      )}

      {data.claudeIssues.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title claude">&#x2605; CLAUDE ISSUES</div>
          {data.claudeIssues.slice(0, 4).map((issue: GHIssue) => (
            <BdpItemRow
              key={issue.number}
              number={issue.number}
              title={issue.title}
              type="issue"
              repo={repo}
              onModalOpen={onModalOpen}
              labels={issue.labels}
              isClaudeActive={activeClaudeSet.has(issue.number)}
            />
          ))}
          {data.claudeIssues.length > 4 && <div className="bdp-more">+{data.claudeIssues.length - 4} more</div>}
        </div>
      )}

      {remainingPRs.length > 0 && (
        <div className="bdp-section">
          <button className="bdp-toggle" onClick={() => setShowAllPRs((v) => !v)}>
            <span>{showAllPRs ? '▾' : '▸'}</span> All PRs ({remainingPRs.length})
          </button>
          {showAllPRs && remainingPRs.slice(0, 5).map((pr: GHPR) => (
            <BdpItemRow
              key={pr.number}
              number={pr.number}
              title={pr.title}
              previewUrl={pr.previewUrl}
              type="pr"
              repo={repo}
              onModalOpen={onModalOpen}
              labels={pr.labels}
            />
          ))}
        </div>
      )}

      {remainingIssues.length > 0 && (
        <div className="bdp-section">
          <button className="bdp-toggle" onClick={() => setShowAllIssues((v) => !v)}>
            <span>{showAllIssues ? '▾' : '▸'}</span> All Issues ({remainingIssues.length}) <span className="untouched-count-badge" title="Issues with no @claude interaction">● {remainingIssues.length} untouched</span>
          </button>
          {showAllIssues && remainingIssues.slice(0, 5).map((issue: GHIssue) => (
            <BdpItemRow
              key={issue.number}
              number={issue.number}
              title={issue.title}
              type="issue"
              repo={repo}
              onModalOpen={onModalOpen}
              labels={issue.labels}
              isClaudeActive={activeClaudeSet.has(issue.number)}
              isUntouched
            />
          ))}
        </div>
      )}

      <div className="bdp-section">
        <button className="bdp-toggle" onClick={toggleBranches}>
          <span>{showBranches ? '▾' : '▸'}</span>
          {' '}&#x2387; BRANCHES {branchesLoading ? '(loading...)' : branches.length > 0 ? `(${branches.length})` : ''}
        </button>
        {showBranches && !branchesLoading && (
          branches.length === 0 ? (
            <div className="bdp-more">No branches found</div>
          ) : (
            branches.slice(0, 8).map((branch) => (
              <div key={branch.name} className="bdp-item">
                <div className="bdp-item-left">
                  <span className="branch-icon">⎇</span>
                  <span className="bdp-text-btn" style={{ cursor: 'default' }}>{branch.name}</span>
                  {branch.name === defaultBranch && (
                    <span className="bdp-branch-default">default</span>
                  )}
                </div>
                <div className="bdp-item-right">
                  {branch.committedDate && (
                    <span className="bdp-branch-date" title={branch.committedDate}>
                      {new Date(branch.committedDate).toLocaleDateString()}
                    </span>
                  )}
                  {branch.name !== defaultBranch && (
                    <button
                      className="bdp-icon-btn"
                      title="Open PR for this branch"
                      onClick={() => onModalOpen({ mode: 'create-pr', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, head: branch.name })}
                    >
                      PR
                    </button>
                  )}
                </div>
              </div>
            ))
          )
        )}
        {showBranches && !branchesLoading && branches.length > 8 && (
          <div className="bdp-more">+{branches.length - 8} more</div>
        )}
      </div>

      {data.error && (
        <div className="bdp-error">&#x26A0; {data.error}</div>
      )}
    </div>
  )
}

function BdpItemRow({ number, title, type, repo, onModalOpen, previewUrl, labels, isClaudeActive, isUntouched }: {
  number: number
  title: string
  type: 'pr' | 'issue'
  repo: DashboardEntry['repo']
  onModalOpen: (state: ModalState) => void
  previewUrl?: string | null
  labels: { name: string; color: string }[]
  isClaudeActive?: boolean
  isUntouched?: boolean
}) {
  return (
    <div className={`bdp-item${isUntouched ? ' untouched-issue' : ''}`}>
      <div className="bdp-item-left">
        <span className="bdp-num">#{number}</span>
        {isClaudeActive && (
          <span className="claude-active-indicator spinning" title="Claude is working on this">
            <RefreshIcon size={12} />
          </span>
        )}
        {isUntouched && (
          <span className="untouched-indicator" title="No @claude interaction yet">●</span>
        )}
        <button
          className="bdp-text-btn"
          onClick={() => onModalOpen(
            type === 'issue'
              ? { mode: 'issue-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number }
              : { mode: 'pr-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number }
          )}
          title="View details"
        >
          {title}
        </button>
      </div>
      <div className="bdp-item-right">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bdp-icon-btn"
            title="Open preview"
          >
            <LinkIcon size={12} />
          </a>
        )}
        <button
          className="bdp-icon-btn"
          title="Manage labels"
          onClick={() => onModalOpen({ mode: 'label', fullName: repo.fullName, number, type, currentLabels: labels.map((l) => l.name) })}
        >
          <LabelIcon size={12} />
        </button>
        <button
          className="bdp-icon-btn"
          title="Post comment"
          onClick={() => onModalOpen({ mode: 'comment', fullName: repo.fullName, number, type })}
        >
          <CommentIcon size={12} />
        </button>
        <button
          className="bdp-claude-btn"
          onClick={() => onModalOpen({ mode: 'trigger-claude', fullName: repo.fullName, number, type })}
        >
          @claude
        </button>
      </div>
    </div>
  )
}
