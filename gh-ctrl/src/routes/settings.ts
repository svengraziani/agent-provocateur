import { Hono } from 'hono'
import { db } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

const router = new Hono()

// GET /api/settings — return all settings as { key: value }
router.get('/', async (c) => {
  const rows = await db.select().from(settings)
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return c.json(result)
})

// GET /api/settings/:key — return a single setting
router.get('/:key', async (c) => {
  const key = c.req.param('key')
  const rows = await db.select().from(settings).where(eq(settings.key, key))
  return c.json({ key, value: rows[0]?.value ?? null })
})

// PUT /api/settings/:key — upsert a setting
router.put('/:key', async (c) => {
  const key = c.req.param('key')
  const body = await c.req.json()
  if (typeof body.value !== 'string') {
    return c.json({ error: 'value must be a string' }, 400)
  }
  const now = new Date()
  await db.insert(settings)
    .values({ key, value: body.value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: body.value, updatedAt: now } })
  return c.json({ key, value: body.value })
})

// DELETE /api/settings/:key — remove a setting
router.delete('/:key', async (c) => {
  const key = c.req.param('key')
  await db.delete(settings).where(eq(settings.key, key))
  return c.json({ ok: true })
})

export default router
