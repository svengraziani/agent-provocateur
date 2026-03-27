import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, MailboxConfig } from '../types'
import { MailboxSetupDialog } from './MailboxSetupDialog'
import { MailboxInboxDialog } from './MailboxInboxDialog'

interface Position {
  x: number
  y: number
}

interface MailboxBuildingProps {
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

// Chroma-key: replace green pixels with the building's color
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
          data[i]     = Math.round(tr * ratio)
          data[i + 1] = Math.round(tg * ratio)
          data[i + 2] = Math.round(tb * ratio)
        }
      }
      ctx.putImageData(imageData, 0, 0)
      setDataUrl(canvas.toDataURL())
    }
    img.onerror = () => setDataUrl(null)
    img.src = src
  }, [src, color])

  return dataUrl
}

export function MailboxBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: MailboxBuildingProps) {
  const deleteBuilding      = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)

  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [showSetup, setShowSetup]             = useState(false)
  const [showInbox, setShowInbox]             = useState(false)
  const [unreadCount, setUnreadCount]         = useState(0)
  const colorInputRef = useRef<HTMLInputElement>(null)

  const colorizedSrc = useColorizedImage('/buildings/snailbox.png', currentBuilding.color ?? '#4488ff')

  useEffect(() => {
    setCurrentBuilding(building)
  }, [building])

  let config: Partial<MailboxConfig> = {}
  try { config = JSON.parse(currentBuilding.config) } catch { /* empty */ }
  const isConfigured = config.configured === true

  // Poll for unread count
  const fetchUnread = useCallback(async () => {
    if (!isConfigured) return
    try {
      const res = await api.getMailUnreadCount(currentBuilding.id)
      setUnreadCount(res.count)
    } catch { /* ignore */ }
  }, [currentBuilding.id, isConfigured])

  useEffect(() => {
    if (!isConfigured) return
    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => clearInterval(interval)
  }, [isConfigured, fetchUnread])

  // Sync selection state with dialog visibility
  useEffect(() => {
    if (isSelected) {
      if (!isConfigured) {
        setShowSetup(true)
        setShowInbox(false)
      } else {
        setShowInbox(true)
        setShowSetup(false)
        setUnreadCount(0)
      }
    } else {
      setShowSetup(false)
      setShowInbox(false)
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

  const buildingColor = currentBuilding.color ?? '#4488ff'

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
          {colorizedSrc ? (
            <img
              src={colorizedSrc}
              alt={currentBuilding.name}
              style={{
                width: 100, height: 100, objectFit: 'contain',
                imageRendering: 'auto',
                filter: isBeingRelocated ? 'brightness(1.5)' : undefined,
              }}
              draggable={false}
            />
          ) : (
            <div style={{
              width: 100, height: 100,
              background: 'var(--bg-panel)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              border: `2px solid ${buildingColor}44`,
              filter: isBeingRelocated ? 'brightness(1.5)' : undefined,
            }}>
              ✉
            </div>
          )}

          {/* Unread badge */}
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              background: '#ff4444', color: '#fff',
              borderRadius: '50%', width: 20, height: 20,
              fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--bg-darker)',
              animation: 'blink 1s infinite',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}

          {/* Status dot */}
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 8, height: 8, borderRadius: '50%',
            background: isConfigured ? 'var(--green-neon)' : '#888',
            border: '1px solid var(--bg-darker)',
          }} title={isConfigured ? 'Connected' : 'Not configured'} />
        </div>

        {/* Name label */}
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: buildingColor,
          textAlign: 'center',
          textShadow: `0 0 8px ${buildingColor}44`,
          maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentBuilding.name}
        </div>

        {/* Status text */}
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>
          {isConfigured
            ? unreadCount > 0
              ? `✉ ${unreadCount} UNREAD`
              : '✉ MAIL ● ONLINE'
            : '⚙ SETUP REQUIRED'}
        </div>

        {/* Action bar */}
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
            >◈</button>
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
            >✕</button>
          </div>
        )}
      </div>

      {showSetup && createPortal(
        <MailboxSetupDialog
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

      {showInbox && createPortal(
        <MailboxInboxDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onReconfigure={() => {
            setShowInbox(false)
            setShowSetup(true)
          }}
          onError={(msg) => addToast(msg, 'error')}
        />,
        document.body
      )}
    </>
  )
}
