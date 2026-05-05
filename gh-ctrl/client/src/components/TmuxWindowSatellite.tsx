import type { SshConnection, TmuxWindow } from '../types'

interface TmuxWindowSatelliteProps {
  connection: SshConnection
  window: TmuxWindow
  buildingColor: string
  /** Center coordinate of the satellite (already includes orbital offset) */
  x: number
  y: number
  onClick: (connectionId: number, windowIndex: number) => void
}

export function TmuxWindowSatellite({
  connection,
  window: win,
  buildingColor,
  x,
  y,
  onClick,
}: TmuxWindowSatelliteProps) {
  const sessionLabel = connection.tmuxSession ?? ''
  const accent = win.active ? '#00ff88' : buildingColor

  return (
    <div
      className="tmux-window-satellite"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        width: 70,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
        userSelect: 'none',
        zIndex: 2,
      }}
      title={`Jump to ${sessionLabel}:${win.index} (${win.name}) on ${connection.label}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick(connection.id, win.index)
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: '#0a0a1a',
          border: `2px solid ${accent}`,
          boxShadow: win.active
            ? `0 0 12px ${accent}, inset 0 0 6px ${accent}55`
            : `0 0 4px ${accent}66`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 14,
          textShadow: `0 0 6px ${accent}`,
        }}
      >
        {win.index}
      </div>
      <div
        style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: accent,
          textShadow: `0 0 6px ${accent}66`,
          maxWidth: 70,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          fontWeight: win.active ? 700 : 400,
        }}
      >
        {win.name}
      </div>
    </div>
  )
}
