import { useState, useEffect, useRef } from 'react'
import type { GHLabel } from '../types'
import { api } from '../api'

export type ModalState =
  | { mode: 'comment'; fullName: string; number: number; type: 'pr' | 'issue' }
  | { mode: 'label'; fullName: string; number: number; type: 'pr' | 'issue'; currentLabels: string[] }
  | { mode: 'create-pr'; fullName: string; owner: string; repoName: string; head: string }
  | null

interface Props {
  state: ModalState
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export function ActionModal({ state, onClose, onSuccess, onError }: Props) {
  if (!state) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        {state.mode === 'comment' && (
          <CommentForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'label' && (
          <LabelForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'create-pr' && (
          <CreatePRForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
      </div>
    </div>
  )
}

function CommentForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'comment' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      await api.postComment({ fullName: state.fullName, number: state.number, type: state.type, comment: comment.trim() })
      onSuccess(`Comment posted on ${state.type} #${state.number}`)
      onClose()
    } catch (err: any) {
      onError(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-title">
        Comment on {state.type} #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      <textarea
        ref={textareaRef}
        className="input modal-textarea"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write a comment..."
        rows={5}
      />
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !comment.trim()}>
          {submitting ? 'Posting...' : 'Post Comment'}
        </button>
      </div>
    </form>
  )
}

function LabelForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'label' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [availableLabels, setAvailableLabels] = useState<GHLabel[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(state.currentLabels))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [owner, name] = state.fullName.split('/')

  useEffect(() => {
    api.getLabels(owner, name)
      .then(setAvailableLabels)
      .catch((err) => onError(`Failed to load labels: ${err.message}`))
      .finally(() => setLoading(false))
  }, [owner, name])

  const toggle = (labelName: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(labelName)) next.delete(labelName)
      else next.add(labelName)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const original = new Set(state.currentLabels)
      const toAdd = [...selected].filter((l) => !original.has(l))
      const toRemove = [...original].filter((l) => !selected.has(l))

      await Promise.all([
        ...toAdd.map((label) => api.addLabel({ fullName: state.fullName, number: state.number, type: state.type, label })),
        ...toRemove.map((label) => api.removeLabel({ fullName: state.fullName, number: state.number, type: state.type, label })),
      ])

      const changes = toAdd.length + toRemove.length
      onSuccess(`Labels updated on ${state.type} #${state.number} (${changes} change${changes !== 1 ? 's' : ''})`)
      onClose()
    } catch (err: any) {
      onError(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-title">
        Labels on {state.type} #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      {loading ? (
        <div className="modal-loading">Loading labels...</div>
      ) : availableLabels.length === 0 ? (
        <div className="modal-loading">No labels found in this repo.</div>
      ) : (
        <div className="label-grid">
          {availableLabels.map((label) => (
            <button
              key={label.name}
              type="button"
              className={`label-chip${selected.has(label.name) ? ' selected' : ''}`}
              style={{ '--label-color': `#${label.color}` } as React.CSSProperties}
              onClick={() => toggle(label.name)}
            >
              <span className="label-dot" style={{ background: `#${label.color}` }} />
              {label.name}
            </button>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
          {submitting ? 'Saving...' : 'Save Labels'}
        </button>
      </div>
    </form>
  )
}

function CreatePRForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'create-pr' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [base, setBase] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getBranches(state.owner, state.repoName)
      .then(({ branches: br, defaultBranch }) => {
        setBranches(br)
        setBase(defaultBranch)
      })
      .catch((err) => onError(`Failed to load branches: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.owner, state.repoName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !base) return
    setSubmitting(true)
    try {
      const result = await api.createPR({
        fullName: state.fullName,
        head: state.head,
        base,
        title: title.trim(),
        prBody: prBody.trim() || undefined,
      })
      onSuccess(`PR created: ${result.url || `${state.head} → ${base}`}`)
      onClose()
    } catch (err: any) {
      onError(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const otherBranches = branches.filter((b) => b !== state.head)

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-title">
        Open Pull Request
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      <div className="modal-field">
        <label className="modal-label">Head branch</label>
        <div className="input modal-readonly">{state.head}</div>
      </div>
      <div className="modal-field">
        <label className="modal-label">Base branch</label>
        {loading ? (
          <div className="input modal-readonly">Loading...</div>
        ) : (
          <select
            className="input"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {otherBranches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}
      </div>
      <div className="modal-field">
        <label className="modal-label">Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pull request title"
          autoFocus
        />
      </div>
      <div className="modal-field">
        <label className="modal-label">Description (optional)</label>
        <textarea
          className="input modal-textarea"
          value={prBody}
          onChange={(e) => setPrBody(e.target.value)}
          placeholder="Describe your changes..."
          rows={4}
        />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting || loading || !title.trim()}>
          {submitting ? 'Creating...' : 'Create PR'}
        </button>
      </div>
    </form>
  )
}
