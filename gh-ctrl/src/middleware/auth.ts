import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const KEYCLOAK_URL = process.env.KEYCLOAK_URL
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!jwks && KEYCLOAK_URL && KEYCLOAK_REALM) {
    const jwksUrl = new URL(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`
    )
    jwks = createRemoteJWKSet(jwksUrl)
  }
  return jwks
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // If Keycloak is not configured, skip auth entirely (opt-in)
  if (!KEYCLOAK_URL || !KEYCLOAK_REALM || !KEYCLOAK_CLIENT_ID) {
    return next()
  }

  const authorization = c.req.header('Authorization')
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authorization.slice(7)

  try {
    const keySet = getJwks()!
    const { payload } = await jwtVerify(token, keySet, {
      issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
      audience: KEYCLOAK_CLIENT_ID,
    })
    c.set('user' as never, payload)
    return next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
