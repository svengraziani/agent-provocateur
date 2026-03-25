import { useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ClawComConfig } from '../types'
import { BaseDialog } from './BaseDialog'

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
    <BaseDialog className="map-dialog" onClose={onClose}>
        <div className="map-dialog-title">&#x25a0; {building.name.toUpperCase()} — SETUP</div>

        <div className="clawcom-setup-body">
          <img
            src="/buildings/clawcom.png"
            alt="ClawCom"
            className="clawcom-setup-preview-img"
          />
          <div className="clawcom-setup-form">
            <div className="clawcom-setup-desc">
              Konfiguriere die Verbindung zu einem Openclaw oder Nanoclaw. Nach der Einrichtung
              kannst du Befehle über das integrierte Chatfenster senden und empfangen.
            </div>

            <div className="clawcom-setup-group">
              <label className="clawcom-setup-group-label">Claw Typ</label>
              <div className="clawcom-setup-row">
                {(['openclaw', 'nanoclaw'] as const).map((t) => (
                  <button
                    key={t}
                    className={`hud-btn${clawType === t ? ' active' : ''}`}
                    onClick={() => setClawType(t)}
                  >
                    {t === 'openclaw' ? '⚙ OPENCLAW' : '⬡ NANOCLAW'}
                  </button>
                ))}
              </div>
            </div>

            <div className="clawcom-setup-group">
              <label className="clawcom-setup-group-label">Host URL</label>
              <div className="clawcom-setup-row">
                <input
                  className="hud-input"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="http://192.168.1.100:8080"
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
                <div className={`clawcom-test-result ${testResult.startsWith('✓') ? 'clawcom-test-result--ok' : 'clawcom-test-result--err'}`}>
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
            {saving ? '◌ SPEICHERN...' : '✓ KONFIGURIEREN'}
          </button>
        </div>
    </BaseDialog>
  )
}
