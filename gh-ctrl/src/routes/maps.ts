import { Hono } from 'hono'
import { db } from '../db'
import { maps } from '../db/schema'
import { eq } from 'drizzle-orm'

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
  if (width < 2 || width > 80 || height < 2 || height > 80) {
    return c.json({ error: 'Map dimensions must be between 2 and 80' }, 400)
  }

  const result = await db.insert(maps).values({
    name: name.trim(),
    width: Math.floor(width),
    height: Math.floor(height),
    tiles: '{}',
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

export default app
