/**
 * GitLab API routes — mirrors the structure of github.ts routes.
 *
 * Routes are mounted at /api/gitlab.
 * Project paths (e.g. "group/project") are passed as ":namespace/:project" path params.
 * For nested groups (e.g. "group/sub/project"), the full path should be passed as a query
 * param: ?path=group/sub/project, falling back to :namespace/:project.
 *
 * Authentication: Set GITLAB_TOKEN env var with a GitLab Personal Access Token.
 * Self-hosted GitLab: Set GITLAB_INSTANCE_URL env var or pass instanceUrl in request body.
 */

import { Hono } from 'hono'
import { db } from '../db'
import { repos } from '../db/schema'
import { eq } from 'drizzle-orm'
import {
  glabApi,
  encodeProjectPath,
  fetchGitLabRepoData,
  fetchGitLabRepoMeta,
  normalizeMR,
  normalizeIssue,
} from '../providers/gitlab'

const app = new Hono()

/** Resolve project path, instanceUrl, and gitlabToken from request params + DB. */
async function resolveProject(
  c: Parameters<Parameters<typeof app.get>[1]>[0]
): Promise<{ projectPath: string; instanceUrl: string | null; gitlabToken: string | null } | null> {
  const namespace = c.req.param('namespace')
  const project = c.req.param('project')
  const queryPath = c.req.query('path')
  const projectPath = queryPath || `${namespace}/${project}`

  // Look up the repo in DB to get instanceUrl and gitlabToken (if any)
  const row = await db
    .select()
    .from(repos)
    .where(eq(repos.fullName, projectPath))
    .get()

  const instanceUrl = row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null
  const gitlabToken = row?.gitlabToken ?? null

  return { projectPath, instanceUrl, gitlabToken }
}

// ---------------------------------------------------------------------------
// Dashboard data
// ---------------------------------------------------------------------------

// GET /api/gitlab/repo?path=namespace/project — fetch live data (query-param form for nested groups)
app.get('/repo', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const data = await fetchGitLabRepoData(resolved.projectPath, resolved.instanceUrl, resolved.gitlabToken)
  return c.json(data)
})

// GET /api/gitlab/repo/:namespace/:project — fetch live data for a single repo
app.get('/repo/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const data = await fetchGitLabRepoData(resolved.projectPath, resolved.instanceUrl, resolved.gitlabToken)
  return c.json(data)
})

// ---------------------------------------------------------------------------
// Meta (stars, languages, topics, contributors)
// ---------------------------------------------------------------------------

// GET /api/gitlab/meta?path=namespace/project — (query-param form for nested groups)
app.get('/meta', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const meta = await fetchGitLabRepoMeta(resolved.projectPath, resolved.instanceUrl, resolved.gitlabToken)
  return c.json(meta)
})

// GET /api/gitlab/meta/:namespace/:project
app.get('/meta/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const meta = await fetchGitLabRepoMeta(resolved.projectPath, resolved.instanceUrl, resolved.gitlabToken)
  return c.json(meta)
})

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

// GET /api/gitlab/labels?path=namespace/project — (query-param form for nested groups)
app.get('/labels', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const encoded = encodeProjectPath(resolved.projectPath)
  const result = await glabApi(`/projects/${encoded}/labels?per_page=100`, {
    instanceUrl: resolved.instanceUrl,
    token: resolved.gitlabToken,
  })
  if (result.error) return c.json({ error: result.error }, 500)
  const labels = (result.data ?? []).map((l: any) => ({
    name: l.name,
    color: l.color,
    description: l.description ?? '',
  }))
  return c.json(labels)
})

// GET /api/gitlab/labels/:namespace/:project — list available labels
app.get('/labels/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const encoded = encodeProjectPath(resolved.projectPath)
  const result = await glabApi(`/projects/${encoded}/labels?per_page=100`, {
    instanceUrl: resolved.instanceUrl,
    token: resolved.gitlabToken,
  })
  if (result.error) return c.json({ error: result.error }, 500)

  const labels = (result.data ?? []).map((l: any) => ({
    name: l.name,
    color: l.color,
    description: l.description ?? '',
  }))
  return c.json(labels)
})

