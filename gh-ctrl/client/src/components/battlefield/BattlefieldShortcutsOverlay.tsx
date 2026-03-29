import type { DashboardEntry, Building } from '../../types'
import type { ShortcutConfig } from '../../hooks/useBattlefieldKeyboardShortcuts'

interface BattlefieldShortcutsOverlayProps {
  entries: DashboardEntry[]
  buildings: Building[]
  shortcuts: ShortcutConfig
  assigningFor: { type: 'base' | 'building'; id: number } | null
  onClose: () => void
  onStartAssigning: (type: 'base' | 'building', id: number) => void
  onClearShortcut: (type: 'base' | 'building', id: number) => void
  onCancelAssigning: () => void
}

const BUILT_IN_SHORTCUTS = [
  { key: '+  /  =', description: 'Zoom in' },
  { key: '-', description: 'Zoom out' },
  { key: '0', description: 'Reset view' },
  { key: '↑ ↓ ← →', description: 'Pan camera' },
  { key: 'R', description: 'Scan / Refresh' },
  { key: 'F', description: 'Toggle Intel Feed' },
  { key: 'T', description: 'Toggle Timers' },
  { key: '?', description: 'Toggle this overlay' },
  { key: 'Ctrl+K', description: 'Open Command Palette' },
]

function KeyBadge({ keyStr }: { keyStr: string }) {
  return (
    <span className="shortcut-key-badge">{keyStr}</span>
  )
}

export function BattlefieldShortcutsOverlay({
  entries,
  buildings,
  shortcuts,
  assigningFor,
  onClose,
  onStartAssigning,
  onClearShortcut,
  onCancelAssigning,
}: BattlefieldShortcutsOverlayProps) {
  return (
    <div
      className="shortcuts-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div className="shortcuts-panel">
        <div className="shortcuts-panel-header">
          <span className="shortcuts-panel-title">⌨ KEYBOARD SHORTCUTS</span>
          <button className="shortcuts-panel-close" onClick={onClose} aria-label="Close shortcuts overlay">✕</button>
        </div>

        {assigningFor && (
          <div className="shortcuts-assigning-banner" role="status" aria-live="polite">
            Press any key to assign — <kbd>Esc</kbd> to cancel
          </div>
        )}

        <div className="shortcuts-panel-body">
          {/* Built-in shortcuts */}
          <div className="shortcuts-section">
            <div className="shortcuts-section-title">NAVIGATION</div>
            <table className="shortcuts-table">
              <tbody>
                {BUILT_IN_SHORTCUTS.map(({ key, description }) => (
                  <tr key={key} className="shortcuts-row">
                    <td className="shortcuts-key-cell">
                      <KeyBadge keyStr={key} />
                    </td>
                    <td className="shortcuts-desc-cell">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Base shortcuts */}
          {entries.length > 0 && (
            <div className="shortcuts-section">
              <div className="shortcuts-section-title">BASES</div>
              <table className="shortcuts-table">
                <tbody>
                  {entries.map((entry) => {
                    const assignedKey = shortcuts.bases[entry.repo.id]
                    const isAssigning = assigningFor?.type === 'base' && assigningFor.id === entry.repo.id
                    return (
                      <tr key={entry.repo.id} className={`shortcuts-row${isAssigning ? ' shortcuts-row-assigning' : ''}`}>
                        <td className="shortcuts-key-cell">
                          {assignedKey
                            ? <KeyBadge keyStr={assignedKey.toUpperCase()} />
                            : <span className="shortcuts-unassigned">—</span>
                          }
                        </td>
                        <td className="shortcuts-desc-cell">
                          <span className="shortcuts-base-color" style={{ color: entry.repo.color }}>■</span>
                          {' '}{entry.repo.name}
                        </td>
                        <td className="shortcuts-action-cell">
                          {isAssigning ? (
                            <button className="shortcuts-btn shortcuts-btn-cancel" onClick={onCancelAssigning} aria-label={`Cancel assigning shortcut for ${entry.repo.name}`}>
                              Cancel
                            </button>
                          ) : (
                            <>
                              <button
                                className="shortcuts-btn"
                                onClick={() => onStartAssigning('base', entry.repo.id)}
                                aria-label={`${assignedKey ? 'Change' : 'Assign'} shortcut for ${entry.repo.name}`}
                              >
                                {assignedKey ? 'Change' : 'Assign'}
                              </button>
                              {assignedKey && (
                                <button
                                  className="shortcuts-btn shortcuts-btn-clear"
                                  onClick={() => onClearShortcut('base', entry.repo.id)}
                                  aria-label={`Remove shortcut for ${entry.repo.name}`}
                                >
                                  ✕
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Building shortcuts */}
          {buildings.length > 0 && (
            <div className="shortcuts-section">
              <div className="shortcuts-section-title">BUILDINGS</div>
              <table className="shortcuts-table">
                <tbody>
                  {buildings.map((building) => {
                    const assignedKey = shortcuts.buildings[building.id]
                    const isAssigning = assigningFor?.type === 'building' && assigningFor.id === building.id
                    return (
                      <tr key={building.id} className={`shortcuts-row${isAssigning ? ' shortcuts-row-assigning' : ''}`}>
                        <td className="shortcuts-key-cell">
                          {assignedKey
                            ? <KeyBadge keyStr={assignedKey.toUpperCase()} />
                            : <span className="shortcuts-unassigned">—</span>
                          }
                        </td>
                        <td className="shortcuts-desc-cell">
                          <span className="shortcuts-building-icon">▣</span>
                          {' '}{building.name}
                          <span className="shortcuts-building-type"> [{building.type}]</span>
                        </td>
                        <td className="shortcuts-action-cell">
                          {isAssigning ? (
                            <button className="shortcuts-btn shortcuts-btn-cancel" onClick={onCancelAssigning} aria-label={`Cancel assigning shortcut for ${building.name}`}>
                              Cancel
                            </button>
                          ) : (
                            <>
                              <button
                                className="shortcuts-btn"
                                onClick={() => onStartAssigning('building', building.id)}
                                aria-label={`${assignedKey ? 'Change' : 'Assign'} shortcut for ${building.name}`}
                              >
                                {assignedKey ? 'Change' : 'Assign'}
                              </button>
                              {assignedKey && (
                                <button
                                  className="shortcuts-btn shortcuts-btn-clear"
                                  onClick={() => onClearShortcut('building', building.id)}
                                  aria-label={`Remove shortcut for ${building.name}`}
                                >
                                  ✕
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="shortcuts-panel-footer">
          Shortcuts are saved automatically · Jump to base/building with camera zoom
        </div>
      </div>
    </div>
  )
}
