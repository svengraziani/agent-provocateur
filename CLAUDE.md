# CLAUDE.md - Project Context for Claude Code

## Project Overview

**Vibe and Conquer** (`gh-ctrl`) is a self-hosted GitHub & GitLab Command Center dashboard built with Bun, Hono, React 18, and SQLite. It aggregates activity across multiple repositories into a unified interface with a gamified "Battlefield" visualization, deployable buildings (AI chat, health monitoring, email), and Claude AI integration.

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono (port 3001)
- **Frontend**: React 18 + Vite (port 5173 in dev)
- **Database**: SQLite + Drizzle ORM
- **GitHub Integration**: GitHub CLI (`gh`)
- **GitLab Integration**: REST API (supports self-hosted instances)
- **State Management**: Zustand
- **Auth (optional)**: Keycloak (OAuth2 / OpenID Connect)

## Project Structure

```
gh-ctrl/                    # Main application
├── src/                    # Backend (Hono server)
│   ├── index.ts            # Server entry point
│   ├── db/                 # Database schema + setup (Drizzle ORM)
│   └── routes/
│       ├── github.ts       # GitHub data fetching (SSE streaming, actions, PRs, issues)
│       ├── gitlab.ts       # GitLab REST API integration
│       ├── repos.ts        # Repository CRUD
│       ├── maps.ts         # Map CRUD (tile maps for Battlefield)
│       ├── buildings.ts    # Building CRUD + ClawCom chat, Healthcheck, Mailbox
│       ├── badges.ts       # Badge upload, library, and placement
│       └── timers.ts       # Deadline timer CRUD
├── client/                 # Frontend (React + Vite)
│   └── src/
│       ├── components/     # React components
│       ├── hooks/          # Custom hooks (sound, voice, camera, draggables, auth)
│       ├── store.ts        # Zustand store
│       ├── api.ts          # API client
│       └── types.ts        # TypeScript interfaces
├── package.json
└── drizzle.config.ts
```

## Key Features

### Multi-Provider Repository Tracking
- GitHub (via `gh` CLI) and GitLab (REST API, self-hosted support) in one dashboard
- Real-time SSE streaming for incremental repo data loading
- Configurable auto-refresh (30s – 30 min)
- PR/issue tracking, branch staleness detection (30/90-day thresholds), conflict warnings

### Battlefield View
- Infinite isometric canvas with pan, zoom, drag-and-drop base repositioning
- HUD, minimap with viewport indicator, sound effects
- Intel Feed Panel with @mentions, issues, PRs across all repos

### Building System
- **ClawCom** — AI agent chat (Claude Channel SSE, OpenClaw, NanoClaw); message history; tool-call permission handling
- **Healthcheck** — HTTP endpoint monitoring with configurable intervals and status tracking
- **Snailbox (Mailbox)** — Full IMAP/SMTP email client with background sync

### Map Editor
- Isometric tile maps (up to 256x256), 10 tile types, paint/erase/flood-fill tools, JSON import/export

### Badge & Decoration System
- Upload custom badge images, place on maps with position/scale/labels

### Deadline Timers
- Countdown missions with urgency levels (OK / WARNING / CRITICAL / EXPIRED)

### Claude AI Integration (ClawCom)
- `claude`, `ai`, `ai-fix`, `ai-feature` label detection
- `claude/issue-*` branch linking, "Create a PR" button parsing
- Workflow run visibility per repo, label-trigger automation

### Database Schema
Key tables: repos, maps, mapRepos, buildings, clawcomMessages, badges, placedBadges, deadlineTimers, healthcheckResults, mailMessages, mailFolders

## Development Commands

```bash
cd gh-ctrl
bun install                 # Install backend deps
cd client && bun install    # Install frontend deps
cd ..
bun run dev                 # Start both backend + frontend
bun run build               # Production build
bun run start               # Production server
```

## API Routes Overview

| Prefix | Purpose |
|--------|---------|
| `/api/repos` | Repository CRUD |
| `/api/github` | GitHub data, SSE dashboard stream, issues, PRs, branches, feed |
| `/api/gitlab` | GitLab parallel endpoints |
| `/api/maps` | Battlefield map CRUD, repo assignment |
| `/api/buildings` | Building CRUD, ClawCom chat/SSE, Healthcheck triggers, Mailbox IMAP/SMTP |
| `/api/badges` | Badge upload/library, placed badge management |
| `/api/timers` | Deadline timer CRUD |
| `/api/setup` | Connection diagnostics (gh CLI, auth, DB, GitLab token) |
| `/health` | Health check |
| `/version` | App version |

## GitHub Actions Workflows

- **claude.yml** — Interactive Claude assistant (responds to @claude mentions)
- **claude-code-review.yml** — Automated PR code review on open/sync
- **claude-conflict-resolver.yml** — Automatic merge conflict detection and resolution

## Merge Conflict Resolution Guidelines

When resolving merge conflicts in this project:

1. **TypeScript files**: Preserve type safety; merge imports from both sides
2. **package.json**: Take the union of dependencies; prefer higher versions
3. **Database schema** (`db/schema.ts`): Never drop columns; merge new fields from both sides
4. **React components**: Preserve both sides' UI changes; merge JSX carefully
5. **API routes**: Ensure no duplicate route paths after merging
6. **CSS/styles**: Merge both sides' style additions
