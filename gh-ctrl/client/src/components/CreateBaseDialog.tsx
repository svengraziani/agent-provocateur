import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

interface Props {
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

const BOOT_SEQUENCE = `> COMMAND CENTER ONLINE
> SECURE CHANNEL ESTABLISHED
> READY TO ESTABLISH NEW BASE...`

export function CreateBaseDialog({ onClose, onSuccess, onError }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [submitting, setSubmitting] = useState(false)
  const [bootText, setBootText] = useState('')
  const [bootDone, setBootDone] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Typewriter boot sequence
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i <= BOOT_SEQUENCE.length) {
        setBootText(BOOT_SEQUENCE.slice(0, i))
        i++
      } else {
        clearInterval(interval)
        setBootDone(true)
        nameRef.current?.focus()
      }
    }, 16)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    setSubmitting(true)
    try {
      const result = await api.createRepo({
        name: trimmedName,
        description: description.trim() || undefined,
        visibility,
      })
      onSuccess(`BASE ESTABLISHED: ${result.repo.fullName} (${visibility.toUpperCase()})`)
    } catch (err: any) {
      onError(`BASE CONSTRUCTION FAILED: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  const isValidName = /^[a-zA-Z0-9._-]+$/.test(name.trim())

  return (
    <div
      className="construct-overlay"
      onClick={onClose}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="construct-dialog"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="construct-header">
          <div className="construct-title-bar">
            <span className="construct-icon">&#x25a0;&#x25a0;</span>
            <span className="construct-title">ESTABLISH NEW BASE</span>
            <span className="construct-subtitle">// NEW GITHUB REPOSITORY</span>
            <button className="construct-close" onClick={onClose}>✕</button>
          </div>
          <pre className="construct-boot">
            {bootText}
            {!bootDone && <span className="construct-cursor">_</span>}
          </pre>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="construct-form">
          <div className="construct-field">
            <label className="construct-label">&#x25b6; BASE DESIGNATION (repo name):</label>
            <input
              ref={nameRef}
              className="construct-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-new-repo"
              autoComplete="off"
              pattern="[a-zA-Z0-9._-]+"
            />
            {name.trim() && !isValidName && (
              <div className="construct-field-error">
                Only letters, numbers, hyphens, underscores, and dots allowed
              </div>
            )}
          </div>

          <div className="construct-field">
            <label className="construct-label">&#x25b6; INTEL BRIEF (description):</label>
            <input
              className="construct-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              autoComplete="off"
            />
          </div>

          <div className="construct-field">
            <label className="construct-label">&#x25b6; CLEARANCE LEVEL:</label>
            <div className="create-base-visibility">
              <button
                type="button"
                className={`create-base-vis-btn${visibility === 'private' ? ' selected' : ''}`}
                onClick={() => setVisibility('private')}
              >
                <span className="create-base-vis-icon">&#x1F512;</span>
                <span className="create-base-vis-label">PRIVATE</span>
                <span className="create-base-vis-desc">Only you and collaborators</span>
              </button>
              <button
                type="button"
                className={`create-base-vis-btn${visibility === 'public' ? ' selected' : ''}`}
                onClick={() => setVisibility('public')}
              >
                <span className="create-base-vis-icon">&#x1F30D;</span>
                <span className="create-base-vis-label">PUBLIC</span>
                <span className="create-base-vis-desc">Visible to everyone</span>
              </button>
            </div>
          </div>

          <div className="construct-actions">
            <button type="button" className="construct-btn abort" onClick={onClose}>
              [ ABORT MISSION ]
            </button>
            <button
              type="submit"
              className="construct-btn deploy"
              disabled={submitting || !name.trim() || !isValidName}
            >
              {submitting ? '[ CONSTRUCTING... ]' : '[ ESTABLISH BASE ]'}
            </button>
          </div>
        </form>

        <div className="construct-footer">
          &#x25a0; NEW REPOSITORY &nbsp;·&nbsp; COMMAND CENTER READY
        </div>
      </div>
    </div>
  )
}
