import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db'
import { repos } from '../db/schema'
import { uploadImages } from '../lib/uploadImages'

interface GHResult {
  data: any
  error: string | null
}

async function gh(args: string[]): Promise<GHResult> {
  const proc = Bun.spawn(['gh', ...args], { env: { ...process.env } })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    return { data: null, error: stderr }
  }
  try {
    return { data: JSON.parse(stdout), error: null }
  } catch {
    return { data: null, error: 'Failed to parse gh output' }
  }
}

const CLAUDE_LABELS = ['claude', 'ai', 'ai-fix', 'ai-feature']

async function fetchNetlifyUrls(fullName: string, prs: any[]): Promise<Record<number, string>> {
  if (prs.length === 0) return {}

  const deploymentsResult = await gh(['api', `repos/${fullName}/deployments?per_page=50`])
  if (deploymentsResult.error || !deploymentsResult.data?.length) return {}

  const prsByRef = new Map<string, number>(prs.map((pr: any) => [pr.headRefName, pr.number]))
  const urlsByPrNumber: Record<number, string> = {}

  const previewDeployments = deploymentsResult.data.filter((d: any) => {
    const env = (d.environment || '').toLowerCase()
    return env.includes('preview') || env.includes('deploy-preview') || env.includes('staging')
  })

  // Fetch all deployment statuses concurrently
  await Promise.all(
    previewDeployments.map(async (deployment: any) => {
      const prNumber = prsByRef.get(deployment.ref)
      if (!prNumber || urlsByPrNumber[prNumber]) return

      const statusResult = await gh(['api', `repos/${fullName}/deployments/${deployment.id}/statuses?per_page=1`])
      if (!statusResult.error && statusResult.data?.length > 0) {
        const status = statusResult.data[0]
        const url = status.environment_url || status.target_url
        if (url && !urlsByPrNumber[prNumber]) urlsByPrNumber[prNumber] = url
      }
    })
  )

  return urlsByPrNumber
}

const CLAUDE_BRANCH_RE = /^claude\/issue-(\d+)-/

interface ClaudeIssuePRInfo {
  head: string
  base: string
  title: string
  body: string
}

async function fetchClaudeIssueBranches(fullName: string): Promise<Record<number, string>> {
  const result = await gh(['api', `repos/${fullName}/branches?per_page=100`])
  if (result.error || !Array.isArray(result.data)) return {}
  const map: Record<number, string> = {}
  for (const branch of result.data) {
    const match = (branch.name as string)?.match(CLAUDE_BRANCH_RE)
    if (match) map[Number(match[1])] = branch.name as string
  }
  return map
}

function parseGitHubComparePRLink(urlStr: string): ClaudeIssuePRInfo | null {
  try {
    const url = new URL(urlStr)
    const compareMatch = url.pathname.match(/\/compare\/(.+)$/)
    if (!compareMatch) return null
    const comparePart = compareMatch[1]
    const sepIdx = comparePart.indexOf('...')
    if (sepIdx === -1) return null
    const base = comparePart.slice(0, sepIdx)
    const head = comparePart.slice(sepIdx + 3)
    if (!base || !head) return null
    const title = url.searchParams.get('title') || ''
    const body = url.searchParams.get('body') || ''
    return { base, head, title, body }
  } catch {
    return null
  }
}

const PR_LINKS_CACHE_TTL_MS = 30_000
const prLinksCache = new Map<string, { data: Record<number, ClaudeIssuePRInfo>; expiresAt: number }>()

function fetchClaudeIssuePRLinks(fullName: string, issueNumbers: number[], existingPrHeads: Set<string>): Record<number, ClaudeIssuePRInfo> {
  if (issueNumbers.length === 0) return {}

  const cached = prLinksCache.get(fullName)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const result: Record<number, ClaudeIssuePRInfo> = {}
  for (const issueNumber of issueNumbers) {
    const res = gh(['issue', 'view', String(issueNumber), '--repo', fullName, '--json', 'comments'])
    if (res.error || !Array.isArray(res.data?.comments)) continue
    const comments: { body: string }[] = res.data.comments
    for (const comment of [...comments].reverse()) {
      const m = comment.body?.match(/\[Create (?:a )?PR[^\]]*\]\((https:\/\/github\.com\/[^)]+)\)/)
      if (!m) continue
      const info = parseGitHubComparePRLink(m[1])
      if (info && !existingPrHeads.has(info.head)) { result[issueNumber] = info; break }
    }
  }

  prLinksCache.set(fullName, { data: result, expiresAt: Date.now() + PR_LINKS_CACHE_TTL_MS })
  return result
}

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

