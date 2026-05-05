import { useEffect, useRef, useState, useCallback } from 'react'
import { getShellWsUrl, api } from '../api'
import { useAppStore } from '../store'
import type { SshConnection, ShellStatus, TmuxWindow } from '../types'
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
  /** When set, send Ctrl+B + index to jump to that tmux window once the
   *  shell reaches the connected state, then clear via consumeTmuxJump. */
  pendingWindowIndex?: number
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
  pendingWindowIndex,
}: RemoteShellTerminalTabProps) {
  const consumeTmuxJump = useAppStore((s) => s.consumeTmuxJump)
  const repos = useAppStore((s) => s.repos)
  const containerRef   = useRef<HTMLDivElement>(null)
  const termRef        = useRef<Terminal | null>(null)
  const fitAddonRef    = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const wsRef          = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<ShellStatus>('connecting')
  const [statusMsg, setStatusMsg] = useState('')
  // Timestamp of when the SSH/PTY went 'connected'. The backend writes the
  // `tmux new-session -A -s …` command right after sending the connected
  // status, so the PTY is actually still bash for a moment. Used by the
  // tmux-jump effect to delay sending the prefix until tmux is attached.
  const connectedAtRef = useRef<number | null>(null)

  // Local font size override (per-tab, starts from prop, changed via +/- buttons)
  const [localFontSize, setLocalFontSize] = useState(fontSize)
  const isFontSizeInit = useRef(true)

  // Search bar state
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Tmux windows panel
  const [showWindows, setShowWindows]     = useState(false)
  const [tmuxWindows, setTmuxWindows]     = useState<TmuxWindow[]>([])
  const [windowsLoading, setWindowsLoading] = useState(false)
  const windowsPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Repo link picker
  const [linkPickerWindow, setLinkPickerWindow] = useState<number | null>(null)
  const [winRepoLinks, setWinRepoLinks] = useState<Record<string, number[]>>(
    () => connection.windowRepoLinks ?? {}
  )

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

  // ── Tmux window list ───────────────────────────────────────────────────────
  const fetchTmuxWindows = useCallback(async () => {
    if (!connection.tmuxSession) return
    setWindowsLoading(true)
    try {
      const res = await api.getShellTmuxWindows(buildingId, connection.id, connection.tmuxSession)
      if (res.ok) setTmuxWindows(res.windows)
    } catch { /* ignore */ } finally {
      setWindowsLoading(false)
    }
  }, [buildingId, connection.id, connection.tmuxSession])

  // Poll for window list while panel is open and terminal is connected
  useEffect(() => {
    if (!showWindows || !connection.tmuxSession) return
    fetchTmuxWindows()
    windowsPollRef.current = setInterval(fetchTmuxWindows, 5_000)
    return () => {
      if (windowsPollRef.current) clearInterval(windowsPollRef.current)
    }
  }, [showWindows, connection.tmuxSession, fetchTmuxWindows])

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
              connectedAtRef.current = Date.now()
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
              connectedAtRef.current = Date.now()
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

  // ── Pending tmux window jump ──────────────────────────────────────────────
  // When a battlefield tmux satellite is clicked, the store sets
  // pendingTmuxJump. The dialog routes the windowIndex to the matching tab
  // via prop; here we send Ctrl+B + index once the shell is actually
  // connected and tmux has had a moment to attach, then clear the pending
  // jump.
  //
  // Why the delay: the backend sends `status: connected` immediately after
  // opening the PTY and only THEN writes `tmux new-session -A -s …` into
  // the stream. If we send the prefix too early it goes to bash and gets
  // dropped. We wait at least TMUX_ATTACH_DELAY_MS since the connected
  // moment — for a tab that's been connected for a while (the common case
  // where the user clicks a satellite while the dialog is already open)
  // this is a no-op and we send immediately.
  useEffect(() => {
    if (pendingWindowIndex == null) return
    if (status !== 'connected') return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const TMUX_ATTACH_DELAY_MS = 1000
    const idx = pendingWindowIndex
    const sinceConnected = Date.now() - (connectedAtRef.current ?? 0)
    const wait = Math.max(0, TMUX_ATTACH_DELAY_MS - sinceConnected)

    const send = () => {
      const w = wsRef.current
      if (!w || w.readyState !== WebSocket.OPEN) return
      w.send(`\x02${idx}`)
      consumeTmuxJump()
      termRef.current?.focus()
    }

    if (wait === 0) {
      send()
      return
    }
    const timeout = setTimeout(send, wait)
    return () => clearTimeout(timeout)
  }, [pendingWindowIndex, status, consumeTmuxJump])

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

  function jumpToWindow(index: number) {
    // Ctrl+B + window-index number (supports 0–9 via \x020...\x029)
    sendTmux(`\x02${index}`)
    termRef.current?.focus()
  }

  async function handleRenameWindow(win: TmuxWindow) {
    if (!connection.tmuxSession) return
    const next = window.prompt(`Rename tmux window ${win.index}:`, win.name)
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === win.name) return
    try {
      const res = await api.renameShellTmuxWindow(
        buildingId,
        connection.id,
        win.index,
        trimmed,
        connection.tmuxSession,
      )
      if (res.ok) {
        // Optimistically update the local list, then re-fetch for truth
        setTmuxWindows((prev) =>
          prev.map((w) => (w.index === win.index ? { ...w, name: res.name ?? trimmed } : w))
        )
        fetchTmuxWindows()
      } else {
        window.alert(`Rename failed: ${res.error ?? 'unknown error'}`)
      }
    } catch (err) {
      window.alert(`Rename failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function toggleRepoLink(windowIndex: number, repoId: number) {
    setWinRepoLinks((prev) => {
      const key = String(windowIndex)
      const current = prev[key] ?? []
      const next = current.includes(repoId)
        ? current.filter((id) => id !== repoId)
        : [...current, repoId]
      return { ...prev, [key]: next }
    })
  }

  async function saveLinkForWindow(windowIndex: number) {
    const repoIds = winRepoLinks[String(windowIndex)] ?? []
    try {
      const updated = await api.updateShellWindowRepoLinks(buildingId, connection.id, windowIndex, repoIds)
      setWinRepoLinks(updated.windowRepoLinks ?? {})
      setLinkPickerWindow(null)
    } catch (err) {
      window.alert(`Failed to save links: ${err instanceof Error ? err.message : String(err)}`)
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
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 10px', background: '#0a0a1a', borderBottom: showWindows ? 'none' : '1px solid #1a1a2e',
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
            {/* Window list toggle */}
            <button
              className="hud-btn"
              style={{
                fontSize: 9, padding: '1px 6px', marginLeft: 4,
                color: showWindows ? '#00ff88' : '#88aaff',
                borderColor: showWindows ? '#00ff88' : undefined,
              }}
              title="Show tmux windows"
              onClick={() => setShowWindows((v) => !v)}
            >
              WINS {showWindows ? '▲' : '▼'}
            </button>
          </div>

          {/* Tmux window list panel */}
          {showWindows && (
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
              padding: '4px 10px', background: '#060616', borderBottom: '1px solid #1a1a2e',
              flexShrink: 0,
            }}>
              {windowsLoading && tmuxWindows.length === 0 ? (
                <span style={{ fontSize: 9, color: '#4488ff' }}>Loading…</span>
              ) : tmuxWindows.length === 0 ? (
                <span style={{ fontSize: 9, color: '#444' }}>No windows found</span>
              ) : (
                tmuxWindows.map((win) => (
                  <span key={win.index} style={{ display: 'inline-flex', alignItems: 'stretch', gap: 0 }}>
                    <button
                      className="hud-btn"
                      title={`Jump to window ${win.index}: ${win.name} (Ctrl+B ${win.index})`}
                      disabled={!isActive || status !== 'connected'}
                      onClick={() => jumpToWindow(win.index)}
                      style={{
                        fontSize: 9, padding: '1px 7px',
                        color: win.active ? '#00ff88' : '#88aaff',
                        borderColor: win.active ? '#00ff88' : undefined,
                        fontWeight: win.active ? 700 : undefined,
                        borderTopRightRadius: 0, borderBottomRightRadius: 0,
                        borderRight: 'none',
                      }}
                    >
                      {win.index}:{win.name}{win.active ? ' ●' : ''}
                    </button>
                    <button
                      className="hud-btn"
                      title={`Rename window ${win.index}`}
                      disabled={!isActive || status !== 'connected'}
                      onClick={() => handleRenameWindow(win)}
                      style={{
                        fontSize: 9, padding: '1px 5px',
                        color: win.active ? '#00ff88' : '#666',
                        borderColor: win.active ? '#00ff88' : undefined,
                        borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                        borderRight: 'none',
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="hud-btn"
                      title={`Link repos to window ${win.index}`}
                      onClick={() => setLinkPickerWindow((p) => p === win.index ? null : win.index)}
                      style={{
                        fontSize: 9, padding: '1px 5px',
                        color: (winRepoLinks[String(win.index)]?.length ?? 0) > 0 ? '#00aaff' : '#555',
                        borderColor: (winRepoLinks[String(win.index)]?.length ?? 0) > 0 ? '#00aaff' : undefined,
                        borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                        borderLeft: 'none',
                      }}
                    >
                      ⛓
                    </button>
                  </span>
                ))
              )}
              <button
                className="hud-btn"
                style={{ fontSize: 9, padding: '1px 5px', color: '#444', marginLeft: 'auto' }}
                title="Refresh window list"
                onClick={fetchTmuxWindows}
              >
                ⟳
              </button>
            </div>
          )}

          {/* Repo link picker — expands below window list when ⛓ is clicked */}
          {showWindows && linkPickerWindow !== null && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
              padding: '4px 10px', background: '#07071a', borderBottom: '1px solid #1a1a2e',
              fontSize: 9, flexShrink: 0,
            }}>
              <span style={{ color: '#666', marginRight: 2 }}>win {linkPickerWindow} →</span>
              {repos.length === 0 && (
                <span style={{ color: '#444' }}>No repos configured</span>
              )}
              {repos.map((repo) => {
                const linked = winRepoLinks[String(linkPickerWindow)]?.includes(repo.id) ?? false
                return (
                  <button
                    key={repo.id}
                    className="hud-btn"
                    onClick={() => toggleRepoLink(linkPickerWindow, repo.id)}
                    style={{
                      fontSize: 9, padding: '1px 6px',
                      color: linked ? '#00aaff' : '#555',
                      borderColor: linked ? '#00aaff' : undefined,
                    }}
                  >
                    {linked ? '✓ ' : ''}{repo.fullName}
                  </button>
                )
              })}
              <button
                className="hud-btn"
                onClick={() => saveLinkForWindow(linkPickerWindow)}
                style={{ fontSize: 9, padding: '1px 6px', color: '#00ff88', marginLeft: 4 }}
              >
                Save
              </button>
              <button
                className="hud-btn"
                onClick={() => setLinkPickerWindow(null)}
                style={{ fontSize: 9, padding: '1px 5px', color: '#888' }}
              >
                ✕
              </button>
            </div>
          )}
        </>
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
