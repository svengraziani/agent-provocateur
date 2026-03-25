import { Hono } from 'hono'
import { db } from '../db'
import { repos } from '../db/schema'
import fs from 'fs'

const app = new Hono()

function isDocker(): boolean {
  return !!process.env.GH_TOKEN || fs.existsSync('/.dockerenv')
}

app.get('/status', async (c) => {
  const mode = isDocker() ? 'docker' : 'local'

  // Check 1: gh installed
  const ghVersionResult = Bun.spawnSync(['gh', '--version'])
  const ghInstalled = ghVersionResult.exitCode === 0
  const ghVersionOutput = ghInstalled ? ghVersionResult.stdout.toString().split('\n')[0].trim() : null

  // Check 2: gh auth
  const ghAuthResult = Bun.spawnSync(['gh', 'auth', 'status'])
  const ghAuthed = ghAuthResult.exitCode === 0
  const ghAuthDetail = ghAuthed
    ? ghAuthResult.stderr.toString().trim() || ghAuthResult.stdout.toString().trim()
    : ghAuthResult.stderr.toString().trim() || 'Not authenticated'

  let ghAuthFix: string | null = null
  if (!ghAuthed) {
    ghAuthFix = mode === 'docker'
      ? 'Add GH_TOKEN=<your_token> to your .env file and restart the container'
      : 'Run: gh auth login'
  }

  // Check 3: db accessible
  let dbOk = false
  let dbDetail: string | null = null
  try {
    await db.select().from(repos).limit(1)
    dbOk = true
  } catch (err) {
    dbDetail = err instanceof Error ? err.message : 'Unknown error'
  }

  // Check 4: GitLab token (optional)
  const gitlabToken = !!process.env.GITLAB_TOKEN

  const checks = [
    {
      id: 'gh_installed',
      label: 'GitHub CLI installed',
      ok: ghInstalled,
      required: true,
      detail: ghInstalled ? ghVersionOutput : 'gh CLI not found',
      fix: ghInstalled
        ? null
        : mode === 'docker'
        ? 'gh CLI should be pre-installed in the Docker image. Rebuild the image.'
        : 'Install gh CLI: https://cli.github.com/manual/installation',
    },
    {
      id: 'gh_auth',
      label: 'GitHub authenticated',
      ok: ghAuthed,
      required: true,
      detail: ghAuthDetail || null,
      fix: ghAuthFix,
    },
    {
      id: 'db',
      label: 'Database accessible',
      ok: dbOk,
      required: true,
      detail: dbOk ? null : dbDetail,
      fix: dbOk ? null : 'Ensure the data/ directory exists and is writable',
    },
    {
      id: 'gitlab_token',
      label: 'GitLab Token',
      ok: gitlabToken,
      required: false,
      detail: gitlabToken ? 'GitLab token configured' : 'No GitLab token found',
      fix: gitlabToken
        ? null
        : mode === 'docker'
        ? 'Add GITLAB_TOKEN=<your_token> to your .env file and restart the container'
        : 'Set GITLAB_TOKEN env var to enable GitLab repository support',
    },
  ]

  const ready = checks.filter((ch) => ch.required).every((ch) => ch.ok)

  return c.json({ ready, mode, checks })
})

export default app
