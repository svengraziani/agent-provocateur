![Vibe and Conquer](gh-ctrl/vibe_and_conquer_banner.jpeg)

# Vibe and Conquer

A GitHub Command Center for teams who want full visibility into their repositories — PRs, issues, conflicts, and AI-assisted workflows — all in one place.

## What is this?

**Vibe and Conquer** (`gh-ctrl`) is a self-hosted dashboard that aggregates GitHub activity across multiple repositories. It gives you a real-time overview of open pull requests, issues, merge conflicts, review statuses, and Claude AI-labeled tasks — so your team always knows what needs attention.

## Features

- **Dashboard** — Monitor all your repos at a glance: open PRs, issues, conflicts, and review decisions
- **Battlefield View** — A visual, high-level battlefield perspective of your repositories' activity
- **Repository Management** — Add and manage which repositories are tracked
- **Claude AI Integration** — Automatically surfaces issues labeled with `claude`, `ai`, `ai-fix`, or `ai-feature`
- **Netlify Preview URLs** — Pulls preview deployment links directly into PR cards
- **Voice Input** — Hands-free interaction via browser voice recognition
- **Auto-refresh** — Keeps your data current on a configurable interval (default: 2 minutes)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Hono](https://hono.dev) |
| Frontend | React 18 + Vite |
| Database | Drizzle ORM |
| GitHub API | GitHub CLI (`gh`) |

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
    │   ├── db/               # Drizzle ORM schema & connection
    │   └── routes/
    │       ├── github.ts     # GitHub data fetching via gh CLI
    │       └── repos.ts      # Repository CRUD endpoints
    └── client/
        └── src/
            ├── App.tsx       # Root app with view routing
            ├── components/   # Dashboard, Battlefield, Settings, etc.
            ├── api.ts        # Frontend API client
            └── types.ts      # Shared TypeScript types
```
