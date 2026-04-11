import { useState, useRef } from 'react'
import { exportBackup, importBackup, previewBackup } from '../api'
import { useAppStore } from '../store'

interface BackupManifest {
  version: number
  appVersion: string
  exportedAt: string
  tables: Record<string, number>
}

export function BackupPanel() {
  const addToast = useAppStore((s) => s.addToast)

  // Export state
  const [exporting, setExporting] = useState(false)

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [manifest, setManifest] = useState<BackupManifest | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await exportBackup()
      const isoDate = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ghctrl-backup-${isoDate}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('Backup downloaded successfully', 'success')
    } catch (err: any) {
      addToast(`Export failed: ${err.message}`, 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setPreviewError('Please select a .zip backup file')
      setImportFile(null)
      setManifest(null)
      return
    }

    setImportFile(file)
    setManifest(null)
    setPreviewError('')
    setPreviewLoading(true)

    try {
      const meta = await previewBackup(file)
      setManifest(meta)
    } catch (err: any) {
      setPreviewError(`Could not read backup: ${err.message}`)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleImport = async () => {
    if (!importFile || !manifest) return
    setImporting(true)
    try {
      const result = await importBackup(importFile)
      const totalRows = Object.values(result.stats).reduce((a, b) => a + b, 0)
      addToast(`Restore complete — ${totalRows} records restored. Reloading…`, 'success')
      if (result.badgeFileErrors?.length) {
        addToast(`Some badge files could not be restored: ${result.badgeFileErrors.join(', ')}`, 'error')
      }
      setImportFile(null)
      setManifest(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setTimeout(() => window.location.reload(), 300)
    } catch (err: any) {
      addToast(`Restore failed: ${err.message}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleClearFile = () => {
    setImportFile(null)
    setManifest(null)
    setPreviewError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  return (
    <div className="settings-section">
      <h2>Backup &amp; Restore</h2>

      {/* Export */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
          Export
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '0.75rem' }}>
          Download a full backup ZIP containing all your data (repos, maps, buildings, messages, timers, etc.) and badge image files.
        </p>
        <div
          style={{
            padding: '0.6rem 0.75rem',
            background: 'rgba(255, 200, 0, 0.08)',
            border: '1px solid rgba(255, 200, 0, 0.25)',
            borderRadius: '6px',
            fontSize: '0.78rem',
            color: 'var(--text-2)',
            marginBottom: '0.75rem',
          }}
        >
          &#9888;&#65039; The backup includes sensitive tokens and credentials (GitLab tokens, SSH keys). Store it securely.
        </div>
        <button
          className="btn btn-primary"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Building backup…' : 'Download Backup'}
        </button>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: '1.5rem' }} />

      {/* Import */}
      <div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text)' }}>
          Restore
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '0.75rem' }}>
          Restore from a previously exported backup. <strong style={{ color: 'var(--red, #f85149)' }}>This will overwrite all current data.</strong>
        </p>

        {/* Drag-and-drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a .zip backup file here, or press Enter to browse"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !importFile && fileInputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !importFile) fileInputRef.current?.click() }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--green-neon, #00ff88)' : 'var(--border)'}`,
            borderRadius: '8px',
            padding: '1.5rem',
            textAlign: 'center',
            cursor: importFile ? 'default' : 'pointer',
            background: dragOver ? 'rgba(0,255,136,0.05)' : 'transparent',
            transition: 'border-color 0.15s, background 0.15s',
            marginBottom: '0.75rem',
          }}
        >
          {!importFile ? (
            <>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>&#128230;</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
                Drag &amp; drop a <code>.zip</code> backup here, or <span style={{ color: 'var(--green-neon, #00ff88)' }}>click to browse</span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.88rem', color: 'var(--text)' }}>&#128196; {importFile.name}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); handleClearFile() }}
                style={{ padding: '1px 6px', fontSize: '0.78rem' }}
              >
                &times;
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
          onChange={handleFileInputChange}
          tabIndex={-1}
          aria-hidden="true"
        />

        {previewLoading && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>
            Reading backup…
          </div>
        )}

        {previewError && (
          <div style={{ fontSize: '0.82rem', color: 'var(--red, #f85149)', marginBottom: '0.5rem' }}>
            {previewError}
          </div>
        )}

        {manifest && (
          <div
            style={{
              padding: '0.75rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              marginBottom: '0.75rem',
              fontSize: '0.82rem',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text)' }}>
              Backup Preview
            </div>
            <div style={{ color: 'var(--text-2)', marginBottom: '0.25rem' }}>
              Exported: {formatDate(manifest.exportedAt)}
            </div>
            {manifest.appVersion && (
              <div style={{ color: 'var(--text-2)', marginBottom: '0.5rem' }}>
                App version: {manifest.appVersion}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {Object.entries(manifest.tables)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => (
                  <span
                    key={table}
                    style={{
                      background: 'rgba(0,255,136,0.08)',
                      border: '1px solid rgba(0,255,136,0.2)',
                      borderRadius: '4px',
                      padding: '1px 7px',
                      color: 'var(--green-neon, #00ff88)',
                      fontSize: '0.75rem',
                    }}
                  >
                    {table}: {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        {manifest && (
          <button
            className="btn btn-danger"
            onClick={handleImport}
            disabled={importing}
            style={{ width: '100%' }}
          >
            {importing ? 'Restoring…' : 'Restore — this will overwrite all current data'}
          </button>
        )}
      </div>
    </div>
  )
}
