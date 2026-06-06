import { useState, useCallback, useEffect, useMemo } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { useClock } from '../lib/useClock'
import { useLiveClock } from '../lib/useLiveClock'
import { ClockModal } from '../components/ClockModal'
import { AttendanceDetailModal } from '../components/AttendanceDetailModal'
import { useTablet } from '../lib/useTablet'

/* ── Types ── */
interface AttendanceRecord {
  id: number
  attendance_date: string
  attendance_clock_in: string | null
  attendance_clock_out: string | null
  attendance_worked_hour: string | null
  minimum_hour: string | null
  at_work_second: number | null
  attendance_validated: boolean
  is_validate_request: boolean
  latest_activity_clock_in: string | null
  latest_activity_clock_out: string | null
}

interface PaginatedResponse<T> {
  count: number
  results: T[]
}

/* ── Helpers ── */
function parseHHMMToSec(hhmm: string | null | undefined): number {
  if (!hhmm) return 0
  const parts = hhmm.split(':').map(Number)
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60
}

function secToHHMM(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function getWeekMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return '--:--'
  return t.slice(0, 5)
}

/* ── Log row ── */
function LogRow({ date, day, clockIn, clockOut, hours, validated, pending, last, onClick }: {
  date: string; day: string
  clockIn: string; clockOut: string; hours: string
  validated: boolean; pending: boolean
  last?: boolean; onClick?: () => void
}) {
  const tag = validated ? 'Hợp lệ' : pending ? 'Chờ duyệt' : 'Chưa duyệt'
  const tagTone: 'success' | 'warn' | 'ink' = validated ? 'success' : pending ? 'warn' : 'ink'
  const outColor = clockOut === '--:--' ? HNH.ink3 : HNH.ink

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
      style={{ padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${HNH.line}`, background: 'transparent' }}
    >
      <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{date}</div>
        <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>{day}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, fontVariantNumeric: 'tabular-nums' }}>{clockIn}</span>
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
            <path d="M0 4h12M9 1l3 3-3 3" stroke={HNH.ink3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: outColor, fontVariantNumeric: 'tabular-nums' }}>{clockOut}</span>
          <span style={{ fontSize: 12.5, color: HNH.ink2, fontWeight: 700, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{hours}</span>
        </div>
        <div style={{ marginTop: 4 }}><Badge tone={tagTone} size="s">{tag}</Badge></div>
      </div>
      <Icon name="chev-r" size={14} color={HNH.ink4} stroke={2} />
    </button>
  )
}

/* ── Bar status colors ── */
const BAR_COLOR: Record<string, string> = {
  done:    HNH.navy,
  pending: HNH.warn,
  now:     HNH.red,
  absent:  HNH.red50,
}

export function AttendancePage() {
  const { employee } = useAuth()
  const { isClockedIn, duration, clockInTime, clockIn, clockOut, acting } = useClock()
  const { now, time } = useLiveClock()
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const [selectedAtt, setSelectedAtt] = useState<AttendanceRecord | null>(null)
  const { data: historyResp, refresh: refreshHistory } = useApi<PaginatedResponse<AttendanceRecord>>(
    '/api/attendance/my-attendance/?page_size=60'
  )
  const isTablet = useTablet()

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshHistory() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshHistory])

  const handleClockIn = useCallback(async (body?: Record<string, unknown>) => {
    const res = await clockIn(body)
    refreshHistory()
    return res
  }, [clockIn, refreshHistory])

  const handleClockOut = useCallback(async (body?: Record<string, unknown>) => {
    const res = await clockOut(body)
    refreshHistory()
    return res
  }, [clockOut, refreshHistory])

  const px = isTablet ? 28 : 20
  const history = historyResp?.results ?? []
  const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][now.getDay()]
  const dateStr = `${dayName} · ${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`

  /* ── Weekly chart (real data) ── */
  const todayStr = useMemo(() => now.toISOString().slice(0, 10), [now])

  const weekData = useMemo(() => {
    const monday = getWeekMonday(now)
    const attByDate = new Map(history.map(a => [a.attendance_date, a]))
    const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

    return DAY_LABELS.map((label, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dStr = d.toISOString().slice(0, 10)
      const att = attByDate.get(dStr)
      const isWeekend = i >= 5
      const isToday = dStr === todayStr
      const isFuture = dStr > todayStr

      if (!att) {
        const status = isFuture ? 'future' : isWeekend ? 'off' : isToday ? 'future' : 'absent'
        return { label, h: 0, status, workedStr: null, dStr }
      }

      const workedSec = att.at_work_second ?? 0
      const minSec = parseHHMMToSec(att.minimum_hour) || parseHHMMToSec('08:00')
      const pct = Math.min(100, Math.round((workedSec / minSec) * 100))
      const status = isToday ? 'now' : att.attendance_validated ? 'done' : 'pending'

      return { label, h: pct, status, workedStr: att.attendance_worked_hour?.slice(0, 5) ?? null, dStr }
    })
  }, [history, now, todayStr])

  const weekTotals = useMemo(() => {
    const attByDate = new Map(history.map(a => [a.attendance_date, a]))
    let workedSec = 0, minSec = 0
    weekData.forEach(b => {
      const att = attByDate.get(b.dStr)
      if (att) {
        workedSec += att.at_work_second ?? 0
        minSec += parseHHMMToSec(att.minimum_hour) || parseHHMMToSec('08:00')
      }
    })
    return { worked: secToHHMM(workedSec), target: secToHHMM(minSec) }
  }, [weekData, history])

  /* ── Weekly chart widget ── */
  const weeklyChart = (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink }}>Tuần này</div>
        <div style={{ fontSize: 12, color: HNH.ink3, fontVariantNumeric: 'tabular-nums' }}>
          {weekTotals.worked} / {weekTotals.target} giờ
        </div>
      </div>
      <div
        className="flex justify-between items-end"
        style={{
          background: '#fff', borderRadius: 18, padding: '12px 10px 10px',
          border: `1px solid ${HNH.line}`,
        }}
      >
        {weekData.map((b, i) => {
          const isNow = b.status === 'now'
          const barColor = BAR_COLOR[b.status]
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              {/* Worked hours label above bar */}
              <div style={{ fontSize: 8.5, fontWeight: 700, color: barColor ?? HNH.ink4, height: 12, fontVariantNumeric: 'tabular-nums' }}>
                {b.workedStr ?? (b.status === 'absent' ? '—' : '')}
              </div>
              {/* Bar track */}
              <div className="relative overflow-hidden" style={{ width: 22, height: 64, borderRadius: 6, background: HNH.cream2 }}>
                {b.h > 0 && barColor && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: `${b.h}%`, background: barColor, borderRadius: 6 }}
                  />
                )}
                {b.status === 'off' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: HNH.ink4 }} />
                  </div>
                )}
                {b.status === 'absent' && (
                  <div className="absolute inset-0 flex items-end justify-center" style={{ paddingBottom: 4 }}>
                    <div style={{ width: '70%', height: 3, background: HNH.red, borderRadius: 2, opacity: 0.5 }} />
                  </div>
                )}
              </div>
              {/* Day label */}
              <span style={{
                fontSize: 10, fontWeight: isNow ? 800 : 500,
                color: isNow ? HNH.red : b.status === 'done' ? HNH.navy : HNH.ink3,
              }}>{b.label}</span>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6, paddingLeft: 4 }}>
        {[
          [HNH.navy, 'Hợp lệ'],
          [HNH.warn, 'Chờ duyệt'],
          [HNH.red, 'Hôm nay'],
          [HNH.red50, 'Vắng'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1">
            <div style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9.5, color: HNH.ink3, fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  /* ── Check-in card ── */
  const checkInCard = (
    <div style={{
      background: '#fff', borderRadius: 24, padding: '22px 20px',
      border: `1px solid ${HNH.line}`,
      boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
    }}>
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 700, color: isClockedIn ? HNH.success : HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isClockedIn ? HNH.success : HNH.ink3, display: 'inline-block' }} />
            {isClockedIn ? 'Đang làm việc' : 'Chưa chấm công'}
          </div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 44, fontWeight: 800, letterSpacing: -1.5, color: HNH.ink, lineHeight: 1, marginTop: 4 }}>
            {duration.split(':').map((p, i) => (
              <span key={i}>{i > 0 && <span style={{ color: HNH.ink3 }}>:</span>}{p}</span>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4, fontWeight: 500 }}>
            {clockInTime ? `Bắt đầu ${clockInTime}` : 'Chưa vào ca'} · {employee?.shift_name ?? 'Ca hành chính'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ marginTop: 14, padding: '10px 12px', background: HNH.cream, borderRadius: 12 }}>
        <Icon name="pin" size={16} color={HNH.navy} />
        <div className="flex-1" style={{ fontSize: 12.5, fontWeight: 600, color: HNH.ink }}>
          185-187 Lê Thánh Tôn, Q.1
          <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>Trong khu vực VP · GPS chính xác ±5m</div>
        </div>
        <Badge tone="success" size="s">Hợp lệ</Badge>
      </div>

      <button
        onClick={() => setClockModalOpen(true)}
        className="flex items-center justify-center gap-2.5 border-none cursor-pointer w-full"
        style={{
          marginTop: 16, height: 54, borderRadius: 16,
          background: isClockedIn ? HNH.red : HNH.navy,
          color: '#fff', fontWeight: 700, fontSize: 15.5,
          boxShadow: isClockedIn
            ? '0 8px 18px rgba(192,34,43,0.28)'
            : '0 8px 18px rgba(20,43,111,0.2)',
        }}
      >
        <Icon name={isClockedIn ? 'clock' : 'check'} size={20} color="#fff" stroke={2.2} />
        {isClockedIn ? 'Chấm công kết thúc ca' : 'Chấm công vào ca'}
      </button>
    </div>
  )

  /* ── History section ── */
  const historySection = (
    <div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>Lịch sử gần đây</div>
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
        {history.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Chưa có dữ liệu</div>
        )}
        {history.slice(0, 10).map((att, i) => {
          const d = new Date(att.attendance_date + 'T00:00:00')
          const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
          const dateLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
          const dayLabel = DAY_LABELS[d.getDay()]

          // clock_in: first arrival (attendance_clock_in)
          const clockIn = fmtTime(att.attendance_clock_in)
          // clock_out: prefer latest activity clock_out, else attendance_clock_out
          const clockOut = fmtTime(att.latest_activity_clock_out ?? att.attendance_clock_out)
          const hours = att.attendance_worked_hour?.slice(0, 5) ?? '—'

          return (
            <LogRow
              key={att.id}
              date={dateLabel}
              day={dayLabel}
              clockIn={clockIn}
              clockOut={clockOut}
              hours={hours}
              validated={att.attendance_validated}
              pending={att.is_validate_request && !att.attendance_validated}
              last={i === Math.min(history.length, 10) - 1}
              onClick={() => setSelectedAtt(att)}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Chấm công"
        sub={dateStr}
        trailing={
          <div
            className="flex items-center gap-1.5"
            style={{
              background: HNH.navy, borderRadius: 12, padding: '6px 12px',
              boxShadow: '0 2px 8px rgba(20,43,111,0.15)',
            }}
          >
            <Icon name="clock" size={14} color="#fff" stroke={2} />
            <span style={{
              fontFamily: "'Plus Jakarta Sans', monospace", fontSize: 15, fontWeight: 800,
              color: '#fff', letterSpacing: 0.5,
            }}>
              {time}
            </span>
          </div>
        }
      />

      <div style={{ padding: `4px ${px}px 14px` }}>
        {isTablet ? (
          <div className="flex gap-4">
            <div style={{ flex: 1, minWidth: 0 }}>{checkInCard}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {weeklyChart}
              {historySection}
            </div>
          </div>
        ) : (
          <>
            {checkInCard}
            <div style={{ marginTop: 14 }}>{weeklyChart}</div>
            <div style={{ marginTop: 14 }}>{historySection}</div>
          </>
        )}
      </div>

      <ClockModal
        open={clockModalOpen}
        onClose={() => setClockModalOpen(false)}
        isClockedIn={isClockedIn}
        clockInTime={clockInTime}
        duration={duration}
        shiftName={employee?.shift_name ?? 'Ca hành chính'}
        acting={acting}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
      />

      <AttendanceDetailModal
        open={!!selectedAtt}
        onClose={() => setSelectedAtt(null)}
        attendanceId={selectedAtt?.id ?? null}
        attendanceDate={selectedAtt?.attendance_date ?? ''}
        clockIn={fmtTime(selectedAtt?.attendance_clock_in)}
        clockOut={fmtTime(selectedAtt?.attendance_clock_out)}
        workedHour={selectedAtt?.attendance_worked_hour?.slice(0, 5) ?? '—'}
      />
    </div>
  )
}
