import { create } from 'zustand'
import type { Repo, DashboardEntry, RepoData, GameMap, Building } from './types'
import { api } from './api'

type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

let nextToastId = 0
let dashboardStreamCleanup: (() => void) | null = null

const DEFAULT_REFRESH_INTERVAL = 2 * 60 * 1000

function getStoredRefreshInterval(): number {
  const stored = localStorage.getItem('refreshInterval')
  return stored ? parseInt(stored, 10) : DEFAULT_REFRESH_INTERVAL
}

interface AppStore {
  // Data
  repos: Repo[]
  entries: DashboardEntry[]
  loading: boolean
  lastRefresh: Date | null
  refreshInterval: number
  toasts: Toast[]
  maps: GameMap[]
  buildings: Building[]

  // Toast
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: number) => void

  // Async actions
  loadRepos: () => Promise<void>
  loadDashboard: () => Promise<void>
  loadSingleRepo: (owner: string, name: string) => Promise<void>
  handleRefreshIntervalChange: (ms: number) => void
  updateRepoColor: (id: number, color: string) => Promise<void>
  loadMaps: () => Promise<void>
  assignRepoToMap: (mapId: number, repoId: number) => Promise<void>
  unassignRepoFromMap: (mapId: number, repoId: number) => Promise<void>
  loadBuildings: () => Promise<void>
  updateBuildingPosition: (id: number, posX: number, posY: number) => Promise<void>
  updateBuildingColor: (id: number, color: string) => Promise<void>
  deleteBuilding: (id: number) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  repos: [],
  entries: [],
  loading: false,
  lastRefresh: null,
  refreshInterval: getStoredRefreshInterval(),
  toasts: [],
  maps: [],
  buildings: [],

  addToast: (message, type = 'info') => {
    const id = nextToastId++
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => get().removeToast(id), 3500)
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  loadRepos: async () => {
    try {
      const data = await api.listRepos()
      set({ repos: data })
    } catch (err: any) {
      get().addToast(`Failed to load repos: ${err.message}`, 'error')
    }
  },

  loadDashboard: () => {
    // Cancel any in-flight stream before starting a new one
    if (dashboardStreamCleanup) {
      dashboardStreamCleanup()
      dashboardStreamCleanup = null
    }

    set({ loading: true, entries: [] })

    return new Promise<void>((resolve) => {
      const cleanup = api.streamDashboard(
        (entry) => {
          set((state) => ({ entries: [...state.entries, entry] }))
        },
        () => {
          set({ loading: false, lastRefresh: new Date() })
          dashboardStreamCleanup = null
          resolve()
        }
      )
      dashboardStreamCleanup = cleanup
    })
  },

  loadSingleRepo: async (owner: string, name: string) => {
    try {
      const data: RepoData = await api.getRepoData(owner, name)
      set((state) => ({
        entries: state.entries.map((e) =>
          e.repo.owner === owner && e.repo.name === name ? { ...e, data } : e
        ),
        lastRefresh: new Date(),
      }))
    } catch (err: any) {
      get().addToast(`Failed to refresh ${owner}/${name}: ${err.message}`, 'error')
    }
  },

  handleRefreshIntervalChange: (ms: number) => {
    localStorage.setItem('refreshInterval', String(ms))
    set({ refreshInterval: ms })
  },

  updateRepoColor: async (id: number, color: string) => {
    try {
      const updated = await api.updateRepo(id, { color })
      set((state) => ({
        repos: state.repos.map((r) => r.id === id ? { ...r, color: updated.color } : r),
        entries: state.entries.map((e) => e.repo.id === id ? { ...e, repo: { ...e.repo, color: updated.color } } : e),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update color: ${err.message}`, 'error')
    }
  },

  loadMaps: async () => {
    try {
      const data = await api.listMaps()
      set({ maps: data })
    } catch (err: any) {
      get().addToast(`Failed to load maps: ${err.message}`, 'error')
    }
  },

  assignRepoToMap: async (mapId: number, repoId: number) => {
    try {
      await api.assignRepoToMap(mapId, repoId)
    } catch (err: any) {
      get().addToast(`Failed to assign repo to map: ${err.message}`, 'error')
      throw err
    }
  },

  unassignRepoFromMap: async (mapId: number, repoId: number) => {
    try {
      await api.unassignRepoFromMap(mapId, repoId)
    } catch (err: any) {
      get().addToast(`Failed to unassign repo from map: ${err.message}`, 'error')
      throw err
    }
  },

  loadBuildings: async () => {
    try {
      const data = await api.listBuildings()
      set({ buildings: data })
    } catch (err: any) {
      get().addToast(`Failed to load buildings: ${err.message}`, 'error')
    }
  },

  updateBuildingPosition: async (id: number, posX: number, posY: number) => {
    try {
      const updated = await api.updateBuilding(id, { posX, posY })
      set((state) => ({
        buildings: state.buildings.map((b) => b.id === id ? { ...b, posX: updated.posX, posY: updated.posY } : b),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update building position: ${err.message}`, 'error')
    }
  },

  updateBuildingColor: async (id: number, color: string) => {
    try {
      const updated = await api.updateBuilding(id, { color })
      set((state) => ({
        buildings: state.buildings.map((b) => b.id === id ? { ...b, color: updated.color } : b),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update building color: ${err.message}`, 'error')
    }
  },

  deleteBuilding: async (id: number) => {
    try {
      await api.deleteBuilding(id)
      set((state) => ({
        buildings: state.buildings.filter((b) => b.id !== id),
      }))
    } catch (err: any) {
      get().addToast(`Failed to delete building: ${err.message}`, 'error')
      throw err
    }
  },
}))
