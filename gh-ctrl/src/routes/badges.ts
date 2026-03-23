import { Hono } from 'hono'
import { db } from '../db'
import { badges, placedBadges } from '../db/schema'
import { eq } from 'drizzle-orm'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'badges')
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
}

const app = new Hono()

// POST /upload — multipart file upload
app.post('/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string | null

  if (!file) return c.json({ error: 'No file provided' }, 400)
  if (!name?.trim()) return c.json({ error: 'Badge name is required' }, 400)
  if (!file.type.startsWith('image/')) return c.json({ error: 'Only image files are allowed' }, 400)
  if (file.size > MAX_FILE_SIZE) return c.json({ error: 'File size exceeds 5MB limit' }, 400)

  const ext = file.name.split('.').pop() ?? 'png'
  const filename = `${randomUUID()}.${ext}`
  const filepath = join(UPLOAD_DIR, filename)

  const buffer = await file.arrayBuffer()
  await Bun.write(filepath, buffer)

  const result = await db.insert(badges).values({
    name: String(name).trim(),
    filename,
    originalFilename: file.name,
    mimeType: file.type,
  }).returning()

  return c.json(result[0], 201)
})

// GET / — list all badges
app.get('/', async (c) => {
  const all = await db.select().from(badges).orderBy(badges.createdAt)
  return c.json(all)
})

// DELETE /:id — delete badge + file from disk
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.delete(badges).where(eq(badges.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Badge not found' }, 404)

  const filepath = join(UPLOAD_DIR, result[0].filename)
  try { unlinkSync(filepath) } catch { /* file may already be gone */ }

  return c.json({ ok: true })
})

// GET /placed — list all placed badge instances
app.get('/placed', async (c) => {
  const all = await db.select().from(placedBadges).orderBy(placedBadges.createdAt)
  // Join badge info
  const badgeMap = new Map((await db.select().from(badges)).map((b) => [b.id, b]))
  return c.json(all.map((pb) => ({ ...pb, badge: badgeMap.get(pb.badgeId) })))
})

// POST /placed — place a badge on the map
app.post('/placed', async (c) => {
  const body = await c.req.json()
  const { badgeId, posX = 0, posY = 0, scale = 1.0, label = '', mapId } = body

  if (!badgeId) return c.json({ error: 'badgeId is required' }, 400)

  // Verify badge exists
  const badge = await db.select().from(badges).where(eq(badges.id, Number(badgeId)))
  if (badge.length === 0) return c.json({ error: 'Badge not found' }, 404)

  const result = await db.insert(placedBadges).values({
    badgeId: Number(badgeId),
    posX: Number(posX),
    posY: Number(posY),
    scale: Number(scale),
    label: String(label),
    mapId: mapId != null ? Number(mapId) : null,
  }).returning()

  return c.json({ ...result[0], badge: badge[0] }, 201)
})

// PATCH /placed/:id — update position / scale / label
app.patch('/placed/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: new Date() }

  if (body.posX !== undefined) updates.posX = Number(body.posX)
  if (body.posY !== undefined) updates.posY = Number(body.posY)
  if (body.scale !== undefined) updates.scale = Number(body.scale)
  if (body.label !== undefined) updates.label = String(body.label)

  const result = await db.update(placedBadges).set(updates).where(eq(placedBadges.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Placed badge not found' }, 404)
  return c.json(result[0])
})

// DELETE /placed/:id — remove a placed badge
app.delete('/placed/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.delete(placedBadges).where(eq(placedBadges.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Placed badge not found' }, 404)
  return c.json({ ok: true })
})

export default app
