import { useState, useEffect } from 'react'

export function useLiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return { now, time: `${hh}:${mm}:${ss}`, hhmm: `${hh}:${mm}` }
}
