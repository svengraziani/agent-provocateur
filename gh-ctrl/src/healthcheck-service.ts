import { db } from './db'
import { buildings, healthcheckResults } from './db/schema'
import { eq, desc, and } from 'drizzle-orm'

export interface HealthcheckEndpoint {
  url: string
  label: string
}

export interface HealthcheckConfig {
  endpoints: HealthcheckEndpoint[]
  intervalMs: number
  configured: boolean
}

// Map from building id to timer handle
const timers = new Map<number, ReturnType<typeof setInterval>>()

async function runCheck(buildingId: number, endpoint: HealthcheckEndpoint): Promise<void> {
  const start = Date.now()
  let ok = false
  let statusCode: number | null = null
  let error: string | null = null
  let responseTimeMs: number | null = null

  try {
    const res = await fetch(endpoint.url, {
      signal: AbortSignal.timeout(10000),
    })
    statusCode = res.status
    responseTimeMs = Date.now() - start
    ok = res.ok
  } catch (err: any) {
    responseTimeMs = Date.now() - start
    error = err.message ?? 'Unknown error'
  }

  await db.insert(healthcheckResults).values({
    buildingId,
    url: endpoint.url,
    ok: ok ? 1 : 0,
    statusCode,
    responseTimeMs,
    error,
  })
}

async function runAllChecks(buildingId: number, config: HealthcheckConfig): Promise<void> {
  for (const endpoint of config.endpoints) {
    await runCheck(buildingId, endpoint).catch(() => { /* log silently */ })
  }
}

export function scheduleBuilding(buildingId: number, config: HealthcheckConfig): void {
  // Clear existing timer
  const existing = timers.get(buildingId)
  if (existing) clearInterval(existing)

  if (!config.configured || !config.endpoints || config.endpoints.length === 0) {
    timers.delete(buildingId)
    return
  }

  const intervalMs = Math.max(config.intervalMs ?? 60_000, 30_000) // min 30 seconds

  // Run immediately on schedule
  runAllChecks(buildingId, config).catch(() => {})

  // Schedule recurring
  const timer = setInterval(() => {
    runAllChecks(buildingId, config).catch(() => {})
  }, intervalMs)

  timers.set(buildingId, timer)
}

export function unscheduleBuilding(buildingId: number): void {
  const existing = timers.get(buildingId)
  if (existing) clearInterval(existing)
  timers.delete(buildingId)
}

export async function getLatestResults(buildingId: number): Promise<typeof healthcheckResults.$inferSelect[]> {
  const results = await db
    .select()
    .from(healthcheckResults)
    .where(eq(healthcheckResults.buildingId, buildingId))
    .orderBy(desc(healthcheckResults.checkedAt))
    .limit(200)

  // Return the most recent result per URL
  const seen = new Set<string>()
  const latest: typeof healthcheckResults.$inferSelect[] = []
  for (const r of results) {
    if (!seen.has(r.url)) {
      seen.add(r.url)
      latest.push(r)
    }
  }
  return latest
}

export async function initHealthcheckService(): Promise<void> {
  const allBuildings = await db.select().from(buildings)

  for (const building of allBuildings) {
    if (building.type !== 'healthcheck') continue

    let config: Partial<HealthcheckConfig> = {}
    try { config = JSON.parse(building.config ?? '{}') } catch { /* empty */ }

    if (config.configured && config.endpoints?.length) {
      scheduleBuilding(building.id, config as HealthcheckConfig)
    }
  }
}
