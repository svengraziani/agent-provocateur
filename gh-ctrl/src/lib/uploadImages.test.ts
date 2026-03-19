import { describe, it, expect } from 'bun:test'
import { uploadImages, type GhRunner } from './uploadImages'

function createMockFile(name: string, content = 'fake-image-data'): File {
  return new File([content], name, { type: 'image/png' })
}

describe('uploadImages', () => {
  it('creates release if it does not exist, uploads file, returns download URL', async () => {
    const calls: string[][] = []
    const runner: GhRunner = (args) => {
      calls.push(args)
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 1, stdout: '', stderr: 'release not found' }
      }
      if (key.includes('release create')) {
        return { exitCode: 0, stdout: 'https://github.com/owner/repo/releases/tag/image-assets', stderr: '' }
      }
      if (key.includes('release upload')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: `unexpected: ${key}` }
    }

    const files = [createMockFile('screenshot.png')]
    const urls = await uploadImages(files, 'owner/repo', runner)

    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatch(/^https:\/\/github\.com\/owner\/repo\/releases\/download\/image-assets\//)
    expect(urls[0]).toMatch(/\.png$/)

    const viewCall = calls.find(c => c.includes('release') && c.includes('view'))
    expect(viewCall).toBeDefined()
    expect(viewCall).toContain('--repo')
    expect(viewCall).toContain('owner/repo')

    const createCall = calls.find(c => c.includes('release') && c.includes('create'))
    expect(createCall).toBeDefined()

    const uploadCall = calls.find(c => c.includes('release') && c.includes('upload'))
    expect(uploadCall).toBeDefined()
    expect(uploadCall).toContain('image-assets')
    expect(uploadCall).toContain('--repo')
    expect(uploadCall).toContain('owner/repo')
  })

  it('skips release creation if release already exists', async () => {
    const calls: string[][] = []
    const runner: GhRunner = (args) => {
      calls.push(args)
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 0, stdout: 'image-assets', stderr: '' }
      }
      if (key.includes('release upload')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: `unexpected: ${key}` }
    }

    const files = [createMockFile('photo.jpg')]
    const urls = await uploadImages(files, 'owner/repo', runner)

    expect(urls).toHaveLength(1)
    const createCall = calls.find(c => c.includes('release') && c.includes('create'))
    expect(createCall).toBeUndefined()
  })

  it('throws if release creation fails', async () => {
    const runner: GhRunner = (args) => {
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 1, stdout: '', stderr: 'not found' }
      }
      if (key.includes('release create')) {
        return { exitCode: 1, stdout: '', stderr: 'permission denied' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    }

    const files = [createMockFile('img.png')]
    await expect(uploadImages(files, 'owner/repo', runner)).rejects.toThrow('Failed to create image-assets release')
  })

  it('throws if file upload fails', async () => {
    const runner: GhRunner = (args) => {
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      if (key.includes('release upload')) {
        return { exitCode: 1, stdout: '', stderr: 'upload error' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    }

    const files = [createMockFile('fail.png')]
    await expect(uploadImages(files, 'owner/repo', runner)).rejects.toThrow('Upload failed')
  })

  it('uploads multiple files and returns all URLs', async () => {
    const runner: GhRunner = (args) => {
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      if (key.includes('release upload')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    }

    const files = [createMockFile('a.png'), createMockFile('b.jpg'), createMockFile('c.gif')]
    const urls = await uploadImages(files, 'owner/repo', runner)

    expect(urls).toHaveLength(3)
    for (const url of urls) {
      expect(url).toStartWith('https://github.com/owner/repo/releases/download/image-assets/')
    }
  })

  it('generates unique filenames to avoid collisions', async () => {
    const uploadedNames: string[] = []
    const runner: GhRunner = (args) => {
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      if (key.includes('release upload')) {
        const fileArg = args.find(a => a.includes('/'))
        if (fileArg) uploadedNames.push(fileArg.split('/').pop()!)
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    }

    const files = [createMockFile('same.png'), createMockFile('same.png')]
    await uploadImages(files, 'owner/repo', runner)

    expect(uploadedNames).toHaveLength(2)
    expect(uploadedNames[0]).not.toBe(uploadedNames[1])
  })

  it('cleans up temp files after upload', async () => {
    const { existsSync } = await import('fs')
    const uploadedPaths: string[] = []
    const runner: GhRunner = (args) => {
      const key = args.join(' ')
      if (key.includes('release view')) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      if (key.includes('release upload')) {
        const fileArg = args.find(a => a.startsWith('/'))
        if (fileArg) uploadedPaths.push(fileArg)
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    }

    const files = [createMockFile('cleanup.png')]
    await uploadImages(files, 'owner/repo', runner)

    expect(uploadedPaths).toHaveLength(1)
    await new Promise(r => setTimeout(r, 50))
    expect(existsSync(uploadedPaths[0])).toBe(false)
  })
})
