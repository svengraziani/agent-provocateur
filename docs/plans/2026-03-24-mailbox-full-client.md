# Mailbox Full Email Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the Mailbox building from a basic IMAP viewer to a fully functional Apple Mail-style email client with dynamic IMAP folder sync, body fetching, CC/BCC, Reply/Reply-All/Forward, Draft auto-save, Sent caching, Trash workflow, and inline error handling.

**Architecture:** DB is managed via raw SQLite `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` in `src/db/index.ts` — no drizzle-kit. A new `mail_folders` table stores the dynamic IMAP folder tree per building. `mail_messages` gets 5 new columns. Frontend is refactored into a 3-pane layout (Folders / Message List / Detail+Compose).

**Tech Stack:** Bun, Hono, SQLite + Drizzle ORM, imapflow (IMAP), nodemailer (SMTP), React 18, TypeScript, Lucide React

**Design doc:** `docs/plans/2026-03-24-mailbox-full-client-design.md`

---

## Task 1: DB — Schema Changes

**Files:**
- Modify: `gh-ctrl/src/db/index.ts`
- Modify: `gh-ctrl/src/db/schema.ts`

**Context:** `db/index.ts` uses raw `sqlite` calls to create tables on startup. The `mail_messages` table is missing from `db/index.ts` (oversight in previous implementation). Fix this and add new columns + new `mail_folders` table.

**Step 1: Add `mail_messages` + `mail_folders` table creation to `db/index.ts`**

Follow the exact same pattern as the other tables (e.g. `healthcheck_results`). Add before the final `export const db = drizzle(...)` line:

- `CREATE TABLE IF NOT EXISTS mail_messages` with all columns including new ones: `folder TEXT NOT NULL DEFAULT 'INBOX'`, `cc_addresses TEXT`, `bcc_addresses TEXT`, `html_body TEXT`, `in_reply_to TEXT`
- Use `pragma_table_info('mail_messages')` to detect existing tables and add missing columns via `ALTER TABLE mail_messages ADD COLUMN ...` only if the column doesn't already exist (check the column list first)
- `CREATE TABLE IF NOT EXISTS mail_folders` with columns: `id`, `building_id`, `name`, `display_name`, `role`, `unread_count`, `delimiter`, `synced_at`, plus `UNIQUE(building_id, name)`

**Step 2: Update `schema.ts` — extend `mailMessages` + add `mailFolders`**

Replace `mailMessages` with the extended version:

```typescript
export const mailMessages = sqliteTable('mail_messages', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  buildingId:   integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  messageId:    text('message_id').notNull(),
  folder:       text('folder').notNull().default('INBOX'),
  subject:      text('subject'),
  fromAddress:  text('from_address'),
  toAddresses:  text('to_addresses'),
  ccAddresses:  text('cc_addresses'),
  bccAddresses: text('bcc_addresses'),
  date:         integer('date'),
  snippet:      text('snippet'),
  bodyText:     text('body_text'),
  htmlBody:     text('html_body'),
  inReplyTo:    text('in_reply_to'),
  isRead:       integer('is_read').default(0),
  isStarred:    integer('is_starred').default(0),
  fetchedAt:    integer('fetched_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const mailFolders = sqliteTable('mail_folders', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  buildingId:  integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  displayName: text('display_name').notNull(),
  role:        text('role').notNull().default('custom'),
  unreadCount: integer('unread_count').notNull().default(0),
  delimiter:   text('delimiter').notNull().default('/'),
  syncedAt:    integer('synced_at'),
})
```

**Step 3: Verify server starts without error**

```bash
cd gh-ctrl && bun run dev:server
```

Expected: Server starts on port 3001, no "no such table" or "no such column" errors in console.

---

## Task 2: Backend — Folder Discovery

**Files:**
- Modify: `gh-ctrl/src/mailbox-service.ts`

**Context:** Add `syncFolders()` function that uses imapflow `client.list("", "*")` to fetch all IMAP folders, maps special-use attributes to roles, and upserts into `mail_folders`.

**Step 1: Add `mailFolders` to the import from `'./db/schema'`**

**Step 2: Add role-mapping constants and `syncFolders` function after the `MailboxConfig` interface**

