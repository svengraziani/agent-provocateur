import { useAuthContext } from './AuthContext'
import { keycloakEnabled } from './KeycloakProvider'
import { authentikEnabled } from './AuthentikProvider'
import { oidcEnabled } from './OidcProvider'

const authEnabled = keycloakEnabled || authentikEnabled || oidcEnabled

export function useAuth() {
  const ctx = useAuthContext()

  return {
    token: authEnabled ? ctx.token : undefined,
    user: ctx.user,
    isAuthenticated: authEnabled ? ctx.isAuthenticated : true,
    logout: ctx.logout,
    enabled: authEnabled,
  }
}
