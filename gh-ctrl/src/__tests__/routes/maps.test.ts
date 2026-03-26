import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTestDb } from '../test-db'
import { maps, repos, mapRepos } from '../../db/schema'

const testDb = createTestDb()

mock.module('../../db', () => ({ db: testDb }))

const { default: mapsRouter } = await import('../../routes/maps')

const app = new Hono()
app.route('/', mapsRouter)

async function clearAll() {
  await testDb.delete(mapRepos)
  await testDb.delete(maps)
  await testDb.delete(repos)
}

describe('GET /', () => {
  beforeEach(clearAll)

  it('returns empty array when no maps exist', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns all maps', async () => {
    await testDb.insert(maps).values({ name: 'Test Map', width: 20, height: 20, tiles: '{}' })
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Test Map')
  })
})

describe('POST /', () => {
  beforeEach(clearAll)

  it('creates a new map with default dimensions', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Map' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('My Map')
    expect(body.width).toBe(20)
    expect(body.height).toBe(20)
  })

  it('creates a map with custom dimensions', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Big Map', width: 50, height: 40 }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.width).toBe(50)
    expect(body.height).toBe(40)
  })

  it('returns 400 when name is missing', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width: 20, height: 20 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when dimensions are out of range', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Map', width: 1, height: 20 }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/dimensions/i)
  })

  it('returns 400 when dimensions exceed maximum', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Huge Map', width: 300, height: 20 }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /:id', () => {
  beforeEach(clearAll)

  it('returns a specific map', async () => {
    const [map] = await testDb.insert(maps).values({ name: 'Map A', width: 10, height: 10, tiles: '{}' }).returning()
    const res = await app.request(`/${map.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(map.id)
    expect(body.name).toBe('Map A')
  })

  it('returns 404 for non-existent map', async () => {
    const res = await app.request('/9999')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /:id', () => {
  beforeEach(clearAll)

  it('updates map name', async () => {
    const [map] = await testDb.insert(maps).values({ name: 'Old Name', width: 10, height: 10, tiles: '{}' }).returning()
    const res = await app.request(`/${map.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).name).toBe('New Name')
  })

  it('updates map tiles', async () => {
    const [map] = await testDb.insert(maps).values({ name: 'Map', width: 10, height: 10, tiles: '{}' }).returning()
    const newTiles = JSON.stringify({ '0,0': 'grass' })
    const res = await app.request(`/${map.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiles: newTiles }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).tiles).toBe(newTiles)
  })

  it('returns 404 for non-existent map', async () => {
    const res = await app.request('/9999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /:id', () => {
  beforeEach(clearAll)

  it('deletes an existing map', async () => {
    const [map] = await testDb.insert(maps).values({ name: 'Map', width: 10, height: 10, tiles: '{}' }).returning()
    const res = await app.request(`/${map.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('returns 404 for non-existent map', async () => {
    const res = await app.request('/9999', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('repo assignment', () => {
  beforeEach(clearAll)

  it('assigns and lists repos for a map', async () => {
    const [map] = await testDb.insert(maps).values({ name: 'Map', width: 10, height: 10, tiles: '{}' }).returning()
    const [repo] = await testDb.insert(repos).values({
      owner: 'org',
      name: 'repo',
      fullName: 'org/repo',
    }).returning()

    // Assign
    const assignRes = await app.request(`/${map.id}/repos/${repo.id}`, { method: 'POST' })
    expect(assignRes.status).toBe(200)

    // List
    const listRes = await app.request(`/${map.id}/repos`)
    expect(listRes.status).toBe(200)
    const listed = await listRes.json()
    expect(listed).toHaveLength(1)
    expect(listed[0].fullName).toBe('org/repo')
  })

  it('unassigns a repo from a map', async () => {
    const [map] = await testDb.insert(maps).values({ name: 'Map', width: 10, height: 10, tiles: '{}' }).returning()
    const [repo] = await testDb.insert(repos).values({
      owner: 'org',
      name: 'repo',
      fullName: 'org/repo',
    }).returning()

    await testDb.insert(mapRepos).values({ mapId: map.id, repoId: repo.id })

    const res = await app.request(`/${map.id}/repos/${repo.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const listRes = await app.request(`/${map.id}/repos`)
    const listed = await listRes.json()
    expect(listed).toHaveLength(0)
  })
})
