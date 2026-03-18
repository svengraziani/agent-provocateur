import { useAppStore } from '../store'

export function UserMenu() {
  const user = useAppStore((s) => s.user)
  const logout = useAppStore((s) => s.logout)

  if (!user) {
    return (
      <a
        href="/api/auth/login"
        className="btn btn-primary btn-sm user-menu-login"
        style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}
      >
        Sign in with GitHub
      </a>
    )
  }

  return (
    <div className="user-menu">
      <img
        src={user.avatarUrl}
        alt={user.login}
        className="user-avatar"
      />
      <span className="user-login">{user.login}</span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => logout()}
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  )
}
