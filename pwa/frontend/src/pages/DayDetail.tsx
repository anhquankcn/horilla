import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'
import { useOutlookEvents, type OutlookEvent } from '../lib/outlook'
import { flattenPunches, type ActivityResp } from '../components/AttendanceActivityDetail'
import { PunchSourceBadge } from '../components/PunchSourceBadge'

type Punch = ReturnType<typeof flattenPunches>[number]

interface DayItem {
  id: number
  title: string
  type: 'meeting' | 'task'
  status: string
  priority: string
  hour: number | null
  start?: string
  end?: string
  meet_url?: string
  url: string
}

interface HourSlot {
  hour: number
  label: string
  items: DayItem[]
}

interface DayDetailData {
  date: string
  day: number
  weekday_vi: string
  tasks: DayItem[]
  hours: HourSlot[]
}

const STATUS_VI: Record<string, string> = {
  to_do: 'Cần làm', in_progress: 'Đang làm', done: 'Hoàn thành', blocked: 'Bị chặn', meeting: 'Cuộc họp',
}
const PRIORITY_COLOR: Record<string, string> = {
  urgent: HNH.red, high: '#ea580c', normal: HNH.navy, low: HNH.ink3,
}

const BUSINESS_HOURS = new Set([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])

function HourRow({ slot, outlook, punches, onItemClick }: {
  slot: HourSlot
  outlook: OutlookEvent[]
  punches: Punch[]
  onItemClick: (item: DayItem) => void
}) {
  const isBusiness = BUSINESS_HOURS.has(slot.hour)
  const hasPunch = punches.length > 0
  const hasContent = slot.items.length > 0 || outlook.length > 0 || hasPunch

  // Màu dòng: ưu tiên chấm công (xanh) → họp (đỏ nhạt) → giờ hành chính.
  const rowBg = hasPunch ? '#f0fdf4' : slot.items.length > 0 ? '#fff5f5' : isBusiness ? '#fff' : '#fafafa'
  const labelColor = hasPunch ? HNH.success : slot.items.length > 0 ? HNH.red : isBusiness ? HNH.ink3 : HNH.ink4

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: `1px solid ${HNH.line}`,
        minHeight: hasContent ? undefined : isBusiness ? 36 : 24,
        background: rowBg,
      }}
    >
      {/* Hour label */}
      <div
        style={{
          width: 44, flexShrink: 0,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 6,
          fontSize: 10, fontWeight: hasContent ? 700 : 500,
          color: labelColor,
          borderRight: `1px solid ${HNH.line}`,
        }}
      >
        {slot.label}
      </div>

      {/* Items */}
      <div style={{ flex: 1, padding: hasContent ? '4px 8px' : '0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Lượt chấm công cá nhân trong giờ này */}
        {punches.map(p => (
          <div key={p.key} style={{ background: HNH.success50, border: `1px solid ${HNH.success}44`, borderRadius: 8, padding: '5px 9px' }}>
            <div className="flex items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
              <Icon name="clock" size={12} color={HNH.success} stroke={2} />
              <span style={{ fontSize: 13, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{p.time?.slice(0, 5)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: HNH.success }}>Chấm công</span>
              {p.inside === true && <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 5, padding: '1px 6px', background: '#dcfce7', color: '#15803d' }}>Trong VP</span>}
              {p.inside === false && <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 5, padding: '1px 6px', background: '#fef3c7', color: '#92400e' }}>Ngoài VP</span>}
              <PunchSourceBadge source={p.source} size="xs" />
            </div>
          </div>
        ))}

        {/* Cuộc họp / công việc (backend day-detail) */}
        {slot.items.map(item => (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className="w-full border-none cursor-pointer text-left"
            style={{
              background: item.type === 'meeting' ? HNH.red : HNH.navy,
              borderRadius: 8,
              padding: '6px 10px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.title}
              </div>
              {item.start && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                  {item.start} – {item.end}
                </div>
              )}
            </div>
            <Icon name="arrow-r" size={12} color="rgba(255,255,255,0.7)" stroke={2} />
          </button>
        ))}

        {/* Sự kiện Outlook có giờ cụ thể — lồng vào đúng dòng giờ */}
        {outlook.map(ev => (
          <div key={ev.id} style={{ background: HNH.navy50, border: `1px solid ${HNH.navy}33`, borderRadius: 8, padding: '5px 9px' }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 10 }}>☁</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                <div style={{ fontSize: 10, color: HNH.navy, fontWeight: 600 }}>
                  {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}{ev.description ? ` · ${ev.description}` : ''}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DayDetailPage() {
  const navigate = useNavigate()
  const { date } = useParams<{ date: string }>()
  const { data, loading } = useApi<DayDetailData>(
    date ? `/api/employee/me/day-detail/?date=${date}` : null
  )
  // Outlook: tự tải lịch ngày này nếu đã kết nối
  const { events: outlookEvents } = useOutlookEvents(date ?? null, date ?? null)
  // Chấm công cá nhân ngày này (mặc định chính user hiện tại).
  const { data: attResp } = useApi<ActivityResp>(
    date ? `/api/attendance/activity-detail/?date=${date}` : null
  )

  // Lồng vào timeline theo GIỜ: mỗi lượt chấm + sự kiện Outlook có giờ cụ thể.
  const punchesByHour = useMemo(() => {
    const m: Record<number, Punch[]> = {}
    for (const p of flattenPunches(attResp ?? null)) {
      const h = parseInt((p.time || '').slice(0, 2), 10)
      if (Number.isNaN(h)) continue
      ;(m[h] ??= []).push(p)
    }
    return m
  }, [attResp])

  const outlookByHour = useMemo(() => {
    const m: Record<number, OutlookEvent[]> = {}
    for (const ev of outlookEvents) {
      if (ev.all_day || !ev.start_time) continue
      const h = parseInt(ev.start_time.slice(0, 2), 10)
      if (Number.isNaN(h)) continue
      ;(m[h] ??= []).push(ev)
    }
    return m
  }, [outlookEvents])

  // Sự kiện Outlook cả ngày (không có giờ) → giữ ở dải trên timeline.
  const allDayOutlook = useMemo(() => outlookEvents.filter(e => e.all_day), [outlookEvents])
  const punchCount = useMemo(() => flattenPunches(attResp ?? null).length, [attResp])

  function handleItemClick(item: DayItem) {
    if (item.type === 'meeting' && item.meet_url) {
      window.open(item.meet_url, '_blank')
    } else {
      navigate('/tasks', { state: { openTaskId: item.id } })
    }
  }

  const dateLabel = data
    ? `${data.weekday_vi}, ${data.day}/${date?.slice(5, 7)}`
    : date ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fb' }}>
      <TopBar
        title={`Lịch ngày ${dateLabel}`}
        onBack={() => navigate(-1)}
      />

      {loading ? (
        <div className="flex items-center justify-center" style={{ flex: 1 }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${HNH.line}`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Tasks without time */}
          {(data?.tasks ?? []).length > 0 && (
            <div style={{ padding: '10px 14px 4px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.5, marginBottom: 6 }}>CÔNG VIỆC TRONG NGÀY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(data?.tasks ?? []).map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleItemClick(t)}
                    className="w-full border-none cursor-pointer text-left"
                    style={{
                      background: '#fff', border: `1px solid ${HNH.line}`,
                      borderRadius: 10, padding: '8px 12px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: PRIORITY_COLOR[t.priority] ?? HNH.ink3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 1 }}>{STATUS_VI[t.status] ?? t.status}</div>
                    </div>
                    <Icon name="chev-r" size={14} color={HNH.ink4} stroke={1.5} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Lịch Outlook CẢ NGÀY (sự kiện có giờ được lồng vào timeline bên dưới) */}
          {allDayOutlook.length > 0 && (
            <div style={{ padding: '10px 14px 4px' }}>
              <div className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11 }}>☁</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: HNH.navy, letterSpacing: 0.5 }}>LỊCH OUTLOOK · CẢ NGÀY</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allDayOutlook.map(ev => (
                  <div key={ev.id} style={{
                    background: HNH.navy50, border: `1px solid ${HNH.navy}33`,
                    borderRadius: 10, padding: '8px 12px',
                  }}>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: HNH.navy }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                        <div style={{ fontSize: 10.5, color: HNH.navy, marginTop: 1, fontWeight: 600 }}>
                          {ev.all_day ? 'Cả ngày' : `${ev.start_time ?? ''}${ev.end_time ? ' – ' + ev.end_time : ''}`}
                          {ev.description ? ` · ${ev.description}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 24-hour timeline */}
          <div style={{ marginTop: 8, background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 0 }}>
            <div style={{ padding: '8px 14px 4px', borderBottom: `1px solid ${HNH.line}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.5 }}>TIMELINE 24H</span>
            </div>
            {(data?.hours ?? []).map(slot => (
              <HourRow
                key={slot.hour}
                slot={slot}
                outlook={outlookByHour[slot.hour] ?? []}
                punches={punchesByHour[slot.hour] ?? []}
                onItemClick={handleItemClick}
              />
            ))}
          </div>

          {(data?.tasks.length === 0 && data?.hours.every(h => h.items.length === 0) && outlookEvents.length === 0 && punchCount === 0) && (
            <div className="flex flex-col items-center justify-center" style={{ padding: '40px 20px', color: HNH.ink3 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Không có lịch nào</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Ngày này chưa có công việc hay cuộc họp</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
