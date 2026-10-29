import { useEffect, useState } from 'react'
import { BookOpen, Check, Download, X } from 'lucide-react'
import { getPwaInstallState, promptPwaInstall, subscribePwaInstall, type PwaInstallState } from './lib/pwaInstall'

export default function InstallGuideDialog({ onClose }: { onClose: () => void }) {
  const [installState, setInstallState] = useState<PwaInstallState>(getPwaInstallState)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')

  useEffect(() => subscribePwaInstall(() => setInstallState(getPwaInstallState())), [])

  async function install() {
    setInstalling(true)
    setInstallError('')
    try { await promptPwaInstall() }
    catch { setInstallError('The install prompt could not be opened. Use your browser menu to install BAC instead.') }
    finally { setInstalling(false) }
  }

  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="install-dialog live-modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><button className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button><div className="dialog-mark"><BookOpen size={22} /></div><div className="eyebrow">TAKE BAC WITH YOU</div><h2 id="install-title">Install the club app</h2><p>Use BAC from your home screen on phones and computers. The installable web app is free and does not require an app store.</p>{installState.available && <button type="button" className="button button-primary button-wide" onClick={() => void install()} disabled={installing}>{installing ? 'Opening install prompt…' : <><Download size={15} /> Install BAC</>}</button>}{installError && <div className="auth-error" role="alert">{installError}</div>}{installState.installed && <p className="auth-recovery-success" role="status">BAC is installed on this device.</p>}<div className="install-steps"><div><span>01</span><p><strong>Open the BAC HTTPS link in a browser</strong><small>Use Safari on iPhone or iPad, Chrome on Android, or Edge on Windows.</small></p></div><div><span>02</span><p><strong>Add BAC to your device</strong><small>iPhone/iPad: Share → Add to Home Screen. Android: Chrome menu → Install app or Add to Home screen. Windows: Edge’s install icon or menu → Install this site as an app.</small></p></div><div><span>03</span><p><strong>Sign in with your club account</strong><small>HR or the club leadership team must activate your member account first.</small></p></div></div><button className="button button-outline button-wide" onClick={onClose}>{installState.available ? 'Maybe later' : 'Got it'} <Check size={15} /></button><small className="dialog-footnote">Installation requires the deployed BAC site to use HTTPS. iOS installation is through Safari, not the App Store.</small></section></div>
}
