import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

interface UpdateNotificationBannerProps {
  current: string | null
  latest: string | null
  releaseName: string | null
  releaseUrl: string | null
  onDismiss: () => void
}

type InstallState = 'idle' | 'running' | 'success' | 'error' | 'unknown'

export function UpdateNotificationBanner({
  current,
  latest,
  releaseName,
  releaseUrl,
  onDismiss,
}: UpdateNotificationBannerProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [installState, setInstallState] = useState<InstallState>('idle')
  const [installOutput, setInstallOutput] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Focus the dialog when it opens, restore focus on close
  useEffect(() => {
    if (showDialog && dialogRef.current) {
      dialogRef.current.focus()
    } else if (!showDialog && triggerRef.current) {
      triggerRef.current.focus()
    }
  }, [showDialog])

  const handleInstall = async () => {
    setInstallState('running')
    setInstallOutput('')
    setShowDialog(true)

    try {
      const result = await api.triggerUpdate((chunk) => {
        setInstallOutput((prev) => prev + chunk)
      })

      if (result.error && result.exitCode === -1) {
        // Check if this looks like a transport/connection error (container restarted)
        const isTransportError =
          result.error.includes('fetch') ||
          result.error.includes('network') ||
          result.error.includes('connect') ||
          result.error.includes('Could not parse')

        if (isTransportError) {
          setInstallOutput((prev) =>
            prev + '\n[Connection closed — the container may be restarting…]\n'
          )
          setInstallState('unknown')
          // Follow-up check to determine true success
          try {
            const check = await api.checkVersion()
            if (!check.updateAvailable) {
              setInstallState('success')
            } else {
              setInstallState('error')
            }
          } catch {
            setInstallState('unknown')
          }
        } else {
          setInstallOutput((prev) =>
            prev + `\n[Error: ${result.error}]\n`
          )
          setInstallState('error')
        }
      } else {
        setInstallState(result.exitCode === 0 ? 'success' : 'error')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Network/transport errors are expected when the container restarts
      const isTransportError =
        err instanceof TypeError ||
        msg.toLowerCase().includes('fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('failed to fetch') ||
        (err instanceof DOMException && err.name === 'AbortError')

      if (isTransportError) {
        setInstallOutput((prev) =>
          prev + '\n[Connection closed — the container may be restarting…]\n'
        )
        setInstallState('unknown')
        try {
          const check = await api.checkVersion()
          if (!check.updateAvailable) {
            setInstallState('success')
          } else {
            setInstallState('error')
          }
        } catch {
          setInstallState('unknown')
        }
      } else {
        setInstallOutput(msg)
        setInstallState('error')
      }
    }
  }

  const handleCloseDialog = () => {
    if (installState === 'running') return
    setShowDialog(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleCloseDialog()
  }

  const displayVersion = releaseName ?? latest
  const titleId = 'update-dialog-title'

  return (
    <>
      <div className="update-banner" role="alert" aria-live="polite">
        <span className="update-banner-dot" />
        <span className="update-banner-text">
          <strong>{displayVersion}</strong> is available
          {current && (
            <span className="update-banner-current"> — current: v{current}</span>
          )}
        </span>
        <div className="update-banner-actions">
          {releaseUrl && (
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="update-banner-link"
            >
              RELEASE NOTES
            </a>
          )}
          <button
            ref={triggerRef}
            className={`hud-btn update-banner-install-btn${installState === 'running' ? ' active' : ''}`}
            onClick={handleInstall}
            disabled={installState === 'running'}
            title="Run update script on the server (Docker Compose rebuild + restart)"
          >
            {installState === 'running' ? (
              <>
                <span className="spinning-process">&#x2699;</span> UPDATING…
              </>
            ) : (
              <>&#x2B06; INSTALL UPDATE</>
            )}
          </button>
          <button
            className="hud-btn hud-btn-icon update-banner-dismiss"
            onClick={onDismiss}
            title={`Dismiss — won't show again for ${latest}`}
            aria-label="Dismiss update notification"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {showDialog && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && handleCloseDialog()}
        >
          <div
            ref={dialogRef}
            className="modal update-install-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            <div id={titleId} className="modal-title">
              {installState === 'running' && (
                <>
                  <span className="spinning-process">&#x2699;</span> Running Update…
                </>
              )}
              {installState === 'success' && <>&#x2713; Update Complete</>}
              {installState === 'error' && <>&#x2717; Update Failed</>}
              {installState === 'unknown' && <>&#x3F; Update Status Unknown</>}
              {installState === 'idle' && <>Install Update</>}
            </div>

            <pre className="update-install-output">
              {installOutput || 'Starting update script…'}
            </pre>

            {installState === 'success' && (
              <div className="update-install-notice">
                Docker Compose is rebuilding and restarting the container.
                This page will reload automatically once the new version is live —
                or refresh manually after a few seconds.
              </div>
            )}
            {installState === 'unknown' && (
              <div className="update-install-notice">
                The connection was interrupted — this is expected when the container
                restarts during an update. Check the version indicator to confirm
                the new version is running, or refresh the page.
              </div>
            )}
            {installState === 'error' && (
              <div className="update-install-notice update-install-notice--error">
                Update failed. Check the output above.<br />
                Ensure <code>/var/run/docker.sock</code> and the project root
                (<code>.:/workspace</code>) are mounted via <code>compose.update.yml</code>,
                then run <code>gh-ctrl/scripts/update.sh</code> manually on the host.
              </div>
            )}

            <div className="modal-actions">
              <button
                className="hud-btn"
                onClick={handleCloseDialog}
                disabled={installState === 'running'}
              >
                {installState === 'running' ? 'PLEASE WAIT…' : 'CLOSE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
