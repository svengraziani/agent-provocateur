import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api, getSourceRelayFetchUrl } from '../api'
import { useAppStore } from '../store'
import type {
  Building,
  SourceRelayConnector,
  SourceRelayConnectorType,
  SourceRelayFetcher,
  SourceRelayGitFile,
} from '../types'

interface Position {
  x: number
  y: number
}

interface SourceRelayBuildingProps {
  building: Building
  position: Position
  isRelocateMode: boolean
  isBeingRelocated: boolean
  onStartRelocate: (mouseX: number, mouseY: number) => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  isSelected?: boolean
  onSelect?: () => void
  onDeselect?: () => void
}

// Chroma-key: replace green pixels with the building color
function useColorizedImage(src: string, color: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const hex = color.replace('#', '')
      const tr = parseInt(hex.slice(0, 2), 16)
      const tg = parseInt(hex.slice(2, 4), 16)
      const tb = parseInt(hex.slice(4, 6), 16)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        if (g > r * 1.3 && g > b * 1.3 && g > 80) {
          const ratio = g / 255
          data[i] = Math.round(tr * ratio)
          data[i + 1] = Math.round(tg * ratio)
          data[i + 2] = Math.round(tb * ratio)
        }
      }
      ctx.putImageData(imageData, 0, 0)
      setDataUrl(canvas.toDataURL())
    }
    img.src = src
  }, [src, color])
  return dataUrl
}

// ── File tree browser modal ────────────────────────────────────────────────

interface FileTreeModalProps {
  buildingId: number
  connector: SourceRelayConnector
  selectedPaths: string[]
  onSave: (paths: string[]) => void
  onClose: () => void
}

