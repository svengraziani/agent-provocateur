import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSound } from '../../hooks/useSound'

describe('useSound', () => {
  let playMock: ReturnType<typeof vi.fn>
  let AudioMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    playMock = vi.fn().mockResolvedValue(undefined)
    AudioMock = vi.fn().mockImplementation(() => ({
      volume: 1,
      play: playMock,
    }))
    vi.stubGlobal('Audio', AudioMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a play function', () => {
    const { result } = renderHook(() => useSound())
    expect(typeof result.current.play).toBe('function')
  })

  it('creates an Audio instance with the correct sound path', () => {
    const { result } = renderHook(() => useSound())
    result.current.play('peep')
    expect(AudioMock).toHaveBeenCalledWith('/sounds/peep.mp3')
  })

  it('sets volume to 0.5', () => {
    const mockAudio = { volume: 1, play: playMock }
    AudioMock.mockImplementation(() => mockAudio)
    const { result } = renderHook(() => useSound())
    result.current.play('hydraulic')
    expect(mockAudio.volume).toBe(0.5)
  })

  it('calls play() on the audio instance', () => {
    const { result } = renderHook(() => useSound())
    result.current.play('refreshed')
    expect(playMock).toHaveBeenCalled()
  })

  it('silently ignores autoplay policy errors', async () => {
    playMock = vi.fn().mockRejectedValue(new DOMException('Autoplay blocked'))
    AudioMock.mockImplementation(() => ({ volume: 1, play: playMock }))

    const { result } = renderHook(() => useSound())
    // Should not throw
    expect(() => result.current.play('glass_poop')).not.toThrow()
  })

  it('play is stable across re-renders (useCallback)', () => {
    const { result, rerender } = renderHook(() => useSound())
    const firstPlay = result.current.play
    rerender()
    expect(result.current.play).toBe(firstPlay)
  })
})
