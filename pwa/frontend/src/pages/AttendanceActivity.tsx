import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

/* ── Types ── */
type FilterMode = 'today' | '3days' | '7days' | 'month' | 'range'
type ViewMode = 'grid' | 'list'

interface SlotData {
  time: string
  count: number
}

interface DayGrid {
  date: string
  weekday: string
  slots: SlotData[]
}

interface Activity {
  id: number
  employee_id: number
  employee_name: string
  badge_id: string | null
  date: string
  clock_in: string | null
  clock_out: string | null
  clock_in_date: string | null
  clock_out_date: string | null
}

interface OverviewData {
  mode: string
  dates: string[]
  total_employees: number
  grid: DayGrid[]
  activities: Activity[]
}

/* ── Helpers ── */
const FILTER_LABELS: Record<FilterMode, string> = {
  today: 'Hôm nay',
  '3days': '3 Ngày',
  '7days': '7 Ngày',
  month: 'Tháng',
  range: 'Khoảng TG',
}

const WEEKDAY_VI: Record<string, string> = {
  Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN',
}

function formatDateShort(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function formatDateFull(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return `${days[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`
}

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

/* ── Grid View ── */
function GridView({ data }: { data: OverviewData }) {
  if (data.grid.length === 0) return null

  const slots = data.grid[0].slots
  const amSlots = slots.filter(s => {
    const h = parseInt(s.time.split(':')[0])
    return h < 12
  })
  const pmSlots = slots.filter(s => {
    const h = parseInt(s.time.split(':')[0])
    return h >= 12
  })

  const isSingleDay = data.grid.length === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Morning block */}
      <SlotBlock
        label="Sáng (7:30 – 9:00)"
        icon="arrow-up"
        slots={amSlots}
        days={data.grid}
        total={data.total_employees}
        isSingleDay={isSingleDay}
        tone="navy"
      />
      {/* Afternoon block */}
      <SlotBlock
        label="Chiều (16:30 – 18:00)"
        icon="logout"
        slots={pmSlots}
        days={data.grid}
        total={data.total_employees}
        isSingleDay={isSingleDay}
        tone="gold"
      />
    </div>
  )
}

