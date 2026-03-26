#!/usr/bin/env bun
/**
 * Claude Channel Server for ClawCom
 *
 * This MCP server bridges the ClawCom chat UI with a live Claude Code session.
 * It connects to Claude Code over stdio (as an MCP server) while simultaneously
 * running an HTTP server that the gh-ctrl backend can reach.
 *
 * Usage (requires Claude Code v2.1.80+ and claude.ai login):
 *   claude --dangerously-load-development-channels \
 *     server:./src/mcp/claude-channel-server.ts
 *
 * Environment variables:
 *   PORT              HTTP port (default: 8788)
 *   CHANNEL_SECRET    Shared secret for request authentication (optional)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const PORT = Number(process.env.PORT ?? 8788)
const CHANNEL_SECRET = process.env.CHANNEL_SECRET ?? ''

// ── SSE client registry ───────────────────────────────────────────────────────

interface SseClient {
  id: string
  write: (chunk: Uint8Array) => void
}

const sseClients = new Map<string, SseClient>()

function broadcastSse(event: object) {
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
  for (const [id, client] of sseClients) {
    try {
      client.write(encoded)
    } catch {
      sseClients.delete(id)
    }
  }
}

// ── Pending permission requests ───────────────────────────────────────────────

interface PendingPermission {
  resolve: (verdict: 'allow' | 'deny') => void
  timer: ReturnType<typeof setTimeout>
}

const pendingPermissions = new Map<string, PendingPermission>()

// ── MCP Server (stdio transport — connects to Claude Code) ────────────────────

const server = new Server(
  { name: 'claude-channel-server', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description:
        'Send a reply message back to the ClawCom chat interface. Use this to respond to messages sent from the dashboard.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The reply text to display in the ClawCom chat bubble',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'approve_permission',
      description:
        'Approve a pending tool-call permission request that was forwarded from the ClawCom dashboard.',
      inputSchema: {
        type: 'object',
        properties: {
          permissionId: {
            type: 'string',
            description: 'The permission request ID to approve',
          },
        },
        required: ['permissionId'],
      },
    },
    {
      name: 'deny_permission',
      description:
        'Deny a pending tool-call permission request that was forwarded from the ClawCom dashboard.',
      inputSchema: {
        type: 'object',
        properties: {
          permissionId: {
            type: 'string',
            description: 'The permission request ID to deny',
          },
        },
        required: ['permissionId'],
      },
    },
  ],
}))

// Handle tool calls from Claude
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args ?? {}) as Record<string, unknown>

  if (name === 'reply') {
    const content = String(a.content ?? '')
    if (!content) {
      return { content: [{ type: 'text', text: 'Error: content is required' }], isError: true }
    }
    broadcastSse({ type: 'reply', content })
    return {
      content: [{ type: 'text', text: `Reply forwarded to ClawCom (${content.length} chars)` }],
    }
  }

  if (name === 'approve_permission') {
    const permissionId = String(a.permissionId ?? '')
    const pending = pendingPermissions.get(permissionId)
    if (!pending) {
      return { content: [{ type: 'text', text: `No pending permission with id: ${permissionId}` }], isError: true }
    }
    clearTimeout(pending.timer)
    pending.resolve('allow')
    pendingPermissions.delete(permissionId)
    broadcastSse({ type: 'permission_resolved', id: permissionId, verdict: 'allow' })
    return { content: [{ type: 'text', text: `Permission ${permissionId} approved` }] }
  }

  if (name === 'deny_permission') {
    const permissionId = String(a.permissionId ?? '')
    const pending = pendingPermissions.get(permissionId)
    if (!pending) {
      return { content: [{ type: 'text', text: `No pending permission with id: ${permissionId}` }], isError: true }
    }
    clearTimeout(pending.timer)
    pending.resolve('deny')
    pendingPermissions.delete(permissionId)
    broadcastSse({ type: 'permission_resolved', id: permissionId, verdict: 'deny' })
    return { content: [{ type: 'text', text: `Permission ${permissionId} denied` }] }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

// ── HTTP Server (for ClawCom backend communication) ───────────────────────────

function checkSecret(req: Request): Response | null {
  if (!CHANNEL_SECRET) return null
  const header = req.headers.get('x-channel-secret')
  if (header !== CHANNEL_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

const httpServer = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-channel-secret',
        },
      })
    }

    const authErr = checkSecret(req)
    if (authErr) return authErr

    // POST / — receive a message from ClawCom and forward to Claude via channel notification
    if (req.method === 'POST' && url.pathname === '/') {
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const content = String(body.content ?? '').trim()
      if (!content) {
        return new Response(JSON.stringify({ error: 'content is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      try {
        // Push the message into Claude's active session as a channel notification
        await server.notification({
          method: 'notifications/claude/channel',
          params: {
            content: [{ type: 'text', text: content }],
          },
        } as any)
      } catch (err) {
        console.error('[channel] Failed to send notification to Claude:', err)
        return new Response(JSON.stringify({ error: 'Claude session not reachable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // POST /permission — receive a permission verdict from the ClawCom UI
    if (req.method === 'POST' && url.pathname === '/permission') {
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const id = String(body.id ?? '')
      const verdict = body.verdict as string

      if (!id || !['allow', 'deny'].includes(verdict)) {
        return new Response(JSON.stringify({ error: 'id and verdict (allow|deny) required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const pending = pendingPermissions.get(id)
      if (!pending) {
        return new Response(JSON.stringify({ error: 'Permission request not found or expired' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      clearTimeout(pending.timer)
      pending.resolve(verdict as 'allow' | 'deny')
      pendingPermissions.delete(id)
      broadcastSse({ type: 'permission_resolved', id, verdict })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // GET /events — SSE stream; Claude replies are pushed here as they arrive
    if (req.method === 'GET' && url.pathname === '/events') {
      const clientId = crypto.randomUUID()
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
          const initial = new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`
          )
          controller.enqueue(initial)

          sseClients.set(clientId, {
            id: clientId,
            write: (chunk) => {
              try {
                controller.enqueue(chunk)
              } catch {
                sseClients.delete(clientId)
              }
            },
          })
        },
        cancel() {
          sseClients.delete(clientId)
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // GET /status — health check endpoint (also used by ClawCom "TEST" button)
    if (req.method === 'GET' && url.pathname === '/status') {
      return new Response(
        JSON.stringify({ ok: true, sseClients: sseClients.size, pendingPermissions: pendingPermissions.size }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

// ── Start ─────────────────────────────────────────────────────────────────────

console.error(`[claude-channel-server] HTTP server listening on port ${PORT}`)
console.error(`[claude-channel-server] Connecting to Claude Code via stdio...`)

const transport = new StdioServerTransport()
await server.connect(transport)
