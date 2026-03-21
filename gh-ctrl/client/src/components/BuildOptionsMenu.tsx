import { useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'

interface BuildingDef {
  type: string
  name: string
  description: string
  buildImage: string
  defaultColor: string
}

const AVAILABLE_BUILDINGS: BuildingDef[] = [
  {
    type: 'clawcom',
    name: 'ClawCom',
    description:
      'Kommunikationsstation für Openclaw oder Nanoclaw. Verbinde externe Roboter-Agenten und sende ihnen Befehle über ein integriertes Chatfenster. Eingehende Nachrichten werden direkt am Gebäude angezeigt.',
    buildImage: '/buildings/build_clawcom.png',
    defaultColor: '#00ff88',
  },
]

interface BuildOptionsMenuProps {
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export function BuildOptionsMenu({ onClose, onSuccess, onError }: BuildOptionsMenuProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  const [selected, setSelected] = useState<BuildingDef | null>(null)
  const [buildName, setBuildName] = useState('')
  const [color, setColor] = useState('#00ff88')
  const [building, setBuilding] = useState(false)
  const [hoveredType, setHoveredType] = useState<string | null>(null)

  async function handleBuild() {
    if (!selected) return
    const name = buildName.trim() || selected.name
    setBuilding(true)
    try {
      await api.createBuilding({ type: selected.type, name, color })
      await loadBuildings()
      onSuccess(`${name} wurde erfolgreich gebaut!`)
      onClose()
    } catch (err: any) {
      onError(`Bau fehlgeschlagen: ${err.message}`)
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div
      className="map-dialog"
      onWheel={(e) => e.stopPropagation()}
    >
        <div className="map-dialog-title">&#x25a0; BAU OPTIONEN — GEBÄUDE ERRICHTEN</div>

        {!selected ? (
          <>
            <div style={{ marginBottom: 16, color: 'var(--text-dim)', fontSize: 12 }}>
              Wähle ein Gebäude zum Bauen. Gebäude sind eigenständige Webdienste und Funktionsmodule.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {AVAILABLE_BUILDINGS.map((b) => (
                <div
                  key={b.type}
                  className="map-load-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    padding: 16,
                    cursor: 'pointer',
                    position: 'relative',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg-panel)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={() => setHoveredType(b.type)}
                  onMouseLeave={() => setHoveredType(null)}
                  onClick={() => { setSelected(b); setBuildName(b.name); setColor(b.defaultColor) }}
                >
                  <img
                    src={b.buildImage}
                    alt={b.name}
                    style={{ width: 120, height: 120, objectFit: 'contain', imageRendering: 'auto' }}
                  />
                  <div style={{ fontWeight: 700, color: 'var(--green-neon)', fontSize: 13 }}>{b.name}</div>
                  {hoveredType === b.type && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--bg-darker)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '8px 12px',
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      width: 240,
                      zIndex: 10,
                      lineHeight: 1.5,
                      pointerEvents: 'none',
                      marginBottom: 6,
                    }}>
                      {b.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="map-dialog-actions" style={{ marginTop: 20 }}>
              <button className="hud-btn" onClick={onClose}>ABBRECHEN</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 20 }}>
              <img
                src={selected.buildImage}
                alt={selected.name}
                style={{ width: 140, height: 140, objectFit: 'contain', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-neon)', marginBottom: 8 }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 16 }}>
                  {selected.description}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                    BEZEICHNUNG
                  </label>
                  <input
                    className="hud-input"
                    value={buildName}
                    onChange={(e) => setBuildName(e.target.value)}
                    placeholder={selected.name}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                    FARBE
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      style={{ width: 36, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{color.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="map-dialog-actions">
              <button className="hud-btn" onClick={() => setSelected(null)}>&#x2190; ZURÜCK</button>
              <button
                className="hud-btn hud-btn-new-base"
                onClick={handleBuild}
                disabled={building}
              >
                {building ? '◌ WIRD GEBAUT...' : `&#x2b; ${buildName.trim() || selected.name} BAUEN`}
              </button>
            </div>
          </>
        )}
    </div>
  )
}
