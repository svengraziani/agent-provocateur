![Vibe and Conquer](gh-ctrl/vibe_and_conquer_banner.jpeg)

<a href="https://discord.gg/qjxF5ZDS"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge"></a>

# Vibe and Conquer

**Your self-hosted GitHub Command Center** — monitor every repo, visualize team activity on an RTS-style battlefield, and command Claude AI directly from the UI.

![Demo](docs/demo_presentation.gif)

---

## Key Workflows

### Monitor at a Glance

Never lose track of what's happening across your repositories. The dashboard surfaces open PRs, issues, merge conflicts, review decisions, and running GitHub Actions — all in one place, updated in real time via SSE streaming.

- Repos load as soon as they're ready (parallel SSE streaming, not sequential)
- Conflict warnings, Draft PRs, stale branches, and AI-labeled issues surface prominently
- Running GitHub Actions visible per repo
- Configurable auto-refresh (30s – 30 min) keeps the view current

### Visualize the Battlefield

Each repository becomes a **base** on an infinite isometric RTS-style map. Pan (drag), zoom (scroll wheel), and reposition bases freely — your battlefield layout persists. The HUD shows live stats across the entire fleet: active bases, conflicts, workflow runs, and stale branches.

- Minimap for quick navigation across large multi-repo setups
- Relocate Mode: drag & drop to reposition Bases and Badges
- Sound effects on scan, conflict detection, and refresh
- Intel Feed Panel: sidebar with @mentions, open Issues, and open PRs
- Custom terrain via the built-in Map Editor

### Command with Claude (ClawCom)

Trigger Claude AI on any issue or PR with a single click, without leaving the dashboard. The **Construct Dialog** lets you post comments, assign labels, and kick off AI workflows directly from a repo's base node. The **ClawCom Building** is your AI communications hub on the battlefield.

- One-click `@claude` trigger on any issue or PR
- AI-labeled issues (`claude`, `ai`, `ai-fix`, `ai-feature`) surface in a dedicated section
- `claude/issue-*` branches auto-link back to their source issues
- "Create a PR" links from Claude comments become one-click buttons in the UI
- Connect to OpenClaw or NanoClaw via URL — chat interface directly in the dashboard

### Buildings: Healthcheck Monitoring

The **Healthcheck Building** turns your battlefield into a live infrastructure monitor. Configure HTTP endpoints, set polling intervals, and watch status update in real time.

- Configure multiple HTTP endpoints per building (URL + label)
- Automatic polling with configurable intervals (30s to 1h)
- Displays status (ok/fail), HTTP status code, and response time
- Manual trigger button for on-demand checks
- Visual status indicator: green / orange / red / grey

### Badges & Map Markers

Place custom image markers anywhere on your battlefield to annotate your infrastructure, mark team territories, or highlight important repos.

- Upload any image as a badge (max 5MB, all image formats supported)
- Place badges on the battlefield with position, scale (slider), and label
- Relocate Mode: reposition badges via drag & drop
- Badge Library: rename, delete, and re-upload badges

### Organize & Track

The **Intel Feed Panel** pulls your GitHub @mentions, open issues, and open PRs across all tracked repos into a single sidebar — so nothing falls through the cracks.

- Netlify deploy-preview URLs surface automatically in PR cards
- Voice input for hands-free issue and PR creation
- Repo metadata at a glance: stars, forks, languages, top contributors, and a 26-week commit activity sparkline

---

## Getting Started

### Option 1: Docker (Recommended)

The easiest way to run Vibe and Conquer — no Bun or GitHub CLI installation needed locally.

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

### Option 2: Local

