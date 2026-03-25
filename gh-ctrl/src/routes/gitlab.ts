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

/** Resolve project path and instanceUrl from request params + DB. */
async function resolveProject(
  c: Parameters<Parameters<typeof app.get>[1]>[0]
): Promise<{ projectPath: string; instanceUrl: string | null } | null> {
  const namespace = c.req.param('namespace')
  const project = c.req.param('project')
  const queryPath = c.req.query('path')
  const projectPath = queryPath || `${namespace}/${project}`

  // Look up the repo in DB to get instanceUrl (if any)
  const row = await db
    .select()
    .from(repos)
    .where(eq(repos.fullName, projectPath))
    .get()

  const instanceUrl = row?.instanceUrl ?? process.env.GITLAB_INSTANCE_URL ?? null

  return { projectPath, instanceUrl }
}

// ---------------------------------------------------------------------------
// Dashboard data
// ---------------------------------------------------------------------------

// GET /api/gitlab/repo/:namespace/:project — fetch live data for a single repo
app.get('/repo/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const data = await fetchGitLabRepoData(resolved.projectPath, resolved.instanceUrl)
  return c.json(data)
})

// ---------------------------------------------------------------------------
// Meta (stars, languages, topics, contributors)
// ---------------------------------------------------------------------------

// GET /api/gitlab/meta/:namespace/:project
app.get('/meta/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const meta = await fetchGitLabRepoMeta(resolved.projectPath, resolved.instanceUrl)
  return c.json(meta)
})

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

// GET /api/gitlab/labels/:namespace/:project — list available labels
app.get('/labels/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const encoded = encodeProjectPath(resolved.projectPath)
  const result = await glabApi(`/projects/${encoded}/labels?per_page=100`, {
    instanceUrl: resolved.instanceUrl,
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

  const encoded = encodeProjectPath(fullName)
  const resource = type === 'mr' || type === 'pr' ? 'merge_requests' : 'issues'

  // Fetch current labels first
  const currentResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, { instanceUrl })
  if (currentResult.error) return c.json({ error: currentResult.error }, 500)

  const currentLabels: string[] = currentResult.data?.labels ?? []
  if (!currentLabels.includes(label)) currentLabels.push(label)

  const updateResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, {
    instanceUrl,
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

  const encoded = encodeProjectPath(fullName)
  const resource = type === 'mr' || type === 'pr' ? 'merge_requests' : 'issues'

  // Fetch current labels first
  const currentResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, { instanceUrl })
  if (currentResult.error) return c.json({ error: currentResult.error }, 500)

  const currentLabels: string[] = (currentResult.data?.labels ?? []).filter((l: string) => l !== label)

  const updateResult = await glabApi(`/projects/${encoded}/${resource}/${number}`, {
    instanceUrl,
    method: 'PUT',
    body: { labels: currentLabels.join(',') },
  })
  if (updateResult.error) return c.json({ error: updateResult.error }, 500)

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

// GET /api/gitlab/branches/:namespace/:project — list branches sorted by commit date desc
app.get('/branches/:namespace/:project', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const encoded = encodeProjectPath(resolved.projectPath)
  const [branchResult, projectResult] = await Promise.all([
    glabApi(
      `/projects/${encoded}/repository/branches?per_page=100&order_by=updated_at&sort=desc`,
      { instanceUrl: resolved.instanceUrl }
    ),
    glabApi(`/projects/${encoded}`, { instanceUrl: resolved.instanceUrl }),
  ])

  if (branchResult.error) return c.json({ error: branchResult.error }, 500)

  const defaultBranch: string = projectResult.data?.default_branch ?? 'main'
  const branches = (branchResult.data ?? []).map((b: any) => ({
    name: b.name,
    committedDate: b.commit?.committed_date ?? b.commit?.created_at ?? '',
  }))

  return c.json({ branches, defaultBranch })
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
    { instanceUrl: resolved.instanceUrl }
  )
  if (result.error) return c.json({ error: result.error }, 500)

  return c.json({
    ahead: result.data?.commits?.length ?? 0,
    behind: 0, // GitLab compare does not return behind count directly
  })
})

// DELETE /api/gitlab/branch/:namespace/:project/:branch — delete a branch
app.delete('/branch/:namespace/:project/:branch', async (c) => {
  const resolved = await resolveProject(c)
  if (!resolved) return c.json({ error: 'Could not resolve project' }, 400)

  const branch = decodeURIComponent(c.req.param('branch'))
  const encoded = encodeProjectPath(resolved.projectPath)

  const result = await glabApi(
    `/projects/${encoded}/repository/branches/${encodeURIComponent(branch)}`,
    { instanceUrl: resolved.instanceUrl, method: 'DELETE' }
  )
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json({ ok: true })
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

  const encoded = encodeProjectPath(fullName)
  const result = await glabApi(`/projects/${encoded}/issues`, {
    instanceUrl,
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

  const encoded = encodeProjectPath(fullName)
  const result = await glabApi(`/projects/${encoded}/merge_requests`, {
    instanceUrl,
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

  const encoded = encodeProjectPath(fullName)
  const resource = type === 'mr' || type === 'pr' ? 'merge_requests' : 'issues'

  const result = await glabApi(`/projects/${encoded}/${resource}/${number}/notes`, {
    instanceUrl,
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
