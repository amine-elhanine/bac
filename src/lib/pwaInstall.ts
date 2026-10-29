type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

export type PwaInstallState = { available: boolean; installed: boolean }

let deferredPrompt: DeferredInstallPrompt | null = null
let installed = typeof window !== 'undefined' && (
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
)
const listeners = new Set<() => void>()

function publish() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault()
    deferredPrompt = event as DeferredInstallPrompt
    publish()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    publish()
  })
}

export function getPwaInstallState(): PwaInstallState {
  return { available: deferredPrompt !== null, installed }
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function promptPwaInstall(): Promise<InstallChoice['outcome'] | null> {
  if (!deferredPrompt) return null
  const prompt = deferredPrompt
  deferredPrompt = null
  publish()
  await prompt.prompt()
  const choice = await prompt.userChoice
  if (choice.outcome === 'accepted') installed = true
  publish()
  return choice.outcome
}
