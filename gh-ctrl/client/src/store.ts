import { create } from 'zustand'
import type { Repo, DashboardEntry, RepoData } from './types'
import { api } from './api'

type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

let nextToastId = 0

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

  // Setters
  setEntries: (entries: DashboardEntry[]) => void
  setRefreshInterval: (ms: number) => void

  // Toast
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: number) => void

  // Async actions
  loadRepos: () => Promise<void>
  loadDashboard: () => Promise<void>
  loadSingleRepo: (owner: string, name: string) => Promise<void>
  handleRefreshIntervalChange: (ms: number) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  repos: [],
  entries: [],
  loading: false,
  lastRefresh: null,
  refreshInterval: getStoredRefreshInterval(),
  toasts: [],

  setEntries: (entries) => set({ entries }),
  setRefreshInterval: (ms) => set({ refreshInterval: ms }),

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

  loadDashboard: async () => {
    set({ loading: true })
    try {
      const data = await api.getDashboard()
      set({ entries: data, lastRefresh: new Date() })
    } catch (err: any) {
      get().addToast(`Failed to load dashboard: ${err.message}`, 'error')
    } finally {
      set({ loading: false })
    }
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
}))
