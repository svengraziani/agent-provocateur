import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { SshConnection, TmuxWindow } from '../types'

export interface ConnectionTmuxWindows {
  connection: SshConnection
  windows: TmuxWindow[]
}

interface UseClawComTmuxWindowsParams {
  buildingId: number
  connections: SshConnection[]
  enabled: boolean
  pollIntervalMs?: number
}

// Stable key for the connection set (id + tmuxSession), so the effect only
// re-runs when the actually-relevant fields change rather than on every
// re-fetch that produces a new array reference.
function connectionsKey(connections: SshConnection[]): string {
  return connections
    .filter((c) => c.tmuxSession)
    .map((c) => `${c.id}:${c.tmuxSession}`)
    .sort()
    .join(',')
}

export function useClawComTmuxWindows({
  buildingId,
  connections,
  enabled,
  pollIntervalMs = 10 * 60 * 1000,
}: UseClawComTmuxWindowsParams): ConnectionTmuxWindows[] {
  const [data, setData] = useState<ConnectionTmuxWindows[]>([])
  const tmuxConnsKey = connectionsKey(connections)

  const fetchAll = useCallback(async () => {
    const tmuxConns = connections.filter((c) => c.tmuxSession)
    if (tmuxConns.length === 0) {
      setData([])
      return
    }
    const results = await Promise.all(
      tmuxConns.map(async (c): Promise<ConnectionTmuxWindows> => {
        try {
          const res = await api.getShellTmuxWindows(buildingId, c.id, c.tmuxSession!)
          return { connection: c, windows: res.ok ? res.windows : [] }
        } catch {
          return { connection: c, windows: [] }
        }
      })
    )
    setData(results.filter((r) => r.windows.length > 0))
  }, [buildingId, connections])

  useEffect(() => {
    if (!enabled) {
      setData([])
      return
    }
    fetchAll()
    const id = setInterval(fetchAll, pollIntervalMs)
    return () => clearInterval(id)
    // tmuxConnsKey captures connection identity changes; fetchAll is stable
    // enough but listed so lint is happy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, buildingId, tmuxConnsKey, pollIntervalMs])

  return data
}
