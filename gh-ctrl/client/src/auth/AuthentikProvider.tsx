import type { ReactNode } from 'react'
import { OidcProvider } from './OidcProvider'

// Authentik exposes OIDC at: {AUTHENTIK_URL}/application/o/{AUTHENTIK_SLUG}/
// The discovery document lives at: {authority}/.well-known/openid-configuration
const AUTHENTIK_URL = import.meta.env.VITE_AUTHENTIK_URL as string | undefined
const AUTHENTIK_SLUG = import.meta.env.VITE_AUTHENTIK_SLUG as string | undefined
const AUTHENTIK_CLIENT_ID = import.meta.env.VITE_AUTHENTIK_CLIENT_ID as string | undefined

export const authentikEnabled =
  Boolean(AUTHENTIK_URL) && Boolean(AUTHENTIK_SLUG) && Boolean(AUTHENTIK_CLIENT_ID)

export function AuthentikProvider({ children }: { children: ReactNode }) {
  // Trim trailing slashes so a user-supplied URL like "https://authentik.example.com/"
  // doesn't produce double-slash paths in the OIDC discovery / JWKS URLs.
  const baseUrl = AUTHENTIK_URL!.replace(/\/+$/, '')
  // e.g. "https://authentik.example.com/application/o/vibe-and-conquer/"
  const authority = `${baseUrl}/application/o/${AUTHENTIK_SLUG}/`

  return (
    <OidcProvider authority={authority} clientId={AUTHENTIK_CLIENT_ID!}>
      {children}
    </OidcProvider>
  )
}
