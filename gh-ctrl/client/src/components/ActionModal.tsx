import { useState, useEffect, useRef } from 'react'
import type { GHLabel, IssueDetail, PRDetail } from '../types'
import { getPROrigin } from '../types'
import { api } from '../api'
import { MarkdownContent } from './MarkdownContent'
import { VoiceButton } from './VoiceButton'
import { CloseIcon, LabelIcon, CommentIcon, CopyIcon } from './Icons'
import { useAppStore } from '../store'

export type ModalState =
  | { mode: 'comment'; fullName: string; number: number; type: 'pr' | 'issue'; provider?: 'github' | 'gitlab' }
  | { mode: 'label'; fullName: string; number: number; type: 'pr' | 'issue'; currentLabels: string[]; provider?: 'github' | 'gitlab' }
  | { mode: 'assignee'; fullName: string; owner: string; repoName: string; number: number; type: 'pr' | 'issue'; currentAssignees: string[]; provider?: 'github' | 'gitlab' }
  | { mode: 'create-pr'; fullName: string; owner: string; repoName: string; head?: string; base?: string; title?: string; prBody?: string; issueNumber?: number; provider?: 'github' | 'gitlab' }
  | { mode: 'create-issue'; fullName: string; owner: string; repoName: string; provider?: 'github' | 'gitlab' }
  | { mode: 'create-issues-batch'; fullName: string; owner: string; repoName: string; provider?: 'github' | 'gitlab' }
  | { mode: 'issue-detail'; fullName: string; owner: string; repoName: string; number: number; prLink?: { head: string; base: string; title: string; body: string }; provider?: 'github' | 'gitlab' }
  | { mode: 'pr-detail'; fullName: string; owner: string; repoName: string; number: number; provider?: 'github' | 'gitlab' }
  | { mode: 'assign'; fullName: string; owner: string; repoName: string; number: number; type: 'pr' | 'issue'; currentAssignees: string[]; provider?: 'github' | 'gitlab' }
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
    <div className="modal-overlay" onClick={onClose}>
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
        {state.mode === 'create-issues-batch' && (
          <BatchCreateIssuesForm state={state} onClose={onClose} onSuccess={onSuccess} onError={onError} onIssueCreated={onIssueCreated} />
        )}
        {state.mode === 'issue-detail' && (
          <IssueDetailView state={state} onClose={onClose} onError={onError} onTransition={onTransition} />
        )}
        {state.mode === 'pr-detail' && (
          <PRDetailView state={state} onClose={onClose} onError={onError} onTransition={onTransition} />
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
      if (state.provider === 'gitlab') {
        await api.postGitLabComment({ fullName: state.fullName, number: state.number, type: state.type === 'pr' ? 'mr' : 'issue', comment: comment.trim() })
      } else {
        await api.postComment({ fullName: state.fullName, number: state.number, type: state.type, comment: comment.trim() })
      }
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
    const req = state.provider === 'gitlab'
      ? api.getGitLabLabels(state.fullName)
      : api.getLabels(owner, name)
    req
      .then(setAvailableLabels)
      .catch((err) => onError(`Failed to load labels: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.fullName])

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

      const glType = state.type === 'pr' ? 'mr' : 'issue'
      await Promise.all([
        ...toAdd.map((label) => state.provider === 'gitlab'
          ? api.addGitLabLabel({ fullName: state.fullName, number: state.number, type: glType, label })
          : api.addLabel({ fullName: state.fullName, number: state.number, type: state.type, label })),
        ...toRemove.map((label) => state.provider === 'gitlab'
          ? api.removeGitLabLabel({ fullName: state.fullName, number: state.number, type: glType, label })
          : api.removeLabel({ fullName: state.fullName, number: state.number, type: state.type, label })),
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
    const loadCollaborators = state.provider === 'gitlab'
      ? api.getGitLabCollaborators(state.fullName)
      : api.getCollaborators(state.owner, state.repoName)
    loadCollaborators
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

      if (state.provider === 'gitlab') {
        await Promise.all([
          ...toAdd.map((assignee) => api.addGitLabAssignee({ fullName: state.fullName, number: state.number, type: state.type === 'pr' ? 'mr' : state.type, assignee })),
          ...toRemove.map((assignee) => api.removeGitLabAssignee({ fullName: state.fullName, number: state.number, type: state.type === 'pr' ? 'mr' : state.type, assignee })),
        ])
      } else {
        await Promise.all([
          ...toAdd.map((assignee) => api.addAssignee({ fullName: state.fullName, number: state.number, type: state.type, assignee })),
          ...toRemove.map((assignee) => api.removeAssignee({ fullName: state.fullName, number: state.number, type: state.type, assignee })),
        ])
      }

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

  useEffect(() => {
    const req = state.provider === 'gitlab'
      ? api.getGitLabBranches(state.fullName)
      : api.getBranches(state.owner, state.repoName)
    req
      .then(({ branches: br, defaultBranch }) => {
        const names = br.map((b) => b.name)
        setAllBranchNames(names)
        if (!state.base) setBase(defaultBranch)
      })
      .catch((err) => onError(`Failed to load branches: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.fullName, state.owner, state.repoName, state.base])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveHead = state.head || head
    if (!title.trim() || !base || !effectiveHead) return
    setSubmitting(true)
    try {
      let url: string
      if (state.provider === 'gitlab') {
        const result = await api.createGitLabMR({
          fullName: state.fullName,
          sourceBranch: effectiveHead,
          targetBranch: base,
          title: title.trim(),
          description: prBody.trim() || undefined,
        })
        url = result.url
      } else {
        const result = await api.createPR({
          fullName: state.fullName,
          head: effectiveHead,
          base,
          title: title.trim(),
          prBody: prBody.trim() || undefined,
        })
        url = result.url
      }
      onSuccess(`${state.provider === 'gitlab' ? 'MR' : 'PR'} created: ${url || `${effectiveHead} → ${base}`}`)
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
        {state.provider === 'gitlab' ? 'Open Merge Request' : 'Open Pull Request'}
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

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || loading || !title.trim() || !effectiveHead}
        >
          {submitting ? 'Creating...' : state.provider === 'gitlab' ? 'Create MR' : 'Create PR'}
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
  const [availableLabels, setAvailableLabels] = useState<GHLabel[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [labelsLoading, setLabelsLoading] = useState(true)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    const req = state.provider === 'gitlab'
      ? api.getGitLabLabels(state.fullName)
      : api.getLabels(state.owner, state.repoName)
    req
      .then(setAvailableLabels)
      .catch(() => {/* labels are optional */})
      .finally(() => setLabelsLoading(false))
  }, [state.fullName, state.owner, state.repoName])

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
      const result = state.provider === 'gitlab'
        ? await api.createGitLabIssue({
            fullName: state.fullName,
            title: title.trim(),
            issueBody: issueBody.trim() || undefined,
            labels: selectedLabels.size > 0 ? [...selectedLabels] : undefined,
          })
        : await api.createIssue({
            fullName: state.fullName,
            title: title.trim(),
            issueBody: issueBody.trim() || undefined,
            labels: selectedLabels.size > 0 ? [...selectedLabels] : undefined,
          })
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

function BatchCreateIssuesForm({ state, onClose, onSuccess, onError, onIssueCreated }: {
  state: Extract<ModalState, { mode: 'create-issues-batch' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  onIssueCreated?: (owner: string, repoName: string) => void
}) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<{ title: string; url?: string; error?: string }[] | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const parsedTitles = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((title) => title.length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (parsedTitles.length === 0) return
    setSubmitting(true)
    try {
      let res: { results: { title: string; url?: string; error?: string }[] }
      if (state.provider === 'gitlab') {
        const settled = await Promise.allSettled(
          parsedTitles.map((title) => api.createGitLabIssue({ fullName: state.fullName, title }))
        )
        res = { results: settled.map((r, i) => r.status === 'fulfilled' ? { title: parsedTitles[i], url: r.value.url } : { title: parsedTitles[i], error: (r.reason as any)?.message ?? 'Failed' }) }
      } else {
        res = await api.createIssuesBatch({
          fullName: state.fullName,
          issues: parsedTitles.map((title) => ({ title })),
        })
      }
      setResults(res.results)
      const successCount = res.results.filter((r) => !r.error).length
      if (successCount > 0) {
        onIssueCreated?.(state.owner, state.repoName)
        onSuccess(`Created ${successCount} issue${successCount !== 1 ? 's' : ''}`)
      }
    } catch (err: any) {
      onError(`Failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-title">
        Batch Create Issues
        <span className="modal-subtitle">{state.fullName}</span>
      </div>
      {!results ? (
        <>
          <div className="modal-field">
            <label className="modal-label">Issue list (one per line, starting with -)</label>
            <textarea
              ref={textareaRef}
              className="input modal-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"- Fix login bug\n- Add dark mode\n- Update README"}
              rows={6}
            />
          </div>
          {parsedTitles.length > 0 && (
            <div className="modal-field">
              <label className="modal-label">Preview ({parsedTitles.length} issue{parsedTitles.length !== 1 ? 's' : ''})</label>
              <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85em', color: 'var(--text-muted, #aaa)' }}>
                {parsedTitles.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || parsedTitles.length === 0}>
              {submitting ? 'Creating...' : `Construct All (${parsedTitles.length})`}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="modal-field">
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.4em', fontSize: '0.9em' }}>
                <span>{r.error ? '✗' : '✓'}</span>
                <span style={{ color: r.error ? 'var(--red, #f55)' : 'var(--green, #5f5)' }}>{r.title}</span>
                {r.error && <span style={{ color: 'var(--text-muted, #aaa)', fontSize: '0.8em' }}>— {r.error}</span>}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </form>
  )
}

function AssignForm({ state, onClose, onSuccess, onError }: {
  state: Extract<ModalState, { mode: 'assign' }>
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(state.currentAssignees))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const loadCollaborators = state.provider === 'gitlab'
      ? api.getGitLabCollaborators(state.fullName)
      : api.getCollaborators(state.owner, state.repoName)
    loadCollaborators
      .then(data => setCollaborators(data.map(c => c.login)))
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
      if (state.provider === 'gitlab') {
        await Promise.all(
          toAdd.map((assignee) => api.addGitLabAssignee({
            fullName: state.fullName,
            number: state.number,
            type: state.type === 'pr' ? 'mr' : state.type,
            assignee,
          }))
        )
      } else {
        await api.assignUser({
          fullName: state.fullName,
          number: state.number,
          type: state.type,
          assignees: toAdd,
        })
      }
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
          {collaborators.map((login) => (
            <button
              key={login}
              type="button"
              className={`label-chip${selected.has(login) ? ' selected' : ''}`}
              onClick={() => toggle(login)}
            >
              @{login}
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
  const addToast = useAppStore((s) => s.addToast)

  const copyBranchName = (name: string) => {
    navigator.clipboard.writeText(name).then(() => {
      addToast(`Copied: ${name}`, 'success')
    }).catch(() => {
      addToast('Failed to copy branch name', 'error')
    })
  }

  useEffect(() => {
    const req = state.provider === 'gitlab'
      ? api.getGitLabMR(state.fullName, state.number)
      : api.getPR(state.owner, state.repoName, state.number)
    req
      .then(setPR)
      .catch((err) => onError(`Failed to load ${state.provider === 'gitlab' ? 'MR' : 'PR'}: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.fullName, state.owner, state.repoName, state.number])

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
        {state.provider === 'gitlab' ? 'MR' : 'PR'} #{state.number}
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
              <span className="branch-copy-row">
                <span className="branch-name-text">{pr.headRefName}</span>
                <button
                  className="btn-copy-branch"
                  onClick={() => copyBranchName(pr.headRefName)}
                  title="Copy branch name"
                >
                  <CopyIcon size={11} />
                </button>
                <span>→ {pr.baseRefName}</span>
              </span>
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
              View on {state.provider === 'gitlab' ? 'GitLab' : 'GitHub'} ↗
            </a>
            {onTransition && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'comment', fullName: state.fullName, number: state.number, type: 'pr', provider: state.provider })}
                  title="Post comment"
                >
                  <CommentIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'label', fullName: state.fullName, number: state.number, type: 'pr', currentLabels: pr.labels.map((l) => l.name), provider: state.provider })}
                  title="Manage labels"
                >
                  <LabelIcon size={12} />
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onTransition({ mode: 'assign', fullName: state.fullName, owner: state.owner, repoName: state.repoName, number: state.number, type: 'pr', currentAssignees: pr.assignees.map((a) => a.login), provider: state.provider })}
                    title="Assign"
                  >
                    Assign
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
    const req = state.provider === 'gitlab'
      ? api.getGitLabIssueDetail(state.fullName, state.number)
      : api.getIssue(state.owner, state.repoName, state.number)
    req
      .then(setIssue)
      .catch((err) => onError(`Failed to load issue: ${err.message}`))
      .finally(() => setLoading(false))
  }, [state.fullName, state.owner, state.repoName, state.number])

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
              View on {state.provider === 'gitlab' ? 'GitLab' : 'GitHub'} ↗
            </a>
            {onTransition && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'comment', fullName: state.fullName, number: state.number, type: 'issue', provider: state.provider })}
                  title="Post comment"
                >
                  <CommentIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onTransition({ mode: 'label', fullName: state.fullName, number: state.number, type: 'issue', currentLabels: issue.labels.map((l) => l.name), provider: state.provider })}
                  title="Manage labels"
                >
                  <LabelIcon size={12} />
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => onTransition({ mode: 'create-pr', fullName: state.fullName, owner: state.owner, repoName: state.repoName, issueNumber: state.number, provider: state.provider, ...(state.prLink ? { head: state.prLink.head, base: state.prLink.base, title: state.prLink.title, prBody: state.prLink.body } : {}) })}
                >
                  {state.provider === 'gitlab' ? '@mr' : '@pr'}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onTransition({ mode: 'assign', fullName: state.fullName, owner: state.owner, repoName: state.repoName, number: state.number, type: 'issue', currentAssignees: issue.assignees.map((a) => a.login), provider: state.provider })}
                    title="Assign"
                  >
                    Assign
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