**Prerequisites:** [Bun](https://bun.sh) installed + [GitHub CLI](https://cli.github.com) installed and authenticated (`gh auth login`)

```bash
cd gh-ctrl
bun install
cd client && bun install && cd ..
bun run dev
# Backend: 3001  |  Frontend: 5173
```

**Production build:**

```bash
bun run build   # builds the React client
bun run start   # serves everything on port 3001
```

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
- Real-time SSE streaming — repos load in parallel as soon as they're ready
- Conflict warnings, draft PRs, running actions, stale branches
- Configurable auto-refresh (30s – 30 min)

### Battlefield View
- Infinite isometric canvas — pan, zoom, reposition bases freely
- HUD: active bases, conflicts, running workflows, stale branches
- Minimap, sound effects, Relocate Mode (drag & drop for Bases and Badges)
- Intel Feed Panel: @mentions, open issues, open PRs across all repos

### Base Nodes (per-repo)
- Open PRs with review status, draft status, assignees, labels, and Netlify preview URLs
- Open issues with labels and assignees
- BranchSilo: branch staleness visualization (active / stale 30d+ / very-stale 90d+)
- Ahead/behind tracking vs. default branch (lazy-loaded)
- Delete branches directly from the UI
- Repo metadata popup: stars, forks, languages, top contributors, 26-week commit sparkline
- Construct Dialog: trigger Claude, post comments, add/remove labels, assign users, create PRs and Issues

### Buildings

**ClawCom** — AI Communications Hub
- 6 idle animations (4–10s cycles)
- Construction animation when placed
- Connect via host URL (OpenClaw / NanoClaw)
- Chat interface with message history
- Unread badge counter

**Healthcheck** — HTTP Endpoint Monitor
- Multiple endpoints per building
- Configurable polling intervals (30s to 1h)
- 200-result history per building
- Response time tracking

### Map Editor
- Isometric tile maps (up to 256×256 tiles)
- Tools: Paint, Erase, Fill, Stamp
- 10 tile types: Ground, Grass, Water, Sand, Rock, Forest, Mountain, Lava, Snow, Custom
- Undo/Redo
- Save, load, and delete maps; assign maps to repos

### Badges
- Upload any image (max 5MB, UUID filename on server)
- Place on battlefield with position, scale slider, and label
- Relocate Mode for repositioning

### Repository Management
- Browse and search owned, collaborator, and org repos — add with one click
- Manual `owner/repo` entry (GitHub URL auto-normalized)
- Customizable per-repo color (8 presets + custom hex picker)
- Create new GitHub repos directly from the dashboard
- Map assignment directly from Settings

### Claude AI Integration
- `claude`, `ai`, `ai-fix`, `ai-feature` labeled issues surface in a dedicated section
- `claude/issue-*` branches detected and linked to their source issue
- "Create a PR" links from Claude comments parsed into one-click buttons
- Active Claude workflow runs visible per repo

### Voice Input
- Web Speech API (en-US)
- Available in Compact (toolbar) and Construct-style variants
- Graceful fallback on unsupported browsers

### Setup & Connectivity
- Automatic connection check on startup
- Setup Wizard when `gh` CLI or authentication is missing (with fix instructions + clipboard copy)
- Custom server URL support (for remote instances)

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
| State Management | [Zustand](https://github.com/pmndrs/zustand) |

## Project Structure

```
vibe-and-conquer/
├── compose.yml                 # Docker Compose (prod + dev profiles)
├── .env.example                # GH_TOKEN template
└── gh-ctrl/
    ├── src/
    │   ├── index.ts            # Hono server: CORS, routes, static files, health
    │   ├── healthcheck-service.ts  # Background HTTP monitoring scheduler
    │   ├── db/
    │   │   ├── index.ts        # SQLite connection (WAL mode)
    │   │   └── schema.ts       # Drizzle ORM: repos, maps, buildings, badges, ...
    │   └── routes/
    │       ├── github.ts       # GitHub API via gh CLI (SSE stream, PRs, issues, workflows)
    │       ├── repos.ts        # Repository CRUD
    │       ├── maps.ts         # Tile map CRUD + repo assignment
    │       ├── buildings.ts    # Building CRUD + ClawCom messages + healthcheck trigger
    │       ├── badges.ts       # Badge upload/CRUD + placement
    │       └── setup.ts        # Setup diagnostics (gh auth, DB check)
    └── client/
        └── src/
            ├── App.tsx                  # Root: connection check, routing, sidebar
            ├── store.ts                 # Zustand: repos, entries, buildings, badges, toasts
            ├── api.ts                   # API client (all endpoints)
            ├── types.ts                 # TypeScript interfaces
            ├── hooks/
            │   └── useSound.ts          # Audio (peep, hydraulic, refreshed, glass_poop)
            └── components/
                ├── BattlefieldView.tsx  # Isometric canvas: pan, zoom, buildings, badges
                ├── BaseNode.tsx         # Per-repo node: PRs, issues, branch silo
                ├── BranchBuilding.tsx   # Branch silo + individual branch cards
                ├── BranchSiloPanel.tsx  # Branch management panel
                ├── ClawComBuilding.tsx  # ClawCom hub with animations
                ├── ClawComChatDialog.tsx    # Chat interface
                ├── ClawComSetupDialog.tsx   # Host configuration
                ├── HealthcheckBuilding.tsx  # HTTP monitor building
                ├── HealthcheckSetupDialog.tsx # Endpoint configuration
                ├── BadgeMarker.tsx      # Placed badge on battlefield
                ├── BadgeLibraryDialog.tsx   # Upload and manage badges
                ├── BuildOptionsMenu.tsx # Place ClawCom/Healthcheck/new base
                ├── ActionModal.tsx      # Universal modal: comment, label, assign, create PR/issue
                ├── ConstructDialog.tsx  # Issue/PR creation with Voice Input
                ├── FeedPanel.tsx        # Intel Feed: mentions, issues, PRs
                ├── MapEditor.tsx        # Tile map editor
                ├── Settings.tsx         # Repo management + preferences
                ├── SetupScreen.tsx      # Setup Wizard (gh CLI + auth checks)
                ├── ConnectionSetup.tsx  # Remote server URL input
                ├── MarkdownContent.tsx  # Safe markdown renderer
                ├── VoiceButton.tsx      # Speech recognition UI
                ├── useVoiceInput.ts     # Web Speech API wrapper
                ├── Toast.tsx            # Notification system
                └── Icons.tsx            # SVG icon components
```

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=svengraziani/vibe-and-conquer&type=date&legend=top-left)](https://www.star-history.com/#svengraziani/vibe-and-conquer&type=date&legend=top-left)