```typescript
type FolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'

const SPECIAL_USE_ROLE: Record<string, FolderRole> = {
  '\\Sent':    'sent',
  '\\Drafts':  'drafts',
  '\\Trash':   'trash',
  '\\Junk':    'spam',
  '\\Spam':    'spam',
  '\\Archive': 'archive',
  '\\All':     'archive',
  '\\Inbox':   'inbox',
}

const NAME_ROLE_HINTS: Array<[RegExp, FolderRole]> = [
  [/^inbox$/i,                              'inbox'],
  [/sent|gesendet/i,                        'sent'],
  [/draft|entwurf/i,                        'drafts'],
  [/trash|papierkorb|deleted|gel.scht/i,    'trash'],
  [/junk|spam/i,                            'spam'],
  [/archive|archiv/i,                       'archive'],
]

function inferRole(name: string, specialUseAttrs: string[]): FolderRole {
  for (const attr of specialUseAttrs) {
    const role = SPECIAL_USE_ROLE[attr]
    if (role) return role
  }
  const leaf = name.split(/[/.]/).pop() ?? name
  for (const [pattern, role] of NAME_ROLE_HINTS) {
    if (pattern.test(leaf)) return role
  }
  return 'custom'
}

function normalizeDisplayName(name: string, role: FolderRole): string {
  const leaf = name.split(/[/.]/).pop() ?? name
  const MAP: Record<FolderRole, string> = {
    inbox:   'Posteingang',
    sent:    'Gesendet',
    drafts:  'Entwürfe',
    trash:   'Papierkorb',
    spam:    'Spam',
    archive: 'Archiv',
    custom:  leaf,
  }
  return MAP[role]
}

export async function syncFolders(buildingId: number, config: MailboxConfig): Promise<void> {
  let ImapFlow: any
  try {
    const mod = await import('imapflow')
    ImapFlow = mod.ImapFlow
  } catch {
    console.warn('[mailbox-service] imapflow not installed')
    return
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.username, pass: config.password },
    logger: false,
  })

  try {
    await client.connect()
    const list = await client.list('', '*')
    await client.logout()

    for (const item of list) {
      const attrs: string[] = item.specialUse ? [item.specialUse] : (item.flags ? [...item.flags] : [])
      const role = inferRole(item.path, attrs)
      const displayName = normalizeDisplayName(item.path, role)
      const delimiter = item.delimiter ?? '/'

      await db.insert(mailFolders)
        .values({ buildingId, name: item.path, displayName, role, unreadCount: 0, delimiter, syncedAt: Date.now() })
        .onConflictDoUpdate({
          target: [mailFolders.buildingId, mailFolders.name],
          set: { displayName, role, delimiter, syncedAt: Date.now() },
        })
    }
  } catch (err: any) {
    console.error(`[mailbox-service] syncFolders error for building ${buildingId}:`, err.message)
    if (client.usable) await client.logout().catch(() => {})
  }
}
```

**Step 3: Call `syncFolders` in `scheduleMailbox` (after the early-return guard)**

**Step 4: Call `syncFolders` in `initMailboxService` (after `scheduleMailbox(...)` call)**

**Step 5: Verify server compiles**

```bash
cd gh-ctrl && bun run dev:server
```

---

## Task 3: Backend — Full Body Fetching + Multi-Folder Poll

**Files:**
- Modify: `gh-ctrl/src/mailbox-service.ts`

**Context:** Replace `pollMailbox` with a version that polls all synced folders (not just INBOX) and fetches full body text (plain + HTML) via imapflow `bodyParts`.

**Step 1: Add `pollFolder` helper function**

