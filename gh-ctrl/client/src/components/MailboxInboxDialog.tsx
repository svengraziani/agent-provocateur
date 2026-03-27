import { useState, useEffect } from 'react'
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

  async function loadMessages() {
    setLoading(true)
    try {
      const msgs = await api.getMailMessages(building.id)
      setMessages(msgs)
    } catch (err: any) {
      onError(`Error loading: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages()
  }, [building.id])

  async function handleSync() {
    setSyncing(true)
    try {
      await api.syncMail(building.id)
      setTimeout(loadMessages, 2000)
    } catch (err: any) {
      onError(`Sync failed: ${err.message}`)
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
    } catch { /* ignore */ }
  }

  async function handleDelete(msg: MailMessage, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await api.deleteMailMessage(building.id, msg.id)
      setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      if (selected?.id === msg.id) setSelected(null)
    } catch (err: any) {
      onError(`Delete failed: ${err.message}`)
    }
  }

  async function handleSend() {
    if (!compose.to.trim() || !compose.subject.trim() || sending) return
    setSending(true)
    try {
      await api.sendMail(building.id, compose)
      setComposing(false)
      setCompose({ to: '', subject: '', body: '' })
    } catch (err: any) {
      onError(`Send failed: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  const displayed = messages.filter((m) => tab === 'inbox' ? true : m.isStarred === 1)
  const unreadCount = messages.filter((m) => !m.isRead).length

  return (
    <div className="map-dialog" style={{ width: 720, maxWidth: '95vw' }} onWheel={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="map-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>&#x25a0; {building.name.toUpperCase()} — INBOX</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="hud-btn" style={{ fontSize: 9 }} onClick={handleSync} disabled={syncing}>
            {syncing ? '◌' : '↻'} SYNC
          </button>
          <button className="hud-btn" style={{ fontSize: 9 }} onClick={() => { setComposing(true); setSelected(null) }}>
            ✉ COMPOSE
          </button>
          <button className="hud-btn" style={{ fontSize: 9 }} onClick={onReconfigure}>
            ⚙
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', height: 420, overflow: 'hidden' }}>
        {/* Left: message list */}
        <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              className={`hud-btn${tab === 'inbox' ? ' active' : ''}`}
              style={{ flex: 1, fontSize: 9, borderRadius: 0 }}
              onClick={() => setTab('inbox')}
            >
              INBOX {unreadCount > 0 && <span style={{ color: '#ff4444' }}>({unreadCount})</span>}
            </button>
            <button
              className={`hud-btn${tab === 'starred' ? ' active' : ''}`}
              style={{ flex: 1, fontSize: 9, borderRadius: 0 }}
              onClick={() => setTab('starred')}
            >
              ★ STARRED
            </button>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && (
              <div style={{ padding: 12, fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>◌ Loading...</div>
            )}
            {!loading && displayed.length === 0 && (
              <div style={{ padding: 12, fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>
                No messages
              </div>
            )}
            {displayed.map((msg) => (
              <div
                key={msg.id}
                onClick={() => handleSelect(msg)}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selected?.id === msg.id ? 'var(--bg-hover)' : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: msg.isRead ? 400 : 700,
                    color: msg.isRead ? 'var(--text-dim)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {parseFrom(msg.fromAddress)}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {formatDate(msg.date)}
                  </span>
                </div>
                <div style={{
                  fontSize: 10,
                  color: msg.isRead ? 'var(--text-dim)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {msg.subject ?? '(no subject)'}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {!msg.isRead && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-neon)', display: 'inline-block' }} />
                  )}
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0, color: msg.isStarred ? '#ffaa00' : 'var(--text-dim)' }}
                    onClick={(e) => handleToggleStar(msg, e)}
                    title="Star"
                  >★</button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0, color: 'var(--text-dim)', marginLeft: 'auto' }}
                    onClick={(e) => handleDelete(msg, e)}
                    title="Delete"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail or compose */}
        <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {composing ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-neon)' }}>✉ NEW EMAIL</div>
              <input
                className="hud-input"
                value={compose.to}
                onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
                placeholder="To: recipient@example.com"
                style={{ width: '100%' }}
              />
              <input
                className="hud-input"
                value={compose.subject}
                onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
                placeholder="Subject"
                style={{ width: '100%' }}
              />
              <textarea
                className="hud-input"
                value={compose.body}
                onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
                placeholder="Message..."
                rows={8}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  {selected.subject ?? '(no subject)'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>
                  <strong>From:</strong> {selected.fromAddress ?? '—'}
                </div>
                {selected.toAddresses && (() => {
                  try {
                    const addrs = JSON.parse(selected.toAddresses) as string[]
                    return addrs.length > 0 ? (
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>
                        <strong>To:</strong> {addrs.join(', ')}
                      </div>
                    ) : null
                  } catch { return null }
                })()}
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 10 }}>
                  <strong>Date:</strong> {selected.date ? new Date(selected.date).toLocaleString() : '—'}
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 11, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {selected.bodyText ?? selected.snippet ?? (
                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      No text available. Start a sync to fetch the message content.
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 40, textAlign: 'center' }}>
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
