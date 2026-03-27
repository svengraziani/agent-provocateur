import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Keycloak from 'keycloak-js'

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL as string | undefined
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM as string | undefined
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID as string | undefined

export const keycloakEnabled =
  Boolean(KEYCLOAK_URL) && Boolean(KEYCLOAK_REALM) && Boolean(KEYCLOAK_CLIENT_ID)

interface AuthContextValue {
  keycloak: Keycloak | null
  initialized: boolean
  token: string | undefined
  user: {
    username?: string
    email?: string
    name?: string
  } | null
  isAuthenticated: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  keycloak: null,
  initialized: true,
  token: undefined,
  user: null,
  isAuthenticated: true,
  logout: () => {},
})

let keycloakInstance: Keycloak | null = null

function getKeycloakInstance(): Keycloak {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: KEYCLOAK_URL!,
      realm: KEYCLOAK_REALM!,
      clientId: KEYCLOAK_CLIENT_ID!,
    })
  }
  return keycloakInstance
}

export function KeycloakProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false)
  const [token, setToken] = useState<string | undefined>(undefined)
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [keycloak] = useState<Keycloak>(() => getKeycloakInstance())

  useEffect(() => {
    keycloak
      .init({
        onLoad: 'login-required',
        checkLoginIframe: false,
        pkceMethod: 'S256',
      })
      .then((authenticated) => {
        if (authenticated) {
          setToken(keycloak.token)
          setUser({
            username: keycloak.tokenParsed?.preferred_username,
            email: keycloak.tokenParsed?.email,
            name: keycloak.tokenParsed?.name,
          })
        }
        setInitialized(true)
      })
      .catch((err) => {
        console.error('[keycloak] init error', err)
        setInitialized(true)
      })

    keycloak.onTokenExpired = () => {
      keycloak
        .updateToken(60)
        .then(() => {
          setToken(keycloak.token)
        })
        .catch(() => {
          keycloak.login()
        })
    }
  }, [keycloak])

  const logout = () => {
    keycloak.logout()
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
        keycloak,
        initialized,
        token,
        user,
        isAuthenticated: keycloak.authenticated ?? false,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  return useContext(AuthContext)
}
