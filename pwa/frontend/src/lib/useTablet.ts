import { useState, useEffect } from 'react'

// Real tablet / desktop: wide in any orientation
const WIDE_MIN = 768
// Phone landscape: enough pixels to use side-nav layout
const LANDSCAPE_MIN = 600

function check(): boolean {
  return (
    window.matchMedia(`(min-width: ${WIDE_MIN}px)`).matches ||
    window.matchMedia(`(min-width: ${LANDSCAPE_MIN}px) and (orientation: landscape)`).matches
  )
}

export function useTablet() {
  const [isTablet, setIsTablet] = useState(check)

  useEffect(() => {
    const mqWide      = window.matchMedia(`(min-width: ${WIDE_MIN}px)`)
    const mqLandscape = window.matchMedia(`(min-width: ${LANDSCAPE_MIN}px) and (orientation: landscape)`)
    const handler = () => setIsTablet(check())
    mqWide.addEventListener('change', handler)
    mqLandscape.addEventListener('change', handler)
    setIsTablet(check())
    return () => {
      mqWide.removeEventListener('change', handler)
      mqLandscape.removeEventListener('change', handler)
    }
  }, [])

  return isTablet
}

// iPhone 15 and smaller (logical width ≤ 393px)
const SMALL_PHONE_MAX = 393

export function useSmallPhone() {
  const [isSmall, setIsSmall] = useState(() =>
    window.matchMedia(`(max-width: ${SMALL_PHONE_MAX}px)`).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SMALL_PHONE_MAX}px)`)
    const handler = () => setIsSmall(mq.matches)
    mq.addEventListener('change', handler)
    setIsSmall(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isSmall
}