async function fetchRunningWorkflows(fullName: string): Promise<RunningWorkflowsResult> {
  const result = await gh([
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

async function fetchRepoData(fullName: string) {
  // PRs and issues are independent — fetch in parallel
  const [prResult, issueResult] = await Promise.all([
    gh([
      'pr', 'list', '--repo', fullName, '--json',
      'number,title,state,reviewDecision,mergeable,headRefName,author,createdAt,updatedAt,labels,isDraft,assignees',
      '--limit', '30',
    ]),
    gh([
      'issue', 'list', '--repo', fullName, '--json',
      'number,title,state,labels,assignees,updatedAt,author',
      '--limit', '30',
    ]),
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
      claudeIssuePRLinks: {},
      runningWorkflows: [],
      error: prResult.error || issueResult.error,
    }
  }

  const prs = prResult.data || []
  const issues = issueResult.data || []

  // Netlify URLs depend on prs, but workflows and branches are independent
  const [previewUrls, { activeClaudeIssues, runningWorkflows }, claudeIssueBranches] = await Promise.all([
    fetchNetlifyUrls(fullName, prs),
    fetchRunningWorkflows(fullName),
    fetchClaudeIssueBranches(fullName),
  ])

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

  const existingPrHeads = new Set<string>(prs.map((pr: any) => pr.headRefName as string))
  const claudeIssuePRLinks = fetchClaudeIssuePRLinks(fullName, issues.map((i: any) => i.number), existingPrHeads)


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
    claudeIssuePRLinks,
    runningWorkflows,
    error: null,
  }
}

const app = new Hono()

// GET /api/github/dashboard — fetch all repos in parallel (non-streaming)
app.get('/dashboard', async (c) => {
  const allRepos = await db.select().from(repos)

  const results = await Promise.all(
    allRepos.map(async (repo) => ({
      repo,
      data: await fetchRepoData(repo.fullName),
    }))
  )

  return c.json(results)
})

// GET /api/github/dashboard/stream — SSE: emit each repo as it finishes loading
app.get('/dashboard/stream', (c) => {
  return streamSSE(c, async (stream) => {
    const allRepos = await db.select().from(repos)

    await Promise.all(
      allRepos.map(async (repo) => {
        const data = await fetchRepoData(repo.fullName)
        await stream.writeSSE({
          data: JSON.stringify({ repo, data }),
          event: 'repo',
        })
      })
    )

    await stream.writeSSE({ data: 'done', event: 'done' })
  })
})

// GET /api/github/repo/:owner/:name — refresh single repo
app.get('/repo/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const fullName = `${owner}/${name}`
  const data = await fetchRepoData(fullName)
  return c.json(data)
})

// GET /api/github/meta/:owner/:name — fetch repo meta: stars, languages, topics, contributors, commit history
app.get('/meta/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const fullName = `${owner}/${name}`

  // Fetch repo info + languages + topics via GraphQL
  const graphqlQuery = `{
    repository(owner: "${owner}", name: "${name}") {
      stargazerCount
      forkCount
      watchers { totalCount }
      createdAt
      pushedAt
      primaryLanguage { name color }
      languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
        totalSize
        edges {
          size
          node { name color }
        }
      }
      repositoryTopics(first: 15) {
        nodes { topic { name } }
      }
    }
  }`

  const [repoResult, contributorsResult, commitActivityResult] = await Promise.all([
    gh(['api', 'graphql', '-f', `query=${graphqlQuery}`]),
    gh(['api', `repos/${fullName}/contributors?per_page=5&anon=false`]),
    gh(['api', `repos/${fullName}/stats/commit_activity`]),
  ])

  const repoData = repoResult.data?.data?.repository

  // Build languages array with percentages
  const totalSize: number = repoData?.languages?.totalSize || 1
  const languages = (repoData?.languages?.edges || []).map((edge: any) => ({
    name: edge.node.name,
    color: edge.node.color || '#8b8b8b',
    percentage: Math.round((edge.size / totalSize) * 1000) / 10,
  }))

  // Topics
  const topics = (repoData?.repositoryTopics?.nodes || []).map((n: any) => n.topic.name)

  // Contributors
  const contributors = (contributorsResult.data || []).slice(0, 5).map((u: any) => ({
    login: u.login,
    avatarUrl: u.avatar_url,
    contributions: u.contributions,
  }))

  // Commit weeks — last 26 weeks (commitActivity gives 52 weeks of {week, total, days[]})
  const allWeeks: any[] = commitActivityResult.data || []
  const commitWeeks = allWeeks.slice(-26).map((w: any) => w.total || 0)

  return c.json({
    stars: repoData?.stargazerCount ?? 0,
    forks: repoData?.forkCount ?? 0,
    watchers: repoData?.watchers?.totalCount ?? 0,
    primaryLanguage: repoData?.primaryLanguage ?? null,
    languages,
    topics,
    contributors,
    commitWeeks,
    createdAt: repoData?.createdAt ?? '',
    pushedAt: repoData?.pushedAt ?? '',
  })
})

