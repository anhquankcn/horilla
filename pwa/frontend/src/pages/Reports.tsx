import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
type ReportType = 'attendance' | 'leave' | 'proposals'

interface Dept { id: number; name: string }

interface AttRow {
  id: number; name: string; department: string
  present: number; absent: number; late: number; early_out: number
  worked_hours: string; overtime: string; rate: number
}
interface AttSummary {
  workdays: number; employees: number; avg_rate: number
  total_late: number; total_early: number; total_absent: number
}
interface AttData { summary: AttSummary; rows: AttRow[] }

interface LeaveByType {
  type_name: string; total: number; approved: number
  pending: number; rejected: number; days_used: number
}
interface LeaveByEmp {
  id: number; name: string; department: string
  days_taken: number; requests: number
}
interface LeaveSummary { total_requests: number; approved: number; pending: number; rejected: number }
interface LeaveData { summary: LeaveSummary; by_type: LeaveByType[]; by_employee: LeaveByEmp[] }

interface ProposalCat {
  name: string; icon: string; total: number
  approved: number; pending: number; rejected: number
}
interface ProposalSummary { total: number; approved: number; pending: number; rejected: number }
interface ProposalData { summary: ProposalSummary; categories: ProposalCat[] }

interface ReportResponse {
  year: number; month: number; departments: Dept[]
  data: AttData | LeaveData | ProposalData
}

const MONTH_NAMES = [
  'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12',
]

