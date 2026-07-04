import { useState, useMemo, useEffect, useCallback, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// Màn Lịch HRM tổng hợp (Giai đoạn 1): nghỉ phép duyệt + ngày lễ + sự kiện.
// Lớp sự kiện Outlook (Microsoft Graph) sẽ phủ lên đây ở giai đoạn 2 (sau khi IT
// cấp quyền Calendars.Read trên Azure).

interface CalEvent {
  id: string
  kind: 'leave' | 'holiday' | 'announcement' | 'outlook'
  title: string
  start: string   // YYYY-MM-DD
  end: string     // YYYY-MM-DD (inclusive)
  description?: string
  source: string
  start_time?: string | null
  end_time?: string | null
}

const KIND_COLOR: Record<string, string> = {
  leave: HNH.success, holiday: HNH.red, announcement: HNH.gold, outlook: HNH.navy,
}
const KIND_LABEL: Record<string, string> = {
  leave: 'Nghỉ phép', holiday: 'Ngày lễ', announcement: 'Sự kiện', outlook: 'Outlook (họp)',
}
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// YYYY-MM-DD theo giờ ĐỊA PHƯƠNG (tránh lệch ngày do UTC).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarViewPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() }) // m: 0-11
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selDay, setSelDay] = useState<string | null>(null)
  const [outlook, setOutlook] = useState<{ configured: boolean; connected: boolean }>({ configured: false, connected: false })

  // Lưới 6 tuần bắt đầu từ Thứ 2 của tuần chứa ngày 1.
  const grid = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1)
    const dow = (first.getDay() + 6) % 7 // 0=T2
    const start = new Date(ym.y, ym.m, 1 - dow)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [ym])

  const load = useCallback(async () => {
    setLoading(true)
    const from = ymd(grid[0]); const to = ymd(grid[41])
    try {
      const r = await api.get<{ events: CalEvent[] }>(`/api/calendar/events/?from=${from}&to=${to}`)
      let all = r.events ?? []
      // Lớp Outlook (nếu đã kết nối) — gộp vào cùng lưới.
      try {
        const o = await fetch(`/bff/api/calendar/outlook?from=${from}&to=${to}`, { credentials: 'include' })
        if (o.ok) {
          const od = await o.json() as { connected?: boolean; events?: CalEvent[] }
          setOutlook(s => ({ ...s, connected: !!od.connected }))
          if (od.events?.length) all = [...all, ...od.events]
        }
      } catch { /* Outlook lỗi không chặn lịch HRM */ }
      setEvents(all)
    } catch { setEvents([]) } finally { setLoading(false) }
  }, [grid])

  // Trạng thái kết nối Outlook + thông báo sau khi quay lại từ consent.
  useEffect(() => {
    fetch('/bff/outlook/status', { credentials: 'include' })
      .then(r => r.json()).then((s) => setOutlook({ configured: !!s.configured, connected: !!s.connected }))
      .catch(() => {})
    const q = new URLSearchParams(window.location.search).get('outlook')
    if (q === 'connected' || q === 'error') {
      window.history.replaceState({}, '', '/calendar')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const disconnectOutlook = async () => {
    try { await fetch('/bff/outlook/disconnect', { method: 'POST', credentials: 'include' }) } catch { /* noop */ }
    setOutlook(s => ({ ...s, connected: false }))
    load()
  }

  // map ngày -> sự kiện (mọi ngày trong khoảng start..end)
  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {}
    for (const e of events) {
      const s = new Date(e.start + 'T00:00:00'); const en = new Date(e.end + 'T00:00:00')
      for (const d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) {
        const k = ymd(d); (m[k] ??= []).push(e)
      }
    }
    return m
  }, [events])

  const shift = (delta: number) => {
    const m = ym.m + delta
    setYm({ y: ym.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 })
    setSelDay(null)
  }

  const todayStr = ymd(now)
  const selEvents = selDay ? (byDay[selDay] ?? []) : []

  return (
    <div style={{ minHeight: '100dvh', background: HNH.cream }}>
      <TopBar title="Lịch" />
      <div style={{ padding: '12px 14px', maxWidth: 620, margin: '0 auto' }}>

        {/* Điều hướng tháng */}
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <button onClick={() => shift(-1)} style={navBtn}><Icon name="chev-l" size={18} color={HNH.ink2} /></button>
          <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>Tháng {ym.m + 1} / {ym.y}</div>
          <button onClick={() => shift(1)} style={navBtn}><Icon name="chev-r" size={18} color={HNH.ink2} /></button>
        </div>

        {/* Lưới lịch */}
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {DOW.map((d, i) => (
              <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 700, color: i >= 5 ? HNH.red : HNH.ink3, background: HNH.cream2 }}>{d}</div>
            ))}
            {grid.map((d, i) => {
              const k = ymd(d)
              const inMonth = d.getMonth() === ym.m
              const isToday = k === todayStr
              const evs = byDay[k] ?? []
              return (
                <button key={i} onClick={() => setSelDay(k)} style={{
                  minHeight: 62, border: 'none', borderTop: `1px solid ${HNH.line}`,
                  borderRight: (i % 7 !== 6) ? `1px solid ${HNH.line}` : 'none',
                  background: selDay === k ? HNH.cream2 : '#fff', cursor: 'pointer',
                  padding: '4px 3px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  opacity: inMonth ? 1 : 0.38,
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: isToday ? 800 : 600,
                    color: isToday ? '#fff' : HNH.ink,
                    background: isToday ? HNH.red : 'transparent',
                    width: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{d.getDate()}</span>
                  <div className="flex items-center gap-0.5" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                    {evs.slice(0, 3).map((e, j) => (
                      <span key={j} style={{ width: 5, height: 5, borderRadius: 3, background: KIND_COLOR[e.kind] ?? HNH.ink3 }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Chú thích */}
        <div className="flex items-center gap-4" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {(['leave', 'holiday', 'announcement'] as const).map(k => (
            <div key={k} className="flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 4, background: KIND_COLOR[k] }} />
              <span style={{ fontSize: 11.5, color: HNH.ink2 }}>{KIND_LABEL[k]}</span>
            </div>
          ))}
          {loading && <span style={{ fontSize: 11.5, color: HNH.ink3 }}>Đang tải…</span>}
        </div>

        {/* Kết nối Outlook (Cách B) — chỉ hiện khi máy chủ đã cấu hình */}
        {outlook.configured && (
          outlook.connected ? (
            <div className="flex items-center gap-2 w-full" style={{ marginTop: 12, background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 14, padding: '12px 14px' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: HNH.navy }} />
              <span style={{ flex: 1, fontSize: 12.5, color: HNH.ink2 }}>Đã kết nối <b>Outlook</b> — họp/sự kiện hiện màu xanh navy.</span>
              <button onClick={disconnectOutlook} style={{ border: 'none', background: 'none', color: HNH.red, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Ngắt</button>
            </div>
          ) : (
            <a href="/bff/outlook/connect" className="flex items-center gap-2 w-full" style={{ marginTop: 12, background: HNH.navy, borderRadius: 14, padding: '13px 14px', textDecoration: 'none' }}>
              <Icon name="link" size={16} color="#fff" />
              <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>Kết nối Outlook để xem lịch họp tại đây</span>
            </a>
          )
        )}

        {/* Đưa lịch HRM RA Outlook (Cách feed .ics — luôn có) */}
        <button onClick={() => navigate('/calendar-sync')} className="flex items-center gap-2 w-full border-none cursor-pointer" style={{ marginTop: 10, background: '#fff', border: `1px dashed ${HNH.line}`, borderRadius: 14, padding: '12px 14px', textAlign: 'left' }}>
          <Icon name="link" size={16} color={HNH.navy} />
          <span style={{ fontSize: 12.5, color: HNH.ink2, lineHeight: 1.4 }}>
            Muốn xem lịch HRM này TRONG Outlook? Bấm để lấy link <b>Đồng bộ lịch</b>.
          </span>
        </button>
      </div>

      {/* Chi tiết ngày */}
      {selDay && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 300, background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelDay(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 18px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, marginBottom: 10 }}>
              {new Date(selDay + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
            {selEvents.length === 0 ? (
              <div style={{ fontSize: 13, color: HNH.ink3, padding: '10px 0' }}>Không có sự kiện.</div>
            ) : selEvents.map(e => (
              <div key={e.id} className="flex items-start gap-2.5" style={{ padding: '10px 0', borderBottom: `1px solid ${HNH.line}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: KIND_COLOR[e.kind] ?? HNH.ink3, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{e.title}</div>
                  {e.start_time && (
                    <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, marginTop: 1 }}>🕐 {e.start_time}{e.end_time ? `–${e.end_time}` : ''}</div>
                  )}
                  {e.description && <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2, lineHeight: 1.4 }}>{e.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn: CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: `1px solid ${HNH.line}`,
  background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