// GET /api/github/labels/:owner/:name — list available labels for a repo
app.get('/labels/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const fullName = `${owner}/${name}`
  const result = await gh(['label', 'list', '--repo', fullName, '--json', 'name,color,description', '--limit', '100'])
  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(result.data || [])
})

// GET /api/github/collaborators/:owner/:name — list collaborator logins for assignee picker
app.get('/collaborators/:owner/:name', async (c) => {
  const owner = c.req.param('owner')
  const name = c.req.param('name')
  const result = await gh(['api', `repos/${owner}/${name}/collaborators?per_page=100`])
  if (result.error) return c.json({ error: result.error }, 500)
  const collaborators = (result.data || []).map((u: any) => ({ login: u.login }))
  return c.json(collaborators)
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

  const result = await gh(['api', 'graphql', '-f', `query=${graphqlQuery}`])
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
  let fullName: string, number: number, type: string, message: string | undefined
  let imageFiles: File[] = []

  const ct = c.req.header('content-type') || ''
  if (ct.includes('multipart/form-data')) {
    const fd = await c.req.formData()
    fullName = fd.get('fullName') as string
    number = Number(fd.get('number'))
    type = fd.get('type') as string
    message = (fd.get('message') as string) || undefined
    imageFiles = fd.getAll('images').filter((f) => f instanceof File) as File[]
  } else {
    const body = await c.req.json()
    ;({ fullName, number, type, message } = body)
  }

  if (!fullName || !number || !type) {
    return c.json({ error: 'Missing required fields: fullName, number, type' }, 400)
  }

  let comment = message || '@claude Please review and help resolve this.'

  if (imageFiles.length > 0) {
    try {
      const urls = await uploadImages(imageFiles, fullName)
      if (urls.length > 0) {
        comment += '\n\n' + urls.map((url) => `![](${url})`).join('\n')
      }
    } catch (err: any) {
      return c.json({ error: `Image upload failed: ${err.message}` }, 500)
    }
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'

  const result = await gh([
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
  let fullName: string, number: number, type: string, comment: string
  let imageFiles: File[] = []

  const ct = c.req.header('content-type') || ''
  if (ct.includes('multipart/form-data')) {
    const fd = await c.req.formData()
    fullName = fd.get('fullName') as string
    number = Number(fd.get('number'))
    type = fd.get('type') as string
    comment = fd.get('comment') as string
    imageFiles = fd.getAll('images').filter((f) => f instanceof File) as File[]
  } else {
    const body = await c.req.json()
    ;({ fullName, number, type, comment } = body)
  }

  if (!fullName || !number || !type || !comment) {
    return c.json({ error: 'Missing required fields: fullName, number, type, comment' }, 400)
  }

  let finalComment = comment

  if (imageFiles.length > 0) {
    try {
      const urls = await uploadImages(imageFiles, fullName)
      if (urls.length > 0) {
        finalComment += '\n\n' + urls.map((url) => `![](${url})`).join('\n')
      }
    } catch (err: any) {
      return c.json({ error: `Image upload failed: ${err.message}` }, 500)
    }
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const result = await gh([ghType, 'comment', String(number), '--repo', fullName, '--body', finalComment])

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

// POST /api/github/assign — add assignees to an issue or PR
app.post('/assign', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, assignees } = body

  if (!fullName || !number || !type || !assignees?.length) {
    return c.json({ error: 'Missing required fields: fullName, number, type, assignees' }, 400)
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const args = [ghType, 'edit', String(number), '--repo', fullName]
  for (const login of assignees) {
    args.push('--add-assignee', login)
  }

  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })
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

  const result = await gh([
    'issue', 'view', number, '--repo', fullName,
    '--json', 'number,title,body,state,labels,assignees,author,url,createdAt,comments',
  ])

  if (result.error) return c.json({ error: result.error }, 500)
  return c.json(result.data)
})

// POST /api/github/create-issue — create a new issue
app.post('/create-issue', async (c) => {
  let fullName: string, title: string, issueBody: string | undefined, labels: string[] | undefined
  let imageFiles: File[] = []

  const ct = c.req.header('content-type') || ''
  if (ct.includes('multipart/form-data')) {
    const fd = await c.req.formData()
    fullName = fd.get('fullName') as string
    title = fd.get('title') as string
    issueBody = (fd.get('issueBody') as string) || undefined
    const labelsJson = fd.get('labels') as string
    labels = labelsJson ? JSON.parse(labelsJson) : undefined
    imageFiles = fd.getAll('images').filter((f) => f instanceof File) as File[]
  } else {
    const body = await c.req.json()
    ;({ fullName, title, issueBody, labels } = body)
  }

  if (!fullName || !title) {
    return c.json({ error: 'Missing required fields: fullName, title' }, 400)
  }

  let finalBody = issueBody

  if (imageFiles.length > 0) {
    try {
      const urls = await uploadImages(imageFiles, fullName)
      if (urls.length > 0) {
        const imgMarkdown = urls.map((url) => `![](${url})`).join('\n')
        finalBody = finalBody ? `${finalBody}\n\n${imgMarkdown}` : imgMarkdown
      }
    } catch (err: any) {
      return c.json({ error: `Image upload failed: ${err.message}` }, 500)
    }
  }

  const args = ['issue', 'create', '--repo', fullName, '--title', title]
  if (finalBody) args.push('--body', finalBody)
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

  const result = await gh([
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
  const userResult = await gh(['api', 'user'])
  if (userResult.error || !userResult.data?.login) {
    return c.json({ error: 'Failed to get authenticated GitHub user' }, 500)
  }
  const owner = userResult.data.login
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

// POST /api/github/assignee — add an assignee to an issue or PR
app.post('/assignee', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, assignee } = body

  if (!fullName || !number || !type || !assignee) {
    return c.json({ error: 'Missing required fields: fullName, number, type, assignee' }, 400)
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const proc = Bun.spawnSync(
    ['gh', ghType, 'edit', String(number), '--repo', fullName, '--add-assignee', assignee],
    { env: { ...process.env } }
  )

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  return c.json({ ok: true })
})

// DELETE /api/github/assignee — remove an assignee from an issue or PR
app.delete('/assignee', async (c) => {
  const body = await c.req.json()
  const { fullName, number, type, assignee } = body

  if (!fullName || !number || !type || !assignee) {
    return c.json({ error: 'Missing required fields: fullName, number, type, assignee' }, 400)
  }

  const ghType = type === 'pr' ? 'pr' : 'issue'
  const proc = Bun.spawnSync(
    ['gh', ghType, 'edit', String(number), '--repo', fullName, '--remove-assignee', assignee],
    { env: { ...process.env } }
  )

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  return c.json({ ok: true })
})

// POST /api/github/create-pr — create a PR from a branch
app.post('/create-pr', async (c) => {
  const body = await c.req.json()
  const { fullName, head, base, title, prBody, assignees } = body

  if (!fullName || !head || !base || !title) {
    return c.json({ error: 'Missing required fields: fullName, head, base, title' }, 400)
  }

  const args = ['pr', 'create', '--repo', fullName, '--head', head, '--base', base, '--title', title]
  if (prBody) args.push('--body', prBody)
  if (assignees && assignees.length > 0) args.push('--assignee', assignees.join(','))

  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })

  if (proc.exitCode !== 0) {
    return c.json({ error: proc.stderr.toString() }, 500)
  }

  const url = proc.stdout.toString().trim()
  return c.json({ ok: true, url })
})

export default app
