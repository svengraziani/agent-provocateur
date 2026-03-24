import type { DashboardEntry, GameMap, Building, PlacedBadge } from '../../types'
import type { ModalState } from '../ActionModal'
import type { Position } from './battlefieldConstants'
import { TERRAIN_ITEMS, ORE_ROUTES, COLS, ISO_MAP_CENTER_X, ISO_MAP_OFFSET_Y, ISO_HALF_W, ISO_HALF_H } from './battlefieldConstants'
import { BattlefieldMapCanvas } from './BattlefieldMapCanvas'
import { BaseNode } from '../BaseNode'
import { ClawComBuilding } from '../ClawComBuilding'
import { HealthcheckBuilding } from '../HealthcheckBuilding'
import { BadgeMarker } from '../BadgeMarker'
import type { Repo } from '../../types'

interface BattlefieldMapLayerProps {
  offset: Position
  zoom: number
  activeMap: GameMap | null
  visibleEntries: DashboardEntry[]
  pendingRepos: Repo[]
  positions: Record<number, Position>
  isRelocateMode: boolean
  relocatingId: number | null
  constructingRepoIds: Set<number>
  storeBuildings: Building[]
  buildingPositions: Record<number, { x: number; y: number }>
  relocatingBuildingId: number | null
  constructingBuildingIds: Set<number>
  selectedBuildingId: number | null
  placedBadges: PlacedBadge[]
  badgePositions: Record<number, { x: number; y: number }>
  relocatingBadgeId: number | null
  detailEntry: DashboardEntry | null
  branchSiloEntry: DashboardEntry | null
  serverUrl: string
  play: (sound: string) => void
  onConstruct: (entry: DashboardEntry) => void
  onStartRelocate: (id: number, mouseX: number, mouseY: number) => void
  onRefreshRepo: (owner: string, repoName: string) => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onModalOpen: (state: ModalState) => void
  onBranchSiloClick: (entry: DashboardEntry) => void
  onZoomToBase: (pos: Position) => void
  onBaseDetailOpen: (entry: DashboardEntry) => void
  onStartBuildingRelocate: (id: number, mouseX: number, mouseY: number) => void
  onSelectBuilding: (id: number) => void
  onDeselectBuilding: () => void
  onStartBadgeRelocate: (id: number, mouseX: number, mouseY: number) => void
}

