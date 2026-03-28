import { describe, it, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTestDb } from '../test-db'
import { repos } from '../../db/schema'

// Set up in-memory DB before any imports that touch the real DB
const testDb = createTestDb()

mock.module('../../db', () => ({ db: testDb }))

const { default: reposRouter } = await import('../../routes/repos')

const app = new Hono()
app.route('/', reposRouter)

// Helper to clear the repos table between tests
async function clearRepos() {
  await testDb.delete(repos)
}

describe('GET /', () => {
  beforeEach(clearRepos)

  it('returns empty array when no repos exist', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns all repos', async () => {
    await testDb.insert(repos).values({
      owner: 'testowner',
      name: 'testrepo',
      fullName: 'testowner/testrepo',
      color: '#ff0000',
    })

    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].fullName).toBe('testowner/testrepo')
    expect(body[0].owner).toBe('testowner')
    expect(body[0].name).toBe('testrepo')
  })
})

describe('POST /', () => {
  beforeEach(clearRepos)

  it('returns 400 when fullName is missing', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/fullName/i)
  })

  it('returns 404 when gh CLI cannot find the repo', async () => {
    // Mock Bun.spawnSync to simulate repo not found
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({ exitCode: 1, stdout: Buffer.from(''), stderr: Buffer.from('not found') })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'nonexistent/repo' }),
    })
    expect(res.status).toBe(404)

    ;(Bun as any).spawnSync = original
  })

  it('returns 401 when gh CLI returns auth error', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('not logged in'),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'owner/repo' }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/authenticated/i)

    ;(Bun as any).spawnSync = original
  })

  it('creates repo when gh CLI succeeds', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ nameWithOwner: 'myorg/myrepo' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'myorg/myrepo', color: '#00ff88' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.fullName).toBe('myorg/myrepo')
    expect(body.owner).toBe('myorg')
    expect(body.name).toBe('myrepo')
    expect(body.color).toBe('#00ff88')

    ;(Bun as any).spawnSync = original
  })

  it('returns 409 when repo already exists', async () => {
    await testDb.insert(repos).values({
      owner: 'myorg',
      name: 'myrepo',
      fullName: 'myorg/myrepo',
    })

    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ nameWithOwner: 'myorg/myrepo' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'myorg/myrepo' }),
    })
    expect(res.status).toBe(409)

    ;(Bun as any).spawnSync = original
  })
})

describe('POST / (gitlab provider)', () => {
  beforeEach(clearRepos)

  it('creates repo when glab CLI succeeds', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'mygroup/myproject' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'mygroup/myproject', provider: 'gitlab' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.fullName).toBe('mygroup/myproject')
    expect(body.owner).toBe('mygroup')
    expect(body.name).toBe('myproject')
    expect(body.provider).toBe('gitlab')

    ;(Bun as any).spawnSync = original
  })

  it('creates repo with nested namespace', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'org/team/subteam/project' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'org/team/subteam/project', provider: 'gitlab' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.fullName).toBe('org/team/subteam/project')
    expect(body.owner).toBe('org/team/subteam')
    expect(body.name).toBe('project')

    ;(Bun as any).spawnSync = original
  })

  it('returns 404 when glab CLI cannot find the project', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('project not found'),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'nonexistent/project', provider: 'gitlab' }),
    })
    expect(res.status).toBe(404)

    ;(Bun as any).spawnSync = original
  })

  it('normalizes GitLab URL to namespace/project', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'mygroup/myproject' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'https://gitlab.com/mygroup/myproject', provider: 'gitlab' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.fullName).toBe('mygroup/myproject')

    ;(Bun as any).spawnSync = original
  })

  it('detects self-hosted instance URL from full URL', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'team/project' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'https://gitlab.example.com/team/project', provider: 'gitlab' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.fullName).toBe('team/project')
    expect(body.instanceUrl).toBe('https://gitlab.example.com')

    ;(Bun as any).spawnSync = original
  })

  it('strips .git suffix from fullName', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'mygroup/myproject' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'https://gitlab.com/mygroup/myproject.git', provider: 'gitlab' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.fullName).toBe('mygroup/myproject')

    ;(Bun as any).spawnSync = original
  })

  it('stores custom color and gitlabToken', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'mygroup/myproject' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'mygroup/myproject',
        provider: 'gitlab',
        color: '#ff0000',
        gitlabToken: 'glpat-xxxxxxxxxxxx',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.color).toBe('#ff0000')
    expect(body.gitlabToken).toBe('glpat-xxxxxxxxxxxx')

    ;(Bun as any).spawnSync = original
  })

  it('returns 409 when gitlab repo already exists', async () => {
    await testDb.insert(repos).values({
      owner: 'mygroup',
      name: 'myproject',
      fullName: 'mygroup/myproject',
      provider: 'gitlab',
    })

    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'mygroup/myproject' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'mygroup/myproject', provider: 'gitlab' }),
    })
    expect(res.status).toBe(409)

    ;(Bun as any).spawnSync = original
  })

  it('uses explicit instanceUrl over URL-detected one', async () => {
    const original = Bun.spawnSync
    ;(Bun as any).spawnSync = () => ({
      exitCode: 0,
      stdout: Buffer.from(JSON.stringify({ path_with_namespace: 'team/project' })),
      stderr: Buffer.from(''),
    })

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'https://gitlab.example.com/team/project',
        provider: 'gitlab',
        instanceUrl: 'https://custom.gitlab.com',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.instanceUrl).toBe('https://custom.gitlab.com')

    ;(Bun as any).spawnSync = original
  })
})

describe('PATCH /:id', () => {
  beforeEach(clearRepos)

  it('updates repo color', async () => {
    const [repo] = await testDb.insert(repos).values({
      owner: 'myorg',
      name: 'myrepo',
      fullName: 'myorg/myrepo',
      color: '#000000',
    }).returning()

    const res = await app.request(`/${repo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: '#ff0000' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.color).toBe('#ff0000')
  })

  it('returns 404 for non-existent repo', async () => {
    const res = await app.request('/9999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: '#ff0000' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no valid fields provided', async () => {
    const res = await app.request('/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /:id', () => {
  beforeEach(clearRepos)

  it('deletes an existing repo', async () => {
    const [repo] = await testDb.insert(repos).values({
      owner: 'myorg',
      name: 'myrepo',
      fullName: 'myorg/myrepo',
    }).returning()

    const res = await app.request(`/${repo.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 404 for non-existent repo', async () => {
    const res = await app.request('/9999', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
