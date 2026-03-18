import { useState, useEffect, useRef } from 'react'
import type { DashboardEntry, GHLabel } from '../types'
import { api } from '../api'
import { VoiceButton } from './VoiceButton'
import { CloseIcon } from './Icons'

interface Props {
  entry: DashboardEntry
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

const BOOT_SEQUENCE = `> CONSTRUCTION YARD ONLINE
> SECURE CHANNEL ESTABLISHED
> AWAITING MISSION ORDERS...`

export function ConstructDialog({ entry, onClose, onSuccess, onError }: Props) {
  const [title, setTitle] = useState('')
  const [issueBody, setIssueBody] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [availableLabels, setAvailableLabels] = useState<GHLabel[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [labelsLoading, setLabelsLoading] = useState(true)
  const [bootText, setBootText] = useState('')
  const [bootDone, setBootDone] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        titleRef.current?.focus()
      }
    }, 16)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    api.getLabels(entry.repo.owner, entry.repo.name)
      .then(setAvailableLabels)
      .catch(() => {/* labels optional */})
      .finally(() => setLabelsLoading(false))
  }, [entry.repo.owner, entry.repo.name])

  const toggleLabel = (name: string) => {
    setSelectedLabels(prev => {
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

  const handleBodyPaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length) addImages(e.clipboardData.files)
  }

  const handleBodyDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) addImages(e.dataTransfer.files)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const result = await api.createIssue({
        fullName: entry.repo.fullName,
        title: title.trim(),
        issueBody: issueBody.trim() || undefined,
        labels: selectedLabels.size > 0 ? [...selectedLabels] : undefined,
      }, images.length ? images : undefined)
      onSuccess(`ISSUE DEPLOYED: ${result.url || title}`)
    } catch (err: any) {
      onError(`DEPLOYMENT FAILED: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="construct-overlay"
      onClick={onClose}
      onKeyDown={handleOverlayKeyDown}
      onWheel={(e) => e.stopPropagation()}
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
            <span className="construct-title">CONSTRUCTION YARD</span>
            <span className="construct-subtitle">// {entry.repo.fullName}</span>
            <button className="construct-close" onClick={onClose}><CloseIcon size={12} /></button>
          </div>
          <pre className="construct-boot">
            {bootText}
            {!bootDone && <span className="construct-cursor">_</span>}
          </pre>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="construct-form">
          <div className="construct-field">
            <label className="construct-label">&#x25b6; MISSION OBJECTIVE:</label>
            <div className="voice-input-group">
              <input
                ref={titleRef}
                className="construct-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter mission title..."
                autoComplete="off"
              />
              <VoiceButton
                variant="construct"
                onTranscript={(text) => setTitle((prev) => prev ? `${prev} ${text}` : text)}
                title="Dictate mission title"
              />
            </div>
          </div>

          <div className="construct-field">
            <label className="construct-label">&#x25b6; INTEL REPORT:</label>
            <div
              className="voice-input-group"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleBodyDrop}
            >
              <textarea
                className="construct-input construct-textarea"
                value={issueBody}
                onChange={(e) => setIssueBody(e.target.value)}
                onPaste={handleBodyPaste}
                placeholder="Describe the situation... (optional)"
                rows={4}
              />
              <VoiceButton
                variant="construct"
                onTranscript={(text) => setIssueBody((prev) => prev ? `${prev} ${text}` : text)}
                title="Dictate intel report"
              />
            </div>
            <div className="image-attach-bar">
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addImages(e.target.files)} />
              <button type="button" className="construct-btn-attach" onClick={() => fileInputRef.current?.click()}>&#128247; ATTACH IMAGE</button>
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
            <div className="construct-field">
              <label className="construct-label">&#x25b6; MISSION TAGS:</label>
              <div className="construct-label-grid">
                {availableLabels.map((label) => (
                  <button
                    key={label.name}
                    type="button"
                    className={`construct-label-chip${selectedLabels.has(label.name) ? ' selected' : ''}`}
                    style={{ '--label-color': `#${label.color}` } as React.CSSProperties}
                    onClick={() => toggleLabel(label.name)}
                  >
                    <span className="construct-label-dot" style={{ background: `#${label.color}` }} />
                    {label.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="construct-actions">
            <button type="button" className="construct-btn abort" onClick={onClose}>
              [ ABORT MISSION ]
            </button>
            <button
              type="submit"
              className="construct-btn deploy"
              disabled={submitting || !title.trim()}
            >
              {submitting ? '[ DEPLOYING... ]' : '[ DEPLOY ]'}
            </button>
          </div>
        </form>

        <div className="construct-footer">
          &#x25a0; BASE: {entry.repo.fullName} &nbsp;·&nbsp; COMMAND CENTER READY
        </div>
      </div>
    </div>
  )
}
