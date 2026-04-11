import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, SshConnection, SshSessionLog, RemoteShellConfig } from '../types'

interface RemoteShellSetupDialogProps {
  building: Building
  onClose: () => void
  onConfigured: (updated: Building) => void
  onOpenTerminal?: () => void
  onError: (msg: string) => void
}

type AuthType = 'password' | 'key'

function formatDuration(ms: number | null) {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function formatRelativeTime(ts: string | number | null) {
  if (!ts) return '—'
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : Number(ts) * 1000
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function RemoteShellSetupDialog({ building, onClose, onConfigured, onOpenTerminal, onError }: RemoteShellSetupDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)

  const existingConfig: Partial<RemoteShellConfig> = (() => {
    try { return JSON.parse(building.config) } catch { return {} }
  })()

  // Connection list state
  const [connections, setConnections]       = useState<SshConnection[]>([])
  const [history, setHistory]               = useState<SshSessionLog[]>([])
  const [loadingConns, setLoadingConns]     = useState(true)
  const [showHistory, setShowHistory]       = useState(false)

  // Edit form state
  const [editingId, setEditingId]           = useState<number | null>(null) // null = new
  const [showForm, setShowForm]             = useState(false)
  const [label, setLabel]                   = useState('')
  const [host, setHost]                     = useState('')
  const [port, setPort]                     = useState('22')
  const [username, setUsername]             = useState('')
  const [authType, setAuthType]             = useState<AuthType>('password')
  const [password, setPassword]             = useState('')
  const [privateKey, setPrivateKey]         = useState('')
  const [tmuxSession, setTmuxSession]       = useState('')
  const [showSecret, setShowSecret]         = useState(false)

  // Config state
  const [fontSize, setFontSize]             = useState(String(existingConfig.fontSize ?? 14))
  const [fontFamily, setFontFamily]         = useState(existingConfig.fontFamily ?? 'monospace')
  const [theme, setTheme]                   = useState<RemoteShellConfig['theme']>(existingConfig.theme ?? 'dark')
  const [defaultConnectionId, setDefaultConnectionId] = useState<number | undefined>(existingConfig.defaultConnectionId)

  // Test state
  const [testState, setTestState]           = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError]           = useState('')
  const [saving, setSaving]                 = useState(false)
  const [deleting, setDeleting]             = useState<number | null>(null)

  useEffect(() => {
    loadConnections()
    api.getShellHistory(building.id)
      .then(setHistory)
      .catch(() => { /* non-fatal */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id])

  async function loadConnections() {
    setLoadingConns(true)
    try {
      const conns = await api.listShellConnections(building.id)
      setConnections(conns)
    } catch (err: any) {
      onError(err.message)
    } finally {
      setLoadingConns(false)
    }
  }

  function openNewForm() {
    setEditingId(null)
    setLabel('')
    setHost('')
    setPort('22')
    setUsername('')
    setAuthType('password')
    setPassword('')
    setPrivateKey('')
    setTmuxSession('')
    setShowSecret(false)
    setTestState('idle')
    setTestError('')
    setShowForm(true)
  }

  function openEditForm(conn: SshConnection) {
    setEditingId(conn.id)
    setLabel(conn.label)
    setHost(conn.host)
    setPort(String(conn.port ?? 22))
    setUsername(conn.username)
    setAuthType((conn.authType as AuthType) ?? 'password')
    setPassword('')
    setPrivateKey('')
    setTmuxSession(conn.tmuxSession ?? '')
    setShowSecret(false)
    setTestState('idle')
    setTestError('')
    setShowForm(true)
  }

  async function handleTestConnection() {
    if (testState === 'testing') return
    setTestState('testing')
    setTestError('')
    try {
      const res = await api.testShellConnection(building.id, {
        host: host.trim(),
        port: Number(port) || 22,
        username: username.trim(),
        authType,
        password: authType === 'password' ? password : undefined,
        privateKey: authType === 'key' ? privateKey : undefined,
      })
      setTestState(res.ok ? 'ok' : 'error')
      if (!res.ok) setTestError(res.error ?? 'Connection failed')
    } catch (err: any) {
      setTestState('error')
      setTestError(err.message)
    }
  }

  async function handleSaveConnection() {
    if (saving || !label.trim() || !host.trim() || !username.trim()) return
    setSaving(true)
    try {
      if (editingId !== null) {
        await api.updateShellConnection(building.id, editingId, {
          label: label.trim(),
          host: host.trim(),
          port: Number(port) || 22,
          username: username.trim(),
          authType,
          ...(password ? { password } : {}),
          ...(privateKey ? { privateKey } : {}),
          tmuxSession: tmuxSession.trim() || undefined,
        })
      } else {
        await api.createShellConnection(building.id, {
          label: label.trim(),
          host: host.trim(),
          port: Number(port) || 22,
          username: username.trim(),
          authType,
          ...(password ? { password } : {}),
          ...(privateKey ? { privateKey } : {}),
          tmuxSession: tmuxSession.trim() || undefined,
        })
      }
      await loadConnections()
      await loadBuildings()
      // Get the updated building to notify parent
      const allBuildings = await api.listBuildings()
      const updated = allBuildings.find((b: Building) => b.id === building.id)
      if (updated) onConfigured(updated)
      setShowForm(false)
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConnection(id: number) {
    if (!confirm('Delete this connection profile?')) return
    setDeleting(id)
    try {
      await api.deleteShellConnection(building.id, id)
      await loadConnections()
      await loadBuildings()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setDeleting(null)
    }
  }

  async function handleSaveConfig() {
    try {
      const existing: Record<string, unknown> = (() => {
        try { return JSON.parse(building.config) } catch { return {} }
      })()
      const newConfig: RemoteShellConfig = {
        ...existing,
        configured: connections.length > 0,
        fontSize: Number(fontSize) || 14,
        fontFamily: fontFamily.trim() || 'monospace',
        theme,
        ...(defaultConnectionId !== undefined ? { defaultConnectionId } : {}),
      }
      await api.updateBuilding(building.id, { config: newConfig })
      await loadBuildings()
    } catch (err: any) {
      onError(err.message)
    }
  }

  async function handleSetDefault(id: number) {
    try {
      const existing: Record<string, unknown> = (() => {
        try { return JSON.parse(building.config) } catch { return {} }
      })()
      const newConfig: RemoteShellConfig = {
        ...existing,
        configured: connections.length > 0,
        fontSize: Number(fontSize) || 14,
        fontFamily: fontFamily.trim() || 'monospace',
        theme,
        defaultConnectionId: id,
      }
      await api.updateBuilding(building.id, { config: newConfig })
      setDefaultConnectionId(id)
      await loadBuildings()
    } catch (err: any) {
      onError(err.message)
    }
  }

  const canSave = label.trim() && host.trim() && username.trim()
  const canTest = host.trim() && username.trim()

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-dim)',
        borderRadius: 6, width: 540, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'monospace',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '1px solid var(--border-dim)',
        }}>
          <span style={{ color: '#00ff88', fontWeight: 700 }}>▣ REMOTEPOST</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>// {building.name}</span>
          <div style={{ flex: 1 }} />
          <button className="hud-btn" style={{ fontSize: 10, color: '#ff6b6b' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>

          {/* Connection profiles */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              marginBottom: 8, color: 'var(--text-dim)', fontSize: 10, fontWeight: 700,
            }}>
              <span>▶ CONNECTION PROFILES</span>
              <button
                className="hud-btn"
                style={{ marginLeft: 'auto', fontSize: 9 }}
                onClick={openNewForm}
              >+ ADD</button>
            </div>

            {loadingConns && <div style={{ color: '#555', fontSize: 11 }}>Loading...</div>}

            {!loadingConns && connections.length === 0 && (
              <div style={{ color: '#555', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
                No connection profiles yet. Add one to get started.
              </div>
            )}

            {connections.map((conn) => (
              <div
                key={conn.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', marginBottom: 4,
                  background: 'var(--bg-darker)', borderRadius: 4,
                  border: '1px solid var(--border-dim)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#00ff88', fontSize: 12, fontWeight: 700 }}>{conn.label}</span>
                    {defaultConnectionId === conn.id && (
                      <span style={{
                        fontSize: 9, color: '#ffcc00', background: '#ffcc0022',
                        border: '1px solid #ffcc0044', borderRadius: 2, padding: '0 4px',
                      }}>DEFAULT</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                    {conn.username}@{conn.host}:{conn.port ?? 22}
                    {conn.authType && <> · {conn.authType}</>}
                    {conn.tmuxSession && <> · tmux:{conn.tmuxSession}</>}
                    {!conn.hasCredentials && <span style={{ color: '#ff4444' }}> · no creds</span>}
                  </div>
                </div>
                <button
                  className="hud-btn"
                  style={{
                    fontSize: 11,
                    padding: '1px 5px',
                    color: defaultConnectionId === conn.id ? '#ffcc00' : '#555',
                  }}
                  title={defaultConnectionId === conn.id ? 'Default connection' : 'Set as default'}
                  onClick={() => handleSetDefault(conn.id)}
                >★</button>
                <button
                  className="hud-btn"
                  style={{ fontSize: 9 }}
                  onClick={() => openEditForm(conn)}
                >✎ EDIT</button>
                <button
                  className="hud-btn"
                  style={{ fontSize: 9, color: '#ff6b6b' }}
                  disabled={deleting === conn.id}
                  onClick={() => handleDeleteConnection(conn.id)}
                >✕</button>
              </div>
            ))}
          </div>

          {/* Add / Edit form */}
          {showForm && (
            <div style={{
              padding: 12, marginBottom: 16,
              background: 'var(--bg-darker)', borderRadius: 4,
              border: '1px solid #00ff8844',
            }}>
              <div style={{ color: '#00ff88', fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
                {editingId !== null ? '✎ EDIT CONNECTION' : '+ NEW CONNECTION'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>LABEL *</label>
                  <input className="hud-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="prod-server" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>TMUX SESSION</label>
                  <input className="hud-input" value={tmuxSession} onChange={(e) => setTmuxSession(e.target.value)} placeholder="main (optional)" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>HOST *</label>
                  <input className="hud-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.1" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>PORT</label>
                  <input className="hud-input" value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" type="number" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>USERNAME *</label>
                <input className="hud-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" style={{ width: '100%', boxSizing: 'border-box' }} autoComplete="off" />
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button
                  className={`hud-btn${authType === 'password' ? ' active' : ''}`}
                  style={{ fontSize: 10 }}
                  onClick={() => setAuthType('password')}
                >PASSWORD</button>
                <button
                  className={`hud-btn${authType === 'key' ? ' active' : ''}`}
                  style={{ fontSize: 10 }}
                  onClick={() => setAuthType('key')}
                >SSH KEY</button>
              </div>

              {authType === 'password' && (
                <div style={{ marginBottom: 8, position: 'relative' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>
                    PASSWORD {editingId !== null && '(leave blank to keep existing)'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="hud-input"
                      type={showSecret ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingId !== null ? '••••••••' : 'Enter password'}
                      style={{ width: '100%', boxSizing: 'border-box', paddingRight: 28 }}
                      autoComplete="new-password"
                    />
                    <button
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}
                      onClick={() => setShowSecret((v) => !v)}
                    >{showSecret ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                  </div>
                </div>
              )}

              {authType === 'key' && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>
                    PRIVATE KEY {editingId !== null && '(leave blank to keep existing)'}
                  </label>
                  <textarea
                    className="hud-input"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    rows={5}
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 10 }}
                  />
                </div>
              )}

              {/* Test result */}
              {testState !== 'idle' && (
                <div style={{
                  padding: '4px 8px', borderRadius: 3, marginBottom: 8, fontSize: 10,
                  background: testState === 'ok' ? '#00ff8822' : testState === 'error' ? '#ff444422' : '#ffaa0022',
                  color: testState === 'ok' ? '#00ff88' : testState === 'error' ? '#ff4444' : '#ffaa00',
                  border: `1px solid ${testState === 'ok' ? '#00ff8844' : testState === 'error' ? '#ff444444' : '#ffaa0044'}`,
                }}>
                  {testState === 'testing' && '⌛ Testing connection...'}
                  {testState === 'ok' && '✓ Connection successful'}
                  {testState === 'error' && `✗ ${testError}`}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="hud-btn"
                  style={{ fontSize: 10 }}
                  disabled={!canTest || testState === 'testing'}
                  onClick={handleTestConnection}
                >
                  {testState === 'testing' ? 'TESTING...' : '⚡ TEST'}
                </button>
                <div style={{ flex: 1 }} />
                <button
                  className="hud-btn"
                  style={{ fontSize: 10 }}
                  onClick={() => setShowForm(false)}
                >CANCEL</button>
                <button
                  className="hud-btn hud-btn-new-base"
                  style={{ fontSize: 10 }}
                  disabled={!canSave || saving}
                  onClick={handleSaveConnection}
                >
                  {saving ? 'SAVING...' : '✓ SAVE'}
                </button>
              </div>
            </div>
          )}

          {/* Terminal appearance */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
              ▶ TERMINAL APPEARANCE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>THEME</label>
                <select
                  className="hud-input"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as RemoteShellConfig['theme'])}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                >
                  <option value="dark">Dark (default)</option>
                  <option value="dracula">Dracula</option>
                  <option value="solarized">Solarized</option>
                </select>
              </div>
              <div>
                <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>FONT SIZE</label>
                <input className="hud-input" type="number" value={fontSize} onChange={(e) => setFontSize(e.target.value)} min={8} max={32} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: 'var(--text-dim)', fontSize: 9, display: 'block', marginBottom: 3 }}>FONT FAMILY</label>
                <input className="hud-input" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="monospace" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button className="hud-btn" style={{ fontSize: 10 }} onClick={handleSaveConfig}>SAVE APPEARANCE</button>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <button
                className="hud-btn"
                style={{ fontSize: 10, marginBottom: 8 }}
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? '▼' : '▶'} HISTORY ({history.length})
              </button>
              {showHistory && (
                <div>
                  {history.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        padding: '4px 8px', marginBottom: 2,
                        background: 'var(--bg-darker)', borderRadius: 3, fontSize: 10,
                      }}
                    >
                      <span style={{ color: '#00ff88', minWidth: 100 }}>{h.connectionLabel ?? '—'}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{formatRelativeTime(h.connectedAt)}</span>
                      <span style={{ color: 'var(--text-dim)' }}>·</span>
                      <span style={{ color: 'var(--text-dim)' }}>{formatDuration(h.durationMs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border-dim)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button className="hud-btn" style={{ fontSize: 10 }} onClick={onClose}>
            CLOSE
          </button>
          {connections.length > 0 && onOpenTerminal && (
            <button className="hud-btn hud-btn-new-base" style={{ fontSize: 10 }} onClick={onOpenTerminal}>
              ▣ OPEN TERMINAL
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
