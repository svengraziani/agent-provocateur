import { createContext, useContext } from 'react'

export interface AuthUser {
  username?: string
  email?: string
  name?: string
}

export interface AuthContextValue {
  initialized: boolean
  token: string | undefined
  user: AuthUser | null
  isAuthenticated: boolean
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue>({
  initialized: true,
  token: undefined,
  user: null,
  isAuthenticated: true,
  logout: () => {},
})

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext)
}
