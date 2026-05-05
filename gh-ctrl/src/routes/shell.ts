import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { db } from '../db'
import { buildings, sshConnections, sshSessionLog } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'

const { upgradeWebSocket, websocket: shellWebsocket } = createBunWebSocket()
export { shellWebsocket }

const app = new Hono()

// ── Credential encryption (AES-256-GCM) ─────────────────────────────────────

const ALGO = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const secret = process.env.SHELL_SECRET ?? 'default-insecure-key-change-me'
  return createHash('sha256').update(secret).digest()
}

function encryptCreds(plain: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = (cipher as any).getAuthTag() as Buffer
  return JSON.stringify({
    iv:   iv.toString('hex'),
    tag:  tag.toString('hex'),
    data: encrypted.toString('hex'),
  })
}

function decryptCreds(stored: string): string {
  const key = getEncryptionKey()
  const { iv, tag, data } = JSON.parse(stored)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'))
  ;(decipher as any).setAuthTag(Buffer.from(tag, 'hex'))
  return (decipher.update(Buffer.from(data, 'hex')) as Buffer).toString('utf8') + decipher.final('utf8')
}

// Return profile without secret fields
function maskProfile(p: typeof sshConnections.$inferSelect) {
  const { encryptedCreds: _, ...rest } = p
  return { ...rest, hasCredentials: !!_ }
}

// Building types that own SSH connection profiles (RemoteShell + ClawCom share this UI)
const SHELL_BUILDING_TYPES = new Set(['remoteShell', 'clawcom'])

// ── Connection profile CRUD ──────────────────────────────────────────────────

// GET /:id/shell/connections — list connection profiles for building
app.get('/:id/shell/connections', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1)
  if (building.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (!SHELL_BUILDING_TYPES.has(building[0].type)) return c.json({ error: 'Building does not support shell connections' }, 400)

  const profiles = await db.select().from(sshConnections)
    .where(eq(sshConnections.buildingId, buildingId))
    .orderBy(sshConnections.createdAt)
  return c.json(profiles.map(maskProfile))
})

// POST /:id/shell/connections — create a connection profile
app.post('/:id/shell/connections', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1)
  if (building.length === 0) return c.json({ error: 'Building not found' }, 404)
  if (!SHELL_BUILDING_TYPES.has(building[0].type)) return c.json({ error: 'Building does not support shell connections' }, 400)

  const body = await c.req.json()
  const { label, host, port = 22, username, authType = 'password', password, privateKey, tmuxSession } = body

  if (!label?.trim() || !host?.trim() || !username?.trim()) {
    return c.json({ error: 'label, host and username are required' }, 400)
  }

  let encryptedCreds: string | null = null
  if (authType === 'password' && password) {
    encryptedCreds = encryptCreds(JSON.stringify({ password }))
  } else if (authType === 'key' && privateKey) {
    encryptedCreds = encryptCreds(JSON.stringify({ privateKey }))
  }

  const safeTmux = tmuxSession ? tmuxSession.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : null

  const [created] = await db.insert(sshConnections).values({
    buildingId,
    label: String(label).trim(),
    host:  String(host).trim(),
    port:  Number(port) || 22,
    username: String(username).trim(),
    authType: String(authType),
    encryptedCreds,
    tmuxSession: safeTmux,
  }).returning()

  // Mark building as configured
  const existingConfig = (() => { try { return JSON.parse(building[0].config ?? '{}') } catch { return {} } })()
  if (!existingConfig.configured) {
    await db.update(buildings).set({
      config: JSON.stringify({ ...existingConfig, configured: true }),
      updatedAt: new Date(),
    }).where(eq(buildings.id, buildingId))
  }

  return c.json(maskProfile(created), 201)
})

