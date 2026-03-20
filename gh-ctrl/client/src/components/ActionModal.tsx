import { useState, useEffect, useRef } from 'react'
import type { GHLabel, IssueDetail, PRDetail } from '../types'
import { getPROrigin } from '../types'
import { api } from '../api'
import { MarkdownContent } from './MarkdownContent'
import { VoiceButton } from './VoiceButton'
import { CloseIcon, LabelIcon, CommentIcon } from './Icons'

export type ModalState =
  | { mode: 'comment'; fullName: string; number: number; type: 'pr' | 'issue' }
  | { mode: 'label'; fullName: string; number: number; type: 'pr' | 'issue'; currentLabels: string[] }
  | { mode: 'assignee'; fullName: string; owner: string; repoName: string; number: number; type: 'pr' | 'issue'; currentAssignees: string[] }
  | { mode: 'create-pr'; fullName: string; owner: string; repoName: string; head?: string; base?: string; title?: string; prBody?: string; issueNumber?: number }
  | { mode: 'create-issue'; fullName: string; owner: string; repoName: string }
  | { mode: 'issue-detail'; fullName: string; owner: string; repoName: string; number: number; prLink?: { head: string; base: string; title: string; body: string } }
  | { mode: 'pr-detail'; fullName: string; owner: string; repoName: string; number: number }
  | { mode: 'trigger-claude'; fullName: string; number: number; type: 'pr' | 'issue' }
  | { mode: 'assign'; fullName: string; owner: string; repoName: string; number: number; type: 'pr' | 'issue'; currentAssignees: string[] }
  | null

interface Props {
  state: ModalState
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
  onIssueCreated?: (owner: string, repoName: string) => void
  onTransition?: (newState: ModalState) => void
}

