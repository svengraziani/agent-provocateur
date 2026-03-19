import { useState, useEffect } from 'react'
import type { DashboardEntry, GHLabel, AgentSlot } from '../types'
import { api } from '../api'
import { CloseIcon } from './Icons'

const BOOT_SEQUENCE = `> KASERNE ONLINE...
> AGENT DEPLOYMENT CENTER ACTIVE
> AWAITING UNIT CONFIGURATION...`

interface Props {
  entries: DashboardEntry[]
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

function generateId() {
  return Math.random().toString(36).slice(2)
}

function createSlot(defaultRepo = ''): AgentSlot {
  return {
    id: generateId(),
    repoFullName: defaultRepo,
    title: '',
    body: '',
    labels: [],
    status: 'ready',
  }
}

interface SlotRowProps {
  slot: AgentSlot
  repos: string[]
  index: number
  onUpdate: (updates: Partial<AgentSlot>) => void
  onRemove: () => void
}

function SlotRow({ slot, repos, index, onUpdate, onRemove }: SlotRowProps) {
  const [availableLabels, setAvailableLabels] = useState<GHLabel[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!slot.repoFullName) { setAvailableLabels([]); return }
    const [owner, name] = slot.repoFullName.split('/')
    if (!owner || !name) return
    api.getLabels(owner, name).then(setAvailableLabels).catch(() => setAvailableLabels([]))
  }, [slot.repoFullName])

  const toggleLabel = (labelName: string) => {
    const next = slot.labels.includes(labelName)
      ? slot.labels.filter(l => l !== labelName)
      : [...slot.labels, labelName]
    onUpdate({ labels: next })
  }

  const isDeployed = slot.status === 'launched' || slot.status === 'failed' || slot.status === 'deploying'

  const statusIcon = { ready: '●', deploying: '⟳', launched: '✓', failed: '✗' }[slot.status]
  const statusLabel = { ready: 'READY', deploying: 'DEPLOYING...', launched: 'LAUNCHED', failed: 'FAILED' }[slot.status]

  return (
    <div className={`kaserne-slot kaserne-slot-${slot.status}`}>
      <div className="kaserne-slot-header">
        <span className="kaserne-slot-num">UNIT #{index + 1}</span>
        <span className={`kaserne-slot-status kaserne-slot-status-${slot.status}`}>
          {slot.status === 'deploying' ? <span className="kaserne-spin">{statusIcon}</span> : statusIcon} {statusLabel}
        </span>
        <div className="kaserne-slot-actions">
          {slot.issueUrl && (
            <a className="kaserne-slot-link" href={slot.issueUrl} target="_blank" rel="noreferrer">↗ ISSUE</a>
          )}
          {slot.status === 'ready' && (
            <button className="kaserne-slot-remove" onClick={onRemove}>×</button>
          )}
        </div>
      </div>

      <div className="kaserne-slot-body">
        <div className="kaserne-slot-row">
          <label className="kaserne-slot-label">REPO:</label>
          <select
            className="kaserne-select"
            value={slot.repoFullName}
            onChange={e => onUpdate({ repoFullName: e.target.value, labels: [] })}
            disabled={isDeployed}
          >
            <option value="">— select base —</option>
            {repos.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="kaserne-slot-row">
          <label className="kaserne-slot-label">MISSION:</label>
          <input
            className="kaserne-input"
            value={slot.title}
            onChange={e => onUpdate({ title: e.target.value })}
            placeholder="Mission objective..."
            disabled={isDeployed}
          />
        </div>

        <div className="kaserne-slot-row">
          <button type="button" className="kaserne-expand-btn" onClick={() => setExpanded(v => !v)}>
            {expanded ? '▾' : '▸'} INTEL REPORT{slot.body ? ' ✓' : ' (optional)'}
          </button>
        </div>

        {expanded && (
          <div className="kaserne-slot-row">
            <textarea
              className="kaserne-input kaserne-textarea"
              value={slot.body}
              onChange={e => onUpdate({ body: e.target.value })}
              placeholder="Additional context..."
              rows={3}
              disabled={isDeployed}
            />
          </div>
        )}

        {availableLabels.length > 0 && (
          <div className="kaserne-slot-labels">
            {availableLabels.map(label => (
              <button
                key={label.name}
                type="button"
                className={`kaserne-label-chip${slot.labels.includes(label.name) ? ' selected' : ''}`}
                style={{ '--label-color': `#${label.color}` } as React.CSSProperties}
                onClick={() => toggleLabel(label.name)}
                disabled={isDeployed}
              >
                <span className="kaserne-label-dot" style={{ background: `#${label.color}` }} />
                {label.name}
              </button>
            ))}
          </div>
        )}

        {slot.error && <div className="kaserne-slot-error">✗ {slot.error}</div>}
      </div>
    </div>
  )
}

