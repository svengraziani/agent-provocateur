import { useState, useRef, useEffect } from 'react'
import type { DashboardEntry, GameMap } from '../../types'
import { CloseIcon, RelocateIcon, ScanIcon, BuildIcon, MapIcon, FeedIcon, TimerIcon } from '../Icons'
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
  showMinimap: boolean
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
  onToggleShortcuts: () => void
  onToggleMinimap: () => void
  showShortcuts: boolean
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
  showMinimap,
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
  onToggleShortcuts,
  onToggleMinimap,
  showShortcuts,
}: BattlefieldHUDProps) {
  const [showOverflow, setShowOverflow] = useState(false)
  const [showPanelsMenu, setShowPanelsMenu] = useState(false)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const panelsRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPanelsMenu && !showToolsMenu) return
    const handler = (e: MouseEvent) => {
      if (panelsRef.current && !panelsRef.current.contains(e.target as Node)) {
        setShowPanelsMenu(false)
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPanelsMenu, showToolsMenu])

  const anyPanelActive = showFeedPanel || showTimers || showMinimap || showShortcuts
  const anyToolActive = showBadgeLibrary

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
          aria-label={loading ? 'Scanning bases' : 'Scan all bases'}
        >
          {loading ? <span className="spinning-process">&#x2699;</span> : <ScanIcon size={11} />}
          <span className="hud-label"> {loading ? 'SCANNING' : 'SCAN'}</span>
        </button>
        <button
          className={`hud-btn${isRelocateMode ? ' active' : ''}`}
          onClick={onToggleRelocate}
          title={isRelocateMode ? 'Cancel relocate' : 'Relocate a base'}
          aria-label={isRelocateMode ? 'Cancel relocate mode' : 'Relocate a base'}
          aria-pressed={isRelocateMode}
        >
          {isRelocateMode ? <CloseIcon size={10} /> : <RelocateIcon size={11} />}
          <span className="hud-label"> {isRelocateMode ? 'CANCEL' : 'RELOCATE'}</span>
        </button>

        {/* Desktop-only: MAP selector */}
        <span className="hud-zoom-sep hud-desktop-only" />
        <button
          className="hud-btn hud-desktop-only"
          onClick={onShowMapSelector}
          title="Load a map from the Map Editor"
        >
          <MapIcon size={11} /><span className="hud-label"> {activeMap ? activeMap.name : 'MAP'}</span>
        </button>
        {activeMap && (
          <button
            className="hud-btn hud-btn-icon hud-desktop-only"
            onClick={onClearMap}
            title="Clear loaded map"
          >
            <CloseIcon size={9} />
          </button>
        )}

        {/* Desktop-only: TOOLS dropdown */}
        <span className="hud-zoom-sep hud-desktop-only" />
        <div className="hud-dropdown-wrap hud-desktop-only" ref={toolsRef}>
          <button
            className="hud-btn"
            onClick={(e) => { e.stopPropagation(); setShowToolsMenu(v => !v); setShowPanelsMenu(false) }}
            title="Tools menu — Build, Badges"
            aria-label="Open tools menu"
            aria-expanded={showToolsMenu}
          >
            <BuildIcon size={11} /><span className="hud-label"> TOOLS</span>
            {anyToolActive && <span className="hud-active-dot" />}
            <span className="hud-dropdown-arrow">{showToolsMenu ? '▲' : '▼'}</span>
          </button>
          {showToolsMenu && (
            <div className="hud-dropdown-panel" onClick={(e) => e.stopPropagation()}>
              <button
                className="hud-btn hud-dropdown-item"
                onClick={() => { setShowToolsMenu(false); onShowBuildMenu() }}
                title="Build options (ClawCom, etc.)"
              >
                <BuildIcon size={11} /> BUILD
              </button>
              <button
                className={`hud-btn hud-dropdown-item${showBadgeLibrary ? ' active' : ''}`}
                onClick={() => { onToggleBadgeLibrary() }}
                title="Badge Library — place custom markers on the battlefield"
                aria-pressed={showBadgeLibrary}
              >
                ◈ BADGES
              </button>
            </div>
          )}
        </div>

        {/* Desktop-only: PANELS dropdown */}
        <div className="hud-dropdown-wrap hud-desktop-only" ref={panelsRef}>
          <button
            className="hud-btn"
            onClick={(e) => { e.stopPropagation(); setShowPanelsMenu(v => !v); setShowToolsMenu(false) }}
            title="Panels menu — Feed, Timers, Minimap, Shortcuts"
            aria-label="Open panels menu"
            aria-expanded={showPanelsMenu}
          >
            <FeedIcon size={11} /><span className="hud-label"> PANELS</span>
            {anyPanelActive && <span className="hud-active-dot" />}
            <span className="hud-dropdown-arrow">{showPanelsMenu ? '▲' : '▼'}</span>
          </button>
          {showPanelsMenu && (
            <div className="hud-dropdown-panel" onClick={(e) => e.stopPropagation()}>
              <button
                className={`hud-btn hud-dropdown-item${showFeedPanel ? ' active' : ''}`}
                onClick={onToggleFeed}
                title="Toggle Intel Feed"
                aria-pressed={showFeedPanel}
              >
                <FeedIcon size={11} /> INTEL FEED
              </button>
              <button
                className={`hud-btn hud-dropdown-item${showTimers ? ' active' : ''}`}
                onClick={onToggleTimers}
                title="Mission Timers — Deadline countdown"
                aria-pressed={showTimers}
              >
                <TimerIcon size={11} /> MISSION TIMERS
              </button>
              <button
                className={`hud-btn hud-dropdown-item${showMinimap ? ' active' : ''}`}
                onClick={onToggleMinimap}
                title={showMinimap ? 'Hide minimap' : 'Show minimap'}
                aria-pressed={showMinimap}
              >
                &#x25A1; MINIMAP
              </button>
              <button
                className={`hud-btn hud-dropdown-item${showShortcuts ? ' active' : ''}`}
                onClick={onToggleShortcuts}
                title="Keyboard Shortcuts [?]"
                aria-pressed={showShortcuts}
              >
                ⌨ KEYBOARD SHORTCUTS
              </button>
            </div>
          )}
        </div>

        <span className="hud-zoom-sep" />
        <button className="hud-btn hud-zoom-btn" onClick={onZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out [−]" aria-label="Zoom out">−</button>
        <span className="hud-zoom-level" title="Click to reset zoom [0]" onClick={onZoomReset} role="button" aria-label={`Current zoom ${Math.round(zoom * 100)}%, click to reset`}>{Math.round(zoom * 100)}%</span>
        <button className="hud-btn hud-zoom-btn" onClick={onZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in [+]" aria-label="Zoom in">+</button>

        {/* Mobile overflow menu — visible only on mobile */}
        <div className="hud-overflow-wrap hud-mobile-only">
          <button
            className={`hud-btn${showOverflow ? ' active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowOverflow(v => !v) }}
            title="More options"
            aria-label="More HUD options"
          >
            &#x22EF;
          </button>
          {showOverflow && (
            <div className="hud-overflow-panel" onClick={(e) => e.stopPropagation()}>
              <button className="hud-btn hud-overflow-item" onClick={() => { setShowOverflow(false); onShowBuildMenu() }}>
                <BuildIcon size={11} /> BUILD
              </button>
              <button className={`hud-btn hud-overflow-item${showBadgeLibrary ? ' active' : ''}`} onClick={() => { setShowOverflow(false); onToggleBadgeLibrary() }}>
                ◈ BADGES
              </button>
              <button className="hud-btn hud-overflow-item" onClick={() => { setShowOverflow(false); onShowMapSelector() }}>
                <MapIcon size={11} /> {activeMap ? activeMap.name : 'MAP'}
              </button>
              {activeMap && (
                <button className="hud-btn hud-overflow-item" onClick={() => { setShowOverflow(false); onClearMap() }}>
                  <CloseIcon size={9} /> CLEAR MAP
                </button>
              )}
              <button className={`hud-btn hud-overflow-item${showFeedPanel ? ' active' : ''}`} onClick={() => { setShowOverflow(false); onToggleFeed() }}>
                <FeedIcon size={11} /> INTEL FEED
              </button>
              <button className={`hud-btn hud-overflow-item${showTimers ? ' active' : ''}`} onClick={() => { setShowOverflow(false); onToggleTimers() }}>
                <TimerIcon size={11} /> MISSION TIMERS
              </button>
              <button className={`hud-btn hud-overflow-item${showMinimap ? ' active' : ''}`} onClick={() => { setShowOverflow(false); onToggleMinimap() }}>
                &#x25A1; MINIMAP
              </button>
              <button className={`hud-btn hud-overflow-item${showShortcuts ? ' active' : ''}`} onClick={() => { setShowOverflow(false); onToggleShortcuts() }}>
                ⌨ KEYBOARD SHORTCUTS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
