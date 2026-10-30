import { useEffect, useState } from 'react'

/** How long each wordmark face stays on screen, in milliseconds. */
const SWAP_INTERVAL = 4000

/**
 * The club wordmark. BAC is also 2·1·3 — the alphabet positions of B, A and C —
 * so the wordmark alternates between the letters and those numbers on a slow
 * timer, with a soft fade each time.
 *
 * The swap is skipped when the visitor prefers reduced motion.
 */
export default function BrandWordmark() {
  const [showNumbers, setShowNumbers] = useState(false)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setShowNumbers((current) => !current), SWAP_INTERVAL)
    return () => window.clearInterval(timer)
  }, [])

  return <strong className="brand-wordmark" aria-label="BAC" title="BAC · 2 1 3">
    <span key={showNumbers ? 'numbers' : 'letters'} className="brand-wordmark-text" aria-hidden="true">{showNumbers ? '213' : 'BAC'}</span>
    <span className="brand-dot" aria-hidden="true">.</span>
  </strong>
}
