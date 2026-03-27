import { useState, useRef, useCallback, useEffect } from 'react'
import type { DashboardEntry, GameMap, Badge } from '../types'
import { BranchSiloPanel } from './BranchSiloPanel'
import { SidePanel } from './SidePanel'
import { api } from '../api'
import { getServerUrl } from '../api'
import { getBranchState } from './BranchBuilding'
import { BaseDetailPanel } from './BaseNode'
import { ActionModal } from './ActionModal'
import type { ModalState } from './ActionModal'
import { ConstructDialog } from './ConstructDialog'
import { FeedPanel } from './FeedPanel'
import { useSound } from '../hooks/useSound'
import { useAppStore } from '../store'
import { BuildOptionsMenu } from './BuildOptionsMenu'
import type { PlacementParams } from './BuildOptionsMenu'
import { BadgeLibraryDialog } from './BadgeLibraryDialog'
import { DeadlineTimers } from './DeadlineTimers'

import { BattlefieldHUD } from './battlefield/BattlefieldHUD'
import { BattlefieldMapLayer } from './battlefield/BattlefieldMapLayer'
import { BattlefieldMinimap } from './battlefield/BattlefieldMinimap'
import { LoadBattlefieldMapDialog } from './battlefield/LoadBattlefieldMapDialog'
import { useBattlefieldCamera } from '../hooks/useBattlefieldCamera'
import { useBattlefieldPositions } from '../hooks/useBattlefieldPositions'
import { useBattlefieldDraggables } from '../hooks/useBattlefieldDraggables'
import type { Position } from './battlefield/battlefieldConstants'
import { savePositions, loadActiveMapId, saveActiveMapId } from './battlefield/battlefieldStorage'

