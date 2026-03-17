import { useState, useEffect, useRef } from 'react'
import type { GHLabel, IssueDetail, PRDetail } from '../types'
import { api } from '../api'
import { VoiceButton } from './VoiceButton'
import { CloseIcon } from './Icons'

export type ModalState =
  | { mode: 'comment'; fullName: string; number: number; type: 'pr' | 'issue' }
  | { mode: 'label'; fullName: string; number: number; type: 'pr' | 'issue'; currentLabels: string[] }
  | { mode: 'create-pr'; fullName: string; owner: string; repoName: string; head: string }
  | { mode: 'create-issue'; fullName: string; owner: string; repoName: string }
  | { mode: 'issue-detail'; fullName: string; owner: string; repoName: string; number: number }
  | { mode: 'pr-detail'; fullName: string; owner: string; repoName: string; number: number }
  | { mode: 'trigger-claude'; fullName: string; number: number; type: 'pr' | 'issue' }
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
        <button className="modal-close" onClick={onClose}><CloseIcon size={12} /></button>
        {state.mode === 'comment' && (
          <CommentForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'label' && (
          <LabelForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'create-pr' && (
          <CreatePRForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'create-issue' && (
          <CreateIssueForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
        )}
        {state.mode === 'issue-detail' && (
          <IssueDetailView state={state} onClose={onClose} onError={onError} />
        )}
        {state.mode === 'pr-detail' && (
          <PRDetailView state={state} onClose={onClose} onError={onError} />
        )}
        {state.mode === 'trigger-claude' && (
          <TriggerClaudeForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} />
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
      <div className="voice-input-group">
        <textarea
          ref={textareaRef}
          className="input modal-textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write a comment..."
          rows={5}
        />
        <VoiceButton onTranscript={(text) => setComment((prev) => prev ? `${prev} ${text}` : text)} />
      </div>
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

function CreateIssueForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'create-issue' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [issueBody, setIssueBody] = useState('')
  const [availableLabels, setAvailableLabels] = useState<GHLabel[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [labelsLoading, setLabelsLoading] = useState(true)
  const titleRef = useRef<HTMLInputElement>(null)

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
      })
      onSuccess(`Issue created: ${result.url || title}`)
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
        <textarea
          className="input modal-textarea"
          value={issueBody}
          onChange={(e) => setIssueBody(e.target.value)}
          placeholder="Describe the issue..."
          rows={4}
        />
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
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    try {
      await api.triggerClaude({ fullName: state.fullName, number: state.number, type: state.type, message: message.trim() })
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
      <div className="voice-input-group">
        <textarea
          ref={textareaRef}
          className="input modal-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="@claude ..."
          rows={5}
        />
        <VoiceButton onTranscript={(text) => setMessage((prev) => prev ? `${prev} ${text}` : text)} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-claude" disabled={submitting || !message.trim()}>
          {submitting ? 'Triggering...' : 'Trigger @claude'}
        </button>
      </div>
    </form>
  )
}

function PRDetailView({ state, onClose, onError }: {
  state: Extract<ModalState, { mode: 'pr-detail' }>
  onClose: () => void
  onError: (msg: string) => void
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
              <pre className="issue-body-text">{pr.body}</pre>
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
                  <pre className="issue-body-text">{comment.body}</pre>
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <a href={pr.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              View on GitHub ↗
            </a>
            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function IssueDetailView({ state, onClose, onError }: {
  state: Extract<ModalState, { mode: 'issue-detail' }>
  onClose: () => void
  onError: (msg: string) => void
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
              <pre className="issue-body-text">{issue.body}</pre>
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
                  <pre className="issue-body-text">{comment.body}</pre>
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <a href={issue.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              View on GitHub ↗
            </a>
            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
