import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useAuth } from '../lib/auth'
import { useClock } from '../lib/useClock'
import { useLiveClock } from '../lib/useLiveClock'
import { useApi } from '../lib/useApi'
import { ClockModal } from '../components/ClockModal'
import { useTablet } from '../lib/useTablet'

interface AttendanceRecord {
  id: number
  attendance_date: string
}

interface PaginatedResponse<T> {
  count: number
  results: T[]
}

interface LeaveAvailable {
  id: number
  available_days: number
  leave_type_id: { name: string }
}

interface TaskSummary {
  total: number
  to_do: number
  in_progress: number
  done: number
  blocked: number
  overdue: number
  recent_tasks: {
    id: number
    title: string
    status: string
    priority: string
    due_date: string | null
    overdue_days: number
    department: string | null
  }[]
}

interface PayrollEntry {
  month: number
  year: number
  col_AK: number | null
  col_AB: number | null
  contract_type: string
}

interface NotifSummary {
  unread: number
  total: number
}

interface Notification {
  id: number
  level: string
  unread: boolean
  verb: string
  description: string | null
  timestamp: string
  actor_name: string | null
}

/* ── Helpers ── */
function fmtMoney(n: number | null | undefined): string {
  if (n == null || n === 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins}p`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

type NotifTone = 'success' | 'red' | 'warn' | 'navy' | 'gold' | 'ink'

function notifMeta(verb: string, level: string): { bg: string; tone: NotifTone; icon: string } {
  const v = verb.toLowerCase()
  if (v.includes('duyệt') || v.includes('approved'))
    return { bg: HNH.success, tone: 'success', icon: 'check' }
  if (v.includes('từ chối') || v.includes('rejected'))
    return { bg: HNH.red, tone: 'red', icon: 'x' }
  if (v.includes('nghỉ phép') || v.includes('leave') || v.includes('đề xuất'))
    return { bg: HNH.navy, tone: 'navy', icon: 'send' }
  if (v.includes('chấm công') || v.includes('attendance'))
    return { bg: HNH.warn, tone: 'warn', icon: 'clock' }
  if (v.includes('lương') || v.includes('payroll'))
    return { bg: '#a87908', tone: 'gold', icon: 'doc' }
  if (level === 'warning')
    return { bg: HNH.warn, tone: 'warn', icon: 'bell' }
  if (level === 'error')
    return { bg: HNH.red, tone: 'red', icon: 'x' }
  return { bg: HNH.ink2, tone: 'ink', icon: 'bell' }
}

/* ── Components ── */
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

const TASK_WEBVIEW = '/tasks/1stopshop'

const STATUS_LABELS: Record<string, string> = {
  to_do: 'Cần làm', in_progress: 'Đang làm', done: 'Hoàn thành', blocked: 'Bị chặn',
}
const STATUS_COLORS: Record<string, string> = {
  to_do: '#06b6d4', in_progress: '#2563eb', done: HNH.success, blocked: '#ea580c',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp',
}

function EOfficeCard({ tasks, onClick }: { tasks: TaskSummary | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden w-full border-none cursor-pointer text-left"
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Công việc cá nhân</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, letterSpacing: -0.2 }}>eOffice HNH Travel</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>task.hnhtravel.work · Quản lý công việc</div>
        </div>
        <div className="relative flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '5px 10px' }}>
          <Icon name="arrow-r" size={12} color="#fff" stroke={2} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Mở</span>
        </div>
      </div>
      <div className="relative flex gap-3" style={{ marginTop: 16 }}>
        {[
          { label: 'Đang làm', val: tasks?.in_progress ?? 0, color: '#60a5fa' },
          { label: 'Cần làm', val: tasks?.to_do ?? 0, color: '#22d3ee' },
          { label: 'Bị chặn', val: tasks?.blocked ?? 0, color: '#fb923c' },
          { label: 'Trễ hạn', val: tasks?.overdue ?? 0, color: '#f87171' },
        ].map(s => (
          <div key={s.label} className="flex-1" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.val > 0 ? s.color : 'rgba(255,255,255,0.4)', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </button>
  )
}

function CheckInCard({ employee, isClockedIn, clockInTime, duration, onOpen }: {
  employee: { shift_name?: string | null } | null
  isClockedIn: boolean; clockInTime: string | null; duration: string; onOpen: () => void
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 22, padding: 18,
      border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
      height: '100%', boxSizing: 'border-box',
    }}>
      <div className="flex justify-between items-center">
        <div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Chấm công · {employee?.shift_name ?? 'Ca hành chính'}
          </div>
          <div style={{ fontSize: 26, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, color: HNH.ink, marginTop: 2, letterSpacing: -0.5 }}>
            {clockInTime || '--:--'}
            {isClockedIn && <span style={{ fontSize: 13, color: HNH.success, fontWeight: 700, marginLeft: 4 }}>· đang làm</span>}
            {!clockInTime && <span style={{ fontSize: 13, color: HNH.ink3, fontWeight: 700, marginLeft: 4 }}>· chưa vào</span>}
          </div>
        </div>
        <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: isClockedIn ? HNH.success50 : HNH.cream2 }}>
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
        onClick={onOpen}
        className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
        style={{
          marginTop: 14, height: 48, borderRadius: 14,
          background: isClockedIn ? HNH.red : HNH.navy,
          color: '#fff', fontWeight: 700, fontSize: 14,
          boxShadow: isClockedIn ? '0 6px 14px rgba(192,34,43,0.25)' : '0 6px 14px rgba(20,43,111,0.2)',
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
  )
}

function TaskRow({ t, onClick }: { t: TaskSummary['recent_tasks'][number]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left border-none cursor-pointer"
      style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 14, padding: '10px 14px' }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: STATUS_COLORS[t.status] ?? HNH.ink3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
        <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>
          {STATUS_LABELS[t.status] ?? t.status}
          {t.due_date && <> · {t.due_date.slice(5).replace('-', '/')}</>}
          {t.overdue_days > 0 && <span style={{ color: HNH.red, fontWeight: 700 }}> · Trễ {t.overdue_days} ngày</span>}
        </div>
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
        background: t.priority === 'urgent' ? HNH.red50 : t.priority === 'high' ? '#fff7ed' : HNH.cream,
        color: t.priority === 'urgent' ? HNH.red : t.priority === 'high' ? '#ea580c' : HNH.ink3,
      }}>{PRIORITY_LABELS[t.priority] ?? t.priority}</div>
      <Icon name="chev-r" size={14} color={HNH.ink4} stroke={1.5} />
    </button>
  )
}

function NotifRow({ n, onClick }: { n: Notification; onClick: () => void }) {
  const meta = notifMeta(n.verb, n.level)
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left border-none cursor-pointer"
      style={{
        padding: '10px 14px',
        background: n.unread ? `${HNH.navy}06` : 'transparent',
        borderBottom: `1px solid ${HNH.line}`,
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, borderRadius: 10, background: `${meta.bg}18` }}
      >
        <Icon name={meta.icon} size={14} color={meta.bg} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 12.5, fontWeight: n.unread ? 700 : 600, color: HNH.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {n.verb}
        </div>
        {n.description && (
          <div style={{
            fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {n.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>{relativeTime(n.timestamp)}</span>
        {n.unread && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.red }} />
        )}
      </div>
    </button>
  )
}

/* ── Main ── */
export function HomePage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const { isClockedIn, duration, clockInTime, clockIn, clockOut, acting } = useClock()
  const { now, time } = useLiveClock()
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const { data: tasks, refresh: rTasks } = useApi<TaskSummary>('/api/eoffice/my-summary/')
  const { data: attendanceData, refresh: rAtt } = useApi<PaginatedResponse<AttendanceRecord>>(
    '/api/attendance/my-attendance/?page_size=50'
  )
  const { data: leaveData, refresh: rLeave } = useApi<PaginatedResponse<LeaveAvailable>>('/api/leave/available-leave/?page_size=20')
  const { data: notifSummary, refresh: rNotif } = useApi<NotifSummary>('/api/notifications/summary/')
  const { data: recentNotifs, refresh: rRecent } = useApi<PaginatedResponse<Notification>>('/api/notifications/list/all?page_size=5')
  const { data: payrollData, refresh: rPay } = useApi<PayrollEntry[]>('/api/payroll/my-monthly-payroll/')
  const refreshAll = useCallback(async () => {
    rTasks(); rAtt(); rLeave(); rNotif(); rRecent(); rPay()
  }, [rTasks, rAtt, rLeave, rNotif, rRecent, rPay])
  const isTablet = useTablet()
  const px = isTablet ? 28 : 20
  const activeCount = tasks ? tasks.to_do + tasks.in_progress + tasks.blocked : 0

  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const workingDays = attendanceData?.results?.filter(r => {
    const d = new Date(r.attendance_date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).length ?? 0
  const totalWorkDaysInMonth = (() => {
    const year = now.getFullYear()
    const month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d).getDay()
      if (day !== 0 && day !== 6) count++
    }
    return count
  })()

  const annualLeave = leaveData?.results?.find(l =>
    l.leave_type_id?.name?.toLowerCase().includes('phép năm') ||
    l.leave_type_id?.name?.toLowerCase().includes('annual')
  )
  const leaveRemaining = annualLeave ? annualLeave.available_days : (leaveData?.results?.[0]?.available_days ?? 0)
  const unreadCount = notifSummary?.unread ?? 0

  const latestPayroll = payrollData?.[0] ?? null
  const netPay = latestPayroll?.col_AK ?? null
  const netPayLabel = fmtMoney(netPay)
  const payrollMonth = latestPayroll ? `T${latestPayroll.month}/${String(latestPayroll.year).slice(2)}` : ''

  const notifications = recentNotifs?.results ?? []

  const dayName = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][now.getDay()]
  const dateStr = `${dayName.toUpperCase()}, ${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')}`

  const initials = employee
    ? `${(employee.employee_first_name?.[0] ?? '')}${(employee.employee_last_name?.[0] ?? '')}`.toUpperCase()
    : '??'
  const greeting = employee ? `Xin chào, ${employee.employee_first_name}!` : 'Xin chào!'

  return (
    <PullToRefresh onRefresh={refreshAll}>
    <div style={{ padding: '6px 0 14px' }}>
      {/* Greeting header */}
      <div className="flex items-center gap-3" style={{ padding: `6px ${px}px 14px` }}>
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
          {unreadCount > 0 && (
            <span
              className="absolute flex items-center justify-center"
              style={{
                top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 8, background: HNH.red, border: '1.5px solid #fff',
                fontSize: 9, fontWeight: 800, color: '#fff', lineHeight: 1,
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { window.location.href = '/' }}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{
            width: 40, height: 40, borderRadius: 12, background: HNH.white,
            boxShadow: '0 1px 2px rgba(15,20,40,0.06)',
          }}
          title="Giao diện Desktop"
        >
          <Icon name="monitor" size={18} color={HNH.ink} />
        </button>
      </div>

      {/* eOffice + Check-in: side by side on tablet, stacked on mobile */}
      {isTablet ? (
        <div className="flex gap-4" style={{ padding: `0 ${px}px` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <EOfficeCard tasks={tasks ?? null} onClick={() => navigate(TASK_WEBVIEW)} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CheckInCard employee={employee} isClockedIn={isClockedIn} clockInTime={clockInTime} duration={duration} onOpen={() => setClockModalOpen(true)} />
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: `0 ${px}px` }}>
            <EOfficeCard tasks={tasks ?? null} onClick={() => navigate(TASK_WEBVIEW)} />
          </div>
          <div style={{ padding: `14px ${px}px 0` }}>
            <CheckInCard employee={employee} isClockedIn={isClockedIn} clockInTime={clockInTime} duration={duration} onOpen={() => setClockModalOpen(true)} />
          </div>
        </>
      )}

      {/* Recent tasks */}
      {tasks && tasks.recent_tasks.length > 0 && (
        <div style={{ padding: `12px ${px}px 0` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Việc cần làm</div>
            <button
              onClick={() => navigate(TASK_WEBVIEW)}
              className="border-none bg-transparent cursor-pointer"
              style={{ fontSize: 12, color: HNH.red, fontWeight: 600 }}
            >Xem tất cả →</button>
          </div>
          <div className={isTablet ? 'grid gap-2' : 'flex flex-col gap-2'} style={isTablet ? { gridTemplateColumns: '1fr 1fr' } : undefined}>
            {tasks.recent_tasks.map(t => (
              <TaskRow key={t.id} t={t} onClick={() => navigate('/tasks', { state: { openTaskId: t.id } })} />
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div style={{ padding: `14px ${px}px 0` }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, letterSpacing: -0.1 }}>
            Tổng quan tháng {now.getMonth() + 1}
          </div>
          <button
            onClick={() => navigate('/attendance')}
            className="border-none bg-transparent cursor-pointer"
            style={{ fontSize: 12, color: HNH.red, fontWeight: 600 }}
          >Chi tiết →</button>
        </div>
        <div className={isTablet ? 'grid grid-cols-4 gap-2.5' : 'grid grid-cols-2 gap-2.5'}>
          <StatChip icon="cal" label="Ngày công" value={String(workingDays)} sub={`/ ${totalWorkDaysInMonth}`} tone="navy" />
          <StatChip icon="leaf" label="Nghỉ phép còn" value={String(leaveRemaining)} sub=" ngày" tone="success" />
          <StatChip icon="money" label={payrollMonth ? `Lương ${payrollMonth}` : 'Lương tháng'} value={netPayLabel} sub={netPay != null ? ' đ' : ''} tone="gold" />
          <StatChip icon="doc" label="Công việc" value={String(activeCount)} sub={tasks ? ` / ${tasks.total}` : ''} tone="red" />
        </div>
      </div>

      {/* Recent notifications */}
      {notifications.length > 0 && (
        <div style={{ padding: `16px ${px}px 0` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div className="flex items-center gap-2">
              <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Thông báo</div>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#fff', background: HNH.red,
                  borderRadius: 8, padding: '2px 7px', lineHeight: 1.4,
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/notifications')}
              className="border-none bg-transparent cursor-pointer"
              style={{ fontSize: 12, color: HNH.red, fontWeight: 600 }}
            >Xem tất cả →</button>
          </div>
          <div style={{
            background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden',
          }}>
            {notifications.slice(0, 3).map((n, i) => (
              <div key={n.id} style={{ borderBottom: i < Math.min(notifications.length, 3) - 1 ? undefined : 'none' }}>
                <NotifRow n={n} onClick={() => navigate('/notifications')} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding: `16px ${px}px 0` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>Truy cập nhanh</div>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon="leaf" label="Xin nghỉ" tone="red" onClick={() => navigate('/leave')} />
          <QuickAction icon="money" label="Lương" tone="navy" onClick={() => navigate('/payslip')} />
          <QuickAction icon="send" label="Đề xuất" tone="gold" onClick={() => navigate('/proposals')} />
          <QuickAction icon="check" label="Phê duyệt" tone="success" onClick={() => navigate('/approvals')} />
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
    </PullToRefresh>
  )
}
