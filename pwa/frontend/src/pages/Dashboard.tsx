import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

interface DashboardData {
  today: string
  is_manager: boolean
  employees: { total: number; checked_in: number; not_checked_in: number }
  pending: { leave: number; shift: number; worktype: number; total: number }
  departments: { name: string; count: number }[]
  projects: { active: number; active_tasks: number; overdue_tasks: number }
  my_summary: { tasks_active: number; projects_active: number }
  upcoming_leaves: { employee: string; start: string; end: string; type: string }[]
  week_attendance: { date: string; day: string; count: number }[]
}

function fmtDate(d: string): string {
  const dt = new Date(d)
  return `${dt.getDate()}/${dt.getMonth() + 1}`
}

/* ── Metric Card ── */
function MetricCard({ icon, label, value, sub, tone, onClick }: {
  icon: string; label: string; value: number | string; sub?: string
  tone: 'navy' | 'red' | 'success' | 'gold' | 'warn'; onClick?: () => void
}) {
  const colors: Record<string, string> = {
    navy: HNH.navy, red: HNH.red, success: HNH.success, gold: '#a87908', warn: HNH.warn,
  }
  const bgs: Record<string, string> = {
    navy: HNH.navy50, red: HNH.red50, success: HNH.success50, gold: '#faf1d6', warn: HNH.warn50,
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col gap-1.5 ${onClick ? 'cursor-pointer border-none' : ''}`}
      style={{
        background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 16,
        padding: '14px 16px', textAlign: 'left' as const,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center"
          style={{ width: 28, height: 28, borderRadius: 8, background: bgs[tone] }}
        >
          <Icon name={icon} size={14} color={colors[tone]} stroke={2} />
        </div>
        <span style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 24, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5,
      }}>
        {value}
        {sub && <span style={{ fontSize: 12, color: HNH.ink3, fontWeight: 600, marginLeft: 3 }}>{sub}</span>}
      </div>
    </Tag>
  )
}

/* ── Attendance Ring ── */
function AttendanceRing({ checkedIn, total }: { checkedIn: number; total: number }) {
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0
  const r = 38
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="flex items-center gap-4">
      <div style={{ position: 'relative', width: 88, height: 88 }}>
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke={HNH.cream2} strokeWidth="8" />
          <circle
            cx="44" cy="44" r={r} fill="none"
            stroke={pct >= 80 ? HNH.success : pct >= 50 ? HNH.warn : HNH.red}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform="rotate(-90 44 44)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ fontSize: 18, fontWeight: 800, color: HNH.ink }}
        >
          {pct}%
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>Chấm công hôm nay</div>
        <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: HNH.success }}>{checkedIn}</div>
            <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>Đã vào</div>
          </div>
          <div style={{ width: 1, height: 28, background: HNH.line }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: HNH.red }}>{total - checkedIn}</div>
            <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>Chưa vào</div>
          </div>
          <div style={{ width: 1, height: 28, background: HNH.line }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: HNH.ink }}>{total}</div>
            <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>Tổng</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Mini Bar Chart (weekly attendance) ── */
function WeekChart({ data, maxVal }: { data: DashboardData['week_attendance']; maxVal: number }) {
  const max = Math.max(maxVal, 1)
  return (
    <div className="flex items-end justify-between gap-2" style={{ height: 80 }}>
      {data.map(d => {
        const h = Math.max((d.count / max) * 68, 4)
        const isToday = d.date === new Date().toISOString().slice(0, 10)
        return (
          <div key={d.date} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: HNH.ink3 }}>{d.count}</span>
            <div style={{
              width: '100%', maxWidth: 32, height: h, borderRadius: 6,
              background: isToday ? HNH.navy : HNH.navy50,
              transition: 'height 0.4s ease',
            }} />
            <span style={{
              fontSize: 10, fontWeight: isToday ? 800 : 600,
              color: isToday ? HNH.navy : HNH.ink3,
            }}>{d.day}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Department Bars ── */
function DeptBars({ depts }: { depts: DashboardData['departments'] }) {
  const max = Math.max(...depts.map(d => d.count), 1)
  const colors = [HNH.navy, HNH.red, HNH.success, '#a87908', HNH.warn, '#7c3aed', '#0891b2', '#c2410c', '#6366f1', '#059669']
  return (
    <div className="flex flex-col gap-2">
      {depts.map((d, i) => (
        <div key={d.name} className="flex items-center gap-2">
          <span style={{
            fontSize: 11.5, fontWeight: 600, color: HNH.ink2, width: 100,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flexShrink: 0,
          }}>{d.name}</span>
          <div style={{ flex: 1, height: 14, borderRadius: 4, background: HNH.cream2 }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${(d.count / max) * 100}%`,
              background: colors[i % colors.length],
              transition: 'width 0.4s ease',
              minWidth: 4,
            }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink, width: 28, textAlign: 'right' }}>{d.count}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Pending Approvals Card ── */
