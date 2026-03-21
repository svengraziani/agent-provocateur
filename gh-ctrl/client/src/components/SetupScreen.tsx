import { useEffect, useRef, useState } from 'react'
import type { SetupStatus } from '../types'

interface Props {
  status: SetupStatus
  onRecheck: () => void
}

export function SetupScreen({ status, onRecheck }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      onRecheck()
    }, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [onRecheck])

  function copyFix(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
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
        maxWidth: '560px',
        width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo-transparent.png"
            alt="Vibe and Conquer"
            style={{ height: '56px', marginBottom: '1rem' }}
          />
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.4rem', color: 'var(--text)' }}>
            Getting Started
          </h1>
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: '0.9rem' }}>
            Complete the checks below before using the dashboard.
          </p>
          <span style={{
            display: 'inline-block',
            marginTop: '0.75rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: status.mode === 'docker' ? 'rgba(0,120,255,0.15)' : 'rgba(0,255,136,0.12)',
            color: status.mode === 'docker' ? 'var(--blue)' : 'var(--green)',
            border: `1px solid ${status.mode === 'docker' ? 'var(--blue)' : 'var(--green)'}`,
          }}>
            {status.mode === 'docker' ? '🐳 Docker' : '💻 Local'}
          </span>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
          {status.checks.map((check) => (
            <li key={check.id} style={{
              borderBottom: '1px solid var(--border)',
              padding: '1rem 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{
                  fontSize: '1rem',
                  lineHeight: 1,
                  marginTop: '2px',
                  color: check.ok ? 'var(--green)' : 'var(--red)',
                  flexShrink: 0,
                }}>
                  {check.ok ? '✓' : '✗'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>
                    {check.label}
                  </div>
                  {check.detail && (
                    <div style={{ color: 'var(--text-2)', fontSize: '0.8rem', marginTop: '0.2rem', wordBreak: 'break-all' }}>
                      {check.detail}
                    </div>
                  )}
                  {!check.ok && check.fix && (
                    <div style={{
                      marginTop: '0.5rem',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <code style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text)', wordBreak: 'break-all' }}>
                        {check.fix}
                      </code>
                      <button
                        onClick={() => copyFix(check.id, check.fix!)}
                        style={{
                          flexShrink: 0,
                          background: 'none',
                          border: '1px solid var(--border)',
                          borderRadius: '3px',
                          color: 'var(--text-2)',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          padding: '0.2rem 0.45rem',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {copied === check.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={onRecheck}
            style={{
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '0.5rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Check Again
          </button>
          <p style={{ color: 'var(--text-2)', fontSize: '0.78rem', marginTop: '0.75rem', marginBottom: 0 }}>
            Checking automatically every 3 seconds…
          </p>
        </div>
      </div>
    </div>
  )
}
