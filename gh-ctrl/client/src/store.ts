import { create } from 'zustand'
import type { Repo, DashboardEntry, RepoData, GHUser } from './types'
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
  user: GHUser | null

  // Toast
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: number) => void

  // Async actions
  loadRepos: () => Promise<void>
  loadDashboard: () => Promise<void>
  loadSingleRepo: (owner: string, name: string) => Promise<void>
  handleRefreshIntervalChange: (ms: number) => void
  loadUser: () => Promise<void>
  logout: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  repos: [],
  entries: [],
  loading: false,
  lastRefresh: null,
  refreshInterval: getStoredRefreshInterval(),
  toasts: [],
  user: null,

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

  loadUser: async () => {
    try {
      const user = await api.getMe()
      set({ user })
    } catch {
      set({ user: null })
    }
  },

  logout: async () => {
    try {
      await api.logout()
    } catch {
      // ignore
    }
    set({ user: null })
  },
}))
