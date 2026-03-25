/**
 * GitLab REST API v4 client.
 * Authentication: Personal Access Token via GITLAB_TOKEN env var.
 * Self-hosted GitLab: pass instanceUrl (e.g. "https://gitlab.example.com").
 */

import type {
  NormalizedMR,
  NormalizedIssue,
  NormalizedBranch,
  NormalizedPipeline,
  NormalizedRepoData,
  NormalizedRepoMeta,
  NormalizedRepoStats,
} from './types'

const CLAUDE_LABELS = ['claude', 'ai', 'ai-fix', 'ai-feature']

/** Encode a project path (namespace/name) for use in GitLab API URLs. */
export function encodeProjectPath(path: string): string {
  return encodeURIComponent(path)
}

/** Low-level GitLab REST API v4 fetch helper. */
export async function glabApi(
  path: string,
  options: { instanceUrl?: string | null; method?: string; body?: unknown } = {}
): Promise<{ data: any; error: string | null }> {
  const base = (options.instanceUrl ?? 'https://gitlab.com').replace(/\/$/, '')
  const token = process.env.GITLAB_TOKEN

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['PRIVATE-TOKEN'] = token

  try {
    const res = await fetch(`${base}/api/v4${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    })

    if (res.status === 204) return { data: null, error: null }

    const text = await res.text()
    if (!res.ok) {
      let msg: string
      try {
        const parsed = JSON.parse(text)
        msg = parsed.message || parsed.error || text
      } catch {
        msg = text
      }
      return { data: null, error: `GitLab API ${res.status}: ${msg}` }
    }

    try {
      return { data: JSON.parse(text), error: null }
    } catch {
      return { data: null, error: 'Failed to parse GitLab response' }
    }
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Network error' }
  }
}

function normalizeMRState(gl: any): NormalizedMR['mergeable'] {
  // GitLab: merge_status can be 'can_be_merged', 'cannot_be_merged', 'unchecked', etc.
  if (gl.merge_status === 'cannot_be_merged') return 'CONFLICTING'
  if (gl.merge_status === 'can_be_merged') return 'MERGEABLE'
  return 'UNKNOWN'
}

function normalizeReviewState(gl: any): NormalizedMR['reviewState'] {
  // GitLab approvals are fetched separately; without them we derive from merge_status
  if (gl.approved) return 'approved'
  return 'pending'
}

export function normalizeMR(gl: any): NormalizedMR {
  const mergeable = normalizeMRState(gl)
  return {
    number: gl.iid,
    title: gl.title,
    url: gl.web_url,
    draft: gl.draft ?? gl.work_in_progress ?? false,
    isDraft: gl.draft ?? gl.work_in_progress ?? false,
    author: {
      login: gl.author?.username ?? '',
      avatarUrl: gl.author?.avatar_url ?? '',
      url: gl.author?.web_url ?? '',
    },
    labels: (gl.labels ?? []).map((name: string) => ({ name, color: '#6366f1' })),
    reviewState: normalizeReviewState(gl),
    conflicting: mergeable === 'CONFLICTING',
    mergeable,
    headRefName: gl.source_branch ?? '',
    createdAt: gl.created_at ?? '',
    updatedAt: gl.updated_at ?? '',
    previewUrl: null,
    assignees: (gl.assignees ?? (gl.assignee ? [gl.assignee] : [])).map((u: any) => ({
      login: u.username ?? '',
      avatarUrl: u.avatar_url ?? '',
      url: u.web_url ?? '',
    })),
  }
}

export function normalizeIssue(gl: any): NormalizedIssue {
  return {
    number: gl.iid,
    title: gl.title,
    url: gl.web_url,
    state: gl.state,
    author: {
      login: gl.author?.username ?? '',
      avatarUrl: gl.author?.avatar_url ?? '',
      url: gl.author?.web_url ?? '',
    },
    labels: (gl.labels ?? []).map((name: string) => ({ name, color: '#6366f1' })),
    assignees: (gl.assignees ?? (gl.assignee ? [gl.assignee] : [])).map((u: any) => ({
      login: u.username ?? '',
      avatarUrl: u.avatar_url ?? '',
      url: u.web_url ?? '',
    })),
    updatedAt: gl.updated_at ?? '',
  }
}

function normalizePipelineStatus(status: string): NormalizedPipeline['status'] {
  const map: Record<string, NormalizedPipeline['status']> = {
    running: 'running',
    pending: 'pending',
    created: 'pending',
    waiting_for_resource: 'pending',
    preparing: 'pending',
    scheduled: 'pending',
    success: 'success',
    failed: 'failed',
    canceled: 'canceled',
    canceling: 'canceled',
    skipped: 'skipped',
    manual: 'skipped',
  }
  return map[status] ?? 'unknown'
}

export function normalizePipeline(gl: any, projectUrl: string): NormalizedPipeline {
  return {
    id: gl.id,
    name: gl.name ?? `Pipeline #${gl.id}`,
    status: normalizePipelineStatus(gl.status),
    ref: gl.ref ?? '',
    url: gl.web_url ?? `${projectUrl}/-/pipelines/${gl.id}`,
    createdAt: gl.created_at ?? '',
    updatedAt: gl.updated_at ?? gl.created_at ?? '',
  }
}

/** Fetch the full repo dashboard data for a GitLab project. */
export async function fetchGitLabRepoData(
  projectPath: string,
  instanceUrl?: string | null
): Promise<NormalizedRepoData> {
  const encoded = encodeProjectPath(projectPath)
  const opts = { instanceUrl }

  const empty: NormalizedRepoData = {
    fullName: projectPath,
    provider: 'gitlab',
    prs: [],
    issues: [],
    stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, approved: 0, drafts: 0, claudeIssues: 0, runningActions: 0 },
    conflicts: [],
    needsReview: [],
    claudeIssues: [],
    activeClaudeIssues: [],
    claudeIssuePRLinks: {},
    runningWorkflows: [],
    branches: [],
    defaultBranch: 'main',
    hasClaudeYml: false,
    error: null,
  }

  // Fetch MRs, issues, and pipelines in parallel
  const [mrResult, issueResult, pipelineResult, projectResult] = await Promise.all([
    glabApi(`/projects/${encoded}/merge_requests?state=opened&per_page=30`, opts),
    glabApi(`/projects/${encoded}/issues?state=opened&per_page=30`, opts),
    glabApi(`/projects/${encoded}/pipelines?per_page=30`, opts),
    glabApi(`/projects/${encoded}`, opts),
  ])

  if (mrResult.error && issueResult.error) {
    return { ...empty, error: mrResult.error || issueResult.error }
  }

  const projectUrl = projectResult.data?.web_url ?? `https://gitlab.com/${projectPath}`
  const defaultBranch: string = projectResult.data?.default_branch ?? 'main'

  const prs: NormalizedMR[] = (mrResult.data ?? []).map(normalizeMR)
  const issues: NormalizedIssue[] = (issueResult.data ?? []).map(normalizeIssue)
  const pipelines: NormalizedPipeline[] = (pipelineResult.data ?? []).map((p: any) => normalizePipeline(p, projectUrl))

  // Fetch branches
  const branchResult = await glabApi(
    `/projects/${encoded}/repository/branches?per_page=100&order_by=updated_at&sort=desc`,
    opts
  )
  const branches: NormalizedBranch[] = (branchResult.data ?? []).map((b: any) => ({
    name: b.name,
    committedDate: b.commit?.committed_date ?? b.commit?.created_at ?? '',
  }))

  const conflicts = prs.filter((mr) => mr.mergeable === 'CONFLICTING')
  const needsReview = prs.filter((mr) => mr.reviewState !== 'approved' && !mr.isDraft)
  const approved = prs.filter((mr) => mr.reviewState === 'approved')
  const drafts = prs.filter((mr) => mr.isDraft)
  const claudeIssues = issues.filter((issue) =>
    issue.labels.some((l) => CLAUDE_LABELS.includes(l.name.toLowerCase()))
  )
  const runningPipelines = pipelines.filter(
    (p) => p.status === 'running' || p.status === 'pending'
  )

  const stats: NormalizedRepoStats = {
    openPRs: prs.length,
    openIssues: issues.length,
    conflicts: conflicts.length,
    needsReview: needsReview.length,
    approved: approved.length,
    drafts: drafts.length,
    claudeIssues: claudeIssues.length,
    runningActions: runningPipelines.length,
  }

  return {
    fullName: projectPath,
    provider: 'gitlab',
    prs,
    issues,
    stats,
    conflicts,
    needsReview,
    claudeIssues,
    activeClaudeIssues: [],
    claudeIssuePRLinks: {},
    runningWorkflows: runningPipelines,
    branches,
    defaultBranch,
    hasClaudeYml: false,
    error: null,
  }
}

