import { useState, useEffect } from 'react'
import { api } from '../api'
import type { PromptTemplate } from '../types'

interface PromptToolboxPanelProps {
  onSend?: (content: string) => void
}

const inputStyle: React.CSSProperties = {
  background: '#0d0d0d',
  border: '1px solid #333',
  color: '#c8f0c8',
  padding: '2px 6px',
  borderRadius: 3,
  outline: 'none',
  fontFamily: 'monospace',
  fontSize: 10,
  width: '100%',
  boxSizing: 'border-box',
}

interface EditRowProps {
  template: PromptTemplate
  onSave: (updates: { title: string; content: string; category: string | null }) => Promise<void>
  onCancel: () => void
}

function EditRow({ template, onSave, onCancel }: EditRowProps) {
  const [title, setTitle]       = useState(template.title)
  const [content, setContent]   = useState(template.content)
  const [category, setCategory] = useState(template.category ?? '')

  async function handleSave() {
    const t = title.trim()
    const c = content.trim()
    if (!t || !c) return
    await onSave({ title: t, content: c, category: category.trim() || null })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        style={inputStyle}
      />
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category (optional)"
        style={inputStyle}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Template content…"
        rows={4}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 3 }}>
        <button className="hud-btn" style={{ fontSize: 9, flex: 1 }} onClick={handleSave}>SAVE</button>
        <button className="hud-btn" style={{ fontSize: 9, color: '#888' }} onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  )
}

export function PromptToolboxPanel({ onSend }: PromptToolboxPanelProps) {
  const [templates, setTemplates]     = useState<PromptTemplate[]>([])
  const [loading, setLoading]         = useState(true)
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [showNew, setShowNew]         = useState(false)
  const [newTitle, setNewTitle]       = useState('')
  const [newContent, setNewContent]   = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [copied, setCopied]           = useState<number | null>(null)

  useEffect(() => {
    api.listPromptTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Group by category for display
  const groups = new Map<string, PromptTemplate[]>()
  for (const t of templates) {
    const cat = t.category ?? 'General'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(t)
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return
    try {
      const created = await api.createPromptTemplate({
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory.trim() || undefined,
      })
      setTemplates((prev) => [...prev, created])
      setNewTitle('')
      setNewContent('')
      setNewCategory('')
      setShowNew(false)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: number) {
    try {
      await api.deletePromptTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch { /* ignore */ }
  }

  async function handleUpdate(id: number, updates: { title: string; content: string; category: string | null }) {
    const updated = await api.updatePromptTemplate(id, updates)
    setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)))
    setEditingId(null)
  }

  function handleCopy(id: number, content: string) {
    navigator.clipboard.writeText(content).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied((prev) => (prev === id ? null : prev)), 1500)
  }

  return (
    <div style={{
      width: 280,
      display: 'flex',
      flexDirection: 'column',
      background: '#111',
      borderLeft: '1px solid #1a1a1a',
      fontFamily: 'monospace',
      fontSize: 11,
      flexShrink: 0,
    }}>
      {/* Panel header */}
      <div style={{
        padding: '4px 10px',
        background: '#0f0f0f',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ color: '#00ff88', fontWeight: 700, fontSize: 10 }}>⬡ PROMPT TOOLBOX</span>
        <div style={{ flex: 1 }} />
        <button
          className="hud-btn"
          style={{ fontSize: 9, padding: '1px 6px' }}
          onClick={() => { setShowNew((v) => !v); setEditingId(null) }}
        >+ NEW</button>
      </div>

      {/* New template form */}
      {showNew && (
        <div style={{
          padding: 8,
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flexShrink: 0,
        }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title"
            style={inputStyle}
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category (optional)"
            style={inputStyle}
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Template content…"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="hud-btn"
              style={{ fontSize: 9, flex: 1 }}
              onClick={handleCreate}
            >SAVE</button>
            <button
              className="hud-btn"
              style={{ fontSize: 9, color: '#888' }}
              onClick={() => setShowNew(false)}
            >CANCEL</button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 10, color: '#555', fontSize: 10 }}>Loading…</div>
        ) : templates.length === 0 ? (
          <div style={{ padding: 10, color: '#555', fontSize: 10 }}>
            No templates yet. Click + NEW to create one.
          </div>
        ) : (
          Array.from(groups.entries()).map(([cat, items]) => (
            <div key={cat}>
              <div style={{
                padding: '3px 8px',
                color: '#4488ff',
                fontSize: 9,
                fontWeight: 700,
                background: '#0a0a1a',
                borderBottom: '1px solid #111',
                letterSpacing: 1,
              }}>
                {cat.toUpperCase()}
              </div>
              {items.map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: '6px 8px',
                    borderBottom: '1px solid #111',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {editingId === t.id ? (
                    <EditRow
                      template={t}
                      onSave={(updates) => handleUpdate(t.id, updates)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div style={{ color: '#c8f0c8', fontSize: 10, fontWeight: 600 }}>{t.title}</div>
                      <div style={{
                        color: '#666',
                        fontSize: 9,
                        maxHeight: 44,
                        overflow: 'hidden',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        lineHeight: 1.4,
                      }}>
                        {t.content}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {onSend && (
                          <button
                            className="hud-btn"
                            style={{ fontSize: 9, padding: '1px 6px', color: '#00ff88' }}
                            onClick={() => onSend(t.content)}
                            title="Send to active terminal"
                          >▶ SEND</button>
                        )}
                        <button
                          className="hud-btn"
                          style={{ fontSize: 9, padding: '1px 6px', color: copied === t.id ? '#00ff88' : undefined }}
                          onClick={() => handleCopy(t.id, t.content)}
                          title="Copy to clipboard"
                        >{copied === t.id ? '✓ COPIED' : '⎘ COPY'}</button>
                        <button
                          className="hud-btn"
                          style={{ fontSize: 9, padding: '1px 5px', color: '#888' }}
                          onClick={() => { setEditingId(t.id); setShowNew(false) }}
                          title="Edit template"
                        >✎</button>
                        <button
                          className="hud-btn"
                          style={{ fontSize: 9, padding: '1px 5px', color: '#ff4444' }}
                          onClick={() => handleDelete(t.id)}
                          title="Delete template"
                        >✕</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