// PATCH /:id/shell/connections/:cid — update a connection profile
app.patch('/:id/shell/connections/:cid', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const cid        = Number(c.req.param('cid'))

  const existing = await db.select().from(sshConnections)
    .where(and(eq(sshConnections.id, cid), eq(sshConnections.buildingId, buildingId)))
    .limit(1)
  if (existing.length === 0) return c.json({ error: 'Connection not found' }, 404)

  const body = await c.req.json()
  const updates: Partial<typeof sshConnections.$inferInsert> = { updatedAt: new Date() }

  if (body.label    !== undefined) updates.label    = String(body.label).trim()
  if (body.host     !== undefined) updates.host     = String(body.host).trim()
  if (body.port     !== undefined) updates.port     = Number(body.port) || 22
  if (body.username !== undefined) updates.username = String(body.username).trim()
  if (body.authType !== undefined) updates.authType = String(body.authType)
  if (body.tmuxSession !== undefined) {
    updates.tmuxSession = body.tmuxSession
      ? String(body.tmuxSession).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
      : null
  }

  if (body.password) {
    updates.encryptedCreds = encryptCreds(JSON.stringify({ password: body.password }))
  } else if (body.privateKey) {
    updates.encryptedCreds = encryptCreds(JSON.stringify({ privateKey: body.privateKey }))
  }

  const [updated] = await db.update(sshConnections).set(updates)
    .where(eq(sshConnections.id, cid)).returning()
  return c.json(maskProfile(updated))
})

// DELETE /:id/shell/connections/:cid — delete a connection profile
app.delete('/:id/shell/connections/:cid', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const cid        = Number(c.req.param('cid'))

  const existing = await db.select().from(sshConnections)
    .where(and(eq(sshConnections.id, cid), eq(sshConnections.buildingId, buildingId)))
    .limit(1)
  if (existing.length === 0) return c.json({ error: 'Connection not found' }, 404)

  await db.delete(sshConnections).where(eq(sshConnections.id, cid))

  // If no connections remain, mark building as unconfigured
  const remaining = await db.select().from(sshConnections)
    .where(eq(sshConnections.buildingId, buildingId))
    .limit(1)
  if (remaining.length === 0) {
    const bldg = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1)
    if (bldg.length > 0) {
      const cfg = (() => { try { return JSON.parse(bldg[0].config ?? '{}') } catch { return {} } })()
      await db.update(buildings).set({
        config: JSON.stringify({ ...cfg, configured: false }),
        updatedAt: new Date(),
      }).where(eq(buildings.id, buildingId))
    }
  }

  return c.json({ ok: true })
})

// POST /:id/shell/connections/test — test a connection without opening a PTY
app.post('/:id/shell/connections/test', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const building = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1)
  if (building.length === 0) return c.json({ error: 'Building not found' }, 404)

  const body = await c.req.json()
  const { host, port = 22, username, authType = 'password', password, privateKey } = body

  if (!host?.trim() || !username?.trim()) {
    return c.json({ ok: false, error: 'host and username are required' }, 400)
  }

  return new Promise((resolve) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      resolve(c.json({ ok: false, error: 'Connection timed out after 10 seconds' }))
    }, 10_000)

    conn.on('ready', () => {
      clearTimeout(timeout)
      conn.end()
      resolve(c.json({ ok: true }))
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message }))
    })

    const config: ConnectConfig = {
      host:     String(host).trim(),
      port:     Number(port) || 22,
      username: String(username).trim(),
      readyTimeout: 10_000,
    }

    if (authType === 'password' && password) {
      config.password = String(password)
    } else if (authType === 'key' && privateKey) {
      config.privateKey = String(privateKey)
    }

    try {
      conn.connect(config)
    } catch (err: any) {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message }))
    }
  })
})

// GET /:id/shell/history — connection history (last 50)
app.get('/:id/shell/history', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const rows = await db.select().from(sshSessionLog)
    .where(eq(sshSessionLog.buildingId, buildingId))
    .orderBy(desc(sshSessionLog.connectedAt))
    .limit(50)
  return c.json(rows)
})

