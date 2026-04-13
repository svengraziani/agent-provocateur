import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ResearchCenterConfig, ResearchJob } from '../types'


interface Position {
  x: number
  y: number
}

interface ResearchCenterBuildingProps {
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

export function ResearchCenterBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: ResearchCenterBuildingProps) {
  const deleteBuilding = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)

  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [jobs, setJobs] = useState<ResearchJob[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setCurrentBuilding(building) }, [building])

  let config: Partial<ResearchCenterConfig> = {}
  try { config = JSON.parse(currentBuilding.config) } catch { /* empty */ }

  const isConfigured = !!config.repo

  const fetchJobs = useCallback(async () => {
    if (!isConfigured) return
    try {
      const data = await api.getResearchJobs(currentBuilding.id)
      setJobs(data)
    } catch { /* ignore */ }
  }, [currentBuilding.id, isConfigured])

  useEffect(() => {
    if (!isConfigured) return
    fetchJobs()
  }, [isConfigured, fetchJobs])

  useEffect(() => {
    if (isSelected) setShowDialog(true)
    else setShowDialog(false)
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

  const activeCount = jobs.filter((j) =>
    j.labels.some((l) => l.name === 'Research') &&
    !j.labels.some((l) => l.name === 'Research complete')
  ).length

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
        {/* Building icon */}
        <div style={{ position: 'relative', width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="/buildings/research.png"
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

          {/* Active jobs badge */}
          {activeCount > 0 && (
            <div style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: '#ff8800',
              color: '#000',
              borderRadius: '50%',
              width: 18,
              height: 18,
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #000',
            }}>{activeCount}</div>
          )}
        </div>

        {/* Name label */}
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: currentBuilding.color ?? '#aa44ff',
          textAlign: 'center',
          textShadow: `0 0 8px ${currentBuilding.color ?? '#aa44ff'}44`,
          maxWidth: 130,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentBuilding.name}
        </div>

        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>
          {isConfigured
            ? activeCount > 0
              ? `${activeCount} MISSION${activeCount !== 1 ? 'S' : ''} ACTIVE`
              : '◌ STANDBY'
            : '⚙ SETUP REQUIRED'}
        </div>

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
              value={currentBuilding.color ?? '#aa44ff'}
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

      {showDialog && createPortal(
        <ResearchCenterDialog
          building={currentBuilding}
          jobs={jobs}
          onClose={() => onDeselect?.()}
          onConfigured={(updated) => {
            setCurrentBuilding(updated)
            addToast(`${updated.name} configured!`, 'success')
            fetchJobs()
          }}
          onJobsChanged={fetchJobs}
          addToast={addToast}
        />,
        document.body
      )}
    </>
  )
}

// ── Inline dialog ─────────────────────────────────────────────────────────────

interface ResearchCenterDialogProps {
  building: Building
  jobs: ResearchJob[]
  onClose: () => void
  onConfigured: (updated: Building) => void
  onJobsChanged: () => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function ResearchCenterDialog({
  building,
  jobs,
  onClose,
  onConfigured,
  onJobsChanged,
  addToast,
}: ResearchCenterDialogProps) {
  let config: Partial<ResearchCenterConfig> = {}
  try { config = JSON.parse(building.config) } catch { /* empty */ }

  const [repo, setRepo] = useState(config.repo ?? '')
  const [saving, setSaving] = useState(false)

  // Deploy form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deployRepo, setDeployRepo] = useState(config.repo ?? '')
  const [deploying, setDeploying] = useState(false)
  const [completing, setCompleting] = useState<number | null>(null)

  const isConfigured = !!config.repo

  async function handleSaveConfig() {
    if (!repo.trim()) return
    setSaving(true)
    try {
      const updated = await api.updateBuilding(building.id, {
        config: { repo: repo.trim(), configured: true },
      })
      onConfigured(updated)
      setDeployRepo(repo.trim())
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeploy() {
    if (!title.trim() || !deployRepo.trim()) return
    setDeploying(true)
    try {
      const result = await api.createResearchJob(building.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        repo: deployRepo.trim(),
      })
      addToast('Research mission deployed!', 'success')
      setTitle('')
      setDescription('')
      onJobsChanged()
      if (result.url) window.open(result.url, '_blank')
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    } finally {
      setDeploying(false)
    }
  }

  async function handleComplete(issueNumber: number) {
    setCompleting(issueNumber)
    try {
      await api.completeResearchJob(building.id, issueNumber)
      addToast('Mission marked complete!', 'success')
      onJobsChanged()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    } finally {
      setCompleting(null)
    }
  }

  const activeJobs = jobs.filter((j) =>
    j.labels.some((l) => l.name === 'Research') &&
    !j.labels.some((l) => l.name === 'Research complete')
  )
  const doneJobs = jobs.filter((j) =>
    j.labels.some((l) => l.name === 'Research complete')
  )

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        padding: 20,
        width: 520,
        maxHeight: '85vh',
        overflowY: 'auto',
        fontFamily: 'monospace',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: '#aa44ff', fontWeight: 700, fontSize: 13 }}>📡 {building.name.toUpperCase()}</span>
          <button className="hud-btn" style={{ fontSize: 10 }} onClick={onClose}>✕ CLOSE</button>
        </div>

