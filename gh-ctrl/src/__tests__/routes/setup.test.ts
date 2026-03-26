import { describe, it, expect, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTestDb } from '../test-db'

const testDb = createTestDb()

mock.module('../../db', () => ({ db: testDb }))

const { default: setupRouter } = await import('../../routes/setup')

const app = new Hono()
app.route('/', setupRouter)

describe('GET /status', () => {
  it('returns ready=false when gh CLI is not installed', async () => {
    const original = Bun.spawnSync
    let callCount = 0
    ;(Bun as any).spawnSync = (cmd: string[]) => {
      callCount++
      if (cmd[0] === 'gh' && cmd[1] === '--version') {
        return { exitCode: 1, stdout: Buffer.from(''), stderr: Buffer.from('not found') }
      }
      if (cmd[0] === 'gh' && cmd[1] === 'auth') {
        return { exitCode: 1, stdout: Buffer.from(''), stderr: Buffer.from('not logged in') }
      }
      return { exitCode: 0, stdout: Buffer.from(''), stderr: Buffer.from('') }
    }

    const res = await app.request('/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ready).toBe(false)
    expect(body.checks).toBeDefined()

    const ghCheck = body.checks.find((c: any) => c.id === 'gh_installed')
    expect(ghCheck.ok).toBe(false)

    ;(Bun as any).spawnSync = original
  })

  it('returns db check as ok when database is accessible', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = (cmd: string[]) => {
      if (cmd[1] === '--version') {
        return { exitCode: 0, stdout: Buffer.from('gh version 2.0.0'), stderr: Buffer.from('') }
      }
      return { exitCode: 0, stdout: Buffer.from(''), stderr: Buffer.from('Logged in as user') }
    }

    const res = await app.request('/status')
    const body = await res.json()
    const dbCheck = body.checks.find((c: any) => c.id === 'db')
    expect(dbCheck.ok).toBe(true)

    ;(Bun as any).spawnSync = original
  })

  it('returns proper check structure', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from('gh version 2.0.0'),
      stderr: Buffer.from('Logged in as testuser'),
    })

    const res = await app.request('/status')
    const body = await res.json()

    expect(body).toHaveProperty('ready')
    expect(body).toHaveProperty('mode')
    expect(body).toHaveProperty('checks')
    expect(Array.isArray(body.checks)).toBe(true)

    const ids = body.checks.map((c: any) => c.id)
    expect(ids).toContain('gh_installed')
    expect(ids).toContain('gh_auth')
    expect(ids).toContain('db')

    ;(Bun as any).spawnSync = original
  })
})
