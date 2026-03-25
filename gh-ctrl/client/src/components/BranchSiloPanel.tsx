import { useState, useEffect, useCallback, useRef } from 'react'
import type { DashboardEntry, Branch, GHPR } from '../types'
import { getBranchState } from './BranchBuilding'
import { api } from '../api'
import { ExternalLinkIcon } from './Icons'
import type { ModalState } from './ActionModal'

interface BranchSiloPanelProps {
  entry: DashboardEntry | null
  onClose: () => void
  addToast: (message: string, type: 'success' | 'error' | 'info') => void
  onModalOpen: (state: ModalState) => void
}

interface CompareData {
  ahead: number
  behind: number
}

function BranchRow({
  branch,
  defaultBranch,
  repoFullName,
  repoOwner,
  repoName,
  repoProvider,
  repoInstanceUrl,
  prs,
  onDelete,
  onModalOpen,
}: {
  branch: Branch
  defaultBranch: string
  repoFullName: string
  repoOwner: string
  repoName: string
  repoProvider: 'github' | 'gitlab'
  repoInstanceUrl?: string | null
  prs: GHPR[]
  onDelete: (branchName: string) => Promise<void>
  onModalOpen: (state: ModalState) => void
}) {
  const [compare, setCompare] = useState<CompareData | null>(null)
  const [compareLoading, setCompareLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  const state = getBranchState(branch.committedDate)
  const daysSince = branch.committedDate
    ? Math.floor((Date.now() - new Date(branch.committedDate).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const openPR = prs.find(pr => pr.headRefName === branch.name)
  const stateColor = state === 'very-stale' ? 'var(--crt-red)' : state === 'stale' ? 'var(--crt-amber)' : '#00d4ff'

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const req = repoProvider === 'gitlab'
        ? api.getGitLabBranchCompare(repoOwner, repoName, branch.name, defaultBranch)
        : api.getBranchCompare(repoOwner, repoName, branch.name, defaultBranch)
      req
        .then(setCompare)
        .catch(() => {})
        .finally(() => setCompareLoading(false))
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [repoOwner, repoName, branch.name, defaultBranch])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(branch.name)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div ref={rowRef} className={`silo-panel-branch silo-panel-branch-${state}`}>
      <div className="silo-panel-branch-header">
        <span className="silo-panel-branch-dot" style={{ background: stateColor }} />
        <span className="silo-panel-branch-name" title={branch.name}>
          ⎇ {branch.name.length > 26 ? branch.name.slice(0, 24) + '…' : branch.name}
        </span>
        <a
          href={`${repoProvider === 'gitlab' ? (repoInstanceUrl ?? 'https://gitlab.com') : 'https://github.com'}/${repoFullName}/-/tree/${encodeURIComponent(branch.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="silo-panel-icon-btn"
          title={`View on ${repoProvider === 'gitlab' ? 'GitLab' : 'GitHub'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLinkIcon size={11} />
        </a>
      </div>

      <div className="silo-panel-branch-meta">
        <span className="silo-panel-branch-age" title={branch.committedDate}>
          {daysSince === 0 ? 'Today' : daysSince !== null ? `${daysSince}d ago` : '—'}
        </span>
        <span className="silo-panel-branch-state" style={{ color: stateColor }}>
          {state === 'very-stale' ? '⚠ VERY STALE' : state === 'stale' ? '⚠ STALE' : '✓ ACTIVE'}
        </span>
        {compareLoading ? (
          <span className="silo-panel-compare-loading">↕ …</span>
        ) : compare ? (
          <span className="silo-panel-compare" title={`${compare.ahead} ahead / ${compare.behind} behind ${defaultBranch}`}>
            ↑{compare.ahead} ↓{compare.behind}
          </span>
        ) : null}
      </div>

      <div className="silo-panel-branch-actions">
        {openPR ? (
          <a
            href={repoProvider === 'gitlab'
              ? `${repoInstanceUrl ?? 'https://gitlab.com'}/${repoFullName}/-/merge_requests/${openPR.number}`
              : `https://github.com/${repoFullName}/pull/${openPR.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="silo-panel-pr-badge"
            title={`${repoProvider === 'gitlab' ? 'MR' : 'PR'} #${openPR.number}: ${openPR.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            {repoProvider === 'gitlab' ? 'MR' : 'PR'} #{openPR.number}
          </a>
        ) : (
          <button
            className="silo-panel-action-btn"
            onClick={() => onModalOpen({
              mode: 'create-pr',
              fullName: repoFullName,
              owner: repoOwner,
              repoName: repoName,
              head: branch.name,
              provider: repoProvider,
            })}
            title="Create PR for this branch"
          >
            + PR
          </button>
        )}

        {confirmDelete ? (
          <div className="silo-panel-confirm-row">
            <button
              className="silo-panel-action-btn silo-panel-confirm-yes"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'DELETING…' : '✓ CONFIRM'}
            </button>
            <button
              className="silo-panel-action-btn"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              CANCEL
            </button>
          </div>
        ) : (
          <button
            className="silo-panel-action-btn silo-panel-delete-btn"
            onClick={() => setConfirmDelete(true)}
            title="Delete this branch"
          >
            ✕ DELETE
          </button>
        )}
      </div>
    </div>
  )
}

export function BranchSiloPanel({ entry, onClose, addToast, onModalOpen }: BranchSiloPanelProps) {
  const [deletedBranches, setDeletedBranches] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  useEffect(() => {
    setDeletedBranches(new Set())
  }, [entry?.repo.id])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleDelete = useCallback(async (branchName: string) => {
    if (!entry) return
    const { owner, name, provider } = entry.repo
    try {
      if (provider === 'gitlab') {
        await api.deleteGitLabBranch(owner, name, branchName)
      } else {
        await api.deleteBranch(owner, name, branchName)
      }
      setDeletedBranches(prev => new Set([...prev, branchName]))
      addToast(`Branch "${branchName}" deleted`, 'success')
    } catch (err: any) {
      addToast(`Failed to delete branch: ${err.message}`, 'error')
      throw err
    }
  }, [entry, addToast])

  if (!entry) return null

  const { repo, data } = entry
  const defaultBranch = data.defaultBranch ?? 'main'
  const nonDefaultBranches = (data.branches ?? []).filter(
    b => b.name !== defaultBranch && !deletedBranches.has(b.name)
  )

  const staleCount = nonDefaultBranches.filter(b => getBranchState(b.committedDate) === 'stale').length
  const veryStaleCount = nonDefaultBranches.filter(b => getBranchState(b.committedDate) === 'very-stale').length
  const activeCount = nonDefaultBranches.length - staleCount - veryStaleCount

  return (
    <div
      ref={panelRef}
      className="silo-panel"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* C&C-style panel header */}
      <div className="silo-panel-header">
        <div className="silo-panel-header-left">
          <span className="silo-panel-icon">⎇</span>
          <div>
            <div className="silo-panel-title">BRANCH SILO</div>
            <div className="silo-panel-subtitle">{repo.name}</div>
          </div>
        </div>
        <button className="silo-panel-close" onClick={onClose} title="Close [Esc]">✕</button>
      </div>

      {/* Stats bar */}
      <div className="silo-panel-stats">
        <span className="silo-stat silo-stat-cyan" title="Active branches">
          ✓ {activeCount} ACTIVE
        </span>
        {staleCount > 0 && (
          <span className="silo-stat silo-stat-amber" title="Stale branches">
            ⚠ {staleCount} STALE
          </span>
        )}
        {veryStaleCount > 0 && (
          <span className="silo-stat silo-stat-red" title="Very stale branches">
            ⚠ {veryStaleCount} VERY STALE
          </span>
        )}
        <span className="silo-panel-base-label">vs {defaultBranch}</span>
      </div>

      {/* Branch list */}
      <div className="silo-panel-body">
        {nonDefaultBranches.length === 0 ? (
          <div className="silo-panel-empty">
            {deletedBranches.size > 0 ? '✓ All branches cleared' : 'No non-default branches'}
          </div>
        ) : (
          nonDefaultBranches.map(branch => (
            <BranchRow
              key={branch.name}
              branch={branch}
              defaultBranch={defaultBranch}
              repoFullName={repo.fullName}
              repoOwner={repo.owner}
              repoName={repo.name}
              repoProvider={repo.provider}
              repoInstanceUrl={repo.instanceUrl}
              prs={data.prs}
              onDelete={handleDelete}
              onModalOpen={onModalOpen}
            />
          ))
        )}
      </div>
    </div>
  )
}
