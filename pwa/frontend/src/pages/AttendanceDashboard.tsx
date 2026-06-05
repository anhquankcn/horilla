import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

type Period = 'week' | 'month' | 'year'

interface StatItem { count: number; trend: number }
interface TrendPoint { month: string; leave: number; late: number }
interface TypeItem { name: string; count: number; color: string }
interface DeptItem { name: string; count: number }
interface LatePerson { name: string; dept: string; count: number; initials: string }

interface DashData {
  period_label: string
  stats: { late_early: StatItem; actual_leave: StatItem; planned_leave: StatItem }
  monthly_trend: TrendPoint[]
  leave_by_type: TypeItem[]
  leave_by_dept: DeptItem[]
  top_late_early: LatePerson[]
}

/* ── Stat Card ── */
function StatCard({ label, icon, tone, stat }: {
  label: string; icon: string; tone: string; stat: StatItem
}) {
  const trendUp = stat.trend > 0
  const neutral = stat.trend === 0
  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: '14px 16px',
      border: `1px solid ${HNH.line}`, flex: 1, minWidth: 0,
    }}>
      <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: tone + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon} size={14} color={tone} stroke={2} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5, lineHeight: 1 }}>
        {stat.count}
      </div>
      {!neutral && (
        <div className="flex items-center gap-1" style={{ marginTop: 5 }}>
          <Icon
            name={trendUp ? 'chev-u' : 'chev-d'}
            size={12}
            color={trendUp ? HNH.red : HNH.success}
            stroke={2.5}
          />
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: trendUp ? HNH.red : HNH.success,
          }}>
            {Math.abs(stat.trend)} so kỳ trước
          </span>
        </div>
      )}
      {neutral && (
        <div style={{ fontSize: 11, color: HNH.ink4, fontWeight: 500, marginTop: 5 }}>
          Không đổi
        </div>
      )}
    </div>
  )
}

