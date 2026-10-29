/** Light/dark interface theme, persisted per device and applied before render. */
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'bac.theme'

export function detectTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* storage unavailable */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Set the theme attribute without persisting; used before first render. */
export function initTheme(): void {
  document.documentElement.dataset.theme = detectTheme()
}

/** Apply and remember the visitor's explicit choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* storage unavailable */ }
}