```typescript
async function pollFolder(
  buildingId: number,
  config: MailboxConfig,
  folderName: string,
  ImapFlow: any,
): Promise<void> {
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.username, pass: config.password },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(folderName)

    try {
      const lastMsg = await db
        .select()
        .from(mailMessages)
        .where(and(eq(mailMessages.buildingId, buildingId), eq(mailMessages.folder, folderName)))
        .orderBy(desc(mailMessages.date))
        .limit(1)

      const since = lastMsg.length > 0 && lastMsg[0].date
        ? new Date(lastMsg[0].date as number)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      for await (const msg of client.fetch(
        { since },
        { envelope: true, bodyParts: ['text', 'html'] as any },
      )) {
        const envelope = msg.envelope
        const messageId: string = envelope.messageId ?? `uid-${msg.uid}-${buildingId}`

        const existing = await db.select({ id: mailMessages.id }).from(mailMessages)
          .where(and(eq(mailMessages.buildingId, buildingId), eq(mailMessages.messageId, messageId)))
          .limit(1)
        if (existing.length > 0) continue

        const fromAddr = envelope.from?.[0]
          ? `${envelope.from[0].name ? envelope.from[0].name + ' ' : ''}<${envelope.from[0].address ?? ''}>`
          : null
        const toAddrs  = JSON.stringify((envelope.to  ?? []).map((a: any) => a.address).filter(Boolean))
        const ccAddrs  = JSON.stringify((envelope.cc  ?? []).map((a: any) => a.address).filter(Boolean))

        let bodyText: string | null = null
        let htmlBody: string | null = null
        try {
          const textPart = msg.bodyParts?.get('text')
          if (textPart) bodyText = Buffer.from(textPart).toString('utf-8')
          const htmlPart = msg.bodyParts?.get('html')
          if (htmlPart) htmlBody = Buffer.from(htmlPart).toString('utf-8')
        } catch { /* body fetch optional */ }

        await db.insert(mailMessages).values({
          buildingId,
          messageId,
          folder:       folderName,
          subject:      envelope.subject ?? null,
          fromAddress:  fromAddr,
          toAddresses:  toAddrs,
          ccAddresses:  ccAddrs,
          date:         envelope.date ? envelope.date.getTime() : null,
          snippet:      bodyText?.slice(0, 200) ?? null,
          bodyText,
          htmlBody,
          inReplyTo:    envelope.inReplyTo ?? null,
          isRead:       0,
          isStarred:    0,
        })
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (err: any) {
    console.error(`[mailbox-service] pollFolder error building=${buildingId} folder=${folderName}:`, err.message)
    if (client.usable) await client.logout().catch(() => {})
  }
}
```

**Step 2: Replace `pollMailbox` with multi-folder version**

```typescript
async function pollMailbox(buildingId: number, config: MailboxConfig): Promise<void> {
  let ImapFlow: any
  try {
    const mod = await import('imapflow')
    ImapFlow = mod.ImapFlow
  } catch {
    console.warn('[mailbox-service] imapflow not installed — run `bun install`')
    return
  }

  const folders = await db.select().from(mailFolders).where(eq(mailFolders.buildingId, buildingId))

  if (folders.length === 0) {
    await pollFolder(buildingId, config, config.folder || 'INBOX', ImapFlow)
    return
  }

  // Skip Drafts (local only)
  for (const folder of folders.filter((f) => f.role !== 'drafts')) {
    await pollFolder(buildingId, config, folder.name, ImapFlow)
  }

  // Update unread counts
  for (const folder of folders) {
    const unread = await db.select({ id: mailMessages.id }).from(mailMessages)
      .where(and(eq(mailMessages.buildingId, buildingId), eq(mailMessages.folder, folder.name), eq(mailMessages.isRead, 0)))
    await db.update(mailFolders).set({ unreadCount: unread.length, syncedAt: Date.now() }).where(eq(mailFolders.id, folder.id))
  }
}
```

---

## Task 4: Backend — Updated Send + Draft Support

**Files:**
- Modify: `gh-ctrl/src/mailbox-service.ts`

**Step 1: Add `SendMailParams` interface**

```typescript
export interface SendMailParams {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  inReplyTo?: string
}
```

**Step 2: Replace `sendMailboxEmail` signature**

New signature: `sendMailboxEmail(buildingId: number, config: MailboxConfig, params: SendMailParams): Promise<void>`

Changes:
- Add `transporter.verify()` call before send — throws with `SMTP-Verbindung fehlgeschlagen: ...` on failure
- Pass `cc`, `bcc`, `inReplyTo`/`references` headers to nodemailer
- After successful send: look up sent folder from `mail_folders` (role='sent'), insert message into DB with `isRead: 1`

**Step 3: Add `saveDraft`, `getFolders` exports**