// POST /api/gitlab/label — add a label to an MR or issue
app.post('/label', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, label, instanceUrl: bodyInstanceUrl } = body

  if (!fullName || !number || !type || !label) {
    return c.json({ error: 'Missing required fields: fullName, number, type, label' }, 400)
  }

  const row = await db.select().from(repos).where(eq(repos.fullName, fullName)).get()
  const instanceUrl = bodyInstanceUrl ?? row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null
  const token = row?.gitlabToken ?? null

  const encoded = encodeProjectPath(fullName)
  const resource = type === 'mr' || type === 'pr' ? 'merge_requests' : 'issues'

  // Fetch current labels first
  const currentResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, { instanceUrl, token })
  if (currentResult.error) return c.json({ error: currentResult.error }, 500)

  const currentLabels: string[] = currentResult.data?.labels ?? []
  if (!currentLabels.includes(label)) currentLabels.push(label)

  const updateResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, {
    instanceUrl,
    token,
    method: 'PUT',
    body: { labels: currentLabels.join(',') },
  })
  if (updateResult.error) return c.json({ error: updateResult.error }, 500)

  return c.json({ ok: true })
})

// DELETE /api/gitlab/label — remove a label from an MR or issue
app.delete('/label', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, label, instanceUrl: bodyInstanceUrl } = body

  if (!fullName || !number || !type || !label) {
    return c.json({ error: 'Missing required fields: fullName, number, type, label' }, 400)
  }

  const row = await db.select().from(repos).where(eq(repos.fullName, fullName)).get()
  const instanceUrl = bodyInstanceUrl ?? row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null
  const token = row?.gitlabToken ?? null

  const encoded = encodeProjectPath(fullName)
  const resource = type === 'mr' || type === 'pr' ? 'merge_requests' : 'issues'

  // Fetch current labels first
  const currentResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, { instanceUrl, token })
  if (currentResult.error) return c.json({ error: currentResult.error }, 500)

  const currentLabels: string[] = (currentResult.data?.labels ?? []).filter((l: string) => l !== label)

  const updateResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, {
    instanceUrl,
    token,
    method: 'PUT',
    body: { labels: currentLabels.join(',') },
  })
  if (updateResult.error) return c.json({ error: updateResult.error }, 500)

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

// GET /api/gitlab/branches?path=namespace/project — (query-param form for nested groups)
app.get('/branches', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const encoded = encodeProjectPath(resolved.projectPath)
  const [branchResult, projectResult] = await Promise.all([
    glabApi(
      `/projects/${encoded}/repository/branches?per_page=100&order_by=updated_at&sort=desc`,
      { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }
    ),
    glabApi(`/projects/${encoded}`, { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }),
  ])
  if (branchResult.error) return c.json({ error: branchResult.error }, 500)
  const defaultBranch: string = projectResult.data?.default_branch ?? 'main'
  const branches = (branchResult.data ?? []).map((b: any) => ({
    name: b.name,
    committedDate: b.commit?.committed_date ?? b.commit?.created_at ?? '',
  }))
  return c.json({ branches, defaultBranch })
})

// GET /api/gitlab/branches/:namespace/:project — list branches sorted by commit date desc
app.get('/branches/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const encoded = encodeProjectPath(resolved.projectPath)
  const [branchResult, projectResult] = await Promise.all([
    glabApi(
      `/projects/${encoded}/repository/branches?per_page=100&order_by=updated_at&sort=desc`,
      { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }
    ),
    glabApi(`/projects/${encoded}`, { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }),
  ])

  if (branchResult.error) return c.json({ error: branchResult.error }, 500)

  const defaultBranch: string = projectResult.data?.default_branch ?? 'main'
  const branches = (branchResult.data ?? []).map((b: any) => ({
    name: b.name,
    committedDate: b.commit?.committed_date ?? b.commit?.created_at ?? '',
  }))

  return c.json({ branches, defaultBranch })
})