/** Fetch repo meta: stars, languages, topics, contributors, commit activity */
export async function fetchGitLabRepoMeta(
  projectPath: string,
  instanceUrl?: string | null
): Promise<NormalizedRepoMeta> {
  const encoded = encodeProjectPath(projectPath)
  const opts = { instanceUrl }

  const [projectResult, languagesResult, membersResult, commitsResult] = await Promise.all([
    glabApi(`/projects/${encoded}`, opts),
    glabApi(`/projects/${encoded}/languages`, opts),
    glabApi(`/projects/${encoded}/members/all?per_page=5`, opts),
    glabApi(`/projects/${encoded}/repository/commits?per_page=100`, opts),
  ])

  const project = projectResult.data ?? {}

  // Languages: GitLab returns { "JavaScript": 73.45, "TypeScript": 26.55 }
  const langData: Record<string, number> = languagesResult.data ?? {}
  const primaryLanguageName = Object.keys(langData)[0] ?? null
  const languages = Object.entries(langData).map(([name, pct]) => ({
    name,
    color: '#8b8b8b',
    percentage: Math.round(pct * 10) / 10,
  }))

  const contributors = (membersResult.data ?? []).slice(0, 5).map((m: any) => ({
    login: m.username ?? '',
    avatarUrl: m.avatar_url ?? '',
    contributions: m.access_level ?? 0,
  }))

  // Commit activity: bucket commits into 26 weekly bins
  const commitWeeks: number[] = Array(26).fill(0)
  const now = Date.now()
  for (const commit of commitsResult.data ?? []) {
    const date = new Date(commit.committed_date ?? commit.created_at).getTime()
    const weeksAgo = Math.floor((now - date) / (7 * 24 * 60 * 60 * 1000))
    if (weeksAgo >= 0 && weeksAgo < 26) {
      commitWeeks[25 - weeksAgo]++
    }
  }

  return {
    stars: project.star_count ?? 0,
    forks: project.forks_count ?? 0,
    watchers: project.star_count ?? 0,
    primaryLanguage: primaryLanguageName ? { name: primaryLanguageName, color: '#8b8b8b' } : null,
    languages,
    topics: project.tag_list ?? project.topics ?? [],
    contributors,
    commitWeeks,
    createdAt: project.created_at ?? '',
    pushedAt: project.last_activity_at ?? '',
  }
}
