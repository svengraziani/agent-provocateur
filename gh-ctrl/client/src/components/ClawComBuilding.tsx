import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, RemoteShellConfig, SshConnection } from '../types'
import { useClawComTmuxWindows } from '../hooks/useClawComTmuxWindows'
import { RemoteShellSetupDialog } from './RemoteShellSetupDialog'
import { RemoteShellTerminalDialog } from './RemoteShellTerminalDialog'
import { TmuxWindowSatellite } from './TmuxWindowSatellite'

// Orbit radius for tmux-window satellites around a ClawCom building.
// Tuned to clear the 100px building image and the labels below it.
const SATELLITE_ORBIT_RADIUS = 130
// Switch to a wider second ring once the first orbit gets crowded.
const SATELLITE_SECOND_RING_RADIUS = 200
const SATELLITE_FIRST_RING_CAPACITY = 8

function satelliteOffset(index: number, count: number): { dx: number; dy: number } {
  // Place satellites preferentially on the upper ring so the label area
  // below the building stays readable. Satellites still complete the orbit
  // when count > capacity, just on a wider ring.
  const onSecondRing = index >= SATELLITE_FIRST_RING_CAPACITY
  const ringIndex = onSecondRing ? index - SATELLITE_FIRST_RING_CAPACITY : index
  const ringCount = onSecondRing
    ? Math.max(1, count - SATELLITE_FIRST_RING_CAPACITY)
    : Math.min(count, SATELLITE_FIRST_RING_CAPACITY)
  const radius = onSecondRing ? SATELLITE_SECOND_RING_RADIUS : SATELLITE_ORBIT_RADIUS
  // Start at top (-π/2), go clockwise
  const theta = (2 * Math.PI * ringIndex) / ringCount - Math.PI / 2
  return { dx: radius * Math.cos(theta), dy: radius * Math.sin(theta) }
}

interface Position {
  x: number
  y: number
}

interface ClawComBuildingProps {
  building: Building
  position: Position
  isRelocateMode: boolean
  isBeingRelocated: boolean
  onStartRelocate: (mouseX: number, mouseY: number) => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  isSelected?: boolean
  onSelect?: () => void
  onDeselect?: () => void
}

// Chroma-key: replace the green channel in the PNG with the building's color
function useColorizedImage(src: string, color: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      const hex = color.replace('#', '')
      const tr = parseInt(hex.slice(0, 2), 16)
      const tg = parseInt(hex.slice(2, 4), 16)
      const tb = parseInt(hex.slice(4, 6), 16)

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        if (g > r * 1.3 && g > b * 1.3 && g > 80) {
          const ratio = g / 255
          data[i] = Math.round(tr * ratio)
          data[i + 1] = Math.round(tg * ratio)
          data[i + 2] = Math.round(tb * ratio)
        }
      }
      ctx.putImageData(imageData, 0, 0)
      setDataUrl(canvas.toDataURL())
    }
    img.src = src
  }, [src, color])

  return dataUrl
}

