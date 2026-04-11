import { Hono } from 'hono'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../../package.json'

const router = new Hono()

interface VersionCheckResult {
  current: string
  latest: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  releaseName: string | null
}

interface CacheEntry {
  data: VersionCheckResult
  timestamp: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour server-side cache
const GITHUB_REPO = 'svengraziani/vibe-and-conquer'
let releaseCache: CacheEntry | null = null

function semverGt(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)
  const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a)
  const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b)
  if (aMajor !== bMajor) return aMajor > bMajor
  if (aMinor !== bMinor) return aMinor > bMinor
  return aPatch > bPatch
}

// GET / — current version (moved here from index.ts)
router.get('/', (c) => c.json({ version: pkg.version }))

// GET /check — compare installed version with latest GitHub release
router.get('/check', async (c) => {
  const current = pkg.version

  if (releaseCache && Date.now() - releaseCache.timestamp < CACHE_TTL_MS) {
    return c.json(releaseCache.data)
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'vibe-and-conquer-app',
        },
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!res.ok) {
      return c.json({
        current,
        latest: null,
        updateAvailable: false,
        releaseUrl: null,
        releaseName: null,
      })
    }

    const release = (await res.json()) as {
      tag_name: string
      html_url: string
      name: string
    }

    const latestClean = release.tag_name.replace(/^v/, '')
    const updateAvailable = semverGt(latestClean, current)

    const result: VersionCheckResult = {
      current,
      latest: release.tag_name,
      updateAvailable,
      releaseUrl: release.html_url,
      releaseName: release.name || release.tag_name,
    }

    releaseCache = { data: result, timestamp: Date.now() }
    return c.json(result)
  } catch {
    return c.json({
      current,
      latest: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseName: null,
    })
  }
})

// POST /update — run scripts/update.sh and return full output
// In Docker deployments, the script is available via the /workspace bind mount.
// Requires: /var/run/docker.sock and . (project root) mounted in compose.yml.
router.post('/update', async (c) => {
  // Prefer the host-mounted path (/workspace) so the script can run
  // docker compose commands with the correct project context.
  const inContainerPath = '/workspace/gh-ctrl/scripts/update.sh'
  const localPath = join(process.cwd(), 'scripts', 'update.sh')
  const scriptPath = existsSync(inContainerPath) ? inContainerPath : localPath

  const workDir = existsSync('/workspace/compose.yml') ? '/workspace' : process.cwd()

  try {
    const proc = Bun.spawn(['bash', scriptPath], {
      cwd: workDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    const output = [stdout, stderr].filter(Boolean).join('\n').trim()

    return c.json({ success: exitCode === 0, output, exitCode })
  } catch (err) {
    return c.json(
      {
        success: false,
        output: err instanceof Error ? err.message : String(err),
        exitCode: -1,
      },
      500
    )
  }
})

export default router
