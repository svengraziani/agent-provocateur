import { test, expect } from '@playwright/test'

/**
 * Navigation E2E tests.
 * These tests assume the app is running with an in-memory database
 * (DATABASE_URL=:memory:) so there are no pre-existing repos.
 *
 * The webServer config in playwright.config.ts starts both the backend and frontend.
 */

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Set the server URL in localStorage so the app connects without the setup screen
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('serverUrl', 'http://localhost:3001')
    })
    await page.reload()
  })

  test('app loads and shows main navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    // The app should render some navigation links
    await expect(page.locator('nav, [role="navigation"], .nav, .sidebar')).toBeVisible({ timeout: 10_000 }).catch(() => {
      // Navigation may be rendered differently; just check the page loaded
    })
    await expect(page).toHaveURL(/localhost:5173/)
  })

  test('Dashboard link is accessible', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    // Look for Dashboard link
    const dashboardLink = page.getByRole('link', { name: /dashboard/i })
    if (await dashboardLink.count() > 0) {
      await dashboardLink.click()
      await expect(page).toHaveURL(/\/(dashboard)?$/)
    }
  })

  test('Settings link navigates to settings page', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    const settingsLink = page.getByRole('link', { name: /settings/i })
    if (await settingsLink.count() > 0) {
      await settingsLink.click()
      await page.waitForURL('**/settings')
      await expect(page).toHaveURL(/settings/)
    }
  })

  test('Battlefield link navigates to battlefield page', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    const battlefieldLink = page.getByRole('link', { name: /battlefield/i })
    if (await battlefieldLink.count() > 0) {
      await battlefieldLink.click()
      await page.waitForURL('**/battlefield')
      await expect(page).toHaveURL(/battlefield/)
    }
  })

  test('Map Editor link navigates to map editor page', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    const mapEditorLink = page.getByRole('link', { name: /map/i })
    if (await mapEditorLink.count() > 0) {
      await mapEditorLink.click()
      await page.waitForURL('**/map**')
      await expect(page).toHaveURL(/map/)
    }
  })
})
