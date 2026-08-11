import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { HNH } from '../lib/theme'
import { PunchList, type ActivityResp } from '../components/AttendanceActivityDetail'
import { roundCong, fmtCong } from '../lib/cong'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayHeader {
  day: number
  weekday: string
  is_weekend: boolean
}

interface DayCell {
  first_in: string | null
  last_out: string | null
  punch_count: number
  is_weekend: boolean
  is_future: boolean
}

interface EmployeeRow {
  id: number
  name: string
  first_name: string
  last_name: string
  badge_id: string
  employee_code: string
  accounting_code: string
  avatar: string | null
  department: string
  department_id: number | null
  company_id: number | null
  company_name: string
  days: Record<string, DayCell>
}

interface MatrixData {
  year: number
  month: number
  days: DayHeader[]
  employees: EmployeeRow[]
}

// Tóm tắt ngày (khớp CC Tháng): status + giờ làm + công + tăng ca + loại nghỉ.
interface DaySummary {
  status: string
  check_in: string | null
  check_out: string | null
  at_work_second?: number
  overtime_second?: number
  cong?: number
  leave_name?: string
  is_weekend?: boolean
}

// Response manager-punch-detail (đầy đủ như C&B): summary + activities + NCO.
interface DetailResp extends ActivityResp {
  summary: DaySummary
}

interface Dept    { id: number; name: string }
interface Company { id: number; name: string }

interface CellSel { emp: EmployeeRow; dayNum: number; cell: DayCell }

