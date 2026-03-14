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
