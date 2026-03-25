# Claude Channel Server for ClawCom

This MCP server bridges the **ClawCom** chat interface in the Vibe and Conquer dashboard with a live **Claude Code** session running on your machine.

## Architecture

```
ClawCom Chat UI  →  gh-ctrl backend  →  MCP server  →  Claude Code session
                          ↑                   ↑
                       HTTP POST          stdio transport
                  (POST /api/buildings/:id/messages)
```

Claude's replies flow back via **Server-Sent Events (SSE)**:

```
Claude Code  →  reply tool  →  MCP server  →  SSE  →  backend proxy  →  browser
```

## Prerequisites

| Requirement | Notes |
|---|---|
| Claude Code v2.1.80+ | Required for Channels support |
| claude.ai login | `claude login` |
| `--dangerously-load-development-channels` | Required during research preview |
| Enterprise orgs | Admin must enable "Channels" in `claude.ai → Admin → Claude Code` |

## Usage

### 1. Start the MCP server

From the `gh-ctrl` directory:

```bash
claude --dangerously-load-development-channels \
  server:./src/mcp/claude-channel-server.ts
```

Or via `.mcp.json` (see below):

```bash
claude --dangerously-load-development-channels
```

### 2. Configure a ClawCom building

1. Open the **Battlefield** in the dashboard
2. Click a **ClawCom** building → **Setup**
3. Select **✦ CLAUDE** as the Claw Type
4. Set **MCP Webhook URL** to `http://localhost:8788` (or your custom `PORT`)
5. Optionally set a **Channel Secret** (must match `CHANNEL_SECRET` env var)
6. Click **✓ KONFIGURIEREN**

### 3. Chat

Click the building to open the chat dialog. Messages you send appear in Claude's active session. Claude's replies stream back in real time.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8788` | HTTP port the server listens on |
| `CHANNEL_SECRET` | _(none)_ | Shared secret sent in `X-Channel-Secret` header |

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `POST /` | Receive a message from ClawCom, forward to Claude |
| `GET /events` | SSE stream — Claude's replies |
| `GET /status` | Health check |
| `POST /permission` | Submit a permission verdict (allow/deny) |

## MCP Tools registered

| Tool | Description |
|---|---|
| `reply` | Claude calls this to send a message back to ClawCom |
| `approve_permission` | Approve a pending tool-call permission request |
| `deny_permission` | Deny a pending tool-call permission request |

## Permission Relay

When **Permission Relay** is enabled in the ClawCom setup, tool-call requests that Claude wants to execute will appear as approval prompts in the chat dialog. Click **✓ ERLAUBEN** or **✕ ABLEHNEN** to decide.
