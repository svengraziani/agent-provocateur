import { useState, useCallback, useEffect } from 'react'
import type { DashboardEntry } from '../types'
import { ActionModal } from './ActionModal'
import type { ModalState } from './ActionModal'

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
  onToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function BaseNode({ entry, position, isRelocateMode, isBeingRelocated, onConstruct, onStartRelocate, onToast }: Props) {
  const { repo, data } = entry
  const { stats } = data
  const [showDetail, setShowDetail] = useState(false)
  const [modalState, setModalState] = useState<ModalState>(null)

  const hasConflicts = stats.conflicts > 0
  const hasReviews = stats.needsReview > 0
  const hasClaudeActive = (data.activeClaudeIssues?.length ?? 0) > 0

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
      <ActionModal
        state={modalState}
        onClose={() => setModalState(null)}
        onSuccess={(msg) => onToast(msg, 'success')}
        onError={(msg) => onToast(msg, 'error')}
      />

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
          {stats.conflicts > 0 && <span className="bsm red" title="Conflicts">✕{stats.conflicts}</span>}
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
      </div>

      {/* Floating detail panel */}
      {showDetail && !isRelocateMode && (
        <BaseDetailPanel
          entry={entry}
          position={position}
          onClose={() => setShowDetail(false)}
          onModalOpen={setModalState}
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
  const panelX = position.x + 145
  const panelY = position.y

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const claudeIssueNums = new Set(data.claudeIssues.map(i => i.number))
  const regularIssues = data.issues.filter(i => !claudeIssueNums.has(i.number))

  const conflictNums = new Set(data.conflicts.map(p => p.number))
  const reviewNums = new Set(data.needsReview.map(p => p.number))
  const otherPRs = data.prs.filter(pr => !conflictNums.has(pr.number) && !reviewNums.has(pr.number))

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
          {repo.fullName} &#x2197;
        </a>
        <button className="bdp-close" onClick={onClose}>✕</button>
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
          {data.conflicts.slice(0, 4).map(pr => (
            <div key={pr.number} className="bdp-item">
              <span className="bdp-num">#{pr.number}</span>
              <button
                className="bdp-text-btn"
                onClick={() => onModalOpen({ mode: 'pr-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number: pr.number })}
              >
                {pr.title}
              </button>
              <a
                href={`https://github.com/${repo.fullName}/pull/${pr.number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bdp-gh-link"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
              <button
                className="bdp-claude-btn"
                onClick={() => onModalOpen({ mode: 'trigger-claude', fullName: repo.fullName, number: pr.number, type: 'pr' })}
              >
                @claude
              </button>
            </div>
          ))}
          {data.conflicts.length > 4 && <div className="bdp-more">+{data.conflicts.length - 4} more</div>}
        </div>
      )}

      {data.needsReview.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title review">&#x25cf; NEEDS REVIEW</div>
          {data.needsReview.slice(0, 4).map(pr => (
            <div key={pr.number} className="bdp-item">
              <span className="bdp-num">#{pr.number}</span>
              <button
                className="bdp-text-btn"
                onClick={() => onModalOpen({ mode: 'pr-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number: pr.number })}
              >
                {pr.title}
              </button>
              <a
                href={`https://github.com/${repo.fullName}/pull/${pr.number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bdp-gh-link"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
              <button
                className="bdp-claude-btn"
                onClick={() => onModalOpen({ mode: 'trigger-claude', fullName: repo.fullName, number: pr.number, type: 'pr' })}
              >
                @claude
              </button>
            </div>
          ))}
          {data.needsReview.length > 4 && <div className="bdp-more">+{data.needsReview.length - 4} more</div>}
        </div>
      )}

      {data.claudeIssues.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title claude">&#x2605; CLAUDE ISSUES</div>
          {data.claudeIssues.slice(0, 4).map(issue => (
            <div key={issue.number} className="bdp-item">
              <span className="bdp-num">#{issue.number}</span>
              <button
                className="bdp-text-btn"
                onClick={() => onModalOpen({ mode: 'issue-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number: issue.number })}
              >
                {issue.title}
              </button>
              <a
                href={`https://github.com/${repo.fullName}/issues/${issue.number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bdp-gh-link"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
              <button
                className="bdp-claude-btn"
                onClick={() => onModalOpen({ mode: 'trigger-claude', fullName: repo.fullName, number: issue.number, type: 'issue' })}
              >
                @claude
              </button>
            </div>
          ))}
          {data.claudeIssues.length > 4 && <div className="bdp-more">+{data.claudeIssues.length - 4} more</div>}
        </div>
      )}

      {regularIssues.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title">&#x25c6; ISSUES</div>
          {regularIssues.slice(0, 4).map(issue => (
            <div key={issue.number} className="bdp-item">
              <span className="bdp-num">#{issue.number}</span>
              <button
                className="bdp-text-btn"
                onClick={() => onModalOpen({ mode: 'issue-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number: issue.number })}
              >
                {issue.title}
              </button>
              <a
                href={`https://github.com/${repo.fullName}/issues/${issue.number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bdp-gh-link"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
              <button
                className="bdp-claude-btn"
                onClick={() => onModalOpen({ mode: 'trigger-claude', fullName: repo.fullName, number: issue.number, type: 'issue' })}
              >
                @claude
              </button>
            </div>
          ))}
          {regularIssues.length > 4 && <div className="bdp-more">+{regularIssues.length - 4} more</div>}
        </div>
      )}

      {otherPRs.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title">OPEN PRS</div>
          {otherPRs.slice(0, 4).map(pr => (
            <div key={pr.number} className="bdp-item">
              <span className="bdp-num">#{pr.number}</span>
              <button
                className="bdp-text-btn"
                onClick={() => onModalOpen({ mode: 'pr-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number: pr.number })}
              >
                {pr.title}
              </button>
              <a
                href={`https://github.com/${repo.fullName}/pull/${pr.number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bdp-gh-link"
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
              <button
                className="bdp-claude-btn"
                onClick={() => onModalOpen({ mode: 'trigger-claude', fullName: repo.fullName, number: pr.number, type: 'pr' })}
              >
                @claude
              </button>
            </div>
          ))}
          {otherPRs.length > 4 && <div className="bdp-more">+{otherPRs.length - 4} more</div>}
        </div>
      )}

      {data.error && (
        <div className="bdp-error">&#x26A0; {data.error}</div>
      )}
    </div>
  )
}
