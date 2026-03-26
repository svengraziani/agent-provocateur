import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { db } from '../db'
import { buildings, clawcomMessages, healthcheckResults, mailMessages } from '../db/schema'
import { eq, desc, asc, and } from 'drizzle-orm'
import { scheduleBuilding, unscheduleBuilding, getLatestResults } from '../healthcheck-service'
import {
  scheduleMailbox,
  unscheduleMailbox,
  sendMailboxEmail,
  getMailMessages,
  getUnreadCount,
  testImapConnection,
  type MailboxConfig,
} from '../mailbox-service'

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

  // If updating a healthcheck building's config, reschedule
  const updated = result[0]
  if (updated.type === 'healthcheck' && body.config !== undefined) {
    let newConfig: any = {}
    try { newConfig = JSON.parse(updated.config ?? '{}') } catch { /* empty */ }
    if (newConfig.configured) {
      scheduleBuilding(updated.id, newConfig)
    } else {
      unscheduleBuilding(updated.id)
    }
  }

  // If updating a mailbox building's config, reschedule
  if (updated.type === 'snailbox' && body.config !== undefined) {
    let newConfig: any = {}
    try { newConfig = JSON.parse(updated.config ?? '{}') } catch { /* empty */ }
    if (newConfig.configured) {
      scheduleMailbox(updated.id, newConfig as MailboxConfig)
    } else {
      unscheduleMailbox(updated.id)
    }
  }

  return c.json(result[0])
})

// DELETE /:id — delete building
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const existing = await db.select().from(buildings).where(eq(buildings.id, id))
  if (existing.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (existing[0].type === 'healthcheck') unscheduleBuilding(id)
  if (existing[0].type === 'snailbox') {
    unscheduleMailbox(id)
    await db.delete(mailMessages).where(eq(mailMessages.buildingId, id))
  }
  await db.delete(buildings).where(eq(buildings.id, id))
  return c.json({ ok: true })
})

// GET /:id/healthcheck — get latest healthcheck results per endpoint
app.get('/:id/healthcheck', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (buildingResult[0].type !== 'healthcheck') return c.json({ error: 'Not a healthcheck building' }, 400)
  const results = await getLatestResults(id)
  return c.json(results)
})

// POST /:id/healthcheck/trigger — trigger immediate check
app.post('/:id/healthcheck/trigger', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (buildingResult[0].type !== 'healthcheck') return c.json({ error: 'Not a healthcheck building' }, 400)
  let config: any = {}
  try { config = JSON.parse(buildingResult[0].config ?? '{}') } catch { /* empty */ }
  if (!config.configured || !config.endpoints?.length) return c.json({ error: 'Building not configured' }, 400)
  scheduleBuilding(id, config)
  return c.json({ ok: true })
})

// GET /:id/messages — list messages for a ClawCom building (newest 100)
app.get('/:id/messages', async (c) => {
  const id = Number(c.req.param('id'))
  const result = await db
    .select()
    .from(clawcomMessages)
    .where(eq(clawcomMessages.buildingId, id))
    .orderBy(asc(clawcomMessages.id))
    .limit(100)
  return c.json(result)
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
  if (config.configured) {
    if (config.clawType === 'claudechannel' && config.mcpWebhookUrl) {
      // Claude Channel: POST to the MCP server webhook
      try {
        const webhookUrl = `${String(config.mcpWebhookUrl).replace(/\/$/, '')}/`
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (config.channelSecret) headers['x-channel-secret'] = String(config.channelSecret)
        await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content }),
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        // MCP server not reachable — message stored locally anyway
      }
    } else if (config.host) {
      // OpenClaw / NanoClaw: POST to {host}/message and expect an immediate reply
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
  }

  return c.json(outMsg, 201)
})

// GET /:id/channel-events — proxy SSE from the MCP server to the frontend (Claude Channel only)
app.get('/:id/channel-events', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)

  const building = buildingResult[0]
  let config: Record<string, any> = {}
  try { config = JSON.parse(building.config ?? '{}') } catch { /* empty */ }

  if (config.clawType !== 'claudechannel' || !config.mcpWebhookUrl) {
    return c.json({ error: 'Building is not a configured Claude Channel' }, 400)
  }

  const mcpEventsUrl = `${String(config.mcpWebhookUrl).replace(/\/$/, '')}/events`
  const headers: Record<string, string> = {}
  if (config.channelSecret) headers['x-channel-secret'] = String(config.channelSecret)

  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache')
  c.header('Connection', 'keep-alive')
  c.header('Access-Control-Allow-Origin', '*')

  return stream(c, async (s) => {
    let mcpResponse: Response
    try {
      mcpResponse = await fetch(mcpEventsUrl, { headers })
    } catch {
      await s.write(new TextEncoder().encode(
        `data: ${JSON.stringify({ type: 'error', message: 'MCP server not reachable' })}\n\n`
      ))
      return
    }

    if (!mcpResponse.ok || !mcpResponse.body) {
      await s.write(new TextEncoder().encode(
        `data: ${JSON.stringify({ type: 'error', message: `MCP server returned ${mcpResponse.status}` })}\n\n`
      ))
      return
    }

    const reader = mcpResponse.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // Split on double-newline (SSE event boundaries)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.trim()) continue
          // Parse and persist reply events in the database
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
          if (dataLine) {
            const data = dataLine.slice(6).trim()
            try {
              const event = JSON.parse(data)
              if (event.type === 'reply' && event.content) {
                await db.insert(clawcomMessages).values({
                  buildingId: id,
                  direction: 'in',
                  content: String(event.content),
                })
              }
            } catch { /* not JSON */ }
          }
          // Forward the raw SSE event to the frontend
          await s.write(new TextEncoder().encode(`${part}\n\n`))
        }
      }
    } catch {
      // Client disconnected or MCP server closed the stream
    }
  })
})

