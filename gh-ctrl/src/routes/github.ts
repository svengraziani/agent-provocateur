import { Hono } from 'hono'
import { db } from '../db'
import { repos } from '../db/schema'

interface GHResult {
  data: any
  error: string | null
}

function gh(args: string[]): GHResult {
  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })
  if (proc.exitCode !== 0) {
    return { data: null, error: proc.stderr.toString() }
  }
  try {
    return { data: JSON.parse(proc.stdout.toString()), error: null }
  } catch {
    return { data: null, error: 'Failed to parse gh output' }
  }
}

const CLAUDE_LABELS = ['claude', 'ai', 'ai-fix', 'ai-feature']

function fetchRepoData(fullName: string) {
  const prResult = gh([
    'pr', 'list', '--repo', fullName, '--json',
    'number,title,state,reviewDecision,mergeable,headRefName,author,updatedAt,labels,isDraft',
    '--limit', '30',
  ])

  const issueResult = gh([
    'issue', 'list', '--repo', fullName, '--json',
    'number,title,state,labels,assignees,updatedAt,author',
    '--limit', '30',
  ])

  if (prResult.error && issueResult.error) {
    return {
      fullName,
      prs: [],
      issues: [],
      stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, approved: 0, drafts: 0, claudeIssues: 0 },
      conflicts: [],
      needsReview: [],
      claudeIssues: [],
      error: prResult.error || issueResult.error,
    }
  }

  const prs = prResult.data || []
  const issues = issueResult.data || []

  const conflicts = prs.filter((pr: any) => pr.mergeable === 'CONFLICTING')
  const needsReview = prs.filter(
    (pr: any) => pr.reviewDecision === 'REVIEW_REQUIRED' || pr.reviewDecision === null
  ).filter((pr: any) => !pr.isDraft)
  const approved = prs.filter((pr: any) => pr.reviewDecision === 'APPROVED')
  const drafts = prs.filter((pr: any) => pr.isDraft)
  const claudeIssues = issues.filter((issue: any) =>
    issue.labels?.some((label: any) =>
      CLAUDE_LABELS.includes(label.name?.toLowerCase())
    )
  )

  return {
    fullName,
    prs,
    issues,
    stats: {
      openPRs: prs.length,
      openIssues: issues.length,
      conflicts: conflicts.length,
      needsReview: needsReview.length,
      approved: approved.length,
      drafts: drafts.length,
      claudeIssues: claudeIssues.length,
    },
    conflicts,
    needsReview,
    claudeIssues,
    error: null,
  }
}

const app = new Hono()

// GET /api/github/dashboard — fetch all repos in parallel
app.get('/dashboard', async (c) => {
  const allRepos = await db.select().from(repos)

  const results = await Promise.all(
    allRepos.map(async (repo) => ({
      repo,
      data: fetchRepoData(repo.fullName),
    }))
  )

  return c.json(results)
})

// GET /api/github/repo/:owner/:name — refresh single repo
app.get('/repo/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const fullName = `${owner}/${name}`
  const data = fetchRepoData(fullName)
  return c.json(data)
})

// GET /api/github/labels/:owner/:name — list available labels for a repo
app.get('/labels/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const fullName = `${owner}/${name}`
  const result = gh(['label', 'list', '--repo', fullName, '--json', 'name,color,description', '--limit', '100'])
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(result.data || [])
})

// GET /api/github/branches/:owner/:name — list branches for a repo
app.get('/branches/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const fullName = `${owner}/${name}`

  const branchResult = gh(['api', `repos/${fullName}/branches?per_page=100`, '--jq', '[.[].name]'])
  const repoResult = gh(['repo', 'view', fullName, '--json', 'defaultBranchRef'])

  if (branchResult.error) return c.json({ error: branchResult.error }, 500)

  const branches: string[] = branchResult.data || []
  const defaultBranch: string = repoResult.data?.defaultBranchRef?.name || 'main'

  return c.json({ branches, defaultBranch })
})

// POST /api/github/trigger-claude — post @claude comment
app.post('/trigger-claude', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, message } = body

  if (!fullName || !number || !type) {
    return c.json({ error: 'Missing required fields: fullName, number, type' }, 400)
  }

  const comment = message || '@claude Please review and help resolve this.'
  const ghType = type === 'pr' ? 'pr' : 'issue'

  const result = gh([
    ghType, 'comment',
    String(number), '--repo', fullName, '--body', comment,
  ])

  if (result.error) {
    return c.json({ error: result.error }, 500)
  }

  return c.json({ ok: true, message: `Comment posted on ${type} #${number}` })
})

// POST /api/github/comment — post a custom comment on an issue or PR
app.post('/comment', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, comment } = body

  if (!fullName || !number || !type || !comment) {
    return c.json({ error: 'Missing required fields: fullName, number, type, comment' }, 400)
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const result = gh([ghType, 'comment', String(number), '--repo', fullName, '--body', comment])

  if (result.error) {
    return c.json({ error: result.error }, 500)
  }

  return c.json({ ok: true })
})

// POST /api/github/label — add a label to an issue or PR
app.post('/label', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, label } = body

  if (!fullName || !number || !type || !label) {
    return c.json({ error: 'Missing required fields: fullName, number, type, label' }, 400)
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const proc = Bun.spawnSync(
    ['gh', ghType, 'edit', String(number), '--repo', fullName, '--add-label', label],
    { env: { ...process.env } }
  )

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  return c.json({ ok: true })
})

// DELETE /api/github/label — remove a label from an issue or PR
app.delete('/label', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, label } = body

  if (!fullName || !number || !type || !label) {
    return c.json({ error: 'Missing required fields: fullName, number, type, label' }, 400)
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const proc = Bun.spawnSync(
    ['gh', ghType, 'edit', String(number), '--repo', fullName, '--remove-label', label],
    { env: { ...process.env } }
  )

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  return c.json({ ok: true })
})

// POST /api/github/label-trigger — add "claude" label to issue
app.post('/label-trigger', async (c) => {
  const body = await c.req.json()
  const { fullName, number } = body

  if (!fullName || !number) {
    return c.json({ error: 'Missing required fields: fullName, number' }, 400)
  }

  const proc = Bun.spawnSync([
    'gh', 'issue', 'edit', String(number),
    '--repo', fullName, '--add-label', 'claude',
  ])

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  return c.json({ ok: true })
})

// POST /api/github/create-pr — create a PR from a branch
app.post('/create-pr', async (c) => {
  const body = await c.req.json()
  const { fullName, head, base, title, prBody } = body

  if (!fullName || !head || !base || !title) {
    return c.json({ error: 'Missing required fields: fullName, head, base, title' }, 400)
  }

  const args = ['pr', 'create', '--repo', fullName, '--head', head, '--base', base, '--title', title]
  if (prBody) args.push('--body', prBody)

  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  const url = proc.stdout.toString().trim()
  return c.json({ ok: true, url })
})

export default app