// GET /api/gitlab/branch-compare?path=namespace/project&branch=feat/x&base=main — (query-param form)
app.get('/branch-compare', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const branch = c.req.query('branch') ?? ''
  const base = c.req.query('base') || 'main'
  if (!branch) return c.json({ error: 'branch query param is required' }, 400)
  const encoded = encodeProjectPath(resolved.projectPath)
  const result = await glabApi(
    `/projects/${encoded}/repository/compare?from=${encodeURIComponent(base)}&to=${encodeURIComponent(branch)}`,
    { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }
  )
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ahead: result.data?.commits?.length ?? 0, behind: 0 })
})

// GET /api/gitlab/branch-compare/:namespace/:project/:branch — ahead/behind vs default branch
app.get('/branch-compare/:namespace/:project/:branch', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const branch = decodeURIComponent(c.req.param('branch'))
  const base = c.req.query('base') || 'main'
  const encoded = encodeProjectPath(resolved.projectPath)

  const result = await glabApi(
    `/projects/${encoded}/repository/compare?from=${encodeURIComponent(base)}&to=${encodeURIComponent(branch)}`,
    { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }
  )
  if (result.error) return c.json({ error: result.error }, 500)

  return c.json({
    ahead: result.data?.commits?.length ?? 0,
    behind: 0, // GitLab compare does not return behind count directly
  })
})

// DELETE /api/gitlab/branch?path=namespace/project&branch=feat/x — (query-param form)
app.delete('/branch', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const branch = c.req.query('branch') ?? ''
  if (!branch) return c.json({ error: 'branch query param is required' }, 400)
  const encoded = encodeProjectPath(resolved.projectPath)
  const result = await glabApi(
    `/projects/${encoded}/repository/branches/${encodeURIComponent(branch)}`,
    { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken, method: 'DELETE' }
  )
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

// DELETE /api/gitlab/branch/:namespace/:project/:branch — delete a branch
app.delete('/branch/:namespace/:project/:branch', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const branch = decodeURIComponent(c.req.param('branch'))
  const encoded = encodeProjectPath(resolved.projectPath)

  const result = await glabApi(
    `/projects/${encoded}/repository/branches/${encodeURIComponent(branch)}`,
    { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken, method: 'DELETE' }
  )
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Single MR / Issue detail views
// ---------------------------------------------------------------------------

// GET /api/gitlab/mr?path=namespace/project&number=42 — (query-param form for nested groups)
app.get('/mr', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const number = c.req.query('number') ?? ''
  if (!number) return c.json({ error: 'number query param is required' }, 400)
  const encoded = encodeProjectPath(resolved.projectPath)
  const opts = { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }
  const [mrResult, notesResult] = await Promise.all([
    glabApi(`/projects/${encoded}/merge_requests/${number}`, opts),
    glabApi(`/projects/${encoded}/merge_requests/${number}/notes?per_page=100`, opts),
  ])
  if (mrResult.error) return c.json({ error: mrResult.error }, 404)
  const mr = mrResult.data
  const notes = (notesResult.data ?? []).filter((n: any) => !n.system)
  return c.json({
    number: mr.iid,
    title: mr.title,
    body: mr.description ?? '',
    state: mr.state,
    labels: (mr.labels ?? []).map((name: string) => ({ name, color: '6366f1' })),
    assignees: (mr.assignees ?? (mr.assignee ? [mr.assignee] : [])).map((u: any) => ({ login: u.username })),
    author: { login: mr.author?.username ?? '' },
    url: mr.web_url,
    createdAt: mr.created_at,
    reviewDecision: mr.approved ? 'APPROVED' : null,
    mergeable: mr.merge_status === 'can_be_merged' ? 'MERGEABLE' : mr.merge_status === 'cannot_be_merged' ? 'CONFLICTING' : 'UNKNOWN',
    headRefName: mr.source_branch,
    baseRefName: mr.target_branch,
    isDraft: mr.draft ?? mr.work_in_progress ?? false,
    comments: notes.map((n: any) => ({
      author: { login: n.author?.username ?? '' },
      body: n.body,
      createdAt: n.created_at,
    })),
  })
})

// GET /api/gitlab/mr/:namespace/:project/:number — fetch a single MR with comments
app.get('/mr/:namespace/:project/:number', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const number = c.req.param('number')
  const encoded = encodeProjectPath(resolved.projectPath)
  const opts = { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }

  const [mrResult, notesResult] = await Promise.all([
    glabApi(`/projects/${encoded}/merge_requests/${number}`, opts),
    glabApi(`/projects/${encoded}/merge_requests/${number}/notes?per_page=100`, opts),
  ])

  if (mrResult.error) return c.json({ error: mrResult.error }, 404)

  const mr = mrResult.data
  const notes = (notesResult.data ?? []).filter((n: any) => !n.system)

  return c.json({
    number: mr.iid,
    title: mr.title,
    body: mr.description ?? '',
    state: mr.state,
    labels: (mr.labels ?? []).map((name: string) => ({ name, color: '6366f1' })),
    assignees: (mr.assignees ?? (mr.assignee ? [mr.assignee] : [])).map((u: any) => ({ login: u.username })),
    author: { login: mr.author?.username ?? '' },
    url: mr.web_url,
    createdAt: mr.created_at,
    reviewDecision: mr.approved ? 'APPROVED' : null,
    mergeable: mr.merge_status === 'can_be_merged' ? 'MERGEABLE' : mr.merge_status === 'cannot_be_merged' ? 'CONFLICTING' : 'UNKNOWN',
    headRefName: mr.source_branch,
    baseRefName: mr.target_branch,
    isDraft: mr.draft ?? mr.work_in_progress ?? false,
    comments: notes.map((n: any) => ({
      author: { login: n.author?.username ?? '' },
      body: n.body,
      createdAt: n.created_at,
    })),
  })
})

