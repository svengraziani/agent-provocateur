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

function fetchNetlifyUrls(fullName: string, prs: any[]): Record<number, string> {
  if (prs.length === 0) return {}

  const deploymentsResult = gh(['api', `repos/${fullName}/deployments?per_page=50`])
  if (deploymentsResult.error || !deploymentsResult.data?.length) return {}

  const prsByRef = new Map<string, number>(prs.map((pr: any) => [pr.headRefName, pr.number]))
  const urlsByPrNumber: Record<number, string> = {}

  const previewDeployments = deploymentsResult.data.filter((d: any) => {
    const env = (d.environment || '').toLowerCase()
    return env.includes('preview') || env.includes('deploy-preview') || env.includes('staging')
  })

  for (const deployment of previewDeployments) {
    const prNumber = prsByRef.get(deployment.ref)
    if (!prNumber || urlsByPrNumber[prNumber]) continue

    const statusResult = gh(['api', `repos/${fullName}/deployments/${deployment.id}/statuses?per_page=1`])
    if (!statusResult.error && statusResult.data?.length > 0) {
      const status = statusResult.data[0]
      const url = status.environment_url || status.target_url
      if (url) urlsByPrNumber[prNumber] = url
    }
  }

  return urlsByPrNumber
}

const CLAUDE_BRANCH_RE = /^claude\/issue-(\d+)-/

interface WorkflowRun {
  databaseId: number
  name: string
  status: 'in_progress' | 'queued' | 'waiting'
  headBranch: string
  workflowName: string
}

interface RunningWorkflowsResult {
  activeClaudeIssues: number[]
  runningWorkflows: WorkflowRun[]
}

function fetchRunningWorkflows(fullName: string): RunningWorkflowsResult {
  const result = gh([
    'run', 'list', '--repo', fullName,
    '--json', 'status,headBranch,databaseId,name,workflowName',
    '--limit', '30',
  ])
  if (result.error || !result.data) return { activeClaudeIssues: [], runningWorkflows: [] }

  const activeIssues = new Set<number>()
  const runningWorkflows: WorkflowRun[] = []

  for (const run of result.data) {
    const status = run.status as string
    if (status === 'in_progress' || status === 'queued' || status === 'waiting') {
      runningWorkflows.push({
        databaseId: run.databaseId,
        name: run.name || '',
        status: status as WorkflowRun['status'],
        headBranch: run.headBranch || '',
        workflowName: run.workflowName || run.name || '',
      })
      const match = run.headBranch?.match(CLAUDE_BRANCH_RE)
      if (match) activeIssues.add(Number(match[1]))
    }
  }

  return { activeClaudeIssues: Array.from(activeIssues), runningWorkflows }
}

