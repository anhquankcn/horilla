// Tích hợp lịch Outlook (Cách B — OAuth riêng, token giữ ở session BFF).
// FE fetch qua BFF: trạng thái + sự kiện; Django không đọc được Outlook nên
// merge ở phía FE (giống CalendarView).
import { useCallback, useEffect, useMemo, useState } from 'react'

export interface OutlookEvent {
  id: string
  kind: 'outlook'
  title: string
  start: string          // YYYY-MM-DD
  end: string
  all_day: boolean
  description: string    // location
  source: 'outlook'
  start_time: string | null   // HH:MM
  end_time: string | null
}

export interface OutlookStatus { configured: boolean; connected: boolean }

export async function fetchOutlookStatus(): Promise<OutlookStatus> {
  try {
    const r = await fetch('/bff/outlook/status', { credentials: 'include' })
    if (!r.ok) return { configured: false, connected: false }
    return await r.json()
  } catch {
    return { configured: false, connected: false }
  }
}

export async function fetchOutlookEvents(
  from: string, to: string,
): Promise<{ connected: boolean; events: OutlookEvent[] }> {
  try {
    const r = await fetch(`/bff/api/calendar/outlook?from=${from}&to=${to}`, { credentials: 'include' })
    if (!r.ok) return { connected: false, events: [] }
    const d = await r.json()
    return { connected: !!d.connected, events: Array.isArray(d.events) ? d.events : [] }
  } catch {
    return { connected: false, events: [] }
  }
}

// Gom sự kiện theo ngày (YYYY-MM-DD) — dùng cho lưới/thẻ ngày.
export function groupOutlookByDate(events: OutlookEvent[]): Record<string, OutlookEvent[]> {
  const m: Record<string, OutlookEvent[]> = {}
  for (const e of events) {
    const d = e.start || ''
    if (!d) continue
    ;(m[d] ??= []).push(e)
  }
  for (const d of Object.keys(m)) {
    m[d].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  }
  return m
}

/**
 * Hook: tự tải trạng thái + sự kiện Outlook cho khoảng [from, to] khi mở.
 * - status.configured=false → server chưa bật Outlook (ẩn nút).
 * - status.connected=false → user chưa kết nối (hiện nút Kết nối).
 * - refetch(): kéo lại thủ công (nút "Đồng bộ").
 */
export function useOutlookEvents(from: string | null, to: string | null) {
  const [status, setStatus] = useState<OutlookStatus>({ configured: false, connected: false })
  const [events, setEvents] = useState<OutlookEvent[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const st = await fetchOutlookStatus()
    setStatus(st)
    if (!st.configured || !st.connected || !from || !to) {
      setEvents([])
      return
    }
    setLoading(true)
    const { events } = await fetchOutlookEvents(from, to)
    setEvents(events)
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  const byDate = useMemo(() => groupOutlookByDate(events), [events])
  return { status, events, byDate, loading, refetch: load }
}
