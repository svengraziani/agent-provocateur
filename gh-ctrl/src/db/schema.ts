import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id:             text('id').primaryKey(),
  accessToken:    text('access_token').notNull(),
  githubLogin:    text('github_login').notNull(),
  githubAvatarUrl: text('github_avatar_url').notNull().default(''),
  createdAt:      integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  expiresAt:      integer('expires_at', { mode: 'timestamp' }).notNull(),
})

export const repos = sqliteTable('repos', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  owner:       text('owner').notNull(),
  name:        text('name').notNull(),
  fullName:    text('full_name').notNull().unique(),
  description: text('description'),
  color:       text('color').default('#00ff88'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const maps = sqliteTable('maps', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  name:      text('name').notNull(),
  width:     integer('width').notNull().default(20),
  height:    integer('height').notNull().default(20),
  tiles:     text('tiles').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})