```typescript
export async function saveDraft(
  buildingId: number,
  params: Partial<SendMailParams> & { draftId?: number },
): Promise<number> {
  const draftFolder = await db.select().from(mailFolders)
    .where(and(eq(mailFolders.buildingId, buildingId), eq(mailFolders.role, 'drafts')))
    .limit(1)
  const draftFolderName = draftFolder[0]?.name ?? 'DRAFTS'

  if (params.draftId) {
    await db.update(mailMessages).set({
      subject:     params.subject ?? null,
      toAddresses: params.to ? JSON.stringify([params.to]) : null,
      ccAddresses: params.cc ? JSON.stringify(params.cc.split(',').map((s) => s.trim())) : null,
      bodyText:    params.body ?? null,
      date:        Date.now(),
    }).where(and(eq(mailMessages.id, params.draftId), eq(mailMessages.buildingId, buildingId)))
    return params.draftId
  }

  const result = await db.insert(mailMessages).values({
    buildingId,
    messageId:   `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    folder:      draftFolderName,
    subject:     params.subject ?? null,
    toAddresses: params.to ? JSON.stringify([params.to]) : null,
    ccAddresses: params.cc ? JSON.stringify(params.cc.split(',').map((s) => s.trim())) : null,
    bodyText:    params.body ?? null,
    date:        Date.now(),
    isRead:      1,
    isStarred:   0,
  }).returning({ id: mailMessages.id })

  return result[0].id
}

export async function getFolders(buildingId: number) {
  return db.select().from(mailFolders).where(eq(mailFolders.buildingId, buildingId))
}
```

**Step 4: Export `lastSyncErrors` map**

```typescript
export const lastSyncErrors = new Map<number, string>()
```

Set `lastSyncErrors.set(buildingId, err.message)` in `pollFolder` catch block.
Clear `lastSyncErrors.delete(buildingId)` after each successful folder poll.

---

## Task 5: Backend — New Routes

**Files:**
- Modify: `gh-ctrl/src/routes/buildings.ts`

**Step 1: Update imports**

Add to existing import from `'../mailbox-service'`:
`syncFolders`, `saveDraft`, `getFolders`, `lastSyncErrors`, `type SendMailParams`

Add to existing import from `'../db/schema'`:
`mailFolders`

**Step 2: Fix existing `POST /:id/mail/send`**

Update to new `sendMailboxEmail(id, config, params)` signature. Pass `cc`, `bcc`, `inReplyTo` from request body.

**Step 3: Add new routes (before `export default app`)**

```typescript
// GET /:id/mail/folders
app.get('/:id/mail/folders', async (c) => {
  const id = Number(c.req.param('id'))
  return c.json(await getFolders(id))
})

// POST /:id/mail/folders/sync
app.post('/:id/mail/folders/sync', async (c) => {
  const id = Number(c.req.param('id'))
  const buildingResult = await db.select().from(buildings).where(eq(buildings.id, id))
  if (buildingResult.length === 0) return c.json({ error: 'Building not found' }, 404)
  let config: Partial<MailboxConfig> = {}
  try { config = JSON.parse(buildingResult[0].config ?? '{}') } catch { /* empty */ }
  if (!config.configured) return c.json({ error: 'Building not configured' }, 400)
  await syncFolders(id, config as MailboxConfig)
  return c.json(await getFolders(id))
})

// PATCH /:id/mail/:msgId/folder — move to folder
app.patch('/:id/mail/:msgId/folder', async (c) => {
  const buildingId = Number(c.req.param('id'))
  const msgId = Number(c.req.param('msgId'))
  const { folder } = await c.req.json()
  if (!folder) return c.json({ error: 'folder required' }, 400)
  await db.update(mailMessages).set({ folder: String(folder) })
    .where(and(eq(mailMessages.id, msgId), eq(mailMessages.buildingId, buildingId)))
  return c.json({ ok: true })
})

// POST /:id/mail/drafts — save or update draft
app.post('/:id/mail/drafts', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const draftId = await saveDraft(id, {
    draftId:   body.draftId ? Number(body.draftId) : undefined,
    to:        body.to,
    cc:        body.cc,
    subject:   body.subject,
    body:      body.body,
    inReplyTo: body.inReplyTo,
  })
  return c.json({ id: draftId })
})

// GET /:id/mail/status — sync error status
app.get('/:id/mail/status', async (c) => {
  const id = Number(c.req.param('id'))
  return c.json({ error: lastSyncErrors.get(id) ?? null })
})
```

**Step 4: Verify all routes compile**

```bash
cd gh-ctrl && bun run dev:server
```

Test folder route:
```bash
curl -s http://localhost:3001/api/buildings/1/mail/folders
```

---

## Task 6: Frontend — Types + API Client

**Files:**
- Modify: `gh-ctrl/client/src/types.ts`
- Modify: `gh-ctrl/client/src/api.ts`

**Step 1: Update `MailMessage` interface in `types.ts`**

Add `folder`, `ccAddresses`, `bccAddresses`, `htmlBody`, `inReplyTo` fields.

**Step 2: Add `MailFolder` and `SendMailParams` interfaces to `types.ts`**

```typescript
export interface MailFolder {
  id: number
  buildingId: number
  name: string
  displayName: string
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
  unreadCount: number
  delimiter: string
  syncedAt: number | null
}

