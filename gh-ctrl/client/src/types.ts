export interface Repo {
  id: number
  owner: string
  name: string
  fullName: string
  description: string | null
  color: string
  createdAt: string | number | null
}

export interface GHPR {
  number: number
  title: string
  state: string
  reviewDecision: 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  headRefName: string
  author: { login: string }
  updatedAt: string
  labels: { name: string; color: string }[]
  isDraft: boolean
  assignees: { login: string }[]
}

export interface GHIssue {
  number: number
  title: string
  state: string
  labels: { name: string; color: string }[]
  assignees: { login: string }[]
  updatedAt: string
  author: { login: string }
}

export interface GHLabel {
  name: string
  color: string
  description: string
}

export interface BranchesData {
  branches: string[]
  defaultBranch: string
}

export interface RepoStats {
  openPRs: number
  openIssues: number
  conflicts: number
  needsReview: number
  approved: number
  drafts: number
  claudeIssues: number
}

export interface RepoData {
  fullName: string
  prs: GHPR[]
  issues: GHIssue[]
  stats: RepoStats
  conflicts: GHPR[]
  needsReview: GHPR[]
  claudeIssues: GHIssue[]
  error: string | null
}

export interface DashboardEntry {
  repo: Repo
  data: RepoData
}

export interface PRDetail {
  number: number
  title: string
  body: string
  state: string
  labels: { name: string; color: string }[]
  assignees: { login: string }[]
  author: { login: string }
  url: string
  createdAt: string
  reviewDecision: 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  headRefName: string
  baseRefName: string
  isDraft: boolean
  comments: { author: { login: string }; body: string; createdAt: string }[]
}

export interface IssueDetail {
  number: number
  title: string
  body: string
  state: string
  labels: { name: string; color: string }[]
  assignees: { login: string }[]
  author: { login: string }
  url: string
  createdAt: string
  comments: { author: { login: string }; body: string; createdAt: string }[]
}