export function ClawComBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: ClawComBuildingProps) {
  const deleteBuilding = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)
  const setPendingTmuxJump = useAppStore((s) => s.setPendingTmuxJump)

  const [showSetup, setShowSetup] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [connections, setConnections] = useState<SshConnection[]>([])
  const colorInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [inViewport, setInViewport] = useState(false)
  const connectionCount = connections.length

  const colorizedSrc = useColorizedImage('/buildings/clawcom.png', currentBuilding.color ?? '#00ff88')

  // Idle animations: [src, durationMs]
  const IDLE_ANIMS: [string, number][] = [
    ['/buildings/idle_1_4s_clawcom.gif', 4000],
    ['/buildings/idle_2_4s_clawcom.gif', 4000],
    ['/buildings/idle_3_4s_clawcom.gif', 4000],
    ['/buildings/idle_4_4s_clawcom.gif', 4000],
    ['/buildings/idle_5_10s_clawcom.gif', 10000],
    ['/buildings/idle_6_4s_clawcom.gif', 4000],
  ]
  const [idleAnimSrc, setIdleAnimSrc] = useState<string | null>(null)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleNext() {
      const delay = 8000 + Math.random() * 12000 // 8–20s between animations
      timeout = setTimeout(() => {
        const [src, duration] = IDLE_ANIMS[Math.floor(Math.random() * IDLE_ANIMS.length)]
        setIdleAnimSrc(src)
        timeout = setTimeout(() => {
          setIdleAnimSrc(null)
          scheduleNext()
        }, duration)
      }, delay)
    }
    scheduleNext()
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    setCurrentBuilding(building)
  }, [building])

  const config: Partial<RemoteShellConfig> = (() => {
    try { return JSON.parse(currentBuilding.config) } catch { return {} }
  })()

  const fetchConnectionCount = useCallback(async () => {
    try {
      const conns = await api.listShellConnections(currentBuilding.id)
      setConnections(conns)
    } catch { /* ignore */ }
  }, [currentBuilding.id])

  useEffect(() => {
    fetchConnectionCount()
  }, [fetchConnectionCount])

  // Configured when the flag is set AND at least one SSH connection profile exists
  const isConfigured = config.configured === true && connectionCount > 0

  // Track whether this building is on screen — the tmux satellites poll
  // SSH commands on the remote host, so we only want to do that for
  // buildings the user is actually looking at.
  useEffect(() => {
    if (!wrapperRef.current) return
    const obs = new IntersectionObserver(
      (entries) => setInViewport(entries[0]?.isIntersecting === true),
      { threshold: 0.01 }
    )
    obs.observe(wrapperRef.current)
    return () => obs.disconnect()
  }, [])

  const tmuxData = useClawComTmuxWindows({
    buildingId: currentBuilding.id,
    connections,
    enabled: isConfigured && inViewport && !isRelocateMode,
  })

  const satellites = useMemo(
    () =>
      tmuxData.flatMap(({ connection, windows }) =>
        windows.map((win) => ({
          key: `${connection.id}-${win.index}`,
          connection,
          window: win,
        }))
      ),
    [tmuxData]
  )

  const handleSatelliteClick = useCallback(
    (connectionId: number, windowIndex: number) => {
      setPendingTmuxJump({
        buildingId: currentBuilding.id,
        connectionId,
        windowIndex,
      })
      // Open the terminal dialog if it's not already open. If it is, the
      // dialog will pick up the new pendingTmuxJump and switch tabs/jump.
      if (!isSelected) onSelect?.()
    },
    [currentBuilding.id, isSelected, onSelect, setPendingTmuxJump]
  )

  useEffect(() => {
    if (isSelected) {
      if (!isConfigured) {
        setShowSetup(true)
        setShowTerminal(false)
      } else {
        setShowTerminal(true)
        setShowSetup(false)
      }
    } else {
      setShowSetup(false)
      setShowTerminal(false)
    }
  }, [isSelected, isConfigured])

  function handleClick() {
    if (isRelocateMode) return
    onSelect?.()
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (isRelocateMode) {
      e.stopPropagation()
      onStartRelocate(e.clientX, e.clientY)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${currentBuilding.name}"?`)) return
    try {
      await deleteBuilding(currentBuilding.id)
    } catch { /* toast shown by store */ }
  }

  async function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newColor = e.target.value
    setCurrentBuilding((b) => ({ ...b, color: newColor }))
    await updateBuildingColor(currentBuilding.id, newColor)
  }

  const buildingColor = currentBuilding.color ?? '#00ff88'

  return (
    <>
      <div
        ref={wrapperRef}
        className={`base-node clawcom-building${isSelected ? ' clawcom-selected' : ''}`}
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
          cursor: isRelocateMode ? 'grab' : 'pointer',
          userSelect: 'none',
          width: 140,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          zIndex: isBeingRelocated ? 100 : 1,
          opacity: isBeingRelocated ? 0.75 : 1,
        }}
        data-building-id={building.id}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {/* Building image */}
        <div className="clawcom-img-wrap" style={{ position: 'relative' }}>
          {idleAnimSrc ? (
            <img
              src={idleAnimSrc}
              alt={currentBuilding.name}
              style={{ width: 100, height: 100, objectFit: 'contain' }}
              draggable={false}
            />
          ) : colorizedSrc ? (
            <img
              src={colorizedSrc}
              alt={currentBuilding.name}
              style={{
                width: 100,
                height: 100,
                objectFit: 'contain',
                imageRendering: 'auto',
                filter: isBeingRelocated ? 'brightness(1.5)' : undefined,
              }}
              draggable={false}
            />
          ) : (
            <div style={{ width: 100, height: 100, background: 'var(--bg-panel)', borderRadius: 4 }} />
          )}

          {/* Connection count badge */}
          {connectionCount > 0 && (
            <div style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: buildingColor,
              color: '#000',
              borderRadius: '50%',
              width: 20,
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--bg-darker)',
            }}>
              {connectionCount > 9 ? '9+' : connectionCount}
            </div>
          )}

          {/* Status dot */}
          <div style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isConfigured ? 'var(--green-neon)' : '#888',
            border: '1px solid var(--bg-darker)',
          }} title={isConfigured ? 'Ready' : 'Not configured'} />
        </div>

        {/* Name label */}
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: buildingColor,
          textAlign: 'center',
          textShadow: `0 0 8px ${buildingColor}44`,
          maxWidth: 130,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentBuilding.name}
        </div>

        {/* Status text */}
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>
          {isConfigured
            ? `▣ ${connectionCount} CONN${connectionCount !== 1 ? 'S' : ''} ● READY`
            : '⚙ SETUP REQUIRED'}
        </div>

        {/* Action bar (visible on hover via CSS) */}
        {!isRelocateMode && (
          <div
            className="clawcom-actions"
            style={{ display: 'flex', gap: 4, marginTop: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px' }}
              onClick={() => colorInputRef.current?.click()}
              title="Change color"
            >
              ◈
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={buildingColor}
              onChange={handleColorChange}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
            />
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px', color: '#ff6b6b' }}
              onClick={handleDelete}
              title="Demolish building"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Tmux window satellites — orbit around the ClawCom when the building
          is configured and visible. Rendered as siblings of the building
          wrapper so they sit in the map's coordinate space. */}
      {!isRelocateMode && satellites.map((sat, i) => {
        const { dx, dy } = satelliteOffset(i, satellites.length)
        return (
          <TmuxWindowSatellite
            key={sat.key}
            connection={sat.connection}
            window={sat.window}
            buildingColor={buildingColor}
            x={position.x + dx}
            y={position.y + dy}
            onClick={handleSatelliteClick}
          />
        )
      })}

      {/* Setup dialog — portaled to body to escape battlefield transform context */}
      {showSetup && createPortal(
        <RemoteShellSetupDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onConfigured={(updated) => {
            setCurrentBuilding(updated)
            fetchConnectionCount()
            addToast(`${updated.name} configured successfully!`, 'success')
          }}
          onOpenTerminal={() => {
            setShowSetup(false)
            setShowTerminal(true)
          }}
          onError={(msg) => addToast(msg, 'error')}
        />,
        document.body
      )}

      {/* Terminal dialog — portaled to body to escape battlefield transform context */}
      {showTerminal && createPortal(
        <RemoteShellTerminalDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onReconfigure={() => {
            setShowTerminal(false)
            setShowSetup(true)
          }}
          addToast={addToast}
        />,
        document.body
      )}
    </>
  )
}
