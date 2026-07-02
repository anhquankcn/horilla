import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { HNH } from '../lib/theme'
import { PunchList, type ActivityResp } from '../components/AttendanceActivityDetail'
import { roundCong, fmtCong } from '../lib/cong'

type DayStatus = 'present' | 'late' | 'leave' | 'unpaid' | 'absent' | 'nco' | 'weekend' | 'future' | ''

interface DayCell {
  check_in: string | null
  check_out: string | null
  status: DayStatus
  leave_name?: string
  at_work_second?: number
  overtime_second?: number
  is_weekend?: boolean
  cong?: number
}

interface DayHeader {
  day: number
  weekday: string
  is_weekend: boolean
}

interface EmployeeRow {
  id: number
  name: string
  first_name: string
  last_name: string
  badge_id: string
  accounting_code: string
  avatar: string | null
  department: string
  department_id: number | null
  company_id: number | null
  company_name: string
  days: Record<string, DayCell>
  total_cong?: number
}

interface MonthlyData {
  month_label: string
  year: number
  month: number
  days: DayHeader[]
  employees: EmployeeRow[]
}

interface Dept  { id: number; name: string }
interface Company { id: number; name: string }

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
  nco:     { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', dot: '#fb923c', label: 'NCO' },
  weekend: { bg: '#f8fafc', border: 'transparent', text: '#cbd5e1', dot: '#e2e8f0', label: 'Cuối tuần' },
  future:  { bg: '#ffffff', border: '#f1f5f9', text: '#e2e8f0', dot: '#f1f5f9', label: '' },
  '':      { bg: '#ffffff', border: 'transparent', text: '#e2e8f0', dot: '#e2e8f0', label: '' },
}

const LEGEND_KEYS: DayStatus[] = ['present', 'late', 'leave', 'unpaid', 'absent', 'nco']
const NAME_COL_W = 124
const SUMM_COL_W = 80
const DAY_COL_W  = 64

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

// ── Group rows by department ──────────────────────────────────────────────────
type RowItem =
  | { type: 'dept'; dept: string }
  | { type: 'emp'; emp: EmployeeRow; ri: number }

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
    for (const emp of emps) {
      result.push({ type: 'emp', emp, ri: ri++ })
    }
  }
  return result
}

