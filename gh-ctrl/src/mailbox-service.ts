import { db } from './db'
import { buildings, mailMessages } from './db/schema'
import { eq, desc, and } from 'drizzle-orm'

export interface MailboxConfig {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  username: string
  password: string
  folder: string
  pollIntervalMs: number
  configured: boolean
}

// Map from building id to timer handle
const timers = new Map<number, ReturnType<typeof setInterval>>()

async function pollMailbox(buildingId: number, config: MailboxConfig): Promise<void> {
  // Dynamic import so the server still starts even if imapflow isn't installed yet
  let ImapFlow: any
  try {
    const mod = await import('imapflow')
    ImapFlow = mod.ImapFlow
  } catch {
    console.warn('[mailbox-service] imapflow not installed — run `bun install`')
    return
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(config.folder || 'INBOX')

    try {
      // Determine the since-date: either 7 days ago (first poll) or last stored message date
      const lastMsg = await db
        .select()
        .from(mailMessages)
        .where(eq(mailMessages.buildingId, buildingId))
        .orderBy(desc(mailMessages.date))
        .limit(1)

      const since = lastMsg.length > 0 && lastMsg[0].date
        ? new Date(lastMsg[0].date as number)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      for await (const msg of client.fetch({ since }, { envelope: true })) {
        const envelope = msg.envelope
        const messageId: string = envelope.messageId ?? `uid-${msg.uid}-${buildingId}`

        // Skip if already stored
        const existing = await db
          .select({ id: mailMessages.id })
          .from(mailMessages)
          .where(and(
            eq(mailMessages.buildingId, buildingId),
            eq(mailMessages.messageId, messageId),
          ))
          .limit(1)

        if (existing.length > 0) continue

        const fromAddr = envelope.from?.[0]
          ? `${envelope.from[0].name ? envelope.from[0].name + ' ' : ''}<${envelope.from[0].address ?? ''}>`
          : null

        const toAddrs = JSON.stringify(
          (envelope.to ?? []).map((a: any) => a.address).filter(Boolean)
        )

        await db.insert(mailMessages).values({
          buildingId,
          messageId,
          subject:     envelope.subject ?? null,
          fromAddress: fromAddr,
          toAddresses: toAddrs,
          date:        envelope.date ? envelope.date.getTime() : null,
          snippet:     null,
          bodyText:    null,
          isRead:      0,
          isStarred:   0,
        })
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err: any) {
    console.error(`[mailbox-service] Poll error for building ${buildingId}:`, err.message)
    if (client.usable) await client.logout().catch(() => {})
  }
}

export function scheduleMailbox(buildingId: number, config: MailboxConfig): void {
  const existing = timers.get(buildingId)
  if (existing) clearInterval(existing)

  if (!config.configured || !config.imapHost || !config.username) {
    timers.delete(buildingId)
    return
  }

  const intervalMs = Math.max(config.pollIntervalMs ?? 60_000, 60_000) // min 1 minute

  // Run immediately on schedule
  pollMailbox(buildingId, config).catch(() => {})

  const timer = setInterval(() => {
    pollMailbox(buildingId, config).catch(() => {})
  }, intervalMs)

  timers.set(buildingId, timer)
}

export function unscheduleMailbox(buildingId: number): void {
  const existing = timers.get(buildingId)
  if (existing) clearInterval(existing)
  timers.delete(buildingId)
}

export async function sendMailboxEmail(
  config: MailboxConfig,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  let nodemailer: any
  try {
    nodemailer = await import('nodemailer')
  } catch {
    throw new Error('nodemailer not installed — run `bun install`')
  }

  const createTransport = nodemailer.createTransport ?? nodemailer.default?.createTransport
  const transporter = createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.username, pass: config.password },
  })

  await transporter.sendMail({
    from: config.username,
    to,
    subject,
    text: body,
  })
}

export async function testImapConnection(
  config: Pick<MailboxConfig, 'imapHost' | 'imapPort' | 'username' | 'password'>
): Promise<{ ok: true } | { ok: false; error: string }> {
  let ImapFlow: any
  try {
    const mod = await import('imapflow')
    ImapFlow = mod.ImapFlow
  } catch {
    return { ok: false, error: 'imapflow not installed — run `bun install`' }
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.username, pass: config.password },
    logger: false,
  })

  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err: any) {
    if (client.usable) await client.logout().catch(() => {})
    return { ok: false, error: err.message }
  }
}

export async function getMailMessages(
  buildingId: number,
  limit = 50,
): Promise<typeof mailMessages.$inferSelect[]> {
  return db
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.buildingId, buildingId))
    .orderBy(desc(mailMessages.date))
    .limit(limit)
}

export async function getUnreadCount(buildingId: number): Promise<number> {
  const rows = await db
    .select({ id: mailMessages.id })
    .from(mailMessages)
    .where(and(eq(mailMessages.buildingId, buildingId), eq(mailMessages.isRead, 0)))
  return rows.length
}

export async function initMailboxService(): Promise<void> {
  const allBuildings = await db.select().from(buildings)

  for (const building of allBuildings) {
    if (building.type !== 'snailbox') continue

    let config: Partial<MailboxConfig> = {}
    try { config = JSON.parse(building.config ?? '{}') } catch { /* empty */ }

    if (config.configured && config.imapHost && config.username) {
      scheduleMailbox(building.id, config as MailboxConfig)
    }
  }
}