export function BattlefieldMapLayer({
  offset,
  zoom,
  activeMap,
  visibleEntries,
  pendingRepos,
  positions,
  isRelocateMode,
  relocatingId,
  constructingRepoIds,
  storeBuildings,
  buildingPositions,
  relocatingBuildingId,
  constructingBuildingIds,
  selectedBuildingId,
  placedBadges,
  badgePositions,
  relocatingBadgeId,
  detailEntry,
  branchSiloEntry,
  serverUrl,
  play,
  onConstruct,
  onStartRelocate,
  onRefreshRepo,
  addToast,
  onModalOpen,
  onBranchSiloClick,
  onZoomToBase,
  onBaseDetailOpen,
  onStartBuildingRelocate,
  onSelectBuilding,
  onDeselectBuilding,
  onStartBadgeRelocate,
}: BattlefieldMapLayerProps) {
  return (
    <div
      className="battlefield-map"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
    >
      {!activeMap && <div className="battlefield-terrain" />}

      {activeMap && <BattlefieldMapCanvas map={activeMap} />}

      {!activeMap && TERRAIN_ITEMS.map((item) => (
        <div
          key={item.id}
          className="terrain-el"
          style={{ left: item.x, top: item.y, transform: `scale(${item.scale})` }}
        >
          {item.type === 'tree' && (
            <div className="terrain-tree">
              <div className="terrain-tree-layer" />
              <div className="terrain-tree-layer" />
              <div className="terrain-tree-layer" />
              <div className="terrain-tree-trunk" />
            </div>
          )}
          {item.type === 'rock' && <div className="terrain-rock" />}
          {item.type === 'crystal' && <div className="terrain-crystal" />}
        </div>
      ))}

      {!activeMap && ORE_ROUTES.map((route) => (
        <div key={route} className="ore-collector" data-route={String(route)}>
          <div className="ore-collector-body" />
          <div className="ore-collector-tracks" />
        </div>
      ))}

      {visibleEntries.map((entry) => {
        const pos = positions[entry.repo.id] ?? { x: 0, y: 0 }
        if (constructingRepoIds.has(entry.repo.id)) {
          return (
            <div
              key={entry.repo.id}
              className="building-construct-anim building-construct-anim--base"
              style={{ left: pos.x, top: pos.y }}
            >
              <img src="/buildings/construct_4s_base.gif" alt="constructing..." />
            </div>
          )
        }
        return (
          <BaseNode
            key={entry.repo.id}
            entry={entry}
            position={pos}
            isRelocateMode={isRelocateMode}
            isBeingRelocated={relocatingId === entry.repo.id}
            onConstruct={() => { play('hydraulic'); onConstruct(entry) }}
            onStartRelocate={(mouseX, mouseY) => onStartRelocate(entry.repo.id, mouseX, mouseY)}
            onRefreshRepo={onRefreshRepo}
            addToast={addToast}
            onModalOpen={(state) => { play('peep'); onModalOpen(state) }}
            onBranchSiloClick={(e) => { play('peep'); onBranchSiloClick(e) }}
            onZoomToBase={() => onZoomToBase(pos)}
            onBaseDetailOpen={(e) => { play('peep'); onBaseDetailOpen(e) }}
            isSelected={detailEntry?.repo.id === entry.repo.id}
            isSiloSelected={branchSiloEntry?.repo.id === entry.repo.id}
          />
        )
      })}

      {pendingRepos.map((repo, i) => {
        const pos = positions[repo.id] ?? { x: ISO_MAP_CENTER_X + (i % COLS) * ISO_HALF_W, y: ISO_MAP_OFFSET_Y + Math.floor(i / COLS) * ISO_HALF_H }
        return (
          <div
            key={`pending-${repo.id}`}
            className="base-node base-node-ghost"
            style={{ left: pos.x, top: pos.y, borderColor: repo.color }}
          >
            <div className="base-node-ghost-label" style={{ color: repo.color }}>{repo.name}</div>
            <div className="base-node-ghost-status spinning-radar">&#x25CF;</div>
          </div>
        )
      })}

      {storeBuildings.map((building) => {
        const pos = buildingPositions[building.id] ?? { x: building.posX, y: building.posY }
        if (constructingBuildingIds.has(building.id)) {
          const constructGif = building.type === 'healthcheck'
            ? '/buildings/construct_4s_healthcheck.gif'
            : '/buildings/construct_3s_clawcom.gif'
          return (
            <div
              key={`building-${building.id}`}
              className="building-construct-anim"
              style={{ left: pos.x, top: pos.y }}
            >
              <img src={constructGif} alt="constructing..." />
            </div>
          )
        }
        const commonProps = {
          key: `building-${building.id}`,
          building,
          position: pos,
          isRelocateMode,
          isBeingRelocated: relocatingBuildingId === building.id,
          onStartRelocate: (mouseX: number, mouseY: number) => onStartBuildingRelocate(building.id, mouseX, mouseY),
          addToast,
          isSelected: selectedBuildingId === building.id,
          onSelect: () => { play('peep'); onSelectBuilding(building.id) },
          onDeselect: onDeselectBuilding,
        }
        if (building.type === 'healthcheck') {
          return <HealthcheckBuilding {...commonProps} />
        }
        return <ClawComBuilding {...commonProps} />
      })}

      {placedBadges.map((pb) => {
        const pos = badgePositions[pb.id] ?? { x: pb.posX, y: pb.posY }
        return (
          <BadgeMarker
            key={`badge-${pb.id}`}
            placedBadge={pb}
            position={pos}
            isRelocateMode={isRelocateMode}
            isBeingRelocated={relocatingBadgeId === pb.id}
            onStartRelocate={(mouseX, mouseY) => onStartBadgeRelocate(pb.id, mouseX, mouseY)}
            addToast={addToast}
            serverUrl={serverUrl}
          />
        )
      })}
    </div>
  )
}
