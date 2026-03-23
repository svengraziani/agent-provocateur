import { useState, useRef } from 'react'
import { useAppStore } from '../store'
import type { PlacedBadge } from '../types'
import { api } from '../api'

interface BadgeMarkerProps {
  placedBadge: PlacedBadge
  position: { x: number; y: number }
  isRelocateMode: boolean
  isBeingRelocated: boolean
  onStartRelocate: (mouseX: number, mouseY: number) => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  serverUrl: string
}

export function BadgeMarker({
  placedBadge,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  serverUrl,
}: BadgeMarkerProps) {
  const removePlacedBadge = useAppStore((s) => s.removePlacedBadge)
  const updatePlacedBadgeScale = useAppStore((s) => s.updatePlacedBadgeScale)
  const updatePlacedBadgeLabel = useAppStore((s) => s.updatePlacedBadgeLabel)

  const [showActions, setShowActions] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(placedBadge.label ?? '')
  const [scale, setScale] = useState(placedBadge.scale)
  const labelInputRef = useRef<HTMLInputElement>(null)

  const badge = placedBadge.badge
  const imgSrc = badge
    ? `${serverUrl}/uploads/badges/${badge.filename}`
    : ''

  const imgSize = Math.round(48 * scale)

  function handleMouseDown(e: React.MouseEvent) {
    if (isRelocateMode) {
      e.stopPropagation()
      onStartRelocate(e.clientX, e.clientY)
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove badge "${badge?.name ?? 'badge'}"?`)) return
    try {
      await removePlacedBadge(placedBadge.id)
    } catch { /* toast shown by store */ }
  }

  async function handleScaleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newScale = Number(e.target.value)
    setScale(newScale)
    await updatePlacedBadgeScale(placedBadge.id, newScale)
  }

  async function handleLabelSave() {
    setEditingLabel(false)
    await updatePlacedBadgeLabel(placedBadge.id, labelValue)
  }

  async function handleLabelKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') await handleLabelSave()
    if (e.key === 'Escape') { setEditingLabel(false); setLabelValue(placedBadge.label ?? '') }
  }

  return (
    <div
      className="base-node badge-marker"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        cursor: isRelocateMode ? 'grab' : 'pointer',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        zIndex: isBeingRelocated ? 100 : 2,
        opacity: isBeingRelocated ? 0.75 : 1,
      }}
      onMouseDown={handleMouseDown}
      onClick={() => { if (!isRelocateMode) setShowActions((v) => !v) }}
    >
      {badge && (
        <img
          src={imgSrc}
          alt={badge.name}
          style={{
            width: imgSize,
            height: imgSize,
            objectFit: 'contain',
            imageRendering: 'auto',
            filter: isBeingRelocated ? 'brightness(1.5) drop-shadow(0 0 6px #fff)' : 'drop-shadow(0 0 4px rgba(0,255,136,0.5))',
            transition: 'width 0.15s, height 0.15s',
          }}
          draggable={false}
        />
      )}

      {/* Label */}
      {editingLabel ? (
        <input
          ref={labelInputRef}
          autoFocus
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
          onBlur={handleLabelSave}
          onKeyDown={handleLabelKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--green-neon)',
            color: 'var(--green-neon)',
            fontSize: 10,
            padding: '1px 4px',
            borderRadius: 2,
            width: 90,
            textAlign: 'center',
            outline: 'none',
          }}
        />
      ) : (
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--green-neon)',
          textAlign: 'center',
          textShadow: '0 0 6px var(--green-neon)44',
          maxWidth: 100,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minHeight: 14,
        }}>
          {labelValue || badge?.name || ''}
        </div>
      )}

      {/* Action bar — shown on click */}
      {showActions && !isRelocateMode && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '4px 6px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--green-neon)44',
            borderRadius: 4,
            marginTop: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>SIZE</span>
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.05"
              value={scale}
              onChange={handleScaleChange}
              style={{ width: 70 }}
            />
            <span style={{ fontSize: 9, color: 'var(--green-neon)', minWidth: 28 }}>{Math.round(scale * 100)}%</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px', flex: 1 }}
              onClick={() => { setEditingLabel(true); setShowActions(false) }}
              title="Edit label"
            >
              ✎
            </button>
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px', color: '#ff6b6b', flex: 1 }}
              onClick={handleRemove}
              title="Remove badge"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
