import { useState } from 'react'
import { api } from '../api'

interface UpdateNotificationBannerProps {
  current: string | null
  latest: string | null
  releaseName: string | null
  releaseUrl: string | null
  onDismiss: () => void
}

type InstallState = 'idle' | 'running' | 'success' | 'error'

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

  const handleInstall = async () => {
    setInstallState('running')
    setInstallOutput('')
    setShowDialog(true)

    try {
      const result = await api.triggerUpdate()
      setInstallOutput(result.output)
      setInstallState(result.success ? 'success' : 'error')
    } catch (err) {
      setInstallOutput(err instanceof Error ? err.message : 'Update failed')
      setInstallState('error')
    }
  }

  const handleCloseDialog = () => {
    if (installState === 'running') return
    setShowDialog(false)
  }

  const displayVersion = releaseName ?? latest

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
          <div className="modal update-install-modal">
            <div className="modal-title">
              {installState === 'running' && (
                <>
                  <span className="spinning-process">&#x2699;</span> Running Update…
                </>
              )}
              {installState === 'success' && <>&#x2713; Update Complete</>}
              {installState === 'error' && <>&#x2717; Update Failed</>}
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
            {installState === 'error' && (
              <div className="update-install-notice update-install-notice--error">
                Update failed. Check the output above.<br />
                Ensure <code>/var/run/docker.sock</code> and the project root
                (<code>.:/workspace</code>) are mounted in <code>compose.yml</code>,
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
