import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, HealthcheckConfig, HealthcheckResult } from '../types'
import { HealthcheckSetupDialog } from './HealthcheckSetupDialog'

interface Position {
  x: number
  y: number
}

interface HealthcheckBuildingProps {
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

function getOverallStatus(results: HealthcheckResult[]): 'ok' | 'error' | 'partial' | 'unknown' {
  if (results.length === 0) return 'unknown'
  const okCount = results.filter((r) => r.ok === 1).length
  if (okCount === results.length) return 'ok'
  if (okCount === 0) return 'error'
  return 'partial'
}

const STATUS_COLOR: Record<string, string> = {
  ok: '#00FF00',
  error: '#ff4444',
  partial: '#ffaa00',
  unknown: '#888',
}

export function HealthcheckBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: HealthcheckBuildingProps) {
  const deleteBuilding = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)

  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [results, setResults] = useState<HealthcheckResult[]>([])
  const [showSetup, setShowSetup] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

  const colorizedSrc = useColorizedImage('/buildings/healthcheck.png', currentBuilding.color ?? '#00FF00')

  useEffect(() => {
    setCurrentBuilding(building)
  }, [building])

  let config: Partial<HealthcheckConfig> = {}
  try { config = JSON.parse(currentBuilding.config) } catch { /* empty */ }

  const isConfigured = config.configured === true

  const fetchResults = useCallback(async () => {
    if (!isConfigured) return
    try {
      const data = await api.getBuildingHealthcheck(currentBuilding.id)
      setResults(data)
    } catch { /* ignore */ }
  }, [currentBuilding.id, isConfigured])

  // Poll for results
  useEffect(() => {
    if (!isConfigured) return
    fetchResults()
    const interval = setInterval(fetchResults, 30_000)
    return () => clearInterval(interval)
  }, [isConfigured, fetchResults])

  // Open/close setup dialog in sync with selection state
  useEffect(() => {
    if (isSelected) {
      setShowSetup(true)
    } else {
      setShowSetup(false)
    }
  }, [isSelected])

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
    if (!confirm(`"${currentBuilding.name}" wirklich löschen?`)) return
    try {
      await deleteBuilding(currentBuilding.id)
    } catch { /* toast shown by store */ }
  }

  async function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newColor = e.target.value
    setCurrentBuilding((b) => ({ ...b, color: newColor }))
    await updateBuildingColor(currentBuilding.id, newColor)
  }

  async function handleTriggerCheck() {
    try {
      await api.triggerBuildingHealthcheck(currentBuilding.id)
      addToast('Healthcheck gestartet', 'info')
      setTimeout(fetchResults, 2000)
    } catch (err: any) {
      addToast(`Fehler: ${err.message}`, 'error')
    }
  }

  const overallStatus = getOverallStatus(results)
  const statusColor = STATUS_COLOR[overallStatus]

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

          {/* Endpoint status dots */}
          {isConfigured && results.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: 2,
              left: 2,
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              maxWidth: 50,
            }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  title={`${r.url}: ${r.ok ? `OK ${r.responseTimeMs}ms` : r.error ?? `HTTP ${r.statusCode}`}`}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: r.ok ? '#00FF00' : '#ff4444',
                    border: '1px solid var(--bg-darker)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Overall status indicator */}
          <div style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isConfigured ? statusColor : '#888',
            border: '1px solid var(--bg-darker)',
            boxShadow: isConfigured && overallStatus === 'ok' ? `0 0 6px ${statusColor}` : undefined,
          }} title={isConfigured ? `Status: ${overallStatus.toUpperCase()}` : 'Nicht konfiguriert'} />
        </div>

        {/* Name label */}
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: currentBuilding.color ?? '#00FF00',
          textAlign: 'center',
          textShadow: `0 0 8px ${currentBuilding.color ?? '#00FF00'}44`,
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
            ? results.length > 0
              ? `${results.filter((r) => r.ok).length}/${results.length} ● ${overallStatus.toUpperCase()}`
              : '◌ CHECKING...'
            : '⚙ SETUP ERFORDERLICH'}
        </div>

        {/* Action bar (visible on hover via CSS) */}
        {!isRelocateMode && (
          <div
            className="clawcom-actions"
            style={{ display: 'flex', gap: 4, marginTop: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {isConfigured && (
              <button
                className="hud-btn"
                style={{ fontSize: 9, padding: '1px 5px' }}
                onClick={handleTriggerCheck}
                title="Jetzt prüfen"
              >↻</button>
            )}
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px' }}
              onClick={() => colorInputRef.current?.click()}
              title="Farbe ändern"
            >◈</button>
            <input
              ref={colorInputRef}
              type="color"
              value={currentBuilding.color ?? '#00FF00'}
              onChange={handleColorChange}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
            />
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px', color: '#ff6b6b' }}
              onClick={handleDelete}
              title="Gebäude abreißen"
            >✕</button>
          </div>
        )}
      </div>

      {/* Setup dialog — portaled to body */}
      {showSetup && createPortal(
        <HealthcheckSetupDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          onConfigured={(updated) => {
            setCurrentBuilding(updated)
            addToast(`${updated.name} erfolgreich konfiguriert!`, 'success')
            setTimeout(fetchResults, 2000)
          }}
          onError={(msg) => addToast(msg, 'error')}
        />,
        document.body
      )}
    </>
  )
}