// GET /:id/shell/connections/:cid/tmux-sessions — list active tmux sessions on remote
app.get('/:id/shell/connections/:cid/tmux-sessions', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const cid        = Number(c.req.param('cid'))

  const profiles = await db.select().from(sshConnections)
    .where(and(eq(sshConnections.id, cid), eq(sshConnections.buildingId, buildingId)))
    .limit(1)
  if (profiles.length === 0) return c.json({ error: 'Connection not found' }, 404)

  const profile = profiles[0]
  let creds: { password?: string; privateKey?: string } = {}
  if (profile.encryptedCreds) {
    try { creds = JSON.parse(decryptCreds(profile.encryptedCreds)) } catch { /* ignore */ }
  }

  return new Promise((resolve) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      resolve(c.json({ ok: false, error: 'Connection timed out', sessions: [] }))
    }, 10_000)

    conn.on('ready', () => {
      conn.exec('tmux ls 2>/dev/null || echo "__NO_TMUX__"', (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          resolve(c.json({ ok: false, error: err.message, sessions: [] }))
          return
        }
        let output = ''
        stream.on('data', (data: Buffer) => { output += data.toString() })
        stream.stderr.on('data', (data: Buffer) => { output += data.toString() })
        stream.on('close', () => {
          clearTimeout(timeout)
          conn.end()
          if (output.includes('__NO_TMUX__') || output.includes('no server running')) {
            resolve(c.json({ ok: true, sessions: [] }))
            return
          }
          const sessions = output.trim().split('\n')
            .filter((line) => line.trim() && !line.startsWith('error:'))
            .map((line) => {
              const match = line.match(/^([^:]+):/)
              return match ? match[1].trim() : line.trim()
            })
            .filter(Boolean)
          resolve(c.json({ ok: true, sessions }))
        })
      })
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message, sessions: [] }))
    })

    const authOptions: ConnectConfig = {
      host:         profile.host,
      port:         profile.port ?? 22,
      username:     profile.username,
      readyTimeout: 10_000,
    }
    if (profile.authType === 'key' && creds.privateKey) {
      authOptions.privateKey = creds.privateKey
    } else if (creds.password) {
      authOptions.password = creds.password
    }

    try { conn.connect(authOptions) } catch (err: any) {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message, sessions: [] }))
    }
  })
})

// GET /:id/shell/connections/:cid/tmux-windows — list windows in a tmux session
app.get('/:id/shell/connections/:cid/tmux-windows', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const cid        = Number(c.req.param('cid'))
  const session    = c.req.query('session') ?? null

  const profiles = await db.select().from(sshConnections)
    .where(and(eq(sshConnections.id, cid), eq(sshConnections.buildingId, buildingId)))
    .limit(1)
  if (profiles.length === 0) return c.json({ error: 'Connection not found' }, 404)

  const profile = profiles[0]
  let creds: { password?: string; privateKey?: string } = {}
  if (profile.encryptedCreds) {
    try { creds = JSON.parse(decryptCreds(profile.encryptedCreds)) } catch { /* ignore */ }
  }

  const targetSession = session ?? profile.tmuxSession ?? null
  const safeSession   = targetSession ? targetSession.replace(/[^a-zA-Z0-9_-]/g, '') : null
  const cmd = safeSession
    ? `tmux list-windows -t '${safeSession}' -F '#{window_index} #{window_name} #{window_active}' 2>/dev/null || echo "__NO_TMUX__"`
    : `tmux list-windows -F '#{window_index} #{window_name} #{window_active}' 2>/dev/null || echo "__NO_TMUX__"`

  return new Promise((resolve) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      resolve(c.json({ ok: false, error: 'Connection timed out', windows: [] }))
    }, 10_000)

    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          resolve(c.json({ ok: false, error: err.message, windows: [] }))
          return
        }
        let output = ''
        stream.on('data', (data: Buffer) => { output += data.toString() })
        stream.stderr.on('data', (data: Buffer) => { output += data.toString() })
        stream.on('close', () => {
          clearTimeout(timeout)
          conn.end()
          if (output.includes('__NO_TMUX__') || output.includes('no server running')) {
            resolve(c.json({ ok: true, windows: [] }))
            return
          }
          const windows = output.trim().split('\n')
            .filter((line) => line.trim() && !line.startsWith('error:'))
            .map((line) => {
              // Format: "<index> <name…> <active 0|1>"
              // The name itself can contain spaces, so we anchor on the
              // first token (index) and the last token (active flag) and
              // join everything between them.
              const parts = line.trim().split(' ')
              const index  = parseInt(parts[0] ?? '0', 10)
              const active = parts[parts.length - 1] === '1'
              const name   = parts.slice(1, parts.length - 1).join(' ') || `win${index}`
              return { index, name, active }
            })
            .filter((w) => !isNaN(w.index))
          resolve(c.json({ ok: true, windows }))
        })
      })
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message, windows: [] }))
    })

    const authOptions: ConnectConfig = {
      host:         profile.host,
      port:         profile.port ?? 22,
      username:     profile.username,
      readyTimeout: 10_000,
    }
    if (profile.authType === 'key' && creds.privateKey) {
      authOptions.privateKey = creds.privateKey
    } else if (creds.password) {
      authOptions.password = creds.password
    }

    try { conn.connect(authOptions) } catch (err: any) {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message, windows: [] }))
    }
  })
})

