/**
 * Provider-agnostic normalized types.
 * GitHub PRs and GitLab Merge Requests are both represented as NormalizedMR.
 * GitHub Actions and GitLab CI Pipelines are both represented as NormalizedPipeline.
 */

export interface NormalizedAuthor {
  login: string
  avatarUrl: string
  url: string
}

export interface NormalizedLabel {
  name: string
  color: string
}

export interface NormalizedMR {
  number: number
  title: string
  url: string
  draft: boolean
  author: NormalizedAuthor
  labels: NormalizedLabel[]
  /** 'approved' | 'changes_requested' | 'pending' | null */
  reviewState: 'approved' | 'changes_requested' | 'pending' | null
  conflicting: boolean
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  headRefName: string
  createdAt: string
  updatedAt: string
  /** GitHub Netlify preview URL or GitLab environment URL */
  previewUrl: string | null
  isDraft: boolean
  assignees: NormalizedAuthor[]
}

export interface NormalizedIssue {
  number: number
  title: string
  url: string
  state: string
  author: NormalizedAuthor
  labels: NormalizedLabel[]
  assignees: NormalizedAuthor[]
  updatedAt: string
}

export interface NormalizedBranch {
  name: string
  committedDate: string
}

export interface NormalizedPipeline {
  id: number
  name: string
  status: 'running' | 'pending' | 'success' | 'failed' | 'canceled' | 'skipped' | 'unknown'
  ref: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface NormalizedRepoStats {
  openPRs: number
  openIssues: number
  conflicts: number
  needsReview: number
  approved: number
  drafts: number
  claudeIssues: number
  runningActions: number
}

export interface NormalizedRepoData {
  fullName: string
  provider: 'github' | 'gitlab'
  prs: NormalizedMR[]
  issues: NormalizedIssue[]
  stats: NormalizedRepoStats
  conflicts: NormalizedMR[]
  needsReview: NormalizedMR[]
  claudeIssues: NormalizedIssue[]
  activeClaudeIssues: number[]
  claudeIssuePRLinks: Record<number, unknown>
  runningWorkflows: NormalizedPipeline[]
  branches: NormalizedBranch[]
  defaultBranch: string
  hasClaudeYml: false
  error: string | null
}

export interface NormalizedRepoMeta {
  stars: number
  forks: number
  watchers: number
  primaryLanguage: { name: string; color: string } | null
  languages: { name: string; color: string; percentage: number }[]
  topics: string[]
  contributors: { login: string; avatarUrl: string; contributions: number }[]
  commitWeeks: number[]
  createdAt: string
  pushedAt: string
}
