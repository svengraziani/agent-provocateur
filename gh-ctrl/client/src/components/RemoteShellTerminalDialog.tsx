import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, SshConnection, RemoteShellConfig } from '../types'
import { RemoteShellTerminalTab } from './RemoteShellTerminalTab'

interface RemoteShellTerminalDialogProps {
  building: Building
  onClose: () => void
  onReconfigure: () => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

interface TabSession {
  id: string
  connection: SshConnection
}

export function RemoteShellTerminalDialog({
  building,
  onClose,
  onReconfigure,
  addToast,
}: RemoteShellTerminalDialogProps) {
  const [connections, setConnections]     = useState<SshConnection[]>([])
  const [tabs, setTabs]                   = useState<TabSession[]>([])
  const [activeTabId, setActiveTabId]     = useState<string>('')
  const [loading, setLoading]             = useState(true)
  const [showNewTabMenu, setShowNewTabMenu] = useState(false)
  // Anchor for the +TAB dropdown — the menu is portaled to body to escape
  // the tab bar's overflow:auto, so it needs an absolute screen position.
  const newTabBtnRef = useRef<HTMLButtonElement>(null)
  const [newTabMenuPos, setNewTabMenuPos] = useState<{ left: number; top: number } | null>(null)

  const pendingTmuxJump = useAppStore((s) => s.pendingTmuxJump)
  const matchingJump = pendingTmuxJump?.buildingId === building.id ? pendingTmuxJump : null

  const config: Partial<RemoteShellConfig> = (() => {
    try { return JSON.parse(building.config) } catch { return {} }
  })()

  const tabsStorageKey = `clawcom-tabs:${building.id}`

  useEffect(() => {
    let cancelled = false
    api.listShellConnections(building.id)
      .then((conns) => {
        if (cancelled) return
        setConnections(conns)

        // Restore previously open tabs from localStorage, dropping any
        // connections that no longer exist.
        const validIds = new Set(conns.map((c) => c.id))
        let restoredTabs: TabSession[] = []
        let restoredActiveIndex = 0
        try {
          const raw = localStorage.getItem(tabsStorageKey)
          if (raw) {
            const parsed = JSON.parse(raw) as { tabConnectionIds?: number[]; activeIndex?: number }
            if (Array.isArray(parsed.tabConnectionIds)) {
              restoredTabs = parsed.tabConnectionIds
                .map(Number)
                .filter((id) => validIds.has(id))
                .map((id, i) => ({
                  id: `tab-${Date.now()}-${i}`,
                  connection: conns.find((c) => c.id === id)!,
                }))
              restoredActiveIndex = Math.min(
                Math.max(0, Number(parsed.activeIndex) || 0),
                Math.max(0, restoredTabs.length - 1)
              )
            }
          }
        } catch { /* ignore corrupt storage */ }

        // If a satellite click is pending for this building, ensure its
        // connection is in the list and active.
        const jump = useAppStore.getState().pendingTmuxJump
        const jumpConn = jump?.buildingId === building.id
          ? conns.find((c) => c.id === jump.connectionId)
          : null
        if (jumpConn) {
          const existingIdx = restoredTabs.findIndex((t) => t.connection.id === jumpConn.id)
          if (existingIdx >= 0) {
            restoredActiveIndex = existingIdx
          } else {
            restoredTabs = [
              ...restoredTabs,
              { id: `tab-${Date.now()}-jump`, connection: jumpConn },
            ]
            restoredActiveIndex = restoredTabs.length - 1
          }
        }

        // Final fallback: open the configured default (or first) connection.
        if (restoredTabs.length === 0) {
          const initialConn = conns.find((c) => c.id === config.defaultConnectionId) ?? conns[0]
          if (initialConn) {
            restoredTabs = [{ id: `tab-${Date.now()}-default`, connection: initialConn }]
            restoredActiveIndex = 0
          }
        }

        setTabs(restoredTabs)
        setActiveTabId(restoredTabs[restoredActiveIndex]?.id ?? '')
      })
      .catch(() => { if (!cancelled) addToast('Failed to load connections', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id])

  // Persist the open tab list whenever it changes after the initial load.
  useEffect(() => {
    if (loading) return
    const tabConnectionIds = tabs.map((t) => t.connection.id)
    const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeTabId))
    try {
      if (tabConnectionIds.length === 0) {
        localStorage.removeItem(tabsStorageKey)
      } else {
        localStorage.setItem(tabsStorageKey, JSON.stringify({ tabConnectionIds, activeIndex }))
      }
    } catch { /* localStorage quota / unavailable — non-fatal */ }
  }, [tabs, activeTabId, loading, tabsStorageKey])

  // When a satellite click changes the pending tmux jump while the dialog is
  // already open, ensure the matching connection's tab is active. The tab
  // itself reads the windowIndex and sends the Ctrl+B sequence once connected.
  useEffect(() => {
    if (!matchingJump || loading) return
    const conn = connections.find((c) => c.id === matchingJump.connectionId)
    if (!conn) return
    const existing = [...tabs].reverse().find((t) => t.connection.id === conn.id)
    if (existing) {
      if (activeTabId !== existing.id) setActiveTabId(existing.id)
    } else {
      const newTab: TabSession = { id: `tab-${Date.now()}`, connection: conn }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(newTab.id)
    }
  // tabs/activeTabId intentionally omitted to avoid re-firing on tab churn
  // — we only want to react when the jump target itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingJump?.connectionId, matchingJump?.windowIndex, connections, loading])

  // Close the new-tab dropdown when clicking outside
  useEffect(() => {
    if (!showNewTabMenu) return
    const handler = () => setShowNewTabMenu(false)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [showNewTabMenu])

  function openNewTab(connection: SshConnection) {
    const newTab: TabSession = { id: `tab-${Date.now()}`, connection }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  function closeTab(tabId: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId && next.length > 0) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
  }

  return (
    <div
      data-remote-shell-terminal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', flexDirection: 'column',
        background: '#0a0a0a',
        fontFamily: 'monospace',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', background: '#111', borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
      }}>
        <span style={{ color: '#00ff88', fontWeight: 700, fontSize: 12 }}>
          ▣ REMOTEPOST — {building.name}
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="hud-btn"
          style={{ fontSize: 10 }}
          onClick={onReconfigure}
          title="Manage connections"
        >⚙ CONNECTIONS</button>
        <button
          className="hud-btn"
          style={{ fontSize: 10, color: '#ff6b6b' }}
          onClick={onClose}
          title="Close [Esc]"
        >✕ CLOSE</button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 1,
        padding: '3px 8px 0', background: '#0f0f0f', borderBottom: '1px solid #1a1a1a',
        flexShrink: 0, overflowX: 'auto',
      }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 10px 3px 10px',
              background: activeTabId === tab.id ? '#1a1a1a' : 'transparent',
              borderRadius: '4px 4px 0 0',
              border: activeTabId === tab.id ? '1px solid #2a2a2a' : '1px solid transparent',
              borderBottom: activeTabId === tab.id ? '1px solid #1a1a1a' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: 11, color: activeTabId === tab.id ? '#00ff88' : '#666',
              whiteSpace: 'nowrap',
            }}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span>▸</span>
            <span>{tab.connection.label}</span>
            <button
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#666', fontSize: 10, padding: '0 0 0 4px',
              }}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              title="Close tab"
            >✕</button>
          </div>
        ))}

        {/* Add tab button */}
        {connections.length > 0 && (
          <div style={{ position: 'relative', marginLeft: 4 }}>
            {connections.length === 1 ? (
              <button
                className="hud-btn"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => openNewTab(connections[0])}
                title={`New tab: ${connections[0].label}`}
              >+ TAB</button>
            ) : (
              <button
                ref={newTabBtnRef}
                className="hud-btn"
                style={{ fontSize: 11, padding: '2px 8px', color: showNewTabMenu ? '#00ff88' : '#888' }}
                title="Open new tab"
                onClick={(e) => {
                  e.stopPropagation()
                  if (showNewTabMenu) {
                    setShowNewTabMenu(false)
                    return
                  }
                  const rect = newTabBtnRef.current?.getBoundingClientRect()
                  if (rect) setNewTabMenuPos({ left: rect.left, top: rect.bottom + 2 })
                  setShowNewTabMenu(true)
                }}
              >+ TAB ▾</button>
            )}
          </div>
        )}
      </div>

      {/* Terminal area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#00ff88', fontSize: 12,
          }}>
            Loading connections...
          </div>
        )}

        {!loading && tabs.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: '#555', fontSize: 12, gap: 10,
          }}>
            <div>No connections available.</div>
            <button className="hud-btn" onClick={onReconfigure}>⚙ Manage Connections</button>
          </div>
        )}

        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              position: 'absolute', inset: 0,
              display: activeTabId === tab.id ? 'flex' : 'none',
              flexDirection: 'column',
            }}
          >
            <RemoteShellTerminalTab
              buildingId={building.id}
              connection={tab.connection}
              theme={config.theme}
              fontSize={config.fontSize}
              fontFamily={config.fontFamily}
              isActive={activeTabId === tab.id}
              pendingWindowIndex={
                matchingJump && matchingJump.connectionId === tab.connection.id && activeTabId === tab.id
                  ? matchingJump.windowIndex
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {/* +TAB dropdown — portaled so it isn't clipped by the tab bar's
          overflow:auto. Positioned via getBoundingClientRect of the button. */}
      {showNewTabMenu && newTabMenuPos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: newTabMenuPos.left,
            top: newTabMenuPos.top,
            background: '#111', border: '1px solid #333', borderRadius: 3,
            zIndex: 1200, minWidth: 160,
            boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {connections.map((c) => (
            <div
              key={c.id}
              style={{
                padding: '5px 10px', cursor: 'pointer',
                fontSize: 11, color: '#aaa', whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#00ff88' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa' }}
              onClick={() => { openNewTab(c); setShowNewTabMenu(false) }}
            >▸ {c.label}</div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
