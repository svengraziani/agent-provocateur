import { useState, useEffect, useCallback } from 'react'
import type { DashboardEntry, FeedItem } from '../types'
import { api } from '../api'
import { SidePanel } from './SidePanel'

type FeedTab = 'mentions' | 'issues' | 'prs'

interface FeedPanelProps {
  entries: DashboardEntry[]
  isOpen: boolean
  onClose: () => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function FeedItemRow({ item }: { item: FeedItem }) {
  const typeIcon = item.type === 'pr' ? '⎇' : '●'
  const typeClass = item.type === 'pr' ? 'feed-item-pr' : 'feed-item-issue'
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`feed-item ${typeClass}`}
      title={`${item.repo}#${item.number}`}
    >
      <span className="feed-item-icon">{typeIcon}</span>
      <div className="feed-item-body">
        <div className="feed-item-title">{item.title}</div>
        <div className="feed-item-meta">
          <span className="feed-item-repo">{item.repo.split('/')[1] ?? item.repo}</span>
          <span className="feed-item-num">#{item.number}</span>
          {item.isDraft && <span className="feed-item-draft">DRAFT</span>}
          {item.labels.slice(0, 2).map((l) => (
            <span
              key={l.name}
              className="feed-item-label"
              style={{ borderColor: `#${l.color}`, color: `#${l.color}` }}
            >
              {l.name}
            </span>
          ))}
          <span className="feed-item-time">{timeAgo(item.updatedAt)}</span>
        </div>
      </div>
    </a>
  )
}

export function FeedPanel({ entries, isOpen, onClose }: FeedPanelProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('mentions')
  const [mentions, setMentions] = useState<FeedItem[]>([])
  const [mentionsLoading, setMentionsLoading] = useState(false)
  const [mentionsError, setMentionsError] = useState<string | null>(null)

  const fetchMentions = useCallback(() => {
    setMentionsLoading(true)
    setMentionsError(null)
    Promise.all([
      api.getFeed().catch(() => ({ mentions: [] })),
      api.getGitLabFeed().catch(() => ({ mentions: [] })),
    ])
      .then(([ghData, glData]) => {
        const all = [...(ghData.mentions || []), ...(glData.mentions || [])]
        all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        setMentions(all)
      })
      .catch((err) => setMentionsError(err.message ?? 'Failed to load mentions'))
      .finally(() => setMentionsLoading(false))
  }, [])

  useEffect(() => {
    if (isOpen && activeTab === 'mentions') {
      fetchMentions()
    }
  }, [isOpen, activeTab, fetchMentions])

  // Aggregate open issues from all entries
  const allIssues: FeedItem[] = entries.flatMap((entry) =>
    entry.data.issues.map((issue) => {
      const base = entry.repo.provider === 'gitlab'
        ? (entry.repo.instanceUrl ?? 'https://gitlab.com')
        : 'https://github.com'
      const path = entry.repo.provider === 'gitlab'
        ? `/${entry.repo.fullName}/-/issues/${issue.number}`
        : `/${entry.repo.fullName}/issues/${issue.number}`
      return {
        type: 'issue' as const,
        feedCategory: 'issue' as const,
        number: issue.number,
        title: issue.title,
        url: `${base}${path}`,
        repo: entry.repo.fullName,
        author: issue.author?.login ?? 'unknown',
        updatedAt: issue.updatedAt,
        labels: issue.labels,
        state: issue.state,
      }
    })
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  // Aggregate open PRs from all entries
  const allPRs: FeedItem[] = entries.flatMap((entry) =>
    entry.data.prs.map((pr) => {
      const base = entry.repo.provider === 'gitlab'
        ? (entry.repo.instanceUrl ?? 'https://gitlab.com')
        : 'https://github.com'
      const path = entry.repo.provider === 'gitlab'
        ? `/${entry.repo.fullName}/-/merge_requests/${pr.number}`
        : `/${entry.repo.fullName}/pull/${pr.number}`
      return {
        type: 'pr' as const,
        feedCategory: 'pr' as const,
        number: pr.number,
        title: pr.title,
        url: `${base}${path}`,
        repo: entry.repo.fullName,
        author: pr.author?.login ?? 'unknown',
        updatedAt: pr.updatedAt,
        labels: pr.labels,
        isDraft: pr.isDraft,
        state: pr.state,
      }
    })
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const tabCounts = {
    mentions: mentions.length,
    issues: allIssues.length,
    prs: allPRs.length,
  }

  const tabItems: Record<FeedTab, FeedItem[]> = {
    mentions,
    issues: allIssues,
    prs: allPRs,
  }

  if (!isOpen) return null

  return (
    <SidePanel className="feed-panel" onClose={onClose}>
      <div className="feed-panel-header">
        <span className="feed-panel-title">◈ INTEL FEED</span>
        <button className="feed-panel-close" onClick={onClose} title="Close [Esc]">✕</button>
      </div>

      <div className="feed-panel-tabs">
        {(['mentions', 'issues', 'prs'] as FeedTab[]).map((tab) => (
          <button
            key={tab}
            className={`feed-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'mentions' ? '@MENTIONS' : tab === 'issues' ? 'ISSUES' : 'PRS'}
            {tabCounts[tab] > 0 && (
              <span className="feed-tab-count">{tabCounts[tab]}</span>
            )}
          </button>
        ))}
        {activeTab === 'mentions' && (
          <button className="feed-refresh-btn" onClick={fetchMentions} disabled={mentionsLoading} title="Refresh mentions">
            {mentionsLoading ? '◌' : '↻'}
          </button>
        )}
      </div>

      <div className="feed-panel-body">
        {activeTab === 'mentions' && mentionsLoading && (
          <div className="feed-loading">◌ SCANNING MENTIONS...</div>
        )}
        {activeTab === 'mentions' && mentionsError && !mentionsLoading && (
          <div className="feed-error">⚠ {mentionsError}</div>
        )}
        {tabItems[activeTab].length === 0 && !mentionsLoading && !mentionsError && (
          <div className="feed-empty">
            {activeTab === 'mentions' ? 'No open @mentions found.' : activeTab === 'issues' ? 'No open issues across tracked repos.' : 'No open PRs across tracked repos.'}
          </div>
        )}
        {tabItems[activeTab].map((item) => (
          <FeedItemRow key={`${item.repo}-${item.type}-${item.number}`} item={item} />
        ))}
      </div>
    </SidePanel>
  )
}
