import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import type { Building, MailMessage } from '../types'

interface MailboxInboxDialogProps {
  building: Building
  onClose: () => void
  onReconfigure: () => void
  onError: (msg: string) => void
}

type Tab = 'inbox' | 'starred'

function formatDate(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = diffMs / 3_600_000
  if (diffH < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffH < 168) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
}

function parseFrom(fromAddress: string | null): string {
  if (!fromAddress) return '—'
  const match = fromAddress.match(/^(.+?)\s*</)
  if (match && match[1].trim()) return match[1].trim()
  const addrMatch = fromAddress.match(/<(.+?)>/)
  return addrMatch ? addrMatch[1] : fromAddress
}

interface ComposeState {
  to: string
  subject: string
  body: string
}

export function MailboxInboxDialog({ building, onClose, onReconfigure, onError }: MailboxInboxDialogProps) {
  const [messages, setMessages]           = useState<MailMessage[]>([])
  const [loading, setLoading]             = useState(false)
  const [syncing, setSyncing]             = useState(false)
  const [selected, setSelected]           = useState<MailMessage | null>(null)
  const [tab, setTab]                     = useState<Tab>('inbox')
  const [composing, setComposing]         = useState(false)
  const [compose, setCompose]             = useState<ComposeState>({ to: '', subject: '', body: '' })
  const [sending, setSending]             = useState(false)

  // Use a ref so that onError identity changes (from parent re-renders) don't
  // cause loadMessages to be recreated and trigger a spurious mail reload.
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError })

  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const msgs = await api.getMailMessages(building.id)
      setMessages(msgs)
    } catch (err: unknown) {
      onErrorRef.current(`Error loading: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [building.id])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    try {
      await api.syncMail(building.id)
      await loadMessages()
    } catch (err: unknown) {
      onError(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleSelect(msg: MailMessage) {
    setSelected(msg)
    setComposing(false)
    if (!msg.isRead) {
      try {
        await api.markMailRead(building.id, msg.id)
        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, isRead: 1 } : m))
      } catch { /* ignore */ }
    }
  }

  async function handleToggleStar(msg: MailMessage, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const result = await api.toggleMailStar(building.id, msg.id)
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, isStarred: result.isStarred } : m))
      if (selected?.id === msg.id) setSelected((s) => s ? { ...s, isStarred: result.isStarred } : s)
    } catch (err: unknown) {
      onError(`Failed to update star: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  async function handleDelete(msg: MailMessage, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`Delete message "${msg.subject ?? '(no subject)'}"?`)) return
    try {
      await api.deleteMailMessage(building.id, msg.id)
      setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      if (selected?.id === msg.id) setSelected(null)
    } catch (err: unknown) {
      onError(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  async function handleSend() {
    if (!compose.to.trim() || !compose.subject.trim() || sending) return
    setSending(true)
    try {
      await api.sendMail(building.id, compose)
      setComposing(false)
      setCompose({ to: '', subject: '', body: '' })
    } catch (err: unknown) {
      onError(`Send failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }

  const displayed = messages.filter((m) => tab === 'inbox' ? true : m.isStarred === 1)
  const unreadCount = messages.filter((m) => !m.isRead).length

  return (
    <div className="map-dialog mailbox-dialog" onWheel={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="map-dialog-title mailbox-dialog-header">
        <span>&#x25a0; {building.name.toUpperCase()} — INBOX</span>
        <div className="mailbox-header-actions">
          <button className="hud-btn mailbox-sm-btn" onClick={handleSync} disabled={syncing}>
            {syncing ? '◌' : '↻'} SYNC
          </button>
          <button className="hud-btn mailbox-sm-btn" onClick={() => { setComposing(true); setSelected(null) }}>
            ✉ COMPOSE
          </button>
          <button className="hud-btn mailbox-sm-btn" onClick={onReconfigure}>
            ⚙
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mailbox-body">
        {/* Left: message list */}
        <div className="mailbox-list-panel">
          {/* Tabs */}
          <div className="mailbox-tabs">
            <button
              className={`hud-btn mailbox-tab-btn${tab === 'inbox' ? ' active' : ''}`}
              onClick={() => setTab('inbox')}
            >
              INBOX {unreadCount > 0 && <span className="mailbox-unread-count">({unreadCount})</span>}
            </button>
            <button
              className={`hud-btn mailbox-tab-btn${tab === 'starred' ? ' active' : ''}`}
              onClick={() => setTab('starred')}
            >
              ★ STARRED
            </button>
          </div>

          {/* List */}
          <div className="mailbox-message-list">
            {loading && (
              <div className="mailbox-list-status">◌ Loading...</div>
            )}
            {!loading && displayed.length === 0 && (
              <div className="mailbox-list-status">No messages</div>
            )}
            {displayed.map((msg) => (
              <div
                key={msg.id}
                onClick={() => handleSelect(msg)}
                className={`mailbox-message-row${selected?.id === msg.id ? ' mailbox-message-row--selected' : ''}`}
              >
                <div className="mailbox-row-header">
                  <span className={`mailbox-sender${msg.isRead ? ' mailbox-sender--read' : ''}`}>
                    {parseFrom(msg.fromAddress)}
                  </span>
                  <span className="mailbox-date">
                    {formatDate(msg.date)}
                  </span>
                </div>
                <div className={`mailbox-subject${msg.isRead ? ' mailbox-subject--read' : ''}`}>
                  {msg.subject ?? '(no subject)'}
                </div>
                <div className="mailbox-row-meta">
                  {!msg.isRead && <span className="mailbox-unread-dot" />}
                  <button
                    className={`mailbox-icon-btn${msg.isStarred ? ' mailbox-icon-btn--starred' : ''}`}
                    onClick={(e) => handleToggleStar(msg, e)}
                    title="Star"
                  >★</button>
                  <button
                    className="mailbox-icon-btn mailbox-icon-btn--delete"
                    onClick={(e) => handleDelete(msg, e)}
                    title="Delete"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail or compose */}
        <div className="mailbox-detail-panel">
          {composing ? (
            <>
              <div className="mailbox-compose-title">✉ NEW EMAIL</div>
              <input
                className="hud-input mailbox-compose-input"
                value={compose.to}
                onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
                placeholder="To: recipient@example.com"
              />
              <input
                className="hud-input mailbox-compose-input"
                value={compose.subject}
                onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
                placeholder="Subject"
              />
              <textarea
                className="hud-input mailbox-compose-textarea"
                value={compose.body}
                onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
                placeholder="Message..."
                rows={8}
              />
              <div className="mailbox-compose-actions">
                <button className="hud-btn" onClick={() => setComposing(false)}>CANCEL</button>
                <button
                  className="hud-btn hud-btn-new-base"
                  onClick={handleSend}
                  disabled={!compose.to.trim() || !compose.subject.trim() || sending}
                >
                  {sending ? '◌ SENDING...' : '▶ SEND'}
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <div>
                <div className="mailbox-detail-subject">
                  {selected.subject ?? '(no subject)'}
                </div>
                <div className="mailbox-detail-meta">
                  <strong>From:</strong> {selected.fromAddress ?? '—'}
                </div>
                {selected.toAddresses && (() => {
                  try {
                    const addrs = JSON.parse(selected.toAddresses) as string[]
                    return addrs.length > 0 ? (
                      <div className="mailbox-detail-meta">
                        <strong>To:</strong> {addrs.join(', ')}
                      </div>
                    ) : null
                  } catch { return null }
                })()}
                <div className="mailbox-detail-date">
                  <strong>Date:</strong> {selected.date ? new Date(selected.date).toLocaleString() : '—'}
                </div>
                <div className="mailbox-detail-body">
                  {selected.bodyText ?? selected.snippet ?? (
                    <span className="mailbox-detail-empty">
                      No text available. Start a sync to fetch the message content.
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="mailbox-detail-placeholder">
              &#x25a6; Select a message
            </div>
          )}
        </div>
      </div>

      <div className="map-dialog-actions">
        <button className="hud-btn" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  )
}
