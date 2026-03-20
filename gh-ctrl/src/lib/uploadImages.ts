import { randomBytes } from 'crypto'

export type GhRunner = (args: string[]) => { exitCode: number; stdout: string; stderr: string }
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

function defaultGhRunner(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(['gh', ...args], { env: { ...process.env } })
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  }
}

export async function uploadImages(
  files: File[],
  fullName: string,
  gh: GhRunner = defaultGhRunner,
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const tokenResult = gh(['auth', 'token'])
  if (tokenResult.exitCode !== 0) {
    throw new Error(`Failed to get GitHub token: ${tokenResult.stderr}`)
  }
  const token = tokenResult.stdout.trim()

  const urls: string[] = []

  for (const file of files) {
    const buf = await file.arrayBuffer()
    const mimeType = file.type || 'application/octet-stream'

    const response = await fetcher(
      `https://uploads.github.com/repos/${fullName}/issues/assets`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mimeType,
          'Content-Length': String(buf.byteLength),
        },
        body: buf,
      },
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Upload failed for ${file.name}: ${response.status} ${text}`)
    }

    const data = (await response.json()) as { url: string }
    urls.push(data.url)
  }

  return urls
}
