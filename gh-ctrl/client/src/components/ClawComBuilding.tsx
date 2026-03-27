import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ClawComConfig, ClawComMessage } from '../types'
import { ClawComSetupDialog } from './ClawComSetupDialog'
import { ClawComChatDialog } from './ClawComChatDialog'

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

      // Parse target color
      const hex = color.replace('#', '')
      const tr = parseInt(hex.slice(0, 2), 16)
      const tg = parseInt(hex.slice(2, 4), 16)
      const tb = parseInt(hex.slice(4, 6), 16)

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        // Green dominant: g > r*1.3 && g > b*1.3 && g > 80
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
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  const deleteBuilding = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)

  const [showSetup, setShowSetup] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [incomingCount, setIncomingCount] = useState(0)
  const [lastSeenMsgId, setLastSeenMsgId] = useState<number | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

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
      const delay = 8000 + Math.random() * 12000 // 8–20s
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

  // Sync building prop changes (e.g., after store update)
  useEffect(() => {
    setCurrentBuilding(building)
  }, [building])

  let config: Partial<ClawComConfig> = {}
  try { config = JSON.parse(currentBuilding.config) } catch { /* empty */ }

  const isConfigured = config.configured === true

  // Poll for incoming messages when configured
  const pollMessages = useCallback(async () => {
    if (!isConfigured) return
    try {
      const msgs = await api.getBuildingMessages(currentBuilding.id)
      const incoming = msgs.filter((m) => m.direction === 'in')
      const latestIn = incoming.length > 0 ? incoming[incoming.length - 1] : null
      if (latestIn && latestIn.id !== lastSeenMsgId) {
        const newCount = lastSeenMsgId === null ? 0 : incoming.filter((m) => m.id > (lastSeenMsgId ?? 0)).length
        if (newCount > 0) setIncomingCount((c) => c + newCount)
        setLastSeenMsgId(latestIn.id)
      }
    } catch { /* ignore */ }
  }, [currentBuilding.id, isConfigured, lastSeenMsgId])

  useEffect(() => {
    if (!isConfigured) return
    const interval = setInterval(pollMessages, 15000)
    return () => clearInterval(interval)
  }, [isConfigured, pollMessages])

  // Open/close panel in sync with selection state
  useEffect(() => {
    if (isSelected) {
      if (!isConfigured) {
        setShowSetup(true)
        setShowChat(false)
      } else {
        setIncomingCount(0)
        setShowChat(true)
        setShowSetup(false)
      }
    } else {
      setShowSetup(false)
      setShowChat(false)
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

  return (
    <>
      <div
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

          {/* Incoming message badge */}
          {incomingCount > 0 && (
            <div style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: '#ff4444',
              color: '#fff',
              borderRadius: '50%',
              width: 20,
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--bg-darker)',
              animation: 'blink 1s infinite',
            }}>
              {incomingCount > 9 ? '9+' : incomingCount}
            </div>
          )}

          {/* Status indicator */}
          <div style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: config.clawType === 'claudechannel' ? '2px' : '50%',
            background: isConfigured
              ? config.clawType === 'claudechannel' ? '#a78bfa' : 'var(--green-neon)'
              : '#888',
            border: '1px solid var(--bg-darker)',
          }} title={isConfigured
            ? config.clawType === 'claudechannel' ? 'Claude Channel active' : 'Connected'
            : 'Not configured'
          } />
        </div>

        {/* Name label */}
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: currentBuilding.color ?? 'var(--green-neon)',
          textAlign: 'center',
          textShadow: `0 0 8px ${currentBuilding.color ?? 'var(--green-neon)'}44`,
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
            ? config.clawType === 'claudechannel'
              ? '✦ CLAUDE ● ACTIVE'
              : `${config.clawType?.toUpperCase() ?? 'CLAW'} ● ONLINE`
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
              value={currentBuilding.color ?? '#00ff88'}
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

      {/* Setup dialog — portaled to body to escape battlefield transform context */}
      {showSetup && createPortal(
        <ClawComSetupDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onConfigured={(updated) => {
            setCurrentBuilding(updated)
            addToast(`${updated.name} configured successfully!`, 'success')
          }}
          onError={(msg) => addToast(msg, 'error')}
        />,
        document.body
      )}

      {/* Chat dialog — portaled to body to escape battlefield transform context */}
      {showChat && createPortal(
        <ClawComChatDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onReconfigure={() => {
            setShowChat(false)
            setShowSetup(true)
          }}
          onError={(msg) => addToast(msg, 'error')}
        />,
        document.body
      )}
    </>
  )
}
