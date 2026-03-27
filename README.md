![Vibe and Conquer](gh-ctrl/vibe_and_conquer_banner.jpeg)

<a href="https://github.com/svengraziani/vibe-and-conquer/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/svengraziani/vibe-and-conquer/ci.yml?branch=main&label=Build&logo=github&style=for-the-badge" alt="Build"></a>
<a href="https://github.com/svengraziani/vibe-and-conquer/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/svengraziani/vibe-and-conquer/test.yml?branch=main&label=Tests&logo=github&style=for-the-badge" alt="Tests"></a>
<a href="https://discord.gg/qjxF5ZDS"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge"></a>

# Vibe and Conquer

**Your self-hosted GitHub & GitLab Command Center** — monitor every repo, visualize team activity on an RTS-style battlefield, deploy buildings for AI chat, health monitoring, and email, and command Claude AI directly from the UI.

![Demo](docs/demo_presentation.gif)

---

## Key Workflows

### Monitor at a Glance

Never lose track of what's happening across your repositories. The dashboard surfaces open PRs, issues, merge conflicts, review decisions, and running GitHub Actions — all in one place, updated in real time via SSE streaming.

- Conflict warnings surface prominently when merge conflicts are detected
- Draft PRs, stale branches, and AI-labeled tasks are all visible at a glance
- Configurable auto-refresh (30s – 30 min) keeps the view current

### Visualize the Battlefield

Each repository becomes a **base** on an infinite isometric RTS-style map. Pan, zoom, and reposition bases freely — your battlefield layout persists. The HUD shows live stats across the entire fleet: active bases, running conflicts, workflow runs, and stale branches.

- Minimap for quick navigation across large multi-repo setups
- Load custom terrain created in the built-in Map Editor
- Sound effects on scan complete and conflict detection

### Command with Claude (ClawCom)

Trigger Claude AI on any issue or PR with a single click, without leaving the dashboard. The **Construct Dialog** lets you post comments, assign labels, and kick off AI workflows directly from a repo's base node.

<!-- Add ClawCom gif here once recorded: docs/clawcom_demo.gif -->
> **ClawCom gif coming soon** — recording in progress.

- One-click `@claude` trigger on any issue or PR
- AI-labeled issues (`claude`, `ai`, `ai-fix`, `ai-feature`) surface in a dedicated section
- Claude-generated branches auto-link back to their source issues
- "Create a PR" links from Claude comments become one-click buttons in the UI

### Deploy Buildings

Place functional **buildings** on your battlefield — each one adds a new capability to your command center.

- **ClawCom** — AI agent chat building with Claude Channel, OpenClaw, and NanoClaw backends. Real-time SSE streaming, message history, and tool-call permission handling
- **Healthcheck** — Monitor HTTP endpoints with configurable intervals, response-time tracking, and ok/error/partial status visualization
- **Snailbox (Mailbox)** — Full IMAP/SMTP email client: read, star, compose, send, and sync emails without leaving the battlefield

### Organize & Track

The **Intel Feed Panel** pulls your GitHub and GitLab @mentions, open issues, and open PRs across all tracked repos into a single sidebar — so nothing falls through the cracks.

