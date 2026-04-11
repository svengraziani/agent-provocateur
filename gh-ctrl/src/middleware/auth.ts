import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// --- Keycloak ---
const KEYCLOAK_URL = process.env.KEYCLOAK_URL
const KEYCLOAK_INTERNAL_URL = process.env.KEYCLOAK_INTERNAL_URL || KEYCLOAK_URL
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID

// --- Authentik (shorthand — derives JWKS URL and issuer automatically) ---
// AUTHENTIK_URL  = https://authentik.example.com
// AUTHENTIK_SLUG = vibe-and-conquer  (the application slug in Authentik)
const AUTHENTIK_URL = process.env.AUTHENTIK_URL
const AUTHENTIK_SLUG = process.env.AUTHENTIK_SLUG

// --- Generic OIDC (Zitadel, Dex, Logto, Auth0, Authelia OIDC, etc.) ---
// OIDC_JWKS_URL = https://my-idp.example.com/.well-known/jwks.json
// OIDC_ISSUER   = https://my-idp.example.com
const OIDC_JWKS_URL = process.env.OIDC_JWKS_URL
const OIDC_ISSUER = process.env.OIDC_ISSUER

// --- Resolve active OIDC config (Keycloak > Authentik > Generic OIDC) ---
interface OidcConfig {
  jwksUrl: string
  issuer: string
}

function resolveOidcConfig(): OidcConfig | null {
  if (KEYCLOAK_URL && KEYCLOAK_REALM && KEYCLOAK_CLIENT_ID) {
    return {
      jwksUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
      issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    }
  }
  if (AUTHENTIK_URL && AUTHENTIK_SLUG) {
    const base = `${AUTHENTIK_URL}/application/o/${AUTHENTIK_SLUG}`
    return {
      jwksUrl: `${base}/jwks/`,
      issuer: `${base}/`,
    }
  }
  if (OIDC_JWKS_URL && OIDC_ISSUER) {
    return {
      jwksUrl: OIDC_JWKS_URL,
      issuer: OIDC_ISSUER,
    }
  }
  return null
}

const oidcConfig = resolveOidcConfig()
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (!jwks && oidcConfig) {
    jwks = createRemoteJWKSet(new URL(oidcConfig.jwksUrl))
  }
  return jwks
}

const PUBLIC_PATHS = ['/api/health', '/api/version']

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Skip auth for public endpoints
  if (PUBLIC_PATHS.includes(c.req.path)) {
    return next()
  }

  // No auth provider configured — opt-in, skip entirely
  if (!oidcConfig) {
    return next()
  }

  // Accept token from Authorization header or query param (SSE/EventSource can't set headers)
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
      issuer: oidcConfig.issuer,
    })
    c.set('user' as never, payload)
    return next()
  } catch (err) {
    console.error('[auth] JWT verification failed:', err instanceof Error ? err.message : err)
    console.error('[auth] JWKS URL:', oidcConfig.jwksUrl)
    console.error('[auth] Expected issuer:', oidcConfig.issuer)
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
