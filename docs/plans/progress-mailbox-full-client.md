# Mailbox Full Email Client — Progress

**Branch:** `claude/issue-261-20260324-1412`
**Plan:** `docs/plans/2026-03-24-mailbox-full-client.md`
**Design:** `docs/plans/2026-03-24-mailbox-full-client-design.md`
**Last updated:** 2026-03-25

---

## Task Status

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | DB Schema — `mail_folders` + `mail_messages` Erweiterung | ✅ Done | Spec + Quality reviewed |
| 2 | Backend — Folder Discovery (`syncFolders`) | ⬜ TODO | |
| 3 | Backend — Full Body Fetching + Multi-Folder Poll | ⬜ TODO | |
| 4 | Backend — Updated Send + Draft Support | ⬜ TODO | |
| 5 | Backend — Neue Routes (`/folders`, `/drafts`, `/status`) | ⬜ TODO | |
| 6 | Frontend — Types + API Client | ⬜ TODO | |
| 7 | Frontend — `FolderSidebar` Component | ⬜ TODO | |
| 8 | Frontend — `ComposePane` Component | ⬜ TODO | |
| 9 | Frontend — `MessageDetail` Component | ⬜ TODO | |
| 10 | Frontend — `MailboxInboxDialog` Refactor 3-Pane | ⬜ TODO | |
| 11 | Frontend — `MailboxBuilding` Sync Error Dot | ⬜ TODO | |
| 12 | `BuildOptionsMenu` — Mailbox-Eintrag prüfen | ⬜ TODO | |

---

## Task 1 Details (✅ Done)

**Files changed:**
- `gh-ctrl/src/db/index.ts` — `CREATE TABLE IF NOT EXISTS mail_messages` (mit allen Spalten inkl. `folder`, `cc_addresses`, `bcc_addresses`, `html_body`, `in_reply_to`), Column-Migration via `PRAGMA table_info`, `CREATE TABLE IF NOT EXISTS mail_folders` mit `UNIQUE(building_id, name)`
- `gh-ctrl/src/db/schema.ts` — `mailMessages` um 5 Spalten erweitert, `mailFolders` neu hinzugefügt

**Open Quality Findings (User entscheidet):**

- **Important #1:** `mailFolders` fehlt `uniqueIndex` in Drizzle schema — DDL hat `UNIQUE(building_id, name)`, schema.ts nicht. Relevant für `onConflictDoUpdate` in Task 2. Fix: `uniqueIndex('mail_folders_building_id_name_idx', ['building_id', 'name'])` zum Table hinzufügen.
- **Important #2:** `mail_messages` kein Unique Constraint auf `(building_id, message_id)` — Poll-Loop nutzt racy SELECT. Fix: `UNIQUE(building_id, message_id)` in DDL + Drizzle, dann `onConflictDoNothing()` statt manuellem Check.
- **Minor #3:** `folder` in `newMailCols` redundant (steht schon im `CREATE TABLE`).
- **Minor #4:** `mapRepos` unique constraint fehlt im Schema — pre-existierendes Issue.
- **Minor #5:** `isRead`/`isStarred`/`ok` als plain `integer` statt `{ mode: 'boolean' }`.

---

## Nächster Schritt

**Task 2: Backend — Folder Discovery**
- File: `gh-ctrl/src/mailbox-service.ts`
- Was: `syncFolders()` hinzufügen, `scheduleMailbox` + `initMailboxService` updaten
- Abhängigkeit: Task 1 ✅ erledigt
- Vor Start: User-Entscheidung zu Finding #1 (`uniqueIndex` in `mailFolders`) — relevant für `onConflictDoUpdate`

## Workflow für neue Session

```
1. Diese Datei lesen (Progress)
2. Plan lesen: docs/plans/2026-03-24-mailbox-full-client.md
3. User-Entscheidung zu Finding #1 einholen
4. Mit Task 2 starten via superpowers:subagent-driven-development
```