// POST /:id/shell/connections/:cid/tmux-windows/:idx/rename — rename a window
app.post('/:id/shell/connections/:cid/tmux-windows/:idx/rename', async (c) => {
  const buildingId  = Number(c.req.param('id'))
  const cid         = Number(c.req.param('cid'))
  const windowIndex = Number(c.req.param('idx'))

  let body: { name?: string; session?: string } = {}
  try { body = await c.req.json() } catch { /* default */ }
  const rawName = (body.name ?? '').toString()
  // Allow letters, numbers, space, and a small set of punctuation. Anything
  // shell-special (quotes, $, backticks, ;, &, |, etc.) gets dropped so the
  // value can safely be embedded in single quotes.
  const safeName = rawName.replace(/[^a-zA-Z0-9 _.\-:/]/g, '').trim().slice(0, 64)
  if (!safeName) return c.json({ ok: false, error: 'Invalid window name' }, 400)
  if (!Number.isInteger(windowIndex) || windowIndex < 0) {
    return c.json({ ok: false, error: 'Invalid window index' }, 400)
  }

  const profiles = await db.select().from(sshConnections)
    .where(and(eq(sshConnections.id, cid), eq(sshConnections.buildingId, buildingId)))
    .limit(1)
  if (profiles.length === 0) return c.json({ ok: false, error: 'Connection not found' }, 404)

  const profile = profiles[0]
  let creds: { password?: string; privateKey?: string } = {}
  if (profile.encryptedCreds) {
    try { creds = JSON.parse(decryptCreds(profile.encryptedCreds)) } catch { /* ignore */ }
  }

  const targetSession = body.session ?? profile.tmuxSession ?? null
  const safeSession   = targetSession ? targetSession.replace(/[^a-zA-Z0-9_-]/g, '') : null
  if (!safeSession) return c.json({ ok: false, error: 'No tmux session configured' }, 400)

  const cmd = `tmux rename-window -t '${safeSession}:${windowIndex}' '${safeName}' 2>&1`

  return new Promise((resolve) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      resolve(c.json({ ok: false, error: 'Connection timed out' }))
    }, 10_000)

    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          resolve(c.json({ ok: false, error: err.message }))
          return
        }
        let output = ''
        let exitCode: number | null = null
        stream.on('data', (data: Buffer) => { output += data.toString() })
        stream.stderr.on('data', (data: Buffer) => { output += data.toString() })
        stream.on('exit', (code: number) => { exitCode = code })
        stream.on('close', () => {
          clearTimeout(timeout)
          conn.end()
          if (exitCode === 0) {
            resolve(c.json({ ok: true, name: safeName }))
          } else {
            resolve(c.json({ ok: false, error: output.trim() || `tmux exited ${exitCode}` }))
          }
        })
      })
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message }))
    })

    const authOptions: ConnectConfig = {
      host:         profile.host,
      port:         profile.port ?? 22,
      username:     profile.username,
      readyTimeout: 10_000,
    }
    if (profile.authType === 'key' && creds.privateKey) {
      authOptions.privateKey = creds.privateKey
    } else if (creds.password) {
      authOptions.password = creds.password
    }

    try { conn.connect(authOptions) } catch (err: any) {
      clearTimeout(timeout)
      resolve(c.json({ ok: false, error: err.message }))
    }
  })
})

// ── WebSocket PTY bridge ─────────────────────────────────────────────────────

