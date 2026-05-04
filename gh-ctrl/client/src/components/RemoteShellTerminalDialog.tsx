import { useState, useEffect } from 'react'
import { api } from '../api'
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

  const config: Partial<RemoteShellConfig> = (() => {
    try { return JSON.parse(building.config) } catch { return {} }
  })()

  useEffect(() => {
    let cancelled = false
    api.listShellConnections(building.id)
      .then((conns) => {
        if (cancelled) return
        setConnections(conns)
        // Open default (or first) connection as the initial tab
        const defaultConn = conns.find((c) => c.id === config.defaultConnectionId) ?? conns[0]
        if (defaultConn) {
          const firstTab: TabSession = { id: `tab-${Date.now()}`, connection: defaultConn }
          setTabs([firstTab])
          setActiveTabId(firstTab.id)
        }
      })
      .catch(() => { if (!cancelled) addToast('Failed to load connections', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id])

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
              <>
                <button
                  className="hud-btn"
                  style={{ fontSize: 11, padding: '2px 8px', color: showNewTabMenu ? '#00ff88' : '#888' }}
                  title="Open new tab"
                  onClick={(e) => { e.stopPropagation(); setShowNewTabMenu((v) => !v) }}
                >+ TAB ▾</button>
                {showNewTabMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 2,
                    background: '#111', border: '1px solid #333', borderRadius: 3,
                    zIndex: 200, minWidth: 160,
                  }}>
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
                  </div>
                )}
              </>
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
            />
          </div>
        ))}
      </div>
    </div>
  )
}
