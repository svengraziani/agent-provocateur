import { Hono } from 'hono'
import { db } from '../db'
import { repos } from '../db/schema'
import fs from 'fs'

const app = new Hono()

function isDocker(): boolean {
  return !!process.env.GH_TOKEN || fs.existsSync('/.dockerenv')
}

function ghVersion() : string | null {
  if (Bun.which('gh')){
    const ghVersionResult = Bun.spawnSync(['gh', '--version'])
    if (ghVersionResult.success){
      return ghVersionResult.stdout.toString().split('\n')[0].trim()
    }
  }
  return null
}

function glabVersion() : string | null {
  if (Bun.which('glab')){
    const glabVersionResult = Bun.spawnSync(['glab', '--version'])
    if (glabVersionResult.success){
      return glabVersionResult.stdout.toString().trim()
    }
  }
  return null
}

app.get('/status', async (c) => {
  const mode = isDocker() ? 'docker' : 'local'

  // Check 1: gh and/or glab installed
  const ghVersionOutput = ghVersion()
  const glabVersionOutput = glabVersion()

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
      id: 'cli_installed',
      label: 'At least one CLI installed (gh or glab)',
      ok: !!ghVersionOutput || !!glabVersionOutput,
      required: true,
      detail: !!ghVersionOutput || !!glabVersionOutput ? null : 'Neither gh nor glab CLI found',
      fix: !!ghVersionOutput || !!glabVersionOutput
        ? null
        : mode === 'docker'
        ? 'CLI tools should be pre-installed in the Docker image. Rebuild the image.'
        : 'Install gh CLI: https://cli.github.com/manual/installation — or glab CLI: https://gitlab.com/gitlab-org/cli',
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
