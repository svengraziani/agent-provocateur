import { useRef, useEffect, useState, useCallback } from 'react'
import type { Branch } from '../types'
import { api } from '../api'

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

const STATE_COLORS: Record<BranchState, [number, number, number]> = {
  'active':     [0,   212, 255],  // #00d4ff cyan
  'stale':      [255, 170,   0],  // #ffaa00 orange
  'very-stale': [255,  68,  68],  // #ff4444 red
}

function getDaysSince(committedDate: string): number {
  if (!committedDate) return 0
  return Math.floor((Date.now() - new Date(committedDate).getTime()) / (1000 * 60 * 60 * 24))
}

const SILO_SIZE = 40

function ColorizedSilo({ state }: { state: BranchState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const pw = SILO_SIZE * dpr
    const ph = SILO_SIZE * dpr

    canvas.width = pw
    canvas.height = ph
    ctx.scale(dpr, dpr)

    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, SILO_SIZE, SILO_SIZE)
      ctx.drawImage(img, 0, 0, SILO_SIZE, SILO_SIZE)

      const imageData = ctx.getImageData(0, 0, pw, ph)
      const d = imageData.data
      const [rr, rg, rb] = STATE_COLORS[state]

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
        if (a === 0) continue
        // Chroma-key: green channel dominant
        if (g > 100 && g > r * 1.4 && g > b * 1.4) {
          const lum = g / 255
          d[i]     = Math.round(rr * lum)
          d[i + 1] = Math.round(rg * lum)
          d[i + 2] = Math.round(rb * lum)
        }
      }

      ctx.putImageData(imageData, 0, 0)
    }
    img.src = '/buildings/branch_silo.png'
  }, [state])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: SILO_SIZE, height: SILO_SIZE, imageRendering: 'pixelated' }}
    />
  )
}

interface BranchBuildingProps {
  branch: Branch
  position: { x: number; y: number }
  repoFullName: string
  defaultBranch: string
}

interface CompareData {
  ahead: number
  behind: number
}

export function BranchBuilding({ branch, position, repoFullName, defaultBranch }: BranchBuildingProps) {
  const state = getBranchState(branch.committedDate)
  const daysSince = getDaysSince(branch.committedDate)
  const commitDateStr = branch.committedDate
    ? new Date(branch.committedDate).toLocaleDateString()
    : 'unknown'

  const [compare, setCompare] = useState<CompareData | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const fetchedRef = useRef(false)

  const handleMouseEnter = useCallback(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setCompareLoading(true)
    const [owner, name] = repoFullName.split('/')
    api.getBranchCompare(owner, name, branch.name, defaultBranch)
      .then(data => setCompare(data))
      .catch(() => { /* silently ignore */ })
      .finally(() => setCompareLoading(false))
  }, [repoFullName, branch.name, defaultBranch])

  const stateLabel = state === 'very-stale'
    ? '⚠ Very stale'
    : state === 'stale'
    ? '⚠ Stale'
    : '✓ Active'

  return (
    <div
      className={`branch-building branch-building-${state}`}
      style={{ left: position.x, top: position.y }}
      onMouseEnter={handleMouseEnter}
      onClick={(e) => {
        e.stopPropagation()
        window.open(`https://github.com/${repoFullName}/tree/${encodeURIComponent(branch.name)}`, '_blank', 'noopener,noreferrer')
      }}
    >
      <div className="branch-bld-tower">
        <ColorizedSilo state={state} />
      </div>
      <div className="branch-bld-label">{branch.name.length > 10 ? branch.name.slice(0, 9) + '…' : branch.name}</div>

      <div className="branch-bld-popover">
        <div className="branch-bld-popover-name">⎇ {branch.name}</div>
        <div className="branch-bld-popover-row">
          <span className="branch-bld-popover-label">Last commit</span>
          <span className="branch-bld-popover-value">{commitDateStr}</span>
        </div>
        <div className="branch-bld-popover-row">
          <span className="branch-bld-popover-label">Age</span>
          <span className="branch-bld-popover-value">{daysSince > 0 ? `${daysSince}d ago` : 'Today'}</span>
        </div>
        <div className="branch-bld-popover-row">
          <span className="branch-bld-popover-status">{stateLabel}</span>
        </div>
        <div className="branch-bld-popover-divider" />
        {compareLoading ? (
          <div className="branch-bld-popover-row">
            <span className="branch-bld-popover-loading">Loading…</span>
          </div>
        ) : compare ? (
          <div className="branch-bld-popover-compare">
            <span className="branch-bld-popover-behind" title={`${compare.behind} commits behind ${defaultBranch}`}>
              ↓{compare.behind}
            </span>
            <span className="branch-bld-popover-sep">|</span>
            <span className="branch-bld-popover-ahead" title={`${compare.ahead} commits ahead of ${defaultBranch}`}>
              ↑{compare.ahead}
            </span>
            <span className="branch-bld-popover-base">vs {defaultBranch}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