function SlotBlock({ label, icon, slots, days, total, isSingleDay, tone }: {
  label: string; icon: string; slots: SlotData[]; days: DayGrid[];
  total: number; isSingleDay: boolean; tone: 'navy' | 'gold'
}) {
  const bg = tone === 'navy' ? HNH.navy50 : '#faf1d6'
  const color = tone === 'navy' ? HNH.navy : '#a87908'

  return (
    <div style={{
      background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div className="flex items-center gap-2" style={{
        padding: '10px 14px', background: bg,
        borderBottom: `1px solid ${HNH.line}`,
      }}>
        <Icon name={icon} size={15} color={color} stroke={2} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{label}</span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 12,
          minWidth: isSingleDay ? undefined : days.length * 80 + 60,
        }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${HNH.line}` }}>
              <th style={{
                ...thStyle, position: 'sticky', left: 0, background: '#fff',
                zIndex: 1, minWidth: 54,
              }}>
                Giờ
              </th>
              {days.map(d => (
                <th key={d.date} style={{ ...thStyle, minWidth: 64 }}>
                  <div style={{ fontWeight: 700, color: HNH.ink }}>
                    {WEEKDAY_VI[d.weekday] || d.weekday}
                  </div>
                  <div style={{ fontWeight: 500, color: HNH.ink3, fontSize: 10.5 }}>
                    {formatDateShort(d.date)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, si) => (
              <tr key={slot.time} style={{
                borderBottom: si < slots.length - 1 ? `1px solid ${HNH.line}` : 'none',
              }}>
                <td style={{
                  ...tdStyle, position: 'sticky', left: 0, background: '#fff',
                  zIndex: 1, fontWeight: 600, color: HNH.ink2,
                }}>
                  {slot.time}
                </td>
                {days.map(d => {
                  const daySlot = d.slots.find(s => s.time === slot.time)
                  const count = daySlot?.count || 0
                  const pct = total > 0 ? count / total : 0
                  return (
                    <td key={d.date} style={{ ...tdStyle, textAlign: 'center' }}>
                      <CellBubble count={count} total={total} pct={pct} tone={tone} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 6px', textAlign: 'center', fontWeight: 600,
  fontSize: 11.5, color: HNH.ink2,
}

const tdStyle: React.CSSProperties = {
  padding: '7px 6px', fontSize: 12,
}

function CellBubble({ count, total, pct, tone }: {
  count: number; total: number; pct: number; tone: 'navy' | 'gold'
}) {
  if (count === 0) {
    return <span style={{ color: HNH.ink4, fontSize: 11 }}>—</span>
  }
  const bg = tone === 'navy'
    ? pct > 0.5 ? HNH.navy : HNH.navy50
    : pct > 0.5 ? '#d4a017' : '#faf1d6'
  const fg = tone === 'navy'
    ? pct > 0.5 ? '#fff' : HNH.navy
    : pct > 0.5 ? '#fff' : '#a87908'

  return (
    <span style={{
      display: 'inline-block', minWidth: 44,
      padding: '3px 8px', borderRadius: 8,
      background: bg, color: fg,
      fontSize: 11, fontWeight: 700, lineHeight: 1.3,
    }}>
      {count}/{total}
    </span>
  )
}

/* ── List View ── */
function ListView({ data }: { data: OverviewData }) {
  if (data.activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
        Không có hoạt động chấm công
      </div>
    )
  }

  const grouped: Record<string, Activity[]> = {}
  for (const a of data.activities) {
    if (!grouped[a.date]) grouped[a.date] = []
    grouped[a.date].push(a)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sortedDates.map(d => (
        <div key={d}>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <Icon name="cal" size={13} color={HNH.navy} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>
              {formatDateFull(d)}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 600, color: HNH.ink3,
              background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
            }}>
              {grouped[d].length} lượt
            </span>
          </div>
          <div style={{
            background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
            overflow: 'hidden',
          }}>
            {grouped[d].map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-3"
                style={{
                  padding: '10px 14px',
                  borderBottom: i < grouped[d].length - 1 ? `1px solid ${HNH.line}` : 'none',
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: a.clock_out ? HNH.success50 : HNH.navy50,
                  }}
                >
                  <Icon
                    name={a.clock_out ? 'check' : 'clock'}
                    size={16}
                    color={a.clock_out ? HNH.success : HNH.navy}
                    stroke={2}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                    {a.employee_name}
                  </div>
                  <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
                    {a.badge_id ? `${a.badge_id} · ` : ''}
                    Vào {a.clock_in || '—'}
                    {a.clock_out ? ` · Ra ${a.clock_out}` : ' · Chưa ra'}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: a.clock_out ? HNH.success : HNH.warn,
                  background: a.clock_out ? HNH.success50 : HNH.warn50,
                  borderRadius: 8, padding: '3px 8px',
                }}>
                  {a.clock_in || ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Filter Chips ── */
function FilterChips({ mode, onChange }: { mode: FilterMode; onChange: (m: FilterMode) => void }) {
  const modes: FilterMode[] = ['today', '3days', '7days', 'month', 'range']
  return (
    <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', paddingBottom: 2 }}>
      {modes.map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="shrink-0 border-none cursor-pointer whitespace-nowrap"
          style={{
            padding: '6px 14px', borderRadius: 10,
            background: m === mode ? HNH.navy : '#fff',
            color: m === mode ? '#fff' : HNH.ink2,
            fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${m === mode ? HNH.navy : HNH.line}`,
          }}
        >
          {FILTER_LABELS[m]}
        </button>
      ))}
    </div>
  )
}

/* ── Month Picker ── */
function MonthPicker({ month, year, onChange }: {
  month: number; year: number;
  onChange: (m: number, y: number) => void
}) {
  const prev = () => {
    if (month === 1) onChange(12, year - 1)
    else onChange(month - 1, year)
  }
  const next = () => {
    if (month === 12) onChange(1, year + 1)
    else onChange(month + 1, year)
  }
  return (
    <div className="flex items-center gap-3" style={{
      background: '#fff', borderRadius: 12, padding: '6px 12px',
      border: `1px solid ${HNH.line}`,
    }}>
      <button onClick={prev} className="border-none cursor-pointer bg-transparent p-0 flex items-center"
        style={{ transform: 'scaleX(-1)' }}>
        <Icon name="chev-r" size={16} color={HNH.ink2} stroke={2} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, minWidth: 100, textAlign: 'center' }}>
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <button onClick={next} className="border-none cursor-pointer bg-transparent p-0 flex items-center"
        style={{ transform: 'scaleX(1)' }}>
        <Icon name="chev-r" size={16} color={HNH.ink2} stroke={2} />
      </button>
    </div>
  )
}