export function BattlefieldView() {
  const repos = useAppStore((s) => s.repos)
  const entries = useAppStore((s) => s.entries)
  const loading = useAppStore((s) => s.loading)
  const onRefresh = useAppStore((s) => s.loadDashboard)
  const onRefreshRepo = useAppStore((s) => s.loadSingleRepo)
  const addToast = useAppStore((s) => s.addToast)
  const loadRepos = useAppStore((s) => s.loadRepos)
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  const storeBuildings = useAppStore((s) => s.buildings)
  const updateBuildingPosition = useAppStore((s) => s.updateBuildingPosition)
  const loadBadges = useAppStore((s) => s.loadBadges)
  const loadPlacedBadges = useAppStore((s) => s.loadPlacedBadges)
  const placedBadges = useAppStore((s) => s.placedBadges)
  const storePlaceBadge = useAppStore((s) => s.placeBadge)
  const updatePlacedBadgePosition = useAppStore((s) => s.updatePlacedBadgePosition)
  // Camera: zoom, pan, wheel zoom
  const camera = useBattlefieldCamera()
  const { offset, setOffset, zoom, isDraggingMap, setIsDraggingMap, dragStart, setDragStart, zoomRef, offsetRef, containerRef, handleZoomIn, handleZoomOut, handleZoomReset, handleZoomToBase } = camera

  // Base node positions
  const posState = useBattlefieldPositions({ entries, loading })
  const { positions, setPositions, relocatingId, setRelocatingId, relocatingStart, setRelocatingStart, handleStartRelocate, getAutoCenterOffset } = posState

  // Building and badge dragging
  const draggables = useBattlefieldDraggables({ storeBuildings, placedBadges, updateBuildingPosition, updatePlacedBadgePosition })
  const { buildingPositions, setBuildingPositions, relocatingBuildingId, setRelocatingBuildingId, relocatingBuildingStart, setRelocatingBuildingStart, badgePositions, setBadgePositions, relocatingBadgeId, setRelocatingBadgeId, relocatingBadgeStart, setRelocatingBadgeStart, handleStartBuildingRelocate, handleStartBadgeRelocate, commitBuildingRelocate, commitBadgeRelocate } = draggables

  const [constructTarget, setConstructTarget] = useState<DashboardEntry | null>(null)
  const [isRelocateMode, setIsRelocateMode] = useState(false)
  const [modalState, setModalState] = useState<ModalState>(null)
  const [activeMap, setActiveMap] = useState<GameMap | null>(null)
  const [allMaps, setAllMaps] = useState<GameMap[]>([])
  const [showMapSelector, setShowMapSelector] = useState(false)
  const [activeMapRepoIds, setActiveMapRepoIds] = useState<Set<number> | null>(null)
  const [showFeedPanel, setShowFeedPanel] = useState(false)
  const [branchSiloEntry, setBranchSiloEntry] = useState<DashboardEntry | null>(null)
  const [detailEntry, setDetailEntry] = useState<DashboardEntry | null>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null)
  const [constructingBuildingIds, setConstructingBuildingIds] = useState<Set<number>>(new Set())
  const [constructingRepoIds, setConstructingRepoIds] = useState<Set<number>>(new Set())
  const [showBuildMenu, setShowBuildMenu] = useState(false)
  const [placementMode, setPlacementMode] = useState<PlacementParams | null>(null)
  const [ghostScreenPos, setGhostScreenPos] = useState<Position>({ x: 0, y: 0 })
  const [showBadgeLibrary, setShowBadgeLibrary] = useState(false)
  const [showTimers, setShowTimers] = useState(false)
  const [placingBadge, setPlacingBadge] = useState<Badge | null>(null)

  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { play } = useSound()

  const prevLoadingRef = useRef(loading)
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      play('refreshed')
    }
    prevLoadingRef.current = loading
  }, [loading, play])

  const prevConflictsRef = useRef(0)
  useEffect(() => {
    if (prevConflictsRef.current === 0 && entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0) > 0) {
      play('glass_poop')
    }
    prevConflictsRef.current = entries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)
  }, [entries, play])

  useEffect(() => { loadBuildings() }, [loadBuildings])
  useEffect(() => { loadBadges(); loadPlacedBadges() }, [loadBadges, loadPlacedBadges])

  // Load persisted active map on mount
  useEffect(() => {
    const savedId = loadActiveMapId()
    if (savedId !== null) {
      api.getMap(savedId).then(setActiveMap).catch(() => saveActiveMapId(null))
    }
  }, [])

  // Load assigned repos whenever activeMap changes
  useEffect(() => {
    if (!activeMap) {
      setActiveMapRepoIds(null)
      return
    }
    api.getMapRepos(activeMap.id)
      .then((repos) => setActiveMapRepoIds(new Set(repos.map((r) => r.id))))
      .catch(() => setActiveMapRepoIds(null))
  }, [activeMap])

  // Load all maps when selector opens
  useEffect(() => {
    if (showMapSelector) {
      api.listMaps().then(setAllMaps).catch(() => {})
    }
  }, [showMapSelector])

  useEffect(() => {
    return () => {
      if (autoScanTimerRef.current !== null) clearTimeout(autoScanTimerRef.current)
    }
  }, [])

  // Auto-center after initial load
  useEffect(() => {
    const newOffset = getAutoCenterOffset()
    if (newOffset) setOffset(newOffset)
  }, [loading, entries, positions])

  const handleIssueCreated = useCallback((owner: string, repoName: string) => {
    if (autoScanTimerRef.current !== null) clearTimeout(autoScanTimerRef.current)
    addToast('Base scan scheduled in 15 seconds...', 'info')
    autoScanTimerRef.current = setTimeout(() => {
      autoScanTimerRef.current = null
      onRefreshRepo(owner, repoName)
    }, 15000)
  }, [onRefreshRepo, addToast])

  const handleLoadMap = useCallback((map: GameMap) => {
    setActiveMap(map)
    saveActiveMapId(map.id)
  }, [])

  const handleClearMap = useCallback(() => {
    setActiveMap(null)
    saveActiveMapId(null)
  }, [])

  const handleMapMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cnc-sidebar')) return
    if (placementMode) return
    if (placingBadge) return
    if ((e.target as HTMLElement).closest('.base-node')) return
    if (isRelocateMode) return
    setIsDraggingMap(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }, [offset, isRelocateMode, placementMode, placingBadge, setIsDraggingMap, setDragStart])

  const handleMapClick = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.cnc-sidebar')) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mapX = (e.clientX - rect.left - offsetRef.current.x) / zoomRef.current
    const mapY = (e.clientY - rect.top - offsetRef.current.y) / zoomRef.current

    if (placingBadge) {
      try {
        await storePlaceBadge({ badgeId: placingBadge.id, posX: mapX, posY: mapY })
        addToast(`Badge "${placingBadge.name}" placed!`, 'success')
      } catch (err: any) {
        addToast(`Failed to place badge: ${err.message}`, 'error')
      }
      setPlacingBadge(null)
      return
    }

    if (!placementMode) return
    if (placementMode.repoId !== undefined) {
      const repoId = placementMode.repoId
      setPositions((prev) => {
        const next = { ...prev, [repoId]: { x: mapX, y: mapY } }
        savePositions(next)
        return next
      })
      if (activeMap) {
        try {
          await api.assignRepoToMap(activeMap.id, repoId)
          const mapRepos = await api.getMapRepos(activeMap.id)
          setActiveMapRepoIds(new Set(mapRepos.map((r) => r.id)))
        } catch {
          // map assignment failed — repo still placed
        }
      }
      setConstructingRepoIds((prev) => new Set(prev).add(repoId))
      setTimeout(() => {
        setConstructingRepoIds((prev) => {
          const next = new Set(prev)
          next.delete(repoId)
          return next
        })
      }, 4000)
      addToast(`${placementMode.name} placed on the map!`, 'success')
      loadRepos()
      onRefresh()
    } else {
      try {
        const newBuilding = await api.createBuilding({ type: placementMode.type, name: placementMode.name, color: placementMode.color, posX: mapX, posY: mapY })
        await loadBuildings()
        setConstructingBuildingIds((prev) => new Set(prev).add(newBuilding.id))
        setTimeout(() => {
          setConstructingBuildingIds((prev) => {
            const next = new Set(prev)
            next.delete(newBuilding.id)
            return next
          })
        }, 3000)
        addToast(`${placementMode.name} placed!`, 'success')
      } catch (err: any) {
        addToast(`Build failed: ${err.message}`, 'error')
      }
    }
    setPlacementMode(null)
  }, [placementMode, placingBadge, loadBuildings, addToast, storePlaceBadge, loadRepos, onRefresh, activeMap, setPositions, containerRef, offsetRef, zoomRef])

  const handleMapMouseMove = useCallback((e: React.MouseEvent) => {
    if (placementMode) {
      setGhostScreenPos({ x: e.clientX, y: e.clientY })
      return
    }
    if (isDraggingMap) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    } else if (relocatingId !== null && relocatingStart !== null) {
      const dx = (e.clientX - relocatingStart.mouseX) / zoomRef.current
      const dy = (e.clientY - relocatingStart.mouseY) / zoomRef.current
      setPositions(prev => ({
        ...prev,
        [relocatingId]: {
          x: relocatingStart.nodeX + dx,
          y: relocatingStart.nodeY + dy,
        },
      }))
    } else if (relocatingBuildingId !== null && relocatingBuildingStart !== null) {
      const dx = (e.clientX - relocatingBuildingStart.mouseX) / zoomRef.current
      const dy = (e.clientY - relocatingBuildingStart.mouseY) / zoomRef.current
      setBuildingPositions(prev => ({
        ...prev,
        [relocatingBuildingId]: {
          x: relocatingBuildingStart.nodeX + dx,
          y: relocatingBuildingStart.nodeY + dy,
        },
      }))
    } else if (relocatingBadgeId !== null && relocatingBadgeStart !== null) {
      const dx = (e.clientX - relocatingBadgeStart.mouseX) / zoomRef.current
      const dy = (e.clientY - relocatingBadgeStart.mouseY) / zoomRef.current
      setBadgePositions(prev => ({
        ...prev,
        [relocatingBadgeId]: {
          x: relocatingBadgeStart.nodeX + dx,
          y: relocatingBadgeStart.nodeY + dy,
        },
      }))
    }
  }, [isDraggingMap, dragStart, relocatingId, relocatingStart, relocatingBuildingId, relocatingBuildingStart, relocatingBadgeId, relocatingBadgeStart, placementMode, setOffset, setPositions, setBuildingPositions, setBadgePositions, zoomRef])

  const handleMapMouseUp = useCallback(() => {
    setIsDraggingMap(false)
    if (relocatingId !== null) {
      setPositions(prev => {
        savePositions(prev)
        return prev
      })
      setRelocatingId(null)
      setRelocatingStart(null)
    }
    commitBuildingRelocate()
    commitBadgeRelocate()
  }, [relocatingId, commitBuildingRelocate, commitBadgeRelocate, setIsDraggingMap, setPositions, setRelocatingId, setRelocatingStart])

  useEffect(() => {
    if (!placementMode && !placingBadge) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacementMode(null)
        setPlacingBadge(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placementMode, placingBadge])

  useEffect(() => {
    if (!placementMode) return
    const onMove = (e: MouseEvent) => setGhostScreenPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [placementMode])

  const visibleEntries = activeMapRepoIds === null
    ? entries
    : entries.filter((e) => activeMapRepoIds.has(e.repo.id))

  const totalConflicts = visibleEntries.reduce((sum, e) => sum + e.data.stats.conflicts, 0)
  const totalRunningActions = visibleEntries.reduce((sum, e) => sum + (e.data.stats.runningActions ?? 0), 0)
  const loadedFullNames = new Set(entries.map((e) => e.repo.fullName))
  const pendingRepos = loading ? repos.filter((r) => !loadedFullNames.has(r.fullName)) : []

  const staleBranchStats = visibleEntries.reduce((acc, e) => {
    const defaultBranch = e.data.defaultBranch ?? 'main'
    const nonDefault = (e.data.branches ?? []).filter(b => b.name !== defaultBranch)
    const stale = nonDefault.filter(b => getBranchState(b.committedDate) === 'stale' || getBranchState(b.committedDate) === 'very-stale')
    if (stale.length > 0) acc.repos++
    acc.total += stale.length
    return acc
  }, { total: 0, repos: 0 })

  return (
    <div
      className="battlefield-container"
      onMouseDown={handleMapMouseDown}
      onMouseMove={handleMapMouseMove}
      onMouseUp={handleMapMouseUp}
      onMouseLeave={handleMapMouseUp}
      onClick={handleMapClick}
      ref={containerRef}
      style={{ cursor: (placementMode || placingBadge) ? 'crosshair' : isDraggingMap ? 'grabbing' : (isRelocateMode ? 'crosshair' : 'grab') }}
    >
      <div className="battlefield-scanlines" />

      <BattlefieldHUD
        visibleEntries={visibleEntries}
        entries={entries}
        activeMapRepoIds={activeMapRepoIds}
        totalConflicts={totalConflicts}
        totalRunningActions={totalRunningActions}
        staleBranchStats={staleBranchStats}
        loading={loading}
        zoom={zoom}
        isRelocateMode={isRelocateMode}
        activeMap={activeMap}
        showFeedPanel={showFeedPanel}
        showBadgeLibrary={showBadgeLibrary}
        showTimers={showTimers}
        onScan={() => { play('peep'); onRefresh() }}
        onToggleRelocate={() => { play('hydraulic'); setIsRelocateMode(v => !v); setRelocatingId(null); setRelocatingStart(null) }}
        onShowBuildMenu={() => { play('hydraulic'); setShowBuildMenu(true) }}
        onToggleBadgeLibrary={() => { play('peep'); setShowBadgeLibrary(true) }}
        onShowMapSelector={() => setShowMapSelector(true)}
        onClearMap={handleClearMap}
        onToggleFeed={() => { play('peep'); setShowFeedPanel(v => !v); setBranchSiloEntry(null); setDetailEntry(null); setSelectedBuildingId(null) }}
        onToggleTimers={() => { play('peep'); setShowTimers(v => !v) }}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={() => handleZoomReset(positions)}
      />

      <BattlefieldMapLayer
        offset={offset}
        zoom={zoom}
        activeMap={activeMap}
        visibleEntries={visibleEntries}
        pendingRepos={pendingRepos}
        positions={positions}
        isRelocateMode={isRelocateMode}
        relocatingId={relocatingId}
        constructingRepoIds={constructingRepoIds}
        storeBuildings={storeBuildings}
        buildingPositions={buildingPositions}
        relocatingBuildingId={relocatingBuildingId}
        constructingBuildingIds={constructingBuildingIds}
        selectedBuildingId={selectedBuildingId}
        placedBadges={placedBadges}
        badgePositions={badgePositions}
        relocatingBadgeId={relocatingBadgeId}
        detailEntry={detailEntry}
        branchSiloEntry={branchSiloEntry}
        serverUrl={getServerUrl()}
        play={play}
        onConstruct={(entry) => setConstructTarget(entry)}
        onStartRelocate={handleStartRelocate}
        onRefreshRepo={onRefreshRepo}
        addToast={addToast}
        onModalOpen={(state) => setModalState(state)}
        onBranchSiloClick={(e) => { setBranchSiloEntry(e); setDetailEntry(null); setSelectedBuildingId(null) }}
        onZoomToBase={handleZoomToBase}
        onBaseDetailOpen={(e) => { setDetailEntry(prev => prev?.repo.id === e.repo.id ? null : e); setBranchSiloEntry(null); setSelectedBuildingId(null) }}
        onStartBuildingRelocate={handleStartBuildingRelocate}
        onSelectBuilding={(id) => { setSelectedBuildingId(prev => prev === id ? null : id); setDetailEntry(null); setBranchSiloEntry(null) }}
        onDeselectBuilding={() => setSelectedBuildingId(null)}
        onStartBadgeRelocate={handleStartBadgeRelocate}
      />

      {(visibleEntries.length > 0 || pendingRepos.length > 0) && (
        <BattlefieldMinimap entries={visibleEntries} positions={positions} offset={offset} zoom={zoom} onJump={setOffset} />
      )}

      {repos.length === 0 && !loading && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title">&#x25a0; NO BASES DETECTED</div>
          <div className="battlefield-empty-sub">Add repositories in the Repositories panel to deploy bases.</div>
        </div>
      )}

      {activeMap && activeMapRepoIds !== null && activeMapRepoIds.size === 0 && !loading && entries.length > 0 && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title">&#x25a6; NO BASES ON THIS MAP</div>
          <div className="battlefield-empty-sub">Assign repositories to &quot;{activeMap.name}&quot; in the Repositories panel.</div>
        </div>
      )}

      {repos.length === 0 && loading && (
        <div className="battlefield-empty">
          <div className="battlefield-empty-title spinning-radar">&#x25CF;</div>
          <div className="battlefield-empty-sub">SCANNING TERRITORY...</div>
        </div>
      )}

      {isRelocateMode && (
        <div className="battlefield-relocate-banner">
          &#x2295; RELOCATE MODE — Drag a base to reposition it. Click again to cancel.
        </div>
      )}

      <ActionModal
        state={modalState}
        onClose={() => setModalState(null)}
        onSuccess={(msg) => addToast(msg, 'success')}
        onError={(msg) => addToast(msg, 'error')}
        onIssueCreated={handleIssueCreated}
        onTransition={(newState) => setModalState(newState)}
      />

      {constructTarget && (
        <ConstructDialog
          entry={constructTarget}
          onClose={() => setConstructTarget(null)}
          onSuccess={(msg) => { addToast(msg, 'success'); setConstructTarget(null) }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}

      {showMapSelector && (
        <LoadBattlefieldMapDialog
          maps={allMaps}
          activeMapId={activeMap?.id ?? null}
          onLoad={handleLoadMap}
          onClose={() => setShowMapSelector(false)}
        />
      )}

      {showBuildMenu && (
        <BuildOptionsMenu
          onClose={() => setShowBuildMenu(false)}
          onStartPlacement={async (params) => {
            if (params.type === 'new-base') {
              setShowBuildMenu(false)
              try {
                const result = await api.createRepo({
                  name: params.name,
                  description: params.repoDescription,
                  visibility: params.repoVisibility ?? 'private',
                })
                addToast(`Base "${params.name}" established! Select a spot on the map.`, 'success')
                setPlacementMode({ ...params, repoId: result.repo.id })
                setGhostScreenPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
              } catch (err) {
                addToast(err instanceof Error ? err.message : 'Failed to create repository', 'error')
              }
            } else {
              setShowBuildMenu(false)
              setPlacementMode(params)
              setGhostScreenPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
            }
          }}
        />
      )}

      {showBadgeLibrary && (
        <BadgeLibraryDialog
          onClose={() => setShowBadgeLibrary(false)}
          onSelectForPlacement={(badge) => {
            setPlacingBadge(badge)
            setShowBadgeLibrary(false)
          }}
          serverUrl={getServerUrl()}
        />
      )}

      {placingBadge && (
        <div className="battlefield-placement-banner">
          ◈ BADGE MODE — Click on the battlefield to place <strong>{placingBadge.name}</strong> &nbsp;·&nbsp; ESC to cancel
        </div>
      )}

      {placementMode && (
        <>
          <div
            className="placement-ghost"
            style={{ left: ghostScreenPos.x, top: ghostScreenPos.y }}
          >
            <img src={placementMode.buildImage} alt={placementMode.name} />
          </div>
          <div className="battlefield-placement-banner">
            &#x2295; PLACEMENT MODE — Click on the map to place <strong>{placementMode.name}</strong> &nbsp;·&nbsp; ESC to cancel
          </div>
        </>
      )}

      <FeedPanel
        entries={visibleEntries}
        isOpen={showFeedPanel}
        onClose={() => setShowFeedPanel(false)}
      />

      <DeadlineTimers
        isOpen={showTimers}
        onClose={() => setShowTimers(false)}
      />

      <BranchSiloPanel
        entry={branchSiloEntry}
        onClose={() => setBranchSiloEntry(null)}
        addToast={addToast}
        onModalOpen={(state) => { play('peep'); setModalState(state) }}
      />

      {detailEntry && (
        <SidePanel className="base-detail-side-panel" onClose={() => setDetailEntry(null)}>
          <div className="base-detail-side-panel-header">
            <div className="base-detail-side-panel-title-row">
              <span className="base-detail-side-panel-icon" style={{ color: detailEntry.repo.color }}>&#x25a0;</span>
              <div>
                <div className="base-detail-side-panel-title">BASE INTEL</div>
                <div className="base-detail-side-panel-subtitle">{detailEntry.repo.name}</div>
              </div>
            </div>
            <button className="silo-panel-close" onClick={() => setDetailEntry(null)} title="Close [Esc]">✕</button>
          </div>
          <div className="base-detail-side-panel-body">
            <BaseDetailPanel
              entry={detailEntry}
              onClose={() => setDetailEntry(null)}
              onModalOpen={(state) => { play('peep'); setModalState(state) }}
            />
          </div>
        </SidePanel>
      )}
    </div>
  )
}