// GET /api/gitlab/issue?path=namespace/project&number=42 — (query-param form for nested groups)
app.get('/issue', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)
  const number = c.req.query('number') ?? ''
  if (!number) return c.json({ error: 'number query param is required' }, 400)
  const encoded = encodeProjectPath(resolved.projectPath)
  const opts = { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }
  const [issueResult, notesResult] = await Promise.all([
    glabApi(`/projects/${encoded}/issues/${number}`, opts),
    glabApi(`/projects/${encoded}/issues/${number}/notes?per_page=100`, opts),
  ])
  if (issueResult.error) return c.json({ error: issueResult.error }, 404)
  const issue = issueResult.data
  const notes = (notesResult.data ?? []).filter((n: any) => !n.system)
  return c.json({
    number: issue.iid,
    title: issue.title,
    body: issue.description ?? '',
    state: issue.state,
    labels: (issue.labels ?? []).map((name: string) => ({ name, color: '6366f1' })),
    assignees: (issue.assignees ?? (issue.assignee ? [issue.assignee] : [])).map((u: any) => ({ login: u.username })),
    author: { login: issue.author?.username ?? '' },
    url: issue.web_url,
    createdAt: issue.created_at,
    comments: notes.map((n: any) => ({
      author: { login: n.author?.username ?? '' },
      body: n.body,
      createdAt: n.created_at,
    })),
  })
})

// GET /api/gitlab/issue/:namespace/:project/:number — fetch a single issue with comments
app.get('/issue/:namespace/:project/:number', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const number = c.req.param('number')
  const encoded = encodeProjectPath(resolved.projectPath)
  const opts = { instanceUrl: resolved.instanceUrl, token: resolved.gitlabToken }

  const [issueResult, notesResult] = await Promise.all([
    glabApi(`/projects/${encoded}/issues/${number}`, opts),
    glabApi(`/projects/${encoded}/issues/${number}/notes?per_page=100`, opts),
  ])

  if (issueResult.error) return c.json({ error: issueResult.error }, 404)

  const issue = issueResult.data
  const notes = (notesResult.data ?? []).filter((n: any) => !n.system)

  return c.json({
    number: issue.iid,
    title: issue.title,
    body: issue.description ?? '',
    state: issue.state,
    labels: (issue.labels ?? []).map((name: string) => ({ name, color: '6366f1' })),
    assignees: (issue.assignees ?? (issue.assignee ? [issue.assignee] : [])).map((u: any) => ({ login: u.username })),
    author: { login: issue.author?.username ?? '' },
    url: issue.web_url,
    createdAt: issue.created_at,
    comments: notes.map((n: any) => ({
      author: { login: n.author?.username ?? '' },
      body: n.body,
      createdAt: n.created_at,
    })),
  })
})

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