- Netlify deploy-preview URLs surface automatically in PR cards
- Voice input (browser Speech API) for hands-free issue and PR creation
- Repo metadata at a glance: stars, forks, languages, top contributors, and a 26-week commit activity sparkline
- **Deadline Timers** — countdown missions with urgency levels (critical / warning / ok / expired)
- **Badge System** — upload custom badge images and place them on the map with labels and scaling

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- [GitHub CLI](https://cli.github.com) installed and authenticated (`gh auth login`)

### Install & Run

```bash
cd gh-ctrl
bun install
cd client && bun install && cd ..
bun run dev
```

This starts both the backend (port `3001`) and the Vite dev server (port `5173`) concurrently.

### Production

```bash
cd gh-ctrl
bun run build   # builds the React client
bun run start   # serves everything on port 3001
```

---

## Docker

The easiest way to run Vibe and Conquer without installing Bun or the GitHub CLI locally.

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) with Compose v2 + a GitHub [personal access token](https://github.com/settings/tokens) with `repo` and `read:org` scopes.

```bash
cp .env.example .env
# Edit .env and set: GH_TOKEN=ghp_...
```

**Production** — builds the frontend into the image, serves everything on one port:

```bash
docker compose --profile prod up --build
# App at http://localhost:3001
```

**Development** — live reload with Vite HMR:

```bash
docker compose --profile dev up --build
# Frontend: http://localhost:5173  |  API: http://localhost:3001
```

The SQLite database is stored in a named Docker volume (`gh-ctrl-data`) and persists across restarts.

---

## GitHub Actions Workflows

Three Claude-powered workflows run automatically on your repositories:

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **`claude.yml`** | `@claude` mention in any issue or PR comment | Interactive AI assistant — answers questions, implements code, opens PRs |
| **`claude-code-review.yml`** | PR opened or synchronized | Automated code review with inline feedback |
| **`claude-conflict-resolver.yml`** | Merge conflict detected | Automatically resolves conflicts and pushes a fix |

These workflows are the backbone of **ClawCom** — the dashboard's AI command layer. Every triggered run is visible in the UI, linked back to the issue or PR that spawned it.

---

<details>
<summary><strong>Full Feature Reference</strong></summary>

### Dashboard
- Real-time SSE streaming — repos load as soon as they're ready
- Conflict warnings, draft PRs, running actions, stale branches
- Configurable auto-refresh (30s – 30 min)
- Sidebar stats: repo count, open PRs, issues, merge conflicts, last refresh timestamp, app version

### Battlefield View
- Infinite isometric canvas — pan, zoom (mouse wheel with cursor-centered zoom), reposition bases freely
- HUD: active bases, conflicts, running processes, stale branches
- Minimap with viewport indicator and alert/stale status markers
- Sound effects on scan complete and conflict detection
- Relocate Mode (drag & drop bases and buildings)
- Intel Feed Panel: @mentions, open issues, open PRs across all repos (with category filtering)

### Base Nodes (per-repo)
- Open PRs with review status, draft status, and Netlify preview URLs
- Open issues with labels and assignees
- Branch staleness visualization (30-day and 90-day thresholds with color coding)
- Branch deletion and commit comparison (ahead/behind)
- Repo metadata popup: stars, forks, watchers, languages, topics, top contributors, 26-week commit sparkline
- Construct Dialog: trigger Claude, post comments, add/remove labels, assign users, create PRs
- Batch issue creation

### Building System
- **ClawCom** — AI agent chat with Claude Channel (real-time SSE), OpenClaw, and NanoClaw backends; message history; tool-call permission system
- **Healthcheck** — monitor multiple HTTP endpoints per building; configurable intervals; response-time tracking; ok/error/partial status; trigger-on-demand
- **Snailbox (Mailbox)** — full IMAP/SMTP email client; read, star, compose, send; background sync; unread count; connection testing
- Buildings are draggable, color-customizable, and persist position on the map

### Badge & Decoration System
- Upload custom badge images (PNG, JPG, up to 5 MB)
- Badge library management (rename, delete)
- Place badges on any map with arbitrary position, scaling, and custom labels

### Deadline Timers
- Create countdown missions with name, description, deadline, and color
- Real-time countdown (days / hours / minutes / seconds)
- Urgency levels: OK (> 72 h), WARNING (24–72 h), CRITICAL (< 24 h), EXPIRED
- Sorted by deadline

### Map Editor
- Create isometric tile maps (up to 256 × 256 tiles) for battlefield backgrounds
- 10 tile types: ground, grass, water, sand, rock, forest, mountain, lava, snow, custom
- Paint, erase, and flood-fill tools with zoom controls
- Import / export maps as JSON
- Save, load, delete named maps with mini-preview thumbnails

### Repository Management
- **Multi-provider**: GitHub and GitLab (including self-hosted instances) in a single dashboard
- Browse and search owned, collaborator, and org repos — add with one click
- Manual `owner/repo` entry as fallback
- Customizable per-repo color (preset palette + custom hex picker)
- Create new GitHub repos directly from the dashboard

### Claude AI Integration (ClawCom)
- Surfaces `claude`, `ai`, `ai-fix`, `ai-feature` labeled issues in a dedicated section
- Detects `claude/issue-*` branches and links them to source issues
- Parses Claude's "Create a PR" links into one-click buttons
- Shows active Claude workflow runs per repo
- Label-trigger automation endpoint

### Authentication
- Optional Keycloak (OAuth2 / OpenID Connect) integration
- User profile display in sidebar

### Other
- Voice input (browser Speech API) for hands-free issue and PR creation
- Toast notifications (success / error / info) with auto-dismiss
- Markdown rendering for descriptions and rich text
- Setup screen with connection diagnostics (GitHub CLI, auth, database, GitLab token)

</details>

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Hono](https://hono.dev) (port 3001) |
| Frontend | React 18 + Vite (port 5173 in dev) |
| Database | SQLite + [Drizzle ORM](https://orm.drizzle.team) |
| GitHub API | GitHub CLI (`gh`) |
| GitLab API | REST API (with self-hosted instance support) |
| State Management | [Zustand](https://github.com/pmndrs/zustand) |
| Auth (optional) | Keycloak (OAuth2 / OpenID Connect) |

## Project Structure

```
vibe-and-conquer/
└── gh-ctrl/
    ├── src/
    │   ├── index.ts          # Hono server entry point
    │   ├── db/               # Drizzle ORM schema & SQLite connection
    │   └── routes/
    │       ├── github.ts     # GitHub data fetching via gh CLI (SSE streaming, actions, PRs, issues)
    │       ├── gitlab.ts     # GitLab REST API integration (parallel to github.ts)
    │       ├── repos.ts      # Repository CRUD endpoints
    │       ├── maps.ts       # Map CRUD endpoints (tile maps for Battlefield)
    │       ├── buildings.ts  # Building CRUD + ClawCom chat, Healthcheck, Mailbox endpoints
    │       ├── badges.ts     # Badge upload, library, and placement endpoints
    │       └── timers.ts     # Deadline timer CRUD endpoints
    └── client/
        └── src/
            ├── App.tsx               # Root app with view routing
            ├── store.ts              # Zustand global state
            ├── api.ts                # Frontend API client
            ├── types.ts              # Shared TypeScript types
            ├── hooks/                # Custom hooks (sound, voice, camera, draggables, auth)
            └── components/
                ├── Dashboard.tsx        # Grid view of all repos
                ├── BattlefieldView.tsx  # RTS-style isometric battlefield
                ├── BattlefieldHUD.tsx   # Heads-up display with map controls
                ├── BattlefieldMinimap.tsx # Minimap with alert indicators
                ├── BaseNode.tsx         # Per-repo node on the battlefield
                ├── BranchBuilding.tsx   # Branch visualization with stale states
                ├── ClawComBuilding.tsx   # AI agent chat building
                ├── HealthcheckBuilding.tsx # HTTP endpoint monitor building
                ├── MailboxBuilding.tsx   # IMAP/SMTP email building
                ├── BadgeMarker.tsx       # Placed badge decoration
                ├── DeadlineTimers.tsx    # Countdown mission timers
                ├── MapEditor.tsx         # Tile map creation and editing
                ├── FeedPanel.tsx         # Intel feed (@mentions, issues, PRs)
                ├── ConstructDialog.tsx   # Construct / issue action dialog
                ├── Settings.tsx          # Repo management and preferences
                └── SetupScreen.tsx       # Initial setup and connection diagnostics
```

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=svengraziani/vibe-and-conquer&type=date&legend=top-left)](https://www.star-history.com/#svengraziani/vibe-and-conquer&type=date&legend=top-left)
