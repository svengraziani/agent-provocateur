import { Hono } from 'hono'
import { db } from '../db'
import { buildings, clawcomMessages } from '../db/schema'
import { eq, desc } from 'drizzle-orm'

const app = new Hono()

// GET / — list all buildings
app.get('/', async (c) => {
  const all = await db.select().from(buildings).orderBy(buildings.createdAt)
  return c.json(all)
})

// POST / — create a new building
app.post('/', async (c) => {
  const body = await c.req.json()
  const { type = 'clawcom', name, color = '#00ff88', posX = 800, posY = 400 } = body

  if (!name?.trim()) {
    return c.json({ error: 'Building name is required' }, 400)
  }

  const result = await db.insert(buildings).values({
    type: String(type),
    name: String(name).trim(),
    color: String(color),
    posX: Number(posX),
    posY: Number(posY),
    config: '{}',
  }).returning()

  return c.json(result[0], 201)
})

// GET /:id — get a specific building
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.select().from(buildings).where(eq(buildings.id, id))
  if (result.length === 0) return c.json({ error: 'Building not found' }, 404)
  return c.json(result[0])
})

// PATCH /:id — update building (position, color, config, name)
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: new Date() }

  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.color !== undefined) updates.color = String(body.color)
  if (body.posX !== undefined) updates.posX = Number(body.posX)
  if (body.posY !== undefined) updates.posY = Number(body.posY)
  if (body.config !== undefined) {
    updates.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config)
  }

  const result = await db.update(buildings).set(updates).where(eq(buildings.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Building not found' }, 404)
  return c.json(result[0])
})

// DELETE /:id — delete building
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db.delete(buildings).where(eq(buildings.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'Building not found' }, 404)
  return c.json({ ok: true })
})

// GET /:id/messages — list messages for a ClawCom building (newest 100)
app.get('/:id/messages', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db
    .select()
    .from(clawcomMessages)
    .where(eq(clawcomMessages.buildingId, id))
    .orderBy(desc(clawcomMessages.createdAt))
    .limit(100)
  return c.json(result.reverse())
})

// POST /:id/messages — send a message via ClawCom (stores it and optionally relays to claw)
app.post('/:id/messages', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const { content } = body

  if (!content?.trim()) {
    return c.json({ error: 'Message content is required' }, 400)
  }

  // Load building to get config
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)

  const building = buildingResult[0]
  let config: Record<string, any> = {}
  try { config = JSON.parse(building.config ?? '{}') } catch { /* empty */ }

  // Store the outgoing message
  const [outMsg] = await db.insert(clawcomMessages).values({
    buildingId: id,
    direction: 'out',
    content: String(content).trim(),
  }).returning()

  // Try to relay to the claw if configured
  if (config.configured && config.host) {
    try {
      const clawUrl = `${config.host.replace(/\/$/, '')}/message`
      const response = await fetch(clawUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, clawType: config.clawType }),
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const responseData = await response.json().catch(() => null)
        const replyContent = responseData?.reply ?? responseData?.message ?? responseData?.response
        if (replyContent) {
          await db.insert(clawcomMessages).values({
            buildingId: id,
            direction: 'in',
            content: String(replyContent),
          })
        }
      }
    } catch {
      // Claw not reachable — message stored locally anyway
    }
  }

  return c.json(outMsg, 201)
})

export default app
