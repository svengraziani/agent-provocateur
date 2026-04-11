import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// --- Keycloak ---
const KEYCLOAK_URL = process.env.KEYCLOAK_URL?.replace(/\/+$/, '')
const KEYCLOAK_INTERNAL_URL = (process.env.KEYCLOAK_INTERNAL_URL || KEYCLOAK_URL)?.replace(
  /\/+$/,
  '',
)
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
// OIDC_AUDIENCE = expected audience claim in the JWT (required)
const OIDC_JWKS_URL = process.env.OIDC_JWKS_URL
const OIDC_ISSUER = process.env.OIDC_ISSUER
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE

// --- Resolve active OIDC config (Keycloak > Authentik > Generic OIDC) ---
interface OidcConfig {
  jwksUrl: string
  issuer: string
  /** Expected audience claim; if set it is validated in jwtVerify. */
  audience?: string
}

function resolveOidcConfig(): OidcConfig | null {
  const hasKeycloakPartial = Boolean(KEYCLOAK_URL || KEYCLOAK_REALM || KEYCLOAK_CLIENT_ID)
  if (hasKeycloakPartial) {
    if (!(KEYCLOAK_URL && KEYCLOAK_REALM && KEYCLOAK_CLIENT_ID)) {
      throw new Error(
        '[auth] Incomplete Keycloak config: KEYCLOAK_URL, KEYCLOAK_REALM and KEYCLOAK_CLIENT_ID are all required',
      )
    }
    return {
      jwksUrl: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
      issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
      audience: KEYCLOAK_CLIENT_ID,
    }
  }

  const hasAuthentikPartial = Boolean(AUTHENTIK_URL || AUTHENTIK_SLUG)
  if (hasAuthentikPartial) {
    if (!(AUTHENTIK_URL && AUTHENTIK_SLUG)) {
      throw new Error(
        '[auth] Incomplete Authentik config: both AUTHENTIK_URL and AUTHENTIK_SLUG are required',
      )
    }
    // Trim trailing slashes so a user-supplied URL like "https://authentik.example.com/"
    // doesn't produce double-slash paths in the JWKS / issuer URLs.
    const baseUrl = AUTHENTIK_URL.replace(/\/+$/, '')
    const base = `${baseUrl}/application/o/${AUTHENTIK_SLUG}`
    return {
      jwksUrl: `${base}/jwks/`,
      issuer: `${base}/`,
      audience: AUTHENTIK_SLUG,
    }
  }

  const hasOidcPartial = Boolean(OIDC_JWKS_URL || OIDC_ISSUER || OIDC_AUDIENCE)
  if (hasOidcPartial) {
    if (!(OIDC_JWKS_URL && OIDC_ISSUER && OIDC_AUDIENCE)) {
      throw new Error(
        '[auth] Incomplete generic OIDC config: OIDC_JWKS_URL, OIDC_ISSUER and OIDC_AUDIENCE are all required',
      )
    }
    return {
      jwksUrl: OIDC_JWKS_URL,
      issuer: OIDC_ISSUER,
      audience: OIDC_AUDIENCE,
    }
  }

  return null
}

let oidcConfig: OidcConfig | null = null
let oidcConfigError: string | null = null
try {
  oidcConfig = resolveOidcConfig()
} catch (err) {
  oidcConfigError = err instanceof Error ? err.message : String(err)
  console.error(oidcConfigError)
}

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

  // Fail closed: some auth env vars were set but the config is incomplete.
  if (oidcConfigError) {
    console.error('[auth] Auth configuration error:', oidcConfigError)
    return c.json({ error: 'Server auth misconfiguration' }, 500)
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
      ...(oidcConfig.audience ? { audience: oidcConfig.audience } : {}),
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
