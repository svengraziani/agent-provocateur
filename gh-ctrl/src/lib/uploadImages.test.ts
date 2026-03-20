import { describe, it, expect } from 'bun:test'
import { uploadImages, type GhRunner, type Fetcher } from './uploadImages'

function createMockFile(name: string, content = 'fake-image-data', type = 'image/png'): File {
  return new File([content], name, { type })
}

function makeGh(token = 'gh-token-abc'): GhRunner {
  return (args) => {
    if (args[0] === 'auth' && args[1] === 'token') {
      return { exitCode: 0, stdout: token + '\n', stderr: '' }
    }
    return { exitCode: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` }
  }
}

function makeFetcher(responseUrl: string): { fetcher: Fetcher; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ url: responseUrl }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetcher, calls }
}

describe('uploadImages', () => {
  it('gets auth token and uploads to issues/assets endpoint', async () => {
    const expectedUrl = 'https://github.com/owner/repo/assets/12345/screenshot.png'
    const { fetcher, calls } = makeFetcher(expectedUrl)
    const ghCalls: string[][] = []
    const gh: GhRunner = (args) => {
      ghCalls.push(args)
      return makeGh()(args)
    }

    const files = [createMockFile('screenshot.png')]
    const urls = await uploadImages(files, 'owner/repo', gh, fetcher)

    expect(urls).toEqual([expectedUrl])
    expect(ghCalls[0]).toEqual(['auth', 'token'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://uploads.github.com/repos/owner/repo/issues/assets')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe('Bearer gh-token-abc')
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('image/png')
  })

  it('uploads multiple files and returns all URLs in order', async () => {
    let callIndex = 0
    const responseUrls = [
      'https://github.com/owner/repo/assets/1/a.png',
      'https://github.com/owner/repo/assets/2/b.jpg',
      'https://github.com/owner/repo/assets/3/c.gif',
    ]
    const fetcher: Fetcher = async () => {
      return new Response(JSON.stringify({ url: responseUrls[callIndex++] }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const files = [
      createMockFile('a.png', 'data', 'image/png'),
      createMockFile('b.jpg', 'data', 'image/jpeg'),
      createMockFile('c.gif', 'data', 'image/gif'),
    ]
    const urls = await uploadImages(files, 'owner/repo', makeGh(), fetcher)

    expect(urls).toEqual(responseUrls)
  })

  it('throws if getting auth token fails', async () => {
    const gh: GhRunner = () => ({ exitCode: 1, stdout: '', stderr: 'not logged in' })
    const fetcher: Fetcher = async () => new Response('', { status: 201 })

    await expect(uploadImages([createMockFile('img.png')], 'owner/repo', gh, fetcher)).rejects.toThrow(
      'Failed to get GitHub token',
    )
  })

  it('throws if upload returns non-ok status', async () => {
    const fetcher: Fetcher = async () =>
      new Response('Forbidden', { status: 403 })

    await expect(uploadImages([createMockFile('img.png')], 'owner/repo', makeGh(), fetcher)).rejects.toThrow(
      'Upload failed for img.png: 403',
    )
  })

  it('sends correct Content-Type for each file', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = async (_, init) => {
      calls.push((init.headers as Record<string, string>)['Content-Type'])
      return new Response(JSON.stringify({ url: 'https://github.com/x' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await uploadImages(
      [
        createMockFile('a.png', 'x', 'image/png'),
        createMockFile('b.jpg', 'x', 'image/jpeg'),
      ],
      'owner/repo',
      makeGh(),
      fetcher,
    )

    expect(calls).toEqual(['image/png', 'image/jpeg'])
  })

  it('trims trailing newline from gh auth token output', async () => {
    const captured: string[] = []
    const fetcher: Fetcher = async (_, init) => {
      captured.push((init.headers as Record<string, string>)['Authorization'])
      return new Response(JSON.stringify({ url: 'https://github.com/x' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const gh: GhRunner = () => ({ exitCode: 0, stdout: 'my-secret-token\n', stderr: '' })
    await uploadImages([createMockFile('img.png')], 'owner/repo', gh, fetcher)

    expect(captured[0]).toBe('Bearer my-secret-token')
  })
})
