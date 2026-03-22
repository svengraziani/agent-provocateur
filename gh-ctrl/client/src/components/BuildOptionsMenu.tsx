import { useState } from 'react'
import { PlusIcon, CloseIcon } from './Icons'

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

export interface PlacementParams {
  type: string
  name: string
  color: string
  buildImage: string
}

interface BuildOptionsMenuProps {
  onClose: () => void
  onStartPlacement: (params: PlacementParams) => void
}

export function BuildOptionsMenu({ onClose, onStartPlacement }: BuildOptionsMenuProps) {
  const [selected, setSelected] = useState<BuildingDef | null>(null)
  const [buildName, setBuildName] = useState('')
  const [color, setColor] = useState('#00ff88')

  function selectBuilding(b: BuildingDef) {
    setSelected(b)
    setBuildName(b.name)
    setColor(b.defaultColor)
  }

  function handlePlatzieren() {
    if (!selected) return
    onStartPlacement({
      type: selected.type,
      name: buildName.trim() || selected.name,
      color,
      buildImage: selected.buildImage,
    })
  }

  return (
    <div className="cnc-sidebar" onWheel={(e) => e.stopPropagation()}>

      {/* Header */}
      <div className="cnc-sidebar-header">
        <span>&#x25a0; BAU OPTIONEN</span>
        <button className="cnc-close-btn" onClick={onClose} title="Schließen">
          <CloseIcon size={10} />
        </button>
      </div>

      {/* Preview / Config */}
      <div className="cnc-preview">
        {selected ? (
          <>
            <img className="cnc-preview-img" src={selected.buildImage} alt={selected.name} />
            <div className="cnc-preview-name">{selected.name}</div>
            <div className="cnc-preview-desc">{selected.description}</div>
            <div className="cnc-field">
              <label>BEZEICHNUNG</label>
              <input
                className="hud-input cnc-input"
                value={buildName}
                onChange={(e) => setBuildName(e.target.value)}
                placeholder={selected.name}
              />
            </div>
            <div className="cnc-field">
              <label>FARBE</label>
              <div className="cnc-color-row">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <span>{color.toUpperCase()}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="cnc-preview-empty">
            &#x25a6; Wähle ein<br />Gebäude zum Platzieren
          </div>
        )}
      </div>

      {/* Building grid */}
      <div className="cnc-grid">
        {AVAILABLE_BUILDINGS.map((b) => (
          <div
            key={b.type}
            className={`cnc-card${selected?.type === b.type ? ' selected' : ''}`}
            onClick={() => selectBuilding(b)}
            title={b.description}
          >
            <div className="cnc-card-img-wrap">
              <img src={b.buildImage} alt={b.name} />
              {selected?.type === b.type && (
                <span className="cnc-ready">BEREIT</span>
              )}
            </div>
            <div className="cnc-card-label">{b.name}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="cnc-footer">
        <button className="hud-btn" onClick={onClose}>
          <CloseIcon size={9} /> ABBRECHEN
        </button>
        <button
          className="hud-btn hud-btn-new-base"
          onClick={handlePlatzieren}
          disabled={!selected}
          title={!selected ? 'Kein Gebäude ausgewählt' : 'Auf Karte platzieren'}
        >
          <PlusIcon size={9} /> PLATZIEREN
        </button>
      </div>

    </div>
  )
}
