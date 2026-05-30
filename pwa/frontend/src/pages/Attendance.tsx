import { useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { useClock } from '../lib/useClock'
import { useLiveClock } from '../lib/useLiveClock'
import { ClockModal } from '../components/ClockModal'

function LogRow({ date, day, inT, outT, hours, tag, tagTone, last }: {
  date: string; day: string; inT: string; outT: string; hours: string
  tag: string; tagTone: 'navy' | 'red' | 'gold' | 'success' | 'warn' | 'ink'; last?: boolean
}) {
  return (
    <div className="flex items-center gap-3" style={{ padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${HNH.line}` }}>
      <div style={{ width: 38, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{date}</div>
        <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>{day}</div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{inT}</span>
          <span style={{ color: HNH.ink3, fontSize: 11 }}>→</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{outT}</span>
          <span className="ml-auto" style={{ fontSize: 12.5, color: HNH.ink2, fontWeight: 600 }}>{hours}</span>
        </div>
        <div style={{ marginTop: 4 }}><Badge tone={tagTone} size="s">{tag}</Badge></div>
      </div>
    </div>
  )
}

interface AttendanceRecord {
  id: number
  attendance_date: string
  attendance_clock_in: string | null
  attendance_clock_out: string | null
  attendance_worked_hour: string | null
}

interface PaginatedResponse<T> {
  count: number
  results: T[]
}

export function AttendancePage() {
  const { employee } = useAuth()
  const { isClockedIn, duration, clockInTime, clockIn, clockOut, acting } = useClock()
  const { now, time } = useLiveClock()
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const { data: historyResp } = useApi<PaginatedResponse<AttendanceRecord>>('/api/attendance/my-attendance/')

  const history = historyResp?.results ?? []
  const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][now.getDay()]
  const dateStr = `${dayName} · ${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`

  const weekBars = [
    { d: 'T2', h: 78, status: 'done' },
    { d: 'T3', h: 86, status: 'done' },
    { d: 'T4', h: 92, status: 'done' },
    { d: 'T5', h: 50, status: 'now' },
    { d: 'T6', h: 0, status: 'future' },
    { d: 'T7', h: 0, status: 'future' },
    { d: 'CN', h: 0, status: 'off' },
  ]

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

      <div style={{ padding: '4px 20px 14px' }}>
        {/* Big check-in card */}
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

          {/* Location pill */}
          <div className="flex items-center gap-2" style={{ marginTop: 14, padding: '10px 12px', background: HNH.cream, borderRadius: 12 }}>
            <Icon name="pin" size={16} color={HNH.navy} />
            <div className="flex-1" style={{ fontSize: 12.5, fontWeight: 600, color: HNH.ink }}>
              185-187 Lê Thánh Tôn, Q.1
              <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>Trong khu vực VP · GPS chính xác ±5m</div>
            </div>
            <Badge tone="success" size="s">Hợp lệ</Badge>
          </div>

          {/* Action button */}
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

        {/* Weekly mini chart */}
        <div style={{ marginTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink }}>Tuần này</div>
            <div style={{ fontSize: 12, color: HNH.ink3 }}>42:30 / 48:00 giờ</div>
          </div>
          <div
            className="flex justify-between items-end"
            style={{
              background: '#fff', borderRadius: 18, padding: '14px 12px',
              border: `1px solid ${HNH.line}`, height: 110,
            }}
          >
            {weekBars.map((b, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                <div className="relative overflow-hidden" style={{ width: 22, height: 70, borderRadius: 6, background: HNH.cream2 }}>
                  {b.h > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0"
                      style={{
                        height: `${b.h}%`,
                        background: b.status === 'now' ? HNH.red : HNH.navy,
                        borderRadius: 6,
                      }}
                    />
                  )}
                  {b.status === 'off' && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 10, color: HNH.ink3 }}>·</div>
                  )}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: b.status === 'now' ? 700 : 500, color: b.status === 'now' ? HNH.red : HNH.ink3 }}>{b.d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Log */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>Lịch sử gần đây</div>
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
            {history.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Chưa có dữ liệu</div>
            )}
            {history.slice(0, 7).map((att, i) => {
              const d = new Date(att.attendance_date)
              const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
              const dateLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
              const inTime = att.attendance_clock_in?.slice(0, 5) ?? '--:--'
              const outTime = att.attendance_clock_out?.slice(0, 5) ?? '--:--'
              const hours = att.attendance_worked_hour?.slice(0, 5) ?? '—'
              return (
                <LogRow
                  key={att.id}
                  date={dateLabel}
                  day={dayLabels[d.getDay()]}
                  inT={inTime}
                  outT={outTime}
                  hours={hours}
                  tag="Văn phòng"
                  tagTone="navy"
                  last={i === Math.min(history.length, 7) - 1}
                />
              )
            })}
          </div>
        </div>
      </div>

      <ClockModal
        open={clockModalOpen}
        onClose={() => setClockModalOpen(false)}
        isClockedIn={isClockedIn}
        clockInTime={clockInTime}
        duration={duration}
        shiftName={employee?.shift_name ?? 'Ca hành chính'}
        acting={acting}
        onClockIn={clockIn}
        onClockOut={clockOut}
      />
    </div>
  )
}