/* ── Period Selector ── */
function PeriodSelector({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const options: { key: Period; label: string }[] = [
    { key: 'week', label: 'Tuần này' },
    { key: 'month', label: 'Tháng này' },
    { key: 'year', label: 'Năm nay' },
  ]
  return (
    <div className="flex" style={{
      background: HNH.cream2, borderRadius: 12, padding: 3,
      border: `1px solid ${HNH.line}`,
    }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className="border-none cursor-pointer"
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 9,
            fontSize: 12, fontWeight: period === o.key ? 700 : 500,
            background: period === o.key ? '#fff' : 'transparent',
            color: period === o.key ? HNH.ink : HNH.ink3,
            boxShadow: period === o.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── SVG Line Chart (monthly trend) ── */
function LineChart({ data }: { data: TrendPoint[] }) {
  const W = 320, H = 120, PL = 28, PR = 8, PT = 10, PB = 24
  const gW = W - PL - PR
  const gH = H - PT - PB
  const maxVal = Math.max(...data.map(d => Math.max(d.leave, d.late)), 1)

  const xStep = gW / Math.max(data.length - 1, 1)

  function pts(key: 'leave' | 'late'): string {
    return data.map((d, i) => {
      const x = PL + i * xStep
      const y = PT + gH - (d[key] / maxVal) * gH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  const yTicks = [0, Math.round(maxVal / 2), maxVal]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 260, height: 'auto' }}>
        {/* Y grid lines */}
        {yTicks.map(v => {
          const y = PT + gH - (v / maxVal) * gH
          return (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={HNH.line} strokeWidth={0.8} strokeDasharray="3 2" />
              <text x={PL - 4} y={y + 3.5} textAnchor="end" fontSize={7.5} fill={HNH.ink3}>{v}</text>
            </g>
          )
        })}

        {/* Lines */}
        <polyline points={pts('leave')} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={pts('late')} fill="none" stroke={HNH.red} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {data.map((d, i) => {
          const x = PL + i * xStep
          const yL = PT + gH - (d.leave / maxVal) * gH
          const yLa = PT + gH - (d.late / maxVal) * gH
          const show = data.length <= 12
          return show ? (
            <g key={i}>
              <circle cx={x} cy={yL} r={2.5} fill="#3b82f6" />
              <circle cx={x} cy={yLa} r={2.5} fill={HNH.red} />
            </g>
          ) : null
        })}

        {/* X labels — show every 2nd to avoid overlap */}
        {data.map((d, i) => {
          const x = PL + i * xStep
          const show = data.length <= 6 || i % 2 === 0
          return show ? (
            <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize={7.5} fill={HNH.ink3}>
              {d.month}
            </text>
          ) : null
        })}
      </svg>
    </div>
  )
}

/* ── SVG Donut Chart (leave by type) ── */
function DonutChart({ data }: { data: TypeItem[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: HNH.ink3, fontSize: 12 }}>
        Chưa có dữ liệu
      </div>
    )
  }

  const r = 38, cx = 52, cy = 52, strokeW = 14
  const circ = 2 * Math.PI * r
  let offset = 0

  const segments = data.map(d => {
    const pct = d.count / total
    const dash = pct * circ
    const seg = { ...d, dash, offset, pct }
    offset += dash
    return seg
  })

  return (
    <div className="flex items-center gap-4">
      <div style={{ flexShrink: 0 }}>
        <svg width="104" height="104" viewBox="0 0 104 104">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={HNH.cream2} strokeWidth={strokeW} />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeW}
              strokeDasharray={`${s.dash} ${circ - s.dash}`}
              strokeDashoffset={circ / 4 - s.offset}
              strokeLinecap="butt"
            />
          ))}
          <text x={cx} y={cy - 5} textAnchor="middle" fontSize={16} fontWeight="800" fill={HNH.ink}>{total}</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={8} fill={HNH.ink3}>lượt nghỉ</text>
        </svg>
      </div>
      <div className="flex flex-col gap-1.5" style={{ flex: 1, minWidth: 0 }}>
        {data.slice(0, 6).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
            <span style={{
              fontSize: 11, color: HNH.ink2, fontWeight: 500, flex: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{d.name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Horizontal Bar (leave by dept) ── */
function DeptBars({ data }: { data: DeptItem[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7']
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', padding: 16, color: HNH.ink3, fontSize: 12 }}>Chưa có dữ liệu</div>
  }
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{
            fontSize: 11.5, fontWeight: 600, color: HNH.ink2,
            width: 110, flexShrink: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{d.name}</span>
          <div style={{ flex: 1, height: 12, borderRadius: 4, background: HNH.cream2 }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${(d.count / max) * 100}%`,
              background: colors[i % colors.length],
              minWidth: 4,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink, width: 22, textAlign: 'right' }}>{d.count}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Top Late List ── */
function TopLateList({ data }: { data: LatePerson[] }) {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', padding: 16, color: HNH.ink3, fontSize: 12 }}>Không có dữ liệu</div>
  }
  const rankColors = ['#f59e0b', '#9ca3af', '#cd7f32']
  return (
    <div className="flex flex-col gap-2">
      {data.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
          style={{
            background: i === 0 ? HNH.warn50 : '#fff',
            borderRadius: 14, padding: '10px 14px',
            border: `1px solid ${i === 0 ? '#fde68a' : HNH.line}`,
          }}
        >
          <div style={{
            width: 20, fontWeight: 800, fontSize: 12,
            color: i < 3 ? rankColors[i] : HNH.ink4, textAlign: 'center',
          }}>
            {i + 1}
          </div>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: i === 0 ? HNH.warn : (i === 1 ? HNH.ink3 : '#a87908'),
              fontSize: 12, fontWeight: 800, color: '#fff',
            }}
          >
            {p.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{
              fontSize: 13, fontWeight: 700, color: HNH.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{p.name}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{p.dept}</div>
          </div>
          <div style={{
            background: i === 0 ? '#fde68a' : HNH.cream2,
            borderRadius: 8, padding: '3px 10px',
            fontSize: 14, fontWeight: 800,
            color: i === 0 ? '#92400e' : HNH.ink,
          }}>
            {p.count}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Section Header ── */
function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>
      {title}
    </div>
  )
}

/* ── Card wrapper ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: 16,
      border: `1px solid ${HNH.line}`, ...style,
    }}>
      {children}
    </div>
  )
}

/* ── Main Page ── */
export function AttendanceDashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const d = await api.get<DashData>(`/api/attendance/company-dashboard/?period=${p}`)
      setData(d)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Dashboard Chấm công" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13 }}>
          Đang tải...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Dashboard Chấm công" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Icon name="x" size={36} color={HNH.ink4} stroke={1.5} />
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
            Không có quyền hoặc không tải được dữ liệu
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Dashboard Chấm công" onBack={() => navigate(-1)} />

      <PullToRefresh onRefresh={() => load(period)}>
        <div style={{ padding: '0 16px 32px', maxWidth: 720, margin: '0 auto' }}>

          {/* Period selector + label */}
          <div style={{ marginBottom: 14 }}>
            <PeriodSelector period={period} onChange={p => { setPeriod(p) }} />
            <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 6, textAlign: 'center' }}>
              {data.period_label}
            </div>
          </div>

          {/* 3 stat cards */}
          <div className="flex gap-3" style={{ marginBottom: 14 }}>
            <StatCard
              label="Đi muộn / về sớm"
              icon="clock"
              tone={HNH.red}
              stat={data.stats.late_early}
            />
            <StatCard
              label="Đã nghỉ (duyệt)"
              icon="leaf"
              tone={HNH.success}
              stat={data.stats.actual_leave}
            />
            <StatCard
              label="Kế hoạch nghỉ"
              icon="cal"
              tone={HNH.navy}
              stat={data.stats.planned_leave}
            />
          </div>

          {/* Monthly trend line chart */}
          <Card style={{ marginBottom: 14 }}>
            <SectionHeader title="Xu hướng 12 tháng" />
            <div className="flex items-center gap-4" style={{ marginBottom: 8 }}>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 20, height: 3, borderRadius: 2, background: '#3b82f6' }} />
                <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600 }}>Nghỉ phép</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 20, height: 3, borderRadius: 2, background: HNH.red }} />
                <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600 }}>Đi muộn/về sớm</span>
              </div>
            </div>
            <LineChart data={data.monthly_trend} />
          </Card>

          {/* Leave by type donut */}
          <Card style={{ marginBottom: 14 }}>
            <SectionHeader title="Cơ cấu nghỉ phép theo loại" />
            <DonutChart data={data.leave_by_type} />
          </Card>

          {/* Leave by department bars */}
          <Card style={{ marginBottom: 14 }}>
            <SectionHeader title="Nghỉ phép theo phòng ban" />
            <DeptBars data={data.leave_by_dept} />
          </Card>

          {/* Top late/early employees */}
          <div style={{ marginBottom: 14 }}>
            <SectionHeader title="Top đi muộn / về sớm" />
            <TopLateList data={data.top_late_early} />
          </div>

        </div>
      </PullToRefresh>
    </div>
  )
}
