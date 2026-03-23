import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../store'
import type { Badge } from '../types'

interface BadgeLibraryDialogProps {
  onClose: () => void
  onSelectForPlacement: (badge: Badge) => void
  serverUrl: string
}

export function BadgeLibraryDialog({ onClose, onSelectForPlacement, serverUrl }: BadgeLibraryDialogProps) {
  const badges = useAppStore((s) => s.badges)
  const uploadBadge = useAppStore((s) => s.uploadBadge)
  const deleteBadge = useAppStore((s) => s.deleteBadge)
  const addToast = useAppStore((s) => s.addToast)

  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library')
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function getBadgeUrl(badge: Badge) {
    return `${serverUrl}/uploads/badges/${badge.filename}`
  }

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      addToast('Only image files are allowed', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('File exceeds 5MB limit', 'error')
      return
    }
    setPendingFile(file)
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''))
  }, [uploadName, addToast])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  async function handleUpload() {
    if (!pendingFile) { addToast('Select a file first', 'error'); return }
    if (!uploadName.trim()) { addToast('Enter a badge name', 'error'); return }
    setUploading(true)
    try {
      await uploadBadge(pendingFile, uploadName.trim())
      addToast(`Badge "${uploadName.trim()}" uploaded!`, 'success')
      setPendingFile(null)
      setUploadName('')
      setActiveTab('library')
    } catch { /* toast shown by store */ }
    finally { setUploading(false) }
  }

  async function handleDelete(badge: Badge) {
    if (!confirm(`Delete badge "${badge.name}"? This will also remove all placed instances.`)) return
    try {
      await deleteBadge(badge.id)
      addToast(`Badge "${badge.name}" deleted`, 'info')
    } catch { /* toast shown by store */ }
  }

  return (
    <div
      className="map-dialog-overlay"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="map-dialog"
        style={{ minWidth: 420, maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="map-dialog-title">&#x25a0; BADGE LIBRARY</div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`hud-btn${activeTab === 'library' ? ' active' : ''}`}
            onClick={() => setActiveTab('library')}
            style={{ flex: 1 }}
          >
            LIBRARY ({badges.length})
          </button>
          <button
            className={`hud-btn${activeTab === 'upload' ? ' active' : ''}`}
            onClick={() => setActiveTab('upload')}
            style={{ flex: 1 }}
          >
            + UPLOAD
          </button>
        </div>

        {activeTab === 'library' && (
          <div>
            {badges.length === 0 ? (
              <div className="map-dialog-empty" style={{ padding: '24px 0', textAlign: 'center' }}>
                No badges uploaded yet. Go to the Upload tab to add one.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                maxHeight: 320,
                overflowY: 'auto',
                padding: '4px 2px',
              }}>
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    style={{
                      background: 'var(--bg-panel)',
                      border: '1px solid var(--green-neon)33',
                      borderRadius: 6,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--green-neon)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--green-neon)33')}
                    onClick={() => { onSelectForPlacement(badge); onClose() }}
                  >
                    <img
                      src={getBadgeUrl(badge)}
                      alt={badge.name}
                      style={{ width: 48, height: 48, objectFit: 'contain' }}
                    />
                    <div style={{
                      fontSize: 10,
                      color: 'var(--green-neon)',
                      textAlign: 'center',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {badge.name}
                    </div>
                    <button
                      className="hud-btn"
                      style={{ fontSize: 9, padding: '1px 6px', color: '#ff6b6b' }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(badge) }}
                      title="Delete badge"
                    >
                      ✕ DELETE
                    </button>
                  </div>
                ))}
              </div>
            )}
            {badges.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 10, textAlign: 'center' }}>
                Click a badge to place it on the battlefield
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Drop zone */}
            <div
              style={{
                border: `2px dashed ${dragOver ? 'var(--green-neon)' : 'var(--green-neon)55'}`,
                borderRadius: 8,
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--green-neon)11' : 'transparent',
                transition: 'all 0.15s',
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
              />
              {pendingFile ? (
                <div style={{ color: 'var(--green-neon)', fontSize: 12 }}>
                  <div>✓ {pendingFile.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                    {(pendingFile.size / 1024).toFixed(1)} KB · {pendingFile.type}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⬆</div>
                  Drag & drop an image or click to browse
                  <div style={{ fontSize: 10, marginTop: 4 }}>PNG, SVG, JPG, WebP · Max 5MB</div>
                </div>
              )}
            </div>

            {/* Name field */}
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                BADGE NAME
              </label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Command Post, Danger Zone..."
                style={{
                  width: '100%',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--green-neon)55',
                  color: 'var(--green-neon)',
                  padding: '6px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--green-neon)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--green-neon)55')}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUpload() }}
              />
            </div>

            <button
              className="hud-btn"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={handleUpload}
              disabled={uploading || !pendingFile || !uploadName.trim()}
            >
              {uploading ? '⟳ UPLOADING...' : '⬆ UPLOAD BADGE'}
            </button>
          </div>
        )}

        <div className="map-dialog-actions" style={{ marginTop: 16 }}>
          <button className="hud-btn" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  )
}
