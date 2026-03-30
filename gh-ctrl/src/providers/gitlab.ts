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
import {db} from "../db";
import {repos} from "../db/schema";
import {eq} from "drizzle-orm";
import app from "../routes/gitlab";

const CLAUDE_LABELS = ['claude', 'ai', 'ai-fix', 'ai-feature']

/** Encode a project path (namespace/name) for use in GitLab API URLs. */
export function encodeProjectPath(path: string): string {
  return encodeURIComponent(path)
}

export interface GLResult {
  data: any
  error: string | null
}

export async function glab(args: string[]): Promise<GLResult> {
  const proc = Bun.spawn(['glab', ...args], { env: { ...process.env }, stdio: ['inherit', 'pipe', 'pipe'] })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    return { data: null, error: stderr }
  }
  if (stdout.trim() === '') return { data: null, error: null }
  try {
    return { data: JSON.parse(stdout), error: null }
  } catch {
    return { data: null, error: 'Failed to parse glab output' }
  }
}

export async function glabAuthToken(instanceUrl?: string | null): Promise<string | null> {
  return null
}

/** Low-level GitLab REST API v4 fetch helper — proxies through `glab api` to handle OAuth refresh. */
export async function glabApi(
  path: string,
  options: { instanceUrl?: string | null; token?: string | null; method?: string; body?: unknown } = {}
): Promise<{ data: any; error: string | null }> {
  const hostname = options.instanceUrl
    ? new URL(options.instanceUrl.replace(/\/$/, '')).hostname
    : 'gitlab.com'

  const args = ['api', path, '--hostname', hostname]

  if (options.method && options.method !== 'GET') {
    args.push('--method', options.method)
  }

  if (options.body !== undefined) {
    for (const [key, value] of Object.entries(options.body as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        args.push('-f', `${key}=${value}`)
      }
    }
  }

  try {
    const proc = Bun.spawn(['glab', ...args], {
      env: { ...process.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ])

    if (exitCode !== 0) {
      return { data: null, error: stderr.trim() || 'glab api call failed' }
    }

    if (!stdout.trim()) return { data: null, error: null }

    try {
      return { data: JSON.parse(stdout), error: null }
    } catch {
      return { data: null, error: 'Failed to parse glab output' }
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
  if (gl.approved) return 'approved'
  if (gl.blocking_discussions_resolved === false) return 'changes_requested'
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
  instanceUrl?: string | null,
  token?: string | null
): Promise<NormalizedRepoData> {
  const encoded = encodeProjectPath(projectPath)
  const opts = { instanceUrl, token }

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
    glabApi(`/projects/${encoded}/merge_requests?state=opened&per_page=30&with_merge_status_recheck=true`, opts),
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
  instanceUrl?: string | null,
  token?: string | null
): Promise<NormalizedRepoMeta> {
  const encoded = encodeProjectPath(projectPath)
  const opts = { instanceUrl, token }

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
