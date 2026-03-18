import { getCookie } from 'hono/cookie'
import { db } from '../db'
import { sessions } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'

export type Session = typeof sessions.$inferSelect

export async function getSession(c: Context): Promise<Session | null> {
  const sessionId = getCookie(c, 'gh_ctrl_session')
  if (!sessionId) return null

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
  if (!session) return null

  if (new Date() > session.expiresAt) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
    return null
  }

  return session
}
