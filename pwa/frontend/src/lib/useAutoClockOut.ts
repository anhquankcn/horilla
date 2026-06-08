import { useEffect, useRef, useCallback } from 'react'
import { api } from './api'

interface ClockoutSchedule {
  is_clocked_in: boolean
  auto_clock_out_enabled: boolean
  clock_out_at: string | null  // "HH:MM"
  geofence: { lat: number; lng: number; radius: number } | null
}

function getGPS(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }
    )
  })
}

function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useAutoClockOut() {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const triggeredRef = useRef<string | null>(null)  // YYYY-MM-DD last triggered

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const doClockOut = useCallback(async () => {
    const today = todayStr()
    if (triggeredRef.current === today) return
    triggeredRef.current = today

    const gps = await getGPS()
    try {
      await api.post('/api/attendance/clock-out/', {
        ...(gps ? { latitude: gps.latitude, longitude: gps.longitude } : {}),
        auto_clockout: true,
      })
    } catch {
      // Server middleware handles it as fallback if request fails
    }
  }, [])

  const poll = useCallback(async () => {
    if (triggeredRef.current === todayStr()) return
    try {
      const s = await api.get<ClockoutSchedule>('/api/attendance/auto-clockout-schedule/')
      if (!s.auto_clock_out_enabled || !s.is_clocked_in || !s.clock_out_at) {
        clearTimer()
        return
      }
      const [h, m] = s.clock_out_at.split(':').map(Number)
      const targetMin = h * 60 + m
      const diffMin = targetMin - nowMinutes()

      clearTimer()
      if (diffMin < -5) return          // missed by more than 5 min
      if (diffMin <= 0) { doClockOut(); return }
      if (diffMin > 8 * 60) return      // more than 8h away, wait for next poll

      timerRef.current = setTimeout(doClockOut, diffMin * 60 * 1000)
    } catch {
      // ignore network errors
    }
  }, [clearTimer, doClockOut])

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 5 * 60 * 1000)
    return () => {
      clearTimer()
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [poll, clearTimer])
}