        {/* Config */}
        <div style={{ marginBottom: 16, padding: 10, border: '1px solid var(--border-color)', borderRadius: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>TARGET REPOSITORY</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="hud-input"
              style={{ flex: 1, fontSize: 11 }}
              placeholder="owner/repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <button
              className="hud-btn"
              style={{ fontSize: 10 }}
              onClick={handleSaveConfig}
              disabled={saving || !repo.trim()}
            >{saving ? '...' : 'SET'}</button>
          </div>
        </div>

        {/* Deploy new research */}
        {isConfigured && (
          <div style={{ marginBottom: 16, padding: 10, border: '1px solid var(--border-color)', borderRadius: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>DEPLOY RESEARCH MISSION</div>
            <input
              className="hud-input"
              style={{ width: '100%', marginBottom: 6, fontSize: 11, boxSizing: 'border-box' }}
              placeholder="Research topic title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="hud-input"
              style={{ width: '100%', marginBottom: 6, fontSize: 11, minHeight: 60, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Additional context (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="hud-input"
                style={{ flex: 1, fontSize: 11 }}
                placeholder="owner/repo (defaults to configured)"
                value={deployRepo}
                onChange={(e) => setDeployRepo(e.target.value)}
              />
              <button
                className="hud-btn hud-btn-new-base"
                style={{ fontSize: 10 }}
                onClick={handleDeploy}
                disabled={deploying || !title.trim() || !deployRepo.trim()}
              >{deploying ? '⟳ DEPLOYING...' : '▶ DEPLOY'}</button>
            </div>
          </div>
        )}

        {/* Active missions */}
        {activeJobs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#ff8800', marginBottom: 6 }}>
              ◉ ACTIVE MISSIONS ({activeJobs.length})
            </div>
            {activeJobs.map((job) => (
              <div key={job.number} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                marginBottom: 4, background: 'var(--bg-darker)',
                border: '1px solid var(--border-color)', borderRadius: 3,
              }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 10, minWidth: 28 }}>#{job.number}</span>
                <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.title}
                </span>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hud-btn"
                  style={{ fontSize: 9, padding: '1px 5px', textDecoration: 'none' }}
                >↗</a>
                <button
                  className="hud-btn"
                  style={{ fontSize: 9, padding: '1px 5px', color: '#00ff88' }}
                  onClick={() => handleComplete(job.number)}
                  disabled={completing === job.number}
                  title="Mark as complete"
                >{completing === job.number ? '...' : '✓ DONE'}</button>
              </div>
            ))}
          </div>
        )}

        {/* Completed missions */}
        {doneJobs.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#00ff88', marginBottom: 6 }}>
              ✓ COMPLETED ({doneJobs.length})
            </div>
            {doneJobs.map((job) => (
              <div key={job.number} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                marginBottom: 4, background: 'var(--bg-darker)',
                border: '1px solid #333', borderRadius: 3, opacity: 0.7,
              }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 10, minWidth: 28 }}>#{job.number}</span>
                <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
                  {job.title}
                </span>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hud-btn"
                  style={{ fontSize: 9, padding: '1px 5px', textDecoration: 'none' }}
                >↗</a>
              </div>
            ))}
          </div>
        )}

        {isConfigured && jobs.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: 12 }}>
            No research missions yet. Deploy one above.
          </div>
        )}
      </div>
    </div>
  )
}