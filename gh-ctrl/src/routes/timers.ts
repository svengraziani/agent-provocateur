import { Hono } from 'hono'
import { db } from '../db'
import { deadlineTimers } from '../db/schema'
import { eq } from 'drizzle-orm'

const router = new Hono()

// List all deadline timers
router.get('/', async (c) => {
  const timers = await db.select().from(deadlineTimers).orderBy(deadlineTimers.deadline)
  return c.json(timers)
})

// Create a new deadline timer
router.post('/', async (c) => {
  const body = await c.req.json()
  const { name, description, deadline, color } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (!deadline || typeof deadline !== 'string') {
    return c.json({ error: 'deadline is required (ISO 8601 string)' }, 400)
  }
  // Validate deadline is a parseable date
  const parsed = new Date(deadline)
  if (isNaN(parsed.getTime())) {
    return c.json({ error: 'deadline must be a valid date-time string' }, 400)
  }

  const [created] = await db.insert(deadlineTimers).values({
    name: name.trim(),
    description: description?.trim() ?? '',
    deadline: parsed.toISOString(),
    color: color ?? '#ff4444',
  }).returning()

  return c.json(created, 201)
})

// Update a deadline timer
router.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const body = await c.req.json()
  const updates: Partial<{ name: string; description: string; deadline: string; color: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  }

  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.description !== undefined) updates.description = String(body.description).trim()
  if (body.color !== undefined) updates.color = String(body.color)
  if (body.deadline !== undefined) {
    const parsed = new Date(body.deadline)
    if (isNaN(parsed.getTime())) return c.json({ error: 'deadline must be a valid date-time string' }, 400)
    updates.deadline = parsed.toISOString()
  }

  const [updated] = await db.update(deadlineTimers)
    .set(updates)
    .where(eq(deadlineTimers.id, id))
    .returning()

  if (!updated) return c.json({ error: 'timer not found' }, 404)
  return c.json(updated)
})

// Delete a deadline timer
router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  await db.delete(deadlineTimers).where(eq(deadlineTimers.id, id))
  return c.json({ ok: true })
})

export default router
