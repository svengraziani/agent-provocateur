# V&C - Gitalert

## What is this?

**V&C - Gitalert** is a command center for software development teams that want to keep tabs on multiple GitHub repositories — and have an AI assistant help them with the work.

Think of it as mission control: you open one dashboard, and you can immediately see the state of all your GitHub projects in one place. Which pull requests need review? Where are there code conflicts? What issues are waiting for attention? Instead of clicking through GitHub's interface for each repo one by one, everything is surfaced in a single view.

The twist is the AI integration. The app is wired up to **Claude** (Anthropic's AI), so you can click a button and have Claude look at an issue, suggest a fix, or even write code — all without leaving the dashboard.

---

## The Story

Modern software teams juggle many repositories. A bug gets filed here, a pull request lands there, and before long you're switching between browser tabs just to keep up. **V&C - Gitalert** was built to solve that problem: one screen, many repos, full situational awareness.

The name **V&C** stands for **Vibe and Conquer** — the idea that you stay in flow (the vibe) while the tool and AI handle the noise so you can conquer your backlog.

---

## What it looks like

The application has two main views:

### Dashboard
A grid of cards, one per repository. Each card shows:
- How many pull requests are open and what state they're in (needs review, approved, draft, conflict)
- How many issues are open
- Whether Claude is already working on something in that repo
- A direct link to the live preview of any open PR (if Netlify is set up)

You can trigger Claude directly from any card — ask it to look at an issue, add a label, or post a comment — with one click.

### Battlefield
A visual, isometric (top-down-angled) grid where your repositories appear as interactive "bases" that you can drag around and rearrange. It's a more spatial, game-like way to visualize your project landscape. Positions are remembered between sessions.

---

## How it works (without the tech jargon)

1. **You add your GitHub repositories** to the app (just paste `owner/repo-name`).
2. **The app polls GitHub** every couple of minutes (configurable) and pulls in fresh data about PRs and issues.
3. **You see everything at a glance** and can take action directly from the UI.
4. **Claude handles the heavy lifting** when you click "trigger Claude" — it reads the issue or PR, thinks about it, and responds with code suggestions or comments right there on GitHub.

The app talks to GitHub using the official `gh` command-line tool that is already authenticated on the machine running it, so there's no complex API key setup required.

---

## How to run it

The app is split into two parts that run together: a small server (backend) and a web interface (frontend). You need [Bun](https://bun.sh) (a fast JavaScript runtime) and the [GitHub CLI](https://cli.github.com) installed and logged in.

```bash
# Install dependencies
bun install

# Start everything (server + web interface)
bun run dev
```

Then open your browser to `http://localhost:5173`.

For a production deployment, build the frontend first and then start the server:

```bash
bun run build
bun run start
```

The server listens on port `3001` and serves the web interface.

---

## The AI integration

Claude is triggered in two ways:

- **From the dashboard UI**: Click a button on any issue or PR card to send Claude a task.
- **From GitHub itself**: Post a comment on any issue or PR that includes `@claude`, and Claude will pick it up and respond.

Under the hood, this is powered by [Claude Code Action](https://github.com/anthropics/claude-code-action) — a GitHub Actions workflow that wakes up Claude whenever it's mentioned and lets it read files, write code, and push commits.

---

## Tech summary (for the curious)

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Backend | Hono (lightweight web server) |
| Database | SQLite (via Drizzle ORM) |
| Frontend | React + TypeScript |
| Build tool | Vite |
| GitHub integration | `gh` CLI |
| AI | Claude (via GitHub Actions) |