export function MonthlyAttendanceDetailPage() {
  const navigate = useNavigate()
  const now = new Date()
  const todayDay   = now.getDate()
  const todayMonth = now.getMonth() + 1
  const todayYear  = now.getFullYear()

  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [deptId, setDeptId]   = useState<number | null>(null)
  const [search, setSearch]   = useState('')
  const [groupByDept, setGroupByDept] = useState(false)
  const [data, setData]       = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [depts, setDepts]     = useState<Dept[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [cellDetail, setCellDetail] = useState<CellDetailState | null>(null)

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

  // Reset dept when company changes
  useEffect(() => { setDeptId(null) }, [companyId])

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ month: monthStr(year, month) })
    if (companyId) p.set('company_id', String(companyId))
    if (deptId) p.set('department_id', String(deptId))
    api.get<MonthlyData>(`/api/attendance/monthly-detail/?${p}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month, companyId, deptId])

  useEffect(() => { fetchData() }, [fetchData])

  const rows = useMemo(() =>
    (data?.employees ?? []).filter(e =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.badge_id && e.badge_id.toLowerCase().includes(search.toLowerCase())) ||
      (e.accounting_code && e.accounting_code.toLowerCase().includes(search.toLowerCase()))
    ),
  [data, search])

  const rowItems = useMemo<RowItem[]>(() => {
    if (!groupByDept) return rows.map((emp, ri) => ({ type: 'emp' as const, emp, ri }))
    return buildGroupedRows(rows)
  }, [rows, groupByDept])

  const goMonth = (delta: number) => {
    const { year: ny, month: nm } = shiftMonth(year, month, delta)
    setYear(ny); setMonth(nm)
  }

  const stats = LEGEND_KEYS.reduce((acc, k) => { acc[k] = 0; return acc }, {} as Record<string, number>)
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: HNH.ink2, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
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

        {/* Search */}
        <input
          placeholder="Tên / mã NV / mã KT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, border: `1px solid ${HNH.line}`, borderRadius: 8, padding: '5px 10px', width: 128, color: HNH.ink }}
        />
      </div>

      {/* ── Company pills ── */}
      {companies.length > 1 && (
        <div style={{
          background: '#fff', borderBottom: `1px solid ${HNH.line}`,
          padding: '6px 16px', display: 'flex', gap: 6, overflowX: 'auto',
        }}>
          <button
            onClick={() => setCompanyId(null)}
            style={{
              flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
              padding: '0 12px',
              background: companyId === null ? HNH.navy : HNH.cream2,
              color: companyId === null ? '#fff' : HNH.ink2,
              fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            Tất cả công ty
          </button>
          {companies.map(c => (
            <button
              key={c.id}
              onClick={() => setCompanyId(c.id)}
              style={{
                flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                padding: '0 12px', whiteSpace: 'nowrap',
                background: companyId === c.id ? HNH.navy : HNH.cream2,
                color: companyId === c.id ? '#fff' : HNH.ink2,
                fontSize: 11.5, fontWeight: 600,
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Dept pills + Group toggle ── */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        padding: '6px 16px', display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
      }}>
        <button
          onClick={() => setDeptId(null)}
          style={{
            flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
            padding: '0 12px',
            background: deptId === null ? HNH.red : HNH.cream2,
            color: deptId === null ? '#fff' : HNH.ink2,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          Tất cả phòng
        </button>
        {depts.map(d => (
          <button
            key={d.id}
            onClick={() => setDeptId(d.id)}
            style={{
              flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
              padding: '0 12px', whiteSpace: 'nowrap',
              background: deptId === d.id ? HNH.red : HNH.cream2,
              color: deptId === d.id ? '#fff' : HNH.ink2,
              fontSize: 11.5, fontWeight: 600,
            }}
          >
            {d.name}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: 8 }} />

        {/* Group by dept toggle */}
        <button
          onClick={() => setGroupByDept(v => !v)}
          style={{
            flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
            padding: '0 12px', whiteSpace: 'nowrap',
            background: groupByDept ? HNH.gold + '33' : HNH.cream2,
            color: groupByDept ? '#a87908' : HNH.ink3,
            fontSize: 11.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 13 }}>⊞</span>
          Nhóm PB
        </button>
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
                {/* Day headers — weekday + dd/MM */}
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
              {rowItems.map((item) => {
                // Department separator row
                if (item.type === 'dept') {
                  return (
                    <tr key={`dept-${item.dept}`}>
                      <td
                        colSpan={2 + data.days.length}
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

                // Employee row
                const { emp, ri } = item
                const rowBg = ri % 2 === 0 ? '#ffffff' : '#f8fafc'

                let wd = 0, whSec = 0, otSec = 0, totalCong = 0
                Object.values(emp.days).forEach(cell => {
                  if (cell.status === 'present' || cell.status === 'late') {
                    wd++
                    whSec += cell.at_work_second ?? 0
                    otSec += cell.overtime_second ?? 0
                  }
                  // Tổng công = CỘNG các ngày ĐÃ làm tròn (khớp số hiển thị từng ô).
                  if (cell.cong != null) totalCong += roundCong(cell.cong)
                })

                return (
                  <tr key={emp.id}>
                    {/* Name cell — like ShiftManagement */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 10,
                      background: rowBg,
                      padding: '5px 8px',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid #f1f5f9',
                      overflow: 'hidden',
                      verticalAlign: 'middle',
                    }}>
                      {/* Tên — bold */}
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: HNH.ink,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: NAME_COL_W - 16,
                      }}>
                        {emp.first_name || emp.name.split(' ').slice(-1)[0]}
                      </div>
                      {/* Họ đệm — small */}
                      {(emp.last_name || emp.name.split(' ').length > 1) && (
                        <div style={{
                          fontSize: 10, color: HNH.ink3, fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: NAME_COL_W - 16,
                        }}>
                          {emp.last_name || emp.name.split(' ').slice(0, -1).join(' ')}
                        </div>
                      )}
                      {/* Mã NV — smallest */}
                      {emp.badge_id && (
                        <div style={{ fontSize: 9.5, color: HNH.navy, fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
                          {emp.badge_id}
                        </div>
                      )}
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
                      <div style={{ fontSize: 11, fontWeight: 700, color: HNH.navy }}>{fmtCong(totalCong)} công</div>
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
                      const clickable = cell && (st === 'present' || st === 'late' || st === 'absent' || st === 'leave' || st === 'unpaid' || st === 'nco')

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
          onChanged={() => { setCellDetail(null); fetchData() }}
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
    const cong = cell.cong
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text, lineHeight: 1.3 }}>
          {cell.check_in ?? '—'}
        </div>
        <div style={{ fontSize: 10, color: cfg.text, opacity: 0.75, lineHeight: 1.3 }}>
          {cell.check_out ?? '?'}
        </div>
        {cong != null && (
          <div style={{
            display: 'inline-block', marginTop: 1,
            fontSize: 8.5, fontWeight: 800,
            color: roundCong(cong) >= 1 ? '#15803d' : '#c2410c',
            background: roundCong(cong) >= 1 ? '#dcfce7' : '#ffedd5',
            borderRadius: 3, padding: '0px 3px',
          }}>
            {fmtCong(cong)} công
          </div>
        )}
      </div>
    )
  }

  if (st === 'nco') {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cfg.text, lineHeight: 1.3 }}>
          {cell.check_in ?? '—'}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: cfg.text, lineHeight: 1.3 }}>NCO</div>
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
  onChanged,
}: {
  detail: CellDetailState
  month: number
  year: number
  onClose: () => void
  onChanged: () => void
}) {
  const { emp, day, dh, cell } = detail
  const st = cell.status
  const cfg = STATUS_CFG[st] ?? STATUS_CFG['']
  const dateStr = `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`
  const dISOFull = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const [ncoOut, setNcoOut] = useState('')
  const [ncoReason, setNcoReason] = useState('')
  const [ncoBusy, setNcoBusy] = useState(false)

  const [actResp, setActResp] = useState<ActivityResp | null>(null)
  const [loadingActs, setLoadingActs] = useState(false)
  useEffect(() => {
    if (st !== 'present' && st !== 'late' && st !== 'absent' && st !== 'nco') return
    const dISO = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    setLoadingActs(true)
    api.get<ActivityResp>(`/api/attendance/activity-detail/?employee_id=${emp.id}&date=${dISO}`)
      .then(setActResp)
      .catch(() => setActResp(null))
      .finally(() => setLoadingActs(false))
  }, [emp.id, day, month, year, st])

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
          padding: '20px 20px calc(32px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            {st === 'present' ? '✅' : st === 'late' ? '⚠️' : st === 'nco' ? '🟠' : st === 'absent' ? '❌' : st === 'leave' ? '🌿' : st === 'unpaid' ? '⏸️' : '📅'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
              {emp.badge_id && <span style={{ color: HNH.navy, fontWeight: 600 }}>{emp.badge_id} · </span>}
              {emp.accounting_code && <span style={{ color: HNH.ink3, fontWeight: 600 }}>KT {emp.accounting_code} · </span>}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(st === 'present' || st === 'late') && (
            <>
              <DetailRow icon="🕐" label="Giờ vào" value={cell.check_in ?? '—'} />
              <DetailRow icon="🕔" label="Giờ ra" value={cell.check_out ?? '—'} />
              <DetailRow icon="⏱️" label="Giờ làm việc" value={fmtSecs(cell.at_work_second ?? 0)} valueColor={HNH.success} />
              {cell.cong != null && (
                <DetailRow icon="📊" label="Công ngày" value={`${fmtCong(cell.cong)} (tối thiểu 9h35 = 1.0)`} valueColor={roundCong(cell.cong) >= 1 ? HNH.success : '#c2410c'} />
              )}
              {(cell.overtime_second ?? 0) > 0 && (
                <DetailRow icon="🔥" label="Giờ tăng ca" value={fmtSecs(cell.overtime_second ?? 0)} valueColor="#d97706" />
              )}
            </>
          )}
          {(st === 'leave' || st === 'unpaid') && (
            <DetailRow icon="📋" label="Loại nghỉ" value={cell.leave_name || (st === 'leave' ? 'Nghỉ phép có lương' : 'Nghỉ không lương')} />
          )}
          {st === 'absent' && (
            <div style={{
              background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 10,
              padding: '10px 14px', fontSize: 13, color: '#be123c',
            }}>
              Không ghi nhận chấm công ngày này.
            </div>
          )}
          {st === 'nco' && (
            <div style={{
              background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, color: '#c2410c',
            }}>
              <div><b>NCO — Quên chấm công ra (No Clock Out).</b> Có giờ vào nhưng không có giờ ra.</div>
              {actResp?.nco_pending ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: HNH.ink2 }}>Đã khai báo giờ ra: <b>{actResp.nco_declared_clock_out}</b></div>
                  {actResp.nco_reason && <div style={{ color: HNH.ink3, fontSize: 12, marginTop: 2 }}>Lý do: {actResp.nco_reason}</div>}
                  <button
                    disabled={ncoBusy}
                    onClick={async () => {
                      setNcoBusy(true)
                      try { await api.post('/api/attendance/nco/approve/', { employee_id: emp.id, date: dISOFull }); onChanged() }
                      catch { setNcoBusy(false) }
                    }}
                    style={{ marginTop: 8, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: HNH.success, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >Duyệt khai báo (C&B)</button>
                </div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ color: HNH.ink2 }}>Khai báo giờ ra cho ngày này:</div>
                  <input type="time" value={ncoOut} onChange={e => setNcoOut(e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 14 }} />
                  <textarea placeholder="Lý do (vd: quên chấm công ra)" value={ncoReason} onChange={e => setNcoReason(e.target.value)} rows={2}
                    style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, resize: 'vertical' }} />
                  <button
                    disabled={ncoBusy || !ncoOut || !ncoReason.trim()}
                    onClick={async () => {
                      setNcoBusy(true)
                      try { await api.post('/api/attendance/nco/declare/', { employee_id: emp.id, date: dISOFull, clock_out: ncoOut, reason: ncoReason.trim() }); onChanged() }
                      catch { setNcoBusy(false) }
                    }}
                    style={{ marginTop: 2, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: (ncoOut && ncoReason.trim()) ? HNH.navy : HNH.ink4, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >Khai báo NCO</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lượt chấm công — từng lượt: Trong/Ngoài VP, văn phòng, lý do, địa điểm, ảnh */}
        {(st === 'present' || st === 'late' || st === 'absent' || st === 'nco') && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 8 }}>
              Lượt chấm công
            </div>
            <PunchList resp={actResp} loading={loadingActs} isPast={dISOFull < new Date().toISOString().slice(0, 10)} />
          </div>
        )}

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

