import type { Repo, DashboardEntry, RepoData, GHLabel, BranchesData, IssueDetail, PRDetail, GameMap, RepoMeta, FeedData, SetupStatus, Building, ClawComMessage, Badge, PlacedBadge, HealthcheckResult, DeadlineTimer, ChannelEvent, MailMessage } from './types'

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

// Auth token provider — set by KeycloakProvider when Keycloak is enabled
let _getToken: (() => string | undefined) | null = null

export function setAuthTokenProvider(fn: () => string | undefined) {
  _getToken = fn
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = _getToken?.()
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(`${getBase()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader },
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

  addRepo: (fullName: string, color?: string, provider?: 'github' | 'gitlab', instanceUrl?: string, gitlabToken?: string) =>
    request<Repo>('/repos', {
      method: 'POST',
      body: JSON.stringify({ fullName, color, provider, instanceUrl, gitlabToken }),
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
    const token = _getToken?.()
    const streamUrl = token
      ? `${getBase()}/github/dashboard/stream?token=${encodeURIComponent(token)}`
      : `${getBase()}/github/dashboard/stream`
    const es = new EventSource(streamUrl)
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

  importMap: (params: { name: string; width: number; height: number; tiles: string | Record<string, unknown> }) =>
    request<GameMap>('/maps/import', {
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

  /**
   * Open an SSE connection to receive real-time events from the Claude Channel MCP server.
   * Returns a cleanup function that closes the connection.
   */
  streamChannelEvents: (
    buildingId: number,
    onEvent: (event: ChannelEvent) => void,
    onError?: () => void
  ): (() => void) => {
    const token = _getToken?.()
    const channelUrl = token
      ? `${getBase()}/buildings/${buildingId}/channel-events?token=${encodeURIComponent(token)}`
      : `${getBase()}/buildings/${buildingId}/channel-events`
    const es = new EventSource(channelUrl)
    es.onmessage = (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(e.data as string))
      } catch { /* ignore non-JSON */ }
    }
    es.onerror = () => {
      onError?.()
    }
    return () => es.close()
  },

  /** Submit a permission verdict (allow/deny) for a pending Claude tool call. */
  submitPermissionVerdict: (buildingId: number, id: string, verdict: 'allow' | 'deny') =>
    request<{ ok: boolean }>(`/buildings/${buildingId}/permission`, {
      method: 'POST',
      body: JSON.stringify({ id, verdict }),
    }),

  getBuildingHealthcheck: (id: number) =>
    request<HealthcheckResult[]>(`/buildings/${id}/healthcheck`),

  triggerBuildingHealthcheck: (id: number) =>
    request<{ ok: boolean }>(`/buildings/${id}/healthcheck/trigger`, { method: 'POST' }),

  uploadBadge: (file: File, name: string): Promise<Badge> => {
    const serverUrl = getServerUrl()
    const base = serverUrl ? `${serverUrl}/api` : '/api'
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    const token = _getToken?.()
    const uploadHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    return fetch(`${base}/badges/upload`, { method: 'POST', body: formData, headers: uploadHeaders })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || res.statusText)
        }
        return res.json()
      })
  },

  listBadges: () => request<Badge[]>('/badges'),

  renameBadge: (id: number, name: string) =>
    request<Badge>(`/badges/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

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

  listTimers: () => request<DeadlineTimer[]>('/timers'),

  createTimer: (params: { name: string; deadline: string; description?: string; color?: string }) =>
    request<DeadlineTimer>('/timers', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  updateTimer: (id: number, updates: { name?: string; deadline?: string; description?: string; color?: string }) =>
    request<DeadlineTimer>(`/timers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteTimer: (id: number) =>
    request<{ ok: boolean }>(`/timers/${id}`, { method: 'DELETE' }),

  getMailMessages: (id: number) =>
    request<MailMessage[]>(`/buildings/${id}/mail`),

  getMailUnreadCount: (id: number) =>
    request<{ count: number }>(`/buildings/${id}/mail/unread-count`),

  markMailRead: (buildingId: number, msgId: number) =>
    request<{ ok: boolean }>(`/buildings/${buildingId}/mail/${msgId}/read`, { method: 'POST' }),

  toggleMailStar: (buildingId: number, msgId: number) =>
    request<{ isStarred: number }>(`/buildings/${buildingId}/mail/${msgId}/star`, { method: 'POST' }),

  deleteMailMessage: (buildingId: number, msgId: number) =>
    request<{ ok: boolean }>(`/buildings/${buildingId}/mail/${msgId}`, { method: 'DELETE' }),

  sendMail: (buildingId: number, params: { to: string; subject: string; body: string }) =>
    request<{ ok: boolean }>(`/buildings/${buildingId}/mail/send`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  syncMail: (buildingId: number) =>
    request<{ ok: boolean }>(`/buildings/${buildingId}/mail/sync`, { method: 'POST' }),

  testMailConnection: (params: { imapHost: string; imapPort: number; username: string; password: string }) =>
    request<{ ok: boolean; error?: string }>('/buildings/mail/test-connection', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // ── GitLab API methods ──────────────────────────────────────────────────────

  getGitLabRepoData: (fullName: string) =>
    request<RepoData>(`/gitlab/repo?path=${encodeURIComponent(fullName)}`),

  getGitLabCollaborators: (fullName: string) =>
    request<{ login: string }[]>(`/gitlab/members?path=${encodeURIComponent(fullName)}`),

  addGitLabAssignee: (params: {
    fullName: string
    number: number
    type: 'mr' | 'issue'
    assignee: string
  }) =>
    request<{ ok: boolean }>('/gitlab/assignee', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  removeGitLabAssignee: (params: {
    fullName: string
    number: number
    type: 'mr' | 'issue'
    assignee: string
  }) =>
    request<{ ok: boolean }>('/gitlab/assignee', {
      method: 'DELETE',
      body: JSON.stringify(params),
    }),

  getGitLabLabels: (fullName: string) =>
    request<GHLabel[]>(`/gitlab/labels?path=${encodeURIComponent(fullName)}`),

  getGitLabBranches: (fullName: string) =>
    request<BranchesData>(`/gitlab/branches?path=${encodeURIComponent(fullName)}`),

  getGitLabBranchCompare: (fullName: string, branch: string, base: string) =>
    request<{ ahead: number; behind: number }>(`/gitlab/branch-compare?path=${encodeURIComponent(fullName)}&branch=${encodeURIComponent(branch)}&base=${encodeURIComponent(base)}`),

  deleteGitLabBranch: (fullName: string, branch: string) =>
    request<{ ok: boolean }>(`/gitlab/branch?path=${encodeURIComponent(fullName)}&branch=${encodeURIComponent(branch)}`, { method: 'DELETE' }),

  getGitLabRepoMeta: (fullName: string) =>
    request<RepoMeta>(`/gitlab/meta?path=${encodeURIComponent(fullName)}`),

  getGitLabMR: (fullName: string, number: number) =>
    request<PRDetail>(`/gitlab/mr?path=${encodeURIComponent(fullName)}&number=${number}`),

  getGitLabIssueDetail: (fullName: string, number: number) =>
    request<IssueDetail>(`/gitlab/issue?path=${encodeURIComponent(fullName)}&number=${number}`),

  postGitLabComment: (params: {
    fullName: string
    number: number
    type: 'mr' | 'issue'
    comment: string
  }) =>
    request<{ ok: boolean }>('/gitlab/comment', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  addGitLabLabel: (params: {
    fullName: string
    number: number
    type: 'mr' | 'issue'
    label: string
  }) =>
    request<{ ok: boolean }>('/gitlab/label', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  removeGitLabLabel: (params: {
    fullName: string
    number: number
    type: 'mr' | 'issue'
    label: string
  }) =>
    request<{ ok: boolean }>('/gitlab/label', {
      method: 'DELETE',
      body: JSON.stringify(params),
    }),

  createGitLabIssue: (params: {
    fullName: string
    title: string
    issueBody?: string
    labels?: string[]
  }) =>
    request<{ ok: boolean; url: string }>('/gitlab/create-issue', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  createGitLabMR: (params: {
    fullName: string
    sourceBranch: string
    targetBranch: string
    title: string
    description?: string
  }) =>
    request<{ ok: boolean; url: string }>('/gitlab/create-mr', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  validateGitLabProject: (ns: string, project: string) =>
    request<{ ok: boolean; projectId: number; name: string }>(`/gitlab/validate/${ns}/${project}`),
}
