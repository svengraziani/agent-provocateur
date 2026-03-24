export interface Repo {
  id: number
  owner: string
  name: string
  fullName: string
  description: string | null
  color: string
  createdAt: string | number | null
}

export type AuthorAssociation = 'OWNER' | 'MEMBER' | 'COLLABORATOR' | 'CONTRIBUTOR' | 'FIRST_TIME_CONTRIBUTOR' | 'FIRST_TIMER' | 'NONE'
export type PROrigin = 'internal' | 'external'

export function getPROrigin(pr: { authorAssociation?: AuthorAssociation }): PROrigin {
  const internal: AuthorAssociation[] = ['OWNER', 'MEMBER', 'COLLABORATOR']
  return pr.authorAssociation && internal.includes(pr.authorAssociation) ? 'internal' : 'external'
}

export interface GHPR {
  number: number
  title: string
  state: string
  reviewDecision: 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  headRefName: string
  author: { login: string }
  createdAt: string
  updatedAt: string
  labels: { name: string; color: string }[]
  isDraft: boolean
  assignees: { login: string }[]
  authorAssociation?: AuthorAssociation
  previewUrl?: string | null
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

export interface Branch {
  name: string
  committedDate: string
}

export interface BranchesData {
  branches: Branch[]
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
  runningActions: number
}

export interface WorkflowRun {
  databaseId: number
  name: string
  status: 'in_progress' | 'queued' | 'waiting'
  headBranch: string
  workflowName: string
  displayTitle?: string
  claudeIssueNumber?: number
}

export interface ClaudeIssuePRInfo {
  head: string
  base: string
  title: string
  body: string
}

export interface ClaudeIssuePRInfo {
  head: string
  base: string
  title: string
  body: string
}

export interface RepoData {
  fullName: string
  prs: GHPR[]
  issues: GHIssue[]
  stats: RepoStats
  conflicts: GHPR[]
  needsReview: GHPR[]
  claudeIssues: GHIssue[]
  activeClaudeIssues: number[]
  claudeIssuePRLinks: Record<number, ClaudeIssuePRInfo>
  runningWorkflows: WorkflowRun[]
  branches: Branch[]
  defaultBranch: string
  hasClaudeYml: boolean
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
  authorAssociation?: AuthorAssociation
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

export interface RepoMetaLanguage {
  name: string
  color: string
  percentage: number
}

export interface RepoMetaContributor {
  login: string
  avatarUrl: string
  contributions: number
}

export interface RepoMeta {
  stars: number
  forks: number
  watchers: number
  primaryLanguage: { name: string; color: string } | null
  languages: RepoMetaLanguage[]
  topics: string[]
  contributors: RepoMetaContributor[]
  commitWeeks: number[] // last 26 weeks of commit counts
  createdAt: string
  pushedAt: string
}

export interface FeedItem {
  type: 'issue' | 'pr'
  feedCategory: 'mention' | 'issue' | 'pr'
  number: number
  title: string
  url: string
  repo: string
  author: string
  updatedAt: string
  labels: { name: string; color: string }[]
  isDraft?: boolean
  state?: string
}

export interface FeedData {
  mentions: FeedItem[]
}

export interface SetupCheck {
  id: string
  label: string
  ok: boolean
  detail?: string | null
  fix?: string | null
}

export interface SetupStatus {
  ready: boolean
  mode: 'docker' | 'local'
  checks: SetupCheck[]
}

export interface MapTile {
  type: string
  color: string
}

export interface ClawComConfig {
  clawType: 'openclaw' | 'nanoclaw'
  host: string
  configured: boolean
}

export interface HealthcheckEndpoint {
  url: string
  label: string
}

export interface HealthcheckConfig {
  endpoints: HealthcheckEndpoint[]
  intervalMs: number
  configured: boolean
}

export interface HealthcheckResult {
  id: number
  buildingId: number
  url: string
  ok: number
  statusCode: number | null
  responseTimeMs: number | null
  error: string | null
  checkedAt: string | number | null
}

export interface Building {
  id: number
  type: string
  name: string
  color: string
  posX: number
  posY: number
  config: string // JSON-encoded ClawComConfig or {}
  createdAt: string | number | null
  updatedAt: string | number | null
}

export interface ClawComMessage {
  id: number
  buildingId: number
  direction: 'in' | 'out'
  content: string
  createdAt: string | number | null
}

export interface GameMap {
  id: number
  name: string
  width: number
  height: number
  tiles: string // JSON-encoded Record<string, MapTile> keyed by "col,row"
  createdAt: string | number | null
  updatedAt: string | number | null
  assignedRepos?: Repo[]
}

export interface Badge {
  id: number
  name: string
  filename: string
  originalFilename: string
  mimeType: string
  createdAt: string | number | null
}

export interface PlacedBadge {
  id: number
  badgeId: number
  badge?: Badge
  label: string
  posX: number
  posY: number
  scale: number
  mapId: number | null
  createdAt: string | number | null
  updatedAt: string | number | null
}

export interface DeadlineTimer {
  id: number
  name: string
  description: string | null
  deadline: string // ISO 8601 string
  color: string
  createdAt: string | number | null
  updatedAt: string | number | null
}

export interface BattlefieldUser {
  login: string
  avatarUrl: string
  lastRepoId?: number
}