// ── Layout constants ───────────────────────────────────────────────────────────
const NAME_COL_W = 148
const DAY_COL_W  = 52

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthStr(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`
}
function shiftMonth(y: number, m: number, delta: number) {
  let nm = m + delta, ny = y
  while (nm > 12) { nm -= 12; ny++ }
  while (nm < 1)  { nm += 12; ny-- }
  return { year: ny, month: nm }
}

type RowItem = { type: 'dept'; dept: string } | { type: 'emp'; emp: EmployeeRow; ri: number }

function buildGroupedRows(rows: EmployeeRow[]): RowItem[] {
  const byDept: Record<string, EmployeeRow[]> = {}
  for (const e of rows) {
    const key = e.department || 'Không có phòng ban'
    if (!byDept[key]) byDept[key] = []
    byDept[key].push(e)
  }
  const result: RowItem[] = []
  let ri = 0
  for (const [dept, emps] of Object.entries(byDept).sort(([a], [b]) => a.localeCompare(b, 'vi'))) {
    result.push({ type: 'dept', dept })
    for (const emp of emps) result.push({ type: 'emp', emp, ri: ri++ })
  }
  return result
}

// ── Cell appearance ───────────────────────────────────────────────────────────

function cellStyle(cell: DayCell | undefined, isToday: boolean): React.CSSProperties {
  if (!cell) return { background: '#ffffff', borderRight: '1px solid rgba(0,0,0,0.04)', borderBottom: '1px solid rgba(0,0,0,0.04)' }
  if (cell.is_future) return { background: '#ffffff', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }
  if (cell.is_weekend && !cell.first_in) return { background: '#f8fafc', borderRight: '1px solid rgba(0,0,0,0.04)', borderBottom: '1px solid rgba(0,0,0,0.04)' }

  let bg = '#ffffff'
  let border = 'rgba(0,0,0,0.04)'
  if (cell.first_in && cell.last_out) {
    bg = '#f0fdf4'; border = '#bbf7d0'
  } else if (cell.first_in && !cell.last_out) {
    bg = '#fff7ed'; border = '#fdba74'
  } else if (!cell.first_in && !cell.is_weekend && !cell.is_future) {
    bg = '#fff8f8'; border = 'rgba(0,0,0,0.04)'
  }

  return {
    background: isToday ? (bg === '#ffffff' ? '#eff6ff' : bg) : bg,
    borderRight: `1px solid ${border}`,
    borderBottom: isToday ? '2px solid #93c5fd' : `1px solid ${border}`,
    borderTop: isToday ? '2px solid #93c5fd' : undefined,
    cursor: cell.first_in ? 'pointer' : 'default',
  }
}

function CellContent({ cell }: { cell: DayCell | undefined }) {
  if (!cell || cell.is_future) return null
  if (cell.is_weekend && !cell.first_in) {
    return <span style={{ fontSize: 9, color: '#cbd5e1' }}>—</span>
  }
  if (!cell.first_in) {
    return <span style={{ fontSize: 10, color: '#fca5a5', fontWeight: 700 }}>V</span>
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', lineHeight: 1.35 }}>
        {cell.first_in}
      </div>
      <div style={{ fontSize: 10, color: cell.last_out ? '#166534' : '#c2410c', lineHeight: 1.35, fontWeight: cell.last_out ? 500 : 700 }}>
        {cell.last_out ?? 'NCO'}
      </div>
      {cell.punch_count > 2 && (
        <div style={{ fontSize: 8, color: '#6b7280', lineHeight: 1 }}>
          {cell.punch_count} lượt
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AttendanceManagerViewPage() {
  const navigate = useNavigate()
  const now = new Date()
  const todayDay   = now.getDate()
  const todayMonth = now.getMonth() + 1
  const todayYear  = now.getFullYear()

  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [deptId, setDeptId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [data, setData]     = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(false)
  const [depts, setDepts]   = useState<Dept[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [cellSel, setCellSel] = useState<CellSel | null>(null)

  useEffect(() => {
    Promise.allSettled([
      api.get<{ id: number; name: string }[]>('/api/employee/departments/'),
      api.get<{ id: number; name: string }[]>('/api/employee/companies/'),
    ]).then(([deptsRes, compsRes]) => {
      if (deptsRes.status === 'fulfilled') {
        const arr = Array.isArray(deptsRes.value) ? deptsRes.value : []
        setDepts(arr.map(d => ({ id: d.id, name: (d as any).department ?? d.name })))
      }
      if (compsRes.status === 'fulfilled') {
        const arr = Array.isArray(compsRes.value) ? compsRes.value : []
        setCompanies(arr.map(c => ({ id: c.id, name: (c as any).company ?? c.name })))
      }
    })
  }, [])

  useEffect(() => { setDeptId(null) }, [companyId])

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ month: monthStr(year, month) })
    if (companyId) p.set('company_id', String(companyId))
    if (deptId)    p.set('department_id', String(deptId))
    api.get<MatrixData>(`/api/attendance/manager-punch-matrix/?${p}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month, companyId, deptId])

  useEffect(() => { fetchData() }, [fetchData])

  const rows = useMemo(() =>
    (data?.employees ?? []).filter(e =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.badge_id        && e.badge_id.toLowerCase().includes(search.toLowerCase())) ||
      (e.employee_code   && e.employee_code.toLowerCase().includes(search.toLowerCase())) ||
      (e.accounting_code && e.accounting_code.toLowerCase().includes(search.toLowerCase()))
    ),
  [data, search])

  const rowItems = useMemo<RowItem[]>(() => buildGroupedRows(rows), [rows])

  const goMonth = (delta: number) => {
    const { year: ny, month: nm } = shiftMonth(year, month, delta)
    setYear(ny); setMonth(nm)
  }

  const isCurrentMonth = year === todayYear && month === todayMonth

  const pill = (active: boolean, onClick: () => void, label: string, color: string) => (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
        padding: '0 12px', whiteSpace: 'nowrap',
        background: active ? color : HNH.cream2,
        color: active ? '#fff' : HNH.ink2,
        fontSize: 11.5, fontWeight: 600,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>

      {/* ── Toolbar ── */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, color: HNH.ink, flex: 1, minWidth: 100 }}>
          Quản lý Công NV
        </span>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 8, padding: '4px 10px' }}>
          <button onClick={() => goMonth(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, minWidth: 104, textAlign: 'center' }}>
            Tháng {month}/{year}
          </span>
          <button onClick={() => goMonth(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>›</button>
        </div>

        {/* Search */}
        <input
          placeholder="Tên / mã NV / mã KT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, border: `1px solid ${HNH.line}`, borderRadius: 8, padding: '5px 10px', width: 152, color: HNH.ink }}
        />
      </div>

      {/* ── Company pills ── */}
      {companies.length > 1 && (
        <div style={{
          background: '#fff', borderBottom: `1px solid ${HNH.line}`,
          padding: '6px 16px', display: 'flex', gap: 6, overflowX: 'auto',
        }}>
          {pill(companyId === null, () => setCompanyId(null), 'Tất cả công ty', HNH.navy)}
          {companies.map(c => pill(companyId === c.id, () => setCompanyId(c.id), c.name, HNH.navy))}
        </div>
      )}

      {/* ── Dept pills ── */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        padding: '6px 16px', display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
      }}>
        {pill(deptId === null, () => setDeptId(null), 'Tất cả phòng', HNH.red)}
        {depts.map(d => pill(deptId === d.id, () => setDeptId(d.id), d.name, HNH.red))}
      </div>

      {/* ── Info bar ── */}
      <div style={{
        display: 'flex', gap: 14, padding: '5px 16px', flexWrap: 'wrap',
        background: '#fff', borderBottom: `1px solid ${HNH.line}`, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f0fdf4', border: '1.5px solid #86efac' }} />
          <span style={{ fontSize: 11, color: HNH.ink2 }}>Đủ vào/ra</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#fff7ed', border: '1.5px solid #fdba74' }} />
          <span style={{ fontSize: 11, color: HNH.ink2 }}>NCO (chưa ra)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5' }}>V</span>
          <span style={{ fontSize: 11, color: HNH.ink2 }}>Vắng</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: HNH.ink3 }}>
          {rows.length} nhân viên · Bấm ô để xem chi tiết lượt chấm
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 14, color: HNH.ink3 }}>Đang tải dữ liệu...</div>
        </div>
      ) : !data || rows.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, color: HNH.ink3 }}>
            {!data ? 'Không có dữ liệu' : 'Không có nhân viên nào trong danh sách quản lý'}
          </div>
          <button onClick={fetchData} style={{ fontSize: 12, color: HNH.navy, background: 'none', border: `1px solid ${HNH.navy}`, borderRadius: 8, padding: '4px 14px', cursor: 'pointer' }}>Tải lại</button>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            width: NAME_COL_W + DAY_COL_W * data.days.length,
          }}>
            <colgroup>
              <col style={{ width: NAME_COL_W }} />
              {data.days.map(d => <col key={d.day} style={{ width: DAY_COL_W }} />)}
            </colgroup>

            {/* ── Header ── */}
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 32,
                  background: HNH.navy, width: NAME_COL_W, minWidth: NAME_COL_W,
                  padding: '8px 10px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600, color: '#c7d7f4',
                  borderRight: '1px solid rgba(255,255,255,0.1)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                  NHÂN VIÊN
                </th>
                {data.days.map(dh => {
                  const isToday = isCurrentMonth && dh.day === todayDay
                  const ddMM = `${String(dh.day).padStart(2,'0')}/${String(month).padStart(2,'0')}`
                  return (
                    <th key={dh.day} style={{
                      position: 'sticky', top: 0, zIndex: 20,
                      background: isToday ? '#1e40af' : dh.is_weekend ? '#1e2d4e' : HNH.navy,
                      width: DAY_COL_W, minWidth: DAY_COL_W,
                      padding: '4px 2px', textAlign: 'center',
                      color: dh.is_weekend ? '#4b6182' : '#a8bde0',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: isToday ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#93c5fd' : dh.is_weekend ? '#4b6182' : '#e0eaf8' }}>
                        {dh.weekday}
                      </div>
                      <div style={{ fontSize: 9, letterSpacing: 0.2, color: isToday ? '#93c5fd' : dh.is_weekend ? '#3d5070' : '#7a99c4' }}>
                        {ddMM}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody>
              {rowItems.map(item => {
                if (item.type === 'dept') {
                  return (
                    <tr key={`dept-${item.dept}`}>
                      <td
                        colSpan={1 + data.days.length}
                        style={{
                          position: 'sticky', left: 0,
                          background: HNH.navy + '18',
                          padding: '5px 12px',
                          fontSize: 11, fontWeight: 700, color: HNH.navy,
                          borderBottom: `1px solid ${HNH.navy}22`,
                          letterSpacing: 0.3,
                        }}
                      >
                        {item.dept}
                      </td>
                    </tr>
                  )
                }

                const { emp, ri } = item
                const rowBg = ri % 2 === 0 ? '#ffffff' : '#f8fafc'

                return (
                  <tr key={emp.id}>
                    {/* Name cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 10,
                      background: rowBg,
                      padding: '5px 8px',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid #f1f5f9',
                      overflow: 'hidden', verticalAlign: 'middle',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: NAME_COL_W - 16 }}>
                        {emp.first_name || emp.name.split(' ').slice(-1)[0]}
                      </div>
                      {(emp.last_name || emp.name.split(' ').length > 1) && (
                        <div style={{ fontSize: 10, color: HNH.ink3, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: NAME_COL_W - 16 }}>
                          {emp.last_name || emp.name.split(' ').slice(0, -1).join(' ')}
                        </div>
                      )}
                      {emp.badge_id && (
                        <div style={{ fontSize: 9.5, color: HNH.navy, fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
                          {emp.badge_id}{emp.accounting_code ? ` · ${emp.accounting_code}` : ''}
                        </div>
                      )}
                    </td>

                    {/* Day cells */}
                    {data.days.map(dh => {
                      const cell = emp.days[String(dh.day)]
                      const isToday = isCurrentMonth && dh.day === todayDay
                      const clickable = cell?.first_in != null

                      return (
                        <td
                          key={dh.day}
                          onClick={() => clickable && setCellSel({ emp, dayNum: dh.day, cell })}
                          style={{
                            ...cellStyle(cell, isToday),
                            padding: '3px 2px',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            height: 46,
                          }}
                        >
                          <CellContent cell={cell} />
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

      {/* ── Punch Detail Modal ── */}
      {cellSel && (
        <PunchDetailModal
          emp={cellSel.emp}
          dayNum={cellSel.dayNum}
          year={year}
          month={month}
          onClose={() => setCellSel(null)}
        />
      )}
    </div>
  )
}

// ── Detail Modal (đầy đủ như C&B ở CC Tháng) — hiển thị GIỮA màn hình ────────────

const STATUS_CFG: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
  present: { bg: '#dcfce7', border: '#86efac', text: '#15803d', label: 'Đủ công', icon: '✅' },
  late:    { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', label: 'Thiếu giờ', icon: '⚠️' },
  leave:   { bg: '#fefce8', border: '#fde047', text: '#92400e', label: 'Nghỉ phép', icon: '🌿' },
  unpaid:  { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280', label: 'K. lương', icon: '⏸️' },
  absent:  { bg: '#fff1f2', border: '#fca5a5', text: '#be123c', label: 'Vắng mặt', icon: '❌' },
  nco:     { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', label: 'NCO', icon: '🟠' },
  weekend: { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8', label: 'Cuối tuần', icon: '📅' },
  '':      { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8', label: '', icon: '📅' },
}

function fmtSecs(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${h}h${m > 0 ? ` ${m}p` : ''}`
}

function DetailRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 10 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: HNH.ink3, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: valueColor ?? HNH.ink }}>{value}</span>
    </div>
  )
}

function PunchDetailModal({
  emp, dayNum, year, month, onClose,
}: {
  emp: EmployeeRow
  dayNum: number
  year: number
  month: number
  onClose: () => void
}) {
  const dateISO = `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`
  const dateLabel = `${String(dayNum).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`
  const weekday = ['CN','T2','T3','T4','T5','T6','T7'][new Date(year, month - 1, dayNum).getDay()]
  const isPast = dateISO < new Date().toISOString().slice(0, 10)

  const [resp, setResp] = useState<DetailResp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<DetailResp>(`/api/attendance/manager-punch-detail/?employee_id=${emp.id}&date=${dateISO}`)
      .then(setResp)
      .catch(() => setResp(null))
      .finally(() => setLoading(false))
  }, [emp.id, dateISO])

  const sm = resp?.summary
  const st = sm?.status ?? ''
  const cfg = STATUS_CFG[st] ?? STATUS_CFG['']

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480,
          maxHeight: '85vh', overflowY: 'auto', padding: 20,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: cfg.bg, border: `1.5px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            {cfg.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
              {emp.badge_id && <span style={{ color: HNH.navy, fontWeight: 600 }}>{emp.badge_id} · </span>}
              {emp.accounting_code && <span style={{ fontWeight: 600 }}>KT {emp.accounting_code} · </span>}
              {weekday} {dateLabel}{emp.department ? ` · ${emp.department}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '3px 10px' }}>
            {cfg.label || st}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: HNH.ink3, padding: 24 }}>Đang tải…</div>
        ) : (
          <>
            {/* Tóm tắt ngày */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(st === 'present' || st === 'late' || st === 'nco') && (
                <>
                  <DetailRow icon="🕐" label="Giờ vào" value={sm?.check_in ?? '—'} />
                  <DetailRow icon="🕔" label="Giờ ra" value={sm?.check_out ?? (st === 'nco' ? 'Chưa chấm ra' : '—')} valueColor={st === 'nco' ? '#c2410c' : undefined} />
                  {sm?.at_work_second != null && <DetailRow icon="⏱️" label="Giờ làm việc" value={fmtSecs(sm.at_work_second)} valueColor={HNH.success} />}
                  {sm?.cong != null && <DetailRow icon="📊" label="Công ngày" value={`${fmtCong(sm.cong)} (9h35 = 1.0)`} valueColor={roundCong(sm.cong) >= 1 ? HNH.success : '#c2410c'} />}
                  {(sm?.overtime_second ?? 0) > 0 && <DetailRow icon="🔥" label="Tăng ca" value={fmtSecs(sm!.overtime_second!)} valueColor="#d97706" />}
                </>
              )}
              {(st === 'leave' || st === 'unpaid') && (
                <DetailRow icon="📋" label="Loại nghỉ" value={sm?.leave_name || (st === 'leave' ? 'Nghỉ phép có lương' : 'Nghỉ không lương')} />
              )}
              {st === 'absent' && (
                <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#be123c' }}>
                  Không ghi nhận chấm công ngày này.
                </div>
              )}
              {st === 'nco' && (
                <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#c2410c' }}>
                  <b>NCO — Quên chấm công ra.</b> Có giờ vào nhưng chưa có giờ ra.
                  {resp?.nco_pending && <div style={{ marginTop: 6, color: HNH.ink2 }}>Đã khai báo giờ ra: <b>{resp.nco_declared_clock_out}</b>{resp.nco_reason ? ` · ${resp.nco_reason}` : ''} (chờ C&B duyệt)</div>}
                </div>
              )}
            </div>

            {/* Lượt chấm công — VP/địa điểm/ảnh/lý do/nguồn (đầy đủ như C&B) */}
            {(st === 'present' || st === 'late' || st === 'nco' || st === 'absent') && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 8 }}>Lượt chấm công</div>
                <PunchList resp={resp} loading={false} isPast={isPast} />
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          style={{ marginTop: 20, width: '100%', padding: 12, borderRadius: 12, border: 'none', background: HNH.navy, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Đóng
        </button>
      </div>
    </div>
  )
}
