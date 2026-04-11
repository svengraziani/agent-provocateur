import { Hono } from 'hono'
import { db } from '../db'
import {
  sourceRelayConnectors,
  sourceRelayFetchers,
  sourceRelayConnectorFiles,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'

// Authenticated management router — mounted at /api/source-relay
const app = new Hono()

// Public router — mounted at /source-relay (outside auth middleware)
export const sourceRelayPublicRouter = new Hono()

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

// GET /:buildingId/connectors — list connectors (tokens redacted)
app.get('/:buildingId/connectors', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const rows = await db
    .select()
    .from(sourceRelayConnectors)
    .where(eq(sourceRelayConnectors.buildingId, buildingId))
  return c.json(
    rows.map((r) => {
      let cfg: Record<string, unknown> = {}
      try { cfg = JSON.parse(r.configuration) } catch { /* empty */ }
      return { ...r, configuration: JSON.stringify({ ...cfg, token: cfg.token ? true : undefined }), hasToken: !!cfg.token }
    }),
  )
})

// POST /:buildingId/connectors — create connector
app.post('/:buildingId/connectors', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const body = await c.req.json()
  const { name, type = 'git', configuration = {} } = body
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400)
  const result = await db
    .insert(sourceRelayConnectors)
    .values({
      buildingId,
      name: String(name).trim(),
      type: String(type),
      configuration:
        typeof configuration === 'string' ? configuration : JSON.stringify(configuration),
    })
    .returning()
  const r = result[0]
  let cfg: Record<string, unknown> = {}
  try { cfg = JSON.parse(r.configuration) } catch { /* empty */ }
  return c.json({ ...r, configuration: JSON.stringify({ ...cfg, token: cfg.token ? true : undefined }), hasToken: !!cfg.token }, 201)
})

// PATCH /:buildingId/connectors/:connectorId — update connector (token preserved if not supplied)
app.patch('/:buildingId/connectors/:connectorId', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const connectorId = Number(c.req.param('connectorId'))
  const body = await c.req.json()

  const existing = await db
    .select()
    .from(sourceRelayConnectors)
    .where(
      and(
        eq(sourceRelayConnectors.id, connectorId),
        eq(sourceRelayConnectors.buildingId, buildingId),
      ),
    )
  if (existing.length === 0) return c.json({ error: 'Connector not found' }, 404)

  const updates: Record<string, string> = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.type !== undefined) updates.type = String(body.type)
  if (body.configuration !== undefined) {
    const existingCfg: Record<string, unknown> = {}
    try { Object.assign(existingCfg, JSON.parse(existing[0].configuration)) } catch { /* empty */ }
    const newCfg: Record<string, unknown> =
      typeof body.configuration === 'string'
        ? JSON.parse(body.configuration)
        : { ...body.configuration }
    // Preserve existing token if the incoming value is falsy or the sentinel `true`
    if (!newCfg.token || newCfg.token === true) {
      newCfg.token = existingCfg.token
    }
    updates.configuration = JSON.stringify(newCfg)
  }

  const result = await db
    .update(sourceRelayConnectors)
    .set(updates)
    .where(
      and(
        eq(sourceRelayConnectors.id, connectorId),
        eq(sourceRelayConnectors.buildingId, buildingId),
      ),
    )
    .returning()
  if (result.length === 0) return c.json({ error: 'Connector not found' }, 404)
  const r = result[0]
  let cfg: Record<string, unknown> = {}
  try { cfg = JSON.parse(r.configuration) } catch { /* empty */ }
  return c.json({ ...r, configuration: JSON.stringify({ ...cfg, token: cfg.token ? true : undefined }), hasToken: !!cfg.token })
})

// DELETE /:buildingId/connectors/:connectorId
app.delete('/:buildingId/connectors/:connectorId', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const connectorId = Number(c.req.param('connectorId'))
  await db
    .delete(sourceRelayConnectors)
    .where(
      and(
        eq(sourceRelayConnectors.id, connectorId),
        eq(sourceRelayConnectors.buildingId, buildingId),
      ),
    )
  return c.json({ ok: true })
})

