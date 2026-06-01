import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
interface DayData {
  type: 'workday' | 'off' | 'leave' | 'holiday'
  status: 'present' | 'absent' | 'leave' | 'holiday' | 'off' | 'future'
  shift_start: string | null
  shift_end: string | null
  clock_in: string | null
  clock_out: string | null
  worked_hours: string | null
  overtime: string | null
  leave_type: string | null
  holiday_name: string | null
}

interface ScheduleEntry {
  start_time: string | null
  end_time: string | null
  is_night_shift: boolean
}

interface CalendarData {
  year: number
  month: number
  shift: { name: string } | null
  schedule: Record<string, ScheduleEntry>
  days: Record<string, DayData>
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]
const DAY_NAMES_VI: Record<string, string> = {
  monday: 'Thứ 2', tuesday: 'Thứ 3', wednesday: 'Thứ 4',
  thursday: 'Thứ 5', friday: 'Thứ 6', saturday: 'Thứ 7', sunday: 'Chủ nhật',
}

const STATUS_STYLE: Record<string, { dot: string; bg: string; label: string }> = {
  present:  { dot: HNH.success, bg: HNH.success50, label: 'Có mặt' },
  absent:   { dot: HNH.red,     bg: HNH.red50,     label: 'Vắng' },
  leave:    { dot: HNH.warn,    bg: HNH.warn50,    label: 'Nghỉ phép' },
  holiday:  { dot: HNH.navy,    bg: HNH.navy50,    label: 'Ngày lễ' },
  off:      { dot: HNH.ink4,    bg: HNH.cream2,    label: 'Ngày nghỉ' },
  future:   { dot: 'transparent', bg: 'transparent', label: '' },
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

/* ── Schedule Card ── */
function ShiftScheduleCard({ shift, schedule }: {
  shift: { name: string } | null
  schedule: Record<string, ScheduleEntry>
}) {
  if (!shift) return null
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const entries = dayOrder.filter(d => schedule[d])

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      border: `1px solid ${HNH.line}`, marginBottom: 14,
    }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
        <div
          className="flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 10, background: HNH.navy50 }}
        >
          <Icon name="clock" size={16} color={HNH.navy} stroke={2} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{shift.name}</div>
          <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>Lịch ca hiện tại</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {entries.map(d => {
          const s = schedule[d]
          return (
            <div key={d} style={{
              flex: '1 0 auto', minWidth: 42, textAlign: 'center',
              background: HNH.cream, borderRadius: 10, padding: '6px 4px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: HNH.ink2 }}>
                {DAY_NAMES_VI[d]?.replace('Thứ ', 'T') || d}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: HNH.navy, marginTop: 2 }}>
                {s.start_time}
              </div>
              <div style={{ fontSize: 9, color: HNH.ink3 }}>
                {s.end_time}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Calendar Grid ── */
function CalendarGrid({ year, month, days, selectedDate, onSelect }: {
  year: number
  month: number
  days: Record<string, DayData>
  selectedDate: string | null
  onSelect: (d: string) => void
}) {
  const firstDay = new Date(year, month - 1, 1)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayIso = new Date().toISOString().slice(0, 10)

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 12,
      border: `1px solid ${HNH.line}`,
    }}>
      {/* Weekday headers */}
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

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((dayNum, i) => {
          if (dayNum === null) return <div key={`e${i}`} />
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
          const dd = days[iso]
          const st = dd ? STATUS_STYLE[dd.status] || STATUS_STYLE.future : STATUS_STYLE.future
          const isToday = iso === todayIso
          const isSelected = iso === selectedDate
          const isSunday = (startDow + dayNum - 1) % 7 === 6

          return (
            <button
              key={dayNum}
              onClick={() => onSelect(iso)}
              className="flex flex-col items-center justify-center border-none cursor-pointer"
              style={{
                aspectRatio: '1', borderRadius: 12,
                background: isSelected ? HNH.navy : isToday ? HNH.navy50 : 'transparent',
                position: 'relative',
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: isToday || isSelected ? 800 : 600,
                color: isSelected ? '#fff' : isToday ? HNH.navy : isSunday ? HNH.red : HNH.ink,
              }}>
                {dayNum}
              </span>
              {dd && dd.status !== 'future' && (
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: isSelected ? '#fff' : st.dot,
                  position: 'absolute', bottom: 4,
                }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Day Detail Panel ── */
function DayDetail({ date: dateIso, data }: { date: string; data: DayData }) {
  const st = STATUS_STYLE[data.status] || STATUS_STYLE.future

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      border: `1px solid ${HNH.line}`, marginTop: 10,
    }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>
          {formatDate(dateIso)}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: st.dot,
          background: st.bg, borderRadius: 8, padding: '3px 10px',
        }}>
          {data.leave_type || data.holiday_name || st.label}
        </span>
      </div>

      {data.type === 'workday' && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px',
        }}>
          {data.shift_start && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Ca làm</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>
                {data.shift_start} — {data.shift_end}
              </div>
            </div>
          )}
          {data.clock_in && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Giờ thực tế</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.success }}>
                {data.clock_in} — {data.clock_out || '...'}
              </div>
            </div>
          )}
          {data.worked_hours && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Giờ làm</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{data.worked_hours}</div>
            </div>
          )}
          {data.overtime && data.overtime !== '00:00' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Tăng ca</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.warn }}>{data.overtime}</div>
            </div>
          )}
          {data.status === 'absent' && (
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{
                background: HNH.red50, borderRadius: 10, padding: '8px 12px',
                fontSize: 12, fontWeight: 600, color: HNH.red,
              }}>
                Chưa chấm công ngày này
              </div>
            </div>
          )}
        </div>
      )}

      {data.type === 'leave' && (
        <div style={{
          background: HNH.warn50, borderRadius: 10, padding: '8px 12px',
          fontSize: 12, fontWeight: 600, color: HNH.warn,
        }}>
          {data.leave_type || 'Nghỉ phép'}
        </div>
      )}

      {data.type === 'holiday' && (
        <div style={{
          background: HNH.navy50, borderRadius: 10, padding: '8px 12px',
          fontSize: 12, fontWeight: 600, color: HNH.navy,
        }}>
          {data.holiday_name || 'Ngày lễ'}
        </div>
      )}

      {data.type === 'off' && (
        <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500 }}>
          Ngày nghỉ — không có ca làm
        </div>
      )}
    </div>
  )
}

