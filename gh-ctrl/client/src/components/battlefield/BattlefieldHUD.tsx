import type { DashboardEntry, GameMap } from '../../types'
import { CloseIcon, RelocateIcon, ScanIcon, BuildIcon, MapIcon, FeedIcon } from '../Icons'
import { ZOOM_MIN, ZOOM_MAX } from './battlefieldConstants'

interface BattlefieldHUDProps {
  visibleEntries: DashboardEntry[]
  entries: DashboardEntry[]
  activeMapRepoIds: Set<number> | null
  totalConflicts: number
  totalRunningActions: number
  staleBranchStats: { total: number; repos: number }
  loading: boolean
  zoom: number
  isRelocateMode: boolean
  activeMap: GameMap | null
  showFeedPanel: boolean
  showBadgeLibrary: boolean
  showTimers: boolean
  onScan: () => void
  onToggleRelocate: () => void
  onShowBuildMenu: () => void
  onToggleBadgeLibrary: () => void
  onShowMapSelector: () => void
  onClearMap: () => void
  onToggleFeed: () => void
  onToggleTimers: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

export function BattlefieldHUD({
  visibleEntries,
  entries,
  activeMapRepoIds,
  totalConflicts,
  totalRunningActions,
  staleBranchStats,
  loading,
  zoom,
  isRelocateMode,
  activeMap,
  showFeedPanel,
  showBadgeLibrary,
  showTimers,
  onScan,
  onToggleRelocate,
  onShowBuildMenu,
  onToggleBadgeLibrary,
  onShowMapSelector,
  onClearMap,
  onToggleFeed,
  onToggleTimers,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: BattlefieldHUDProps) {
  return (
    <div className="battlefield-hud">
      <div className="hud-brand">
        &#x25a0;<span className="hud-label"> C&amp;C GITAGENTS</span>
      </div>
      <div className="hud-controls">
        <span className="hud-stat" title={`${visibleEntries.length} bases`}>
          &#x25a6; <strong>{visibleEntries.length}</strong>
          {activeMapRepoIds !== null && entries.length !== visibleEntries.length && <span style={{ opacity: 0.5, fontSize: 9 }}>/{entries.length}</span>}
          <span className="hud-label"> BASES</span>
        </span>
        {totalConflicts > 0 && (
          <span className="hud-stat hud-alert blink" title={`${totalConflicts} merge conflicts`}>
            &#x26a0; <strong>{totalConflicts}</strong><span className="hud-label"> CONFLICTS</span>
          </span>
        )}
        {totalRunningActions > 0 && (
          <span className="hud-stat hud-actions" title="Running GitHub Actions across all bases">
            <span className="spinning-process">&#x2699;</span> <strong>{totalRunningActions}</strong>
          </span>
        )}
        {staleBranchStats.total > 0 && (
          <span className="hud-stat hud-stale-branches" title={`${staleBranchStats.total} stale branch(es) across ${staleBranchStats.repos} repo(s)`}>
            &#x2387; <strong>{staleBranchStats.total}</strong><span className="hud-label"> STALE</span>
          </span>
        )}
        <button
          className="hud-btn"
          onClick={onScan}
          disabled={loading}
          title="Scan all bases"
        >
          {loading ? <span className="spinning-process">&#x2699;</span> : <ScanIcon size={11} />}
          <span className="hud-label"> {loading ? 'SCANNING' : 'SCAN'}</span>
        </button>
        <button
          className={`hud-btn${isRelocateMode ? ' active' : ''}`}
          onClick={onToggleRelocate}
          title={isRelocateMode ? 'Cancel relocate' : 'Relocate a base'}
        >
          {isRelocateMode ? <CloseIcon size={10} /> : <RelocateIcon size={11} />}
          <span className="hud-label"> {isRelocateMode ? 'CANCEL' : 'RELOCATE'}</span>
        </button>
        <button
          className="hud-btn"
          onClick={onShowBuildMenu}
          title="Bau Optionen (ClawCom, etc.)"
        >
          <BuildIcon size={11} /><span className="hud-label"> BUILD</span>
        </button>
        <button
          className={`hud-btn${showBadgeLibrary ? ' active' : ''}`}
          onClick={onToggleBadgeLibrary}
          title="Badge Library — place custom markers on the battlefield"
        >
          ◈<span className="hud-label"> BADGES</span>
        </button>
        <span className="hud-zoom-sep" />
        <button
          className="hud-btn"
          onClick={onShowMapSelector}
          title="Load a map from the Map Editor"
        >
          <MapIcon size={11} /><span className="hud-label"> {activeMap ? activeMap.name : 'MAP'}</span>
        </button>
        {activeMap && (
          <button
            className="hud-btn hud-btn-icon"
            onClick={onClearMap}
            title="Clear loaded map"
          >
            <CloseIcon size={9} />
          </button>
        )}
        <span className="hud-zoom-sep" />
        <button
          className={`hud-btn${showFeedPanel ? ' active' : ''}`}
          onClick={onToggleFeed}
          title="Toggle Intel Feed"
        >
          <FeedIcon size={11} /><span className="hud-label"> FEED</span>
        </button>
        <button
          className={`hud-btn${showTimers ? ' active' : ''}`}
          onClick={onToggleTimers}
          title="Mission Timers — Deadline countdown for all maps"
        >
          ⏱<span className="hud-label"> TIMERS</span>
        </button>
        <span className="hud-zoom-sep" />
        <button className="hud-btn hud-zoom-btn" onClick={onZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out">−</button>
        <span className="hud-zoom-level" title="Click to reset zoom" onClick={onZoomReset}>{Math.round(zoom * 100)}%</span>
        <button className="hud-btn hud-zoom-btn" onClick={onZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in">+</button>
      </div>
    </div>
  )
}
