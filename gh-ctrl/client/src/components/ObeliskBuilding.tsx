import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Building, ObeliskFile, ObeliskSearchResult, ObeliskConfig } from '../types'

interface Position { x: number; y: number }

interface ObeliskBuildingProps {
  building: Building
  position: Position
  isRelocateMode: boolean
  isBeingRelocated: boolean
  onStartRelocate: (mouseX: number, mouseY: number) => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  isSelected?: boolean
  onSelect?: () => void
  onDeselect?: () => void
}

function useColorizedImage(src: string, color: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const hex = color.replace('#', '')
      const tr = parseInt(hex.slice(0, 2), 16)
      const tg = parseInt(hex.slice(2, 4), 16)
      const tb = parseInt(hex.slice(4, 6), 16)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        if (g > r * 1.3 && g > b * 1.3 && g > 80) {
          const ratio = g / 255
          data[i] = Math.round(tr * ratio)
          data[i + 1] = Math.round(tg * ratio)
          data[i + 2] = Math.round(tb * ratio)
        }
      }
      ctx.putImageData(imageData, 0, 0)
      setDataUrl(canvas.toDataURL())
    }
    img.onerror = () => setDataUrl(null)
    img.src = src
  }, [src, color])
  return dataUrl
}

// ── Markdown renderer with WikiLink support ───────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderInlineWithWikiLinks(escaped: string, fileBasenames: Set<string>): string {
  return escaped
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
      /^https?:\/\//.test(url) ? `<img src="${escapeHtml(url)}" alt="${alt}" style="max-width:100%" />` : escapeHtml(`![${alt}](${url})`)
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
      /^https?:\/\/|^#|^\//.test(url)
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="obelisk-md-link">${text}</a>`
        : escapeHtml(`[${text}](${url})`)
    )
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const target = inner.trim()
      const exists = fileBasenames.has(target.toLowerCase()) || fileBasenames.has((target + '.md').toLowerCase())
      return `<span class="obelisk-wikilink${exists ? '' : ' obelisk-wikilink-missing'}" data-wikilink="${escapeHtml(target)}">${escapeHtml('[[' + target + ']]')}</span>`
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/`([^`\n]+)`/g, '<code class="obelisk-inline-code">$1</code>')
}

function renderMarkdownWithWikiLinks(text: string, fileBasenames: Set<string>): string {
  if (!text) return ''
  const lines = text.split('\n')
  const out: string[] = []
  let inCode = false
  let codeLines: string[] = []
  let codeLang = ''
  let listBuf: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (!listBuf) return
    const tag = listBuf.type
    out.push(`<${tag} class="obelisk-md-list">`)
    listBuf.items.forEach((item) => out.push(`<li>${item}</li>`))
    out.push(`</${tag}>`)
    listBuf = null
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList()
        inCode = true
        codeLang = line.slice(3).trim()
        codeLines = []
      } else {
        inCode = false
        const langAttr = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''
        out.push(`<pre class="obelisk-code-block"><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
      }
      continue
    }
    if (inCode) { codeLines.push(line); continue }
    if (line.trim() === '') { flushList(); continue }

    const h = line.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      flushList()
      const lvl = h[1].length
      out.push(`<h${lvl} class="obelisk-md-h${lvl}">${renderInlineWithWikiLinks(escapeHtml(h[2]), fileBasenames)}</h${lvl}>`)
      continue
    }
    const bq = line.match(/^>\s*(.*)$/)
    if (bq) {
      flushList()
      out.push(`<blockquote class="obelisk-md-blockquote">${renderInlineWithWikiLinks(escapeHtml(bq[1]), fileBasenames)}</blockquote>`)
      continue
    }
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList()
      out.push('<hr class="obelisk-md-hr" />')
      continue
    }
    const ul = line.match(/^[ \t]*[-*+]\s+(.+)$/)
    if (ul) {
      if (!listBuf || listBuf.type !== 'ul') { flushList(); listBuf = { type: 'ul', items: [] } }
      listBuf.items.push(renderInlineWithWikiLinks(escapeHtml(ul[1]), fileBasenames))
      continue
    }
    const ol = line.match(/^[ \t]*\d+\.\s+(.+)$/)
    if (ol) {
      if (!listBuf || listBuf.type !== 'ol') { flushList(); listBuf = { type: 'ol', items: [] } }
      listBuf.items.push(renderInlineWithWikiLinks(escapeHtml(ol[1]), fileBasenames))
      continue
    }
    flushList()
    out.push(`<p class="obelisk-md-p">${renderInlineWithWikiLinks(escapeHtml(line), fileBasenames)}</p>`)
  }
  if (inCode && codeLines.length > 0) {
    out.push(`<pre class="obelisk-code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }
  flushList()
  return out.join('')
}

// ── Fuzzy / full-text search ───────────────────────────────────────────────

interface LocalSearchResult { path: string; score: number; snippet: string }

function fuzzySearch(files: ObeliskFile[], query: string): LocalSearchResult[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean)
  const results: LocalSearchResult[] = []

  for (const file of files) {
    if (file.isDirectory) continue
    const pathLower = file.path.toLowerCase()
    const content = file.content ?? ''
    const contentLower = content.toLowerCase()
    let score = 0
    let snippet = ''

    for (const token of tokens) {
      if (pathLower.includes(token)) score += 10
      const basename = pathLower.split('/').pop() ?? ''
      if (basename === token || basename.replace(/\.md$/, '') === token) score += 15
      else if (basename.startsWith(token)) score += 5

      let idx = contentLower.indexOf(token)
      if (idx !== -1) {
        score += 2
        if (!snippet) {
          const start = Math.max(0, idx - 50)
          const end = Math.min(content.length, idx + token.length + 50)
          snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
        }
        while (idx !== -1) {
          idx = contentLower.indexOf(token, idx + 1)
          if (idx !== -1) score += 1
        }
      }
    }

    if (score > 0) results.push({ path: file.path, score, snippet })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 30)
}

