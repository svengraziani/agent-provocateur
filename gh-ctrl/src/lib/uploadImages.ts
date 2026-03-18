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
        '-F', `file=@${tmpPath};type=${file.type || 'application/octet-stream'}`,
        `/repos/${fullName}/uploads`,
      ], { env: { ...process.env } })

      if (proc.exitCode !== 0) {
        console.error(`Failed to upload image ${file.name}:`, proc.stderr.toString())
        continue
      }

      try {
        const data = JSON.parse(proc.stdout.toString())
        if (data.href) urls.push(data.href)
      } catch {
        console.error(`Failed to parse upload response for ${file.name}`)
      }
    } catch (err) {
      console.error(`Error processing image ${file.name}:`, err)
    } finally {
      unlink(tmpPath).catch(() => {})
    }
  }

  return urls
}