/* ── Legend ── */
function Legend() {
  const items = [
    { color: HNH.success, label: 'Có mặt' },
    { color: HNH.red, label: 'Vắng' },
    { color: HNH.warn, label: 'Nghỉ phép' },
    { color: HNH.navy, label: 'Ngày lễ' },
    { color: HNH.ink4, label: 'Nghỉ' },
  ]
  return (
    <div className="flex items-center justify-center gap-4" style={{ padding: '8px 0' }}>
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.color }} />
          <span style={{ fontSize: 10, color: HNH.ink3, fontWeight: 600 }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Summary Bar ── */
function SummaryBar({ days }: { days: Record<string, DayData> }) {
  let present = 0, absent = 0, leave = 0, holiday = 0
  for (const d of Object.values(days)) {
    if (d.status === 'present') present++
    else if (d.status === 'absent') absent++
    else if (d.status === 'leave') leave++
    else if (d.status === 'holiday') holiday++
  }
  const items = [
    { label: 'Có mặt', val: present, color: HNH.success, bg: HNH.success50 },
    { label: 'Vắng', val: absent, color: HNH.red, bg: HNH.red50 },
    { label: 'Nghỉ', val: leave, color: HNH.warn, bg: HNH.warn50 },
    { label: 'Lễ', val: holiday, color: HNH.navy, bg: HNH.navy50 },
  ]
  return (
    <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 14 }}>
      {items.map(it => (
        <div key={it.label} style={{
          background: it.bg, borderRadius: 12, padding: '8px 6px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: it.color }}>{it.val}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: it.color, opacity: 0.8 }}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Main Page ── */
export function CalendarPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(today.toISOString().slice(0, 10))

  const fetchCalendar = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const mStr = `${y}-${String(m).padStart(2, '0')}`
      const d = await api.get<CalendarData>(`/api/attendance/my-calendar/?month=${mStr}`)
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCalendar(year, month) }, [year, month, fetchCalendar])

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

  const selectedDay = selectedDate && data?.days?.[selectedDate] || null

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Lịch & Ca làm"
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

      <PullToRefresh onRefresh={() => fetchCalendar(year, month)}>
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
              {/* Shift schedule card */}
              <ShiftScheduleCard shift={data.shift} schedule={data.schedule} />

              {/* Summary */}
              <SummaryBar days={data.days} />

              {/* Calendar grid */}
              <CalendarGrid
                year={data.year}
                month={data.month}
                days={data.days}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
              />

              {/* Legend */}
              <Legend />

              {/* Day detail */}
              {selectedDate && selectedDay && (
                <DayDetail date={selectedDate} data={selectedDay} />
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Icon name="cal" size={40} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
                Không có dữ liệu lịch
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
                Chưa được phân ca làm việc
              </div>
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
