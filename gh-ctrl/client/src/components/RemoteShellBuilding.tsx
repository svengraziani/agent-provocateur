import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, RemoteShellConfig } from '../types'
import { RemoteShellSetupDialog } from './RemoteShellSetupDialog'
import { RemoteShellTerminalDialog } from './RemoteShellTerminalDialog'

interface Position {
  x: number
  y: number
}

interface RemoteShellBuildingProps {
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

export function RemoteShellBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: RemoteShellBuildingProps) {
  const deleteBuilding      = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)

  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [showSetup, setShowSetup]             = useState(false)
  const [showTerminal, setShowTerminal]       = useState(false)
  const [connectionCount, setConnectionCount] = useState(0)
  const colorInputRef = useRef<HTMLInputElement>(null)

  const colorizedSrc = useColorizedImage('/buildings/healthcheck.png', currentBuilding.color ?? '#00aaff')

  useEffect(() => { setCurrentBuilding(building) }, [building])

  const config: Partial<RemoteShellConfig> = (() => {
    try { return JSON.parse(currentBuilding.config) } catch { return {} }
  })()
  const isConfigured = config.configured === true

  const fetchConnectionCount = useCallback(async () => {
    try {
      const conns = await api.listShellConnections(currentBuilding.id)
      setConnectionCount(conns.length)
    } catch { /* ignore */ }
  }, [currentBuilding.id])

  useEffect(() => {
    fetchConnectionCount()
  }, [fetchConnectionCount])

  // Sync selection state with dialog visibility
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

  const buildingColor = currentBuilding.color ?? '#00aaff'

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
        data-building-id={building.id}
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
              &#x1F5A5;
            </div>
          )}

          {/* Connection count badge */}
          {connectionCount > 0 && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              background: buildingColor, color: '#000',
              borderRadius: '50%', width: 20, height: 20,
              fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--bg-darker)',
            }}>
              {connectionCount > 9 ? '9+' : connectionCount}
            </div>
          )}

          {/* Status dot */}
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 8, height: 8, borderRadius: '50%',
            background: isConfigured ? 'var(--green-neon)' : '#888',
            border: '1px solid var(--bg-darker)',
          }} title={isConfigured ? 'Ready' : 'Not configured'} />
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
            ? `▣ ${connectionCount} CONN${connectionCount !== 1 ? 'S' : ''} ● READY`
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
        <RemoteShellSetupDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onConfigured={(updated) => {
            setCurrentBuilding(updated)
            fetchConnectionCount()
            addToast(`${updated.name} configured!`, 'success')
          }}
          onOpenTerminal={() => {
            setShowSetup(false)
            setShowTerminal(true)
          }}
          onError={(msg) => addToast(msg, 'error')}
        />,
        document.body
      )}

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
