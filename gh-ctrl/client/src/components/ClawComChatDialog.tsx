import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ClawComConfig, ClawComMessage, ChannelEvent } from '../types'

interface ClawComChatDialogProps {
  building: Building
  onClose: () => void
  onReconfigure: () => void
  onError: (msg: string) => void
}

interface PermissionPrompt {
  id: string
  toolName: string
  input: unknown
}

export function ClawComChatDialog({ building, onClose, onReconfigure, onError }: ClawComChatDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  const [messages, setMessages] = useState<ClawComMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sseConnected, setSseConnected] = useState(false)
  const [permissionPrompts, setPermissionPrompts] = useState<PermissionPrompt[]>([])
  const [submittingPermission, setSubmittingPermission] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  let config: Partial<ClawComConfig> = {}
  try { config = JSON.parse(building.config) } catch { /* empty */ }

  const isChannel = config.clawType === 'claudechannel'

  // Load initial message history
  useEffect(() => {
    api.getBuildingMessages(building.id)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [building.id])

  // For Claude Channel: connect via SSE for real-time replies
  useEffect(() => {
    if (!isChannel) return

    const cleanup = api.streamChannelEvents(
      building.id,
      (event: ChannelEvent) => {
        if (event.type === 'connected') {
          setSseConnected(true)
        } else if (event.type === 'reply' && event.content) {
          // The backend already persisted this reply; refresh message list
          api.getBuildingMessages(building.id).then(setMessages).catch(() => {})
        } else if (event.type === 'permission_request' && event.id && event.toolName) {
          setPermissionPrompts((prev) => [
            ...prev,
            { id: event.id!, toolName: event.toolName!, input: event.input },
          ])
        } else if (event.type === 'permission_resolved' && event.id) {
          setPermissionPrompts((prev) => prev.filter((p) => p.id !== event.id))
        }
      },
      () => setSseConnected(false)
    )

    return cleanup
  }, [building.id, isChannel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, permissionPrompts])

  async function handleSend() {
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    try {
      await api.sendBuildingMessage(building.id, content)
      if (!isChannel) {
        // For openclaw/nanoclaw the reply comes back synchronously — refresh now
        const updated = await api.getBuildingMessages(building.id)
        setMessages(updated)
      }
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
      await api.updateBuilding(building.id, {
        config: { clawType: config.clawType ?? 'openclaw', host: '', configured: false },
      })
      await loadBuildings()
      onReconfigure()
    } catch (err: any) {
      onError(`Trennung fehlgeschlagen: ${err.message}`)
    }
  }

  async function handlePermissionVerdict(id: string, verdict: 'allow' | 'deny') {
    setSubmittingPermission(id)
    try {
      await api.submitPermissionVerdict(building.id, id, verdict)
      setPermissionPrompts((prev) => prev.filter((p) => p.id !== id))
    } catch (err: any) {
      onError(`Permission-Antwort fehlgeschlagen: ${err.message}`)
    } finally {
      setSubmittingPermission(null)
    }
  }

  function formatTime(ts: string | number | null): string {
    if (!ts) return ''
    const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatPermissionInput(input: unknown): string {
    if (!input) return ''
    try {
      return JSON.stringify(input, null, 2).slice(0, 200)
    } catch {
      return String(input)
    }
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
              {isChannel ? (
                <>
                  <span className={`clawcom-chat-online-dot${sseConnected ? '' : ' clawcom-chat-online-dot--dim'}`}>●</span>&nbsp;
                  CLAUDE CHANNEL {sseConnected ? '● AKTIV' : '● VERBINDE...'}
                </>
              ) : (
                <>
                  <span className="clawcom-chat-online-dot">●</span>&nbsp;
                  {config.clawType?.toUpperCase() ?? 'CLAW'} @ {config.host}
                </>
              )}
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
          {!loading && messages.length === 0 && permissionPrompts.length === 0 && (
            <div className="clawcom-chat-status" style={{ textAlign: 'center', margin: 'auto' }}>
              {isChannel
                ? 'Keine Nachrichten. Sende eine Frage an Claude Code.'
                : 'Keine Nachrichten. Sende deinen ersten Befehl an den Claw.'}
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
                {msg.direction === 'out' ? 'Du' : (isChannel ? 'Claude' : (config.clawType ?? 'Claw'))} · {formatTime(msg.createdAt)}
              </div>
            </div>
          ))}

          {/* Permission relay prompts */}
          {permissionPrompts.map((prompt) => (
            <div key={prompt.id} className="clawcom-chat-msg clawcom-chat-msg--in">
              <div
                className="clawcom-chat-bubble clawcom-chat-bubble--in"
                style={{ borderColor: '#ff9900', background: 'rgba(255,153,0,0.08)' }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#ff9900' }}>
                  ⚠ TOOL-ANFRAGE: {prompt.toolName}
                </div>
                {prompt.input && (
                  <pre style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                    {formatPermissionInput(prompt.input)}
                  </pre>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="hud-btn hud-btn-new-base"
                    style={{ fontSize: 10 }}
                    disabled={submittingPermission === prompt.id}
                    onClick={() => handlePermissionVerdict(prompt.id, 'allow')}
                  >
                    {submittingPermission === prompt.id ? '◌' : '✓ ERLAUBEN'}
                  </button>
                  <button
                    className="hud-btn"
                    style={{ fontSize: 10, color: '#ff6b6b' }}
                    disabled={submittingPermission === prompt.id}
                    onClick={() => handlePermissionVerdict(prompt.id, 'deny')}
                  >
                    ✕ ABLEHNEN
                  </button>
                </div>
              </div>
              <div className="clawcom-chat-msg-meta">Claude · Tool-Genehmigung erforderlich</div>
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
            placeholder={isChannel ? 'Nachricht an Claude... (Enter zum Senden)' : 'Befehl eingeben... (Enter zum Senden)'}
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
