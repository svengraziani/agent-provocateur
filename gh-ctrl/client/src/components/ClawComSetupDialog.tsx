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
  const hasExistingToken = Boolean(existingConfig.githubToken)
  const [githubToken, setGithubToken] = useState('')
  const [copilotModel, setCopilotModel] = useState(existingConfig.copilotModel ?? 'gpt-4o')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const isChannel = clawType === 'claudechannel'
  const isCopilot = clawType === 'copilot'

  async function handleSave() {
    if (isCopilot) {
      if (!githubToken.trim() && !hasExistingToken) {
        onError('GitHub Token is required')
        return
      }
    } else if (isChannel) {
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
      const config: ClawComConfig = isCopilot
        ? {
            clawType,
            host: '',
            configured: true,
            githubToken: githubToken.trim() || existingConfig.githubToken,
            copilotModel: copilotModel || 'gpt-4o',
          }
        : isChannel
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

  async function handleCopilotTest() {
    if (!githubToken.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const data = await api.copilotTest(githubToken.trim(), copilotModel || 'gpt-4o')
      if (data.ok) {
        setTestResult('✓ Token valid — Copilot API reachable!')
        if (data.models?.length) setAvailableModels(data.models)
      } else {
        setTestResult(`✗ Error: ${data.error}`)
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
              {isCopilot
                ? 'Connect ClawCom to GitHub Copilot. Requires a GitHub OAuth token — Personal Access Tokens are not supported. Run `gh auth token` in your terminal to get the right token.'
                : isChannel
                ? 'Connect ClawCom to a running Claude Code session via the Claude Channels MCP protocol.'
                : 'Configure the connection to an Openclaw or Nanoclaw. Once set up, you can send and receive commands via the integrated chat window.'}
            </div>

            <div className="clawcom-setup-group">
              <label className="clawcom-setup-group-label">Claw Type</label>
              <div className="clawcom-setup-row">
                {(['openclaw', 'nanoclaw', 'claudechannel', 'copilot'] as const).map((t) => (
                  <button
                    key={t}
                    className={`hud-btn${clawType === t ? ' active' : ''}`}
                    onClick={() => { setClawType(t); setTestResult(null) }}
                  >
                    {t === 'openclaw' ? '⚙ OPENCLAW' : t === 'nanoclaw' ? '⬡ NANOCLAW' : t === 'claudechannel' ? '✦ CLAUDE' : '◎ COPILOT'}
                  </button>
                ))}
              </div>
            </div>

            {isCopilot ? (
              <>
                <div className="clawcom-setup-group">
                  <label className="clawcom-setup-group-label">GitHub OAuth Token <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(run: gh auth token)</span></label>
                  <div className="clawcom-setup-row">
                    <input
                      className="hud-input"
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder={hasExistingToken ? '●●●●●●●● (leave blank to keep existing)' : 'gho_... (OAuth, not a PAT)'}
                    />
                    <button
                      className="hud-btn"
                      onClick={handleCopilotTest}
                      disabled={testing || !githubToken.trim()}
                      title="Test token"
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
                  <label className="clawcom-setup-group-label">Model {availableModels.length === 0 && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(test token to load available models)</span>}</label>
                  <select
                    className="hud-input"
                    value={copilotModel}
                    onChange={(e) => setCopilotModel(e.target.value)}
                  >
                    {availableModels.length > 0
                      ? availableModels.map((m) => <option key={m} value={m}>{m}</option>)
                      : (
                        <>
                          <option value="gpt-4o">gpt-4o</option>
                          <option value="gpt-4o-mini">gpt-4o-mini</option>
                        </>
                      )
                    }
                  </select>
                </div>

                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
                  Requires a GitHub Copilot subscription. PATs are rejected — use the OAuth token from <code style={{ background: 'rgba(255,255,255,0.07)', padding: '0 4px', borderRadius: 2 }}>gh auth token</code>.
                </div>
              </>
            ) : isChannel ? (
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
