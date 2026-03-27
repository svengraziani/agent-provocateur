import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const KEYCLOAK_URL = process.env.KEYCLOAK_URL
const KEYCLOAK_INTERNAL_URL = process.env.KEYCLOAK_INTERNAL_URL || KEYCLOAK_URL
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!jwks && KEYCLOAK_INTERNAL_URL && KEYCLOAK_REALM) {
    const jwksUrl = new URL(
      `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`
    )
    jwks = createRemoteJWKSet(jwksUrl)
  }
  return jwks
}

const PUBLIC_PATHS = ['/api/health', '/api/version']

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Skip auth for public endpoints
  if (PUBLIC_PATHS.includes(c.req.path)) {
    return next()
  }

  // If Keycloak is not configured, skip auth entirely (opt-in)
  if (!KEYCLOAK_URL || !KEYCLOAK_REALM || !KEYCLOAK_CLIENT_ID) {
    return next()
  }

  // Accept token from Authorization header or query param (for SSE/EventSource which can't set headers)
  const authorization = c.req.header('Authorization')
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : c.req.query('token')

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const keySet = getJwks()!
    const { payload } = await jwtVerify(token, keySet, {
      issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    })
    c.set('user' as never, payload)
    return next()
  } catch (err) {
    console.error('[auth] JWT verification failed:', err instanceof Error ? err.message : err)
    console.error('[auth] Expected issuer:', `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`)
    console.error('[auth] Expected audience:', KEYCLOAK_CLIENT_ID)
    console.error('[auth] JWKS URL:', `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`)
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
