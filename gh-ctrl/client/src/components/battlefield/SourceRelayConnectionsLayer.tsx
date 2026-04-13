import { useState, useEffect } from 'react'
import { api } from '../../api'
import type { Building, DashboardEntry, SourceRelayConnector } from '../../types'
import type { Position } from './battlefieldConstants'

interface Props {
  storeBuildings: Building[]
  buildingPositions: Record<number, Position>
  visibleEntries: DashboardEntry[]
  positions: Record<number, Position>
}

// Building uses translate(-50%,-50%) so position IS the center.
const BUILDING_CENTER_X = 0
const BUILDING_CENTER_Y = 0

// BaseNode is 140px wide, positioned at top-left — use top-center of the node.
const BASE_CENTER_X = 70
const BASE_CENTER_Y = 40

function matchConnectorToEntry(
  connector: SourceRelayConnector,
  entries: DashboardEntry[],
): DashboardEntry | undefined {
  let cfg: { url?: string } = {}
  try {
    cfg = JSON.parse(connector.configuration)
  } catch {
    /* malformed config */
  }
  if (!cfg.url) return undefined

  const normalized = cfg.url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase()

  return entries.find((entry) => {
    const base =
      entry.repo.provider === 'gitlab'
        ? (entry.repo.instanceUrl ?? 'https://gitlab.com')
        : 'https://github.com'
    const repoUrl = `${base}/${entry.repo.fullName}`.toLowerCase()
    return normalized === repoUrl
  })
}

interface Connection {
  key: string
  color: string
  from: Position
  to: Position
}

export function SourceRelayConnectionsLayer({
  storeBuildings,
  buildingPositions,
  visibleEntries,
  positions,
}: Props) {
  const [connectorsByBuilding, setConnectorsByBuilding] = useState<
    Record<number, SourceRelayConnector[]>
  >({})

  const relayBuildings = storeBuildings.filter((b) => b.type === 'sourceRelay')
  const buildingIdKey = relayBuildings.map((b) => b.id).join(',')

  useEffect(() => {
    if (relayBuildings.length === 0) {
      setConnectorsByBuilding({})
      return
    }

    let cancelled = false

    async function fetchAll() {
      const result: Record<number, SourceRelayConnector[]> = {}
      await Promise.all(
        relayBuildings.map(async (b) => {
          try {
            result[b.id] = await api.listSourceRelayConnectors(b.id)
          } catch {
            result[b.id] = []
          }
        }),
      )
      if (!cancelled) setConnectorsByBuilding(result)
    }

    fetchAll()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingIdKey])

  // Compute connections using current positions (updates on every render when bases/buildings move)
  const connections: Connection[] = []
  for (const building of relayBuildings) {
    const connectors = connectorsByBuilding[building.id] ?? []
    const bRaw = buildingPositions[building.id] ?? { x: building.posX, y: building.posY }
    const from: Position = {
      x: bRaw.x + BUILDING_CENTER_X,
      y: bRaw.y + BUILDING_CENTER_Y,
    }
    const color = building.color ?? '#ff8800'

    // Connector-matched splines
    const connectorRepoIds = new Set<number>()
    for (const connector of connectors) {
      if (connector.type === 'website') continue
      const entry = matchConnectorToEntry(connector, visibleEntries)
      if (!entry) continue
      const rRaw = positions[entry.repo.id]
      if (!rRaw) continue
      connectorRepoIds.add(entry.repo.id)
      connections.push({
        key: `${building.id}-${connector.id}`,
        color,
        from,
        to: { x: rRaw.x + BASE_CENTER_X, y: rRaw.y + BASE_CENTER_Y },
      })
    }

    // Explicitly linked repo splines (skip those already drawn from connectors)
    let linkedRepoIds: number[] = []
    try { linkedRepoIds = JSON.parse(building.config ?? '{}').linkedRepoIds ?? [] } catch { /* ignore */ }
    for (const repoId of linkedRepoIds) {
      if (connectorRepoIds.has(repoId)) continue
      const rRaw = positions[repoId]
      if (!rRaw) continue
      connections.push({
        key: `linked-${building.id}-${repoId}`,
        color,
        from,
        to: { x: rRaw.x + BASE_CENTER_X, y: rRaw.y + BASE_CENTER_Y },
      })
    }
  }

  if (connections.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <defs>
        <style>{`
          @keyframes source-relay-flow {
            to { stroke-dashoffset: -20; }
          }
        `}</style>
      </defs>
      {connections.map((conn) => {
        const { from, to } = conn
        const mx = (from.x + to.x) / 2
        const my = Math.min(from.y, to.y) - 100
        const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
        return (
          <g key={conn.key}>
            {/* Glow layer */}
            <path
              d={d}
              fill="none"
              stroke={conn.color}
              strokeWidth={6}
              strokeOpacity={0.15}
              strokeDasharray="12 8"
              style={{ animation: 'source-relay-flow 1.2s linear infinite' }}
            />
            {/* Main animated beam */}
            <path
              d={d}
              fill="none"
              stroke={conn.color}
              strokeWidth={2}
              strokeOpacity={0.75}
              strokeDasharray="12 8"
              style={{ animation: 'source-relay-flow 1.2s linear infinite' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
