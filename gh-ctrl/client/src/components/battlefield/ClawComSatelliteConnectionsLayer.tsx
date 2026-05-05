import { useState, useEffect } from 'react'
import { api } from '../../api'
import { useAppStore } from '../../store'
import type { SshConnection } from '../../types'
import type { Position } from './battlefieldConstants'
import { satelliteOffset } from '../ClawComBuilding'

interface Props {
  buildingPositions: Record<number, Position>
  positions: Record<number, Position>
}

// BaseNode is 140px wide, positioned at top-left — use top-center of the node.
const BASE_CENTER_X = 70
const BASE_CENTER_Y = 40

interface SatelliteLink {
  key: string
  from: Position
  to: Position
  color: string
}

export function ClawComSatelliteConnectionsLayer({ buildingPositions, positions }: Props) {
  const storeBuildings = useAppStore((s) => s.buildings)
  const [connectionsByBuilding, setConnectionsByBuilding] = useState<
    Record<number, SshConnection[]>
  >({})

  const clawcomBuildings = storeBuildings.filter((b) => b.type === 'clawcom')
  const buildingIdKey = clawcomBuildings.map((b) => b.id).join(',')

  useEffect(() => {
    if (clawcomBuildings.length === 0) {
      setConnectionsByBuilding({})
      return
    }

    let cancelled = false

    async function fetchAll() {
      const result: Record<number, SshConnection[]> = {}
      await Promise.all(
        clawcomBuildings.map(async (b) => {
          try {
            result[b.id] = await api.listShellConnections(b.id)
          } catch {
            result[b.id] = []
          }
        }),
      )
      if (!cancelled) setConnectionsByBuilding(result)
    }

    fetchAll()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingIdKey])

  const links: SatelliteLink[] = []

  for (const building of clawcomBuildings) {
    const conns = connectionsByBuilding[building.id] ?? []
    const bRaw = buildingPositions[building.id] ?? { x: building.posX, y: building.posY }
    const color = building.color ?? '#00ff88'

    // Collect all (windowIndex → repoIds) pairs across all connections,
    // ordered by connection then by window index — this mirrors the flat
    // satellite array ordering in ClawComBuilding.tsx.
    type LinkedSat = { connId: number; windowIdx: number; repoIds: number[] }
    const linkedSats: LinkedSat[] = []
    for (const conn of conns) {
      if (!conn.windowRepoLinks) continue
      const sorted = Object.entries(conn.windowRepoLinks)
        .map(([k, v]) => ({ windowIdx: Number(k), repoIds: v }))
        .filter((e) => e.repoIds.length > 0)
        .sort((a, b) => a.windowIdx - b.windowIdx)
      for (const { windowIdx, repoIds } of sorted) {
        linkedSats.push({ connId: conn.id, windowIdx, repoIds })
      }
    }

    if (linkedSats.length === 0) continue

    linkedSats.forEach(({ connId, windowIdx, repoIds }, idx) => {
      const { dx, dy } = satelliteOffset(idx, linkedSats.length)
      const satPos: Position = { x: bRaw.x + dx, y: bRaw.y + dy }

      for (const repoId of repoIds) {
        const rRaw = positions[repoId]
        if (!rRaw) continue
        links.push({
          key: `${building.id}-${connId}-${windowIdx}-${repoId}`,
          color,
          from: satPos,
          to: { x: rRaw.x + BASE_CENTER_X, y: rRaw.y + BASE_CENTER_Y },
        })
      }
    })
  }

  if (links.length === 0) return null

  return (
    <svg
      width={6000}
      height={6000}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <defs>
        <style>{`
          @keyframes clawcom-sat-flow {
            to { stroke-dashoffset: -20; }
          }
        `}</style>
      </defs>
      {links.map((link) => {
        const { from, to } = link
        const mx = (from.x + to.x) / 2
        const my = Math.min(from.y, to.y) - 80
        const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
        return (
          <g key={link.key}>
            <path
              d={d}
              fill="none"
              stroke={link.color}
              strokeWidth={6}
              strokeOpacity={0.12}
              strokeDasharray="8 6"
              style={{ animation: 'clawcom-sat-flow 1.5s linear infinite' }}
            />
            <path
              d={d}
              fill="none"
              stroke={link.color}
              strokeWidth={1.5}
              strokeOpacity={0.7}
              strokeDasharray="8 6"
              style={{ animation: 'clawcom-sat-flow 1.5s linear infinite' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
