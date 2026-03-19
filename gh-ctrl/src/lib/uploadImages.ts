import { tmpdir } from 'os'
import { join, basename } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'

export type GhRunner = (args: string[]) => { exitCode: number; stdout: string; stderr: string }

function defaultGhRunner(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  }
}

function ensureImageRelease(fullName: string, gh: GhRunner): void {
  const check = gh(['release', 'view', 'image-assets', '--repo', fullName])
  if (check.exitCode === 0) return

  const create = gh([
    'release', 'create', 'image-assets',
    '--repo', fullName,
    '--title', 'Image Assets',
    '--notes', 'Auto-created storage for uploaded images',
    '--latest=false',
  ])
  if (create.exitCode !== 0) {
    throw new Error(`Failed to create image-assets release: ${create.stderr}`)
  }
}

export async function uploadImages(
  files: File[],
  fullName: string,
  gh: GhRunner = defaultGhRunner,
): Promise<string[]> {
  const urls: string[] = []

  ensureImageRelease(fullName, gh)

  for (const file of files) {
    const ext = file.name.split('.').pop() || 'bin'
    const assetName = `${randomBytes(8).toString('hex')}.${ext}`
    const tmpPath = join(tmpdir(), assetName)

    try {
      const buf = Buffer.from(await file.arrayBuffer())
      await writeFile(tmpPath, buf)

      const upload = gh([
        'release', 'upload', 'image-assets', tmpPath,
        '--repo', fullName, '--clobber',
      ])

      if (upload.exitCode !== 0) {
        throw new Error(`Upload failed for ${file.name}: ${upload.stderr}`)
      }

      const downloadUrl = `https://github.com/${fullName}/releases/download/image-assets/${assetName}`
      urls.push(downloadUrl)
    } finally {
      unlink(tmpPath).catch(() => {})
    }
  }

  return urls
}
