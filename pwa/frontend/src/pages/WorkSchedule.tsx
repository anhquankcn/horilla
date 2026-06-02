import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DaySchedule {
  day_name: string
  start_time: string | null
  end_time: string | null
  start_time_2: string | null
  end_time_2: string | null
  minimum_working_hour: string
  is_night_shift: boolean
  is_leave: boolean
  leave_type: string | null
  is_off: boolean
}

interface ScheduleResponse {
  shift_name: string | null
  weekly_full_time: string | null
  days: Record<string, DaySchedule>   // keyed by ISO date YYYY-MM-DD
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABEL: Record<string, { short: string; full: string }> = {
  monday:    { short: 'T2', full: 'Thứ Hai' },
  tuesday:   { short: 'T3', full: 'Thứ Ba' },
  wednesday: { short: 'T4', full: 'Thứ Tư' },
  thursday:  { short: 'T5', full: 'Thứ Năm' },
  friday:    { short: 'T6', full: 'Thứ Sáu' },
  saturday:  { short: 'T7', full: 'Thứ Bảy' },
  sunday:    { short: 'CN', full: 'Chủ Nhật' },
}

function getMonday(offsetWeeks: number): Date {
  const now = new Date()
  const dow = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekDates(offsetWeeks: number): Date[] {
  const monday = getMonday(offsetWeeks)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtWeekRange(dates: Date[]): string {
  const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
  return `${fmt(dates[0])} – ${fmt(dates[6])}`
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

// ── Day Card ──────────────────────────────────────────────────────────────────

function DayCard({ date, schedule }: { date: Date; schedule: DaySchedule }) {
  const label = DAY_LABEL[schedule.day_name] ?? { short: '?', full: '?' }
  const today = isToday(date)
  const isWeekend = schedule.day_name === 'saturday' || schedule.day_name === 'sunday'
  const hasShift = !!schedule.start_time && !schedule.is_leave && !schedule.is_off

  let bg = '#fff'
  let border = `1px solid ${HNH.line}`
  if (today && schedule.is_leave) { bg = '#fff5e6'; border = `1px solid ${HNH.warn}` }
  else if (today) { bg = HNH.navy; border = 'none' }
  else if (schedule.is_leave) { bg = '#fff8f0'; border = `1px solid ${HNH.warn}` }
  else if (isWeekend && schedule.is_off) { bg = HNH.cream }

  const textMain = today && !schedule.is_leave ? '#fff' : HNH.ink
  const textSub = today && !schedule.is_leave ? 'rgba(255,255,255,0.7)' : HNH.ink3

  const dayBadgeBg = today && !schedule.is_leave
    ? 'rgba(255,255,255,0.2)'
    : schedule.is_leave
      ? HNH.warn50
      : isWeekend
        ? HNH.gold + '22'
        : HNH.navy50

  const dayNumColor = today && !schedule.is_leave
    ? '#fff'
    : schedule.is_leave
      ? HNH.warn
      : isWeekend
        ? '#a87908'
        : HNH.navy

  return (
    <div style={{
      background: bg, border, borderRadius: 14,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 8,
    }}>
      {/* Day badge */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: dayBadgeBg,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: dayNumColor, letterSpacing: 0.5, opacity: 0.7 }}>
          {label.short}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: dayNumColor, lineHeight: 1.2 }}>
          {date.getDate()}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {schedule.is_leave ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Icon name="leaf" size={13} color={HNH.warn} stroke={2} />
              <span style={{ fontSize: 14, fontWeight: 700, color: HNH.warn }}>
                {schedule.leave_type ?? 'Nghỉ phép'}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: HNH.warn50, color: HNH.warn,
              }}>Đã duyệt</span>
            </div>
            <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500 }}>{label.full}</div>
          </>
        ) : hasShift ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              <Icon name="clock" size={13} color={today ? 'rgba(255,255,255,0.8)' : HNH.navy} stroke={2} />
              <span style={{ fontSize: 14, fontWeight: 700, color: textMain }}>
                {schedule.start_time} – {schedule.end_time}
              </span>
              {schedule.start_time_2 && (
                <>
                  <span style={{ fontSize: 12, color: textSub }}>·</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: textMain }}>
                    {schedule.start_time_2} – {schedule.end_time_2}
                  </span>
                </>
              )}
              {schedule.is_night_shift && (
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 7px',
                  background: today ? 'rgba(255,255,255,0.2)' : HNH.navy50,
                  color: today ? '#fff' : HNH.navy,
                }}>Ca đêm</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: textSub, fontWeight: 500 }}>
              {label.full} · Tối thiểu {schedule.minimum_working_hour}h
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>Nghỉ</div>
            <div style={{ fontSize: 12, color: textSub }}>{label.full}</div>
          </>
        )}
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {today && (
          <span style={{
            fontSize: 10, fontWeight: 800,
            background: schedule.is_leave ? HNH.warn : 'rgba(255,255,255,0.25)',
            color: schedule.is_leave ? '#fff' : '#fff',
            borderRadius: 8, padding: '3px 8px',
          }}>HÔM NAY</span>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function WorkSchedulePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<ScheduleResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    setLoading(true)
    api.get<ScheduleResponse>(`/api/employee/me/schedule/?week_offset=${weekOffset}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [weekOffset])

  const weekDates = getWeekDates(weekOffset)

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Lịch làm việc" onBack={() => navigate(-1)} />

      {/* Shift name header */}
      {data?.shift_name && (
        <div style={{ margin: '12px 16px 0', background: HNH.navy, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 10px' }}>
            <Icon name="clock" size={18} color="#fff" stroke={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{data.shift_name}</div>
            {data.weekly_full_time && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                Giờ chuẩn tuần: {data.weekly_full_time}h
              </div>
            )}
          </div>
        </div>
      )}

      {/* Week navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 16px 8px' }}>
        <button onClick={() => setWeekOffset(w => w - 1)}
          style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="chev-l" size={16} color={HNH.ink2} stroke={2} />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
            {weekOffset === 0 ? 'Tuần này' : weekOffset === 1 ? 'Tuần sau' : weekOffset === -1 ? 'Tuần trước' : `${weekOffset > 0 ? '+' : ''}${weekOffset} tuần`}
          </div>
          <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{fmtWeekRange(weekDates)}</div>
        </div>

        <button onClick={() => setWeekOffset(w => w + 1)}
          style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="chev-r" size={16} color={HNH.ink2} stroke={2} />
        </button>
      </div>

      {weekOffset !== 0 && (
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <button onClick={() => setWeekOffset(0)}
            style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: HNH.navy, cursor: 'pointer' }}>
            Về tuần này
          </button>
        </div>
      )}

      {/* Day cards */}
      <div style={{ padding: '4px 16px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: HNH.ink3 }}>Đang tải...</div>
        ) : !data?.shift_name ? (
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginBottom: 6 }}>Chưa có ca làm việc</div>
            <div style={{ fontSize: 13, color: HNH.ink3 }}>Liên hệ HR để được phân công ca</div>
          </div>
        ) : (
          weekDates.map(date => {
            const iso = toISO(date)
            const schedule = data.days[iso]
            if (!schedule) return null
            return <DayCard key={iso} date={date} schedule={schedule} />
          })
        )}
      </div>
    </div>
  )
}
