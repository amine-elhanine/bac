import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'
import { Modal } from './ui'

/**
 * Camera QR scanner. @zxing/browser is imported dynamically so the large
 * decoder is only downloaded when a member actually opens the scanner.
 */
export function ScannerDialog({ busy, onClose, onToken }: { busy: boolean; onClose: () => void; onToken: (token: string) => void }) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const tokenHandler = useRef(onToken)
  const [cameraError, setCameraError] = useState('')
  useEffect(() => { tokenHandler.current = onToken }, [onToken])
  useEffect(() => {
    let mounted = true
    let controls: { stop: () => void } | null = null
    let cancelled = false
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (cancelled || !videoRef.current) return
        const reader = new BrowserQRCodeReader()
        const started = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && mounted) { controls?.stop(); tokenHandler.current(result.getText()) }
        })
        controls = started
        if (!mounted) started.stop()
      } catch (cause) {
        if (mounted && !cancelled) setCameraError(cameraStartError(cause))
      }
    })()
    return () => { mounted = false; cancelled = true; controls?.stop() }
  }, [])
  return <Modal title={t('Scan the gathering QR')} subtitle={t('Point your camera at the live code displayed by HR.')} onClose={onClose}><div className="scanner-frame"><video ref={videoRef} muted playsInline /><div className="scanner-reticle" /></div>{cameraError && <div className="auth-error" role="alert">{cameraError}</div>}{busy && <div className="live-loading">{t('Confirming your check-in…')}</div>}<div className="scanner-help"><ShieldCheck size={15} /> {t('The current code expires quickly and can only record your attendance once.')}</div></Modal>
}

function cameraStartError(cause: unknown): string {
  const name = typeof cause === 'object' && cause !== null && 'name' in cause && typeof cause.name === 'string' ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera access was denied. Allow camera access for this site in your browser settings, close this window, then tap Scan again.'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera was found on this device. Ask HR to record your attendance manually.'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera is busy or unavailable. Close other apps using it, close this window, then tap Scan again.'
  if (name === 'SecurityError' || (typeof window !== 'undefined' && !window.isSecureContext)) return 'Camera scanning requires a secure HTTPS connection. Open the club app using its HTTPS address.'
  return 'Camera could not be started. Check browser permission and connection, close this window, then tap Scan again or ask HR to record your attendance manually.'
}
