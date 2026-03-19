import type { Branch } from '../types'

const STALE_THRESHOLD_DAYS = 30
const VERY_STALE_THRESHOLD_DAYS = 90

export type BranchState = 'active' | 'stale' | 'very-stale'

export function getBranchState(committedDate: string): BranchState {
  if (!committedDate) return 'stale'
  const daysSince = (Date.now() - new Date(committedDate).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince > VERY_STALE_THRESHOLD_DAYS) return 'very-stale'
  if (daysSince > STALE_THRESHOLD_DAYS) return 'stale'
  return 'active'
}

function getDaysSince(committedDate: string): number {
  if (!committedDate) return 0
  return Math.floor((Date.now() - new Date(committedDate).getTime()) / (1000 * 60 * 60 * 24))
}

interface BranchBuildingProps {
  branch: Branch
  position: { x: number; y: number }
  repoFullName: string
}

export function BranchBuilding({ branch, position, repoFullName }: BranchBuildingProps) {
  const state = getBranchState(branch.committedDate)
  const daysSince = getDaysSince(branch.committedDate)
  const commitDateStr = branch.committedDate
    ? new Date(branch.committedDate).toLocaleDateString()
    : 'unknown'

  const tooltip = [
    `⎇ ${branch.name}`,
    `Last commit: ${commitDateStr}`,
    daysSince > 0 ? `${daysSince} days ago` : 'Today',
    state === 'very-stale' ? '⚠ Very stale branch' : state === 'stale' ? '⚠ Stale branch' : '✓ Active branch',
  ].join('\n')

  return (
    <div
      className={`branch-building branch-building-${state}`}
      style={{ left: position.x, top: position.y }}
      title={tooltip}
      onClick={(e) => {
        e.stopPropagation()
        window.open(`https://github.com/${repoFullName}/tree/${encodeURIComponent(branch.name)}`, '_blank', 'noopener,noreferrer')
      }}
    >
      <div className="branch-bld-tower">
        <div className="branch-bld-top" />
        <div className="branch-bld-body" />
        <div className="branch-bld-base" />
      </div>
      <div className="branch-bld-label">{branch.name.length > 10 ? branch.name.slice(0, 9) + '…' : branch.name}</div>
    </div>
  )
}
