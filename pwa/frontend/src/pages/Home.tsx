import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../lib/auth'
import { useClock } from '../lib/useClock'
import { useLiveClock } from '../lib/useLiveClock'
import { ClockModal } from '../components/ClockModal'

function StatChip({ icon, label, value, sub, tone = 'navy' }: {
  icon: string; label: string; value: string; sub: string; tone?: string
}) {
  const colors: Record<string, string> = { navy: HNH.navy, red: HNH.red, success: HNH.success, gold: '#a87908' }
  const bgs: Record<string, string> = { navy: HNH.navy50, red: HNH.red50, success: HNH.success50, gold: '#faf1d6' }
  return (
    <div
      className="flex flex-col gap-1"
      style={{
        background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 16, padding: '12px 14px',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center"
          style={{ width: 26, height: 26, borderRadius: 8, background: bgs[tone] }}
        >
          <Icon name={icon} size={14} color={colors[tone]} stroke={2} />
        </div>
        <span style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5, marginTop: 2 }}>
        {value}<span style={{ fontSize: 12, color: HNH.ink3, fontWeight: 600, marginLeft: 2 }}>{sub}</span>
      </div>
    </div>
  )
}

function QuickAction({ icon, label, tone, onClick }: {
  icon: string; label: string; tone: string; onClick?: () => void
}) {
  const colors: Record<string, string> = { red: HNH.red, navy: HNH.navy, gold: '#a87908', success: HNH.success }
  const bgs: Record<string, string> = { red: HNH.red50, navy: HNH.navy50, gold: '#faf1d6', success: HNH.success50 }
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 bg-transparent border-none cursor-pointer"
      style={{
        background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 14,
        padding: '12px 8px',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: 34, height: 34, borderRadius: 10, background: bgs[tone] }}
      >
        <Icon name={icon} size={18} color={colors[tone]} stroke={1.9} />
      </div>
      <span style={{ fontSize: 11.5, color: HNH.ink, fontWeight: 600 }}>{label}</span>
    </button>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const { isClockedIn, duration, clockInTime, clockIn, clockOut, acting } = useClock()
  const { now, time } = useLiveClock()
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const dayName = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][now.getDay()]
  const dateStr = `${dayName.toUpperCase()}, ${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')}`

  const initials = employee
    ? `${(employee.employee_first_name?.[0] ?? '')}${(employee.employee_last_name?.[0] ?? '')}`.toUpperCase()
    : '??'
  const greeting = employee ? `Xin chào, ${employee.employee_first_name}!` : 'Xin chào!'

  return (
    <div style={{ padding: '6px 0 14px' }}>
      {/* Greeting header */}
      <div className="flex items-center gap-3" style={{ padding: '6px 20px 14px' }}>
        <Avatar initials={initials} bg={HNH.red} size={42} />
        <div className="flex-1">
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, letterSpacing: 0.4 }}>{dateStr}</div>
          <div className="flex items-baseline gap-2">
            <div style={{ fontSize: 18, fontWeight: 700, color: HNH.ink, letterSpacing: -0.2 }}>{greeting}</div>
          </div>
        </div>
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            background: HNH.navy, borderRadius: 14, padding: '6px 12px',
            boxShadow: '0 2px 8px rgba(20,43,111,0.15)',
          }}
        >
          <div style={{
            fontFamily: "'Plus Jakarta Sans', monospace", fontSize: 17, fontWeight: 800,
            color: '#fff', letterSpacing: 0.5, lineHeight: 1,
          }}>
            {time}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: 0.3 }}>
            UTC+7
          </div>
        </div>
        <button
          onClick={() => navigate('/notifications')}
          className="relative flex items-center justify-center border-none cursor-pointer"
          style={{
            width: 40, height: 40, borderRadius: 12, background: HNH.white,
            boxShadow: '0 1px 2px rgba(15,20,40,0.06)',
          }}
        >
          <Icon name="bell" size={18} color={HNH.ink} />
          <span
            className="absolute"
            style={{
              top: 8, right: 9, width: 8, height: 8,
              borderRadius: '50%', background: HNH.red, border: '1.5px solid #fff',
            }}
          />
        </button>
      </div>

      {/* Hero "today" card */}
      <div style={{ padding: '0 20px' }}>
        <div
          className="relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
            borderRadius: 22, padding: 18, color: '#fff',
            boxShadow: '0 10px 24px rgba(20,43,111,0.18)',
          }}
        >
          <div className="absolute" style={{ right: -50, top: -60, width: 180, height: 180, borderRadius: '50%', background: HNH.red, opacity: 0.18 }} />
          <div className="absolute" style={{ right: -10, top: 10, width: 80, height: 80, borderRadius: '50%', background: HNH.red, opacity: 0.5, filter: 'blur(20px)' }} />

          <div className="relative flex items-start justify-between">
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Tour hôm nay</div>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, letterSpacing: -0.2 }}>Hạ Long Bay 3N2Đ</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>HL-240514 · 24 khách</div>
            </div>
            <Badge tone="gold" soft={false} size="s">Đang chạy</Badge>
          </div>

          <div className="relative flex gap-4" style={{ marginTop: 18 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Vai trò</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>HDV trưởng</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.18)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Khởi hành</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>06:00 · Q.1</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.18)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Ngày</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>1 / 3</div>
            </div>
          </div>
        </div>
      </div>

      {/* Check-in card */}
      <div style={{ padding: '14px 20px 0' }}>
        <div
          style={{
            background: '#fff', borderRadius: 22, padding: 18,
            border: `1px solid ${HNH.line}`,
            boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Chấm công · {employee?.shift_name ?? 'Ca hành chính'}
              </div>
              <div style={{ fontSize: 26, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, color: HNH.ink, marginTop: 2, letterSpacing: -0.5 }}>
                {clockInTime || '--:--'}
                {isClockedIn && (
                  <span style={{ fontSize: 13, color: HNH.success, fontWeight: 700, marginLeft: 4 }}>· đang làm</span>
                )}
                {!clockInTime && (
                  <span style={{ fontSize: 13, color: HNH.ink3, fontWeight: 700, marginLeft: 4 }}>· chưa vào</span>
                )}
              </div>
            </div>
            <div
              className="flex items-center justify-center"
              style={{ width: 56, height: 56, borderRadius: '50%', background: isClockedIn ? HNH.success50 : HNH.cream2 }}
            >
              <Icon name={isClockedIn ? 'check' : 'clock'} size={26} color={isClockedIn ? HNH.success : HNH.ink3} stroke={2.4} />
            </div>
          </div>

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            {[
              { label: 'VÀO', value: clockInTime || '--:--' },
              { label: 'THỜI GIAN', value: duration },
            ].map(item => (
              <div key={item.label} className="flex-1" style={{ background: HNH.cream, borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>{item.value}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setClockModalOpen(true)}
            className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
            style={{
              marginTop: 14, height: 48, borderRadius: 14,
              background: isClockedIn ? HNH.red : HNH.navy,
              color: '#fff', fontWeight: 700, fontSize: 14,
              boxShadow: isClockedIn
                ? '0 6px 14px rgba(192,34,43,0.25)'
                : '0 6px 14px rgba(20,43,111,0.2)',
            }}
          >
            <Icon name={isClockedIn ? 'clock' : 'check'} size={18} color="#fff" stroke={2.2} />
            {isClockedIn ? 'Kết thúc ca' : 'Chấm công vào ca'}
          </button>

          <div className="flex items-center gap-1.5" style={{ marginTop: 10, fontSize: 11.5, color: HNH.ink3, fontWeight: 500 }}>
            <Icon name="pin" size={13} color={HNH.ink3} stroke={1.6} />
            185-187 Lê Thánh Tôn · Văn phòng HNH
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ padding: '14px 20px 0' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, letterSpacing: -0.1 }}>
            Tổng quan tháng {now.getMonth() + 1}
          </div>
          <span style={{ fontSize: 12, color: HNH.red, fontWeight: 600 }}>Chi tiết →</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <StatChip icon="cal" label="Ngày công" value="18" sub="/ 21" tone="navy" />
          <StatChip icon="leaf" label="Nghỉ phép còn" value="9" sub=" ngày" tone="success" />
          <StatChip icon="bus" label="Tour đã dẫn" value="4" sub="/ 6" tone="red" />
          <StatChip icon="star" label="Đánh giá khách" value="4.8" sub="/ 5" tone="gold" />
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>Truy cập nhanh</div>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon="leaf" label="Xin nghỉ" tone="red" onClick={() => navigate('/leave')} />
          <QuickAction icon="money" label="Lương" tone="navy" onClick={() => navigate('/payslip')} />
          <QuickAction icon="doc" label="Văn bản" tone="gold" />
          <QuickAction icon="sparkle" label="Báo cáo" tone="success" />
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