// ── Graph view (SVG force simulation) ─────────────────────────────────────

interface GraphNode { id: string; label: string; x: number; y: number; vx: number; vy: number }
interface GraphEdge { source: string; target: string }

function extractWikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase())
}

function buildGraph(files: ObeliskFile[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const mdFiles = files.filter((f) => !f.isDirectory && f.path.endsWith('.md'))
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const pathToBasename = new Map<string, string>()
  const basenameToPath = new Map<string, string>()
  for (const f of mdFiles) {
    const base = f.path.split('/').pop()?.replace(/\.md$/, '').toLowerCase() ?? f.path
    pathToBasename.set(f.path, base)
    basenameToPath.set(base, f.path)
    basenameToPath.set(f.path.toLowerCase(), f.path)
  }

  mdFiles.forEach((f, i) => {
    const angle = (i / Math.max(mdFiles.length, 1)) * Math.PI * 2
    const r = 180
    nodes.push({
      id: f.path,
      label: f.path.split('/').pop()?.replace(/\.md$/, '') ?? f.path,
      x: 400 + Math.cos(angle) * r,
      y: 300 + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    })

    const links = extractWikiLinks(f.content ?? '')
    for (const link of links) {
      const targetPath = basenameToPath.get(link)
      if (targetPath && targetPath !== f.path) {
        edges.push({ source: f.path, target: targetPath })
      }
    }
  })

  return { nodes, edges }
}

function GraphView({ files, onNavigate }: { files: ObeliskFile[]; onNavigate: (path: string) => void }) {
  const canvasWidth = 800
  const canvasHeight = 500
  const { nodes: initialNodes, edges } = buildGraph(files)
  const nodesRef = useRef<GraphNode[]>(initialNodes)
  const [, forceRender] = useState(0)
  const rafRef = useRef<number>()
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const simulatingRef = useRef(true)

  useEffect(() => {
    const { nodes: fresh, edges: freshEdges } = buildGraph(files)
    nodesRef.current = fresh

    simulatingRef.current = true
    let iter = 0

    function tick() {
      if (!simulatingRef.current || iter++ > 300) { simulatingRef.current = false; return }

      const ns = nodesRef.current
      const CX = canvasWidth / 2, CY = canvasHeight / 2
      const fx = new Map<string, number>()
      const fy = new Map<string, number>()
      for (const n of ns) { fx.set(n.id, 0); fy.set(n.id, 0) }

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy + 1
          const d = Math.sqrt(d2)
          const f = 6000 / d2
          fx.set(a.id, (fx.get(a.id) ?? 0) + (dx / d) * f)
          fy.set(a.id, (fy.get(a.id) ?? 0) + (dy / d) * f)
          fx.set(b.id, (fx.get(b.id) ?? 0) - (dx / d) * f)
          fy.set(b.id, (fy.get(b.id) ?? 0) - (dy / d) * f)
        }
      }

      // Spring forces on edges
      for (const e of freshEdges) {
        const a = ns.find((n) => n.id === e.source)
        const b = ns.find((n) => n.id === e.target)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001
        const f = 0.04 * (d - 100)
        fx.set(a.id, (fx.get(a.id) ?? 0) + (dx / d) * f)
        fy.set(a.id, (fy.get(a.id) ?? 0) + (dy / d) * f)
        fx.set(b.id, (fx.get(b.id) ?? 0) - (dx / d) * f)
        fy.set(b.id, (fy.get(b.id) ?? 0) - (dy / d) * f)
      }

      // Integrate
      for (const n of ns) {
        n.vx = (n.vx + (fx.get(n.id) ?? 0) + (CX - n.x) * 0.004) * 0.8
        n.vy = (n.vy + (fy.get(n.id) ?? 0) + (CY - n.y) * 0.004) * 0.8
        n.x = Math.max(20, Math.min(canvasWidth - 20, n.x + n.vx))
        n.y = Math.max(20, Math.min(canvasHeight - 20, n.y + n.vy))
      }

      forceRender((n) => n + 1)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      simulatingRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [files])

  const ns = nodesRef.current
  const { edges: displayEdges } = buildGraph(files)

  if (ns.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 12 }}>
        No markdown files yet. Create some notes with [[WikiLinks]] to see the graph.
      </div>
    )
  }

  const nodeMap = new Map(ns.map((n) => [n.id, n]))

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      style={{ background: 'transparent' }}
    >
      {/* Edges */}
      {displayEdges.map((e, i) => {
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target)
        if (!a || !b) return null
        return (
          <line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="rgba(198,160,96,0.35)"
            strokeWidth={1.5}
          />
        )
      })}

      {/* Nodes */}
      {ns.map((n) => {
        const isHovered = hoveredNode === n.id
        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate(n.id)}
            onMouseEnter={() => setHoveredNode(n.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <circle
              r={isHovered ? 10 : 7}
              fill={isHovered ? '#c8a060' : '#8b5e3c'}
              stroke={isHovered ? '#ffd080' : '#c8a060'}
              strokeWidth={isHovered ? 2.5 : 1.5}
              style={{ transition: 'r 0.1s' }}
            />
            <text
              x={0}
              y={isHovered ? -14 : -11}
              textAnchor="middle"
              fontSize={isHovered ? 11 : 9}
              fill={isHovered ? '#ffd080' : '#c8a060'}
              style={{ pointerEvents: 'none', fontFamily: 'monospace' }}
            >
              {n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── File tree ─────────────────────────────────────────────────────────────

interface FileTreeProps {
  files: ObeliskFile[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onNewFile: (parentDir: string) => void
  onNewDir: (parentDir: string) => void
  onDelete: (path: string, isDirectory: boolean) => void
}

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: TreeNode[]
}

function buildTree(files: ObeliskFile[]): TreeNode[] {
  const root: TreeNode[] = []
  const nodeMap = new Map<string, TreeNode>()

  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  for (const f of sorted) {
    const parts = f.path.split('/')
    const name = parts[parts.length - 1]
    const node: TreeNode = { name, path: f.path, isDirectory: f.isDirectory, children: [] }
    nodeMap.set(f.path, node)

    if (parts.length === 1) {
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = nodeMap.get(parentPath)
      if (parent) {
        parent.children.push(node)
      } else {
        root.push(node)
      }
    }
  }

  return root
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onNewFile,
  onNewDir,
  onDelete,
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
  onNewFile: (parentDir: string) => void
  onNewDir: (parentDir: string) => void
  onDelete: (path: string, isDirectory: boolean) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const isSelected = selectedPath === node.path

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: depth * 14 + 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2,
          cursor: 'pointer',
          background: isSelected ? 'rgba(198,160,96,0.15)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
          borderLeft: isSelected ? '2px solid #c8a060' : '2px solid transparent',
          userSelect: 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (node.isDirectory) setExpanded((e) => !e)
          else onSelect(node.path)
        }}
      >
        <span style={{ marginRight: 5, fontSize: 10, color: node.isDirectory ? '#c8a060' : 'var(--text-dim)', flexShrink: 0 }}>
          {node.isDirectory ? (expanded ? '▾' : '▸') : '◦'}
        </span>
        <span style={{
          flex: 1,
          fontSize: 11,
          color: isSelected ? '#ffd080' : node.isDirectory ? '#c8a060' : 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {node.name}
        </span>

        {hovered && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {node.isDirectory && (
              <>
                <button
                  className="hud-btn"
                  style={{ fontSize: 8, padding: '0 3px', lineHeight: '14px' }}
                  title="New file here"
                  onClick={() => onNewFile(node.path)}
                >+f</button>
                <button
                  className="hud-btn"
                  style={{ fontSize: 8, padding: '0 3px', lineHeight: '14px' }}
                  title="New folder here"
                  onClick={() => onNewDir(node.path)}
                >+d</button>
              </>
            )}
            <button
              className="hud-btn"
              style={{ fontSize: 8, padding: '0 3px', lineHeight: '14px', color: '#ff6b6b' }}
              title="Delete"
              onClick={() => onDelete(node.path, node.isDirectory)}
            >✕</button>
          </div>
        )}
      </div>

      {node.isDirectory && expanded && node.children.map((child) => (
        <TreeNodeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onNewFile={onNewFile}
          onNewDir={onNewDir}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function FileTree({ files, selectedPath, onSelect, onNewFile, onNewDir, onDelete }: FileTreeProps) {
  const tree = buildTree(files)

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font-mono)' }}>
      {tree.length === 0 ? (
        <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 10, textAlign: 'center' }}>
          No files yet.<br />Use the buttons above to create.
        </div>
      ) : (
        tree.map((node) => (
          <TreeNodeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onNewFile={onNewFile}
            onNewDir={onNewDir}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  )
}

// ── Obelisk Modal ─────────────────────────────────────────────────────────

interface ObeliskModalProps {
  building: Building
  onClose: () => void
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

type ModalTab = 'files' | 'search' | 'graph'
type EditorMode = 'edit' | 'split' | 'preview'

function ObeliskModal({ building, onClose, addToast }: ObeliskModalProps) {
  const loadBuildings = useAppStore((s) => s.loadBuildings)
  let config: ObeliskConfig = { configured: false }
  try { config = JSON.parse(building.config) } catch { /* empty */ }

  // Setup state
  const [vaultName, setVaultName] = useState(config.vaultName ?? building.name)
  const [defaultView, setDefaultView] = useState<EditorMode>(config.defaultView ?? 'split')
  const isConfigured = config.configured

  // Files state
  const [files, setFiles] = useState<ObeliskFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [tab, setTab] = useState<ModalTab>('files')
  const [editorMode, setEditorMode] = useState<EditorMode>(config.defaultView ?? 'split')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [backendResults, setBackendResults] = useState<ObeliskSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // New file/folder dialog
  const [newItemDialog, setNewItemDialog] = useState<{ parentDir: string; isDir: boolean } | null>(null)
  const [newItemName, setNewItemName] = useState('')

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getObeliskFiles(building.id)
      setFiles(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [building.id])

  useEffect(() => {
    if (isConfigured) loadFiles()
  }, [isConfigured, loadFiles])

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedPath) return
    const file = files.find((f) => f.path === selectedPath)
    if (!file || file.isDirectory) return

    if (file.content !== undefined) {
      setEditContent(file.content)
      setSavedContent(file.content)
    } else {
      api.getObeliskFile(building.id, selectedPath).then((data) => {
        setEditContent(data.content ?? '')
        setSavedContent(data.content ?? '')
        setFiles((prev) => prev.map((f) => f.path === selectedPath ? { ...f, content: data.content } : f))
      }).catch(() => { /* ignore */ })
    }
  }, [selectedPath, building.id, files])

  // Auto-save with debounce
  function handleEditorChange(value: string) {
    setEditContent(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (selectedPath) saveFile(selectedPath, value)
    }, 1500)
  }

  async function saveFile(path: string, content: string) {
    if (content === savedContent) return
    setSaving(true)
    try {
      await api.saveObeliskFile(building.id, path, content)
      setSavedContent(content)
      setFiles((prev) => prev.map((f) => f.path === path ? { ...f, content } : f))
    } catch (err: any) {
      addToast(`Save failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Manual save on Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (selectedPath && saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
          saveFile(selectedPath, editContent)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedPath, editContent])

  async function handleConfigure() {
    const newConfig: ObeliskConfig = { configured: true, vaultName: vaultName.trim() || building.name, defaultView }
    try {
      await api.updateBuilding(building.id, { config: JSON.stringify(newConfig) })
      await loadBuildings()
      loadFiles()
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  async function handleNewItem() {
    if (!newItemDialog || !newItemName.trim()) return
    const parentDir = newItemDialog.parentDir
    const name = newItemName.trim()
    const path = parentDir ? `${parentDir}/${name}` : name
    const fullPath = newItemDialog.isDir ? path : (path.endsWith('.md') ? path : `${path}.md`)

    try {
      const created = await api.createObeliskFile(building.id, fullPath, '', newItemDialog.isDir)
      setFiles((prev) => [...prev, created])
      if (!newItemDialog.isDir) {
        setSelectedPath(fullPath)
        setEditContent('')
        setSavedContent('')
        setTab('files')
      }
      setNewItemDialog(null)
      setNewItemName('')
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  async function handleDelete(path: string, isDirectory: boolean) {
    const msg = isDirectory
      ? `Delete folder "${path}" and all its contents?`
      : `Delete "${path}"?`
    if (!confirm(msg)) return
    try {
      await api.deleteObeliskFile(building.id, path)
      setFiles((prev) => prev.filter((f) => f.path !== path && !f.path.startsWith(path + '/')))
      if (selectedPath === path || selectedPath?.startsWith(path + '/')) {
        setSelectedPath(null)
        setEditContent('')
        setSavedContent('')
      }
      addToast('Deleted', 'info')
    } catch (err: any) {
      addToast(`Error: ${err.message}`, 'error')
    }
  }

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setBackendResults([]); return }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.searchObeliskFiles(building.id, searchQuery)
        setBackendResults(data)
      } catch { /* ignore */ } finally {
        setSearching(false)
      }
    }, 300)
  }, [searchQuery, building.id])

  const localFuzzyResults = searchQuery.trim() ? fuzzySearch(files, searchQuery) : []

  const fileBasenames = new Set(
    files
      .filter((f) => !f.isDirectory)
      .flatMap((f) => {
        const base = f.path.split('/').pop() ?? ''
        return [base.toLowerCase(), base.replace(/\.md$/i, '').toLowerCase()]
      })
  )

  function navigateToFile(path: string) {
    setSelectedPath(path)
    setTab('files')
  }

  function handleWikiLinkClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    const link = target.closest('[data-wikilink]')?.getAttribute('data-wikilink')
    if (!link) return
    const candidate = files.find((f) =>
      !f.isDirectory && (
        f.path.toLowerCase().endsWith(`/${link.toLowerCase()}.md`) ||
        f.path.toLowerCase() === `${link.toLowerCase()}.md` ||
        f.path.toLowerCase() === link.toLowerCase()
      )
    )
    if (candidate) navigateToFile(candidate.path)
    else addToast(`Note "[[${link}]]" not found`, 'info')
  }

  const isDirty = editContent !== savedContent

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isConfigured) {
    return (
      <div className="obelisk-modal-backdrop" onClick={onClose}>
        <div className="obelisk-modal obelisk-setup" onClick={(e) => e.stopPropagation()}>
          <div className="obelisk-modal-header">
            <span>◈ OBELISK — INITIALIZE VAULT</span>
            <button className="hud-btn" style={{ fontSize: 10 }} onClick={onClose}>✕</button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              An Obelisk is a markdown knowledge base built into the Battlefield. Create notes, wikis, and documentation with live preview, WikiLinks, and a knowledge graph.
            </div>
            <div className="cnc-field">
              <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2 }}>VAULT NAME</label>
              <input
                className="hud-input"
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                placeholder={building.name}
                style={{ marginTop: 4 }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleConfigure()}
              />
            </div>
            <div className="cnc-field">
              <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2 }}>DEFAULT VIEW</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {(['edit', 'split', 'preview'] as EditorMode[]).map((m) => (
                  <button
                    key={m}
                    className={`hud-btn${defaultView === m ? ' active' : ''}`}
                    style={{ fontSize: 9 }}
                    onClick={() => setDefaultView(m)}
                  >{m.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <button className="hud-btn hud-btn-new-base" style={{ marginTop: 8 }} onClick={handleConfigure}>
              INITIALIZE VAULT
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="obelisk-modal-backdrop" onClick={onClose}>
      <div className="obelisk-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="obelisk-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>◈ OBELISK — {(config.vaultName ?? building.name).toUpperCase()}</span>
            {saving && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>SAVING…</span>}
            {isDirty && !saving && <span style={{ fontSize: 9, color: '#ffaa00' }}>● UNSAVED</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* Tab buttons */}
            <div style={{ display: 'flex', gap: 2, marginRight: 8 }}>
              {([['files', '◧ FILES'], ['search', '⌕ SEARCH'], ['graph', '◎ GRAPH']] as [ModalTab, string][]).map(([t, label]) => (
                <button
                  key={t}
                  className={`hud-btn${tab === t ? ' active' : ''}`}
                  style={{ fontSize: 9 }}
                  onClick={() => setTab(t)}
                >{label}</button>
              ))}
            </div>
            <button className="hud-btn" style={{ fontSize: 10 }} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="obelisk-modal-body">

          {/* ── Files tab ── */}
          {tab === 'files' && (
            <>
              {/* File tree panel */}
              <div className="obelisk-tree-panel">
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                  <button
                    className="hud-btn"
                    style={{ flex: 1, fontSize: 9 }}
                    onClick={() => { setNewItemDialog({ parentDir: '', isDir: false }); setNewItemName('') }}
                  >+ FILE</button>
                  <button
                    className="hud-btn"
                    style={{ flex: 1, fontSize: 9 }}
                    onClick={() => { setNewItemDialog({ parentDir: '', isDir: true }); setNewItemName('') }}
                  >+ DIR</button>
                  <button
                    className="hud-btn"
                    style={{ fontSize: 9, padding: '1px 6px' }}
                    title="Refresh"
                    onClick={loadFiles}
                  >↻</button>
                </div>

                {loading ? (
                  <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 10, textAlign: 'center' }}>Loading…</div>
                ) : (
                  <FileTree
                    files={files}
                    selectedPath={selectedPath}
                    onSelect={(path) => { setSelectedPath(path); setTab('files') }}
                    onNewFile={(parentDir) => { setNewItemDialog({ parentDir, isDir: false }); setNewItemName('') }}
                    onNewDir={(parentDir) => { setNewItemDialog({ parentDir, isDir: true }); setNewItemName('') }}
                    onDelete={handleDelete}
                  />
                )}
              </div>

              {/* Editor / preview panel */}
              <div className="obelisk-editor-panel">
                {selectedPath ? (
                  <>
                    {/* Breadcrumb + view toggle */}
                    <div style={{
                      padding: '4px 10px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {selectedPath.split('/').map((part, i, arr) => (
                          <span key={i}>
                            {i > 0 && <span style={{ margin: '0 3px' }}>/</span>}
                            <span style={{ color: i === arr.length - 1 ? '#c8a060' : 'var(--text-dim)' }}>{part}</span>
                          </span>
                        ))}
                      </span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {(['edit', 'split', 'preview'] as EditorMode[]).map((m) => (
                          <button
                            key={m}
                            className={`hud-btn${editorMode === m ? ' active' : ''}`}
                            style={{ fontSize: 8, padding: '1px 5px' }}
                            onClick={() => setEditorMode(m)}
                          >{m.toUpperCase()}</button>
                        ))}
                      </div>
                    </div>

                    {/* Editor + preview */}
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                      {(editorMode === 'edit' || editorMode === 'split') && (
                        <textarea
                          className="obelisk-editor"
                          style={{ flex: editorMode === 'split' ? '0 0 50%' : 1 }}
                          value={editContent}
                          onChange={(e) => handleEditorChange(e.target.value)}
                          placeholder="Start writing in markdown…"
                          spellCheck={false}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              const ta = e.currentTarget
                              const start = ta.selectionStart
                              const end = ta.selectionEnd
                              const newVal = editContent.slice(0, start) + '  ' + editContent.slice(end)
                              setEditContent(newVal)
                              requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
                              handleEditorChange(newVal)
                            }
                          }}
                        />
                      )}
                      {(editorMode === 'preview' || editorMode === 'split') && (
                        <div
                          className="obelisk-preview"
                          style={{ flex: editorMode === 'split' ? '0 0 50%' : 1 }}
                          dangerouslySetInnerHTML={{ __html: renderMarkdownWithWikiLinks(editContent, fileBasenames) }}
                          onClick={handleWikiLinkClick}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                    Select a file to edit, or create a new one.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Search tab ── */}
          {tab === 'search' && (
            <div className="obelisk-search-panel">
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                <input
                  className="hud-input"
                  style={{ width: '100%', fontSize: 13 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes… (full-text + fuzzy)"
                  autoFocus
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {searching && (
                  <div style={{ padding: '8px 12px', color: 'var(--text-dim)', fontSize: 10 }}>Searching…</div>
                )}

                {!searching && searchQuery.trim() && localFuzzyResults.length === 0 && backendResults.length === 0 && (
                  <div style={{ padding: '16px 12px', color: 'var(--text-dim)', fontSize: 11, textAlign: 'center' }}>
                    No results for "{searchQuery}"
                  </div>
                )}

                {/* Merged results (local fuzzy first, deduplicated) */}
                {(() => {
                  const seen = new Set<string>()
                  const merged: Array<{ path: string; snippet: string; source: 'fuzzy' | 'full' }> = []

                  for (const r of localFuzzyResults) {
                    seen.add(r.path)
                    merged.push({ path: r.path, snippet: r.snippet, source: 'fuzzy' })
                  }
                  for (const r of backendResults) {
                    if (!seen.has(r.path)) {
                      merged.push({ path: r.path, snippet: r.snippet, source: 'full' })
                    }
                  }

                  return merged.map((r) => (
                    <div
                      key={r.path}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                      onClick={() => navigateToFile(r.path)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(198,160,96,0.08)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '' }}
                    >
                      <div style={{ fontSize: 11, color: '#c8a060', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{r.path}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{r.source === 'fuzzy' ? 'FUZZY' : 'FULL-TEXT'}</span>
                      </div>
                      {r.snippet && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {r.snippet}
                        </div>
                      )}
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {/* ── Graph tab ── */}
          {tab === 'graph' && (
            <div className="obelisk-graph-panel">
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)' }}>
                WikiLink knowledge graph — click a node to open the note
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <GraphView files={files} onNavigate={navigateToFile} />
              </div>
            </div>
          )}

        </div>

        {/* New item dialog */}
        {newItemDialog && (
          <div
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }}
            onClick={() => setNewItemDialog(null)}
          >
            <div
              style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
                minWidth: 280, fontFamily: 'var(--font-mono)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 11, color: '#c8a060', letterSpacing: 2 }}>
                {newItemDialog.isDir ? 'NEW DIRECTORY' : 'NEW FILE'}
                {newItemDialog.parentDir && <span style={{ color: 'var(--text-dim)' }}> in {newItemDialog.parentDir}</span>}
              </div>
              <input
                className="hud-input"
                autoFocus
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={newItemDialog.isDir ? 'folder-name' : 'note-name (auto .md)'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewItem()
                  if (e.key === 'Escape') setNewItemDialog(null)
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="hud-btn" style={{ flex: 1 }} onClick={() => setNewItemDialog(null)}>CANCEL</button>
                <button
                  className="hud-btn hud-btn-new-base"
                  style={{ flex: 1 }}
                  onClick={handleNewItem}
                  disabled={!newItemName.trim()}
                >CREATE</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ObeliskBuilding component ────────────────────────────────────────

export function ObeliskBuilding({
  building,
  position,
  isRelocateMode,
  isBeingRelocated,
  onStartRelocate,
  addToast,
  isSelected = false,
  onSelect,
  onDeselect,
}: ObeliskBuildingProps) {
  const deleteBuilding = useAppStore((s) => s.deleteBuilding)
  const updateBuildingColor = useAppStore((s) => s.updateBuildingColor)
  const [currentBuilding, setCurrentBuilding] = useState(building)
  const [showModal, setShowModal] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

  const colorizedSrc = useColorizedImage('/buildings/build_obelisk.png', currentBuilding.color ?? '#c8a060')

  useEffect(() => { setCurrentBuilding(building) }, [building])
  useEffect(() => {
    if (isSelected) setShowModal(true)
    else setShowModal(false)
  }, [isSelected])

  let config: ObeliskConfig = { configured: false }
  try { config = JSON.parse(currentBuilding.config) } catch { /* empty */ }

  function handleClick() {
    if (isRelocateMode) return
    onSelect?.()
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (isRelocateMode) {
      e.stopPropagation()
      onStartRelocate(e.clientX, e.clientY)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${currentBuilding.name}"?`)) return
    try { await deleteBuilding(currentBuilding.id) } catch { /* ignore */ }
  }

  async function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newColor = e.target.value
    setCurrentBuilding((b) => ({ ...b, color: newColor }))
    await updateBuildingColor(currentBuilding.id, newColor)
  }

  return (
    <>
      <div
        className={`base-node clawcom-building${isSelected ? ' clawcom-selected' : ''}`}
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
          cursor: isRelocateMode ? 'grab' : 'pointer',
          userSelect: 'none',
          width: 140,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          zIndex: isBeingRelocated ? 100 : 1,
          opacity: isBeingRelocated ? 0.75 : 1,
        }}
        data-building-id={building.id}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        <div className="clawcom-img-wrap" style={{ position: 'relative' }}>
          {colorizedSrc ? (
            <img
              src={colorizedSrc}
              alt={currentBuilding.name}
              style={{ width: 100, height: 100, objectFit: 'contain', filter: isBeingRelocated ? 'brightness(1.5)' : undefined }}
              draggable={false}
            />
          ) : (
            /* Fallback placeholder when PNG not yet present */
            <div style={{
              width: 100, height: 100,
              background: `radial-gradient(circle at 50% 70%, ${currentBuilding.color ?? '#c8a060'}44, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, color: currentBuilding.color ?? '#c8a060',
              border: `1px solid ${currentBuilding.color ?? '#c8a060'}44`,
              borderRadius: 4,
            }}>◈</div>
          )}

          {/* Config status dot */}
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 8, height: 8, borderRadius: '50%',
            background: config.configured ? '#c8a060' : '#888',
            border: '1px solid var(--bg-darker)',
            boxShadow: config.configured ? `0 0 6px #c8a060` : undefined,
          }} title={config.configured ? 'Vault active' : 'Not configured'} />
        </div>

        <div style={{
          fontSize: 11, fontWeight: 700,
          color: currentBuilding.color ?? '#c8a060',
          textAlign: 'center',
          textShadow: `0 0 8px ${currentBuilding.color ?? '#c8a060'}44`,
          maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {config.vaultName ?? currentBuilding.name}
        </div>

        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>
          {config.configured ? '◈ VAULT ACTIVE' : '⚙ SETUP REQUIRED'}
        </div>

        {!isRelocateMode && (
          <div className="clawcom-actions" style={{ display: 'flex', gap: 4, marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px' }}
              onClick={() => colorInputRef.current?.click()}
              title="Change color"
            >◈</button>
            <input
              ref={colorInputRef}
              type="color"
              value={currentBuilding.color ?? '#c8a060'}
              onChange={handleColorChange}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
            />
            <button
              className="hud-btn"
              style={{ fontSize: 9, padding: '1px 5px', color: '#ff6b6b' }}
              onClick={handleDelete}
              title="Demolish building"
            >✕</button>
          </div>
        )}
      </div>

      {showModal && createPortal(
        <ObeliskModal
          building={currentBuilding}
          onClose={() => {
            setShowModal(false)
            onDeselect?.()
          }}
          addToast={addToast}
        />,
        document.body
      )}
    </>
  )
}
