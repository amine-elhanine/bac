import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthGate from './AuthGate'
import { initTheme } from './lib/theme'
import './styles.css'
import './dark.css'
import './layout-fixes.css'

initTheme()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
)
