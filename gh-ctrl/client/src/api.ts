import type { Repo, DashboardEntry, RepoData, GHLabel, BranchesData, IssueDetail, PRDetail, GameMap, RepoMeta, FeedData, SetupStatus, Building, ClawComMessage, Badge, PlacedBadge } from './types'

export function getServerUrl(): string {
  return localStorage.getItem('serverUrl')?.replace(/\/$/, '') ?? ''
}

export function setServerUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, '')
  if (trimmed) {
    localStorage.setItem('serverUrl', trimmed)
  } else {
    localStorage.removeItem('serverUrl')
  }
}

function getBase(): string {
  const serverUrl = getServerUrl()
  return serverUrl ? `${serverUrl}/api` : '/api'
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  listRepos: () => request<Repo[]>('/repos'),

  addRepo: (fullName: string, color?: string) =>
    request<Repo>('/repos', {
      method: 'POST',
      body: JSON.stringify({ fullName, color }),
    }),

  updateRepo: (id: number, updates: { color?: string; description?: string }) =>
    request<Repo>(`/repos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteRepo: (id: number) =>
    request<{ ok: boolean }>(`/repos/${id}`, { method: 'DELETE' }),

  getDashboard: () => request<DashboardEntry[]>('/github/dashboard'),

  streamDashboard: (
    onEntry: (entry: DashboardEntry) => void,
    onDone: () => void
  ): (() => void) => {
    const es = new EventSource(`${getBase()}/github/dashboard/stream`)
    es.addEventListener('repo', (e: Event) => {
      onEntry(JSON.parse((e as MessageEvent).data))
    })
    es.addEventListener('done', () => {
      es.close()
      onDone()
    })
    es.onerror = () => {
      es.close()
      onDone()
    }
    return () => es.close()
  },

  getRepoData: (owner: string, name: string) =>
    request<RepoData>(`/github/repo/${owner}/${name}`),

  getLabels: (owner: string, name: string) =>
    request<GHLabel[]>(`/github/labels/${owner}/${name}`),

  getBranches: (owner: string, name: string) =>
    request<BranchesData>(`/github/branches/${owner}/${name}`),

  getBranchCompare: (owner: string, repoName: string, branch: string, base: string) =>
    request<{ ahead: number; behind: number }>(`/github/branch-compare/${owner}/${repoName}/${encodeURIComponent(branch)}?base=${encodeURIComponent(base)}`),

  deleteBranch: (owner: string, name: string, branch: string) =>
    request<{ ok: boolean }>(`/github/branch/${owner}/${name}/${encodeURIComponent(branch)}`, { method: 'DELETE' }),

  getRepoMeta: (owner: string, name: string) =>
    request<RepoMeta>(`/github/meta/${owner}/${name}`),

  triggerClaude: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    message?: string
  }) =>
    request<{ ok: boolean }>('/github/trigger-claude', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  postComment: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    comment: string
  }) =>
    request<{ ok: boolean }>('/github/comment', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  addLabel: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    label: string
  }) =>
    request<{ ok: boolean }>('/github/label', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  removeLabel: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    label: string
  }) =>
    request<{ ok: boolean }>('/github/label', {
      method: 'DELETE',
      body: JSON.stringify(params),
    }),

  createPR: (params: {
    fullName: string
    head: string
    base: string
    title: string
    prBody?: string
    assignees?: string[]
  }) =>
    request<{ ok: boolean; url: string }>('/github/create-pr', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  assignUser: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    assignees: string[]
  }) =>
    request<{ ok: boolean }>('/github/assign', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  labelTrigger: (fullName: string, number: number) =>
    request<{ ok: boolean }>('/github/label-trigger', {
      method: 'POST',
      body: JSON.stringify({ fullName, number }),
    }),

  getIssue: (owner: string, name: string, number: number) =>
    request<IssueDetail>(`/github/issue/${owner}/${name}/${number}`),

  getPR: (owner: string, name: string, number: number) =>
    request<PRDetail>(`/github/pr/${owner}/${name}/${number}`),

  createIssue: (params: {
    fullName: string
    title: string
    issueBody?: string
    labels?: string[]
  }) =>
    request<{ ok: boolean; url: string }>('/github/create-issue', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  createIssuesBatch: (params: {
    fullName: string
    issues: { title: string; issueBody?: string; labels?: string[] }[]
  }) =>
    request<{ results: { title: string; url?: string; error?: string }[] }>('/github/create-issues-batch', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getCollaborators: (owner: string, name: string) =>
    request<{ login: string }[]>(`/github/collaborators/${owner}/${name}`),

  addAssignee: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    assignee: string
  }) =>
    request<{ ok: boolean }>('/github/assignee', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  removeAssignee: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    assignee: string
  }) =>
    request<{ ok: boolean }>('/github/assignee', {
      method: 'DELETE',
      body: JSON.stringify(params),
    }),

  createRepo: (params: {
    name: string
    description?: string
    visibility: 'public' | 'private'
  }) =>
    request<{ ok: boolean; repo: import('./types').Repo }>('/github/create-repo', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getUserRepos: (params: { page?: number; per_page?: number; search?: string }) => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.per_page) qs.set('per_page', String(params.per_page))
    if (params.search) qs.set('search', params.search)
    return request<{ repos: { name: string; fullName: string; description: string | null; url: string; isPrivate: boolean }[]; page: number; perPage: number; total: number | null; truncated: boolean; ghAvailable: boolean }>(`/github/user-repos?${qs}`)
  },

  getVersion: () => request<{ version: string }>('/version'),

  listMaps: () => request<GameMap[]>('/maps'),

  createMap: (params: { name: string; width: number; height: number }) =>
    request<GameMap>('/maps', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getMap: (id: number) => request<GameMap>(`/maps/${id}`),

  saveMap: (id: number, updates: { name?: string; tiles?: string }) =>
    request<GameMap>(`/maps/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteMap: (id: number) =>
    request<{ ok: boolean }>(`/maps/${id}`, { method: 'DELETE' }),

  getMapRepos: (mapId: number) =>
    request<Repo[]>(`/maps/${mapId}/repos`),

  assignRepoToMap: (mapId: number, repoId: number) =>
    request<{ ok: boolean }>(`/maps/${mapId}/repos/${repoId}`, { method: 'POST' }),

  unassignRepoFromMap: (mapId: number, repoId: number) =>
    request<{ ok: boolean }>(`/maps/${mapId}/repos/${repoId}`, { method: 'DELETE' }),

  getFeed: () => request<FeedData>('/github/feed'),

  getSetupStatus: () => request<SetupStatus>('/setup/status'),

  listBuildings: () => request<Building[]>('/buildings'),

  createBuilding: (params: { type: string; name: string; color?: string; posX?: number; posY?: number }) =>
    request<Building>('/buildings', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  updateBuilding: (id: number, updates: { name?: string; color?: string; posX?: number; posY?: number; config?: object | string }) =>
    request<Building>(`/buildings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteBuilding: (id: number) =>
    request<{ ok: boolean }>(`/buildings/${id}`, { method: 'DELETE' }),

  getBuildingMessages: (id: number) =>
    request<ClawComMessage[]>(`/buildings/${id}/messages`),

  sendBuildingMessage: (id: number, content: string) =>
    request<ClawComMessage>(`/buildings/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  uploadBadge: (file: File, name: string): Promise<Badge> => {
    const serverUrl = getServerUrl()
    const base = serverUrl ? `${serverUrl}/api` : '/api'
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    return fetch(`${base}/badges/upload`, { method: 'POST', body: formData })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || res.statusText)
        }
        return res.json()
      })
  },

  listBadges: () => request<Badge[]>('/badges'),

  deleteBadge: (id: number) =>
    request<{ ok: boolean }>(`/badges/${id}`, { method: 'DELETE' }),

  listPlacedBadges: () => request<PlacedBadge[]>('/badges/placed'),

  placeBadge: (params: { badgeId: number; posX: number; posY: number; scale?: number; label?: string; mapId?: number | null }) =>
    request<PlacedBadge>('/badges/placed', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  updatePlacedBadge: (id: number, updates: { posX?: number; posY?: number; scale?: number; label?: string }) =>
    request<PlacedBadge>(`/badges/placed/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  removePlacedBadge: (id: number) =>
    request<{ ok: boolean }>(`/badges/placed/${id}`, { method: 'DELETE' }),
}