/* ── Report type selector ── */
function ReportTabs({ active, onChange }: { active: ReportType; onChange: (r: ReportType) => void }) {
  const tabs: { key: ReportType; label: string; icon: string }[] = [
    { key: 'attendance', label: 'Chấm công', icon: 'clock' },
    { key: 'leave', label: 'Nghỉ phép', icon: 'cal' },
    { key: 'proposals', label: 'Đề xuất', icon: 'send' },
  ]
  return (
    <div className="flex" style={{
      background: '#fff', borderRadius: 14, padding: 3,
      border: `1px solid ${HNH.line}`, marginBottom: 12,
    }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
          style={{
            padding: '9px 4px', borderRadius: 11,
            background: active === t.key ? HNH.navy : 'transparent',
            color: active === t.key ? '#fff' : HNH.ink3,
            fontSize: 12, fontWeight: 700,
          }}
        >
          <Icon name={t.icon} size={14} color={active === t.key ? '#fff' : HNH.ink3} stroke={2} />
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ── Month nav ── */
function MonthNav({ year, month, onPrev, onNext }: {
  year: number; month: number; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
      <button onClick={onPrev} className="flex items-center justify-center border-none cursor-pointer"
        style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${HNH.line}` }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 19l-7-7 7-7" stroke={HNH.ink2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>
        {MONTH_NAMES[month - 1]} {year}
      </div>
      <button onClick={onNext} className="flex items-center justify-center border-none cursor-pointer"
        style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${HNH.line}` }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 5l7 7-7 7" stroke={HNH.ink2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

/* ── Department filter ── */
function DeptFilter({ depts, active, onChange }: {
  depts: Dept[]; active: string; onChange: (v: string) => void
}) {
  if (depts.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 12px', scrollbarWidth: 'none' }}>
      <button
        onClick={() => onChange('')}
        className="shrink-0 border-none cursor-pointer whitespace-nowrap"
        style={{
          padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
          background: !active ? HNH.navy : '#fff',
          color: !active ? '#fff' : HNH.ink2,
          border: `1px solid ${!active ? HNH.navy : HNH.line}`,
        }}
      >
        Tất cả PB
      </button>
      {depts.map(d => (
        <button
          key={d.id}
          onClick={() => onChange(String(d.id) === active ? '' : String(d.id))}
          className="shrink-0 border-none cursor-pointer whitespace-nowrap"
          style={{
            padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: String(d.id) === active ? HNH.navy : '#fff',
            color: String(d.id) === active ? '#fff' : HNH.ink2,
            border: `1px solid ${String(d.id) === active ? HNH.navy : HNH.line}`,
          }}
        >
          {d.name}
        </button>
      ))}
    </div>
  )
}

/* ── Stat box ── */
function StatBox({ label, val, color, bg }: { label: string; val: number | string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color, opacity: 0.8 }}>{label}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════
   ATTENDANCE REPORT
   ══════════════════════════════════════════════════ */
function AttendanceReport({ data }: { data: AttData }) {
  const { summary: s, rows } = data
  const [sort, setSort] = useState<'name' | 'rate' | 'late' | 'absent'>('name')
  const [expanded, setExpanded] = useState<number | null>(null)

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'rate') return a.rate - b.rate
    if (sort === 'late') return b.late - a.late
    if (sort === 'absent') return b.absent - a.absent
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 14 }}>
        <StatBox label="Tỷ lệ CC" val={`${s.avg_rate}%`} color={HNH.success} bg={HNH.success50} />
        <StatBox label="Đi muộn" val={s.total_late} color={HNH.warn} bg={HNH.warn50} />
        <StatBox label="Vắng" val={s.total_absent} color={HNH.red} bg={HNH.red50} />
      </div>
      <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 14 }}>
        <StatBox label="Nhân viên" val={s.employees} color={HNH.navy} bg={HNH.navy50} />
        <StatBox label="Ngày chuẩn" val={s.workdays} color={HNH.ink2} bg={HNH.cream2} />
        <StatBox label="Về sớm" val={s.total_early} color={'#a87908'} bg={'#faf1d6'} />
      </div>

      {/* Sort chips */}
      <div className="flex gap-1.5" style={{ marginBottom: 10 }}>
        {([
          { key: 'name' as const, label: 'Tên' },
          { key: 'rate' as const, label: 'Tỷ lệ thấp' },
          { key: 'late' as const, label: 'Đi muộn nhiều' },
          { key: 'absent' as const, label: 'Vắng nhiều' },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className="shrink-0 border-none cursor-pointer"
            style={{
              padding: '4px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 700,
              background: sort === s.key ? HNH.navy : '#fff',
              color: sort === s.key ? '#fff' : HNH.ink3,
              border: `1px solid ${sort === s.key ? HNH.navy : HNH.line}`,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Employee rows */}
      <div className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
            Không có dữ liệu chấm công
          </div>
        ) : sorted.map(r => {
          const isOpen = expanded === r.id
          return (
            <button
              key={r.id}
              onClick={() => setExpanded(isOpen ? null : r.id)}
              className="w-full border-none cursor-pointer text-left"
              style={{
                background: '#fff', borderRadius: 14, padding: '10px 14px',
                border: `1px solid ${HNH.line}`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{r.name}</div>
                  {r.department && (
                    <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{r.department}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Rate ring */}
                  <RateBadge rate={r.rate} />
                  <Icon name={isOpen ? 'chev-d' : 'chev-r'} size={12} color={HNH.ink4} stroke={2} />
                </div>
              </div>
              {/* Quick stats */}
              <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
                <MiniStat label="Có mặt" val={r.present} color={HNH.success} />
                <MiniStat label="Vắng" val={r.absent} color={HNH.red} />
                <MiniStat label="Muộn" val={r.late} color={HNH.warn} />
                <MiniStat label="Sớm" val={r.early_out} color={'#a87908'} />
              </div>
              {/* Expanded detail */}
              {isOpen && (
                <div className="grid grid-cols-2 gap-2" style={{
                  marginTop: 8, paddingTop: 8, borderTop: `1px solid ${HNH.line}`,
                }}>
                  <DetailCell label="Giờ làm" val={r.worked_hours} color={HNH.navy} />
                  <DetailCell label="Tăng ca" val={r.overtime} color={HNH.warn} />
                  <DetailCell label="Tỷ lệ CC" val={`${r.rate}%`} color={r.rate >= 80 ? HNH.success : HNH.red} />
                  <DetailCell label="Ngày có mặt" val={String(r.present)} color={HNH.ink} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

function RateBadge({ rate }: { rate: number }) {
  const color = rate >= 90 ? HNH.success : rate >= 70 ? HNH.warn : HNH.red
  const bg = rate >= 90 ? HNH.success50 : rate >= 70 ? HNH.warn50 : HNH.red50
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, color,
      background: bg, borderRadius: 7, padding: '2px 8px',
    }}>
      {rate}%
    </span>
  )
}

function MiniStat({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color }}>{val}</span>
    </div>
  )
}

function DetailCell({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div style={{ background: HNH.cream, borderRadius: 10, padding: '6px 10px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: HNH.ink3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{val}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════
   LEAVE REPORT
   ══════════════════════════════════════════════════ */
function LeaveReport({ data }: { data: LeaveData }) {
  const { summary: s, by_type, by_employee } = data
  const [view, setView] = useState<'type' | 'employee'>('type')

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 14 }}>
        <StatBox label="Tổng" val={s.total_requests} color={HNH.navy} bg={HNH.navy50} />
        <StatBox label="Đã duyệt" val={s.approved} color={HNH.success} bg={HNH.success50} />
        <StatBox label="Chờ duyệt" val={s.pending} color={HNH.warn} bg={HNH.warn50} />
        <StatBox label="Từ chối" val={s.rejected} color={HNH.red} bg={HNH.red50} />
      </div>

      {/* View toggle */}
      <div className="flex gap-1.5" style={{ marginBottom: 12 }}>
        <button
          onClick={() => setView('type')}
          className="border-none cursor-pointer"
          style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: view === 'type' ? HNH.navy : '#fff',
            color: view === 'type' ? '#fff' : HNH.ink2,
            border: `1px solid ${view === 'type' ? HNH.navy : HNH.line}`,
          }}
        >
          Theo loại phép
        </button>
        <button
          onClick={() => setView('employee')}
          className="border-none cursor-pointer"
          style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: view === 'employee' ? HNH.navy : '#fff',
            color: view === 'employee' ? '#fff' : HNH.ink2,
            border: `1px solid ${view === 'employee' ? HNH.navy : HNH.line}`,
          }}
        >
          Theo nhân viên
        </button>
      </div>

      {view === 'type' ? (
        <div className="flex flex-col gap-2">
          {by_type.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
              Không có dữ liệu nghỉ phép
            </div>
          ) : by_type.map(lt => (
            <div key={lt.type_name} style={{
              background: '#fff', borderRadius: 14, padding: '12px 14px',
              border: `1px solid ${HNH.line}`,
            }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{lt.type_name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: HNH.navy }}>{lt.total} đơn</span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 6, borderRadius: 3, background: HNH.cream2,
                display: 'flex', overflow: 'hidden', marginBottom: 8,
              }}>
                {lt.approved > 0 && (
                  <div style={{ flex: lt.approved, background: HNH.success }} />
                )}
                {lt.pending > 0 && (
                  <div style={{ flex: lt.pending, background: HNH.warn }} />
                )}
                {lt.rejected > 0 && (
                  <div style={{ flex: lt.rejected, background: HNH.red }} />
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.success }} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>Duyệt {lt.approved}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.warn }} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>Chờ {lt.pending}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.red }} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>Từ chối {lt.rejected}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: HNH.navy, marginLeft: 'auto' }}>
                  {lt.days_used} ngày
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {by_employee.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
              Không có nhân viên nào nghỉ phép
            </div>
          ) : by_employee.map(e => (
            <div key={e.id} className="flex items-center gap-3" style={{
              background: '#fff', borderRadius: 14, padding: '10px 14px',
              border: `1px solid ${HNH.line}`,
            }}>
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: HNH.navy50, color: HNH.navy,
                  fontSize: 13, fontWeight: 700,
                }}
              >
                {(e.name[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{e.name}</div>
                {e.department && (
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{e.department}</div>
                )}
              </div>
              <div className="text-right">
                <div style={{ fontSize: 16, fontWeight: 800, color: HNH.warn }}>{e.days_taken}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>ngày · {e.requests} đơn</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ══════════════════════════════════════════════════
   PROPOSALS REPORT
   ══════════════════════════════════════════════════ */
function ProposalsReport({ data }: { data: ProposalData }) {
  const { summary: s, categories } = data

  const ICON_MAP: Record<string, string> = {
    cal: 'cal', clock: 'clock', gear: 'gear', doc: 'doc',
  }

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 14 }}>
        <StatBox label="Tổng" val={s.total} color={HNH.navy} bg={HNH.navy50} />
        <StatBox label="Đã duyệt" val={s.approved} color={HNH.success} bg={HNH.success50} />
        <StatBox label="Chờ duyệt" val={s.pending} color={HNH.warn} bg={HNH.warn50} />
        <StatBox label="Từ chối" val={s.rejected} color={HNH.red} bg={HNH.red50} />
      </div>

      {/* Category cards */}
      <div className="flex flex-col gap-3">
        {categories.map(c => {
          const pctApproved = c.total > 0 ? Math.round(c.approved / c.total * 100) : 0
          return (
            <div key={c.name} style={{
              background: '#fff', borderRadius: 16, padding: '14px 16px',
              border: `1px solid ${HNH.line}`,
            }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 38, height: 38, borderRadius: 11, background: HNH.navy50 }}
                >
                  <Icon name={ICON_MAP[c.icon] || 'doc'} size={18} color={HNH.navy} stroke={2} />
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>
                    {c.total} đề xuất · Duyệt {pctApproved}%
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: HNH.navy }}>{c.total}</div>
              </div>

              {/* Bar */}
              {c.total > 0 && (
                <div style={{
                  height: 8, borderRadius: 4, background: HNH.cream2,
                  display: 'flex', overflow: 'hidden', marginBottom: 8,
                }}>
                  {c.approved > 0 && <div style={{ flex: c.approved, background: HNH.success }} />}
                  {c.pending > 0 && <div style={{ flex: c.pending, background: HNH.warn }} />}
                  {c.rejected > 0 && <div style={{ flex: c.rejected, background: HNH.red }} />}
                </div>
              )}

              {/* Legend */}
              <div className="flex items-center gap-4">
                <LegendDot label={`Duyệt ${c.approved}`} color={HNH.success} />
                <LegendDot label={`Chờ ${c.pending}`} color={HNH.warn} />
                <LegendDot label={`Từ chối ${c.rejected}`} color={HNH.red} />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>{label}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════ */
export function ReportsPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [report, setReport] = useState<ReportType>('attendance')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [dept, setDept] = useState('')
  const [data, setData] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const mStr = `${year}-${String(month).padStart(2, '0')}`
      const params = new URLSearchParams({ report, month: mStr })
      if (dept) params.set('department', dept)
      const d = await api.get<ReportResponse>(`/api/employee/reports/?${params}`)
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [report, year, month, dept])

  useEffect(() => { fetchReport() }, [fetchReport])

  const goMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(m)
    setYear(y)
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar onBack={() => navigate(-1)} title="Báo cáo" />

      <PullToRefresh onRefresh={fetchReport}>
        <div style={{ padding: '0 16px 32px', maxWidth: 720, margin: '0 auto' }}>

          <ReportTabs active={report} onChange={r => { setReport(r); setDept(''); setData(null); setLoading(true) }} />

          <MonthNav year={year} month={month} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} />

          <DeptFilter
            depts={data?.departments || []}
            active={dept}
            onChange={setDept}
          />

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Đang tải...
            </div>
          ) : data ? (
            <>
              {report === 'attendance' && <AttendanceReport data={data.data as AttData} />}
              {report === 'leave' && <LeaveReport data={data.data as LeaveData} />}
              {report === 'proposals' && <ProposalsReport data={data.data as ProposalData} />}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Icon name="grid" size={40} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
                Không có dữ liệu
              </div>
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
