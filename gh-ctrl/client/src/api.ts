import type { Repo, DashboardEntry, RepoData, GHLabel, BranchesData, IssueDetail, PRDetail, GameMap, RepoMeta, FeedData } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
    const es = new EventSource(`${BASE}/github/dashboard/stream`)
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


  getRepoMeta: (owner: string, name: string) =>
    request<RepoMeta>(`/github/meta/${owner}/${name}`),

  triggerClaude: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    message?: string
  }, images?: File[]) => {
    if (images && images.length > 0) {
      const fd = new FormData()
      fd.append('fullName', params.fullName)
      fd.append('number', String(params.number))
      fd.append('type', params.type)
      if (params.message) fd.append('message', params.message)
      for (const img of images) fd.append('images', img)
      return fetch(`${BASE}/github/trigger-claude`, { method: 'POST', body: fd }).then(async (res) => {
        if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText) }
        return res.json() as Promise<{ ok: boolean }>
      })
    }
    return request<{ ok: boolean }>('/github/trigger-claude', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  postComment: (params: {
    fullName: string
    number: number
    type: 'pr' | 'issue'
    comment: string
  }, images?: File[]) => {
    if (images && images.length > 0) {
      const fd = new FormData()
      fd.append('fullName', params.fullName)
      fd.append('number', String(params.number))
      fd.append('type', params.type)
      fd.append('comment', params.comment)
      for (const img of images) fd.append('images', img)
      return fetch(`${BASE}/github/comment`, { method: 'POST', body: fd }).then(async (res) => {
        if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText) }
        return res.json() as Promise<{ ok: boolean }>
      })
    }
    return request<{ ok: boolean }>('/github/comment', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

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

  getCollaborators: (owner: string, name: string) =>
    request<{ login: string }[]>(`/github/collaborators/${owner}/${name}`),


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
  }, images?: File[]) => {
    if (images && images.length > 0) {
      const fd = new FormData()
      fd.append('fullName', params.fullName)
      fd.append('title', params.title)
      if (params.issueBody) fd.append('issueBody', params.issueBody)
      if (params.labels) fd.append('labels', JSON.stringify(params.labels))
      for (const img of images) fd.append('images', img)
      return fetch(`${BASE}/github/create-issue`, { method: 'POST', body: fd }).then(async (res) => {
        if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText) }
        return res.json() as Promise<{ ok: boolean; url: string }>
      })
    }
    return request<{ ok: boolean; url: string }>('/github/create-issue', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

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

  getFeed: () => request<FeedData>('/github/feed'),
}
