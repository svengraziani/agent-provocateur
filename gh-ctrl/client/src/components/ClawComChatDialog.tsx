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
      onWheel={(e) => e.stopPropagation()}
    >
        {/* Header */}
        <div className="clawcom-chat-header">
          <div>
            <div className="map-dialog-title">
              &#x25a0; CLAWCOM — {building.name.toUpperCase()}
            </div>
            <div className="clawcom-chat-status">
              <span className="clawcom-chat-online-dot">●</span>&nbsp;
              {config.clawType?.toUpperCase() ?? 'CLAW'} @ {config.host}
            </div>
          </div>
          <div>
            <button
              className="hud-btn"
              onClick={handleDisconnect}
              title="Verbindung trennen und neu konfigurieren"
            >
              ⚙ RESET
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="clawcom-chat-messages">
          {loading && (
            <div className="clawcom-chat-status" style={{ textAlign: 'center' }}>
              ◌ Lade Nachrichten...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="clawcom-chat-status" style={{ textAlign: 'center', margin: 'auto' }}>
              Keine Nachrichten. Sende deinen ersten Befehl an den Claw.
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`clawcom-chat-msg clawcom-chat-msg--${msg.direction === 'out' ? 'out' : 'in'}`}
            >
              <div className={`clawcom-chat-bubble clawcom-chat-bubble--${msg.direction === 'out' ? 'out' : 'in'}`}>
                {msg.content}
              </div>
              <div className="clawcom-chat-msg-meta">
                {msg.direction === 'out' ? 'Du' : config.clawType ?? 'Claw'} · {formatTime(msg.createdAt)}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="clawcom-chat-input-row">
          <input
            className="hud-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Befehl eingeben... (Enter zum Senden)"
            disabled={sending}
            autoFocus
          />
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            {sending ? '◌' : '➤ SENDEN'}
          </button>
        </div>

        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>SCHLIESSEN</button>
        </div>
    </div>
  )
}
