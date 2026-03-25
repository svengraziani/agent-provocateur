import { useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, HealthcheckConfig, HealthcheckEndpoint } from '../types'
import { BaseDialog } from './BaseDialog'

interface HealthcheckSetupDialogProps {
  building: Building
  onClose: () => void
  onConfigured: (updated: Building) => void
  onError: (msg: string) => void
}

const INTERVAL_PRESETS = [
  { label: '1 Min', ms: 60_000 },
  { label: '5 Min', ms: 5 * 60_000 },
  { label: '15 Min', ms: 15 * 60_000 },
  { label: '30 Min', ms: 30 * 60_000 },
  { label: '1 Std', ms: 60 * 60_000 },
]

export function HealthcheckSetupDialog({ building, onClose, onConfigured, onError }: HealthcheckSetupDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)

  let existingConfig: Partial<HealthcheckConfig> = {}
  try { existingConfig = JSON.parse(building.config) } catch { /* empty */ }

  const [endpoints, setEndpoints] = useState<HealthcheckEndpoint[]>(
    existingConfig.endpoints ?? [{ url: '', label: '' }]
  )
  const [intervalMs, setIntervalMs] = useState<number>(existingConfig.intervalMs ?? 5 * 60_000)
  const [customIntervalMin, setCustomIntervalMin] = useState<string>('')
  const [showCustom, setShowCustom] = useState(false)
  const [saving, setSaving] = useState(false)

  function addEndpoint() {
    setEndpoints((prev) => [...prev, { url: '', label: '' }])
  }

  function removeEndpoint(i: number) {
    setEndpoints((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateEndpoint(i: number, field: keyof HealthcheckEndpoint, value: string) {
    setEndpoints((prev) => prev.map((ep, idx) => idx === i ? { ...ep, [field]: value } : ep))
  }

  function selectPreset(ms: number) {
    setIntervalMs(ms)
    setShowCustom(false)
    setCustomIntervalMin('')
  }

  function handleCustomIntervalChange(val: string) {
    setCustomIntervalMin(val)
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed > 0) {
      setIntervalMs(Math.max(parsed * 60_000, 30_000))
    }
  }

  const validEndpoints = endpoints.filter((ep) => ep.url.trim().length > 0)
  const canSave = validEndpoints.length > 0 && intervalMs >= 30_000

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const config: HealthcheckConfig = {
        endpoints: validEndpoints.map((ep) => ({ url: ep.url.trim(), label: ep.label.trim() || ep.url.trim() })),
        intervalMs,
        configured: true,
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

  const activePreset = INTERVAL_PRESETS.find((p) => p.ms === intervalMs)

  return (
    <BaseDialog className="map-dialog" onClose={onClose}>
      <div className="map-dialog-title">&#x25a0; {building.name.toUpperCase()} — HEALTHCHECK SETUP</div>

      <div className="clawcom-setup-body">
        <img
          src="/buildings/healthcheck.png"
          alt="Healthcheck"
          className="clawcom-setup-preview-img"
        />
        <div className="clawcom-setup-form">
          <div className="clawcom-setup-desc">
            Konfiguriere die zu überwachenden Endpunkte. Das Gebäude zeigt den aktuellen
            Status jedes Endpunkts an und aktualisiert sich automatisch im konfigurierten Intervall.
          </div>

          {/* Endpoints */}
          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">
              ENDPUNKTE
              <button
                className="hud-btn"
                style={{ fontSize: 9, padding: '1px 6px', marginLeft: 8 }}
                onClick={addEndpoint}
              >+ HINZUFÜGEN</button>
            </label>
            {endpoints.map((ep, i) => (
              <div key={i} className="clawcom-setup-row" style={{ marginBottom: 4, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', gap: 4, width: '100%', alignItems: 'center' }}>
                  <input
                    className="hud-input"
                    value={ep.url}
                    onChange={(e) => updateEndpoint(i, 'url', e.target.value)}
                    placeholder="https://example.com/health"
                    style={{ flex: 1 }}
                  />
                  {endpoints.length > 1 && (
                    <button
                      className="hud-btn"
                      style={{ fontSize: 9, padding: '1px 5px', color: '#ff6b6b', flexShrink: 0 }}
                      onClick={() => removeEndpoint(i)}
                      title="Endpunkt entfernen"
                    >✕</button>
                  )}
                </div>
                <input
                  className="hud-input"
                  value={ep.label}
                  onChange={(e) => updateEndpoint(i, 'label', e.target.value)}
                  placeholder="Label (optional)"
                  style={{ width: '100%', fontSize: 10 }}
                />
              </div>
            ))}
          </div>

          {/* Interval */}
          <div className="clawcom-setup-group">
            <label className="clawcom-setup-group-label">PING INTERVALL</label>
            <div className="clawcom-setup-row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {INTERVAL_PRESETS.map((preset) => (
                <button
                  key={preset.ms}
                  className={`hud-btn${!showCustom && intervalMs === preset.ms ? ' active' : ''}`}
                  style={{ fontSize: 10 }}
                  onClick={() => selectPreset(preset.ms)}
                >
                  {preset.label}
                </button>
              ))}
              <button
                className={`hud-btn${showCustom ? ' active' : ''}`}
                style={{ fontSize: 10 }}
                onClick={() => setShowCustom(true)}
              >CUSTOM</button>
            </div>
            {showCustom && (
              <div className="clawcom-setup-row" style={{ marginTop: 4 }}>
                <input
                  className="hud-input"
                  type="number"
                  min={1}
                  value={customIntervalMin}
                  onChange={(e) => handleCustomIntervalChange(e.target.value)}
                  placeholder="Minuten"
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Minuten (min. 1)</span>
              </div>
            )}
            {!showCustom && activePreset && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                Alle {activePreset.label} wird jeder Endpunkt geprüft
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
          disabled={!canSave || saving}
        >
          {saving ? '◌ SPEICHERN...' : '✓ KONFIGURIEREN'}
        </button>
      </div>
    </BaseDialog>
  )
}
