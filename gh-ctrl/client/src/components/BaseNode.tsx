import { useState, useCallback, useEffect, useRef } from 'react'
import type { DashboardEntry, GHPR, GHIssue, Branch, WorkflowRun, RepoMeta } from '../types'
import { getPROrigin } from '../types'
import type { ModalState } from './ActionModal'
import { CloseIcon, LinkIcon, LabelIcon, CommentIcon, RefreshIcon, ExternalLinkIcon, AssigneeIcon, CopyIcon } from './Icons'
import { api } from '../api'
import { BranchBuilding, getBranchState } from './BranchBuilding'
import { useAppStore } from '../store'

// ── Canvas color utilities ────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ── ColorizedBuilding: canvas-based chroma-key color replacement ──────────────
// Green pixels (G dominant, high saturation) are replaced with the repo color
// while preserving the original luminance so shading/depth is maintained.

interface ColorizedBuildingProps {
  src: string
  fallback?: string
  width: number
  height: number
  color: string
}

function ColorizedBuilding({ src, fallback = src, width, height, color }: ColorizedBuildingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const pw = width * dpr
    const ph = height * dpr

    canvas.width = pw
    canvas.height = ph
    ctx.scale(dpr, dpr)

    const applyColorReplacement = (source: string) => {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const imageData = ctx.getImageData(0, 0, pw, ph)
        const d = imageData.data
        const [rr, rg, rb] = hexToRgb(color)

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
          if (a === 0) continue
          // Detect chroma-key green: green channel dominant with high saturation
          if (g > 100 && g > r * 1.4 && g > b * 1.4) {
            // Preserve relative luminance so shading / depth is maintained
            const lum = g / 255
            d[i]     = Math.round(rr * lum)
            d[i + 1] = Math.round(rg * lum)
            d[i + 2] = Math.round(rb * lum)
          }
        }

        ctx.putImageData(imageData, 0, 0)
      }
      img.onerror = () => {
        // Fallback: draw the original building without color replacement
        if (source !== fallback) applyColorReplacement(fallback)
      }
      img.src = source
    }

    applyColorReplacement(src)
  }, [src, fallback, color, width, height])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width, height }}
    />
  )
}

// ── Isometric building PNG components ─────────────────────────────────────────

function IsoBaseBuilding({ color }: { color: string }) {
  return (
    <ColorizedBuilding
      src="/buildings/kommando_chromakey.png"
      fallback="/buildings/repository_kommando.png"
      width={120}
      height={120}
      color={color}
    />
  )
}

function IsoPRBuilding() {
  return (
    <img
      src="/buildings/kaserne.png"
      width="80"
      height="80"
      style={{ display: 'block', imageRendering: 'pixelated' }}
      draggable={false}
    />
  )
}

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
  onZoomToBase: () => void
}

const PR_BUILDING_OFFSET_X = 148
const PR_BUILDING_OFFSET_Y = -5
const PR_BUILDING_COL_WIDTH = 80
const PR_BUILDING_ROW_HEIGHT = 100
const MAX_PR_BUILDINGS = 8

const BRANCH_BUILDING_OFFSET_X = -224
const BRANCH_BUILDING_OFFSET_Y = 0
const BRANCH_BUILDING_COL_WIDTH = 54
const BRANCH_BUILDING_ROW_HEIGHT = 68
const BRANCH_BUILDING_COLS = 4
const MAX_BRANCH_BUILDINGS = 12

