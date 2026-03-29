import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import reposRouter from './routes/repos'
import githubRouter from './routes/github'
import gitlabRouter from './routes/gitlab'
import mapsRouter from './routes/maps'
import setupRouter from './routes/setup'
import buildingsRouter from './routes/buildings'
import badgesRouter from './routes/badges'
import timersRouter from './routes/timers'
import contactsRouter from './routes/contacts'
import pkg from '../package.json'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { initHealthcheckService } from './healthcheck-service'
import { initMailboxService } from './mailbox-service'
import { authMiddleware } from './middleware/auth'
import { seedDefaultMaps } from './seed'

// Ensure uploads directory exists on startup
const uploadsDir = join(process.cwd(), 'uploads', 'badges')
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true })
}

const app = new Hono()

const configuredOrigins = [
  'http://localhost:5173',
  ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
]

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*'
      if (origin.startsWith('chrome-extension://')) return origin
      if (configuredOrigins.includes(origin)) return origin
      return null
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
)
app.use('*', logger())
app.use('/api/*', authMiddleware)

app.route('/api/repos', reposRouter)
app.route('/api/github', githubRouter)
app.route('/api/gitlab', gitlabRouter)
app.route('/api/maps', mapsRouter)
app.route('/api/setup', setupRouter)
app.route('/api/buildings', buildingsRouter)
app.route('/api/badges', badgesRouter)
app.route('/api/timers', timersRouter)
app.route('/api/contacts', contactsRouter)

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/version', (c) => c.json({ version: pkg.version }))

// Serve uploaded badge images
app.use('/uploads/*', serveStatic({ root: './' }))

// Serve built React in production
app.use('*', serveStatic({ root: './client/dist' }))
app.get('*', serveStatic({ path: './client/dist/index.html' }))

// Seed default data and initialize background services
seedDefaultMaps().catch((err) => console.error('[seed] error:', err))
initHealthcheckService().catch((err) => console.error('[healthcheck-service] init error:', err))
initMailboxService().catch((err) => console.error('[mailbox-service] init error:', err))

export default { port: 3001, hostname: '0.0.0.0', fetch: app.fetch }
