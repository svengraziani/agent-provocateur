import { useEffect, useRef, useState, useCallback } from 'react'
import { getShellWsUrl } from '../api'
import type { SshConnection, ShellStatus } from '../types'
// @ts-ignore — installed via npm, types included
import { Terminal } from '@xterm/xterm'
// @ts-ignore
import { FitAddon } from '@xterm/addon-fit'
// @ts-ignore
import { WebLinksAddon } from '@xterm/addon-web-links'
// @ts-ignore
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

interface RemoteShellTerminalTabProps {
  buildingId: number
  connection: SshConnection
  theme?: 'dark' | 'dracula' | 'solarized'
  fontSize?: number
  fontFamily?: string
  isActive: boolean
}

const THEMES = {
  dark: {
    background:   '#0d0d0d',
    foreground:   '#c8f0c8',
    cursor:       '#00ff88',
    black:        '#1a1a1a',
    red:          '#ff5555',
    green:        '#50fa7b',
    yellow:       '#f1fa8c',
    blue:         '#6272a4',
    magenta:      '#ff79c6',
    cyan:         '#8be9fd',
    white:        '#f8f8f2',
    brightBlack:  '#44475a',
    brightRed:    '#ff6e6e',
    brightGreen:  '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue:   '#d6acff',
    brightMagenta:'#ff92df',
    brightCyan:   '#a4ffff',
    brightWhite:  '#ffffff',
  },
  dracula: {
    background:   '#282a36',
    foreground:   '#f8f8f2',
    cursor:       '#f8f8f2',
    black:        '#21222c',
    red:          '#ff5555',
    green:        '#50fa7b',
    yellow:       '#f1fa8c',
    blue:         '#bd93f9',
    magenta:      '#ff79c6',
    cyan:         '#8be9fd',
    white:        '#f8f8f2',
    brightBlack:  '#6272a4',
    brightRed:    '#ff6e6e',
    brightGreen:  '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue:   '#d6acff',
    brightMagenta:'#ff92df',
    brightCyan:   '#a4ffff',
    brightWhite:  '#ffffff',
  },
  solarized: {
    background:   '#002b36',
    foreground:   '#839496',
    cursor:       '#93a1a1',
    black:        '#073642',
    red:          '#dc322f',
    green:        '#859900',
    yellow:       '#b58900',
    blue:         '#268bd2',
    magenta:      '#d33682',
    cyan:         '#2aa198',
    white:        '#eee8d5',
    brightBlack:  '#002b36',
    brightRed:    '#cb4b16',
    brightGreen:  '#586e75',
    brightYellow: '#657b83',
    brightBlue:   '#839496',
    brightMagenta:'#6c71c4',
    brightCyan:   '#93a1a1',
    brightWhite:  '#fdf6e3',
  },
}

// Tmux key sequences (Ctrl+B prefix = \x02)
const TMUX_ACTIONS = [
  { label: '+ WIN',    title: 'New tmux window (Ctrl+B c)',      seq: '\x02c' },
  { label: '▶ NEXT',  title: 'Next tmux window (Ctrl+B n)',      seq: '\x02n' },
  { label: '◀ PREV',  title: 'Prev tmux window (Ctrl+B p)',      seq: '\x02p' },
  { label: '⏏ DETACH', title: 'Detach tmux session (Ctrl+B d)',  seq: '\x02d' },
]

