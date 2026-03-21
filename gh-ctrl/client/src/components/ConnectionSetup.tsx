import { useState } from 'react'
import { getServerUrl, setServerUrl } from '../api'

interface Props {
  onConnected: () => void
}

export function ConnectionSetup({ onConnected }: Props) {
  const [url, setUrl] = useState(getServerUrl() || 'http://localhost:3001')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    setTesting(true)
    setError('')
    const base = url.trim().replace(/\/$/, '')
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      setServerUrl(base)
      onConnected()
    } catch (err: any) {
      setError(err.message || 'Could not reach server')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '2.5rem',
        maxWidth: '480px',
        width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo-transparent.png"
            alt="Vibe and Conquer"
            style={{ height: '56px', marginBottom: '1rem' }}
          />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem', color: 'var(--text)' }}>
            Connect to Server
          </h1>
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: '0.9rem' }}>
            Enter the URL of your Vibe &amp; Conquer server.
            Required when running as a PWA or Chrome Extension.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            className="input"
            type="url"
            placeholder="http://localhost:3001"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            autoFocus
          />
          {error && (
            <div className="form-error">{error}</div>
          )}
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={testing || !url.trim()}
          >
            {testing ? 'Connecting…' : 'Connect'}
          </button>
        </div>

        <p style={{ color: 'var(--text-2)', fontSize: '0.78rem', marginTop: '1.25rem', marginBottom: 0, textAlign: 'center' }}>
          Running locally? The server starts on <code>http://localhost:3001</code> by default.
          In Docker, use the host and port where the container is exposed.
        </p>
      </div>
    </div>
  )
}
