import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, MailboxConfig } from '../types'

interface MailboxSetupDialogProps {
  building: Building
  onClose: () => void
  onConfigured: (updated: Building) => void
  onError: (msg: string) => void
}

const POLL_PRESETS = [
  { label: '1 Min',  ms: 60_000 },
  { label: '5 Min',  ms: 5 * 60_000 },
  { label: '15 Min', ms: 15 * 60_000 },
  { label: '30 Min', ms: 30 * 60_000 },
]

export function MailboxSetupDialog({ building, onClose, onConfigured, onError }: MailboxSetupDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)

  let existingConfig: Partial<MailboxConfig> = {}
  try { existingConfig = JSON.parse(building.config) } catch { /* empty */ }

  const [imapHost, setImapHost]       = useState(existingConfig.imapHost ?? '')
  const [imapPort, setImapPort]       = useState(String(existingConfig.imapPort ?? 993))
  const [smtpHost, setSmtpHost]       = useState(existingConfig.smtpHost ?? '')
  const [smtpPort, setSmtpPort]       = useState(String(existingConfig.smtpPort ?? 587))
  const [username, setUsername]       = useState(existingConfig.username ?? '')
  const [password, setPassword]       = useState(existingConfig.password ?? '')
  const [folder, setFolder]           = useState(existingConfig.folder ?? 'INBOX')
  const [pollIntervalMs, setPoll]     = useState(existingConfig.pollIntervalMs ?? 5 * 60_000)
  const [saving, setSaving]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [testState, setTestState]     = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError]     = useState('')

  const canSave = imapHost.trim() && smtpHost.trim() && username.trim() && password.trim()
  const canTest = imapHost.trim() && username.trim() && password.trim()

  async function handleTestConnection() {
    if (!canTest || testState === 'testing') return
    setTestState('testing')
    setTestError('')
    try {
      const res = await api.testMailConnection({
        imapHost: imapHost.trim(),
        imapPort: Number(imapPort) || 993,
        username:  username.trim(),
        password,
      })
      if (res.ok) {
        setTestState('ok')
      } else {
        setTestState('error')
        setTestError(res.error ?? 'Verbindung fehlgeschlagen')
      }
    } catch (err: any) {
      setTestState('error')
      setTestError(err.message)
    }
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const config: MailboxConfig = {
        imapHost:      imapHost.trim(),
        imapPort:      Number(imapPort) || 993,
        smtpHost:      smtpHost.trim(),
        smtpPort:      Number(smtpPort) || 587,
        username:      username.trim(),
        password,
        folder:        folder.trim() || 'INBOX',
        pollIntervalMs,
        configured:    true,
      }
      const updated = await api.updateBuilding(building.id, { config })
      await loadBuildings()
      onConfigured(updated)
    } catch (err: any) {
      onError(`Konfiguration fehlgeschlagen: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="map-dialog" onWheel={(e) => e.stopPropagation()}>
      <div className="map-dialog-title">&#x25a0; {building.name.toUpperCase()} — MAILBOX SETUP</div>

      <div className="clawcom-setup-body">
        <div style={{
          width: 80, height: 80, background: 'var(--bg-panel)', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, flexShrink: 0,
        }}>
          ✉
        </div>

        <div className="clawcom-setup-form">
          <div className="clawcom-setup-desc">
            Verbinde dein IMAP/SMTP-Postfach. E-Mails werden automatisch abgerufen und
            direkt auf dem Schlachtfeld angezeigt.
          </div>

          {/* IMAP */}
          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">IMAP (EMPFANGEN)</label>
            <div className="clawcom-setup-row" style={{ gap: 6 }}>
              <input
                className="hud-input"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.example.com"
                style={{ flex: 1 }}
              />
              <input
                className="hud-input"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
                placeholder="993"
                style={{ width: 60 }}
              />
            </div>
          </div>

          {/* SMTP */}
          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">SMTP (SENDEN)</label>
            <div className="clawcom-setup-row" style={{ gap: 6 }}>
              <input
                className="hud-input"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                style={{ flex: 1 }}
              />
              <input
                className="hud-input"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                style={{ width: 60 }}
              />
            </div>
          </div>

          {/* Credentials */}
          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">ZUGANGSDATEN</label>
            <input
              className="hud-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              style={{ width: '100%', marginBottom: 4 }}
            />
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                className="hud-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                style={{ width: '100%', paddingRight: 28, boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: 13, padding: '0 2px', lineHeight: 1,
                }}
                title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          </div>

          {/* Folder + Poll interval */}
          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">ORDNER</label>
            <input
              className="hud-input"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="INBOX"
              style={{ width: '100%' }}
            />
          </div>

          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">ABRUF-INTERVALL</label>
            <div className="clawcom-setup-row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {POLL_PRESETS.map((p) => (
                <button
                  key={p.ms}
                  className={`hud-btn${pollIntervalMs === p.ms ? ' active' : ''}`}
                  style={{ fontSize: 10 }}
                  onClick={() => setPoll(p.ms)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="map-dialog-actions" style={{ flexDirection: 'column', gap: 6 }}>
        {testState === 'ok' && (
          <div style={{ fontSize: 10, color: 'var(--green-neon)', textAlign: 'center' }}>
            ✓ IMAP-Verbindung erfolgreich
          </div>
        )}
        {testState === 'error' && (
          <div style={{ fontSize: 10, color: '#ff6b6b', textAlign: 'center' }}>
            ✕ {testError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="hud-btn" onClick={onClose}>ABBRECHEN</button>
          <button
            className="hud-btn"
            onClick={handleTestConnection}
            disabled={!canTest || testState === 'testing'}
          >
            {testState === 'testing' ? '◌ TESTE...' : '⚡ TEST'}
          </button>
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? '◌ SPEICHERN...' : '✓ KONFIGURIEREN'}
          </button>
        </div>
      </div>
    </div>
  )
}
