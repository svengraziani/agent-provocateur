import { Hono } from 'hono'
import { db } from '../db'
import { promptTemplates } from '../db/schema'
import { eq, asc } from 'drizzle-orm'

const router = new Hono()

router.get('/', async (c) => {
  const category = c.req.query('category')
  const rows = await db
    .select()
    .from(promptTemplates)
    .orderBy(asc(promptTemplates.sortOrder), asc(promptTemplates.createdAt))
  const filtered = category ? rows.filter((r) => r.category === category) : rows
  return c.json(filtered)
})

router.post('/', async (c) => {
  const body = await c.req.json()
  const { title, content, category, sortOrder } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return c.json({ error: 'title is required' }, 400)
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return c.json({ error: 'content is required' }, 400)
  }

  const [created] = await db.insert(promptTemplates).values({
    title: title.trim(),
    content: content.trim(),
    category: category?.trim() || null,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
  }).returning()

  return c.json(created, 201)
})

router.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const [row] = await db.select().from(promptTemplates).where(eq(promptTemplates.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

router.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const body = await c.req.json()
  const updates: Partial<{
    title: string
    content: string
    category: string | null
    sortOrder: number
    updatedAt: Date
  }> = { updatedAt: new Date() }

  if (body.title !== undefined) updates.title = String(body.title).trim()
  if (body.content !== undefined) updates.content = String(body.content).trim()
  if ('category' in body) updates.category = body.category?.trim() || null
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder)

  const [updated] = await db
    .update(promptTemplates)
    .set(updates)
    .where(eq(promptTemplates.id, id))
    .returning()

  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(updated)
})

router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  await db.delete(promptTemplates).where(eq(promptTemplates.id, id))
  return c.json({ ok: true })
})

export default router