function PendingCard({ pending, onClick }: { pending: DashboardData['pending']; onClick: () => void }) {
  const items = [
    { label: 'Nghỉ phép', count: pending.leave, icon: 'leaf', tone: HNH.success },
    { label: 'Đổi ca', count: pending.shift, icon: 'clock', tone: HNH.navy },
    { label: 'Đổi loại CV', count: pending.worktype, icon: 'doc', tone: '#a87908' },
  ]
  return (
    <button
      onClick={onClick}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: pending.total > 0
          ? `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`
          : '#fff',
        borderRadius: 18, padding: 16,
        border: pending.total > 0 ? 'none' : `1px solid ${HNH.line}`,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <Icon name="bell" size={16} color={pending.total > 0 ? '#fff' : HNH.ink} stroke={2} />
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: pending.total > 0 ? '#fff' : HNH.ink,
          }}>Chờ duyệt</span>
        </div>
        <div className="flex items-center gap-1.5" style={{
          background: pending.total > 0 ? 'rgba(255,255,255,0.2)' : HNH.cream2,
          borderRadius: 8, padding: '3px 10px',
        }}>
          <span style={{
            fontSize: 16, fontWeight: 800,
            color: pending.total > 0 ? '#fff' : HNH.ink,
          }}>{pending.total}</span>
          <Icon name="chev-r" size={14} color={pending.total > 0 ? '#fff' : HNH.ink3} stroke={2} />
        </div>
      </div>
      <div className="flex gap-2">
        {items.map(it => (
          <div
            key={it.label}
            className="flex-1"
            style={{
              background: pending.total > 0 ? 'rgba(255,255,255,0.12)' : HNH.cream,
              borderRadius: 10, padding: '8px 10px', textAlign: 'center',
            }}
          >
            <div style={{
              fontSize: 18, fontWeight: 800, lineHeight: 1,
              color: pending.total > 0
                ? (it.count > 0 ? '#fff' : 'rgba(255,255,255,0.4)')
                : (it.count > 0 ? HNH.ink : HNH.ink4),
            }}>{it.count}</div>
            <div style={{
              fontSize: 10, fontWeight: 600, marginTop: 4,
              color: pending.total > 0 ? 'rgba(255,255,255,0.7)' : HNH.ink3,
            }}>{it.label}</div>
          </div>
        ))}
      </div>
    </button>
  )
}

/* ── Leave Row ── */
function LeaveRow({ item }: { item: DashboardData['upcoming_leaves'][number] }) {
  return (
    <div className="flex items-center gap-3" style={{
      padding: '10px 14px', background: '#fff', borderRadius: 12,
      border: `1px solid ${HNH.line}`,
    }}>
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, borderRadius: 10, background: HNH.success50 }}
      >
        <Icon name="leaf" size={14} color={HNH.success} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 13, fontWeight: 700, color: HNH.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.employee}</div>
        <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
          {item.type} · {fmtDate(item.start)} → {fmtDate(item.end)}
        </div>
      </div>
    </div>
  )
}

/* ── Section Header ── */
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{title}</div>
      {action && (
        <button
          onClick={onAction}
          className="border-none bg-transparent cursor-pointer"
          style={{ fontSize: 12, color: HNH.red, fontWeight: 600 }}
        >{action}</button>
      )}
    </div>
  )
}