export function RemoteShellTerminalTab({
  buildingId,
  connection,
  theme = 'dark',
  fontSize = 14,
  fontFamily = 'monospace',
  isActive,
}: RemoteShellTerminalTabProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const termRef        = useRef<Terminal | null>(null)
  const fitAddonRef    = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const wsRef          = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<ShellStatus>('connecting')
  const [statusMsg, setStatusMsg] = useState('')

  // Local font size override (per-tab, starts from prop, changed via +/- buttons)
  const [localFontSize, setLocalFontSize] = useState(fontSize)
  const isFontSizeInit = useRef(true)

  // Search bar state
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Push current terminal dimensions to the server. Call after the WS reaches OPEN
  // — initial fit() runs while the WS is still CONNECTING, so the early resize is lost.
  const sendCurrentSize = useCallback((ws: WebSocket) => {
    try {
      fitAddonRef.current?.fit()
      const t = termRef.current
      if (t && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }))
      }
    } catch { /* ignore */ }
  }, [])

  // ── Connect / Reconnect ────────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (!containerRef.current || !termRef.current) return

    setStatus('connecting')
    setStatusMsg('')

    const term = termRef.current
    term.write('\r\n\x1b[33mConnecting to ' + connection.label + '...\x1b[0m\r\n')

    const url = getShellWsUrl(buildingId, connection.id)
    const ws  = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'status') {
            if (msg.state === 'connected') {
              setStatus('connected')
              setStatusMsg('')
              sendCurrentSize(ws)
            } else if (msg.state === 'disconnected') {
              setStatus('disconnected')
              setStatusMsg(msg.error ?? '')
              term.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n')
            } else if (msg.state === 'error') {
              setStatus('error')
              setStatusMsg(msg.error ?? 'Unknown error')
              term.write('\r\n\x1b[31m[Error: ' + (msg.error ?? 'Unknown') + ']\x1b[0m\r\n')
            }
          }
        } catch {
          term.write(evt.data)
        }
      } else if (evt.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(evt.data))
      }
    }

    ws.onerror = () => {
      setStatus('error')
      setStatusMsg('WebSocket error')
      term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n')
    }

    ws.onclose = () => {
      setStatus((prev) => (prev === 'error' ? 'error' : 'disconnected'))
    }
  }, [buildingId, connection.id, connection.label, sendCurrentSize])

  // ── Terminal initialization ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: THEMES[theme] ?? THEMES.dark,
      fontSize,
      fontFamily,
      cursorBlink: true,
      convertEol:  false,
      scrollback:  5000,
    })

    const fitAddon    = new FitAddon()
    const linksAddon  = new WebLinksAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.loadAddon(searchAddon)
    term.open(containerRef.current)
    // Double RAF: first frame attaches the canvas, second frame has correct dimensions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { try { fitAddon.fit() } catch { /* renderer not ready */ } })
    })

    termRef.current     = term
    fitAddonRef.current  = fitAddon
    searchAddonRef.current = searchAddon

    // Forward keystrokes to SSH
    term.onData((data: string) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Forward binary data (paste, etc.)
    term.onBinary((data: string) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        const bytes = Uint8Array.from(data, (c) => c.charCodeAt(0))
        ws.send(bytes.buffer)
      }
    })

    // Keyboard shortcut: Ctrl+Shift+F → toggle search bar
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setSearchVisible((v) => !v)
        return false
      }
      return true
    })

    // Initial connection
    const url = getShellWsUrl(buildingId, connection.id)
    const ws  = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    term.write('\r\n\x1b[33mConnecting to ' + connection.label + '...\x1b[0m\r\n')

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'status') {
            if (msg.state === 'connected') {
              setStatus('connected')
              setStatusMsg('')
              sendCurrentSize(ws)
            } else if (msg.state === 'disconnected') {
              setStatus('disconnected')
              setStatusMsg(msg.error ?? '')
              term.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n')
            } else if (msg.state === 'error') {
              setStatus('error')
              setStatusMsg(msg.error ?? 'Unknown error')
              term.write('\r\n\x1b[31m[Error: ' + (msg.error ?? 'Unknown') + ']\x1b[0m\r\n')
            }
          }
        } catch {
          term.write(evt.data)
        }
      } else if (evt.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(evt.data))
      }
    }

    ws.onerror = () => {
      setStatus('error')
      setStatusMsg('WebSocket error')
      term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n')
    }

    ws.onclose = () => {
      setStatus((prev) => (prev === 'error' ? 'error' : 'disconnected'))
    }

    return () => {
      ws.onopen    = null
      ws.onmessage = null
      ws.onerror   = null
      ws.onclose   = null
      ws.close()
      term.dispose()
      wsRef.current  = null
      termRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, connection.id, theme, fontSize, fontFamily])

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(() => {
      if (!fitAddonRef.current) return
      try {
        fitAddonRef.current.fit()
        const term = termRef.current
        const ws = wsRef.current
        if (term && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      } catch { /* ignore */ }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Focus when tab becomes active ─────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      termRef.current?.focus()
      requestAnimationFrame(() => { try { fitAddonRef.current?.fit() } catch { /* ignore */ } })
    }
  }, [isActive])

  // ── Search helpers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      termRef.current?.focus()
    }
  }, [searchVisible])

  // Sync localFontSize when the prop changes (e.g. user saved new value in setup dialog)
  useEffect(() => {
    setLocalFontSize(fontSize)
  }, [fontSize])

  // Dynamically update terminal font size without recreating it
  useEffect(() => {
    if (isFontSizeInit.current) {
      isFontSizeInit.current = false
      return
    }
    const term = termRef.current
    if (!term) return
    term.options.fontSize = localFontSize
    setTimeout(() => fitAddonRef.current?.fit(), 50)
  }, [localFontSize])

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setSearchVisible(false)
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        searchAddonRef.current?.findPrevious(searchQuery, { caseSensitive: false, incremental: false })
      } else {
        searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false, incremental: false })
      }
    }
  }

  // ── Reconnect ──────────────────────────────────────────────────────────────
  function handleReconnect() {
    wsRef.current?.close()
    wsRef.current = null
    connectWS()
  }

  // ── Clear terminal buffer ──────────────────────────────────────────────────
  function handleClear() {
    termRef.current?.clear()
    termRef.current?.focus()
  }

  // ── Send tmux sequence ─────────────────────────────────────────────────────
  function sendTmux(seq: string) {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(seq)
    }
  }

  const statusColor = {
    idle:         '#888',
    connecting:   '#ffaa00',
    connected:    '#00ff88',
    disconnected: '#888',
    error:        '#ff4444',
  }[status]

  const isDisconnected = status === 'disconnected' || status === 'error'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d' }}>

      {/* Tmux quick-action toolbar — only shown when tmuxSession is configured */}
      {connection.tmuxSession && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 10px', background: '#0a0a1a', borderBottom: '1px solid #1a1a2e',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, color: '#4488ff', marginRight: 4, fontWeight: 700 }}>
            TMUX:{connection.tmuxSession}
          </span>
          {TMUX_ACTIONS.map((action) => (
            <button
              key={action.seq}
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 6px', color: '#88aaff' }}
              title={action.title}
              disabled={!isActive || status !== 'connected'}
              onClick={() => sendTmux(action.seq)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '2px 10px', background: '#111', borderBottom: '1px solid #222',
        fontSize: 10, color: '#888', flexShrink: 0,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
        <span style={{ color: '#aaa' }}>{connection.label}</span>
        <span>·</span>
        <span>{connection.username}@{connection.host}:{connection.port ?? 22}</span>
        {connection.tmuxSession && <><span>·</span><span style={{ color: '#00aaff' }}>tmux:{connection.tmuxSession}</span></>}
        {statusMsg && <><span>·</span><span style={{ color: '#ff4444' }}>{statusMsg}</span></>}
        <span style={{ marginLeft: 'auto', textTransform: 'uppercase' }}>{status}</span>
        {/* Reconnect button — shown when disconnected or errored */}
        {isDisconnected && (
          <button
            className="hud-btn"
            style={{ fontSize: 9, padding: '1px 6px', color: '#00ff88', marginLeft: 4 }}
            onClick={handleReconnect}
            title="Reconnect"
          >⟳ RECONNECT</button>
        )}
        {/* Font size controls */}
        <button
          className="hud-btn"
          style={{ fontSize: 9, padding: '0 5px' }}
          onClick={() => setLocalFontSize((s) => Math.max(8, s - 1))}
          title="Decrease font size"
        >A−</button>
        <span style={{ fontSize: 9, color: '#555', minWidth: 18, textAlign: 'center' }}>{localFontSize}</span>
        <button
          className="hud-btn"
          style={{ fontSize: 9, padding: '0 5px' }}
          onClick={() => setLocalFontSize((s) => Math.min(32, s + 1))}
          title="Increase font size"
        >A+</button>
        {/* Clear buffer */}
        <button
          className="hud-btn"
          style={{ fontSize: 9, padding: '1px 6px', color: '#666' }}
          onClick={handleClear}
          title="Clear terminal buffer"
        >⌫</button>
        {/* Search toggle */}
        <button
          className="hud-btn"
          style={{ fontSize: 9, padding: '1px 6px', color: searchVisible ? '#00ff88' : '#666', marginLeft: 2 }}
          onClick={() => setSearchVisible((v) => !v)}
          title="Search terminal output (Ctrl+Shift+F)"
        >⌕</button>
      </div>

      {/* Search bar — shown when searchVisible */}
      {searchVisible && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', background: '#111', borderBottom: '1px solid #333',
          flexShrink: 0,
        }}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (e.target.value) {
                searchAddonRef.current?.findNext(e.target.value, { caseSensitive: false, incremental: true })
              }
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search… (Enter=next, Shift+Enter=prev, Esc=close)"
            style={{
              flex: 1, background: '#0d0d0d', border: '1px solid #333',
              color: '#c8f0c8', padding: '2px 8px', fontSize: 11,
              borderRadius: 3, outline: 'none', fontFamily: 'monospace',
            }}
          />
          <button
            className="hud-btn"
            style={{ fontSize: 9 }}
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery, { caseSensitive: false, incremental: false })}
          >▲</button>
          <button
            className="hud-btn"
            style={{ fontSize: 9 }}
            onClick={() => searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false, incremental: false })}
          >▼</button>
          <button
            className="hud-btn"
            style={{ fontSize: 9, color: '#ff6b6b' }}
            onClick={() => setSearchVisible(false)}
          >✕</button>
        </div>
      )}

      {/* Terminal */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}