// POST /:id/permission — forward a permission verdict to the MCP server (Claude Channel only)
app.post('/:id/permission', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)

  let config: Record<string, any> = {}
  try { config = JSON.parse(buildingResult[0].config ?? '{}') } catch { /* empty */ }

  if (config.clawType !== 'claudechannel' || !config.mcpWebhookUrl) {
    return c.json({ error: 'Building is not a configured Claude Channel' }, 400)
  }

  const body = await c.req.json()
  const permUrl = `${String(config.mcpWebhookUrl).replace(/\/$/, '')}/permission`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.channelSecret) headers['x-channel-secret'] = String(config.channelSecret)

  try {
    const resp = await fetch(permUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    const data = await resp.json().catch(() => ({ ok: false }))
    return c.json(data, resp.status as any)
  } catch {
    return c.json({ error: 'MCP server not reachable' }, 503)
  }
})

// ── Mailbox routes ────────────────────────────────────────────────────────────

// POST /mail/test-connection — test IMAP credentials without saving
app.post('/mail/test-connection', async (c) => {
  const body = await c.req.json()
  const { imapHost, imapPort, username, password } = body
  if (!imapHost || !username || !password) {
    return c.json({ ok: false, error: 'imapHost, username and password required' }, 400)
  }
  const result = await testImapConnection({
    imapHost: String(imapHost),
    imapPort: Number(imapPort) || 993,
    username:  String(username),
    password:  String(password),
  })
  return c.json(result)
})

// GET /:id/mail — list messages for a mailbox building
app.get('/:id/mail', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (buildingResult[0].type !== 'snailbox') return c.json({ error: 'Not a snailbox building' }, 400)
  const msgs = await getMailMessages(id, 100)
  return c.json(msgs)
})

// GET /:id/mail/unread-count — get unread count
app.get('/:id/mail/unread-count', async (c) => {
  const id = Number(c.req.param('id'))
  const count = await getUnreadCount(id)
  return c.json({ count })
})

// POST /:id/mail/:msgId/read — mark message as read
app.post('/:id/mail/:msgId/read', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const msgId = Number(c.req.param('msgId'))
  await db.update(mailMessages)
    .set({ isRead: 1 })
    .where(and(eq(mailMessages.id, msgId), eq(mailMessages.buildingId, buildingId)))
  return c.json({ ok: true })
})

// POST /:id/mail/:msgId/star — toggle star
app.post('/:id/mail/:msgId/star', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const msgId = Number(c.req.param('msgId'))
  const existing = await db.select().from(mailMessages)
    .where(and(eq(mailMessages.id, msgId), eq(mailMessages.buildingId, buildingId)))
    .limit(1)
  if (existing.length === 0) return c.json({ error: 'Message not found' }, 404)
  const newStarred = existing[0].isStarred ? 0 : 1
  await db.update(mailMessages).set({ isStarred: newStarred })
    .where(eq(mailMessages.id, msgId))
  return c.json({ isStarred: newStarred })
})

// DELETE /:id/mail/:msgId — delete a cached message
app.delete('/:id/mail/:msgId', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const msgId = Number(c.req.param('msgId'))
  await db.delete(mailMessages)
    .where(and(eq(mailMessages.id, msgId), eq(mailMessages.buildingId, buildingId)))
  return c.json({ ok: true })
})

// POST /:id/mail/send — send an email via SMTP
app.post('/:id/mail/send', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (buildingResult[0].type !== 'snailbox') return c.json({ error: 'Not a snailbox building' }, 400)

  let config: Partial<MailboxConfig> = {}
  try { config = JSON.parse(buildingResult[0].config ?? '{}') } catch { /* empty */ }
  if (!config.configured) return c.json({ error: 'Building not configured' }, 400)

  const body = await c.req.json()
  const { to, subject, body: mailBody } = body
  if (!to?.trim() || !subject?.trim()) {
    return c.json({ error: 'to and subject are required' }, 400)
  }

  try {
    await sendMailboxEmail(config as MailboxConfig, String(to).trim(), String(subject).trim(), String(mailBody ?? ''))
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST /:id/mail/sync — trigger immediate IMAP sync
app.post('/:id/mail/sync', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (buildingResult[0].type !== 'snailbox') return c.json({ error: 'Not a snailbox building' }, 400)
  let config: Partial<MailboxConfig> = {}
  try { config = JSON.parse(buildingResult[0].config ?? '{}') } catch { /* empty */ }
  if (!config.configured) return c.json({ error: 'Building not configured' }, 400)
  scheduleMailbox(id, config as MailboxConfig)
  return c.json({ ok: true })
})


export default app
