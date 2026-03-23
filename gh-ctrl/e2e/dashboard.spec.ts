import { test, expect, request } from '@playwright/test'

/**
 * Dashboard E2E tests.
 *
 * These tests cover the main dashboard view: page loads, API health,
 * and adding/removing repos via the Settings UI.
 */

test.describe('API health', () => {
  test('backend health endpoint returns ok', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/health')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('backend version endpoint returns version string', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/version')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(typeof body.version).toBe('string')
  })

  test('repos endpoint returns an array', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/repos')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test('maps endpoint returns an array', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/maps')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test('buildings endpoint returns an array', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/buildings')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test('setup status endpoint returns check structure', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/setup/status')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body).toHaveProperty('ready')
    expect(body).toHaveProperty('checks')
    expect(Array.isArray(body.checks)).toBe(true)
  })
})

test.describe('Dashboard page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('serverUrl', 'http://localhost:3001')
    })
    await page.reload()
  })

  test('page title is set', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('app renders without crashing', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    // Check there's no unhandled error overlay
    const errorOverlay = page.locator('#vite-error-overlay, .error-overlay')
    await expect(errorOverlay).not.toBeVisible()
    // Something should be rendered in the body
    const body = page.locator('body')
    const bodyText = await body.innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})

test.describe('Maps API CRUD', () => {
  test('can create and delete a map via API', async ({ request }) => {
    // Create
    const createRes = await request.post('http://localhost:3001/api/maps', {
      data: { name: 'E2E Test Map', width: 10, height: 10 },
    })
    expect(createRes.ok()).toBe(true)
    const map = await createRes.json()
    expect(map.name).toBe('E2E Test Map')
    expect(map.id).toBeDefined()

    // Get
    const getRes = await request.get(`http://localhost:3001/api/maps/${map.id}`)
    expect(getRes.ok()).toBe(true)
    expect((await getRes.json()).name).toBe('E2E Test Map')

    // Update
    const updateRes = await request.patch(`http://localhost:3001/api/maps/${map.id}`, {
      data: { name: 'Updated E2E Map' },
    })
    expect(updateRes.ok()).toBe(true)
    expect((await updateRes.json()).name).toBe('Updated E2E Map')

    // Delete
    const deleteRes = await request.delete(`http://localhost:3001/api/maps/${map.id}`)
    expect(deleteRes.ok()).toBe(true)

    // Verify deleted
    const afterDelete = await request.get(`http://localhost:3001/api/maps/${map.id}`)
    expect(afterDelete.status()).toBe(404)
  })
})

test.describe('Buildings API CRUD', () => {
  test('can create and delete a building via API', async ({ request }) => {
    // Create
    const createRes = await request.post('http://localhost:3001/api/buildings', {
      data: { name: 'E2E Building', type: 'clawcom', posX: 100, posY: 200 },
    })
    expect(createRes.ok()).toBe(true)
    const building = await createRes.json()
    expect(building.name).toBe('E2E Building')
    expect(building.posX).toBe(100)
    expect(building.posY).toBe(200)

    // Update position
    const updateRes = await request.patch(`http://localhost:3001/api/buildings/${building.id}`, {
      data: { posX: 300, posY: 400 },
    })
    expect(updateRes.ok()).toBe(true)
    expect((await updateRes.json()).posX).toBe(300)

    // Delete
    const deleteRes = await request.delete(`http://localhost:3001/api/buildings/${building.id}`)
    expect(deleteRes.ok()).toBe(true)
  })

  test('building messages can be sent and retrieved', async ({ request }) => {
    // Create building
    const createRes = await request.post('http://localhost:3001/api/buildings', {
      data: { name: 'Msg Building', type: 'clawcom' },
    })
    const building = await createRes.json()

    // Send message
    const msgRes = await request.post(`http://localhost:3001/api/buildings/${building.id}/messages`, {
      data: { content: 'E2E test message' },
    })
    expect(msgRes.ok()).toBe(true)
    expect((await msgRes.json()).content).toBe('E2E test message')

    // Retrieve messages
    const listRes = await request.get(`http://localhost:3001/api/buildings/${building.id}/messages`)
    const messages = await listRes.json()
    expect(messages.some((m: any) => m.content === 'E2E test message')).toBe(true)

    // Cleanup
    await request.delete(`http://localhost:3001/api/buildings/${building.id}`)
  })
})
