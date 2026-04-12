interface LoggedOutScreenProps {
  onLogin: () => void
}

export function LoggedOutScreen({ onLogin }: LoggedOutScreenProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
        gap: '1rem',
      }}
    >
      <img
        src="/logo-transparent.png"
        alt="V&C Command Center"
        style={{ width: '80px', opacity: 0.7 }}
      />
      <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>
        You have been logged out
      </h2>
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.9rem' }}>
        Your session has ended.
      </p>
      <button
        onClick={onLogin}
        style={{
          marginTop: '0.5rem',
          background: 'var(--green-neon)',
          color: '#000',
          border: 'none',
          borderRadius: '6px',
          padding: '0.5rem 1.5rem',
          fontSize: '0.9rem',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Login again
      </button>
    </div>
  )
}
