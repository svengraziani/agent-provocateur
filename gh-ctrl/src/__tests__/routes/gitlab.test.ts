import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import { createTestDb } from '../test-db'

const testDb = createTestDb()

mock.module('../../db', () => ({ db: testDb }))

const { default: gitlabRouter } = await import('../../routes/gitlab')

const app = new Hono()
app.route('/', gitlabRouter)

describe('GET /instances', () => {
  let originalSpawn: typeof Bun.spawn

  beforeEach(() => {
    originalSpawn = Bun.spawn
  })

  afterEach(() => {
    ;(Bun as any).spawn = originalSpawn
  })

  it('parses glab auth status --all output and returns instances', async () => {
    const sampleOutput = `gitlab.com
  ✓ Logged in to gitlab.com as mschoenlaub (/Users/mschoenlaub/.config/glab-cli/config.yml)
  ✓ Git operations for gitlab.com configured to use ssh protocol.
  ✓ API calls for gitlab.com are made over https protocol.
  ✓ REST API Endpoint: https://gitlab.com/api/v4/
  ✓ GraphQL Endpoint: https://gitlab.com/api/graphql/
  ✓ Token found: **************************
`

    ;(Bun as any).spawn = (cmd: string[]) => {
      if (cmd[0] === 'glab' && cmd[1] === 'auth' && cmd[2] === 'status') {
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sampleOutput))
              controller.close()
            },
          }),
          exited: Promise.resolve(0),
        }
      }
      return { stdout: new ReadableStream({ start(c) { c.close() } }), exited: Promise.resolve(1) }
    }

    const res = await app.request('/instances')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.glabAvailable).toBe(true)
    expect(body.instances).toEqual([
      { host: 'gitlab.com', label: 'GitLab (gitlab.com)' },
    ])
  })

  it('handles multiple GitLab instances', async () => {
    const sampleOutput = `gitlab.com
  ✓ Logged in to gitlab.com as user1 (/path/to/config.yml)
  ✓ Token found: **************************

gitlab.example.com
  ✓ Logged in to gitlab.example.com as user2 (/path/to/config.yml)
  ✓ Token found: **************************
`

    ;(Bun as any).spawn = () => ({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sampleOutput))
          controller.close()
        },
      }),
      exited: Promise.resolve(0),
    })

    const res = await app.request('/instances')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.glabAvailable).toBe(true)
    expect(body.instances).toHaveLength(2)
    expect(body.instances[0].host).toBe('gitlab.com')
    expect(body.instances[1].host).toBe('gitlab.example.com')
  })

  it('returns glabAvailable=false when glab has no output', async () => {
    ;(Bun as any).spawn = () => ({
      stdout: new ReadableStream({
        start(controller) {
          controller.close()
        },
      }),
      exited: Promise.resolve(1),
    })

    const res = await app.request('/instances')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.glabAvailable).toBe(false)
    expect(body.instances).toEqual([])
  })

  it('returns glabAvailable=false when glab throws', async () => {
    ;(Bun as any).spawn = () => {
      throw new Error('glab not found')
    }

    const res = await app.request('/instances')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.glabAvailable).toBe(false)
    expect(body.instances).toEqual([])
  })
})

describe('GET /user-repos', () => {
  let originalSpawn: typeof Bun.spawn

  beforeEach(() => {
    originalSpawn = Bun.spawn
  })

  afterEach(() => {
    ;(Bun as any).spawn = originalSpawn
  })

  it('returns repos from glab api response', async () => {
    const mockProjects = [
      {
        name: 'my-project',
        path_with_namespace: 'user/my-project',
        description: 'A test project',
        web_url: 'https://gitlab.com/user/my-project',
        visibility: 'private',
      },
      {
        name: 'public-repo',
        path_with_namespace: 'org/public-repo',
        description: null,
        web_url: 'https://gitlab.com/org/public-repo',
        visibility: 'public',
      },
    ]

    ;(Bun as any).spawn = () => ({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(mockProjects)))
          controller.close()
        },
      }),
      exited: Promise.resolve(0),
    })

    const res = await app.request('/user-repos?instance=gitlab.com&page=1&per_page=30')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.glabAvailable).toBe(true)
    expect(body.repos).toHaveLength(2)
    expect(body.repos[0]).toEqual({
      name: 'my-project',
      fullName: 'user/my-project',
      description: 'A test project',
      url: 'https://gitlab.com/user/my-project',
      isPrivate: true,
    })
    expect(body.repos[1].isPrivate).toBe(false)
  })

  it('returns glabAvailable=false on glab error', async () => {
    ;(Bun as any).spawn = () => ({
      stdout: new ReadableStream({
        start(controller) {
          controller.close()
        },
      }),
      exited: Promise.resolve(1),
    })

    const res = await app.request('/user-repos?instance=gitlab.com')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.glabAvailable).toBe(false)
    expect(body.repos).toEqual([])
  })
})