export function KaserneDialog({ entries, onClose, onSuccess }: Props) {
  const [bootText, setBootText] = useState('')
  const [bootDone, setBootDone] = useState(false)
  const [slots, setSlots] = useState<AgentSlot[]>([createSlot(entries[0]?.repo.fullName ?? '')])
  const [deploying, setDeploying] = useState(false)
  const [deployDone, setDeployDone] = useState(false)

  const repos = entries.map(e => e.repo.fullName)

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i <= BOOT_SEQUENCE.length) {
        setBootText(BOOT_SEQUENCE.slice(0, i))
        i++
      } else {
        clearInterval(interval)
        setBootDone(true)
      }
    }, 16)
    return () => clearInterval(interval)
  }, [])

  const updateSlot = (id: string, updates: Partial<AgentSlot>) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const removeSlot = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  const addSlot = () => {
    setSlots(prev => [...prev, createSlot(entries[0]?.repo.fullName ?? '')])
  }

  const handleDeploy = async () => {
    const validSlots = slots.filter(s => s.repoFullName && s.title.trim())
    if (validSlots.length === 0) return

    setDeploying(true)
    validSlots.forEach(s => updateSlot(s.id, { status: 'deploying' }))

    await Promise.all(validSlots.map(async (slot) => {
      try {
        const result = await api.createIssue({
          fullName: slot.repoFullName,
          title: slot.title.trim(),
          issueBody: slot.body.trim() || undefined,
          labels: slot.labels.length > 0 ? slot.labels : undefined,
        })

        const issueNumber = parseInt(result.url.split('/').pop() ?? '', 10)
        if (!isNaN(issueNumber)) {
          await api.triggerClaude({
            fullName: slot.repoFullName,
            number: issueNumber,
            type: 'issue',
            message: '@claude',
          })
        }

        updateSlot(slot.id, { status: 'launched', issueUrl: result.url })
      } catch (err: any) {
        updateSlot(slot.id, { status: 'failed', error: err.message })
      }
    }))

    setDeploying(false)
    setDeployDone(true)
    const launched = slots.filter(s => s.status !== 'failed').length
    onSuccess(`${launched} AGENT(S) DEPLOYED FROM KASERNE`)
  }

  const readyCount = slots.filter(s => s.status === 'ready' && s.repoFullName && s.title.trim()).length
  const launchedCount = slots.filter(s => s.status === 'launched').length
  const failedCount = slots.filter(s => s.status === 'failed').length

  return (
    <div className="kaserne-overlay" onClick={onClose} onWheel={e => e.stopPropagation()}>
      <div
        className="kaserne-dialog"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="kaserne-header">
          <div className="kaserne-title-bar">
            <span className="kaserne-icon">▣▣</span>
            <span className="kaserne-title">KASERNE</span>
            <span className="kaserne-subtitle">// AGENT DEPLOYMENT CENTER</span>
            <button className="kaserne-close" onClick={onClose}><CloseIcon size={12} /></button>
          </div>
          <pre className="kaserne-boot">
            {bootText}
            {!bootDone && <span className="kaserne-cursor">_</span>}
          </pre>
          {bootDone && (
            <div className="kaserne-status-line">
              ▶ {slots.length} UNIT(S) CONFIGURED
              {deploying && ' · DEPLOYING...'}
              {deployDone && ` · ${launchedCount} LAUNCHED · ${failedCount} FAILED`}
            </div>
          )}
        </div>

        {/* Slot list */}
        <div className="kaserne-slots">
          {slots.map((slot, i) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              repos={repos}
              index={i}
              onUpdate={updates => updateSlot(slot.id, updates)}
              onRemove={() => removeSlot(slot.id)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="kaserne-actions">
          {!deployDone && (
            <button
              className="kaserne-btn add"
              type="button"
              onClick={addSlot}
              disabled={deploying || slots.length >= 10}
            >
              + ADD UNIT
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="kaserne-btn abort"
            type="button"
            onClick={onClose}
            disabled={deploying}
          >
            {deployDone ? '[ CLOSE ]' : '[ ABORT ]'}
          </button>
          {!deployDone && (
            <button
              className="kaserne-btn deploy"
              type="button"
              onClick={handleDeploy}
              disabled={deploying || readyCount === 0}
            >
              {deploying ? '[ DEPLOYING... ]' : `[ ▶ DEPLOY ${readyCount} AGENT(S) ]`}
            </button>
          )}
        </div>

        <div className="kaserne-footer">
          ▣ KASERNE ACTIVE &nbsp;·&nbsp; {repos.length} BASE(S) IN RANGE
        </div>
      </div>
    </div>
  )
}
