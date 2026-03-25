import { useState } from 'react'
import { PlusIcon, CloseIcon } from './Icons'
import { SidePanel } from './SidePanel'

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
  {
    type: 'healthcheck',
    name: 'Healthcheck',
    description:
      'Überwache einen oder mehrere HTTP-Endpunkte und visualisiere deren Verfügbarkeit direkt auf dem Schlachtfeld. Konfiguriere Ping-Intervalle und Labels für jeden Endpunkt — das Gebäude leuchtet grün bei OK, rot bei Ausfall.',
    buildImage: '/buildings/healthcheck.png',
    defaultColor: '#00FF00',
  },
  {
    type: 'snailbox',
    name: 'Snailbox',
    description:
      'Interner E-Mail-Client — verbinde dein IMAP/SMTP-Postfach und verwalte E-Mails direkt vom Schlachtfeld. Zeigt ungelesene Nachrichten als Badge an.',
    buildImage: '/buildings/build_snailbox.png',
    defaultColor: '#4488ff',
  },
  {
    type: 'new-base',
    name: 'Repository',
    description:
      'Etabliere ein neues GitHub-Repository direkt vom Schlachtfeld. Konfiguriere Namen, Beschreibung und Sichtbarkeit — das neue Hauptquartier erscheint sofort in deiner Kommandozentrale.',
    buildImage: '/buildings/build_base.png',
    defaultColor: '#00ff88',
  },
]

export interface PlacementParams {
  type: string
  name: string
  color: string
  buildImage: string
  repoDescription?: string
  repoVisibility?: 'public' | 'private'
  repoId?: number
}

interface BuildOptionsMenuProps {
  onClose: () => void
  onStartPlacement: (params: PlacementParams) => Promise<void>
}

const REPO_NAME_RE = /^[a-zA-Z0-9._-]+$/

export function BuildOptionsMenu({ onClose, onStartPlacement }: BuildOptionsMenuProps) {
  const [selected, setSelected] = useState<BuildingDef | null>(null)
  const [buildName, setBuildName] = useState('')
  const [color, setColor] = useState('#00ff88')
  const [repoDescription, setRepoDescription] = useState('')
  const [repoVisibility, setRepoVisibility] = useState<'public' | 'private'>('private')
  const [creating, setCreating] = useState(false)

  function selectBuilding(b: BuildingDef) {
    setSelected(b)
    setBuildName(b.type === 'new-base' ? '' : b.name)
    setColor(b.defaultColor)
    setRepoDescription('')
    setRepoVisibility('private')
  }

  const isNewBase = selected?.type === 'new-base'
  const repoNameValid = !isNewBase || REPO_NAME_RE.test(buildName.trim())
  const canSubmit = !!selected && (!isNewBase || (buildName.trim().length > 0 && repoNameValid))

  async function handlePlatzieren() {
    if (!selected || !canSubmit || creating) return
    setCreating(true)
    try {
      await onStartPlacement({
        type: selected.type,
        name: buildName.trim() || selected.name,
        color,
        buildImage: selected.buildImage,
        ...(isNewBase && {
          repoDescription: repoDescription.trim() || undefined,
          repoVisibility,
        }),
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <SidePanel className="cnc-sidebar" onClose={onClose}>

      {/* Header */}
      <div className="cnc-sidebar-header">
        <span>&#x25a0; BAU OPTIONEN</span>
        <button className="cnc-close-btn" onClick={onClose} title="Close [Esc]">
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
            {isNewBase ? (
              <>
                <div className="cnc-field">
                  <label>BASE DESIGNATION</label>
                  <input
                    className="hud-input cnc-input"
                    value={buildName}
                    onChange={(e) => setBuildName(e.target.value)}
                    placeholder="my-new-repo"
                    style={buildName.trim() && !repoNameValid ? { borderColor: '#ff4444' } : undefined}
                  />
                  {buildName.trim() && !repoNameValid && (
                    <div style={{ color: '#ff4444', fontSize: 10, marginTop: 2 }}>
                      Only letters, numbers, hyphens, dots and underscores
                    </div>
                  )}
                </div>
                <div className="cnc-field">
                  <label>INTEL BRIEF</label>
                  <input
                    className="hud-input cnc-input"
                    value={repoDescription}
                    onChange={(e) => setRepoDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="cnc-field">
                  <label>CLEARANCE LEVEL</label>
                  <div className="cnc-color-row">
                    <button
                      className={`hud-btn${repoVisibility === 'private' ? ' active' : ''}`}
                      style={{ fontSize: 10 }}
                      onClick={() => setRepoVisibility('private')}
                    >PRIVATE</button>
                    <button
                      className={`hud-btn${repoVisibility === 'public' ? ' active' : ''}`}
                      style={{ fontSize: 10 }}
                      onClick={() => setRepoVisibility('public')}
                    >PUBLIC</button>
                  </div>
                </div>
              </>
            ) : (
              <>
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
            )}
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
        <button className="hud-btn" onClick={onClose} disabled={creating}>
          <CloseIcon size={9} /> ABBRECHEN
        </button>
        <button
          className="hud-btn hud-btn-new-base"
          onClick={handlePlatzieren}
          disabled={!canSubmit || creating}
          title={!selected ? 'Kein Gebäude ausgewählt' : isNewBase ? 'Repository erstellen' : 'Auf Karte platzieren'}
        >
          {creating
            ? <><span className="cnc-spinner" /> WIRD ERSTELLT...</>
            : <><PlusIcon size={9} /> {isNewBase ? 'ERSTELLEN' : 'PLATZIEREN'}</>
          }
        </button>
      </div>

    </SidePanel>
  )
}
