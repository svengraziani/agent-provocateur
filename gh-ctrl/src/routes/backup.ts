import { Hono } from 'hono'
import { sqliteDb } from '../db'
import { join } from 'node:path'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import pkg from '../../package.json'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'badges')

const router = new Hono()

// All table names in export/import order (FK dependency order for inserts)
const TABLE_INSERT_ORDER = [
  'repos',
  'maps',
  'buildings',
  'badges',
  'deadline_timers',
  'contacts',
  'settings',
  'map_repos',
  'clawcom_messages',
  'healthcheck_results',
  'mail_folders',
  'mail_messages',
  'placed_badges',
  'ssh_connections',
  'ssh_session_log',
]

// Reverse order for deletes
const TABLE_DELETE_ORDER = [...TABLE_INSERT_ORDER].reverse()

// GET /export — download a full backup as ZIP
router.get('/export', async (c) => {
  try {
    // 1. Read all table data using raw SQL (preserves integer timestamps as-is)
    const data: Record<string, unknown[]> = {}
    for (const table of TABLE_INSERT_ORDER) {
      data[table] = sqliteDb.query(`SELECT * FROM ${table}`).all()
    }

    // 2. Build manifest
    const manifest = {
      version: 1,
      appVersion: pkg.version,
      exportedAt: new Date().toISOString(),
      tables: Object.fromEntries(
        Object.entries(data).map(([t, rows]) => [t, rows.length])
      ),
    }

    // 3. Build ZIP
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(manifest, null, 2))
    zip.file('data.json', JSON.stringify(data, null, 2))

    // 4. Add badge image files
    const badgesFolder = zip.folder('badges')!
    const badgeRows = data['badges'] as Array<{ filename: string }>
    for (const badge of badgeRows) {
      const filepath = join(UPLOAD_DIR, badge.filename)
      if (existsSync(filepath)) {
        badgesFolder.file(badge.filename, readFileSync(filepath))
      }
    }

    // 5. Generate ZIP buffer
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const isoDate = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="ghctrl-backup-${isoDate}.zip"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err: any) {
    return c.json({ error: `Export failed: ${err.message}` }, 500)
  }
})

// POST /preview — return manifest metadata from a ZIP without restoring
router.post('/preview', async (c) => {
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Invalid multipart request' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'No file provided' }, 400)

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    return c.json({ error: 'Could not parse ZIP file' }, 400)
  }

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) return c.json({ error: 'Missing manifest.json in backup' }, 400)

  try {
    const manifest = JSON.parse(await manifestFile.async('string'))
    return c.json(manifest)
  } catch {
    return c.json({ error: 'Invalid manifest.json' }, 400)
  }
})

// POST /import — restore from a ZIP backup
router.post('/import', async (c) => {
  // 1. Parse multipart form
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Invalid multipart request' }, 400)
  }

  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'No file provided' }, 400)

  // 2. Parse ZIP
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    return c.json({ error: 'Could not parse ZIP file' }, 400)
  }

  // 3. Validate manifest
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) return c.json({ error: 'Missing manifest.json in backup' }, 400)

  let manifest: any
  try {
    manifest = JSON.parse(await manifestFile.async('string'))
  } catch {
    return c.json({ error: 'Invalid manifest.json' }, 400)
  }

  if (typeof manifest.version !== 'number' || manifest.version < 1) {
    return c.json({ error: `Unsupported backup version: ${manifest.version}` }, 400)
  }

  // 4. Parse data
  const dataFile = zip.file('data.json')
  if (!dataFile) return c.json({ error: 'Missing data.json in backup' }, 400)

  let data: Record<string, unknown[]>
  try {
    data = JSON.parse(await dataFile.async('string'))
  } catch {
    return c.json({ error: 'Invalid data.json' }, 400)
  }

  // 5. Restore DB in a single transaction
  try {
    const restore = sqliteDb.transaction(() => {
      // Disable FK constraints so we can delete/insert in bulk without ordering issues
      sqliteDb.exec('PRAGMA foreign_keys = OFF')

      // Delete all tables (reverse order is a safety net; FK is OFF anyway)
      for (const table of TABLE_DELETE_ORDER) {
        sqliteDb.exec(`DELETE FROM ${table}`)
      }

      // Re-insert each table using parameterized bulk inserts
      for (const table of TABLE_INSERT_ORDER) {
        const rows = data[table] ?? []
        if (rows.length === 0) continue

        const columns = Object.keys(rows[0] as object)
        const placeholders = columns.map(() => '?').join(', ')
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        const stmt = sqliteDb.prepare(sql)

        for (const row of rows) {
          const values = columns.map((col) => {
            const v = (row as Record<string, unknown>)[col]
            // JSON serializes undefined as null; pass null-ish as null
            return v === undefined ? null : v
          })
          stmt.run(...values)
        }
      }

      sqliteDb.exec('PRAGMA foreign_keys = ON')
    })

    restore()
  } catch (err: any) {
    // Ensure FK constraints are re-enabled even on error
    try { sqliteDb.exec('PRAGMA foreign_keys = ON') } catch {}
    return c.json({ error: `Restore failed: ${err.message}` }, 400)
  }

  // 6. Restore badge image files (outside transaction — best effort)
  const badgeFileErrors: string[] = []
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true })
  }

  const badgesInZip = Object.keys(zip.files)
    .filter((p) => p.startsWith('badges/') && !p.endsWith('/'))

  for (const zipPath of badgesInZip) {
    const filename = zipPath.slice('badges/'.length)
    try {
      const fileBuffer = await zip.files[zipPath].async('nodebuffer')
      writeFileSync(join(UPLOAD_DIR, filename), fileBuffer)
    } catch (err: any) {
      badgeFileErrors.push(`${filename}: ${err.message}`)
    }
  }

  // Build stats from restored data
  const stats = Object.fromEntries(
    TABLE_INSERT_ORDER.map((t) => [t, (data[t] ?? []).length])
  )

  return c.json({
    success: true,
    stats,
    ...(badgeFileErrors.length > 0 ? { badgeFileErrors } : {}),
  })
})

export default router
