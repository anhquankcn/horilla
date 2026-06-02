import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DaySchedule {
  start_time: string | null
  end_time: string | null
  minimum_working_hour: string
  is_night_shift: boolean
}

interface ScheduleResponse {
  shift_name: string | null
  weekly_full_time: string | null
  days: Record<string, DaySchedule>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABEL: Record<string, { short: string; full: string }> = {
  monday:    { short: 'T2', full: 'Thứ Hai' },
  tuesday:   { short: 'T3', full: 'Thứ Ba' },
  wednesday: { short: 'T4', full: 'Thứ Tư' },
  thursday:  { short: 'T5', full: 'Thứ Năm' },
  friday:    { short: 'T6', full: 'Thứ Sáu' },
  saturday:  { short: 'T7', full: 'Thứ Bảy' },
  sunday:    { short: 'CN', full: 'Chủ Nhật' },
}

function todayDayName(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
}

function getWeekDates(offsetWeeks: number): Date[] {
  const now = new Date()
  const dow = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  return DAY_ORDER.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function fmtWeekRange(dates: Date[]): string {
  const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
  return `${fmt(dates[0])} – ${fmt(dates[6])}`
}

// ── Day Card ──────────────────────────────────────────────────────────────────

function DayCard({ day, date, schedule, isToday }: {
  day: string
  date: Date
  schedule: DaySchedule | undefined
  isToday: boolean
}) {
  const label = DAY_LABEL[day]
  const isWeekend = day === 'saturday' || day === 'sunday'
  const hasShift = !!schedule?.start_time

  let bg = '#fff'
  let border = `1px solid ${HNH.line}`
  if (isToday) { bg = HNH.navy; border = 'none' }
  else if (isWeekend && !hasShift) { bg = HNH.cream }

  const textMain = isToday ? '#fff' : HNH.ink
  const textSub = isToday ? 'rgba(255,255,255,0.7)' : HNH.ink3

  return (
    <div style={{
      background: bg, border, borderRadius: 14,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 8,
    }}>
      {/* Day badge */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: isToday ? 'rgba(255,255,255,0.2)' : isWeekend ? HNH.gold + '22' : HNH.navy50,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'rgba(255,255,255,0.7)' : isWeekend ? '#a87908' : HNH.navy, letterSpacing: 0.5 }}>
          {label.short}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? '#fff' : isWeekend ? '#a87908' : HNH.navy, lineHeight: 1.2 }}>
          {date.getDate()}
        </div>
      </div>

      {/* Shift info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {hasShift ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Icon name="clock" size={13} color={isToday ? 'rgba(255,255,255,0.8)' : HNH.navy} stroke={2} />
              <span style={{ fontSize: 14, fontWeight: 700, color: textMain }}>
                {schedule!.start_time} – {schedule!.end_time}
              </span>
              {schedule!.is_night_shift && (
                <span style={{ fontSize: 10, fontWeight: 700, background: isToday ? 'rgba(255,255,255,0.2)' : HNH.navy50, color: isToday ? '#fff' : HNH.navy, borderRadius: 6, padding: '1px 7px' }}>
                  Ca đêm
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: textSub, fontWeight: 500 }}>
              {label.full} · Tối thiểu {schedule!.minimum_working_hour}h
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>Nghỉ</div>
            <div style={{ fontSize: 12, color: textSub }}>{label.full}</div>
          </>
        )}
      </div>

      {/* Today chip */}
      {isToday && (
        <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, padding: '3px 8px', flexShrink: 0 }}>
          HÔM NAY
        </span>
      )}
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
    api.get<ScheduleResponse>('/api/employee/me/schedule/')
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const weekDates = getWeekDates(weekOffset)
  const todayDay = todayDayName()

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
          DAY_ORDER.map((day, i) => (
            <DayCard
              key={day}
              day={day}
              date={weekDates[i]}
              schedule={data.days[day]}
              isToday={weekOffset === 0 && day === todayDay}
            />
          ))
        )}
      </div>
    </div>
  )
}
