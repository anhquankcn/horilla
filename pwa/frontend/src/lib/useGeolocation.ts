import { useState, useEffect, useCallback } from 'react'

interface Position {
  lat: number
  lng: number
  accuracy: number
}

export interface GeolocationState {
  position: Position | null
  loading: boolean
  error: string | null
  distance: number | null
  inside: boolean | null
  refresh: () => void
}

const HNH_OFFICE = { lat: 10.7726, lng: 106.6990, radius: 200 }

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function useGeolocation(fence = HNH_OFFICE): GeolocationState {
  const [position, setPosition] = useState<Position | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    if (!navigator.geolocation) {
      setError('GPS không được hỗ trợ')
      setLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        })
        setLoading(false)
      },
      (e) => {
        const msgs: Record<number, string> = {
          1: 'Chưa cấp quyền GPS',
          2: 'GPS không khả dụng',
          3: 'Hết thời gian chờ GPS',
        }
        setError(msgs[e.code] ?? 'Lỗi GPS')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const distance = position
    ? haversine(position.lat, position.lng, fence.lat, fence.lng)
    : null
  const inside = distance != null ? distance <= fence.radius : null

  return { position, loading, error, distance, inside, refresh }
}
