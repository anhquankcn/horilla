import { useState, useEffect } from 'react'

const TABLET_MIN = 640

export function useTablet() {
  const [isTablet, setIsTablet] = useState(() => window.innerWidth >= TABLET_MIN)

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${TABLET_MIN}px)`)
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches)
    mq.addEventListener('change', handler)
    setIsTablet(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isTablet
}
