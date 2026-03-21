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

export const db = drizzle(sqlite, { schema })
