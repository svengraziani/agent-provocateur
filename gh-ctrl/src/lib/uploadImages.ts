import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'

export async function uploadImages(files: File[], fullName: string): Promise<string[]> {
  const urls: string[] = []

  for (const file of files) {
    const ext = file.name.split('.').pop() || 'bin'
    const tmpPath = join(tmpdir(), `gh-img-${randomBytes(8).toString('hex')}.${ext}`)
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      await writeFile(tmpPath, buf)

      const proc = Bun.spawnSync([
        'gh', 'api', '-X', 'POST',
        '-F', `file=@${tmpPath}`,
        `/repos/${fullName}/uploads`,
      ], { env: { ...process.env } })

      if (proc.exitCode !== 0) {
        throw new Error(`Upload failed for ${file.name}: ${proc.stderr.toString()}`)
      }

      const data = JSON.parse(proc.stdout.toString())
      if (!data.href) throw new Error(`No URL in upload response for ${file.name}`)
      urls.push(data.href)
    } finally {
      unlink(tmpPath).catch(() => {})
    }
  }

  return urls
}
