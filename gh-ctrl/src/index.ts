import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import reposRouter from './routes/repos'
import githubRouter from './routes/github'
import mapsRouter from './routes/maps'
import pkg from '../package.json'

const app = new Hono()

app.use('*', cors({ origin: ['http://localhost:5173'] }))
app.use('*', logger())

app.route('/api/repos', reposRouter)
app.route('/api/github', githubRouter)
app.route('/api/maps', mapsRouter)

app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/version', (c) => c.json({ version: pkg.version }))

// Serve built React in production
app.use('*', serveStatic({ root: './client/dist' }))
app.get('*', serveStatic({ path: './client/dist/index.html' }))

export default { port: 3001, hostname: '0.0.0.0', fetch: app.fetch }