/* ── Main Page ── */
export function DashboardPage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.get<DashboardData>('/api/employee/dashboard/')
      setData(d)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const px = isTablet ? 28 : 16

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Dashboard" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13 }}>
          Đang tải...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Dashboard" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3 }}>
          <Icon name="x" size={36} color={HNH.ink4} stroke={1.5} />
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
            Không thể tải dữ liệu
          </div>
        </div>
      </div>
    )
  }

  const maxAttendance = Math.max(...data.week_attendance.map(d => d.count), data.employees.total)

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Dashboard" onBack={() => navigate(-1)} />

      <PullToRefresh onRefresh={load}>
        <div style={{ padding: `0 ${px}px 32px`, maxWidth: 720, margin: '0 auto' }}>

          {/* Attendance ring */}
          <div style={{
            background: '#fff', borderRadius: 20, padding: 18,
            border: `1px solid ${HNH.line}`, marginBottom: 14,
          }}>
            <AttendanceRing
              checkedIn={data.employees.checked_in}
              total={data.employees.total}
            />
          </div>

          {/* Quick metric cards */}
          <div className={isTablet ? 'grid grid-cols-4 gap-3' : 'grid grid-cols-2 gap-3'} style={{ marginBottom: 14 }}>
            <MetricCard
              icon="users" label="Nhân sự" value={data.employees.total} sub="người"
              tone="navy" onClick={() => navigate('/employees')}
            />
            <MetricCard
              icon="folder" label="Dự án" value={data.projects.active} sub="đang chạy"
              tone="gold" onClick={() => navigate('/projects')}
            />
            <MetricCard
              icon="check" label="Task" value={data.projects.active_tasks}
              sub={data.projects.overdue_tasks > 0 ? `· ${data.projects.overdue_tasks} trễ` : 'đang làm'}
              tone={data.projects.overdue_tasks > 0 ? 'red' : 'success'}
            />
            <MetricCard
              icon="star" label="Việc của tôi" value={data.my_summary.tasks_active}
              sub={`· ${data.my_summary.projects_active} DA`}
              tone="warn"
            />
          </div>

          {/* Pending approvals */}
          {data.is_manager && (
            <div style={{ marginBottom: 14 }}>
              <PendingCard pending={data.pending} onClick={() => navigate('/approvals')} />
            </div>
          )}

          {/* Weekly attendance chart */}
          {data.week_attendance.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 18, padding: 16,
              border: `1px solid ${HNH.line}`, marginBottom: 14,
            }}>
              <SectionHeader
                title="Chấm công 7 ngày"
                action="Chi tiết →"
                onAction={() => navigate('/attendance-activity')}
              />
              <WeekChart data={data.week_attendance} maxVal={maxAttendance} />
            </div>
          )}

          {/* Department distribution */}
          {data.departments.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 18, padding: 16,
              border: `1px solid ${HNH.line}`, marginBottom: 14,
            }}>
              <SectionHeader title="Phân bổ nhân sự" />
              <DeptBars depts={data.departments} />
            </div>
          )}

          {/* Upcoming leaves */}
          {data.upcoming_leaves.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionHeader title="Nghỉ phép sắp tới" />
              <div className="flex flex-col gap-2">
                {data.upcoming_leaves.map((item, i) => (
                  <LeaveRow key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Quick nav */}
          <div style={{ marginBottom: 14 }}>
            <SectionHeader title="Truy cập nhanh" />
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: 'clock', label: 'Chấm công', path: '/attendance', tone: HNH.navy, bg: HNH.navy50 },
                { icon: 'send', label: 'Đề xuất', path: '/proposals', tone: '#a87908', bg: '#faf1d6' },
                { icon: 'leaf', label: 'Nghỉ phép', path: '/leave', tone: HNH.red, bg: HNH.red50 },
                { icon: 'folder', label: 'Dự án', path: '/projects', tone: HNH.success, bg: HNH.success50 },
              ].map(q => (
                <button
                  key={q.label}
                  onClick={() => navigate(q.path)}
                  className="flex flex-col items-center gap-1.5 border-none cursor-pointer"
                  style={{
                    background: '#fff', border: `1px solid ${HNH.line}`,
                    borderRadius: 14, padding: '12px 8px',
                  }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 34, height: 34, borderRadius: 10, background: q.bg }}
                  >
                    <Icon name={q.icon} size={18} color={q.tone} stroke={1.9} />
                  </div>
                  <span style={{ fontSize: 11.5, color: HNH.ink, fontWeight: 600 }}>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </PullToRefresh>
    </div>
  )
}
