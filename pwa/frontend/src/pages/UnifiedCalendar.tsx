import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
interface CalEvent {
  type: 'leave' | 'deadline' | 'project' | 'tour'
  title: string
  subtitle: string
  start: string
  end: string
  color: string
  extra?: { pax?: number; status?: string }
}

interface CalendarResponse {
  year: number
  month: number
  events: CalEvent[]
}

type EventType = 'all' | 'leave' | 'deadline' | 'project' | 'tour'

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

const TYPE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  leave:    { label: 'Nghỉ phép', icon: 'cal',    color: HNH.warn,    bg: HNH.warn50 },
  deadline: { label: 'Deadline',  icon: 'clock',   color: HNH.red,     bg: HNH.red50 },
  project:  { label: 'Dự án',    icon: 'folder',  color: HNH.navy,    bg: HNH.navy50 },
  tour:     { label: 'Tour',     icon: 'send',    color: '#a87908',   bg: '#faf1d6' },
}

const COLOR_MAP: Record<string, string> = {
  warn: HNH.warn,
  red: HNH.red,
  success: HNH.success,
  navy: HNH.navy,
  gold: '#a87908',
}

function eventColor(c: string) { return COLOR_MAP[c] || HNH.ink3 }

/* ── Filter chips ── */
function FilterBar({ active, onChange, counts }: {
  active: EventType
  onChange: (t: EventType) => void
  counts: Record<string, number>
}) {
  const filters: { key: EventType; label: string }[] = [
    { key: 'all', label: `Tất cả (${counts.all || 0})` },
    { key: 'leave', label: `Nghỉ (${counts.leave || 0})` },
    { key: 'deadline', label: `Deadline (${counts.deadline || 0})` },
    { key: 'project', label: `Dự án (${counts.project || 0})` },
    { key: 'tour', label: `Tour (${counts.tour || 0})` },
  ]
  return (
    <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 10px', scrollbarWidth: 'none' }}>
      {filters.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className="shrink-0 border-none cursor-pointer whitespace-nowrap"
          style={{
            padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: active === f.key ? HNH.navy : '#fff',
            color: active === f.key ? '#fff' : HNH.ink2,
            border: `1px solid ${active === f.key ? HNH.navy : HNH.line}`,
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

/* ── Calendar Grid ── */
function CalGrid({ year, month, events, selectedDate, onSelect }: {
  year: number
  month: number
  events: CalEvent[]
  selectedDate: string | null
  onSelect: (d: string) => void
}) {
  const firstDay = new Date(year, month - 1, 1)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayIso = new Date().toISOString().slice(0, 10)

  const eventsByDay = new Map<string, Set<string>>()
  for (const ev of events) {
    const s = new Date(ev.start + 'T00:00:00')
    const e = new Date(ev.end + 'T00:00:00')
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10)
      if (!eventsByDay.has(iso)) eventsByDay.set(iso, new Set())
      eventsByDay.get(iso)!.add(ev.type)
    }
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 12, border: `1px solid ${HNH.line}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 6 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 700,
            color: i >= 5 ? HNH.red : HNH.ink3, padding: '4px 0',
          }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((dayNum, i) => {
          if (dayNum === null) return <div key={`e${i}`} />
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
          const types = eventsByDay.get(iso)
          const isToday = iso === todayIso
          const isSelected = iso === selectedDate
          const isSunday = (startDow + dayNum - 1) % 7 === 6

          const dotTypes = types ? Array.from(types).slice(0, 3) : []

          return (
            <button
              key={dayNum}
              onClick={() => onSelect(iso)}
              className="flex flex-col items-center justify-center border-none cursor-pointer"
              style={{
                aspectRatio: '1', borderRadius: 12, position: 'relative',
                background: isSelected ? HNH.navy : isToday ? HNH.navy50 : 'transparent',
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: isToday || isSelected ? 800 : 600,
                color: isSelected ? '#fff' : isToday ? HNH.navy : isSunday ? HNH.red : HNH.ink,
              }}>
                {dayNum}
              </span>
              {dotTypes.length > 0 && (
                <div className="flex gap-0.5" style={{ position: 'absolute', bottom: 3 }}>
                  {dotTypes.map((t, di) => (
                    <span key={di} style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: isSelected ? '#fff' : (TYPE_META[t]?.color || HNH.ink3),
                    }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Legend ── */
function Legend() {
  return (
    <div className="flex items-center justify-center gap-4" style={{ padding: '8px 0' }}>
      {Object.entries(TYPE_META).map(([, m]) => (
        <div key={m.label} className="flex items-center gap-1">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
          <span style={{ fontSize: 10, color: HNH.ink3, fontWeight: 600 }}>{m.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Event card ── */
function EventCard({ ev }: { ev: CalEvent }) {
  const meta = TYPE_META[ev.type] || TYPE_META.project
  const c = eventColor(ev.color)
  const isRange = ev.start !== ev.end
  const startFmt = fmtDate(ev.start)
  const endFmt = fmtDate(ev.end)

  return (
    <div className="flex items-start gap-3" style={{
      background: '#fff', borderRadius: 14, padding: '12px 14px',
      border: `1px solid ${HNH.line}`,
    }}>
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 36, height: 36, borderRadius: 10, background: meta.bg }}
      >
        <Icon name={meta.icon} size={17} color={meta.color} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{ev.title}</span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, color: c,
            background: `${c}18`, borderRadius: 6, padding: '1px 7px',
            textTransform: 'uppercase',
          }}>
            {meta.label}
          </span>
        </div>
        {ev.subtitle && (
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>{ev.subtitle}</div>
        )}
        <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600, marginTop: 3 }}>
          {isRange ? `${startFmt} — ${endFmt}` : startFmt}
          {ev.extra?.pax != null && <span> · {ev.extra.pax} khách</span>}
          {ev.extra?.status && <span> · {statusLabel(ev.extra.status)}</span>}
        </div>
      </div>
    </div>
  )
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    scheduled: 'Đã lên lịch', confirmed: 'Đã xác nhận',
    ongoing: 'Đang diễn ra', completed: 'Hoàn thành',
  }
  return m[s] || s
}

/* ── Summary stats ── */
function SummaryBar({ events }: { events: CalEvent[] }) {
  const counts: Record<string, number> = {}
  for (const ev of events) counts[ev.type] = (counts[ev.type] || 0) + 1
  const items = [
    { key: 'leave', label: 'Nghỉ', color: HNH.warn, bg: HNH.warn50 },
    { key: 'deadline', label: 'Deadline', color: HNH.red, bg: HNH.red50 },
    { key: 'project', label: 'Dự án', color: HNH.navy, bg: HNH.navy50 },
    { key: 'tour', label: 'Tour', color: '#a87908', bg: '#faf1d6' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 12 }}>
      {items.map(it => (
        <div key={it.key} style={{
          background: it.bg, borderRadius: 12, padding: '8px 6px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: it.color }}>{counts[it.key] || 0}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: it.color, opacity: 0.8 }}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Main Page ── */
export function UnifiedCalendarPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(today.toISOString().slice(0, 10))
  const [filter, setFilter] = useState<EventType>('all')

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const mStr = `${y}-${String(m).padStart(2, '0')}`
      const d = await api.get<CalendarResponse>(`/api/employee/unified-calendar/?month=${mStr}`)
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(year, month) }, [year, month, fetchData])

  const goMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(m)
    setYear(y)
    setSelectedDate(null)
  }

  const goToday = () => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth() + 1)
    setSelectedDate(t.toISOString().slice(0, 10))
  }

  const allEvents = data?.events || []
  const filtered = filter === 'all' ? allEvents : allEvents.filter(e => e.type === filter)

  const counts: Record<string, number> = { all: allEvents.length }
  for (const ev of allEvents) counts[ev.type] = (counts[ev.type] || 0) + 1

  const dayEvents = selectedDate
    ? filtered.filter(ev => {
        const s = ev.start
        const e = ev.end
        return selectedDate >= s && selectedDate <= e
      })
    : []

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Lịch tổng hợp"
        onBack={() => navigate(-1)}
        trailing={
          <button
            onClick={goToday}
            className="border-none cursor-pointer"
            style={{
              fontSize: 11, fontWeight: 700, color: HNH.navy,
              background: HNH.navy50, borderRadius: 8, padding: '5px 10px',
            }}
          >
            Hôm nay
          </button>
        }
      />

      <PullToRefresh onRefresh={() => fetchData(year, month)}>
        <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>

          {/* Month navigator */}
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <button
              onClick={() => goMonth(-1)}
              className="flex items-center justify-center border-none cursor-pointer"
              style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${HNH.line}` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 19l-7-7 7-7" stroke={HNH.ink2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>
              {MONTH_NAMES[month - 1]} {year}
            </div>
            <button
              onClick={() => goMonth(1)}
              className="flex items-center justify-center border-none cursor-pointer"
              style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${HNH.line}` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 5l7 7-7 7" stroke={HNH.ink2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Đang tải...
            </div>
          ) : data ? (
            <>
              <SummaryBar events={allEvents} />

              <FilterBar active={filter} onChange={setFilter} counts={counts} />

              <CalGrid
                year={data.year}
                month={data.month}
                events={filtered}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
              />

              <Legend />

              {/* Events for selected day */}
              {selectedDate && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
                    {fmtDate(selectedDate)} — {dayEvents.length > 0 ? `${dayEvents.length} sự kiện` : 'Không có sự kiện'}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {dayEvents.map((ev, i) => <EventCard key={i} ev={ev} />)}
                    </div>
                  )}
                </div>
              )}

              {/* All events list */}
              {!selectedDate && filtered.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
                    Tất cả sự kiện ({filtered.length})
                  </div>
                  <div className="flex flex-col gap-2">
                    {filtered.map((ev, i) => <EventCard key={i} ev={ev} />)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Icon name="cal" size={40} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
                Không có dữ liệu
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
                Chưa có sự kiện trong tháng này
              </div>
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
