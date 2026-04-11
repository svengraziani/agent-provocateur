import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

interface VersionCheckState {
  current: string | null
  latest: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  releaseName: string | null
}

interface CachedCheck {
  data: VersionCheckState
  timestamp: number
}

const CACHE_KEY = 'versionCheck'
const DISMISSED_KEY = 'versionCheckDismissed'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

export function useVersionCheck() {
  const [state, setState] = useState<VersionCheckState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const dismissedVersion = localStorage.getItem(DISMISSED_KEY)

    // Use cached result if still fresh
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached: CachedCheck = JSON.parse(raw)
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
          setState(cached.data)
          if (dismissedVersion && dismissedVersion === cached.data.latest) {
            setDismissed(true)
          }
          return
        }
      }
    } catch {
      // ignore corrupt cache
    }

    // Fetch fresh from backend
    let cancelled = false
    api
      .checkVersion()
      .then((result) => {
        if (cancelled) return
        const checkState: VersionCheckState = {
          current: result.current,
          latest: result.latest,
          updateAvailable: result.updateAvailable,
          releaseUrl: result.releaseUrl,
          releaseName: result.releaseName,
        }
        setState(checkState)
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ data: checkState, timestamp: Date.now() })
        )
        if (dismissedVersion && dismissedVersion === result.latest) {
          setDismissed(true)
        }
      })
      .catch(() => {
        // silently fail — version check is non-critical
      })

    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = useCallback(() => {
    setState((prev) => {
      if (prev?.latest) {
        localStorage.setItem(DISMISSED_KEY, prev.latest)
      }
      return prev
    })
    setDismissed(true)
  }, [])

  return {
    current: state?.current ?? null,
    latest: state?.latest ?? null,
    releaseName: state?.releaseName ?? null,
    releaseUrl: state?.releaseUrl ?? null,
    updateAvailable: (state?.updateAvailable && !dismissed) ?? false,
    dismiss,
  }
}
