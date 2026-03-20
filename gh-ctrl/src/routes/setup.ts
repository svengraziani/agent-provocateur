import { Hono } from 'hono'
import { existsSync } from 'fs'
import { db } from '../db'
import { repos } from '../db/schema'

const app = new Hono()

function isDocker(): boolean {
  return !!process.env.GH_TOKEN || existsSync('/.dockerenv')
}

// GET /api/setup/status
app.get('/status', async (c) => {
  const docker = isDocker()
  const mode = docker ? 'docker' : 'local'
  const checks = []

  // Check 1: gh CLI installed
  const ghVersionResult = Bun.spawnSync(['gh', '--version'])
  const ghInstalled = ghVersionResult.exitCode === 0
  const ghVersionText = ghInstalled
    ? ghVersionResult.stdout.toString().split('\n')[0].trim()
    : null
  checks.push({
    id: 'gh_installed',
    label: 'GitHub CLI installed',
    ok: ghInstalled,
    detail: ghVersionText,
    fix: ghInstalled
      ? null
      : docker
        ? 'The gh CLI should be pre-installed in the Docker image. Try rebuilding: docker compose build'
        : 'Install GitHub CLI: https://cli.github.com/ (e.g. brew install gh)',
  })

  // Check 2: gh auth
  const ghAuthResult = Bun.spawnSync(['gh', 'auth', 'status'])
  const ghAuthed = ghAuthResult.exitCode === 0
  let authDetail: string | null = null
  if (ghAuthed) {
    const out = ghAuthResult.stderr.toString() || ghAuthResult.stdout.toString()
    const match = out.match(/Logged in to ([^\s]+)/)
    authDetail = match ? `Logged in to ${match[1]}` : 'Authenticated'
  } else {
    if (docker && !process.env.GH_TOKEN) {
      authDetail = 'GH_TOKEN environment variable is not set'
    } else {
      authDetail = ghAuthResult.stderr.toString().trim() || 'Not authenticated'
    }
  }
  checks.push({
    id: 'gh_auth',
    label: 'GitHub authenticated',
    ok: ghAuthed,
    detail: authDetail,
    fix: ghAuthed
      ? null
      : docker
        ? 'Add GH_TOKEN=<your_token> to your .env file and restart the container:\n  echo "GH_TOKEN=ghp_xxx" >> .env\n  docker compose restart'
        : 'Run: gh auth login',
  })

  // Check 3: database accessible
  let dbOk = false
  let dbDetail: string | null = null
  try {
    await db.select().from(repos).limit(1)
    dbOk = true
    dbDetail = 'SQLite database is accessible'
  } catch (err: unknown) {
    dbDetail = err instanceof Error ? err.message : 'Database error'
  }
  checks.push({
    id: 'db',
    label: 'Database accessible',
    ok: dbOk,
    detail: dbDetail,
    fix: dbOk ? null : 'Check that the data directory is writable and restart the app',
  })

  const ready = checks.every((c) => c.ok)
  return c.json({ ready, mode, checks })
})

export default app