/* ── Date Range Picker ── */
function DateRangePicker({ from, to, onChange }: {
  from: string; to: string;
  onChange: (f: string, t: string) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2 }}>Từ</label>
      <input
        type="date"
        value={from}
        onChange={e => onChange(e.target.value, to)}
        className="border-none outline-none"
        style={{
          background: '#fff', borderRadius: 10, padding: '6px 10px',
          fontSize: 13, fontWeight: 600, color: HNH.ink,
          border: `1px solid ${HNH.line}`,
        }}
      />
      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2 }}>Đến</label>
      <input
        type="date"
        value={to}
        onChange={e => onChange(from, e.target.value)}
        className="border-none outline-none"
        style={{
          background: '#fff', borderRadius: 10, padding: '6px 10px',
          fontSize: 13, fontWeight: 600, color: HNH.ink,
          border: `1px solid ${HNH.line}`,
        }}
      />
    </div>
  )
}

/* ── View Toggle ── */
function ViewToggle({ mode, onChange, disabled }: {
  mode: ViewMode; onChange: (m: ViewMode) => void; disabled: boolean
}) {
  return (
    <div className="flex" style={{
      background: HNH.cream2, borderRadius: 10, padding: 3,
      border: `1px solid ${HNH.line}`, opacity: disabled ? 0.5 : 1,
    }}>
      {(['grid', 'list'] as const).map(m => (
        <button
          key={m}
          onClick={() => !disabled && onChange(m)}
          disabled={disabled}
          className="flex items-center justify-center border-none cursor-pointer"
          style={{
            width: 32, height: 28, borderRadius: 8,
            background: mode === m ? '#fff' : 'transparent',
            boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <Icon
            name={m === 'grid' ? 'grid' : 'doc'}
            size={14}
            color={mode === m ? HNH.ink : HNH.ink3}
            stroke={2}
          />
        </button>
      ))}
    </div>
  )
}

/* ── Summary Stats ── */
function SummaryBar({ data }: { data: OverviewData }) {
  const uniqueEmps = new Set(data.activities.map(a => a.employee_id)).size
  const totalActs = data.activities.length
  const withClockOut = data.activities.filter(a => a.clock_out).length

  return (
    <div className="flex gap-3" style={{ marginBottom: 4 }}>
      <StatChip label="Nhân viên" value={`${uniqueEmps}/${data.total_employees}`} tone="navy" />
      <StatChip label="Lượt chấm" value={`${totalActs}`} tone="success" />
      <StatChip label="Đã ra" value={`${withClockOut}`} tone="gold" />
    </div>
  )
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: 'navy' | 'success' | 'gold' }) {
  const colors = {
    navy: { bg: HNH.navy50, fg: HNH.navy },
    success: { bg: HNH.success50, fg: HNH.success },
    gold: { bg: '#faf1d6', fg: '#a87908' },
  }
  const c = colors[tone]
  return (
    <div className="flex items-center gap-1.5" style={{
      background: c.bg, borderRadius: 10, padding: '6px 12px',
    }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: c.fg }}>{value}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: c.fg, opacity: 0.7 }}>{label}</span>
    </div>
  )
}

/* ── Main Page ── */
export function AttendanceActivityPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterMode>('today')
  const [view, setView] = useState<ViewMode>('grid')
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [dateFrom, setDateFrom] = useState(now.toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10))

  const gridAvailable = filter === 'today' || filter === '3days' || filter === '7days'

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let path = `/api/attendance/activity-overview/?mode=${filter}`
      if (filter === 'month') {
        path += `&month=${selMonth}&year=${selYear}`
      } else if (filter === 'range') {
        path += `&date_from=${dateFrom}&date_to=${dateTo}`
      }
      const res = await api.get<OverviewData>(path)
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [filter, selMonth, selYear, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!gridAvailable && view === 'grid') {
      setView('list')
    }
  }, [filter, gridAvailable, view])

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Hoạt động Chấm công"
        onBack={() => navigate(-1)}
        trailing={
          <ViewToggle mode={view} onChange={setView} disabled={!gridAvailable} />
        }
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 960, margin: '0 auto' }}>
        {/* Filter chips */}
        <FilterChips mode={filter} onChange={setFilter} />

        {/* Extra controls for month/range */}
        {filter === 'month' && (
          <div style={{ marginTop: 10 }}>
            <MonthPicker
              month={selMonth}
              year={selYear}
              onChange={(m, y) => { setSelMonth(m); setSelYear(y) }}
            />
          </div>
        )}
        {filter === 'range' && (
          <div style={{ marginTop: 10 }}>
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t) }}
            />
          </div>
        )}

        {/* Content */}
        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Đang tải...
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Không thể tải dữ liệu
            </div>
          ) : (
            <>
              <SummaryBar data={data} />
              <div style={{ marginTop: 12 }}>
                {view === 'grid' && gridAvailable ? (
                  <GridView data={data} />
                ) : (
                  <ListView data={data} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
