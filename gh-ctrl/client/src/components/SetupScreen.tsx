import { useEffect, useRef, useState } from 'react'
import type { SetupStatus, SetupCheck } from '../types'

interface Props {
  status: SetupStatus
  onRecheck: () => void
}

function CheckItem({ check }: { check: SetupCheck }) {
  const [copied, setCopied] = useState(false)

  function copyFix() {
    if (!check.fix) return
    navigator.clipboard.writeText(check.fix).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: `1px solid ${check.ok ? 'var(--green)' : 'var(--red)'}`,
        borderRadius: 6,
        padding: '12px 16px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18, color: check.ok ? 'var(--green)' : 'var(--red)' }}>
          {check.ok ? '✓' : '✗'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{check.label}</div>
          {check.detail && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{check.detail}</div>
          )}
        </div>
      </div>

      {!check.ok && check.fix && (
        <div style={{ marginTop: 10, position: 'relative' }}>
          <div
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '8px 40px 8px 10px',
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'var(--text-1)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {check.fix}
          </div>
          <button
            onClick={copyFix}
            title="Copy"
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 6px',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-2)',
            }}
          >
            {copied ? '✓' : 'copy'}
          </button>
        </div>
      )}
    </div>
  )
}

export function SetupScreen({ status, onRecheck }: Props) {
  const [rechecking, setRechecking] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-poll every 3s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      onRecheck()
    }, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [onRecheck])

  async function handleRecheck() {
    setRechecking(true)
    try {
      await onRecheck()
    } finally {
      setRechecking(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-1)',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo-transparent.png"
            alt="Vibe and Conquer"
            style={{ height: 64, marginBottom: 16 }}
          />
          <h1 style={{ color: 'var(--text-1)', fontSize: 24, margin: '0 0 8px' }}>
            Getting Started
          </h1>
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 14 }}>
            Complete the checks below to launch the Command Center
          </p>
          <span
            style={{
              display: 'inline-block',
              marginTop: 10,
              padding: '2px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
              background: status.mode === 'docker' ? 'rgba(88,166,255,0.15)' : 'rgba(57,211,83,0.15)',
              color: status.mode === 'docker' ? 'var(--blue)' : 'var(--green)',
              border: `1px solid ${status.mode === 'docker' ? 'var(--blue)' : 'var(--green)'}`,
            }}
          >
            {status.mode === 'docker' ? 'Docker' : 'Local'}
          </span>
        </div>

        {/* Checks */}
        <div>
          {status.checks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>

        {/* Action */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          {status.ready ? (
            <div style={{ color: 'var(--green)', fontWeight: 600 }}>
              ✓ All checks passed — loading…
            </div>
          ) : (
            <>
              <button
                onClick={handleRecheck}
                disabled={rechecking}
                className="btn"
                style={{ minWidth: 140 }}
              >
                {rechecking ? 'Checking…' : 'Check Again'}
              </button>
              <p style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 10 }}>
                Automatically re-checking every 3 seconds
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
