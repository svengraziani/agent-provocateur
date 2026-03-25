import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'

const sqlite = new Database('./data/github-dashboard.db')
sqlite.exec('PRAGMA journal_mode = WAL;')
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#00ff88',
    created_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 20,
    height INTEGER NOT NULL DEFAULT 20,
    tiles TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS map_repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(map_id, repo_id)
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'clawcom',
    name TEXT NOT NULL DEFAULT 'ClawCom',
    color TEXT DEFAULT '#00ff88',
    pos_x REAL NOT NULL DEFAULT 800,
    pos_y REAL NOT NULL DEFAULT 400,
    config TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS clawcom_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    direction TEXT NOT NULL DEFAULT 'out',
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS healthcheck_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    status_code INTEGER,
    response_time_ms INTEGER,
    error TEXT,
    checked_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS placed_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    label TEXT DEFAULT '',
    pos_x REAL NOT NULL DEFAULT 0,
    pos_y REAL NOT NULL DEFAULT 0,
    scale REAL NOT NULL DEFAULT 1.0,
    map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deadline_timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    deadline TEXT NOT NULL,
    color TEXT DEFAULT '#ff4444',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS mail_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    folder TEXT NOT NULL DEFAULT 'INBOX',
    subject TEXT,
    from_address TEXT,
    to_addresses TEXT,
    cc_addresses TEXT,
    bcc_addresses TEXT,
    date INTEGER,
    snippet TEXT,
    body_text TEXT,
    html_body TEXT,
    in_reply_to TEXT,
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    fetched_at INTEGER DEFAULT (unixepoch())
  )
`)

const existingMailCols = sqlite.query("PRAGMA table_info('mail_messages')").all() as Array<{ name: string }>
const existingMailColNames = new Set(existingMailCols.map((c) => c.name))
const newMailCols: Array<[string, string]> = [
  ['folder',       "TEXT NOT NULL DEFAULT 'INBOX'"],
  ['cc_addresses', 'TEXT'],
  ['bcc_addresses','TEXT'],
  ['html_body',    'TEXT'],
  ['in_reply_to',  'TEXT'],
]
for (const [col, def] of newMailCols) {
  if (!existingMailColNames.has(col)) {
    sqlite.exec(`ALTER TABLE mail_messages ADD COLUMN ${col} ${def}`)
  }
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS mail_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'custom',
    unread_count INTEGER NOT NULL DEFAULT 0,
    delimiter TEXT NOT NULL DEFAULT '/',
    synced_at INTEGER,
    UNIQUE(building_id, name)
  )
`)

export const db = drizzle(sqlite, { schema })