function FileTreeModal({ buildingId, connector, selectedPaths, onSave, onClose }: FileTreeModalProps) {
  const [files, setFiles] = useState<SourceRelayGitFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedPaths))
  const [search, setSearch] = useState('')

  let cfg: { branch?: string } = {}
  try { cfg = JSON.parse(connector.configuration) } catch { /* empty */ }

  useEffect(() => {
    setLoading(true)
    api.getSourceRelayGitTree(buildingId, connector.id, cfg.branch)
      .then((data) => { setFiles(data.files); setLoading(false) })
      .catch((err: Error) => { setError(err.message); setLoading(false) })
  }, [buildingId, connector.id, cfg.branch])

  const filtered = search
    ? files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
    : files

  function toggleAll() {
    if (checked.size === 0) {
      setChecked(new Set(files.map((f) => f.path)))
    } else {
      setChecked(new Set())
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 4, width: 480, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>
            SELECT FILES — {connector.name}
          </span>
          <button className="hud-btn" style={{ fontSize: 9 }} onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
            Loading file tree…
          </div>
        )}
        {error && (
          <div style={{ padding: 14, color: '#ff6b6b', fontSize: 11 }}>{error}</div>
        )}
        {!loading && !error && (
          <>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="hud-input"
                style={{ flex: 1, fontSize: 10 }}
                placeholder="Filter files…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="hud-btn" style={{ fontSize: 9 }} onClick={toggleAll}>
                {checked.size === 0 ? 'All' : 'None'}
              </button>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                {checked.size === 0 ? 'All files' : `${checked.size} selected`}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {filtered.map((f) => (
                <label
                  key={f.path}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 14px', cursor: 'pointer',
                    fontSize: 10, color: 'var(--text)',
                    background: checked.has(f.path) ? 'rgba(255,136,0,0.08)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(f.path)}
                    onChange={(e) => {
                      const next = new Set(checked)
                      if (e.target.checked) next.add(f.path)
                      else next.delete(f.path)
                      setChecked(next)
                    }}
                    style={{ accentColor: '#ff8800' }}
                  />
                  <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{f.path}</span>
                  {f.size !== undefined && (
                    <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', flexShrink: 0 }}>
                      {f.size < 1024 ? `${f.size}B` : `${(f.size / 1024).toFixed(1)}KB`}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="hud-btn" style={{ fontSize: 9 }} onClick={onClose}>CANCEL</button>
          <button
            className="hud-btn"
            style={{ fontSize: 9, color: '#ff8800' }}
            onClick={() => onSave(checked.size === 0 ? [] : Array.from(checked))}
            disabled={loading}
          >
            SAVE SELECTION
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main dialog ─────────────────────────────────────────────────────────────

type DialogTab = 'connectors' | 'fetchers' | 'links'

interface ConnectorFormState {
  name: string
  type: SourceRelayConnectorType
  url: string
  branch: string
  token: string
}

function emptyConnectorForm(): ConnectorFormState {
  return { name: '', type: 'git', url: '', branch: 'main', token: '' }
}

interface SourceRelayDialogProps {
  building: Building
  onClose: () => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function SourceRelayDialog({ building, onClose, addToast }: SourceRelayDialogProps) {
  const [tab, setTab] = useState<DialogTab>('connectors')
  const [connectors, setConnectors] = useState<SourceRelayConnector[]>([])
  const [fetchers, setFetchers] = useState<SourceRelayFetcher[]>([])
  const [loading, setLoading] = useState(true)
  const entries = useAppStore((s) => s.entries)

  // Linked repo IDs — stored in building config JSON
  const parsedConfig = (() => { try { return JSON.parse(building.config ?? '{}') } catch { return {} } })()
  const [linkedRepoIds, setLinkedRepoIds] = useState<number[]>(parsedConfig.linkedRepoIds ?? [])
  const [savingLinks, setSavingLinks] = useState(false)

  const toggleLinkedRepo = async (repoId: number) => {
    const next = linkedRepoIds.includes(repoId)
      ? linkedRepoIds.filter((id) => id !== repoId)
      : [...linkedRepoIds, repoId]
    setLinkedRepoIds(next)
    setSavingLinks(true)
    try {
      const newConfig = { ...parsedConfig, linkedRepoIds: next }
      await api.updateBuilding(building.id, { config: newConfig })
      // Sync store so SourceRelayConnectionsLayer sees the new linkedRepoIds immediately
      useAppStore.setState((state) => ({
        buildings: state.buildings.map((b) =>
          b.id === building.id ? { ...b, config: JSON.stringify(newConfig) } : b
        ),
      }))
    } catch {
      addToast('Failed to save repo links', 'error')
      setLinkedRepoIds(linkedRepoIds) // revert
    } finally {
      setSavingLinks(false)
    }
  }

  // Connector form
  const [showConnectorForm, setShowConnectorForm] = useState(false)
  const [connectorForm, setConnectorForm] = useState<ConnectorFormState>(emptyConnectorForm())
  const [editingConnectorId, setEditingConnectorId] = useState<number | null>(null)
  const [savingConnector, setSavingConnector] = useState(false)

  // Fetcher creation
  const [newFetcherName, setNewFetcherName] = useState('')
  const [showNewFetcher, setShowNewFetcher] = useState(false)
  const [creatingFetcher, setCreatingFetcher] = useState(false)

  // Link connector to fetcher
  const [linkingFetcherId, setLinkingFetcherId] = useState<number | null>(null)
  const [linkConnectorId, setLinkConnectorId] = useState<string>('')
  const [savingLink, setSavingLink] = useState(false)

  // File tree browser
  const [fileTreeFor, setFileTreeFor] = useState<{
    fetcherId: number
    connector: SourceRelayConnector
    currentPaths: string[]
  } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [cs, fs] = await Promise.all([
        api.listSourceRelayConnectors(building.id),
        api.listSourceRelayFetchers(building.id),
      ])
      setConnectors(cs)
      setFetchers(fs)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [building.id])

  useEffect(() => { loadData() }, [loadData])

  // ── Connector actions ────────────────────────────────────────────────────

  function startEditConnector(c: SourceRelayConnector) {
    let cfg: { url?: string; branch?: string } = {}
    try { cfg = JSON.parse(c.configuration) } catch { /* empty */ }
    setConnectorForm({
      name: c.name,
      type: c.type,
      url: cfg.url ?? '',
      branch: cfg.branch ?? 'main',
      token: '', // never pre-fill token
    })
    setEditingConnectorId(c.id)
    setShowConnectorForm(true)
  }

  async function handleSaveConnector() {
    if (!connectorForm.name.trim() || !connectorForm.url.trim()) return
    setSavingConnector(true)
    try {
      const configuration: Record<string, string> = { url: connectorForm.url.trim() }
      if (connectorForm.type !== 'website') {
        configuration.branch = connectorForm.branch.trim() || 'main'
      }
      if (connectorForm.token.trim()) {
        configuration.token = connectorForm.token.trim()
      }
      if (editingConnectorId !== null) {
        const updated = await api.updateSourceRelayConnector(building.id, editingConnectorId, {
          name: connectorForm.name.trim(),
          type: connectorForm.type,
          configuration,
        })
        setConnectors((prev) => prev.map((c) => (c.id === editingConnectorId ? updated : c)))
        addToast('Connector updated', 'success')
      } else {
        const created = await api.createSourceRelayConnector(building.id, {
          name: connectorForm.name.trim(),
          type: connectorForm.type,
          configuration,
        })
        setConnectors((prev) => [...prev, created])
        addToast('Connector created', 'success')
      }
      setShowConnectorForm(false)
      setEditingConnectorId(null)
      setConnectorForm(emptyConnectorForm())
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    } finally {
      setSavingConnector(false)
    }
  }

  async function handleDeleteConnector(id: number) {
    if (!confirm('Delete this connector? Any fetchers using it will lose access to this source.')) return
    try {
      await api.deleteSourceRelayConnector(building.id, id)
      setConnectors((prev) => prev.filter((c) => c.id !== id))
      addToast('Connector deleted', 'info')
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    }
  }

  // ── Fetcher actions ──────────────────────────────────────────────────────

  async function handleCreateFetcher() {
    if (!newFetcherName.trim()) return
    setCreatingFetcher(true)
    try {
      const fetcher = await api.createSourceRelayFetcher(building.id, newFetcherName.trim())
      setFetchers((prev) => [...prev, fetcher])
      setNewFetcherName('')
      setShowNewFetcher(false)
      addToast('Fetcher created', 'success')
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    } finally {
      setCreatingFetcher(false)
    }
  }

  async function handleDeleteFetcher(id: number) {
    if (!confirm('Delete this fetcher? The public URL will stop working.')) return
    try {
      await api.deleteSourceRelayFetcher(building.id, id)
      setFetchers((prev) => prev.filter((f) => f.id !== id))
      addToast('Fetcher deleted', 'info')
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    }
  }

  async function handleLinkConnector(fetcherId: number) {
    const connectorId = Number(linkConnectorId)
    if (!connectorId) return
    setSavingLink(true)
    try {
      await api.setSourceRelayConnectorFiles(building.id, fetcherId, connectorId, [])
      await loadData()
      setLinkingFetcherId(null)
      setLinkConnectorId('')
      addToast('Connector linked', 'success')
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    } finally {
      setSavingLink(false)
    }
  }

  async function handleUnlinkConnector(fetcherId: number, connectorId: number) {
    try {
      await api.removeSourceRelayConnectorFromFetcher(building.id, fetcherId, connectorId)
      setFetchers((prev) =>
        prev.map((f) =>
          f.id === fetcherId
            ? { ...f, connectorFiles: f.connectorFiles.filter((cf) => cf.connectorId !== connectorId) }
            : f,
        ),
      )
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    }
  }

  async function handleSaveFilePaths(fetcherId: number, connectorId: number, paths: string[]) {
    try {
      await api.setSourceRelayConnectorFiles(building.id, fetcherId, connectorId, paths)
      await loadData()
      setFileTreeFor(null)
      addToast('File selection saved', 'success')
    } catch (err: unknown) {
      addToast(`Error: ${(err as Error).message}`, 'error')
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(
      () => addToast('URL copied to clipboard', 'success'),
      () => addToast('Copy failed', 'error'),
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const typeLabel: Record<SourceRelayConnectorType, string> = {
    git: 'Git Repo',
    private_git: 'Private Git',
    website: 'Website',
  }

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{
          background: '#0d1117',
          border: '1px solid rgba(255,136,0,0.35)',
          boxShadow: '0 0 32px rgba(255,136,0,0.12), 0 8px 40px rgba(0,0,0,0.8)',
          borderRadius: 4, width: 560, maxHeight: '82vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid rgba(255,136,0,0.2)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#ff8800', textTransform: 'uppercase' }}>
              &#x25a0; Source Relay — {building.name}
            </span>
            <button className="hud-btn" style={{ fontSize: 9 }} onClick={onClose}>✕ CLOSE</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,136,0,0.2)', flexShrink: 0 }}>
            {(['connectors', 'fetchers', 'links'] as DialogTab[]).map((t) => (
              <button
                key={t}
                className="hud-btn"
                style={{
                  borderRadius: 0, borderBottom: 'none',
                  borderRight: '1px solid rgba(255,136,0,0.15)',
                  fontSize: 10, padding: '6px 16px',
                  color: tab === t ? '#ff8800' : '#555',
                  background: tab === t ? 'rgba(255,136,0,0.1)' : 'transparent',
                }}
                onClick={() => setTab(t)}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, color: '#ccc' }}>
            {loading && (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, paddingTop: 20 }}>
                Loading…
              </div>
            )}

            {/* ── Connectors Tab ── */}
            {!loading && tab === 'connectors' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    Connectors are content sources (GitHub repos or websites).
                  </span>
                  <button
                    className="hud-btn"
                    style={{ fontSize: 9, color: '#ff8800' }}
                    onClick={() => {
                      setConnectorForm(emptyConnectorForm())
                      setEditingConnectorId(null)
                      setShowConnectorForm(true)
                    }}
                  >
                    + NEW CONNECTOR
                  </button>
                </div>

                {showConnectorForm && (
                  <div style={{
                    background: 'var(--bg-darker)', border: '1px solid #ff8800',
                    borderRadius: 4, padding: 12, marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 10, color: '#ff8800', marginBottom: 8, fontWeight: 700 }}>
                      {editingConnectorId !== null ? 'EDIT CONNECTOR' : 'NEW CONNECTOR'}
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 9, color: 'var(--text-dim)', width: 55 }}>NAME</label>
                        <input
                          className="hud-input"
                          style={{ flex: 1, fontSize: 10 }}
                          value={connectorForm.name}
                          onChange={(e) => setConnectorForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="My Docs"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 9, color: 'var(--text-dim)', width: 55 }}>TYPE</label>
                        <select
                          className="hud-input"
                          style={{ flex: 1, fontSize: 10 }}
                          value={connectorForm.type}
                          onChange={(e) => setConnectorForm((f) => ({ ...f, type: e.target.value as SourceRelayConnectorType }))}
                        >
                          <option value="git">Git Repository (public)</option>
                          <option value="private_git">Git Repository (private)</option>
                          <option value="website">Website / URL</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 9, color: 'var(--text-dim)', width: 55 }}>URL</label>
                        <input
                          className="hud-input"
                          style={{ flex: 1, fontSize: 10 }}
                          value={connectorForm.url}
                          onChange={(e) => setConnectorForm((f) => ({ ...f, url: e.target.value }))}
                          placeholder={connectorForm.type === 'website' ? 'https://docs.example.com' : 'https://github.com/user/repo'}
                        />
                      </div>
                      {connectorForm.type !== 'website' && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ fontSize: 9, color: 'var(--text-dim)', width: 55 }}>BRANCH</label>
                          <input
                            className="hud-input"
                            style={{ flex: 1, fontSize: 10 }}
                            value={connectorForm.branch}
                            onChange={(e) => setConnectorForm((f) => ({ ...f, branch: e.target.value }))}
                            placeholder="main"
                          />
                        </div>
                      )}
                      {connectorForm.type === 'private_git' && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ fontSize: 9, color: 'var(--text-dim)', width: 55 }}>TOKEN</label>
                          <input
                            className="hud-input"
                            style={{ flex: 1, fontSize: 10 }}
                            type="password"
                            value={connectorForm.token}
                            onChange={(e) => setConnectorForm((f) => ({ ...f, token: e.target.value }))}
                            placeholder={editingConnectorId !== null ? '(leave blank to keep existing)' : 'ghp_...'}
                          />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                      <button
                        className="hud-btn"
                        style={{ fontSize: 9 }}
                        onClick={() => { setShowConnectorForm(false); setEditingConnectorId(null) }}
                      >
                        CANCEL
                      </button>
                      <button
                        className="hud-btn"
                        style={{ fontSize: 9, color: '#ff8800' }}
                        onClick={handleSaveConnector}
                        disabled={savingConnector || !connectorForm.name.trim() || !connectorForm.url.trim()}
                      >
                        {savingConnector ? 'SAVING…' : 'SAVE'}
                      </button>
                    </div>
                  </div>
                )}

                {connectors.length === 0 && !showConnectorForm && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', paddingTop: 16 }}>
                    No connectors yet. Add a GitHub repository or website as a source.
                  </div>
                )}

                {connectors.map((c) => {
                  let cfg: { url?: string; branch?: string } = {}
                  try { cfg = JSON.parse(c.configuration) } catch { /* empty */ }
                  return (
                    <div
                      key={c.id}
                      style={{
                        background: 'var(--bg-darker)', borderRadius: 4,
                        padding: '8px 10px', marginBottom: 6,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <div style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 2,
                        background: c.type === 'website' ? '#2244aa' : '#223300',
                        color: c.type === 'website' ? '#88aaff' : '#88ff44',
                        flexShrink: 0,
                      }}>
                        {typeLabel[c.type]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cfg.url ?? '—'}
                          {cfg.branch && c.type !== 'website' ? ` @ ${cfg.branch}` : ''}
                          {c.hasToken ? ' 🔑' : ''}
                        </div>
                      </div>
                      <button
                        className="hud-btn"
                        style={{ fontSize: 9 }}
                        onClick={() => startEditConnector(c)}
                        title="Edit"
                      >✎</button>
                      <button
                        className="hud-btn"
                        style={{ fontSize: 9, color: '#ff6b6b' }}
                        onClick={() => handleDeleteConnector(c.id)}
                        title="Delete"
                      >✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Fetchers Tab ── */}
            {!loading && tab === 'fetchers' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    Each fetcher aggregates connectors into a single shareable URL.
                  </span>
                  <button
                    className="hud-btn"
                    style={{ fontSize: 9, color: '#ff8800' }}
                    onClick={() => setShowNewFetcher(true)}
                  >
                    + NEW FETCHER
                  </button>
                </div>

                {showNewFetcher && (
                  <div style={{
                    background: 'var(--bg-darker)', border: '1px solid #ff8800',
                    borderRadius: 4, padding: 12, marginBottom: 12,
                    display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    <input
                      className="hud-input"
                      style={{ flex: 1, fontSize: 10 }}
                      placeholder="Fetcher name…"
                      value={newFetcherName}
                      onChange={(e) => setNewFetcherName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFetcher() }}
                      autoFocus
                    />
                    <button
                      className="hud-btn"
                      style={{ fontSize: 9 }}
                      onClick={() => { setShowNewFetcher(false); setNewFetcherName('') }}
                    >CANCEL</button>
                    <button
                      className="hud-btn"
                      style={{ fontSize: 9, color: '#ff8800' }}
                      onClick={handleCreateFetcher}
                      disabled={creatingFetcher || !newFetcherName.trim()}
                    >
                      {creatingFetcher ? 'CREATING…' : 'CREATE'}
                    </button>
                  </div>
                )}

                {fetchers.length === 0 && !showNewFetcher && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', paddingTop: 16 }}>
                    No fetchers yet. Create one to generate a shareable URL.
                  </div>
                )}

                {fetchers.map((f) => {
                  const fetchUrl = getSourceRelayFetchUrl(f.uniqueToken)
                  const linkedConnectors = f.connectorFiles.map((cf) =>
                    connectors.find((c) => c.id === cf.connectorId),
                  ).filter(Boolean) as SourceRelayConnector[]
                  const unlinkedConnectors = connectors.filter(
                    (c) => !f.connectorFiles.some((cf) => cf.connectorId === c.id),
                  )

                  return (
                    <div
                      key={f.id}
                      style={{
                        background: 'var(--bg-darker)', borderRadius: 4,
                        padding: 10, marginBottom: 10,
                        border: '1px solid var(--border)',
                      }}
                    >
                      {/* Fetcher header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ff8800', flex: 1 }}>{f.name}</span>
                        <button
                          className="hud-btn"
                          style={{ fontSize: 9, color: '#ff6b6b' }}
                          onClick={() => handleDeleteFetcher(f.id)}
                          title="Delete fetcher"
                        >✕</button>
                      </div>

                      {/* Public URL */}
                      <div style={{
                        background: 'rgba(0,0,0,0.3)', borderRadius: 3, padding: '4px 8px',
                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                      }}>
                        <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#88ff44', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fetchUrl}
                        </span>
                        <button
                          className="hud-btn"
                          style={{ fontSize: 9, flexShrink: 0 }}
                          onClick={() => copyUrl(fetchUrl)}
                          title="Copy URL"
                        >⧉ COPY</button>
                      </div>

                      {/* Linked connectors */}
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>
                        SOURCES ({linkedConnectors.length})
                      </div>
                      {linkedConnectors.length === 0 && (
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 6, fontStyle: 'italic' }}>
                          No sources linked yet.
                        </div>
                      )}
                      {linkedConnectors.map((c) => {
                        const cf = f.connectorFiles.find((x) => x.connectorId === c.id)
                        let selectedPaths: string[] = []
                        try { selectedPaths = JSON.parse(cf?.filePaths ?? '[]') } catch { /* empty */ }
                        const isGit = c.type !== 'website'
                        return (
                          <div
                            key={c.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '3px 0', fontSize: 10,
                            }}
                          >
                            <span style={{ color: 'var(--text)', flex: 1 }}>{c.name}</span>
                            {isGit && (
                              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                                {selectedPaths.length === 0 ? 'all files' : `${selectedPaths.length} file${selectedPaths.length !== 1 ? 's' : ''}`}
                              </span>
                            )}
                            {isGit && (
                              <button
                                className="hud-btn"
                                style={{ fontSize: 9 }}
                                onClick={() =>
                                  setFileTreeFor({
                                    fetcherId: f.id,
                                    connector: c,
                                    currentPaths: selectedPaths,
                                  })
                                }
                                title="Select files"
                              >FILES</button>
                            )}
                            <button
                              className="hud-btn"
                              style={{ fontSize: 9, color: '#ff6b6b' }}
                              onClick={() => handleUnlinkConnector(f.id, c.id)}
                              title="Remove source"
                            >✕</button>
                          </div>
                        )
                      })}

                      {/* Link new connector */}
                      {unlinkedConnectors.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {linkingFetcherId === f.id ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <select
                                className="hud-input"
                                style={{ flex: 1, fontSize: 9 }}
                                value={linkConnectorId}
                                onChange={(e) => setLinkConnectorId(e.target.value)}
                              >
                                <option value="">Select connector…</option>
                                {unlinkedConnectors.map((c) => (
                                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                                ))}
                              </select>
                              <button
                                className="hud-btn"
                                style={{ fontSize: 9 }}
                                onClick={() => { setLinkingFetcherId(null); setLinkConnectorId('') }}
                              >CANCEL</button>
                              <button
                                className="hud-btn"
                                style={{ fontSize: 9, color: '#ff8800' }}
                                onClick={() => handleLinkConnector(f.id)}
                                disabled={savingLink || !linkConnectorId}
                              >
                                {savingLink ? '…' : 'ADD'}
                              </button>
                            </div>
                          ) : (
                            <button
                              className="hud-btn"
                              style={{ fontSize: 9 }}
                              onClick={() => { setLinkingFetcherId(f.id); setLinkConnectorId('') }}
                            >
                              + ADD SOURCE
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {/* ── Links Tab ── */}
            {!loading && tab === 'links' && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 10 }}>
                  Link battlefield bases to draw spline connections on the map.
                  {savingLinks && <span style={{ marginLeft: 6, color: '#ff8800' }}>Saving…</span>}
                </div>
                {entries.length === 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', paddingTop: 20 }}>
                    No bases on battlefield.
                  </div>
                )}
                {entries.map((entry) => {
                  const linked = linkedRepoIds.includes(entry.repo.id)
                  return (
                    <div
                      key={entry.repo.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: entry.repo.color ?? '#888',
                          boxShadow: linked ? `0 0 6px ${entry.repo.color ?? '#888'}` : 'none',
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.repo.name}
                      </span>
                      <button
                        className="hud-btn"
                        style={{
                          fontSize: 9,
                          color: linked ? '#ff8800' : 'var(--text-dim)',
                          borderColor: linked ? '#ff8800' : undefined,
                        }}
                        onClick={() => toggleLinkedRepo(entry.repo.id)}
                      >
                        {linked ? '◈ LINKED' : '◇ LINK'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* File tree modal — portaled separately so it appears above the dialog */}
      {fileTreeFor && createPortal(
        <FileTreeModal
          buildingId={building.id}
          connector={fileTreeFor.connector}
          selectedPaths={fileTreeFor.currentPaths}
          onSave={(paths) =>
            handleSaveFilePaths(fileTreeFor.fetcherId, fileTreeFor.connector.id, paths)
          }
          onClose={() => setFileTreeFor(null)}
        />,
        document.body,
      )}
    </>
  )
}

// ── Building visual on the battlefield ──────────────────────────────────────

export function SourceRelayBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: SourceRelayBuildingProps) {
  const deleteBuilding = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)

  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [fetcherCount, setFetcherCount] = useState(0)
  const [showDialog, setShowDialog] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

  const colorizedSrc = useColorizedImage('/buildings/source_relay.png', currentBuilding.color ?? '#ff8800')

  useEffect(() => { setCurrentBuilding(building) }, [building])

  // Load fetcher count for badge
  useEffect(() => {
    api.listSourceRelayFetchers(building.id)
      .then((fs) => setFetcherCount(fs.length))
      .catch(() => { /* ignore */ })
  }, [building.id])

  useEffect(() => {
    if (isSelected) setShowDialog(true)
    else setShowDialog(false)
  }, [isSelected])

  function handleClick() {
    if (isRelocateMode) return
    onSelect?.()
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (isRelocateMode) {
      e.stopPropagation()
      onStartRelocate(e.clientX, e.clientY)
    }
  }

  async function handleDelete() {
    if (!confirm(`Demolish "${currentBuilding.name}"? All connectors and fetchers will be deleted.`)) return
    try {
      await deleteBuilding(currentBuilding.id)
    } catch { /* toast shown by store */ }
  }

  async function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newColor = e.target.value
    setCurrentBuilding((b) => ({ ...b, color: newColor }))
    await updateBuildingColor(currentBuilding.id, newColor)
  }

  return (
    <>
      <div
        className={`base-node clawcom-building${isSelected ? ' clawcom-selected' : ''}`}
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
          cursor: isRelocateMode ? 'grab' : 'pointer',
          userSelect: 'none',
          width: 140,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          zIndex: isBeingRelocated ? 100 : 1,
          opacity: isBeingRelocated ? 0.75 : 1,
        }}
        data-building-id={building.id}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        <div className="clawcom-img-wrap" style={{ position: 'relative' }}>
          {colorizedSrc ? (
            <img
              src={colorizedSrc}
              alt={currentBuilding.name}
              style={{
                width: 100, height: 100,
                objectFit: 'contain',
                imageRendering: 'auto',
                filter: isBeingRelocated ? 'brightness(1.5)' : undefined,
              }}
              draggable={false}
            />
          ) : (
            <div style={{ width: 100, height: 100, background: 'var(--bg-panel)', borderRadius: 4 }} />
          )}

          {/* Fetcher count badge */}
          {fetcherCount > 0 && (
            <div style={{
              position: 'absolute', top: 2, right: 2,
              background: '#ff8800', color: '#000',
              borderRadius: '50%', width: 16, height: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700,
            }}>
              {fetcherCount}
            </div>
          )}

          {/* Status dot */}
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 8, height: 8, borderRadius: '50%',
            background: fetcherCount > 0 ? '#ff8800' : '#888',
            border: '1px solid var(--bg-darker)',
            boxShadow: fetcherCount > 0 ? '0 0 6px #ff8800' : undefined,
          }} title={`${fetcherCount} active fetcher${fetcherCount !== 1 ? 's' : ''}`} />
        </div>

        {/* Name */}
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: currentBuilding.color ?? '#ff8800',
          textAlign: 'center',
          textShadow: `0 0 8px ${currentBuilding.color ?? '#ff8800'}44`,
          maxWidth: 130, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentBuilding.name}
        </div>

        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>
          {fetcherCount > 0
            ? `${fetcherCount} RELAY${fetcherCount !== 1 ? 'S' : ''} ACTIVE`
            : '◌ NO RELAYS'}
        </div>

        {/* Action bar */}
        {!isRelocateMode && (
          <div
            className="clawcom-actions"
            style={{ display: 'flex', gap: 4, marginTop: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px' }}
              onClick={() => colorInputRef.current?.click()}
              title="Change color"
            >◈</button>
            <input
              ref={colorInputRef}
              type="color"
              value={currentBuilding.color ?? '#ff8800'}
              onChange={handleColorChange}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
            />
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px', color: '#ff6b6b' }}
              onClick={handleDelete}
              title="Demolish building"
            >✕</button>
          </div>
        )}
      </div>

      {showDialog && createPortal(
        <SourceRelayDialog
          building={currentBuilding}
          onClose={() => onDeselect?.()}
          addToast={addToast}
        />,
        document.body,
      )}
    </>
  )
}