export interface SendMailParams {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  inReplyTo?: string
  draftId?: number
}
```

**Step 3: Update `api.ts`**

- Import `MailFolder` and `SendMailParams` from `'./types'`
- Update `sendMail` to accept `SendMailParams`
- Add new methods:

```typescript
getMailFolders: (buildingId: number) =>
  request<MailFolder[]>(`/buildings/${buildingId}/mail/folders`),

syncMailFolders: (buildingId: number) =>
  request<MailFolder[]>(`/buildings/${buildingId}/mail/folders/sync`, { method: 'POST' }),

moveMailToFolder: (buildingId: number, msgId: number, folder: string) =>
  request<{ ok: boolean }>(`/buildings/${buildingId}/mail/${msgId}/folder`, {
    method: 'PATCH',
    body: JSON.stringify({ folder }),
  }),

saveDraft: (buildingId: number, params: Partial<SendMailParams> & { draftId?: number }) =>
  request<{ id: number }>(`/buildings/${buildingId}/mail/drafts`, {
    method: 'POST',
    body: JSON.stringify(params),
  }),

getMailStatus: (buildingId: number) =>
  request<{ error: string | null }>(`/buildings/${buildingId}/mail/status`),
```

---

## Task 7: Frontend — `FolderSidebar` Component

**Files:**
- Create: `gh-ctrl/client/src/components/mail/FolderSidebar.tsx`

```typescript
import { Inbox, Send, FileText, Trash2, AlertOctagon, Archive, Folder, RefreshCw } from 'lucide-react'
import type { MailFolder } from '../../types'

const ROLE_ORDER = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'custom']
const ROLE_ICON: Record<string, React.ReactNode> = {
  inbox:   <Inbox size={12} />,
  sent:    <Send size={12} />,
  drafts:  <FileText size={12} />,
  trash:   <Trash2 size={12} />,
  spam:    <AlertOctagon size={12} />,
  archive: <Archive size={12} />,
  custom:  <Folder size={12} />,
}

interface FolderSidebarProps {
  folders: MailFolder[]
  activeFolder: string
  onSelectFolder: (name: string) => void
  onSyncFolders: () => void
  syncing: boolean
}

