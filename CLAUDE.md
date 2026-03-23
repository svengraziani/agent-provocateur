# CLAUDE.md - Project Context for Claude Code

## Project Overview

**Vibe and Conquer** (`gh-ctrl`) is a self-hosted GitHub Command Center dashboard built with Bun, Hono, React 18, and SQLite. It aggregates GitHub activity across multiple repositories into a unified interface with a gamified "Battlefield" visualization.

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono (port 3001)
- **Frontend**: React 18 + Vite (port 5173 in dev)
- **Database**: SQLite + Drizzle ORM
- **GitHub Integration**: GitHub CLI (`gh`)
- **State Management**: Zustand

## Project Structure

```
gh-ctrl/                    # Main application
├── src/                    # Backend (Hono server)
│   ├── index.ts            # Server entry point
│   ├── db/                 # Database schema + setup
│   └── routes/             # API routes (repos, github, maps)
├── client/                 # Frontend (React + Vite)
│   └── src/
│       ├── components/     # React components
│       ├── hooks/          # Custom hooks
│       ├── store.ts        # Zustand store
│       ├── api.ts          # API client
│       └── types.ts        # TypeScript interfaces
├── package.json
└── drizzle.config.ts
```

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

## GitHub Actions Workflows

- **claude.yml** — Interactive Claude assistant (responds to @claude mentions)
- **claude-code-review.yml** — Automated PR code review on open/sync
- **claude-conflict-resolver.yml** — Automatic merge conflict detection and resolution

## Feature Overview

### Core Features

1. **GitHub Repository Aggregation** — Track multiple repos in one dashboard; SSE streaming for incremental load
2. **PR & Issue Management** — View, filter, comment, label, assign, create PRs/issues; batch issue creation
3. **Branch Management** — View branch status (active/stale/very-stale), ahead/behind comparison, delete branches
4. **Claude Integration** — Trigger `@claude` on any PR/issue, auto-detect claude branches (`claude/issue-{number}-*`), track active claude issues
5. **GitHub Actions Monitoring** — Track running workflows per repo with live status
6. **Activity Feed** — Global `@mentions`, issues, and PRs aggregated across all tracked repos
7. **Gamified Battlefield UI** — Isometric terrain with zoom/pan, seeded terrain generation (trees, rocks, crystals)
8. **Building System** — Deployable structures placed on the battlefield map:
   - **Branch Silos** — Visualize branches; colored by staleness (cyan=active, orange=stale, red=very-stale)
   - **ClawCom** — Chat interface for external openclaw/nanoclaw device communication
   - **Healthcheck** — Periodic endpoint monitoring with response time tracking and manual trigger
9. **Badge System** — Upload image badges, place/scale/label them on the map canvas
10. **Map Editor** — Tile-based editor with 10 tile types (ground, grass, water, sand, rock, forest, mountain, lava, snow, custom) and draw/erase/fill tools
11. **Voice Input** — Web Speech API integration for voice commands in issue/PR forms
12. **Sound Effects** — Contextual audio feedback (peep, hydraulic, refreshed, glass_poop)
13. **Setup Verification** — Checks gh CLI install, GitHub auth, and DB accessibility with fix suggestions
14. **Remote Server Support** — Configurable server URL stored in localStorage; Chrome extension origin support

### API Routes Summary

| File | Prefix | Purpose |
|------|--------|---------|
| `repos.ts` | `/api/repos` | Tracked repository CRUD |
| `github.ts` | `/api/github` | GitHub data, PRs, issues, branches, Claude triggers |
| `maps.ts` | `/api/maps` | Game map CRUD + repo assignments |
| `buildings.ts` | `/api/buildings` | Building CRUD, ClawCom messages, healthcheck results |
| `badges.ts` | `/api/badges` | Badge upload, placement, management |
| `setup.ts` | `/api/setup` | Setup status and health checks |

### Database Tables

`repos`, `maps`, `mapRepos`, `buildings`, `clawcomMessages`, `badges`, `placedBadges`, `healthcheckResults`

### Key Components

| Component | Location | Role |
|-----------|----------|------|
| `BattlefieldView` | `components/` | Main gamified view with buildings, badges, terrain |
| `MapEditor` | `components/` | Tile-based map editing tool |
| `ActionModal` | `components/` | All PR/issue actions (comment, label, assign, create, Claude) |
| `ClawComBuilding` | `components/` | Chat interface to external devices |
| `HealthcheckBuilding` | `components/` | Endpoint health monitor |
| `BranchBuilding` | `components/` | Branch silo with status colors |
| `FeedPanel` | `components/` | Mentions/issues/PRs feed |
| `Settings` | `components/` | Repo management and configuration |

---

## Merge Conflict Resolution Guidelines

When resolving merge conflicts in this project:

1. **TypeScript files**: Preserve type safety; merge imports from both sides
2. **package.json**: Take the union of dependencies; prefer higher versions
3. **Database schema** (`db/schema.ts`): Never drop columns; merge new fields from both sides
4. **React components**: Preserve both sides' UI changes; merge JSX carefully
5. **API routes**: Ensure no duplicate route paths after merging
6. **CSS/styles**: Merge both sides' style additions
