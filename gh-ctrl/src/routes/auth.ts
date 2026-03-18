import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from '../db'
import { sessions } from '../db/schema'
import { eq } from 'drizzle-orm'

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_API_URL = 'https://api.github.com'

const SESSION_COOKIE = 'gh_ctrl_session'
const STATE_COOKIE = 'gh_ctrl_oauth_state'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const app = new Hono()

// GET /api/auth/login — redirect to GitHub OAuth
app.get('/login', (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) return c.json({ error: 'GITHUB_CLIENT_ID not configured' }, 500)

  const state = crypto.randomUUID()
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 600,
    path: '/',
  })

  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/auth/callback'

  const url = new URL(GITHUB_OAUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'repo,user')
  url.searchParams.set('state', state)

  return c.redirect(url.toString())
})

// GET /api/auth/callback — handle OAuth callback
app.get('/callback', async (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return c.json({ error: 'OAuth not configured' }, 500)

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, STATE_COOKIE)

  if (!code || !state || state !== storedState) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  deleteCookie(c, STATE_COOKIE, { path: '/' })

  // Exchange code for access token
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })

  const tokenData: any = await tokenRes.json()
  if (tokenData.error || !tokenData.access_token) {
    return c.json({ error: tokenData.error_description || 'Failed to get access token' }, 400)
  }

  // Fetch user profile
  const userRes = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  const userData: any = await userRes.json()
  if (!userData.login) {
    return c.json({ error: 'Failed to fetch GitHub user' }, 500)
  }

  // Create session in DB
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    id: sessionId,
    accessToken: tokenData.access_token,
    githubLogin: userData.login,
    githubAvatarUrl: userData.avatar_url || '',
    expiresAt,
  })

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  })

  return c.redirect('/')
})

// GET /api/auth/me — return current user info
app.get('/me', async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) return c.json({ error: 'Not authenticated' }, 401)

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
  if (!session) return c.json({ error: 'Session not found' }, 401)

  if (new Date() > session.expiresAt) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ error: 'Session expired' }, 401)
  }

  return c.json({ login: session.githubLogin, avatarUrl: session.githubAvatarUrl })
})

// POST /api/auth/logout — clear session
app.post('/logout', async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE)
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
  }
  return c.json({ ok: true })
})

export default app