app.get(
  '/:id/shell/ws',
  upgradeWebSocket(async (c) => {
    const buildingId   = Number(c.req.param('id'))
    const connectionId = Number(c.req.query('connectionId'))

    // Validate building + connection exist before the WS handshake
    const profiles = await db.select().from(sshConnections)
      .where(and(eq(sshConnections.id, connectionId), eq(sshConnections.buildingId, buildingId)))
      .limit(1)

    if (profiles.length === 0) {
      return {
        onOpen(_evt: Event, ws: any) {
          ws.send(JSON.stringify({ type: 'status', state: 'error', error: 'Connection profile not found' }))
          ws.close()
        },
      }
    }

    const profile = profiles[0]
    let creds: { password?: string; privateKey?: string } = {}
    if (profile.encryptedCreds) {
      try { creds = JSON.parse(decryptCreds(profile.encryptedCreds)) } catch { /* ignore */ }
    }

    // Session state — closed over per WebSocket connection
    let sshStream: any = null
    let sshConn:   any = null
    let logEntryId: number | null = null
    const connectTime = Date.now()

    return {
      async onOpen(_evt: Event, ws: any) {
        // Log session start
        try {
          const [entry] = await db.insert(sshSessionLog).values({
            buildingId,
            connectionId,
            connectionLabel: profile.label,
          }).returning()
          logEntryId = entry.id
        } catch { /* log failure is non-fatal */ }

        const conn = new Client()
        sshConn = conn

        const authOptions: ConnectConfig = {
          host:         profile.host,
          port:         profile.port ?? 22,
          username:     profile.username,
          readyTimeout: 15_000,
        }

        if (profile.authType === 'key' && creds.privateKey) {
          authOptions.privateKey = creds.privateKey
        } else if (creds.password) {
          authOptions.password = creds.password
        }

        conn.on('ready', () => {
          console.log(`[shell] SSH ready for building ${buildingId} conn ${connectionId}, opening PTY`)
          conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err: Error | null, stream: any) => {
            if (err) {
              console.error(`[shell] PTY open error for building ${buildingId}:`, err.message)
              ws.send(JSON.stringify({ type: 'status', state: 'error', error: err.message }))
              ws.close()
              return
            }
            sshStream = stream

            if (profile.tmuxSession) {
              const safe = profile.tmuxSession.replace(/[^a-zA-Z0-9_-]/g, '')
              stream.write(`tmux new-session -A -s ${safe}\r`)
            }

            ws.send(JSON.stringify({ type: 'status', state: 'connected' }))

            stream.on('data', (data: Buffer) => {
              try { ws.send(data) } catch { /* client gone */ }
            })

            stream.stderr?.on('data', (data: Buffer) => {
              try { ws.send(data) } catch { /* client gone */ }
            })

            stream.on('close', () => {
              ws.send(JSON.stringify({ type: 'status', state: 'disconnected' }))
              ws.close()
            })
          })
        })

        conn.on('error', (err: Error) => {
          console.error(`[shell] SSH error for building ${buildingId} conn ${connectionId}:`, err.message)
          try {
            ws.send(JSON.stringify({ type: 'status', state: 'error', error: err.message }))
            ws.close()
          } catch { /* ignore */ }
        })

        try {
          conn.connect(authOptions)
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'status', state: 'error', error: err.message }))
          ws.close()
        }
      },

      onMessage(evt: MessageEvent, _ws: any) {
        if (!sshStream) return
        const { data } = evt
        if (typeof data === 'string') {
          // Only treat the message as a control envelope when it looks like one
          // (`{...}` with a known `type`). JSON.parse succeeds on bare values like
          // "1", "true", "null" — those are keystrokes, not control messages.
          let handled = false
          if (data.length > 0 && data.charCodeAt(0) === 0x7B /* '{' */) {
            try {
              const msg = JSON.parse(data)
              if (msg && typeof msg === 'object' && !Array.isArray(msg) && typeof msg.type === 'string') {
                if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
                  sshStream.setWindow?.(msg.rows, msg.cols, 0, 0)
                }
                handled = true
              }
            } catch { /* malformed JSON — fall through to keystroke forward */ }
          }
          if (!handled) sshStream.write(data)
        } else if (data instanceof ArrayBuffer) {
          sshStream.write(Buffer.from(data))
        } else if (data instanceof Uint8Array) {
          sshStream.write(Buffer.from(data))
        }
      },

      onClose() {
        sshConn?.end()
        if (logEntryId !== null) {
          const durationMs = Date.now() - connectTime
          db.update(sshSessionLog)
            .set({ disconnectedAt: new Date(), durationMs })
            .where(eq(sshSessionLog.id, logEntryId!))
            .catch(() => { /* non-fatal */ })
        }
      },
    }
  })
)

export default app
