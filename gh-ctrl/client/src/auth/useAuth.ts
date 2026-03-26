import { useAuthContext, keycloakEnabled } from './KeycloakProvider'

export function useAuth() {
  const ctx = useAuthContext()

  return {
    token: keycloakEnabled ? ctx.token : undefined,
    user: ctx.user,
    isAuthenticated: keycloakEnabled ? ctx.isAuthenticated : true,
    logout: ctx.logout,
    enabled: keycloakEnabled,
  }
}
