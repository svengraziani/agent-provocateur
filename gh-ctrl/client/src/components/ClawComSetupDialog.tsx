import { useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ClawComConfig } from '../types'

interface ClawComSetupDialogProps {
  building: Building
  onClose: () => void
  onConfigured: (updated: Building) => void
  onError: (msg: string) => void
}

export function ClawComSetupDialog({ building, onClose, onConfigured, onError }: ClawComSetupDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)

  let existingConfig: Partial<ClawComConfig> = {}
  try { existingConfig = JSON.parse(building.config) } catch { /* empty */ }

  const [clawType, setClawType] = useState<'openclaw' | 'nanoclaw'>(existingConfig.clawType ?? 'openclaw')
  const [host, setHost] = useState(existingConfig.host ?? '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  async function handleSave() {
    if (!host.trim()) {
      onError('Host-URL ist erforderlich')
      return
    }
    setSaving(true)
    try {
      const config: ClawComConfig = { clawType, host: host.trim(), configured: true }
      const updated = await api.updateBuilding(building.id, { config })
      await loadBuildings()
      onConfigured(updated)
    } catch (err: any) {
      onError(`Konfiguration fehlgeschlagen: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!host.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${host.trim().replace(/\/$/, '')}/status`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        setTestResult('✓ Verbindung erfolgreich!')
      } else {
        setTestResult(`✗ Fehler: HTTP ${res.status}`)
      }
    } catch (err: any) {
      setTestResult(`✗ Nicht erreichbar: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      className="map-dialog"
      onWheel={(e) => e.stopPropagation()}
    >
        <div className="map-dialog-title">&#x25a0; {building.name.toUpperCase()} — SETUP</div>

        <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'flex-start' }}>
          <img
            src="/buildings/clawcom.png"
            alt="ClawCom"
            style={{ width: 96, height: 96, objectFit: 'contain', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
              Konfiguriere die Verbindung zu einem Openclaw oder Nanoclaw. Nach der Einrichtung
              kannst du Befehle über das integrierte Chatfenster senden und empfangen.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                CLAW TYP
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['openclaw', 'nanoclaw'] as const).map((t) => (
                  <button
                    key={t}
                    className={`hud-btn${clawType === t ? ' active' : ''}`}
                    onClick={() => setClawType(t)}
                    style={{ flex: 1 }}
                  >
                    {t === 'openclaw' ? '⚙ OPENCLAW' : '⬡ NANOCLAW'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                HOST URL
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="hud-input"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="http://192.168.1.100:8080"
                  style={{ flex: 1 }}
                />
                <button
                  className="hud-btn"
                  onClick={handleTest}
                  disabled={testing || !host.trim()}
                  title="Verbindung testen"
                >
                  {testing ? '◌' : 'TEST'}
                </button>
              </div>
              {testResult && (
                <div style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: testResult.startsWith('✓') ? 'var(--green-neon)' : '#ff6b6b',
                }}>
                  {testResult}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>ABBRECHEN</button>
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '◌ SPEICHERN...' : '&#x2713; KONFIGURIEREN'}
          </button>
        </div>
    </div>
  )
}
