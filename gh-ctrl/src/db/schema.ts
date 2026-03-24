import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

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

export const buildings = sqliteTable('buildings', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  type:      text('type').notNull().default('clawcom'),
  name:      text('name').notNull().default('ClawCom'),
  color:     text('color').default('#00ff88'),
  posX:      real('pos_x').notNull().default(800),
  posY:      real('pos_y').notNull().default(400),
  config:    text('config').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const clawcomMessages = sqliteTable('clawcom_messages', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  buildingId: integer('building_id').notNull().references(() => buildings.id),
  direction:  text('direction').notNull().default('out'),
  content:    text('content').notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const badges = sqliteTable('badges', {
  id:               integer('id').primaryKey({ autoIncrement: true }),
  name:             text('name').notNull(),
  filename:         text('filename').notNull(),
  originalFilename: text('original_filename').notNull(),
  mimeType:         text('mime_type').notNull(),
  createdAt:        integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const healthcheckResults = sqliteTable('healthcheck_results', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  buildingId:     integer('building_id').notNull().references(() => buildings.id),
  url:            text('url').notNull(),
  ok:             integer('ok').notNull().default(0),
  statusCode:     integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  error:          text('error'),
  checkedAt:      integer('checked_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const placedBadges = sqliteTable('placed_badges', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  badgeId:   integer('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
  label:     text('label').default(''),
  posX:      real('pos_x').notNull().default(0),
  posY:      real('pos_y').notNull().default(0),
  scale:     real('scale').notNull().default(1.0),
  mapId:     integer('map_id').references(() => maps.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const deadlineTimers = sqliteTable('deadline_timers', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  name:        text('name').notNull(),
  description: text('description').default(''),
  deadline:    text('deadline').notNull(), // ISO 8601 date-time string
  color:       text('color').default('#ff4444'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})