export function FolderSidebar({ folders, activeFolder, onSelectFolder, onSyncFolders, syncing }: FolderSidebarProps) {
  const sorted = [...folders].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role)
    const bi = ROLE_ORDER.indexOf(b.role)
    return ai !== bi ? ai - bi : a.displayName.localeCompare(b.displayName)
  })

  const standardRoles = new Set(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive'])

  return (
    <div style={{ width: 160, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700 }}>ORDNER</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0, display: 'flex' }}
          onClick={onSyncFolders} title="Ordner synchronisieren">
          <RefreshCw size={10} style={{ animation: syncing ? 'spin 1s linear infinite' : undefined }} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.length === 0 && (
          <div style={{ padding: '8px 10px', fontSize: 9, color: 'var(--text-dim)' }}>Keine Ordner</div>
        )}
        {sorted.map((folder, idx) => {
          const showSeparator = folder.role === 'custom' && idx > 0 && standardRoles.has(sorted[idx - 1].role)
          return (
            <div key={folder.id}>
              {showSeparator && <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />}
              <button onClick={() => onSelectFolder(folder.name)} style={{
                width: '100%', background: activeFolder === folder.name ? 'var(--bg-hover)' : 'transparent',
                border: 'none', cursor: 'pointer', padding: '6px 10px',
                display: 'flex', alignItems: 'center', gap: 6,
                color: activeFolder === folder.name ? 'var(--text)' : 'var(--text-dim)',
                fontSize: 10, textAlign: 'left',
              }}>
                <span style={{ flexShrink: 0 }}>{ROLE_ICON[folder.role]}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.displayName}
                </span>
                {folder.unreadCount > 0 && (
                  <span style={{ background: '#ff4444', color: '#fff', borderRadius: 8, padding: '1px 4px', fontSize: 8, fontWeight: 700 }}>
                    {folder.unreadCount > 99 ? '99+' : folder.unreadCount}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Task 8: Frontend — `ComposePane` Component

**Files:**
- Create: `gh-ctrl/client/src/components/mail/ComposePane.tsx`

**Context:** Right pane for writing emails. Handles New / Reply / Reply-All / Forward modes. CC always visible, BCC toggleable. Inline error banner. Draft auto-save after 30s inactivity.

```typescript
import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../api'
import type { MailMessage, SendMailParams } from '../../types'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposePaneProps {
  buildingId: number
  mode: ComposeMode
  replyTo?: MailMessage | null
  initialDraftId?: number
  onSent: () => void
  onDiscard: () => void
  onDraftSaved: (id: number) => void
}

function quoteMessage(msg: MailMessage): string {
  const date = msg.date ? new Date(msg.date).toLocaleString() : '—'
  const body = msg.bodyText ?? msg.snippet ?? ''
  return `\n\n---\nAm ${date} schrieb ${msg.fromAddress ?? '—'}:\n${body.split('\n').map((l) => `> ${l}`).join('\n')}`
}

export function ComposePane({ buildingId, mode, replyTo, initialDraftId, onSent, onDiscard, onDraftSaved }: ComposePaneProps) {
  const [to,      setTo]      = useState('')
  const [cc,      setCc]      = useState('')
  const [bcc,     setBcc]     = useState('')
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [showBcc, setShowBcc] = useState(false)
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState('')
  const [draftId, setDraftId] = useState<number | undefined>(initialDraftId)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!replyTo) return
    if (mode === 'reply') {
      const from = replyTo.fromAddress?.match(/<(.+?)>/)?.[1] ?? replyTo.fromAddress ?? ''
      setTo(from)
      setSubject(replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject ?? ''}`)
      setBody(quoteMessage(replyTo))
    } else if (mode === 'replyAll') {
      const from = replyTo.fromAddress?.match(/<(.+?)>/)?.[1] ?? replyTo.fromAddress ?? ''
      const ccAddrs: string[] = []
      try { ccAddrs.push(...(JSON.parse(replyTo.ccAddresses ?? '[]') as string[])) } catch { /* empty */ }
      try { ccAddrs.push(...(JSON.parse(replyTo.toAddresses ?? '[]') as string[])) } catch { /* empty */ }
      setTo(from)
      setCc(ccAddrs.join(', '))
      setSubject(replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject ?? ''}`)
      setBody(quoteMessage(replyTo))
    } else if (mode === 'forward') {
      setSubject(replyTo.subject?.startsWith('Fwd:') ? replyTo.subject : `Fwd: ${replyTo.subject ?? ''}`)
      setBody(quoteMessage(replyTo))
    }
  }, [mode, replyTo])

  function scheduleAutoSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (!to && !subject && !body) return
      api.saveDraft(buildingId, { draftId, to, cc: cc || undefined, subject, body, inReplyTo: replyTo?.messageId })
        .then(({ id }) => { setDraftId(id); onDraftSaved(id) })
        .catch(() => { /* silent */ })
    }, 30_000)
  }

  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }, [])

  async function handleSend() {
    if (!to.trim() || !subject.trim() || sending) return
    setSending(true)
    setError('')
    try {
      await api.sendMail(buildingId, {
        to: to.trim(), cc: cc.trim() || undefined, bcc: bcc.trim() || undefined,
        subject: subject.trim(), body, inReplyTo: replyTo?.messageId,
      })
      if (draftId) await api.deleteMailMessage(buildingId, draftId).catch(() => {})
      onSent()
    } catch (err: any) {
      setError(err.message ?? 'Unbekannter Fehler')
    } finally {
      setSending(false)
    }
  }

  async function handleSaveAsDraft() {
    try {
      const { id } = await api.saveDraft(buildingId, { draftId, to, cc: cc || undefined, subject, body })
      setDraftId(id)
      onDraftSaved(id)
      onDiscard()
    } catch (err: any) {
      setError(`Entwurf fehlgeschlagen: ${err.message}`)
    }
  }

  async function handleDiscard() {
    if ((to || subject || body) && !confirm('Entwurf verwerfen?')) return
    if (draftId) await api.deleteMailMessage(buildingId, draftId).catch(() => {})
    onDiscard()
  }

  const modeLabel: Record<ComposeMode, string> = {
    new: '✉ NEUE E-MAIL', reply: '↩ ANTWORTEN', replyAll: '↩ ALLEN ANTWORTEN', forward: '→ WEITERLEITEN',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflowY: 'auto', padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-neon)', marginBottom: 4 }}>{modeLabel[mode]}</div>

      {[
        { label: 'AN',   value: to,      setter: setTo,      ph: 'empfaenger@example.com' },
        { label: 'CC',   value: cc,      setter: setCc,      ph: 'cc@example.com' },
      ].map(({ label, value, setter, ph }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 28, flexShrink: 0 }}>{label}</span>
          <input className="hud-input" value={value} onChange={(e) => { setter(e.target.value); scheduleAutoSave() }}
            placeholder={ph} style={{ flex: 1 }} />
          {label === 'CC' && (
            <button className="hud-btn" style={{ fontSize: 9, padding: '1px 5px', display: 'flex', alignItems: 'center', gap: 2 }}
              onClick={() => setShowBcc((v) => !v)}>
              {showBcc ? <ChevronUp size={10} /> : <ChevronDown size={10} />} BCC
            </button>
          )}
        </div>
      ))}

      {showBcc && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 28, flexShrink: 0 }}>BCC</span>
          <input className="hud-input" value={bcc} onChange={(e) => { setBcc(e.target.value); scheduleAutoSave() }}
            placeholder="bcc@example.com" style={{ flex: 1 }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 28, flexShrink: 0 }}>BETR</span>
        <input className="hud-input" value={subject} onChange={(e) => { setSubject(e.target.value); scheduleAutoSave() }}
          placeholder="Betreff" style={{ flex: 1 }} />
      </div>

      <textarea className="hud-input" value={body} onChange={(e) => { setBody(e.target.value); scheduleAutoSave() }}
        placeholder="Nachricht..." rows={10} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', flex: 1 }} />

      {error && (
        <div style={{ background: '#ff444422', border: '1px solid #ff4444', borderRadius: 3, padding: '6px 10px', fontSize: 10, color: '#ff6b6b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✕ {error}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b6b' }} onClick={() => setError('')}><X size={10} /></button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="hud-btn" style={{ fontSize: 9 }} onClick={handleDiscard}>ABBRECHEN</button>
        <button className="hud-btn" style={{ fontSize: 9 }} onClick={handleSaveAsDraft}>ALS ENTWURF</button>
        <button className="hud-btn hud-btn-new-base" style={{ fontSize: 9 }} onClick={handleSend}
          disabled={!to.trim() || !subject.trim() || sending}>
          {sending ? '◌ SENDEN...' : '▶ SENDEN'}
        </button>
      </div>
    </div>
  )
}
```

---

## Task 9: Frontend — `MessageDetail` Component

**Files:**
- Create: `gh-ctrl/client/src/components/mail/MessageDetail.tsx`

```typescript
import { Reply, ReplyAll, Forward, Trash2 } from 'lucide-react'
import type { MailMessage, MailFolder } from '../../types'
import type { ComposeMode } from './ComposePane'

function parseAddresses(json: string | null): string {
  if (!json) return '—'
  try { return (JSON.parse(json) as string[]).join(', ') || '—' } catch { return json }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ').trim()
}

interface MessageDetailProps {
  message: MailMessage
  trashFolder: MailFolder | undefined
  onCompose: (mode: ComposeMode, replyTo: MailMessage) => void
  onMoveToTrash: (msg: MailMessage) => void
}

export function MessageDetail({ message, trashFolder, onCompose, onMoveToTrash }: MessageDetailProps) {
  const bodyContent = message.bodyText ?? (message.htmlBody ? stripHtml(message.htmlBody) : null) ?? message.snippet

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>
          {message.subject ?? '(kein Betreff)'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          <div><strong style={{ color: 'var(--text)' }}>Von:</strong> {message.fromAddress ?? '—'}</div>
          <div><strong style={{ color: 'var(--text)' }}>An:</strong> {parseAddresses(message.toAddresses)}</div>
          {message.ccAddresses && JSON.parse(message.ccAddresses).length > 0 && (
            <div><strong style={{ color: 'var(--text)' }}>CC:</strong> {parseAddresses(message.ccAddresses)}</div>
          )}
          <div><strong style={{ color: 'var(--text)' }}>Datum:</strong> {message.date ? new Date(message.date).toLocaleString() : '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            { mode: 'reply' as ComposeMode,    icon: <Reply size={10} />,    label: 'ANTWORTEN' },
            { mode: 'replyAll' as ComposeMode, icon: <ReplyAll size={10} />, label: 'ALLEN' },
            { mode: 'forward' as ComposeMode,  icon: <Forward size={10} />,  label: 'WEITERLEITEN' },
          ].map(({ mode, icon, label }) => (
            <button key={mode} className="hud-btn" style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}
              onClick={() => onCompose(mode, message)}>
              {icon} {label}
            </button>
          ))}
          {trashFolder && (
            <button className="hud-btn" style={{ fontSize: 9, color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: 3 }}
              onClick={() => onMoveToTrash(message)}>
              <Trash2 size={10} /> PAPIERKORB
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', fontSize: 11, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {bodyContent ?? (
          <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Kein Text verfügbar. Starte einen Sync um den Nachrichtentext abzurufen.
          </span>
        )}
      </div>
    </div>
  )
}
```

---

## Task 10: Frontend — Refactor `MailboxInboxDialog` to 3-Pane

**Files:**
- Modify: `gh-ctrl/client/src/components/MailboxInboxDialog.tsx`

**Context:** Full replacement with 3-pane layout. Width 860px. Folder sidebar → message list → detail/compose.

**Step 1: Replace entire file content**

Key logic:
- Load folders from `api.getMailFolders()` on mount, default to inbox role folder
- On folder change: filter messages by `m.folder === activeFolder`
- `RightPane` union type: `{ kind: 'empty' } | { kind: 'detail'; msg } | { kind: 'compose'; mode; replyTo?; draftId? }`
- Move-to-trash: use `api.moveMailToFolder()` to trash folder, fallback to permanent delete if no trash
- Trash folder active: show permanent delete (✕) instead of move-to-trash (🗑)
- Update folder unread counts locally on mark-read
- Wire up `FolderSidebar`, `MessageDetail`, `ComposePane`

---

## Task 11: Frontend — Update `MailboxBuilding.tsx` — Sync Error Status Dot

**Files:**
- Modify: `gh-ctrl/client/src/components/MailboxBuilding.tsx`

**Step 1: Add sync error polling**

```typescript
const [syncError, setSyncError] = useState<string | null>(null)

useEffect(() => {
  if (!isConfigured) return
  const check = async () => {
    try {
      const { error } = await api.getMailStatus(currentBuilding.id)
      setSyncError(error)
    } catch { /* ignore */ }
  }
  check()
  const interval = setInterval(check, 60_000)
  return () => clearInterval(interval)
}, [isConfigured, currentBuilding.id])
```

**Step 2: Update status dot color and tooltip**

```typescript
background: isConfigured
  ? syncError ? '#ff8800' : 'var(--green-neon)'
  : '#888'

title={isConfigured ? (syncError ? `Sync-Fehler: ${syncError}` : 'Verbunden') : 'Nicht konfiguriert'}
```

---

## Task 12: Check `BuildOptionsMenu` — Mailbox Entry

**Files:**
- Modify: `gh-ctrl/client/src/components/BuildOptionsMenu.tsx` (if needed)

**Step 1: Read the file, check if `type: 'mailbox'` exists**

If missing, add:
```typescript
{
  type: 'mailbox',
  name: 'Snailbox',
  description: 'Vollwertiger E-Mail-Client. Verbinde dein IMAP/SMTP-Postfach — alle Ordner werden automatisch synchronisiert.',
  buildImage: '/buildings/snailbox.png',
  defaultColor: '#4488ff',
},
```

---

## Final Verification

```bash
# 1. Backend compiles
cd gh-ctrl && bun run dev:server

# 2. Frontend compiles
cd gh-ctrl/client && bun run build

# 3. Full dev
cd gh-ctrl && bun run dev
```

End-to-end checklist:
- [ ] Place Mailbox → Setup → Test Connection → Save
- [ ] Folder sidebar loads (Posteingang, Gesendet, Entwürfe, Papierkorb, Spam etc.)
- [ ] Click folder → messages load
- [ ] Click message → body visible in right pane
- [ ] Antworten → To/Subject/body pre-filled
- [ ] Allen antworten → CC pre-filled
- [ ] Weiterleiten → Fwd: subject, empty To
- [ ] CC + BCC in compose
- [ ] BCC toggle
- [ ] Send fail → red inline error banner
- [ ] 30s inactivity → draft auto-saved
- [ ] Move to Papierkorb → message gone from INBOX
- [ ] Permanent delete from Papierkorb
- [ ] IMAP error → building dot turns orange
