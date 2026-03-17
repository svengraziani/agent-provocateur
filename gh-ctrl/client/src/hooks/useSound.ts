import { useCallback } from 'react'

export type SoundName = 'peep' | 'hydraulic' | 'refreshed' | 'glass_poop'

export function useSound() {
  const play = useCallback((name: SoundName) => {
    try {
      const audio = new Audio(`/sounds/${name}.mp3`)
      audio.volume = 0.5
      audio.play().catch(() => { /* ignore autoplay policy errors */ })
    } catch {
      // ignore
    }
  }, [])

  return { play }
}
