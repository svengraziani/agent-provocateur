import { create } from 'zustand'
import type { Repo, DashboardEntry, RepoData, GameMap, Building, Badge, PlacedBadge, DeadlineTimer, BattlefieldUser } from './types'
import { api } from './api'

export function selectBattlefieldUsers(entries: DashboardEntry[]): BattlefieldUser[] {
  const seen = new Map<string, { login: string; avatarUrl: string; lastRepoId?: number; lastDate: string }>()
  for (const entry of entries) {
    for (const pr of entry.data.prs) {
      const login = pr.author.login
      const existing = seen.get(login)
      if (!existing || pr.updatedAt > existing.lastDate) {
        seen.set(login, { login, avatarUrl: `https://github.com/${login}.png?size=40`, lastRepoId: entry.repo.id, lastDate: pr.updatedAt })
      }
    }
    for (const issue of entry.data.issues) {
      const login = issue.author.login
      const existing = seen.get(login)
      if (!existing || issue.updatedAt > existing.lastDate) {
        seen.set(login, { login, avatarUrl: `https://github.com/${login}.png?size=40`, lastRepoId: entry.repo.id, lastDate: issue.updatedAt })
      }
    }
  }
  return Array.from(seen.values()).map(({ login, avatarUrl, lastRepoId }) => ({ login, avatarUrl, lastRepoId }))
}

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
  badges: Badge[]
  placedBadges: PlacedBadge[]
  deadlineTimers: DeadlineTimer[]

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
  loadBadges: () => Promise<void>
  loadPlacedBadges: () => Promise<void>
  uploadBadge: (file: File, name: string) => Promise<Badge>
  renameBadge: (id: number, name: string) => Promise<void>
  deleteBadge: (id: number) => Promise<void>
  placeBadge: (params: { badgeId: number; posX: number; posY: number; scale?: number; label?: string; mapId?: number | null }) => Promise<PlacedBadge>
  updatePlacedBadgePosition: (id: number, posX: number, posY: number) => Promise<void>
  updatePlacedBadgeScale: (id: number, scale: number) => Promise<void>
  updatePlacedBadgeLabel: (id: number, label: string) => Promise<void>
  removePlacedBadge: (id: number) => Promise<void>
  loadTimers: () => Promise<void>
  createTimer: (params: { name: string; deadline: string; description?: string; color?: string }) => Promise<DeadlineTimer>
  updateTimer: (id: number, updates: { name?: string; deadline?: string; description?: string; color?: string }) => Promise<void>
  deleteTimer: (id: number) => Promise<void>
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
  badges: [],
  placedBadges: [],
  deadlineTimers: [],

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

  loadBadges: async () => {
    try {
      const data = await api.listBadges()
      set({ badges: data })
    } catch (err: any) {
      get().addToast(`Failed to load badges: ${err.message}`, 'error')
    }
  },

  loadPlacedBadges: async () => {
    try {
      const data = await api.listPlacedBadges()
      set({ placedBadges: data })
    } catch (err: any) {
      get().addToast(`Failed to load placed badges: ${err.message}`, 'error')
    }
  },

  uploadBadge: async (file: File, name: string) => {
    try {
      const badge = await api.uploadBadge(file, name)
      set((state) => ({ badges: [...state.badges, badge] }))
      return badge
    } catch (err: any) {
      get().addToast(`Failed to upload badge: ${err.message}`, 'error')
      throw err
    }
  },

  renameBadge: async (id: number, name: string) => {
    try {
      const updated = await api.renameBadge(id, name)
      set((state) => ({ badges: state.badges.map((b) => b.id === id ? updated : b) }))
    } catch (err: any) {
      get().addToast(`Failed to rename badge: ${err.message}`, 'error')
      throw err
    }
  },

  deleteBadge: async (id: number) => {
    try {
      await api.deleteBadge(id)
      set((state) => ({
        badges: state.badges.filter((b) => b.id !== id),
        placedBadges: state.placedBadges.filter((pb) => pb.badgeId !== id),
      }))
    } catch (err: any) {
      get().addToast(`Failed to delete badge: ${err.message}`, 'error')
      throw err
    }
  },

  placeBadge: async (params) => {
    try {
      const placed = await api.placeBadge(params)
      set((state) => ({ placedBadges: [...state.placedBadges, placed] }))
      return placed
    } catch (err: any) {
      get().addToast(`Failed to place badge: ${err.message}`, 'error')
      throw err
    }
  },

  updatePlacedBadgePosition: async (id: number, posX: number, posY: number) => {
    try {
      const updated = await api.updatePlacedBadge(id, { posX, posY })
      set((state) => ({
        placedBadges: state.placedBadges.map((pb) => pb.id === id ? { ...pb, posX: updated.posX, posY: updated.posY } : pb),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update badge position: ${err.message}`, 'error')
    }
  },

  updatePlacedBadgeScale: async (id: number, scale: number) => {
    try {
      const updated = await api.updatePlacedBadge(id, { scale })
      set((state) => ({
        placedBadges: state.placedBadges.map((pb) => pb.id === id ? { ...pb, scale: updated.scale } : pb),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update badge scale: ${err.message}`, 'error')
    }
  },

  updatePlacedBadgeLabel: async (id: number, label: string) => {
    try {
      const updated = await api.updatePlacedBadge(id, { label })
      set((state) => ({
        placedBadges: state.placedBadges.map((pb) => pb.id === id ? { ...pb, label: updated.label } : pb),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update badge label: ${err.message}`, 'error')
    }
  },

  removePlacedBadge: async (id: number) => {
    try {
      await api.removePlacedBadge(id)
      set((state) => ({
        placedBadges: state.placedBadges.filter((pb) => pb.id !== id),
      }))
    } catch (err: any) {
      get().addToast(`Failed to remove badge: ${err.message}`, 'error')
      throw err
    }
  },

  loadTimers: async () => {
    try {
      const data = await api.listTimers()
      set({ deadlineTimers: data })
    } catch (err: any) {
      get().addToast(`Failed to load timers: ${err.message}`, 'error')
    }
  },

  createTimer: async (params) => {
    try {
      const timer = await api.createTimer(params)
      set((state) => ({ deadlineTimers: [...state.deadlineTimers, timer].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()) }))
      return timer
    } catch (err: any) {
      get().addToast(`Failed to create timer: ${err.message}`, 'error')
      throw err
    }
  },

  updateTimer: async (id, updates) => {
    try {
      const updated = await api.updateTimer(id, updates)
      set((state) => ({
        deadlineTimers: state.deadlineTimers
          .map((t) => t.id === id ? updated : t)
          .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()),
      }))
    } catch (err: any) {
      get().addToast(`Failed to update timer: ${err.message}`, 'error')
      throw err
    }
  },

  deleteTimer: async (id) => {
    try {
      await api.deleteTimer(id)
      set((state) => ({ deadlineTimers: state.deadlineTimers.filter((t) => t.id !== id) }))
    } catch (err: any) {
      get().addToast(`Failed to delete timer: ${err.message}`, 'error')
      throw err
    }
  },
}))
