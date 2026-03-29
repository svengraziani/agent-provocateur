import { Hono } from 'hono'
import { db } from '../db'
import { contacts } from '../db/schema'
import { eq } from 'drizzle-orm'

const router = new Hono()

// List all contacts
router.get('/', async (c) => {
  const rows = await db.select().from(contacts).orderBy(contacts.username)
  return c.json(rows)
})

// Lookup a single contact by username
router.get('/lookup/:username', async (c) => {
  const username = c.req.param('username')
  const [row] = await db.select().from(contacts).where(eq(contacts.username, username))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

// Create a contact
router.post('/', async (c) => {
  const body = await c.req.json()
  const { username, email, displayName, notes } = body

  if (!username || typeof username !== 'string' || !username.trim()) {
    return c.json({ error: 'username is required' }, 400)
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return c.json({ error: 'email is required' }, 400)
  }

  const [created] = await db.insert(contacts).values({
    username: username.trim(),
    email: email.trim(),
    displayName: displayName?.trim() || null,
    notes: notes?.trim() ?? '',
  }).returning()

  return c.json(created, 201)
})

// Update a contact
router.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const body = await c.req.json()
  const updates: Partial<{ username: string; email: string; displayName: string | null; notes: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  }

  if (body.username !== undefined) updates.username = String(body.username).trim()
  if (body.email !== undefined) updates.email = String(body.email).trim()
  if (body.displayName !== undefined) updates.displayName = body.displayName ? String(body.displayName).trim() : null
  if (body.notes !== undefined) updates.notes = String(body.notes).trim()

  const [updated] = await db.update(contacts)
    .set(updates)
    .where(eq(contacts.id, id))
    .returning()

  if (!updated) return c.json({ error: 'contact not found' }, 404)
  return c.json(updated)
})

// Delete a contact
router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  await db.delete(contacts).where(eq(contacts.id, id))
  return c.json({ ok: true })
})

export default router
