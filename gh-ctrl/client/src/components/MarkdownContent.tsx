function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/')
  )
}

function renderInline(escaped: string): string {
  return (
    escaped
      // Images: ![alt](url)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
        if (!isSafeUrl(url)) return escapeHtml(`![${alt}](${url})`)
        return `<img src="${escapeHtml(url)}" alt="${alt}" class="md-image" />`
      })
      // Links: [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        if (!isSafeUrl(url)) return escapeHtml(`[${text}](${url})`)
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="md-link">${text}</a>`
      })
      // Bold: **text**
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      // Bold: __text__
      .replace(/(?<![_\w])__([^_\n]+)__(?![_\w])/g, '<strong>$1</strong>')
      // Italic: *text*
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      // Italic: _text_
      .replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>')
      // Strikethrough: ~~text~~
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      // Inline code: `code`
      .replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>')
  )
}

function renderMarkdown(text: string): string {
  if (!text) return ''

  const lines = text.split('\n')
  const output: string[] = []
  let inCodeBlock = false
  let codeBlockContent: string[] = []
  let codeLang = ''
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (!listBuffer) return
    const tag = listBuffer.type
    output.push(`<${tag} class="md-list">`)
    listBuffer.items.forEach((item) => output.push(`<li>${item}</li>`))
    output.push(`</${tag}>`)
    listBuffer = null
  }

  for (const line of lines) {
    // Code block fence
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        flushList()
        inCodeBlock = true
        codeLang = line.slice(3).trim()
        codeBlockContent = []
      } else {
        inCodeBlock = false
        const codeContent = escapeHtml(codeBlockContent.join('\n'))
        const langAttr = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''
        output.push(`<pre class="md-code-block"><code${langAttr}>${codeContent}</code></pre>`)
        codeBlockContent = []
        codeLang = ''
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Empty line — flush list, no output
    if (line.trim() === '') {
      flushList()
      continue
    }

    // ATX Headers: # … ######
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      flushList()
      const level = headerMatch[1].length
      output.push(
        `<h${level} class="md-h${level}">${renderInline(escapeHtml(headerMatch[2]))}</h${level}>`
      )
      continue
    }

    // Blockquote (must check raw line before escaping >)
    const bqMatch = line.match(/^>\s*(.*)$/)
    if (bqMatch) {
      flushList()
      output.push(
        `<blockquote class="md-blockquote">${renderInline(escapeHtml(bqMatch[1]))}</blockquote>`
      )
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList()
      output.push('<hr class="md-hr" />')
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[ \t]*([-*+])\s+(.+)$/)
    if (ulMatch) {
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList()
        listBuffer = { type: 'ul', items: [] }
      }
      listBuffer.items.push(renderInline(escapeHtml(ulMatch[2])))
      continue
    }

    // Ordered list
    const olMatch = line.match(/^[ \t]*\d+\.\s+(.+)$/)
    if (olMatch) {
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList()
        listBuffer = { type: 'ol', items: [] }
      }
      listBuffer.items.push(renderInline(escapeHtml(olMatch[1])))
      continue
    }

    // Regular line — flush any open list, emit paragraph
    flushList()
    output.push(`<p class="md-p">${renderInline(escapeHtml(line))}</p>`)
  }

  // Flush unclosed code block as plain text
  if (inCodeBlock && codeBlockContent.length > 0) {
    output.push(`<pre class="md-code-block"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`)
  }

  flushList()
  return output.join('')
}

interface Props {
  text: string
  className?: string
}

export function MarkdownContent({ text, className }: Props) {
  const html = renderMarkdown(text)
  return (
    <div
      className={`md-content${className ? ` ${className}` : ''}`}
      // Content is escaped by renderMarkdown before any HTML is injected
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
