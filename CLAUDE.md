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

## Merge Conflict Resolution Guidelines

When resolving merge conflicts in this project:

1. **TypeScript files**: Preserve type safety; merge imports from both sides
2. **package.json**: Take the union of dependencies; prefer higher versions
3. **Database schema** (`db/schema.ts`): Never drop columns; merge new fields from both sides
4. **React components**: Preserve both sides' UI changes; merge JSX carefully
5. **API routes**: Ensure no duplicate route paths after merging
6. **CSS/styles**: Merge both sides' style additions
