import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { HNH } from '../lib/theme'
import { PunchSourceBadge, type PunchSource } from '../components/PunchSourceBadge'

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

interface PunchEvent {
  time: string
  type: 'in' | 'out'
  source?: PunchSource   // nguồn chấm: biometric (máy) vs app
}

interface PunchDetail {
  employee_id: number
  employee_name: string
  badge_id: string
  date: string
  punches: PunchEvent[]
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

// ── Punch Detail Modal ────────────────────────────────────────────────────────

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

  const [detail, setDetail] = useState<PunchDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<PunchDetail>(`/api/attendance/manager-punch-detail/?employee_id=${emp.id}&date=${dateISO}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [emp.id, dateISO])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, maxHeight: '75vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${HNH.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: HNH.ink }}>{emp.first_name} {emp.last_name}</div>
              <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>
                {emp.badge_id && <span>{emp.badge_id} · </span>}
                {dateLabel} · {emp.department}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: HNH.ink3, lineHeight: 1, padding: '0 4px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Punch list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: HNH.ink3, padding: 24 }}>Đang tải...</div>
          ) : !detail || detail.punches.length === 0 ? (
            <div style={{ textAlign: 'center', color: HNH.ink3, padding: 24 }}>Không có lượt chấm nào</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.punches.map((p, i) => {
                // Ca 24h (ALD26): lượt đầu tiên → các lượt tiếp theo, không vào/ra cứng.
                const isFirst = i === 0
                const c = isFirst
                  ? { bg: '#f0fdf4', bd: '#bbf7d0', icon: '#dcfce7', fg: '#15803d' }
                  : { bg: HNH.navy50, bd: '#c7d2fe', icon: '#e0e7ff', fg: HNH.navy }
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: c.bg,
                    border: `1px solid ${c.bd}`,
                    borderRadius: 10, padding: '10px 16px',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: c.icon,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {isFirst ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M12 19V5M5 12l7-7 7 7" stroke={c.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill={c.fg}/></svg>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c.fg, letterSpacing: 0.5 }}>
                        {p.time}
                      </div>
                      <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
                        Lượt {i + 1} · {isFirst ? 'Lần đầu' : 'Lần tiếp theo'}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <PunchSourceBadge source={p.source} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
