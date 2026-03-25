import { Hono } from 'hono'
import { db } from '../db'
import { maps, mapRepos, repos } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const app = new Hono()

// GET / — list all maps (includes tiles for preview)
app.get('/', async (c) => {
  const allMaps = await db.select().from(maps)
  return c.json(allMaps)
})

// POST / — create a new map
app.post('/', async (c) => {
  const body = await c.req.json()
  const { name, width = 20, height = 20 } = body

  if (!name?.trim()) {
    return c.json({ error: 'Map name is required' }, 400)
  }
  if (width < 2 || width > 256 || height < 2 || height > 256) {
    return c.json({ error: 'Map dimensions must be between 2 and 256' }, 400)
  }

  const result = await db.insert(maps).values({
    name: name.trim(),
    width: Math.floor(width),
    height: Math.floor(height),
    tiles: '{}',
  }).returning()

  return c.json(result[0], 201)
})

// POST /import — import a map from JSON
app.post('/import', async (c) => {
  const body = await c.req.json()
  const { name, width, height, tiles } = body

  if (!name?.trim()) {
    return c.json({ error: 'Map name is required' }, 400)
  }
  if (!Number.isInteger(width) || width < 2 || width > 256 ||
      !Number.isInteger(height) || height < 2 || height > 256) {
    return c.json({ error: 'Map dimensions must be between 2 and 256' }, 400)
  }

  let tilesJson: string
  try {
    tilesJson = typeof tiles === 'string' ? tiles : JSON.stringify(tiles ?? {})
    JSON.parse(tilesJson) // validate it's valid JSON
  } catch {
    return c.json({ error: 'Invalid tiles format' }, 400)
  }

  const result = await db.insert(maps).values({
    name: name.trim(),
    width: Math.floor(width),
    height: Math.floor(height),
    tiles: tilesJson,
  }).returning()

  return c.json(result[0], 201)
})

// GET /:id — get a specific map
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.select().from(maps).where(eq(maps.id, id))
  if (result.length === 0) return c.json({ error: 'Map not found' }, 404)
  return c.json(result[0])
})

// PATCH /:id — update map name or tiles
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = {}

  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.tiles !== undefined) {
    updates.tiles = typeof body.tiles === 'string' ? body.tiles : JSON.stringify(body.tiles)
  }
  updates.updatedAt = new Date()

  if (Object.keys(updates).length === 1) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  const result = await db.update(maps).set(updates).where(eq(maps.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Map not found' }, 404)
  return c.json(result[0])
})

// DELETE /:id — delete a map
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.delete(maps).where(eq(maps.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Map not found' }, 404)
  return c.json({ ok: true })
})

// GET /:id/repos — list repos assigned to this map
app.get('/:id/repos', async (c) => {
  const id = Number(c.req.param('id'))
  const map = await db.select().from(maps).where(eq(maps.id, id))
  if (map.length === 0) return c.json({ error: 'Map not found' }, 404)
  const result = await db
    .select({ repo: repos })
    .from(mapRepos)
    .innerJoin(repos, eq(mapRepos.repoId, repos.id))
    .where(eq(mapRepos.mapId, id))
  return c.json(result.map((r) => r.repo))
})

// POST /:id/repos/:repoId — assign a repo to a map
app.post('/:id/repos/:repoId', async (c) => {
  const mapId = Number(c.req.param('id'))
  const repoId = Number(c.req.param('repoId'))
  const map = await db.select().from(maps).where(eq(maps.id, mapId))
  if (map.length === 0) return c.json({ error: 'Map not found' }, 404)
  const repo = await db.select().from(repos).where(eq(repos.id, repoId))
  if (repo.length === 0) return c.json({ error: 'Repo not found' }, 404)
  await db.insert(mapRepos).values({ mapId, repoId }).onConflictDoNothing()
  return c.json({ ok: true })
})

// DELETE /:id/repos/:repoId — unassign a repo from a map
app.delete('/:id/repos/:repoId', async (c) => {
  const mapId = Number(c.req.param('id'))
  const repoId = Number(c.req.param('repoId'))
  await db.delete(mapRepos).where(and(eq(mapRepos.mapId, mapId), eq(mapRepos.repoId, repoId)))
  return c.json({ ok: true })
})

export default app
