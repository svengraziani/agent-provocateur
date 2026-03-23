import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTestDb } from '../test-db'
import { buildings, clawcomMessages } from '../../db/schema'

const testDb = createTestDb()

mock.module('../../db', () => ({ db: testDb }))

const { default: buildingsRouter } = await import('../../routes/buildings')

const app = new Hono()
app.route('/', buildingsRouter)

async function clearAll() {
  await testDb.delete(clawcomMessages)
  await testDb.delete(buildings)
}

describe('GET /', () => {
  beforeEach(clearAll)

  it('returns empty array when no buildings exist', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns all buildings', async () => {
    await testDb.insert(buildings).values({
      type: 'clawcom',
      name: 'HQ',
      color: '#00ff88',
      posX: 100,
      posY: 200,
      config: '{}',
    })
    const res = await app.request('/')
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('HQ')
  })
})

describe('POST /', () => {
  beforeEach(clearAll)

  it('creates a building with required fields', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Command Post', type: 'clawcom' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Command Post')
    expect(body.type).toBe('clawcom')
    expect(body.posX).toBe(800)
    expect(body.posY).toBe(400)
  })

  it('creates a building with custom position', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Outpost', type: 'clawcom', posX: 150, posY: 250 }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.posX).toBe(150)
    expect(body.posY).toBe(250)
  })

  it('returns 400 when name is missing', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clawcom' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })
})

describe('GET /:id', () => {
  beforeEach(clearAll)

  it('returns a specific building', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Alpha Base',
      posX: 10,
      posY: 20,
      config: '{}',
    }).returning()
    const res = await app.request(`/${b.id}`)
    expect(res.status).toBe(200)
    expect((await res.json()).name).toBe('Alpha Base')
  })

  it('returns 404 for non-existent building', async () => {
    const res = await app.request('/9999')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /:id', () => {
  beforeEach(clearAll)

  it('updates building position', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()
    const res = await app.request(`/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posX: 300, posY: 400 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.posX).toBe(300)
    expect(body.posY).toBe(400)
  })

  it('updates building color', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()
    const res = await app.request(`/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: '#ff0000' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).color).toBe('#ff0000')
  })

  it('returns 404 for non-existent building', async () => {
    const res = await app.request('/9999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posX: 100 }),
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /:id', () => {
  beforeEach(clearAll)

  it('deletes an existing building', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()
    const res = await app.request(`/${b.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('returns 404 for non-existent building', async () => {
    const res = await app.request('/9999', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('messages', () => {
  beforeEach(clearAll)

  it('GET /:id/messages returns empty array initially', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()
    const res = await app.request(`/${b.id}/messages`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST /:id/messages stores a message', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()

    const res = await app.request(`/${b.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello world' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe('Hello world')
    expect(body.direction).toBe('out')
  })

  it('POST /:id/messages returns 400 when content is empty', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()

    const res = await app.request(`/${b.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('GET /:id/messages returns stored messages in order', async () => {
    const [b] = await testDb.insert(buildings).values({
      name: 'Base',
      posX: 0,
      posY: 0,
      config: '{}',
    }).returning()

    await testDb.insert(clawcomMessages).values([
      { buildingId: b.id, direction: 'out', content: 'First' },
      { buildingId: b.id, direction: 'in', content: 'Second' },
    ])

    const res = await app.request(`/${b.id}/messages`)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].content).toBe('First')
    expect(body[1].content).toBe('Second')
  })
})
