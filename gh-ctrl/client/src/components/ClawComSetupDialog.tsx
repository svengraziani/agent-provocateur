import { useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ClawComConfig } from '../types'
import { BaseDialog } from './BaseDialog'

interface ClawComSetupDialogProps {
  building: Building
  onClose: () => void
  onConfigured: (updated: Building) => void
  onError: (msg: string) => void
}

export function ClawComSetupDialog({ building, onClose, onConfigured, onError }: ClawComSetupDialogProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)

  let existingConfig: Partial<ClawComConfig> = {}
  try { existingConfig = JSON.parse(building.config) } catch { /* empty */ }

  const [clawType, setClawType] = useState<ClawComConfig['clawType']>(existingConfig.clawType ?? 'openclaw')
  const [host, setHost] = useState(existingConfig.host ?? '')
  const [mcpWebhookUrl, setMcpWebhookUrl] = useState(existingConfig.mcpWebhookUrl ?? 'http://localhost:8788')
  const [channelSecret, setChannelSecret] = useState(existingConfig.channelSecret ?? '')
  const [enablePermissionRelay, setEnablePermissionRelay] = useState(existingConfig.enablePermissionRelay ?? false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const isChannel = clawType === 'claudechannel'

  async function handleSave() {
    if (isChannel) {
      if (!mcpWebhookUrl.trim()) {
        onError('MCP Webhook URL is required')
        return
      }
    } else {
      if (!host.trim()) {
        onError('Host URL is required')
        return
      }
    }

    setSaving(true)
    try {
      const config: ClawComConfig = isChannel
        ? {
            clawType,
            host: '',
            configured: true,
            mcpWebhookUrl: mcpWebhookUrl.trim(),
            channelSecret: channelSecret.trim() || undefined,
            enablePermissionRelay,
          }
        : { clawType, host: host.trim(), configured: true }

      const updated = await api.updateBuilding(building.id, { config })
      await loadBuildings()
      onConfigured(updated)
    } catch (err: any) {
      onError(`Configuration failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    const testUrl = isChannel ? mcpWebhookUrl : host
    if (!testUrl.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${testUrl.trim().replace(/\/$/, '')}/status`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        setTestResult('✓ Connection successful!')
      } else {
        setTestResult(`✗ Error: HTTP ${res.status}`)
      }
    } catch (err: any) {
      setTestResult(`✗ Unreachable: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <BaseDialog className="map-dialog" onClose={onClose}>
        <div className="map-dialog-title">&#x25a0; {building.name.toUpperCase()} — SETUP</div>

        <div className="clawcom-setup-body">
          <img
            src="/buildings/clawcom.png"
            alt="ClawCom"
            className="clawcom-setup-preview-img"
          />
          <div className="clawcom-setup-form">
            <div className="clawcom-setup-desc">
              {isChannel
                ? 'Connect ClawCom to a running Claude Code session via the Claude Channels MCP protocol.'
                : 'Configure the connection to an Openclaw or Nanoclaw. Once set up, you can send and receive commands via the integrated chat window.'}
            </div>

            <div className="clawcom-setup-group">
              <label className="clawcom-setup-group-label">Claw Type</label>
              <div className="clawcom-setup-row">
                {(['openclaw', 'nanoclaw', 'claudechannel'] as const).map((t) => (
                  <button
                    key={t}
                    className={`hud-btn${clawType === t ? ' active' : ''}`}
                    onClick={() => setClawType(t)}
                  >
                    {t === 'openclaw' ? '⚙ OPENCLAW' : t === 'nanoclaw' ? '⬡ NANOCLAW' : '✦ CLAUDE'}
                  </button>
                ))}
              </div>
            </div>

            {isChannel ? (
              <>
                <div className="clawcom-setup-group">
                  <label className="clawcom-setup-group-label">MCP Webhook URL</label>
                  <div className="clawcom-setup-row">
                    <input
                      className="hud-input"
                      value={mcpWebhookUrl}
                      onChange={(e) => setMcpWebhookUrl(e.target.value)}
                      placeholder="http://localhost:8788"
                    />
                    <button
                      className="hud-btn"
                      onClick={handleTest}
                      disabled={testing || !mcpWebhookUrl.trim()}
                      title="Test connection"
                    >
                      {testing ? '◌' : 'TEST'}
                    </button>
                  </div>
                  {testResult && (
                    <div className={`clawcom-test-result ${testResult.startsWith('✓') ? 'clawcom-test-result--ok' : 'clawcom-test-result--err'}`}>
                      {testResult}
                    </div>
                  )}
                </div>

                <div className="clawcom-setup-group">
                  <label className="clawcom-setup-group-label">Channel Secret <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
                  <div className="clawcom-setup-row">
                    <input
                      className="hud-input"
                      type="password"
                      value={channelSecret}
                      onChange={(e) => setChannelSecret(e.target.value)}
                      placeholder="Leave blank = no auth"
                    />
                  </div>
                </div>

                <div className="clawcom-setup-group">
                  <label className="clawcom-setup-group-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enablePermissionRelay}
                      onChange={(e) => setEnablePermissionRelay(e.target.checked)}
                      style={{ accentColor: 'var(--green-neon)' }}
                    />
                    Enable Permission Relay
                  </label>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                    Tool calls from Claude must be confirmed in the chat.
                  </div>
                </div>

                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
                  Start the MCP Server with:<br />
                  <code style={{ color: 'var(--green-neon)' }}>
                    claude --dangerously-load-development-channels server:./src/mcp/claude-channel-server.ts
                  </code>
                </div>
              </>
            ) : (
              <div className="clawcom-setup-group">
                <label className="clawcom-setup-group-label">Host URL</label>
                <div className="clawcom-setup-row">
                  <input
                    className="hud-input"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="http://192.168.1.100:8080"
                  />
                  <button
                    className="hud-btn"
                    onClick={handleTest}
                    disabled={testing || !host.trim()}
                    title="Verbindung testen"
                  >
                    {testing ? '◌' : 'TEST'}
                  </button>
                </div>
                {testResult && (
                  <div className={`clawcom-test-result ${testResult.startsWith('✓') ? 'clawcom-test-result--ok' : 'clawcom-test-result--err'}`}>
                    {testResult}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="map-dialog-actions">
          <button className="hud-btn" onClick={onClose}>CANCEL</button>
          <button
            className="hud-btn hud-btn-new-base"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '◌ SAVING...' : '✓ CONFIGURE'}
          </button>
        </div>
    </BaseDialog>
  )
}