// POST /api/gitlab/create-issue — create a new issue
app.post('/create-issue', async (c) => {
  const body = await c.req.json()
  const { fullName, title, description, labels, instanceUrl: bodyInstanceUrl } = body

  if (!fullName || !title) {
    return c.json({ error: 'Missing required fields: fullName, title' }, 400)
  }

  const row = await db.select().from(repos).where(eq(repos.fullName, fullName)).get()
  const instanceUrl = bodyInstanceUrl ?? row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null
  const token = row?.gitlabToken ?? null

  const encoded = encodeProjectPath(fullName)
  const result = await glabApi(`/projects/${encoded}/issues`, {
    instanceUrl,
    token,
    method: 'POST',
    body: {
      title,
      description: description ?? '',
      labels: Array.isArray(labels) ? labels.join(',') : (labels ?? ''),
    },
  })

  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(normalizeIssue(result.data), 201)
})

// ---------------------------------------------------------------------------
// Merge Requests
// ---------------------------------------------------------------------------

// POST /api/gitlab/create-mr — create a new merge request
app.post('/create-mr', async (c) => {
  const body = await c.req.json()
  const {
    fullName,
    title,
    sourceBranch,
    targetBranch,
    description,
    labels,
    draft,
    instanceUrl: bodyInstanceUrl,
  } = body

  if (!fullName || !title || !sourceBranch || !targetBranch) {
    return c.json(
      { error: 'Missing required fields: fullName, title, sourceBranch, targetBranch' },
      400
    )
  }

  const row = await db.select().from(repos).where(eq(repos.fullName, fullName)).get()
  const instanceUrl = bodyInstanceUrl ?? row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null
  const token = row?.gitlabToken ?? null

  const encoded = encodeProjectPath(fullName)
  const result = await glabApi(`/projects/${encoded}/merge_requests`, {
    instanceUrl,
    token,
    method: 'POST',
    body: {
      title: draft ? `Draft: ${title}` : title,
      source_branch: sourceBranch,
      target_branch: targetBranch,
      description: description ?? '',
      labels: Array.isArray(labels) ? labels.join(',') : (labels ?? ''),
    },
  })

  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(normalizeMR(result.data), 201)
})

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

// POST /api/gitlab/comment — post a comment on an MR or issue
app.post('/comment', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, comment, instanceUrl: bodyInstanceUrl } = body

  if (!fullName || !number || !type || !comment) {
    return c.json({ error: 'Missing required fields: fullName, number, type, comment' }, 400)
  }

  const row = await db.select().from(repos).where(eq(repos.fullName, fullName)).get()
  const instanceUrl = bodyInstanceUrl ?? row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null
  const token = row?.gitlabToken ?? null

  const encoded = encodeProjectPath(fullName)
  const resource = type === 'mr' || type === 'pr' ? 'merge_requests' : 'issues'

  const result = await glabApi(`/projects/${encoded}/${resource}/${number}/notes`, {
    instanceUrl,
    token,
    method: 'POST',
    body: { body: comment },
  })

  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Setup validation — validate that a GitLab repo path is accessible
// Used by the repos route when adding a GitLab repo
// ---------------------------------------------------------------------------

// GET /api/gitlab/validate?path=namespace/project — validate a GitLab project exists
app.get('/validate', async (c) => {
  const projectPath = c.req.query('path')
  const instanceUrl = c.req.query('instanceUrl') || process.env.GITLAB_INSTANCE_URL || null

  if (!projectPath) return c.json({ error: 'path query param is required' }, 400)

  const encoded = encodeProjectPath(projectPath)
  const result = await glabApi(`/projects/${encoded}`, { instanceUrl })

  if (result.error) return c.json({ error: result.error }, 404)

  return c.json({
    valid: true,
    nameWithNamespace: result.data?.path_with_namespace ?? projectPath,
    description: result.data?.description ?? '',
    defaultBranch: result.data?.default_branch ?? 'main',
  })
})

export default app
