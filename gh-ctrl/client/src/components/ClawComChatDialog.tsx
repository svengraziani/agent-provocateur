import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ClawComConfig, ClawComMessage } from '../types'

interface ClawComChatDialogProps {
  building: Building
  onClose: () => void
  onReconfigure: () => void
  onError: (msg: string) => void
}

export function ClawComChatDialog({ building, onClose, onReconfigure, onError }: ClawComChatDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  const [messages, setMessages] = useState<ClawComMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  let config: Partial<ClawComConfig> = {}
  try { config = JSON.parse(building.config) } catch { /* empty */ }

  useEffect(() => {
    api.getBuildingMessages(building.id)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [building.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    try {
      await api.sendBuildingMessage(building.id, content)
      // Reload all messages to get any reply
      const updated = await api.getBuildingMessages(building.id)
      setMessages(updated)
    } catch (err: any) {
      onError(`Nachricht konnte nicht gesendet werden: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleDisconnect() {
    try {
      await api.updateBuilding(building.id, { config: { clawType: config.clawType ?? 'openclaw', host: '', configured: false } })
      await loadBuildings()
      onReconfigure()
    } catch (err: any) {
      onError(`Trennung fehlgeschlagen: ${err.message}`)
    }
  }

  function formatTime(ts: string | number | null): string {
    if (!ts) return ''
    const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className="map-dialog"
      style={{ display: 'flex', flexDirection: 'column' }}
      onWheel={(e) => e.stopPropagation()}
    >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="map-dialog-title" style={{ marginBottom: 2 }}>
              &#x25a0; CLAWCOM — {building.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              <span style={{ color: 'var(--green-neon)' }}>●</span>&nbsp;
              {config.clawType?.toUpperCase() ?? 'CLAW'} @ {config.host}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="hud-btn"
              onClick={handleDisconnect}
              title="Verbindung trennen und neu konfigurieren"
              style={{ fontSize: 10 }}
            >
              ⚙ RESET
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg-darker)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: 12,
          minHeight: 200,
          maxHeight: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 12,
        }}>
          {loading && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              ◌ Lade Nachrichten...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
              Keine Nachrichten. Sende deinen ersten Befehl an den Claw.
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.direction === 'out' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '80%',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.5,
                background: msg.direction === 'out' ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${msg.direction === 'out' ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`,
                color: msg.direction === 'out' ? 'var(--green-neon)' : 'var(--text)',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                {msg.direction === 'out' ? 'Du' : config.clawType ?? 'Claw'} · {formatTime(msg.createdAt)}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="hud-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Befehl eingeben... (Enter zum Senden)"
            style={{ flex: 1 }}
            disabled={sending}
            autoFocus
          />
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            {sending ? '◌' : '&#x27a4; SENDEN'}
          </button>
        </div>

        <div className="map-dialog-actions" style={{ marginTop: 12 }}>
          <button className="hud-btn" onClick={onClose}>SCHLIESSEN</button>
        </div>
    </div>
  )
}
