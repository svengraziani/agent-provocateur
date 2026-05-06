import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const repos = sqliteTable('repos', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  owner:       text('owner').notNull(),
  name:        text('name').notNull(),
  fullName:    text('full_name').notNull(),
  description: text('description'),
  color:       text('color').default('#00ff88'),
  provider:     text('provider').notNull().default('github'), // 'github' | 'gitlab'
  instanceUrl:  text('instance_url'),                        // null = cloud, set for self-hosted GitLab
  gitlabToken:  text('gitlab_token'),                        // per-repo GitLab PAT
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

export const settings = sqliteTable('settings', {
  key:       text('key').primaryKey(),
  value:     text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
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

export const contacts = sqliteTable('contacts', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  username:    text('username').notNull().unique(),
  email:       text('email').notNull(),
  displayName: text('display_name'),
  notes:       text('notes').default(''),
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// SSH connection profiles for RemotePost buildings
export const sshConnections = sqliteTable('ssh_connections', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  buildingId:     integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  label:          text('label').notNull(),
  host:           text('host').notNull(),
  port:           integer('port').default(22),
  username:       text('username').notNull(),
  authType:       text('auth_type').default('password'), // 'password' | 'key'
  encryptedCreds: text('encrypted_creds'),               // AES-256-GCM encrypted JSON
  tmuxSession:    text('tmux_session'),                  // null = no tmux, string = session name
  windowRepoLinks: text('window_repo_links'),             // JSON: { [windowIndex: string]: number[] }
  createdAt:      integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt:      integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Audit log for SSH connects / disconnects
export const sshSessionLog = sqliteTable('ssh_session_log', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  buildingId:      integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  connectionId:    integer('connection_id'),              // FK to sshConnections (nullable if deleted)
  connectionLabel: text('connection_label'),              // snapshot of label at connect time
  connectedAt:     integer('connected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  disconnectedAt:  integer('disconnected_at', { mode: 'timestamp' }),
  durationMs:      integer('duration_ms'),
})

// Source Relay: connectors (git repos and websites used as content sources)
export const sourceRelayConnectors = sqliteTable('source_relay_connectors', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  buildingId:    integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  name:          text('name').notNull(),
  type:          text('type').notNull().default('git'), // 'git' | 'private_git' | 'website'
  configuration: text('configuration').notNull().default('{}'), // JSON: {url, branch?, token?} or {url}
  createdAt:     integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Source Relay: fetchers — each fetcher aggregates multiple connectors into a single public URL
export const sourceRelayFetchers = sqliteTable('source_relay_fetchers', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  buildingId:  integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  uniqueToken: text('unique_token').notNull().unique(),
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Source Relay: links a connector to a fetcher, optionally with a list of selected file paths
export const sourceRelayConnectorFiles = sqliteTable('source_relay_connector_files', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  connectorId: integer('connector_id').notNull().references(() => sourceRelayConnectors.id, { onDelete: 'cascade' }),
  fetcherId:   integer('fetcher_id').notNull().references(() => sourceRelayFetchers.id, { onDelete: 'cascade' }),
  filePaths:   text('file_paths').notNull().default('[]'), // JSON array; empty = include all files
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Obelisk: markdown files / directory tree per building
export const obeliskFiles = sqliteTable('obelisk_files', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  buildingId:  integer('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
  path:        text('path').notNull(),
  content:     text('content').notNull().default(''),
  isDirectory: integer('is_directory', { mode: 'boolean' }).notNull().default(false),
  createdAt:   integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})