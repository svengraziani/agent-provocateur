# Mailbox Full Email Client Design

**Date:** 2026-03-24
**Status:** Approved

## Overview

Upgrade the existing Mailbox building from a basic IMAP viewer to a fully functional email client modeled after Apple Mail. Features: dynamic IMAP folder sync, full body-text fetching, CC/BCC, Reply/Reply-All/Forward, Draft auto-save, Sent caching, Trash workflow, and inline error handling.

---

## 1. Data Model

### New table: `mail_folders`

Stores the IMAP folder tree per building, synced dynamically from the server.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Auto-increment |
| `buildingId` | integer FK | References `buildings.id` (cascade delete) |
| `name` | text | IMAP path e.g. `INBOX`, `[Gmail]/Sent Mail` |
| `displayName` | text | Normalized display name e.g. `Gesendet` |
| `role` | text | `inbox` / `sent` / `drafts` / `trash` / `spam` / `archive` / `custom` |
| `unreadCount` | integer | Cached unread count, updated on sync |
| `delimiter` | text | IMAP hierarchy delimiter (usually `/` or `.`) |
| `syncedAt` | integer | Last sync timestamp (ms) |

### Modified table: `mail_messages`

5 new columns added via migration:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `folder` | text | `'INBOX'` | IMAP folder name the message belongs to |
| `ccAddresses` | text | null | JSON array of CC addresses |
| `bccAddresses` | text | null | JSON array of BCC addresses (sent mails only) |
| `inReplyTo` | text | null | Message-ID of original message (threading) |
| `htmlBody` | text | null | Full HTML body (fallback to bodyText) |

**Body fallback chain:** `htmlBody → bodyText → snippet → "Kein Inhalt verfügbar"`
**HTML rendering:** Stripped to plain text — no iframe, no XSS risk.

**Folder semantics:**
- Incoming mails → `folder = IMAP folder name`
- Sent mails → `folder = name of role='sent' folder`
- Drafts → `folder = name of role='drafts' folder`
- Delete → move to `folder = name of role='trash' folder` (permanent delete only from Trash)

---

## 2. Backend Architecture

### Folder Discovery (`mailbox-service.ts`)

On first connect and on every manual sync:
1. `client.list("", "*")` — fetch all IMAP folders
2. Map IMAP special-use attributes to `role`:
   - `\Sent` → `sent`
   - `\Junk`, `\Spam` → `spam`
   - `\Trash` → `trash`
   - `\Drafts` → `drafts`
   - `\Archive` → `archive`
   - Everything else → `custom`
3. Upsert into `mail_folders` — new folders added, removed folders kept (soft)
4. Normalize `displayName` per provider (Gmail `[Gmail]/Sent Mail` → `Gesendet`, Outlook `Sent Items` → `Gesendet`, etc.)

### Poll Logic

- Poll all subscribed folders (not just INBOX)
- Each folder polled at the configured interval
- Body text fetched via imapflow `bodyParts` — `text/plain` preferred, `text/html` as fallback
- `snippet` = first 200 chars of plain text body

### `sendMailboxEmail` signature change

```typescript
sendMailboxEmail(config, { to, cc?, bcc?, subject, body, inReplyTo? }): Promise<void>
```

- Sets `In-Reply-To` and `References` headers when replying
- After successful send: inserts message into DB with `folder = sentFolderName`
- On SMTP failure: throws with descriptive error message (no silent fail)

### New routes in `buildings.ts`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:id/mail/folders` | List all folders for building |
| `POST` | `/:id/mail/folders/sync` | Re-fetch folder list from IMAP |
| `PATCH` | `/:id/mail/:msgId/folder` | Move message to folder (trash, archive etc.) |
| `POST` | `/:id/mail/drafts` | Save or update a draft |

---

## 3. UI — 3-Pane Layout (Apple Mail style)

```
┌─────────────┬──────────────────┬───────────────────────────────┐
│  ORDNER     │  NACHRICHTEN     │  DETAIL / COMPOSE             │
│             │                  │                               │
│ ● INBOX (3) │ ▶ Max Mustermann │  Betreff: Re: Deploy heute    │
│   Gesendet  │   Re: Deploy h.. │  Von: max@example.com         │
│   Entwürfe  │   gestern        │  An: ich@example.com          │
│   Papierkorb│                  │  CC: team@example.com         │
│   Spam      │ ▶ GitHub         │                               │
│   Archiv    │   PR #42 merged  │  ── Text ──────────────────── │
│   [custom]  │   Mo.            │  Hey, der Deploy läuft...     │
│             │                  │                               │
│             │                  │  [Antworten][Allen][Weiterlt.] │
└─────────────┴──────────────────┴───────────────────────────────┘
```

### Folder Sidebar (left pane)
- Dynamically rendered from `mail_folders` DB
- Unread badge per folder
- Active folder highlighted
- Standard roles shown first (INBOX, Sent, Drafts, Trash, Spam, Archive), custom folders below separator
- Sync spinner on folder header during sync

### Message List (middle pane)
- Sorted by date descending
- Unread: bold sender + subject + green dot
- Read: dimmed
- Star toggle inline
- Click → mark as read, show in right pane

### Detail Pane (right pane)
**Reading mode:**
- Subject, From, To, CC, Date header
- Body text (HTML stripped to plain text)
- Action buttons: `Antworten` / `Allen antworten` / `Weiterleiten` / `In Papierkorb`

**Compose mode** (Reply/Reply-All/Forward/New):
- `An:` — multi-tag input (Enter/comma separates addresses)
- `CC:` — always visible
- `BCC:` — toggle button to show/hide
- `Betreff:` — pre-filled for Reply (`Re: ...`) and Forward (`Fwd: ...`)
- Body textarea — Reply/Forward quotes original below a `---` separator
- Send error: red inline banner below body (not just toast), button stays active for retry
- `Senden` / `Als Entwurf` / `Abbrechen` buttons

### Draft Auto-Save
- 30s inactivity in compose → auto-save to DB (`folder = drafts`)
- Close with content → "Als Entwurf speichern?" confirmation
- Draft reopens from Drafts folder

---

## 4. Error Handling

| Scenario | Behavior |
|----------|----------|
| SMTP send fails | Red banner inside compose, descriptive message, retry possible |
| IMAP sync fails | Building status dot → orange, tooltip shows last error |
| Folder sync fails | Last known folder list stays visible, error in sidebar header |
| Body unavailable | Fallback chain: htmlBody → bodyText → snippet → placeholder text |
| Draft auto-save fails | Silent retry, no interruption to user |

---

## 5. TypeScript Types

```typescript
// Extended MailMessage
interface MailMessage {
  id: number
  buildingId: number
  messageId: string
  folder: string
  subject: string | null
  fromAddress: string | null
  toAddresses: string | null    // JSON
  ccAddresses: string | null    // JSON
  bccAddresses: string | null   // JSON
  date: number | null
  snippet: string | null
  bodyText: string | null
  htmlBody: string | null
  inReplyTo: string | null
  isRead: number
  isStarred: number
  fetchedAt: Date
}

// New type
interface MailFolder {
  id: number
  buildingId: number
  name: string
  displayName: string
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
  unreadCount: number
  delimiter: string
  syncedAt: number | null
}

// Compose params
interface SendMailParams {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  inReplyTo?: string
}
```
