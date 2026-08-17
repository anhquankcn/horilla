import { useState, useEffect, useCallback, useRef } from 'react'

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

const HNH_OFFICE = { lat: 10.77262, lng: 106.69681, radius: 200 }

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
  const watchIdRef = useRef<number | null>(null)
  const hasFixRef = useRef(false)

  const clearWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    hasFixRef.current = false
    if (!navigator.geolocation) {
      setError('GPS không được hỗ trợ')
      setLoading(false)
      return
    }
    clearWatch()
    // watchPosition (thay cho getCurrentPosition một-phát): trong nhà/văn phòng
    // GPS vệ tinh yếu, fix ĐẦU thường thô/kém chính xác → định vị cải thiện DẦN
    // khi WiFi-positioning hội tụ. watch nhận từng fix tốt lên và TỰ cập nhật UI
    // (không cần NV bấm "Thử lại" nhiều lần chờ vài phút). Giữ fix CHÍNH XÁC NHẤT
    // để không nhảy lùi ra "ngoài VP" khi có 1 mẫu kém xen giữa.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const next: Position = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }
        setPosition((prev) => {
          if (!prev) return next
          if (next.accuracy <= prev.accuracy) return next   // fix mới chính xác hơn
          return prev.accuracy > 80 ? next : prev           // fix cũ đã tốt → giữ
        })
        hasFixRef.current = true
        setLoading(false)
        setError(null)
      },
      (e) => {
        const msgs: Record<number, string> = {
          1: 'Chưa cấp quyền GPS',
          2: 'GPS không khả dụng',
          3: 'Hết thời gian chờ GPS',
        }
        // watch có thể phát lỗi lẻ tẻ giữa chừng — chỉ báo lỗi khi CHƯA có fix nào.
        if (!hasFixRef.current) {
          setError(msgs[e.code] ?? 'Lỗi GPS')
          setLoading(false)
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    )
  }, [])

  useEffect(() => {
    refresh()
    return clearWatch
  }, [refresh])

  const distance = position
    ? haversine(position.lat, position.lng, fence.lat, fence.lng)
    : null
  const inside = distance != null ? distance <= fence.radius : null

  return { position, loading, error, distance, inside, refresh }
}