// GET /:buildingId/git-tree?connectorId=X — browse git repo file tree via stored connector
app.get('/:buildingId/git-tree', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const connectorId = Number(c.req.query('connectorId') ?? '0')
  const branch = c.req.query('branch')

  const [connector] = await db
    .select()
    .from(sourceRelayConnectors)
    .where(
      and(
        eq(sourceRelayConnectors.id, connectorId),
        eq(sourceRelayConnectors.buildingId, buildingId),
      ),
    )
  if (!connector) return c.json({ error: 'Connector not found' }, 404)

  let cfg: Record<string, unknown> = {}
  try { cfg = JSON.parse(connector.configuration) } catch { /* empty */ }

  const repoUrl = cfg.url as string | undefined
  const repoBranch = branch ?? (cfg.branch as string | undefined) ?? 'main'
  const repoToken = cfg.token as string | undefined

  if (!repoUrl) return c.json({ error: 'Connector has no URL configured' }, 400)

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/?$)/)
  if (!match) return c.json({ error: 'Only GitHub repository URLs are supported for file browsing' }, 400)

  const [, owner, repo] = match
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${repoBranch}?recursive=1`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'vibe-and-conquer',
  }
  if (repoToken) headers['Authorization'] = `Bearer ${repoToken}`

  const res = await fetch(apiUrl, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    return c.json({ error: (err as { message?: string }).message ?? res.statusText }, res.status as 400 | 404 | 422 | 500)
  }

  const data = (await res.json()) as {
    tree: Array<{ path: string; type: string; size?: number }>
  }
  const files = data.tree.filter((item) => item.type === 'blob')
  return c.json({ files: files.map((f) => ({ path: f.path, size: f.size })) })
})

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

// GET /:buildingId/fetchers — list fetchers with their connector assignments
app.get('/:buildingId/fetchers', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const fetchers = await db
    .select()
    .from(sourceRelayFetchers)
    .where(eq(sourceRelayFetchers.buildingId, buildingId))

  const result = await Promise.all(
    fetchers.map(async (f) => {
      const connFiles = await db
        .select()
        .from(sourceRelayConnectorFiles)
        .where(eq(sourceRelayConnectorFiles.fetcherId, f.id))
      return { ...f, connectorFiles: connFiles }
    }),
  )
  return c.json(result)
})

// POST /:buildingId/fetchers — create fetcher with a random unique token
app.post('/:buildingId/fetchers', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const body = await c.req.json()
  const { name } = body
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400)

  const uniqueToken = crypto.randomUUID().replace(/-/g, '')
  const result = await db
    .insert(sourceRelayFetchers)
    .values({ buildingId, name: String(name).trim(), uniqueToken })
    .returning()
  return c.json({ ...result[0], connectorFiles: [] }, 201)
})

// PATCH /:buildingId/fetchers/:fetcherId — rename fetcher
app.patch('/:buildingId/fetchers/:fetcherId', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const fetcherId = Number(c.req.param('fetcherId'))
  const body = await c.req.json()
  const updates: Record<string, string> = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  const result = await db
    .update(sourceRelayFetchers)
    .set(updates)
    .where(
      and(
        eq(sourceRelayFetchers.id, fetcherId),
        eq(sourceRelayFetchers.buildingId, buildingId),
      ),
    )
    .returning()
  if (result.length === 0) return c.json({ error: 'Fetcher not found' }, 404)
  return c.json(result[0])
})

// DELETE /:buildingId/fetchers/:fetcherId
app.delete('/:buildingId/fetchers/:fetcherId', async (c) => {
  const buildingId = Number(c.req.param('buildingId'))
  const fetcherId = Number(c.req.param('fetcherId'))
  await db
    .delete(sourceRelayFetchers)
    .where(
      and(
        eq(sourceRelayFetchers.id, fetcherId),
        eq(sourceRelayFetchers.buildingId, buildingId),
      ),
    )
  return c.json({ ok: true })
})

// PUT /:buildingId/fetchers/:fetcherId/connectors/:connectorId — set/update file selection
app.put('/:buildingId/fetchers/:fetcherId/connectors/:connectorId', async (c) => {
  const fetcherId = Number(c.req.param('fetcherId'))
  const connectorId = Number(c.req.param('connectorId'))
  const body = await c.req.json()
  const filePaths: string[] = Array.isArray(body.filePaths) ? body.filePaths : []

  const existing = await db
    .select()
    .from(sourceRelayConnectorFiles)
    .where(
      and(
        eq(sourceRelayConnectorFiles.fetcherId, fetcherId),
        eq(sourceRelayConnectorFiles.connectorId, connectorId),
      ),
    )

  if (existing.length > 0) {
    const updated = await db
      .update(sourceRelayConnectorFiles)
      .set({ filePaths: JSON.stringify(filePaths) })
      .where(eq(sourceRelayConnectorFiles.id, existing[0].id))
      .returning()
    return c.json(updated[0])
  }

  const result = await db
    .insert(sourceRelayConnectorFiles)
    .values({ connectorId, fetcherId, filePaths: JSON.stringify(filePaths) })
    .returning()
  return c.json(result[0], 201)
})

// DELETE /:buildingId/fetchers/:fetcherId/connectors/:connectorId — unlink connector
app.delete('/:buildingId/fetchers/:fetcherId/connectors/:connectorId', async (c) => {
  const fetcherId = Number(c.req.param('fetcherId'))
  const connectorId = Number(c.req.param('connectorId'))
  await db
    .delete(sourceRelayConnectorFiles)
    .where(
      and(
        eq(sourceRelayConnectorFiles.fetcherId, fetcherId),
        eq(sourceRelayConnectorFiles.connectorId, connectorId),
      ),
    )
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Public fetch endpoint — aggregates all connector content for a fetcher token
// Mounted on sourceRelayPublicRouter at /source-relay
// ---------------------------------------------------------------------------

sourceRelayPublicRouter.get('/fetch/:token', async (c) => {
  const token = c.req.param('token')

  const [fetcher] = await db
    .select()
    .from(sourceRelayFetchers)
    .where(eq(sourceRelayFetchers.uniqueToken, token))

  if (!fetcher) {
    return new Response('404 — Fetcher not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const connFiles = await db
    .select()
    .from(sourceRelayConnectorFiles)
    .where(eq(sourceRelayConnectorFiles.fetcherId, fetcher.id))

  const connectors = await Promise.all(
    connFiles.map(async (cf) => {
      const [connector] = await db
        .select()
        .from(sourceRelayConnectors)
        .where(eq(sourceRelayConnectors.id, cf.connectorId))
      return {
        connector,
        filePaths: (JSON.parse(cf.filePaths ?? '[]') as string[]) ?? [],
      }
    }),
  )

  const parts: string[] = []
  parts.push(`# ${fetcher.name}`)
  parts.push(`\nGenerated at: ${new Date().toISOString()}\n`)

  for (const { connector, filePaths } of connectors) {
    if (!connector) continue
    parts.push('='.repeat(80))
    parts.push(`\n## Source: ${connector.name}`)
    parts.push(`Type: ${connector.type}\n`)

    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(connector.configuration) } catch { /* empty */ }

    if (connector.type === 'git' || connector.type === 'private_git') {
      const repoUrl = cfg.url as string | undefined
      const branch = (cfg.branch as string | undefined) ?? 'main'
      const repoToken = cfg.token as string | undefined

      parts.push(`Repository: ${repoUrl ?? '(unknown)'}`)
      parts.push(`Branch: ${branch}`)

      if (!repoUrl) {
        parts.push('Error: no URL configured\n')
        continue
      }

      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/?$)/)
      if (!match) {
        parts.push('Error: only GitHub repository URLs are currently supported\n')
        continue
      }

      const [, owner, repo] = match
      const ghHeaders: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'vibe-and-conquer',
      }
      if (repoToken) ghHeaders['Authorization'] = `Bearer ${repoToken}`

      let pathsToFetch = filePaths
      if (!pathsToFetch || pathsToFetch.length === 0) {
        const treeRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
          { headers: ghHeaders },
        ).catch(() => null)
        if (treeRes?.ok) {
          const treeData = (await treeRes.json()) as {
            tree: Array<{ path: string; type: string }>
          }
          pathsToFetch = treeData.tree
            .filter((f) => f.type === 'blob')
            .map((f) => f.path)
        }
      }

      parts.push(`Files: ${pathsToFetch.length}\n`)

      for (const filePath of pathsToFetch.slice(0, 100)) {
        const contentsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
          { headers: ghHeaders },
        ).catch(() => null)
        if (!contentsRes?.ok) continue
        const fileData = (await contentsRes.json()) as {
          content?: string
          encoding?: string
        }
        if (!fileData.content || fileData.encoding !== 'base64') continue
        const decoded = Buffer.from(
          fileData.content.replace(/\n/g, ''),
          'base64',
        ).toString('utf-8')
        const ext = filePath.split('.').pop() ?? ''
        parts.push(`### File: ${filePath}\n`)
        parts.push('```' + ext)
        parts.push(decoded)
        parts.push('```')
        parts.push('---\n')
      }
    } else if (connector.type === 'website') {
      const siteUrl = cfg.url as string | undefined
      if (!siteUrl) {
        parts.push('Error: no URL configured\n')
        continue
      }
      parts.push(`URL: ${siteUrl}\n`)

      const siteRes = await fetch(siteUrl, {
        headers: { 'User-Agent': 'vibe-and-conquer' },
      }).catch(() => null)

      if (!siteRes?.ok) {
        parts.push(`Error fetching page: ${siteRes?.status ?? 'network error'}\n`)
        continue
      }

      const html = await siteRes.text()
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
      parts.push(text + '\n')
    }
  }

  parts.push('='.repeat(80))

  return new Response(parts.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  })
})

export default app