export function ActionModal({ state, onClose, onSuccess, onError, onIssueCreated, onTransition }: Props) {
  if (!state) return null

  return (
    <div className="modal-overlay" onClick={onClose} onWheel={(e) => e.stopPropagation()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><CloseIcon size={12} /></button>
        {state.mode === 'comment' && (
          <CommentForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'label' && (
          <LabelForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'assignee' && (
          <AssigneeForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'create-pr' && (
          <CreatePRForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'create-issue' && (
          <CreateIssueForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} onIssueCreated={onIssueCreated} />
        )}
        {state.mode === 'issue-detail' && (
          <IssueDetailView state={state} onClose={onClose} onError={onError} onTransition={onTransition} />
        )}
        {state.mode === 'pr-detail' && (
          <PRDetailView state={state} onClose={onClose} onError={onError} onTransition={onTransition} />
        )}
        {state.mode === 'trigger-claude' && (
          <TriggerClaudeForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'assign' && (
          <AssignForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
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
  const [images, setImages] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const addImages = (files: FileList | File[]) => {
    const imgFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imgFiles.length) setImages((prev) => [...prev, ...imgFiles])
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length) addImages(e.clipboardData.files)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) addImages(e.dataTransfer.files)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      await api.postComment({ fullName: state.fullName, number: state.number, type: state.type, comment: comment.trim() }, images.length ? images : undefined)
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
      <div
        className="voice-input-group"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <textarea
          ref={textareaRef}
          className="input modal-textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onPaste={handlePaste}
          placeholder="Write a comment..."
          rows={5}
        />
        <VoiceButton onTranscript={(text) => setComment((prev) => prev ? `${prev} ${text}` : text)} />
      </div>
      <div className="image-attach-bar">
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addImages(e.target.files)} />
        <button type="button" className="btn btn-ghost btn-sm attach-btn" onClick={() => fileInputRef.current?.click()}>&#128247; Attach image</button>
      </div>
      {images.length > 0 && (
        <div className="image-preview-strip">
          {images.map((img, i) => (
            <div key={i} className="image-preview-item">
              <img src={URL.createObjectURL(img)} alt={img.name} className="image-preview-thumb" />
              <button type="button" className="image-preview-remove" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>&#x2715;</button>
            </div>
          ))}
        </div>
      )}
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

function AssigneeForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'assignee' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [collaborators, setCollaborators] = useState<{ login: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(state.currentAssignees))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.getCollaborators(state.owner, state.repoName)
      .then(setCollaborators)
      .catch((err) => onError(`Failed to load collaborators: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.owner, state.repoName])

  const toggle = (login: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(login)) next.delete(login)
      else next.add(login)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const original = new Set(state.currentAssignees)
      const toAdd = [...selected].filter((l) => !original.has(l))
      const toRemove = [...original].filter((l) => !selected.has(l))

      await Promise.all([
        ...toAdd.map((assignee) => api.addAssignee({ fullName: state.fullName, number: state.number, type: state.type, assignee })),
        ...toRemove.map((assignee) => api.removeAssignee({ fullName: state.fullName, number: state.number, type: state.type, assignee })),
      ])

      const changes = toAdd.length + toRemove.length
      onSuccess(`Assignees updated on ${state.type} #${state.number} (${changes} change${changes !== 1 ? 's' : ''})`)
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
        Assignees on {state.type} #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      {loading ? (
        <div className="modal-loading">Loading collaborators...</div>
      ) : collaborators.length === 0 ? (
        <div className="modal-loading">No collaborators found for this repo.</div>
      ) : (
        <div className="label-grid">
          {collaborators.map((c) => (
            <button
              key={c.login}
              type="button"
              className={`label-chip${selected.has(c.login) ? ' selected' : ''}`}
              onClick={() => toggle(c.login)}
            >
              @{c.login}
            </button>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
          {submitting ? 'Saving...' : 'Save Assignees'}
        </button>
      </div>
    </form>
  )
}

function buildInitialPrBody(statePrBody: string | undefined, issueNumber: number | undefined): string {
  let body = statePrBody || ''
  if (issueNumber) {
    const closesPattern = new RegExp(`closes\\s+#${issueNumber}`, 'i')
    if (!closesPattern.test(body)) {
      body = body ? `${body}\n\nCloses #${issueNumber}` : `Closes #${issueNumber}`
    }
  }
  return body
}

function CreatePRForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'create-pr' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [title, setTitle] = useState(state.title || '')
  const [prBody, setPrBody] = useState(() => buildInitialPrBody(state.prBody, state.issueNumber))
  const [base, setBase] = useState(state.base || '')
  const [head, setHead] = useState(state.head || '')
  const [allBranchNames, setAllBranchNames] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [collaborators, setCollaborators] = useState<{ login: string }[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      api.getBranches(state.owner, state.repoName),
      api.getCollaborators(state.owner, state.repoName).catch(() => [] as { login: string }[]),
    ])
      .then(([{ branches: br, defaultBranch }, collabs]) => {
        const names = br.map((b) => b.name)
        setAllBranchNames(names)
        if (!state.base) setBase(defaultBranch)
        setCollaborators(collabs)
      })
      .catch((err) => onError(`Failed to load branches: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.owner, state.repoName, state.base])

  const toggleAssignee = (login: string) => {
    setSelectedAssignees((prev) => {
      const next = new Set(prev)
      if (next.has(login)) next.delete(login)
      else next.add(login)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveHead = state.head || head
    if (!title.trim() || !base || !effectiveHead) return
    setSubmitting(true)
    try {
      const result = await api.createPR({
        fullName: state.fullName,
        head: effectiveHead,
        base,
        title: title.trim(),
        prBody: prBody.trim() || undefined,
      })
      onSuccess(`PR created: ${result.url || `${effectiveHead} → ${base}`}`)
      onClose()
    } catch (err: any) {
      onError(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const effectiveHead = state.head || head
  const headBranches = allBranchNames
  const baseBranches = allBranchNames.filter((b) => b !== effectiveHead)

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-title">
        Open Pull Request
        <span className="modal-subtitle">{state.fullName}</span>
      </div>

      {state.head ? (
        <div className="modal-field">
          <label className="modal-label">Head branch</label>
          <div className="input modal-readonly">{state.head}</div>
        </div>
      ) : (
        <div className="modal-field">
          <label className="modal-label">Head branch</label>
          {loading ? (
            <div className="input modal-readonly">Loading...</div>
          ) : (
            <select
              className="input"
              value={head}
              onChange={(e) => setHead(e.target.value)}
              required
            >
              <option value="">Select head branch...</option>
              {headBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="modal-field">
        <label className="modal-label">Base branch</label>
        {loading ? (
          <div className="input modal-readonly">Loading...</div>
        ) : state.base ? (
          <div className="input modal-readonly">{state.base}</div>
        ) : (
          <select
            className="input"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {baseBranches.map((b) => (
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

      {!loading && collaborators.length > 0 && (
        <div className="modal-field">
          <label className="modal-label">Assignees (optional)</label>
          <div className="label-grid">
            {collaborators.map((c) => (
              <button
                key={c.login}
                type="button"
                className={`label-chip${selectedAssignees.has(c.login) ? ' selected' : ''}`}
                onClick={() => toggleAssignee(c.login)}
              >
                @{c.login}
              </button>
            ))}
          </div>
        </div>
      )}


      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || loading || !title.trim() || !effectiveHead}
        >
          {submitting ? 'Creating...' : 'Create PR'}
        </button>
      </div>
    </form>
  )
}

function CreateIssueForm({ state, onClose, onSuccess, onError, onIssueCreated }: {
  state: Extract<ModalState, { mode: 'create-issue' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  onIssueCreated?: (owner: string, repoName: string) => void
}) {
  const [title, setTitle] = useState('')
  const [issueBody, setIssueBody] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [availableLabels, setAvailableLabels] = useState<GHLabel[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [labelsLoading, setLabelsLoading] = useState(true)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    api.getLabels(state.owner, state.repoName)
      .then(setAvailableLabels)
      .catch(() => {/* labels are optional */})
      .finally(() => setLabelsLoading(false))
  }, [state.owner, state.repoName])

  const toggleLabel = (name: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const addImages = (files: FileList | File[]) => {
    const imgFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imgFiles.length) setImages((prev) => [...prev, ...imgFiles])
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length) addImages(e.clipboardData.files)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) addImages(e.dataTransfer.files)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const result = await api.createIssue({
        fullName: state.fullName,
        title: title.trim(),
        issueBody: issueBody.trim() || undefined,
        labels: selectedLabels.size > 0 ? [...selectedLabels] : undefined,
      }, images.length ? images : undefined)
      onSuccess(`Issue created: ${result.url || title}`)
      onIssueCreated?.(state.owner, state.repoName)
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
        Create Issue
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      <div className="modal-field">
        <label className="modal-label">Title</label>
        <input
          ref={titleRef}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
        />
      </div>
      <div className="modal-field">
        <label className="modal-label">Description (optional)</label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <textarea
            className="input modal-textarea"
            value={issueBody}
            onChange={(e) => setIssueBody(e.target.value)}
            onPaste={handlePaste}
            placeholder="Describe the issue..."
            rows={4}
          />
        </div>
        <div className="image-attach-bar">
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addImages(e.target.files)} />
          <button type="button" className="btn btn-ghost btn-sm attach-btn" onClick={() => fileInputRef.current?.click()}>&#128247; Attach image</button>
        </div>
        {images.length > 0 && (
          <div className="image-preview-strip">
            {images.map((img, i) => (
              <div key={i} className="image-preview-item">
                <img src={URL.createObjectURL(img)} alt={img.name} className="image-preview-thumb" />
                <button type="button" className="image-preview-remove" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>&#x2715;</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {!labelsLoading && availableLabels.length > 0 && (
        <div className="modal-field">
          <label className="modal-label">Labels (optional)</label>
          <div className="label-grid">
            {availableLabels.map((label) => (
              <button
                key={label.name}
                type="button"
                className={`label-chip${selectedLabels.has(label.name) ? ' selected' : ''}`}
                style={{ '--label-color': `#${label.color}` } as React.CSSProperties}
                onClick={() => toggleLabel(label.name)}
              >
                <span className="label-dot" style={{ background: `#${label.color}` }} />
                {label.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
          {submitting ? 'Creating...' : 'Create Issue'}
        </button>
      </div>
    </form>
  )
}

function TriggerClaudeForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'trigger-claude' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [message, setMessage] = useState('@claude ')
  const [images, setImages] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])

  const addImages = (files: FileList | File[]) => {
    const imgFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imgFiles.length) setImages((prev) => [...prev, ...imgFiles])
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length) addImages(e.clipboardData.files)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) addImages(e.dataTransfer.files)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    try {
      await api.triggerClaude({ fullName: state.fullName, number: state.number, type: state.type, message: message.trim() }, images.length ? images : undefined)
      onSuccess(`@claude triggered on ${state.type} #${state.number}`)
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
        Trigger Claude on {state.type} #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      <div
        className="voice-input-group"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <textarea
          ref={textareaRef}
          className="input modal-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onPaste={handlePaste}
          placeholder="@claude ..."
          rows={5}
        />
        <VoiceButton onTranscript={(text) => setMessage((prev) => prev ? `${prev} ${text}` : text)} />
      </div>
      <div className="image-attach-bar">
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addImages(e.target.files)} />
        <button type="button" className="btn btn-ghost btn-sm attach-btn" onClick={() => fileInputRef.current?.click()}>&#128247; Attach image</button>
      </div>
      {images.length > 0 && (
        <div className="image-preview-strip">
          {images.map((img, i) => (
            <div key={i} className="image-preview-item">
              <img src={URL.createObjectURL(img)} alt={img.name} className="image-preview-thumb" />
              <button type="button" className="image-preview-remove" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>&#x2715;</button>
            </div>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-claude" disabled={submitting || !message.trim()}>
          {submitting ? 'Triggering...' : 'Trigger @claude'}
        </button>
      </div>
    </form>
  )
}

function AssignForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'assign' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [collaborators, setCollaborators] = useState<{ login: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(state.currentAssignees))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.getCollaborators(state.owner, state.repoName)
      .then(setCollaborators)
      .catch((err) => onError(`Failed to load collaborators: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.owner, state.repoName])

  const toggle = (login: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(login)) next.delete(login)
      else next.add(login)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const currentSet = new Set(state.currentAssignees)
    const toAdd = [...selected].filter((l) => !currentSet.has(l))
    if (toAdd.length === 0) { onClose(); return }
    setSubmitting(true)
    try {
      await api.assignUser({
        fullName: state.fullName,
        number: state.number,
        type: state.type,
        assignees: toAdd,
      })
      onSuccess(`Assigned ${toAdd.join(', ')} to ${state.type} #${state.number}`)
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
        Assign {state.type} #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      {loading ? (
        <div className="modal-loading">Loading collaborators...</div>
      ) : collaborators.length === 0 ? (
        <div className="modal-loading">No collaborators found.</div>
      ) : (
        <div className="label-grid">
          {collaborators.map((c) => (
            <button
              key={c.login}
              type="button"
              className={`label-chip${selected.has(c.login) ? ' selected' : ''}`}
              onClick={() => toggle(c.login)}
            >
              @{c.login}
            </button>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
          {submitting ? 'Saving...' : 'Save Assignees'}
        </button>
      </div>
    </form>
  )
}

function PRDetailView({ state, onClose, onError, onTransition }: {
  state: Extract<ModalState, { mode: 'pr-detail' }>
  onClose: () => void
  onError: (msg: string) => void
  onTransition?: (newState: ModalState) => void
}) {
  const [pr, setPR] = useState<PRDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getPR(state.owner, state.repoName, state.number)
      .then(setPR)
      .catch((err) => onError(`Failed to load PR: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.owner, state.repoName, state.number])

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  return (
    <div>
      <div className="modal-title">
        PR #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      {loading ? (
        <div className="modal-loading">Loading PR...</div>
      ) : !pr ? (
        <div className="modal-loading">Failed to load PR.</div>
      ) : (
        <div className="issue-detail">
          <div className="issue-detail-header">
            <h3 className="issue-detail-title">{pr.title}</h3>
            <div className="issue-detail-meta">
              <span className="issue-meta-author">opened by <strong>{pr.author.login}</strong></span>
              {getPROrigin(pr) === 'external' && (
                <span className="badge badge-external" title={`Author association: ${pr.authorAssociation ?? 'unknown'}`}>External Contributor</span>
              )}
              <span className="issue-meta-date">on {formatDate(pr.createdAt)}</span>
              <span>{pr.headRefName} → {pr.baseRefName}</span>
              {pr.isDraft && <span>· Draft</span>}
              {pr.reviewDecision === 'APPROVED' && <span>· Approved</span>}
              {pr.mergeable === 'CONFLICTING' && <span>· Conflict</span>}
            </div>
            {pr.labels.length > 0 && (
              <div className="issue-detail-labels">
                {pr.labels.map((l) => (
                  <span
                    key={l.name}
                    className="inline-label"
                    style={{ background: `#${l.color}22`, borderColor: `#${l.color}88`, color: `#${l.color}` }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {pr.body && (
            <div className="issue-detail-body">
              <MarkdownContent text={pr.body} className="issue-body-text" />
            </div>
          )}
          {pr.comments.length > 0 && (
            <div className="issue-detail-comments">
              <div className="issue-comments-title">{pr.comments.length} comment{pr.comments.length !== 1 ? 's' : ''}</div>
              {pr.comments.map((comment, i) => (
                <div key={i} className="issue-comment">
                  <div className="issue-comment-meta">
                    <strong>{comment.author.login}</strong> · {formatDate(comment.createdAt)}
                  </div>
                  <MarkdownContent text={comment.body} className="issue-body-text" />
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions detail-actions">
            <a href={pr.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              View on GitHub ↗
            </a>
            {onTransition && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'comment', fullName: state.fullName, number: state.number, type: 'pr' })}
                  title="Post comment"
                >
                  <CommentIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'label', fullName: state.fullName, number: state.number, type: 'pr', currentLabels: pr.labels.map((l) => l.name) })}
                  title="Manage labels"
                >
                  <LabelIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'assign', fullName: state.fullName, owner: state.owner, repoName: state.repoName, number: state.number, type: 'pr', currentAssignees: pr.assignees.map((a) => a.login) })}
                  title="Assign"
                >
                  Assign
                </button>
                <button
                  type="button"
                  className="btn btn-claude btn-sm"
                  onClick={() => onTransition({ mode: 'trigger-claude', fullName: state.fullName, number: state.number, type: 'pr' })}
                >
                  @claude
                </button>
              </>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function IssueDetailView({ state, onClose, onError, onTransition }: {
  state: Extract<ModalState, { mode: 'issue-detail' }>
  onClose: () => void
  onError: (msg: string) => void
  onTransition?: (newState: ModalState) => void
}) {
  const [issue, setIssue] = useState<IssueDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getIssue(state.owner, state.repoName, state.number)
      .then(setIssue)
      .catch((err) => onError(`Failed to load issue: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.owner, state.repoName, state.number])

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  return (
    <div>
      <div className="modal-title">
        Issue #{state.number}
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      {loading ? (
        <div className="modal-loading">Loading issue...</div>
      ) : !issue ? (
        <div className="modal-loading">Failed to load issue.</div>
      ) : (
        <div className="issue-detail">
          <div className="issue-detail-header">
            <h3 className="issue-detail-title">{issue.title}</h3>
            <div className="issue-detail-meta">
              <span className="issue-meta-author">opened by <strong>{issue.author.login}</strong></span>
              <span className="issue-meta-date">on {formatDate(issue.createdAt)}</span>
              {issue.assignees.length > 0 && (
                <span className="issue-meta-assignees">· assigned to {issue.assignees.map(a => a.login).join(', ')}</span>
              )}
            </div>
            {issue.labels.length > 0 && (
              <div className="issue-detail-labels">
                {issue.labels.map((l) => (
                  <span
                    key={l.name}
                    className="inline-label"
                    style={{ background: `#${l.color}22`, borderColor: `#${l.color}88`, color: `#${l.color}` }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {issue.body && (
            <div className="issue-detail-body">
              <MarkdownContent text={issue.body} className="issue-body-text" />
            </div>
          )}
          {issue.comments.length > 0 && (
            <div className="issue-detail-comments">
              <div className="issue-comments-title">{issue.comments.length} comment{issue.comments.length !== 1 ? 's' : ''}</div>
              {issue.comments.map((comment, i) => (
                <div key={i} className="issue-comment">
                  <div className="issue-comment-meta">
                    <strong>{comment.author.login}</strong> · {formatDate(comment.createdAt)}
                  </div>
                  <MarkdownContent text={comment.body} className="issue-body-text" />
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions detail-actions">
            <a href={issue.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              View on GitHub ↗
            </a>
            {onTransition && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'comment', fullName: state.fullName, number: state.number, type: 'issue' })}
                  title="Post comment"
                >
                  <CommentIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'label', fullName: state.fullName, number: state.number, type: 'issue', currentLabels: issue.labels.map((l) => l.name) })}
                  title="Manage labels"
                >
                  <LabelIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'assign', fullName: state.fullName, owner: state.owner, repoName: state.repoName, number: state.number, type: 'issue', currentAssignees: issue.assignees.map((a) => a.login) })}
                  title="Assign"
                >
                  Assign
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => onTransition({ mode: 'create-pr', fullName: state.fullName, owner: state.owner, repoName: state.repoName, issueNumber: state.number, ...(state.prLink ? { head: state.prLink.head, base: state.prLink.base, title: state.prLink.title, prBody: state.prLink.body } : {}) })}
                >
                  @pr
                </button>
                <button
                  type="button"
                  className="btn btn-claude btn-sm"
                  onClick={() => onTransition({ mode: 'trigger-claude', fullName: state.fullName, number: state.number, type: 'issue' })}
                >
                  @claude
                </button>
              </>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
