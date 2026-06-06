import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { HNH } from '../lib/theme'

type DayStatus = 'present' | 'late' | 'leave' | 'unpaid' | 'absent' | 'weekend' | 'future' | ''

interface DayCell {
  check_in: string | null
  check_out: string | null
  status: DayStatus
  leave_name?: string
  at_work_second?: number
  overtime_second?: number
  is_weekend?: boolean
}

interface DayHeader {
  day: number
  weekday: string
  is_weekend: boolean
}

interface EmployeeRow {
  id: number
  name: string
  badge_id: string
  avatar: string | null
  department: string
  days: Record<string, DayCell>
}

interface MonthlyData {
  month_label: string
  year: number
  month: number
  days: DayHeader[]
  employees: EmployeeRow[]
}

interface Dept {
  id: number
  department: string
}

interface CellDetailState {
  emp: EmployeeRow
  day: number
  dh: DayHeader
  cell: DayCell
}

const STATUS_CFG: Record<string, { bg: string; border: string; text: string; label: string; dot: string }> = {
  present: { bg: '#dcfce7', border: '#86efac', text: '#15803d', dot: '#22c55e', label: 'Đủ công' },
  late:    { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', dot: '#4ade80', label: 'Thiếu giờ' },
  leave:   { bg: '#fefce8', border: '#fde047', text: '#92400e', dot: '#f59e0b', label: 'Nghỉ phép' },
  unpaid:  { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280', dot: '#9ca3af', label: 'K. lương' },
  absent:  { bg: '#fff1f2', border: '#fca5a5', text: '#be123c', dot: '#ef4444', label: 'Vắng mặt' },
  weekend: { bg: '#f8fafc', border: 'transparent', text: '#cbd5e1', dot: '#e2e8f0', label: 'Cuối tuần' },
  future:  { bg: '#ffffff', border: '#f1f5f9', text: '#e2e8f0', dot: '#f1f5f9', label: '' },
  '':      { bg: '#ffffff', border: 'transparent', text: '#e2e8f0', dot: '#e2e8f0', label: '' },
}

const LEGEND_KEYS: DayStatus[] = ['present', 'late', 'leave', 'unpaid', 'absent']
const NAME_COL_W = 176
const SUMM_COL_W = 80
const DAY_COL_W  = 68

function monthStr(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`
}
function shiftMonth(y: number, m: number, delta: number) {
  let nm = m + delta, ny = y
  while (nm > 12) { nm -= 12; ny++ }
  while (nm < 1)  { nm += 12; ny-- }
  return { year: ny, month: nm }
}
function fmtSecs(s: number) {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`
}

export function MonthlyAttendanceDetailPage() {
  const navigate = useNavigate()
  const now = new Date()
  const todayDay   = now.getDate()
  const todayMonth = now.getMonth() + 1
  const todayYear  = now.getFullYear()

  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [deptId, setDeptId] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [depts, setDepts]   = useState<Dept[]>([])
  const [cellDetail, setCellDetail] = useState<CellDetailState | null>(null)

  useEffect(() => {
    api.get('/api/employee/departments/')
      .then((d: unknown) => {
        const arr = Array.isArray(d) ? d : (d as { results?: Dept[] }).results ?? []
        setDepts(arr)
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ month: monthStr(year, month) })
    if (deptId) p.set('department_id', deptId)
    api.get<MonthlyData>(`/api/attendance/monthly-detail/?${p}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month, deptId])

  useEffect(() => { fetchData() }, [fetchData])

  const rows = data?.employees.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.badge_id && e.badge_id.toLowerCase().includes(search.toLowerCase()))
  ) ?? []

  const goMonth = (delta: number) => {
    const { year: ny, month: nm } = shiftMonth(year, month, delta)
    setYear(ny); setMonth(nm)
  }

  const stats = LEGEND_KEYS.reduce((acc, k) => {
    acc[k] = 0; return acc
  }, {} as Record<string, number>)
  rows.forEach(e => Object.values(e.days).forEach(cell => {
    if (cell.status in stats) stats[cell.status]++
  }))

  const isCurrentMonth = year === todayYear && month === todayMonth

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>

      {/* ── Toolbar ── */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, padding: 4, display: 'flex' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <span style={{ fontWeight: 700, fontSize: 15, color: HNH.ink, flex: 1, minWidth: 100 }}>
          Chấm công tháng
        </span>

        {/* Month nav */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#f1f5f9', borderRadius: 8, padding: '4px 10px',
        }}>
          <button onClick={() => goMonth(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, minWidth: 104, textAlign: 'center' }}>
            Tháng {month}/{year}
          </span>
          <button onClick={() => goMonth(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>›</button>
        </div>

        {/* Dept filter */}
        <select
          value={deptId}
          onChange={e => setDeptId(e.target.value)}
          style={{ fontSize: 12, border: `1px solid ${HNH.line}`, borderRadius: 8, padding: '5px 8px', color: HNH.ink, background: '#fff' }}
        >
          <option value="">Tất cả phòng ban</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.department}</option>)}
        </select>

        {/* Search */}
        <input
          placeholder="Tên / mã NV..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, border: `1px solid ${HNH.line}`, borderRadius: 8, padding: '5px 10px', width: 128, color: HNH.ink }}
        />
      </div>

      {/* ── Legend + stats ── */}
      <div style={{
        display: 'flex', gap: 14, padding: '6px 16px', flexWrap: 'wrap',
        background: '#fff', borderBottom: `1px solid ${HNH.line}`,
      }}>
        {LEGEND_KEYS.map(k => {
          const cfg = STATUS_CFG[k]
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: cfg.bg, border: `1.5px solid ${cfg.border}` }} />
              <span style={{ fontSize: 11, color: HNH.ink2, fontWeight: 500 }}>
                {cfg.label}
                {stats[k] > 0 && <span style={{ marginLeft: 3, color: cfg.text, fontWeight: 700 }}>({stats[k]})</span>}
              </span>
            </div>
          )
        })}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: HNH.ink3 }}>
          {rows.length} nhân viên · Bấm ô để xem chi tiết
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 14, color: HNH.ink3 }}>Đang tải dữ liệu...</div>
        </div>
      ) : !data || rows.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, color: HNH.ink3 }}>Không có dữ liệu</div>
          <button onClick={fetchData} style={{ fontSize: 12, color: HNH.navy, background: 'none', border: `1px solid ${HNH.navy}`, borderRadius: 8, padding: '4px 14px', cursor: 'pointer' }}>Tải lại</button>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            width: NAME_COL_W + SUMM_COL_W + DAY_COL_W * data.days.length,
          }}>
            <colgroup>
              <col style={{ width: NAME_COL_W }} />
              <col style={{ width: SUMM_COL_W }} />
              {data.days.map(d => <col key={d.day} style={{ width: DAY_COL_W }} />)}
            </colgroup>

            {/* ── Header ── */}
            <thead>
              <tr>
                {/* Name header */}
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 32,
                  background: HNH.navy,
                  width: NAME_COL_W, minWidth: NAME_COL_W,
                  padding: '8px 10px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600, color: '#c7d7f4',
                  borderRight: '1px solid rgba(255,255,255,0.1)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                  NHÂN VIÊN
                </th>
                {/* Summary header */}
                <th style={{
                  position: 'sticky', left: NAME_COL_W, top: 0, zIndex: 32,
                  background: '#0f2255',
                  width: SUMM_COL_W, minWidth: SUMM_COL_W,
                  padding: '4px 4px', textAlign: 'center',
                  fontSize: 10, fontWeight: 600, color: '#93c5fd',
                  borderRight: '2px solid rgba(255,255,255,0.12)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div>WD · WH</div>
                  <div style={{ color: '#fbbf24', fontSize: 9 }}>OT</div>
                </th>
                {/* Day headers */}
                {data.days.map(dh => {
                  const isToday = isCurrentMonth && dh.day === todayDay
                  return (
                    <th key={dh.day} style={{
                      position: 'sticky', top: 0, zIndex: 20,
                      background: isToday ? '#1e40af' : dh.is_weekend ? '#1e2d4e' : HNH.navy,
                      width: DAY_COL_W, minWidth: DAY_COL_W,
                      padding: '5px 2px', textAlign: 'center',
                      fontSize: 11,
                      color: dh.is_weekend ? '#4b6182' : '#a8bde0',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: isToday ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#93c5fd' : dh.is_weekend ? '#4b6182' : '#e0eaf8' }}>{dh.day}</div>
                      <div style={{ fontSize: 9, letterSpacing: 0.3 }}>{dh.weekday}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody>
              {rows.map((emp, ri) => {
                const rowBg = ri % 2 === 0 ? '#ffffff' : '#f8fafc'

                // Compute summary stats
                let wd = 0, whSec = 0, otSec = 0
                Object.values(emp.days).forEach(cell => {
                  if (cell.status === 'present' || cell.status === 'late') {
                    wd++
                    whSec += cell.at_work_second ?? 0
                    otSec += cell.overtime_second ?? 0
                  }
                })

                return (
                  <tr key={emp.id}>
                    {/* Name cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 10,
                      background: rowBg,
                      padding: '5px 10px',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid #f1f5f9',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: HNH.ink,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {emp.name}
                      </div>
                      <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 1, display: 'flex', gap: 6 }}>
                        {emp.badge_id && <span style={{ fontWeight: 600, color: HNH.navy }}>{emp.badge_id}</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.department}</span>
                      </div>
                    </td>

                    {/* Summary cell */}
                    <td style={{
                      position: 'sticky', left: NAME_COL_W, zIndex: 10,
                      background: rowBg,
                      padding: '4px 4px',
                      borderRight: '2px solid #e2e8f0',
                      borderBottom: '1px solid #f1f5f9',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: HNH.navy }}>{wd}WD</div>
                      <div style={{ fontSize: 10, color: HNH.ink2 }}>{fmtSecs(whSec)}</div>
                      {otSec > 0 && <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>{fmtSecs(otSec)}</div>}
                    </td>

                    {/* Day cells */}
                    {data.days.map(dh => {
                      const cell = emp.days[String(dh.day)]
                      const st = (cell?.status || '') as DayStatus
                      const cfg = STATUS_CFG[st] ?? STATUS_CFG['']
                      const isToday = isCurrentMonth && dh.day === todayDay
                      const isWeekendWork = cell?.is_weekend && (st === 'present' || st === 'late')
                      const clickable = cell && (st === 'present' || st === 'late' || st === 'absent' || st === 'leave' || st === 'unpaid')

                      return (
                        <td
                          key={dh.day}
                          onClick={() => clickable && setCellDetail({ emp, day: dh.day, dh, cell })}
                          style={{
                            background: isToday ? (cfg.bg === '#ffffff' ? '#eff6ff' : cfg.bg) : cfg.bg,
                            borderRight: isWeekendWork ? '1px solid #f59e0b' : '1px solid rgba(0,0,0,0.04)',
                            borderBottom: isToday ? '2px solid #93c5fd' : isWeekendWork ? '2px solid #f59e0b' : '1px solid rgba(0,0,0,0.04)',
                            borderTop: isToday ? '2px solid #93c5fd' : isWeekendWork ? '2px solid #f59e0b' : undefined,
                            padding: '3px 2px',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            height: 46,
                            cursor: clickable ? 'pointer' : 'default',
                          }}
                        >
                          <CellContent cell={cell} cfg={cfg} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cell Detail Modal ── */}
      {cellDetail && (
        <CellDetailModal
          detail={cellDetail}
          month={month}
          year={year}
          onClose={() => setCellDetail(null)}
        />
      )}
    </div>
  )
}

function CellContent({
  cell,
  cfg,
}: {
  cell: DayCell | undefined
  cfg: { text: string; dot: string }
}) {
  if (!cell) return null
  const st = cell.status

  if (st === 'present' || st === 'late') {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text, lineHeight: 1.3 }}>
          {cell.check_in ?? '—'}
        </div>
        <div style={{ fontSize: 10, color: cfg.text, opacity: 0.75, lineHeight: 1.3 }}>
          {cell.check_out ?? '?'}
        </div>
        {st === 'late' && (
          <div style={{
            display: 'inline-block', marginTop: 1,
            fontSize: 8, background: '#fde68a', color: '#92400e',
            borderRadius: 3, padding: '1px 3px', fontWeight: 600,
          }}>
            TG
          </div>
        )}
      </div>
    )
  }

  if (st === 'leave') return <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text }}>NP</div>
  if (st === 'unpaid') return <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text }}>KL</div>
  if (st === 'absent') return <div style={{ fontSize: 14, fontWeight: 800, color: cfg.text }}>V</div>
  if (st === 'weekend') return <div style={{ fontSize: 9, color: cfg.text }}>—</div>

  return null
}

function CellDetailModal({
  detail,
  month,
  year,
  onClose,
}: {
  detail: CellDetailState
  month: number
  year: number
  onClose: () => void
}) {
  const { emp, day, dh, cell } = detail
  const st = cell.status
  const cfg = STATUS_CFG[st] ?? STATUS_CFG['']
  const dateStr = `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
          padding: '20px 20px 32px',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            {st === 'present' ? '✅' : st === 'late' ? '⚠️' : st === 'absent' ? '❌' : st === 'leave' ? '🌿' : st === 'unpaid' ? '⏸️' : '📅'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
              {emp.badge_id && <span style={{ color: HNH.navy, fontWeight: 600 }}>{emp.badge_id} · </span>}
              {dh.weekday} {dateStr}
              {cell.is_weekend && <span style={{ marginLeft: 6, color: '#d97706', fontWeight: 600 }}>· Cuối tuần</span>}
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: cfg.text,
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            borderRadius: 20, padding: '3px 10px',
          }}>
            {cfg.label || st}
          </div>
        </div>

        {/* Detail rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(st === 'present' || st === 'late') && (
            <>
              <DetailRow icon="🕐" label="Giờ vào" value={cell.check_in ?? '—'} />
              <DetailRow icon="🕔" label="Giờ ra" value={cell.check_out ?? '—'} />
              <DetailRow
                icon="⏱️"
                label="Giờ làm việc"
                value={fmtSecs(cell.at_work_second ?? 0)}
                valueColor={HNH.success}
              />
              {(cell.overtime_second ?? 0) > 0 && (
                <DetailRow
                  icon="🔥"
                  label="Giờ tăng ca"
                  value={fmtSecs(cell.overtime_second ?? 0)}
                  valueColor="#d97706"
                />
              )}
            </>
          )}
          {(st === 'leave' || st === 'unpaid') && (
            <DetailRow
              icon="📋"
              label="Loại nghỉ"
              value={cell.leave_name || (st === 'leave' ? 'Nghỉ phép có lương' : 'Nghỉ không lương')}
            />
          )}
          {st === 'absent' && (
            <div style={{
              background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 10,
              padding: '10px 14px', fontSize: 13, color: '#be123c',
            }}>
              Không ghi nhận chấm công ngày này.
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '12px', borderRadius: 12,
            border: 'none', background: HNH.navy, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Đóng
        </button>
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value, valueColor }: {
  icon: string; label: string; value: string; valueColor?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', background: '#f8fafc', borderRadius: 10,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: HNH.ink2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: valueColor ?? HNH.ink }}>{value}</span>
    </div>
  )
}
