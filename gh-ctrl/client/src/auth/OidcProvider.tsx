import { useEffect, useRef, useState, type ReactNode } from 'react'
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'
import { AuthContext, type AuthContextValue } from './AuthContext'

const OIDC_AUTHORITY = import.meta.env.VITE_OIDC_AUTHORITY as string | undefined
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined
const OIDC_REDIRECT_URI = import.meta.env.VITE_OIDC_REDIRECT_URI as string | undefined
const OIDC_SCOPE = import.meta.env.VITE_OIDC_SCOPE as string | undefined

export const oidcEnabled = Boolean(OIDC_AUTHORITY) && Boolean(OIDC_CLIENT_ID)

interface OidcProviderProps {
  children: ReactNode
  /** Override the OIDC authority URL (defaults to VITE_OIDC_AUTHORITY) */
  authority?: string
  /** Override the client ID (defaults to VITE_OIDC_CLIENT_ID) */
  clientId?: string
  /** Override the redirect URI (defaults to VITE_OIDC_REDIRECT_URI or window.location.origin) */
  redirectUri?: string
  /** Override the scope string (defaults to VITE_OIDC_SCOPE or "openid profile email") */
  scope?: string
}

export function OidcProvider({ children, authority, clientId, redirectUri, scope }: OidcProviderProps) {
  const resolvedAuthority = authority ?? OIDC_AUTHORITY!
  const resolvedClientId = clientId ?? OIDC_CLIENT_ID!
  const resolvedRedirectUri = redirectUri ?? OIDC_REDIRECT_URI ?? window.location.origin
  const resolvedScope = scope ?? OIDC_SCOPE ?? 'openid profile email'

  const [initialized, setInitialized] = useState(false)
  const [token, setToken] = useState<string | undefined>(undefined)
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const managerRef = useRef<UserManager | null>(null)

  function getManager(): UserManager {
    if (!managerRef.current) {
      managerRef.current = new UserManager({
        authority: resolvedAuthority,
        client_id: resolvedClientId,
        redirect_uri: resolvedRedirectUri,
        post_logout_redirect_uri: resolvedRedirectUri,
        response_type: 'code',
        scope: resolvedScope,
        automaticSilentRenew: true,
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      })
    }
    return managerRef.current
  }

  useEffect(() => {
    const manager = getManager()

    const onUserLoaded = (u: User) => {
      setToken(u.access_token)
      setUser({
        username: u.profile.preferred_username,
        email: u.profile.email,
        name: u.profile.name,
      })
    }

    const onUserUnloaded = () => {
      setToken(undefined)
      setUser(null)
    }

    async function handleAuth() {
      // Check if we're handling an OIDC authorization code callback
      const params = new URLSearchParams(window.location.search)
      if (params.get('code') && params.get('state')) {
        try {
          const oidcUser = await manager.signinRedirectCallback()
          // Clean up the code/state params from the URL
          window.history.replaceState({}, '', window.location.pathname)
          onUserLoaded(oidcUser)
        } catch (err) {
          console.error('[oidc] callback error', err)
        }
        setInitialized(true)
        return
      }

      // Try to restore an existing session from storage
      try {
        const existingUser = await manager.getUser()
        if (existingUser && !existingUser.expired) {
          onUserLoaded(existingUser)
          setInitialized(true)
          return
        }
      } catch (err) {
        console.error('[oidc] getUser error', err)
      }

      // No valid session — redirect to the IdP login page
      manager.signinRedirect().catch((err) => {
        console.error('[oidc] signinRedirect error', err)
        setInitialized(true)
      })
    }

    handleAuth()

    manager.events.addUserLoaded(onUserLoaded)
    manager.events.addUserUnloaded(onUserUnloaded)

    return () => {
      manager.events.removeUserLoaded(onUserLoaded)
      manager.events.removeUserUnloaded(onUserUnloaded)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const logout = () => {
    getManager().signoutRedirect().catch(console.error)
  }

  if (!initialized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-2)', fontSize: '0.9rem' }}>
        Authenticating…
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        initialized,
        token,
        user,
        isAuthenticated: token !== undefined,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
