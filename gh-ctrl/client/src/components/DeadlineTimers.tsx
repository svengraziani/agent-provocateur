import { useState, useEffect, useRef } from 'react'
import type { DeadlineTimer } from '../types'
import { useAppStore } from '../store'
import { SidePanel } from './SidePanel'

interface DeadlineTimersProps {
  isOpen: boolean
  onClose: () => void
}

function formatCountdown(deadline: string): { text: string; urgency: 'expired' | 'critical' | 'warning' | 'ok' } {
  const now = Date.now()
  const end = new Date(deadline).getTime()
  const diff = end - now

  if (diff <= 0) {
    return { text: 'EXPIRED', urgency: 'expired' }
  }

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  let text: string
  if (days > 0) {
    text = `${days}d ${hours}h ${minutes}m ${seconds}s`
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m ${seconds}s`
  } else {
    text = `${minutes}m ${seconds}s`
  }

  const urgency = diff < 24 * 60 * 60 * 1000
    ? 'critical'
    : diff < 72 * 60 * 60 * 1000
      ? 'warning'
      : 'ok'

  return { text, urgency }
}

function formatDeadlineDate(deadline: string): string {
  return new Date(deadline).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Timer Card ────────────────────────────────────────────────────────────────

interface TimerCardProps {
  timer: DeadlineTimer
  onEdit: (timer: DeadlineTimer) => void
  onDelete: (id: number) => void
}

function TimerCard({ timer, onEdit, onDelete }: TimerCardProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(timer.deadline))

  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(timer.deadline))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timer.deadline])

  const urgencyColor = {
    expired: '#888',
    critical: '#ff3333',
    warning: '#ffaa00',
    ok: '#39ff14',
  }[countdown.urgency]

  return (
    <div className={`dt-card dt-card--${countdown.urgency}`} style={{ borderLeftColor: timer.color }}>
      <div className="dt-card-header">
        <span className="dt-card-name" style={{ color: timer.color }}>{timer.name}</span>
        <div className="dt-card-actions">
          <button className="dt-icon-btn" onClick={() => onEdit(timer)} title="Edit timer">✎</button>
          <button className="dt-icon-btn dt-icon-btn--danger" onClick={() => onDelete(timer.id)} title="Delete timer">✕</button>
        </div>
      </div>
      {timer.description && (
        <div className="dt-card-desc">{timer.description}</div>
      )}
      <div className="dt-card-countdown" style={{ color: urgencyColor }}>
        {countdown.urgency === 'expired' ? '⚠ MISSION EXPIRED' : `⏱ ${countdown.text}`}
      </div>
      <div className="dt-card-deadline">{formatDeadlineDate(timer.deadline)}</div>
    </div>
  )
}

// ── Create/Edit Form ──────────────────────────────────────────────────────────

interface TimerFormProps {
  initial?: DeadlineTimer
  onSave: (data: { name: string; deadline: string; description: string; color: string }) => Promise<void>
  onCancel: () => void
}

function TimerForm({ initial, onSave, onCancel }: TimerFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? '#ff4444')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Convert ISO string to datetime-local input value
  function toLocalInput(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [deadlineLocal, setDeadlineLocal] = useState(
    initial ? toLocalInput(initial.deadline) : ''
  )

  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Mission name required'); return }
    if (!deadlineLocal) { setError('Deadline required'); return }
    const deadline = new Date(deadlineLocal).toISOString()
    setSaving(true)
    try {
      await onSave({ name: name.trim(), deadline, description: description.trim(), color })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="dt-form" onSubmit={handleSubmit}>
      <div className="dt-form-title">{initial ? 'EDIT MISSION TIMER' : 'NEW MISSION TIMER'}</div>

      <label className="dt-form-label">MISSION NAME</label>
      <input
        ref={nameRef}
        className="dt-form-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Operation name..."
        maxLength={80}
      />

      <label className="dt-form-label">DEADLINE</label>
      <input
        className="dt-form-input"
        type="datetime-local"
        value={deadlineLocal}
        onChange={e => setDeadlineLocal(e.target.value)}
      />

      <label className="dt-form-label">DESCRIPTION (optional)</label>
      <input
        className="dt-form-input"
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Mission briefing..."
        maxLength={160}
      />

      <label className="dt-form-label">COLOR</label>
      <div className="dt-form-color-row">
        <input
          type="color"
          className="dt-form-color-picker"
          value={color}
          onChange={e => setColor(e.target.value)}
        />
        {['#ff4444', '#ff8800', '#ffcc00', '#39ff14', '#00aaff', '#cc44ff'].map(c => (
          <button
            key={c}
            type="button"
            className={`dt-form-color-swatch${color === c ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      {error && <div className="dt-form-error">⚠ {error}</div>}

      <div className="dt-form-actions">
        <button type="button" className="dt-btn dt-btn--secondary" onClick={onCancel} disabled={saving}>CANCEL</button>
        <button type="submit" className="dt-btn dt-btn--primary" disabled={saving}>
          {saving ? 'SAVING...' : (initial ? 'UPDATE' : 'CREATE')}
        </button>
      </div>
    </form>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function DeadlineTimers({ isOpen, onClose }: DeadlineTimersProps) {
  const { deadlineTimers, loadTimers, createTimer, updateTimer, deleteTimer, addToast } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [editingTimer, setEditingTimer] = useState<DeadlineTimer | null>(null)

  useEffect(() => {
    if (isOpen) loadTimers()
  }, [isOpen, loadTimers])

  if (!isOpen) return null

  const handleCreate = async (data: { name: string; deadline: string; description: string; color: string }) => {
    await createTimer(data)
    addToast('Mission timer created!', 'success')
    setShowForm(false)
  }

  const handleUpdate = async (data: { name: string; deadline: string; description: string; color: string }) => {
    if (!editingTimer) return
    await updateTimer(editingTimer.id, data)
    addToast('Mission timer updated!', 'success')
    setEditingTimer(null)
  }

  const handleDelete = async (id: number) => {
    await deleteTimer(id)
    addToast('Timer removed.', 'info')
  }

  return (
    <SidePanel className="dt-panel" onClose={onClose}>
      <div className="dt-panel-header">
        <div className="dt-panel-title">⏱ MISSION TIMERS</div>
        <div className="dt-panel-header-actions">
          <button
            className="dt-btn dt-btn--primary dt-btn--sm"
            onClick={() => { setShowForm(true); setEditingTimer(null) }}
          >
            + NEW
          </button>
          <button className="dt-panel-close" onClick={onClose} title="Close [Esc]">✕</button>
        </div>
      </div>

      <div className="dt-panel-body">
        {(showForm && !editingTimer) && (
          <TimerForm
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        )}

        {editingTimer && (
          <TimerForm
            initial={editingTimer}
            onSave={handleUpdate}
            onCancel={() => setEditingTimer(null)}
          />
        )}

        {!showForm && !editingTimer && deadlineTimers.length === 0 && (
          <div className="dt-empty">
            <div className="dt-empty-icon">⏱</div>
            <div className="dt-empty-text">NO MISSION TIMERS</div>
            <div className="dt-empty-sub">Create a timer to track deadlines across all maps.</div>
          </div>
        )}

        {!showForm && !editingTimer && deadlineTimers.map(timer => (
          <TimerCard
            key={timer.id}
            timer={timer}
            onEdit={(t) => { setEditingTimer(t); setShowForm(false) }}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </SidePanel>
  )
}
