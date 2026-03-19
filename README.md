![Vibe and Conquer](gh-ctrl/vibe_and_conquer_banner.jpeg)

# Vibe and Conquer

![Demo](docs/demo_presentation.gif)

A GitHub Command Center for teams who want full visibility into their repositories — PRs, issues, conflicts, and AI-assisted workflows — all in one place.

## What is this?

**Vibe and Conquer** (`gh-ctrl`) is a self-hosted dashboard that aggregates GitHub activity across multiple repositories. It gives you a real-time overview of open pull requests, issues, merge conflicts, review statuses, and Claude AI-labeled tasks — so your team always knows what needs attention.

## Features

### Dashboard
- Monitor all your tracked repos at a glance: open PRs, issues, merge conflicts, review decisions, draft PRs, and running GitHub Actions
- Real-time data streamed via SSE — repos load as soon as they're ready
- Conflict warnings surface prominently when merge conflicts are detected
- Configurable auto-refresh interval (30s – 30 min)

### Battlefield View
- A retro RTS-style tactical map — each repository is a "base" rendered on an infinite isometric canvas
- Pan (drag), zoom (scroll/pinch), and freely reposition bases — positions persist in localStorage
- HUD shows live stats: active bases, conflicts, running processes, and stale branches
- Minimap for quick navigation across the battlefield
- Load custom tile maps created in the Map Editor as your battlefield terrain
- **Relocate Mode** — drag and drop bases to rearrange your battlefield
- **Intel Feed Panel** — side panel showing your GitHub @mentions, open issues, and open PRs across all repos
- Sound effects on scan complete and conflict detection

### Base Nodes (per-repo)
- Per-repository cards showing: open PRs, issues, conflicts, AI-labeled issues, running actions, and stale branches
- Open PR list with review status, draft status, and Netlify preview URLs
- Open issue list with labels and assignees
- Branch staleness visualization — see which branches haven't been updated recently
- Repo metadata popup: stars, forks, watchers, languages, topics, top contributors, and 26-week commit activity sparkline
- **Construct Dialog** — trigger Claude AI on issues, post comments, add/remove labels, assign users, and create PRs directly from the UI
- Inline actions: trigger `@claude` on any issue or PR with a single click

### Map Editor
- Create custom isometric tile maps to use as battlefield backgrounds
- Adjustable map dimensions (up to 80×80 tiles)
- Tile color painting with multi-select and flood fill
- Save, load, and delete named maps; mini-preview thumbnails in the map selector

### Repository Management
- Browse and search your GitHub repos (owned, collaborator, and org repos) and add them with one click
- Manual `owner/repo` entry as a fallback
- Customizable per-repo color (preset palette + custom hex picker)
- Create new GitHub repos directly from the dashboard and auto-track them

### Claude AI Integration
- Automatically surfaces issues labeled `claude`, `ai`, `ai-fix`, or `ai-feature` in a dedicated section
- Detects Claude-generated branches (`claude/issue-*`) and links them back to their source issues
- Parses Claude's "Create a PR" comment links and surfaces them as one-click PR creation
- Shows which Claude workflows are actively running per repo

### GitHub Actions Support
- Tracks running, queued, and waiting workflow runs per repository
- Links running Claude workflows back to the issue they were triggered from

### Other
- **Netlify Preview URLs** — pulls deploy-preview URLs into PR cards automatically
- **Voice Input** — hands-free issue and PR creation via browser speech recognition
- **Toast notifications** for all actions (success, error, info)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Hono](https://hono.dev) (port 3001) |
| Frontend | React 18 + Vite (port 5173 in dev) |
| Database | SQLite + [Drizzle ORM](https://orm.drizzle.team) |
| GitHub API | GitHub CLI (`gh`) |
| State Management | [Zustand](https://github.com/pmndrs/zustand) |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- [GitHub CLI](https://cli.github.com) installed and authenticated (`gh auth login`)

### Installation

```bash
cd gh-ctrl
bun install
cd client && bun install && cd ..
```

### Development

```bash
cd gh-ctrl
bun run dev
```

This starts both the backend server (port `3001`) and the Vite dev server (port `5173`) concurrently.

### Production

```bash
cd gh-ctrl
bun run build   # builds the React client
bun run start   # serves everything on port 3001
```

## Project Structure

```
vibe-and-conquer/
└── gh-ctrl/
    ├── src/
    │   ├── index.ts          # Hono server entry point
    │   ├── db/               # Drizzle ORM schema & SQLite connection
    │   └── routes/
    │       ├── github.ts     # GitHub data fetching via gh CLI (SSE streaming, actions, PRs, issues)
    │       ├── repos.ts      # Repository CRUD endpoints
    │       └── maps.ts       # Map CRUD endpoints (tile maps for Battlefield)
    └── client/
        └── src/
            ├── App.tsx               # Root app with view routing
            ├── store.ts              # Zustand global state
            ├── api.ts                # Frontend API client
            ├── types.ts              # Shared TypeScript types
            ├── hooks/                # Custom hooks (sound, voice input)
            └── components/
                ├── Dashboard.tsx     # Grid view of all repos
                ├── BattlefieldView.tsx # RTS-style isometric battlefield
                ├── BaseNode.tsx      # Per-repo node on the battlefield
                ├── MapEditor.tsx     # Tile map creation and editing
                ├── FeedPanel.tsx     # Intel feed (@mentions, issues, PRs)
                ├── ActionModal.tsx   # Claude trigger / issue action modal
                ├── ConstructDialog.tsx # Construct / issue action dialog
                ├── Settings.tsx      # Repo management and preferences
                └── RepoCard.tsx      # Repo card for the dashboard grid
```

## GitHub Actions Workflows

- **claude.yml** — Interactive Claude assistant (responds to `@claude` mentions in issues and PRs)
- **claude-code-review.yml** — Automated PR code review on open/sync
- **claude-conflict-resolver.yml** — Automatic merge conflict detection and resolution