function fetchRepoData(fullName: string) {
  const prResult = gh([
    'pr', 'list', '--repo', fullName, '--json',
    'number,title,state,reviewDecision,mergeable,headRefName,author,updatedAt,labels,isDraft,assignees',
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
      stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, approved: 0, drafts: 0, claudeIssues: 0, runningActions: 0 },
      conflicts: [],
      needsReview: [],
      claudeIssues: [],
      activeClaudeIssues: [],
      runningWorkflows: [],
      error: prResult.error || issueResult.error,
    }
  }

  const prs = prResult.data || []
  const issues = issueResult.data || []

  const previewUrls = fetchNetlifyUrls(fullName, prs)
  const enrichedPrs = prs.map((pr: any) => ({
    ...pr,
    previewUrl: previewUrls[pr.number] || null,
  }))

  const conflicts = enrichedPrs.filter((pr: any) => pr.mergeable === 'CONFLICTING')
  const needsReview = enrichedPrs.filter(
    (pr: any) => pr.reviewDecision === 'REVIEW_REQUIRED' || pr.reviewDecision === null
  ).filter((pr: any) => !pr.isDraft)
  const approved = enrichedPrs.filter((pr: any) => pr.reviewDecision === 'APPROVED')
  const drafts = enrichedPrs.filter((pr: any) => pr.isDraft)
  const claudeIssues = issues.filter((issue: any) =>
    issue.labels?.some((label: any) =>
      CLAUDE_LABELS.includes(label.name?.toLowerCase())
    )
  )

  const { activeClaudeIssues, runningWorkflows } = fetchRunningWorkflows(fullName)

  return {
    fullName,
    prs: enrichedPrs,
    issues,
    stats: {
      openPRs: enrichedPrs.length,
      openIssues: issues.length,
      conflicts: conflicts.length,
      needsReview: needsReview.length,
      approved: approved.length,
      drafts: drafts.length,
      claudeIssues: claudeIssues.length,
      runningActions: runningWorkflows.length,
    },
    conflicts,
    needsReview,
    claudeIssues,
    activeClaudeIssues,
    runningWorkflows,
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

// GET /api/github/branches/:owner/:name — list branches for a repo, sorted by commit date desc
app.get('/branches/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')

  const graphqlQuery = `{
    repository(owner: "${owner}", name: "${name}") {
      defaultBranchRef { name }
      refs(refPrefix: "refs/heads/", first: 100) {
        nodes {
          name
          target {
            ... on Commit {
              committedDate
            }
          }
        }
      }
    }
  }`

  const result = gh(['api', 'graphql', '-f', `query=${graphqlQuery}`])
  if (result.error) return c.json({ error: result.error }, 500)

  const repo = result.data?.data?.repository
  if (!repo) return c.json({ error: 'Failed to fetch branches' }, 500)

  const defaultBranch: string = repo.defaultBranchRef?.name || 'main'
  const branches: { name: string; committedDate: string }[] = (repo.refs?.nodes || [])
    .map((node: any) => ({
      name: node.name,
      committedDate: node.target?.committedDate || '',
    }))
    .sort((a: any, b: any) => {
      if (!a.committedDate && !b.committedDate) return 0
      if (!a.committedDate) return 1
      if (!b.committedDate) return -1
      return new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime()
    })

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

// GET /api/github/issue/:owner/:name/:number — fetch issue details
app.get('/issue/:owner/:name/:number', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const number = c.req.param('number')
  const fullName = `${owner}/${name}`

  const result = gh([
    'issue', 'view', number, '--repo', fullName,
    '--json', 'number,title,body,state,labels,assignees,author,url,createdAt,comments',
  ])

  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(result.data)
})

// POST /api/github/create-issue — create a new issue
app.post('/create-issue', async (c) => {
  const body = await c.req.json()
  const { fullName, title, issueBody, labels } = body

  if (!fullName || !title) {
    return c.json({ error: 'Missing required fields: fullName, title' }, 400)
  }

  const args = ['issue', 'create', '--repo', fullName, '--title', title]
  if (issueBody) args.push('--body', issueBody)
  if (labels && labels.length > 0) {
    args.push('--label', labels.join(','))
  }

  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  const url = proc.stdout.toString().trim()
  return c.json({ ok: true, url })
})

// GET /api/github/pr/:owner/:name/:number — fetch PR details
app.get('/pr/:owner/:name/:number', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const number = c.req.param('number')
  const fullName = `${owner}/${name}`

  const result = gh([
    'pr', 'view', number, '--repo', fullName,
    '--json', 'number,title,body,state,labels,assignees,author,url,createdAt,comments,reviewDecision,mergeable,headRefName,baseRefName,isDraft',
  ])

  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(result.data)
})

// POST /api/github/create-repo — create a new GitHub repository and track it
app.post('/create-repo', async (c) => {
  const body = await c.req.json()
  const { name, description, visibility } = body

  if (!name) {
    return c.json({ error: 'Missing required field: name' }, 400)
  }

  if (visibility !== 'public' && visibility !== 'private') {
    return c.json({ error: 'visibility must be "public" or "private"' }, 400)
  }

  // Get authenticated user to build fullName
  const userResult = gh(['api', 'user', '--jq', '.login'])
  if (userResult.error || !userResult.data) {
    return c.json({ error: 'Failed to get authenticated GitHub user' }, 500)
  }
  const owner = userResult.data.trim ? userResult.data.trim() : String(userResult.data).trim()
  const fullName = `${owner}/${name}`

  const args = ['repo', 'create', name, `--${visibility}`]
  if (description) args.push('--description', description)

  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })
  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  // Add the newly created repo to the tracked repos DB
  try {
    const result = await db.insert(repos).values({
      owner,
      name,
      fullName,
      description: description || null,
      color: '#00ff88',
    }).returning()

    return c.json({ ok: true, repo: result[0] }, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Repository already tracked' }, 409)
    }
    return c.json({ error: 'Repository created but failed to track it' }, 500)
  }
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
