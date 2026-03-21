import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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

export const mapRepos = sqliteTable('map_repos', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  mapId:     integer('map_id').notNull().references(() => maps.id),
  repoId:    integer('repo_id').notNull().references(() => repos.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})