export function BaseNode({ entry, position, isRelocateMode, isBeingRelocated, onConstruct, onStartRelocate, onRefreshRepo, onToast, onModalOpen, onZoomToBase }: Props) {
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
  const runningWorkflows = data.runningWorkflows ?? []
  const hasRunningActions = runningWorkflows.length > 0

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

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isRelocateMode) return
    e.stopPropagation()
    onZoomToBase()
  }, [isRelocateMode, onZoomToBase])

  const visiblePRs = data.prs.slice(0, MAX_PR_BUILDINGS)

  // Branch buildings: exclude default branch, sort stale first, cap at MAX_BRANCH_BUILDINGS
  const nonDefaultBranches = (data.branches ?? []).filter(b => b.name !== (data.defaultBranch ?? 'main'))
  const sortedBranches = [...nonDefaultBranches].sort((a, b) => {
    const stateOrder = { 'very-stale': 0, 'stale': 1, 'active': 2 }
    return stateOrder[getBranchState(a.committedDate)] - stateOrder[getBranchState(b.committedDate)]
  })
  const visibleBranches = sortedBranches.slice(0, MAX_BRANCH_BUILDINGS)
  const extraBranches = sortedBranches.length - visibleBranches.length

  return (
    <>
      {/* PR buildings — rendered before base so base appears on top */}
      {visiblePRs.map((pr, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        return (
          <PRBuilding
            key={pr.number}
            pr={pr}
            position={{
              x: position.x + PR_BUILDING_OFFSET_X + col * PR_BUILDING_COL_WIDTH,
              y: position.y + PR_BUILDING_OFFSET_Y + row * PR_BUILDING_ROW_HEIGHT,
            }}
            repo={repo}
            onModalOpen={onModalOpen}
          />
        )
      })}

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
        onDoubleClick={handleDoubleClick}
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
          {hasRunningActions && !hasClaudeActive && (
            <span
              className="base-beacon beacon-actions spinning-process"
              title={`${runningWorkflows.length} running action(s): ${runningWorkflows.map(r => r.workflowName).join(', ')}`}
            >
              ⚙
            </span>
          )}
        </div>

        {/* Building graphic — isometric PNG with repo-color overlay */}
        <div className="base-building">
          <IsoBaseBuilding color={repo.color || '#00ff88'} />
        </div>

        {/* Floating HUD toolbar — appears on hover */}
        <div className="base-hud">
          <div className="base-name">{repo.name}</div>
          <div className="base-stats-mini">
            <span className="bsm green" title="Open PRs">▲{stats.openPRs}</span>
            <span className="bsm blue" title="Open Issues">◆{stats.openIssues}</span>
            {stats.conflicts > 0 && <span className="bsm red" title="Conflicts"><CloseIcon size={10} />{stats.conflicts}</span>}
            {stats.needsReview > 0 && <span className="bsm amber" title="Needs Review">◎{stats.needsReview}</span>}
            {hasRunningActions && <span className="bsm cyan spinning-process" title={`${runningWorkflows.length} running action(s)`}>⚙{runningWorkflows.length}</span>}
          </div>
          {!isRelocateMode && (
            <>
              <button
                className="base-construct-btn"
                onClick={(e) => { e.stopPropagation(); onConstruct() }}
                title="Construct new issue for this base"
              >
                + CONSTRUCT
              </button>
              <button
                className="base-scan-btn"
                onClick={handleScanBase}
                disabled={scanning}
                title="Scan only this base"
              >
                {scanning ? <><RefreshIcon size={10} /> SCANNING...</> : <><RefreshIcon size={10} /> SCAN BASE</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Branch buildings — 4-column grid to the left of the base, right-aligned (fills toward the base) */}
      {visibleBranches.map((branch, i) => {
        const col = BRANCH_BUILDING_COLS - 1 - (i % BRANCH_BUILDING_COLS)
        const row = Math.floor(i / BRANCH_BUILDING_COLS)
        return (
          <BranchBuilding
            key={branch.name}
            branch={branch}
            position={{
              x: position.x + BRANCH_BUILDING_OFFSET_X + col * BRANCH_BUILDING_COL_WIDTH,
              y: position.y + BRANCH_BUILDING_OFFSET_Y + row * BRANCH_BUILDING_ROW_HEIGHT,
            }}
            repoFullName={repo.fullName}
            defaultBranch={data.defaultBranch ?? 'main'}
          />
        )
      })}
      {extraBranches > 0 && (
        <div
          className="branch-overflow-label"
          style={{
            left: position.x + BRANCH_BUILDING_OFFSET_X - 20,
            top: position.y + BRANCH_BUILDING_OFFSET_Y + Math.floor((visibleBranches.length - 1) / BRANCH_BUILDING_COLS) * BRANCH_BUILDING_ROW_HEIGHT + 10,
          }}
        >
          +{extraBranches}
        </div>
      )}

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
              assignees={pr.assignees}
              createdAt={pr.createdAt}
              headRefName={pr.headRefName}
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
              assignees={pr.assignees}
              createdAt={pr.createdAt}
              headRefName={pr.headRefName}
            />
          ))}
          {data.needsReview.length > 4 && <div className="bdp-more">+{data.needsReview.length - 4} more</div>}
        </div>
      )}

      {data.claudeIssues.length > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title claude">&#x2605; CLAUDE ISSUES</div>
          {data.claudeIssues.slice(0, 4).map((issue: GHIssue) => {
            const isActive = activeClaudeSet.has(issue.number)
            const prLink = !isActive ? (data.claudeIssuePRLinks ?? {})[issue.number] : undefined
            return (
              <BdpItemRow
                key={issue.number}
                number={issue.number}
                title={issue.title}
                type="issue"
                repo={repo}
                onModalOpen={onModalOpen}
                labels={issue.labels}
                assignees={issue.assignees}
                isClaudeActive={isActive}
                prLink={prLink}
                onPR={prLink ? () => onModalOpen({ mode: 'create-pr', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, head: prLink.head, base: prLink.base, title: prLink.title, prBody: prLink.body, issueNumber: issue.number }) : undefined}
              />
            )
          })}
          {data.claudeIssues.length > 4 && <div className="bdp-more">+{data.claudeIssues.length - 4} more</div>}
        </div>
      )}

      {(data.runningWorkflows?.length ?? 0) > 0 && (
        <div className="bdp-section">
          <div className="bdp-section-title actions">&#x2699; RUNNING ACTIONS ({data.runningWorkflows.length})</div>
          {data.runningWorkflows.map((run: WorkflowRun) => (
            <div key={run.databaseId} className="bdp-item bdp-action-run">
              <div className="bdp-item-left">
                <span className={`action-status-dot ${run.status === 'in_progress' ? 'spinning-process' : ''}`} title={run.status}>⚙</span>
                <span className="bdp-text-btn" style={{ cursor: 'default' }}>{run.workflowName}</span>
                <span className="bdp-branch-date">{run.displayTitle || run.headBranch}</span>
              </div>
              <div className="bdp-item-right">
                <a
                  href={`https://github.com/${repo.fullName}/actions/runs/${run.databaseId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bdp-icon-btn"
                  title="View action run"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLinkIcon size={11} />
                </a>
              </div>
            </div>
          ))}
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
              assignees={pr.assignees}
              createdAt={pr.createdAt}
              headRefName={pr.headRefName}
            />
          ))}
        </div>
      )}

      {remainingIssues.length > 0 && (
        <div className="bdp-section">
          <button className="bdp-toggle" onClick={() => setShowAllIssues((v) => !v)}>
            <span>{showAllIssues ? '▾' : '▸'}</span> All Issues ({remainingIssues.length}) <span className="untouched-count-badge" title="Issues with no @claude interaction">● {remainingIssues.length} untouched</span>
          </button>
          {showAllIssues && remainingIssues.slice(0, 5).map((issue: GHIssue) => {
            const isActive = activeClaudeSet.has(issue.number)
            const prLink = !isActive ? (data.claudeIssuePRLinks ?? {})[issue.number] : undefined
            return (
              <BdpItemRow
                key={issue.number}
                number={issue.number}
                title={issue.title}
                type="issue"
                repo={repo}
                onModalOpen={onModalOpen}
                labels={issue.labels}
                assignees={issue.assignees}
                isClaudeActive={isActive}
                isUntouched
                prLink={prLink}
                onPR={prLink ? () => onModalOpen({ mode: 'create-pr', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, head: prLink.head, base: prLink.base, title: prLink.title, prBody: prLink.body, issueNumber: issue.number }) : undefined}
              />
            )
          })}
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

      <div className="bdp-section bdp-meta-section">
        <RepoMetaPanel owner={repo.owner} name={repo.name} repoColor={repo.color} />
      </div>

      {data.error && (
        <div className="bdp-error">&#x26A0; {data.error}</div>
      )}
    </div>
  )
}

// ── Repo Meta Panel ───────────────────────────────────────────────────────────

function CommitSparkline({ weeks }: { weeks: number[] }) {
  if (!weeks.length) return null
  const max = Math.max(...weeks, 1)
  return (
    <div className="meta-sparkline" title="Commit activity (last 26 weeks)">
      {weeks.map((count, i) => (
        <div
          key={i}
          className="meta-spark-bar"
          style={{ height: `${Math.round((count / max) * 100)}%`, opacity: count === 0 ? 0.15 : 0.85 }}
        />
      ))}
    </div>
  )
}

function RepoMetaPanel({ owner, name, repoColor }: { owner: string; name: string; repoColor: string }) {
  const [meta, setMeta] = useState<RepoMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getRepoMeta(owner, name)
      .then((data) => { if (!cancelled) setMeta(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [owner, name])

  if (loading) {
    return (
      <div className="repo-meta-strip">
        <span className="meta-loading">⌛ loading intel…</span>
      </div>
    )
  }

  if (!meta) return null

  const topLang = meta.primaryLanguage
  const topTopics = meta.topics.slice(0, 4)
  const topContributors = meta.contributors.slice(0, 4)

  return (
    <div className="repo-meta-strip" onClick={(e) => e.stopPropagation()}>
      {/* Always-visible summary row */}
      <div className="meta-summary-row">
        {meta.stars > 0 && (
          <span className="meta-badge meta-stars" title="Stars">⭐ {meta.stars.toLocaleString()}</span>
        )}
        {topLang && (
          <span className="meta-badge meta-lang" title={`Primary language: ${topLang.name}`}>
            <span className="meta-lang-dot" style={{ background: topLang.color || repoColor }} />
            {topLang.name}
          </span>
        )}
        {meta.forks > 0 && (
          <span className="meta-badge meta-forks" title="Forks">⑂ {meta.forks}</span>
        )}
        <button
          className="meta-expand-btn"
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
          title={expanded ? 'Collapse intel' : 'Expand intel'}
        >
          {expanded ? '▾ LESS' : '▸ MORE'}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (() => {
        const hasCommits = meta.commitWeeks.length > 0
        const hasLanguages = meta.languages.length > 0
        const hasTopics = topTopics.length > 0
        const hasCrew = topContributors.length > 0
        const hasAny = hasCommits || hasLanguages || hasTopics || hasCrew
        return (
          <div className="meta-expanded">
            {!hasAny && (
              <span className="meta-no-intel">— no additional intel —</span>
            )}

            {/* Commit sparkline */}
            {hasCommits && (
              <div className="meta-row">
                <span className="meta-row-label">COMMITS</span>
                <CommitSparkline weeks={meta.commitWeeks} />
              </div>
            )}

            {/* Language breakdown */}
            {hasLanguages && (
              <div className="meta-row">
                <span className="meta-row-label">STACK</span>
                <div className="meta-lang-bar">
                  {meta.languages.slice(0, 6).map((lang) => (
                    <div
                      key={lang.name}
                      className="meta-lang-seg"
                      style={{ width: `${lang.percentage}%`, background: lang.color || '#555' }}
                      title={`${lang.name}: ${lang.percentage}%`}
                    />
                  ))}
                </div>
                <div className="meta-lang-legend">
                  {meta.languages.slice(0, 4).map((lang) => (
                    <span key={lang.name} className="meta-legend-item">
                      <span className="meta-lang-dot" style={{ background: lang.color || '#555' }} />
                      {lang.name} {lang.percentage}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Topics / tech stack */}
            {hasTopics && (
              <div className="meta-row">
                <span className="meta-row-label">TOPICS</span>
                <div className="meta-topics">
                  {topTopics.map((topic) => (
                    <span key={topic} className="meta-topic-tag">{topic}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Contributors */}
            {hasCrew && (
              <div className="meta-row">
                <span className="meta-row-label">CREW</span>
                <div className="meta-contributors">
                  {topContributors.map((c) => (
                    <a
                      key={c.login}
                      href={`https://github.com/${c.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meta-contributor"
                      title={`${c.login} (${c.contributions} commits)`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img
                        src={c.avatarUrl}
                        alt={c.login}
                        className="meta-avatar"
                        width={20}
                        height={20}
                      />
                      <span className="meta-contrib-login">{c.login}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function PRBuilding({ pr, position, repo, onModalOpen }: {
  pr: GHPR
  position: Position
  repo: DashboardEntry['repo']
  onModalOpen: (state: ModalState) => void
}) {
  const isConflict = pr.mergeable === 'CONFLICTING'
  const isChangesRequested = pr.reviewDecision === 'CHANGES_REQUESTED'
  const isApproved = pr.reviewDecision === 'APPROVED'
  const isReviewRequired = pr.reviewDecision === 'REVIEW_REQUIRED'

  const isExternal = getPROrigin(pr) === 'external'
  const prColor = isConflict || isChangesRequested
    ? 'var(--crt-red)'
    : isApproved
    ? 'var(--crt-green)'
    : isReviewRequired
    ? 'var(--crt-amber)'
    : pr.isDraft
    ? 'var(--chrome-silver)'
    : isExternal
    ? 'var(--blue)'
    : repo.color

  const statusLabel = pr.isDraft ? 'DRAFT'
    : isConflict ? 'CONFLICT'
    : isChangesRequested ? 'CHANGES'
    : isApproved ? 'APPROVED'
    : isReviewRequired ? 'REVIEW'
    : isExternal ? 'EXT'
    : 'OPEN'

  const shortTitle = pr.title.length > 14 ? pr.title.slice(0, 12) + '…' : pr.title
  const openedDate = pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : null

  return (
    <div
      className="pr-building"
      style={{
        left: position.x,
        top: position.y,
        '--pr-color': prColor,
      } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation()
        onModalOpen({ mode: 'pr-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number: pr.number })
      }}
      title={`#${pr.number} — ${pr.title}${openedDate ? ` · opened ${openedDate}` : ''}`}
    >
      <div className="pr-bld-graphic">
        <IsoPRBuilding />
      </div>
      <div className="pr-bld-info">
        <div className="pr-bld-info-row">
          <span className="pr-bld-num">#{pr.number}</span>
          <span className="pr-bld-status">{statusLabel}</span>
        </div>
        <div className="pr-bld-title">{shortTitle}</div>
        {openedDate && <div className="pr-bld-date">{openedDate}</div>}
      </div>
      {pr.previewUrl && (
        <a
          className="pr-bld-netlify"
          href={pr.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`Open Netlify preview for #${pr.number}`}
        >
          <div className="pr-bld-netlify-body">
            <div className="pr-bld-netlify-antenna" />
            <div className="pr-bld-netlify-roof" />
            <div className="pr-bld-netlify-wall">
              <div className="pr-bld-netlify-window" />
              <div className="pr-bld-netlify-door" />
            </div>
          </div>
          <div className="pr-bld-netlify-label">▲ LIVE</div>
        </a>
      )}
    </div>
  )
}

function BdpItemRow({ number, title, type, repo, onModalOpen, previewUrl, labels, assignees, isClaudeActive, isUntouched, createdAt, onPR, prLink, headRefName }: {
  number: number
  title: string
  type: 'pr' | 'issue'
  repo: DashboardEntry['repo']
  onModalOpen: (state: ModalState) => void
  previewUrl?: string | null
  labels: { name: string; color: string }[]
  assignees: { login: string }[]
  isClaudeActive?: boolean
  isUntouched?: boolean
  createdAt?: string
  onPR?: () => void
  prLink?: { head: string; base: string; title: string; body: string }
  headRefName?: string
}) {
  const addToast = useAppStore((s) => s.addToast)

  const copyBranchName = (name: string) => {
    navigator.clipboard.writeText(name).then(() => {
      addToast(`Copied: ${name}`, 'success')
    }).catch(() => {
      addToast('Failed to copy branch name', 'error')
    })
  }

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
              ? { mode: 'issue-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number, prLink }
              : { mode: 'pr-detail', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number }
          )}
          title="View details"
        >
          {title}
        </button>
      </div>
      <div className="bdp-item-right">
        {headRefName && (
          <button
            className="bdp-icon-btn"
            title={`Copy branch: ${headRefName}`}
            onClick={() => copyBranchName(headRefName)}
          >
            <CopyIcon size={11} />
          </button>
        )}
        {createdAt && (
          <span className="bdp-branch-date" title={`Opened ${new Date(createdAt).toLocaleString()}`}>
            {new Date(createdAt).toLocaleDateString()}
          </span>
        )}
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
          title="Manage assignees"
          onClick={() => onModalOpen({ mode: 'assignee', fullName: repo.fullName, owner: repo.owner, repoName: repo.name, number, type, currentAssignees: assignees.map((a) => a.login) })}
        >
          <AssigneeIcon size={12} />
        </button>
        <button
          className="bdp-icon-btn"
          title="Post comment"
          onClick={() => onModalOpen({ mode: 'comment', fullName: repo.fullName, number, type })}
        >
          <CommentIcon size={12} />
        </button>
        {onPR && (
          <button
            className="bdp-icon-btn"
            title="Create pull request"
            onClick={onPR}
          >
            PR
          </button>
        )}
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
