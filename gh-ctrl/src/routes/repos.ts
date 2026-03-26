import { Hono } from 'hono'
import { db } from '../db'
import { repos } from '../db/schema'
import { eq } from 'drizzle-orm'
import { glabApi, encodeProjectPath } from '../providers/gitlab'

const app = new Hono()

// GET /api/repos — list all repos
app.get('/', async (c) => {
  const allRepos = await db.select().from(repos)
  return c.json(allRepos)
})

// POST /api/repos — add a repo
app.post('/', async (c) => {
  const body = await c.req.json()
  const { fullName, color, description, provider = 'github' } = body
  let instanceUrl: string | null = body.instanceUrl || null
  const gitlabToken: string | null = body.gitlabToken || null

  if (!fullName) {
    return c.json({ error: 'fullName must be in "owner/repo" format or a GitHub/GitLab URL' }, 400)
  }

  let canonicalFullName: string
  let owner: string
  let name: string

  if (provider === 'gitlab') {
    // Normalize GitLab URLs to namespace/project format
    let normalized = fullName.trim()

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      // Parse the full URL to extract the instance base and project path
      try {
        const parsed = new URL(normalized)
        const detectedBase = `${parsed.protocol}//${parsed.host}`
        if (!instanceUrl && detectedBase !== 'https://gitlab.com') {
          instanceUrl = detectedBase
        }
        normalized = parsed.pathname.replace(/^\//, '')
      } catch {
        // Not a valid URL — fall through
      }
    } else {
      // Strip known base prefix if present
      const gitlabBase = (instanceUrl ?? 'https://gitlab.com').replace(/\/$/, '')
      if (normalized.startsWith(gitlabBase + '/')) {
        normalized = normalized.slice(gitlabBase.length + 1)
      }
    }
    // Remove trailing .git
    normalized = normalized.replace(/\.git$/, '')

    // Validate project exists via GitLab API
    const { data, error } = await glabApi(
      `/projects/${encodeProjectPath(normalized)}`,
      { instanceUrl, token: gitlabToken }
    )
    if (error || !data) {
      return c.json({ error: error ?? 'GitLab project not found' }, 404)
    }

    canonicalFullName = data.path_with_namespace ?? normalized
    const parts = canonicalFullName.split('/')
    name = parts.pop()!
    owner = parts.join('/')
  } else {
    // Validate repo exists via gh CLI and get canonical nameWithOwner
    // This also normalizes URLs (e.g. https://github.com/owner/repo) to owner/repo format
    const check = Bun.spawnSync(['gh', 'repo', 'view', fullName, '--json', 'nameWithOwner'])
    if (check.exitCode !== 0) {
      const stderr = check.stderr.toString()
      const isAuthError = /not logged in|auth login|authentication|401|403|credentials|token/i.test(stderr)
      if (isAuthError) {
        return c.json({ error: 'Not authenticated with GitHub CLI. Please run "gh auth login" to authenticate.' }, 401)
      }
      return c.json({ error: 'Repository not found on GitHub' }, 404)
    }

    try {
      const ghData = JSON.parse(check.stdout.toString())
      canonicalFullName = ghData.nameWithOwner
    } catch {
      return c.json({ error: 'Failed to parse GitHub API response' }, 500)
    }

    const parts = canonicalFullName.split('/')
    owner = parts[0]
    name = parts[1]
  }

  try {
    const result = await db.insert(repos).values({
      owner,
      name,
      fullName: canonicalFullName,
      description: description || null,
      color: color || '#00ff88',
      provider,
      instanceUrl: instanceUrl || null,
      gitlabToken: gitlabToken || null,
    }).returning()

    return c.json(result[0], 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Repository already added' }, 409)
    }
    return c.json({ error: 'Failed to add repository' }, 500)
  }
})

// PATCH /api/repos/:id — update color/description
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = {}

  if (body.color) updates.color = body.color
  if (body.description !== undefined) updates.description = body.description

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  const result = await db.update(repos).set(updates).where(eq(repos.id, id)).returning()

  if (result.length === 0) {
    return c.json({ error: 'Repo not found' }, 404)
  }

  return c.json(result[0])
})

// DELETE /api/repos/:id — remove a repo
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.delete(repos).where(eq(repos.id, id)).returning()

  if (result.length === 0) {
    return c.json({ error: 'Repo not found' }, 404)
  }

  return c.json({ ok: true })
})

export default app
