import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Shift {
  id: number
  name: string
  weekly_full_time: string
  department_ids: number[]
  schedules: {
    id: number
    day: string
    start_time: string | null
    end_time: string | null
    is_night_shift: boolean
    is_auto_punch_in_enabled: boolean
    auto_punch_in_time: string | null
    is_auto_punch_out_enabled: boolean
    auto_punch_out_time: string | null
    require_gps_on_auto_clockin: boolean
    require_gps_on_auto_clockout: boolean
  }[]
}

interface Company {
  id: number
  name: string
}

interface Dept {
  id: number
  name: string
  company_ids: number[]
  shift_ids: number[]
}

interface Emp {
  id: number
  name: string
  first_name: string
  last_name: string
  badge_id: string
  department_id: number | null
  department_name: string
  company_id: number | null
  company_name: string
  shift_id: number | null
  shift_name: string
  avatar: string | null
}

interface ShiftPlan {
  id: number
  employee_id: number
  shift_id: number
  shift_name: string
  date: string
  start_time: string  // HH:MM for sorting
}

type Scope = 'cnb' | 'manager' | 'none'

const DAY_VI: Record<string, string> = {
  monday: 'T2', tuesday: 'T3', wednesday: 'T4',
  thursday: 'T5', friday: 'T6', saturday: 'T7', sunday: 'CN',
}

const SHIFT_COLORS = ['#1e3a5f', '#7c3aed', '#0d7c66', '#c27803', '#c0222b', '#0284c7']

function shiftColor(shiftId: number): string {
  return SHIFT_COLORS[shiftId % SHIFT_COLORS.length]
}

function abbrevShift(name: string): string {
  const stripped = name.replace(/^[Cc]a\s+/u, '').trim()
  const words = stripped.split(/\s+/)
  const twoWords = words.slice(0, 2).join(' ')
  return twoWords.length > 10 ? twoWords.slice(0, 9) + '…' : twoWords
}

function fmtDMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextMonday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isoDay = (today.getDay() + 6) % 7  // Mon=0 … Sun=6
  const daysAhead = 7 - isoDay             // Mon→7, Tue→6, …, Sun→1
  const nm = new Date(today)
  nm.setDate(today.getDate() + daysAhead)
  return nm
}

function buildGridDates(): Date[] {
  const mon = nextMonday()
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

const GRID_DATES = buildGridDates()
const GRID_FROM = toIso(GRID_DATES[0])
const GRID_TO = toIso(GRID_DATES[13])

// ── ShiftCard (SetupTab) ───────────────────────────────────────────────────────

function ShiftCard({ shift, depts, isCnb, onToggleDept, onRefresh }: {
  shift: Shift; depts: Dept[]; isCnb: boolean
  onToggleDept: (shiftId: number, deptId: number, add: boolean, applyFrom?: string) => void
  onRefresh: () => void
}) {
  const assigned = depts.filter(d => shift.department_ids.includes(d.id))
  const unassigned = depts.filter(d => !shift.department_ids.includes(d.id))
  const [expanded, setExpanded] = useState(false)

  const workDays = shift.schedules
    .filter(s => s.start_time)
    .map(s => DAY_VI[s.day.toLowerCase()] ?? s.day)
    .join(' · ')

  const firstSched = shift.schedules.find(s => s.start_time)
  const timeStr = firstSched
    ? `${firstSched.start_time} – ${firstSched.end_time}`
    : 'Linh hoạt'

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
      overflow: 'hidden', marginBottom: 10,
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
        style={{ padding: '14px 16px', background: 'transparent' }}
      >
        <div style={{
          width: 42, height: 42, borderRadius: 12, background: HNH.navy,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="clock" size={20} color="#fff" stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{shift.name}</div>
          <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>{timeStr} · {workDays || 'Chưa có lịch'}</div>
        </div>
        <div className="flex items-center gap-2">
          {assigned.length > 0 && (
            <Badge tone="navy" size="s">{assigned.length} phòng</Badge>
          )}
          <Icon name={expanded ? 'chev-u' : 'chev-d'} size={14} color={HNH.ink3} stroke={2} />
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${HNH.line}`, padding: '12px 16px' }}>
          {assigned.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                Phòng ban đang dùng
              </div>
              <div className="flex flex-wrap gap-2">
                {assigned.map(d => (
                  <div key={d.id} className="flex items-center gap-1.5" style={{
                    background: HNH.navy, borderRadius: 8, padding: '4px 10px',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{d.name}</span>
                    {isCnb && (
                      <button
                        onClick={() => onToggleDept(shift.id, d.id, false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      >
                        <Icon name="x" size={12} color="rgba(255,255,255,0.7)" stroke={2.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isCnb && unassigned.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                Thêm phòng ban
              </div>
              <div className="flex flex-wrap gap-2">
                {unassigned.map(d => (
                  <button
                    key={d.id}
                    onClick={() => onToggleDept(shift.id, d.id, true)}
                    className="flex items-center gap-1 border-none cursor-pointer"
                    style={{
                      background: HNH.cream2, borderRadius: 8, padding: '4px 10px',
                      border: `1.5px dashed ${HNH.line}`,
                    }}
                  >
                    <Icon name="plus" size={11} color={HNH.ink3} stroke={2.5} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2 }}>{d.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isCnb && assigned.length === 0 && (
            <div style={{ fontSize: 12, color: HNH.ink3 }}>Ca này chưa được gán cho phòng nào.</div>
          )}

          {/* Cấu hình tự động — toggles (C&B only) */}
          {shift.schedules.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${HNH.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Cấu hình tự động
              </div>
              {shift.schedules.filter(s => s.start_time).slice(0, 1).map(sch => {
                const toggle = async (field: string, value: boolean) => {
                  await fetch(`/bff/api/employee/shift-mgmt/schedule/${sch.id}/auto/`, {
                    method: 'PATCH', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [field]: value }),
                  })
                  onRefresh()
                }
                const sw = (label: string, field: string, enabled: boolean, extra?: string) => (
                  <div className="flex items-center justify-between" key={field}>
                    <span style={{ fontSize: 12, color: HNH.ink2 }}>{label}</span>
                    <div className="flex items-center gap-2">
                      {extra && enabled && <span style={{ fontSize: 10, color: HNH.ink3 }}>{extra}</span>}
                      {isCnb ? (
                        <button onClick={() => toggle(field, !enabled)} style={{
                          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: enabled ? HNH.success : HNH.ink4,
                          position: 'relative', transition: 'background 0.2s',
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 9, background: '#fff',
                            position: 'absolute', top: 2,
                            left: enabled ? 20 : 2, transition: 'left 0.2s',
                          }} />
                        </button>
                      ) : (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: enabled ? HNH.success50 : HNH.cream2,
                          color: enabled ? HNH.success : HNH.ink3,
                        }}>
                          {enabled ? 'ON' : 'OFF'}
                        </span>
                      )}
                    </div>
                  </div>
                )
                return (
                  <div key={sch.id} className="flex flex-col gap-3">
                    {sw('Tự động Clock In', 'is_auto_punch_in_enabled', sch.is_auto_punch_in_enabled, sch.auto_punch_in_time || sch.start_time || undefined)}
                    {sw('Tự động Clock Out', 'is_auto_punch_out_enabled', sch.is_auto_punch_out_enabled, sch.auto_punch_out_time || sch.end_time || undefined)}
                    {sw('GPS khi auto Clock In', 'require_gps_on_auto_clockin', sch.require_gps_on_auto_clockin)}
                    {sw('GPS khi auto Clock Out', 'require_gps_on_auto_clockout', sch.require_gps_on_auto_clockout)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Setup Tab ─────────────────────────────────────────────────────────────────

function SetupTab({ shifts, depts, onToggleDept, isCnb, onRefresh }: {
  shifts: Shift[]; depts: Dept[]; isCnb: boolean
  onToggleDept: (shiftId: number, deptId: number, add: boolean, applyFrom?: string) => void
  onRefresh: () => void
}) {
  return (
    <div style={{ padding: '0 16px 80px' }}>
      <div style={{ paddingTop: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: HNH.ink3, marginBottom: 12 }}>
          {isCnb
            ? 'Gán ca làm việc cho từng phòng ban. Nhấn vào ca để xem và chỉnh sửa.'
            : 'Danh sách ca làm việc và phòng ban sử dụng.'}
        </div>
      </div>
      {shifts.length === 0 && (
        <div style={{ textAlign: 'center', color: HNH.ink3, padding: '40px 0' }}>
          Chưa có ca làm việc nào.
        </div>
      )}
      {shifts.map(s => (
        <ShiftCard key={s.id} shift={s} depts={depts} isCnb={isCnb} onToggleDept={onToggleDept} onRefresh={onRefresh} />
      ))}
    </div>
  )
}

// ── Shift Picker Sheet ─────────────────────────────────────────────────────────

interface ActiveCell {
  empId: number
  empName: string
  date: string       // YYYY-MM-DD
  dateLabel: string  // e.g. "T2 06/06"
}

function ShiftPickerSheet({ cell, availableShifts, cellPlans, onAdd, onRemove, onClose }: {
  cell: ActiveCell
  availableShifts: Shift[]
  cellPlans: ShiftPlan[]
  onAdd: (empId: number, shiftId: number, date: string) => Promise<void>
  onRemove: (planId: number) => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const assignedIds = new Set(cellPlans.map(p => p.shift_id))
  const canAdd = cellPlans.length < 3

  const handleAdd = async (shiftId: number) => {
    setBusy(shiftId)
    try { await onAdd(cell.empId, shiftId, cell.date) } finally { setBusy(null) }
  }

  const handleRemove = async (planId: number) => {
    setBusy(-planId)
    try { await onRemove(planId) } finally { setBusy(null) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(15,20,40,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 40px', maxHeight: '80dvh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Phân ca</div>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer">
            <Icon name="close" size={20} color={HNH.ink3} />
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: HNH.ink3, marginBottom: 16 }}>
          {cell.empName} · {cell.dateLabel}
        </div>

        {/* Currently assigned */}
        {cellPlans.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Đã phân ({cellPlans.length}/3)
            </div>
            {cellPlans.map(p => (
              <div key={p.id} className="flex items-center justify-between" style={{
                background: shiftColor(p.shift_id) + '18',
                border: `1px solid ${shiftColor(p.shift_id)}44`,
                borderRadius: 10, padding: '9px 12px', marginBottom: 6,
              }}>
                <div className="flex items-center gap-2">
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: shiftColor(p.shift_id), flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{p.shift_name}</span>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>{p.start_time}</span>
                </div>
                <button
                  onClick={() => handleRemove(p.id)}
                  disabled={busy === -p.id}
                  className="border-none cursor-pointer flex items-center gap-1"
                  style={{ background: HNH.red50, borderRadius: 7, padding: '4px 8px' }}
                >
                  <Icon name="x" size={12} color={HNH.red} stroke={2.5} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: HNH.red }}>Xóa</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Available to add */}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          {canAdd ? 'Thêm ca' : 'Đã đủ 3 ca'}
        </div>
        {availableShifts
          .filter(s => !assignedIds.has(s.id))
          .map(s => {
            const firstSched = s.schedules.find(sc => sc.start_time)
            const timeStr = firstSched ? `${firstSched.start_time} – ${firstSched.end_time}` : 'Linh hoạt'
            return (
              <button
                key={s.id}
                onClick={() => canAdd && handleAdd(s.id)}
                disabled={!canAdd || busy === s.id}
                className="flex items-center w-full border-none cursor-pointer text-left"
                style={{
                  background: canAdd ? '#fff' : HNH.cream,
                  border: `1.5px solid ${canAdd ? HNH.line : HNH.line}`,
                  borderRadius: 10, padding: '9px 12px', marginBottom: 6,
                  opacity: !canAdd ? 0.5 : 1,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 4, background: shiftColor(s.id), flexShrink: 0, marginRight: 10 }} />
                <div className="flex-1">
                  <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>{timeStr}</div>
                </div>
                {canAdd && (
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, background: busy === s.id ? HNH.cream2 : HNH.navy,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon name="plus" size={14} color="#fff" stroke={2.5} />
                  </div>
                )}
              </button>
            )
          })}
        {availableShifts.filter(s => !assignedIds.has(s.id)).length === 0 && (
          <div style={{ fontSize: 12.5, color: HNH.ink3, textAlign: 'center', paddingTop: 4 }}>
            {cellPlans.length === 3 ? 'Đã đủ 3 ca.' : 'Không có ca khả dụng.'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Schedule Tab (2D table grid) ───────────────────────────────────────────────

function ScheduleTab({
  shifts, depts, employees, companies, plans, userScope, mgrDeptIds,
  onAddPlan, onRemovePlan,
}: {
  shifts: Shift[]
  depts: Dept[]
  employees: Emp[]
  companies: Company[]
  plans: ShiftPlan[]
  userScope: Scope
  mgrDeptIds: number[]
  onAddPlan: (empId: number, shiftId: number, date: string) => Promise<void>
  onRemovePlan: (planId: number) => Promise<void>
}) {
  const isCnb = userScope === 'cnb'
  const [filterCompanyId, setFilterCompanyId] = useState<number | null>(null)
  const [filterDeptId, setFilterDeptId] = useState<number | null>(null)
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)

  // Depts visible to this user
  const availableDepts = useMemo(() =>
    isCnb ? depts : depts.filter(d => mgrDeptIds.includes(d.id)),
    [depts, isCnb, mgrDeptIds]
  )

  // Depts filtered by selected company
  const visibleDepts = useMemo(() => {
    if (!filterCompanyId) return availableDepts
    return availableDepts.filter(d => d.company_ids.includes(filterCompanyId))
  }, [availableDepts, filterCompanyId])

  // Reset dept filter when company changes
  useEffect(() => {
    setFilterDeptId(null)
  }, [filterCompanyId])

  // Auto-select first dept for manager if only one
  useEffect(() => {
    if (!isCnb && availableDepts.length === 1) {
      setFilterDeptId(availableDepts[0].id)
    }
  }, [isCnb, availableDepts])

  // Shifts available for the selected dept (from Setup tab assignments)
  const activeDept = visibleDepts.find(d => d.id === filterDeptId) ?? null
  const availableShiftsForDept = useMemo(() => {
    if (!activeDept || activeDept.shift_ids.length === 0) return shifts
    return shifts.filter(s => activeDept.shift_ids.includes(s.id))
  }, [shifts, activeDept])

  // Filtered employees
  const filteredEmps = useMemo(() => {
    let list = employees
    if (!isCnb) {
      list = list.filter(e => mgrDeptIds.includes(e.department_id ?? -1))
    }
    if (filterCompanyId) {
      list = list.filter(e => e.company_id === filterCompanyId)
    }
    if (filterDeptId) {
      list = list.filter(e => e.department_id === filterDeptId)
    }
    return list
  }, [employees, isCnb, mgrDeptIds, filterCompanyId, filterDeptId])

  // Plans map: employee_id → date_str → ShiftPlan[] sorted by start_time
  const planMap = useMemo(() => {
    const m: Record<number, Record<string, ShiftPlan[]>> = {}
    for (const p of plans) {
      if (!m[p.employee_id]) m[p.employee_id] = {}
      if (!m[p.employee_id][p.date]) m[p.employee_id][p.date] = []
      m[p.employee_id][p.date].push(p)
    }
    // Sort each cell by start_time
    for (const empId of Object.keys(m)) {
      for (const date of Object.keys(m[+empId])) {
        m[+empId][date].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
      }
    }
    return m
  }, [plans])

  // Find week boundary index (first day of week 2 = index 7)
  // so we can style the two weeks differently

  const handleCellClick = (emp: Emp, date: Date) => {
    const dow = date.getDay()
    const dayLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow]
    setActiveCell({
      empId: emp.id,
      empName: emp.name,
      date: toIso(date),
      dateLabel: `${dayLabel} ${fmtDMM(date)}`,
    })
  }

  const handleAdd = async (empId: number, shiftId: number, date: string) => {
    await onAddPlan(empId, shiftId, date)
  }

  const handleRemove = async (planId: number) => {
    await onRemovePlan(planId)
  }

  const activeCellPlans = activeCell
    ? (planMap[activeCell.empId]?.[activeCell.date] ?? [])
    : []

  // Column header bg alternating by week
  const colBg = (i: number) => i < 7 ? '#fff' : '#f8f7f4'

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Company + Dept filter rows */}
      <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Company row */}
        {companies.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              onClick={() => setFilterCompanyId(null)}
              style={{
                flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                padding: '0 12px',
                background: filterCompanyId === null ? HNH.navy : HNH.cream2,
                color: filterCompanyId === null ? '#fff' : HNH.ink2,
                fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              Tất cả công ty
            </button>
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => setFilterCompanyId(c.id)}
                style={{
                  flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                  padding: '0 12px', whiteSpace: 'nowrap',
                  background: filterCompanyId === c.id ? HNH.navy : HNH.cream2,
                  color: filterCompanyId === c.id ? '#fff' : HNH.ink2,
                  fontSize: 11.5, fontWeight: 600,
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {/* Dept row */}
        {visibleDepts.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            <button
              onClick={() => setFilterDeptId(null)}
              style={{
                flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                padding: '0 12px',
                background: filterDeptId === null ? HNH.red : HNH.cream2,
                color: filterDeptId === null ? '#fff' : HNH.ink2,
                fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              Tất cả phòng
            </button>
            {visibleDepts.map(d => (
              <button
                key={d.id}
                onClick={() => setFilterDeptId(d.id)}
                style={{
                  flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                  padding: '0 12px', whiteSpace: 'nowrap',
                  background: filterDeptId === d.id ? HNH.red : HNH.cream2,
                  color: filterDeptId === d.id ? '#fff' : HNH.ink2,
                  fontSize: 11.5, fontWeight: 600,
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Date range label */}
      <div style={{ padding: '6px 16px 8px', fontSize: 11.5, color: HNH.ink3, fontWeight: 600 }}>
        {fmtDMM(GRID_DATES[0])} – {fmtDMM(GRID_DATES[13])} · {filteredEmps.length} nhân viên
      </div>

      {/* 2D table */}
      {filteredEmps.length === 0 ? (
        <div style={{ textAlign: 'center', color: HNH.ink3, padding: '40px 16px', fontSize: 13 }}>
          {filterDeptId ? 'Phòng ban này chưa có nhân viên.' : 'Không có nhân viên.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
          <table style={{
            borderCollapse: 'collapse',
            minWidth: 'max-content',
            tableLayout: 'fixed',
          }}>
            {/* Column header */}
            <thead>
              <tr>
                {/* Sticky name column */}
                <th style={{
                  position: 'sticky', left: 0, zIndex: 20,
                  width: 96, minWidth: 96,
                  background: HNH.cream, borderBottom: `2px solid ${HNH.line}`,
                  borderRight: `1px solid ${HNH.line}`,
                  padding: '6px 8px', textAlign: 'left',
                  fontSize: 10, fontWeight: 700, color: HNH.ink3,
                  textTransform: 'uppercase', letterSpacing: 0.3,
                }}>
                  Nhân viên
                </th>
                {/* Date columns */}
                {GRID_DATES.map((d, i) => {
                  const dow = d.getDay()
                  const dayLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow]
                  const isWeekend = dow === 0 || dow === 6
                  return (
                    <th key={i} style={{
                      width: 68, minWidth: 68,
                      background: colBg(i),
                      borderBottom: `2px solid ${HNH.line}`,
                      borderRight: i === 6 ? `2px solid ${HNH.navy}44` : `1px solid ${HNH.line}`,
                      padding: '5px 4px',
                      textAlign: 'center',
                    }}>
                      <div style={{
                        fontSize: 11, fontWeight: 800,
                        color: isWeekend ? HNH.red : HNH.ink2,
                      }}>
                        {dayLabel}
                      </div>
                      <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 1 }}>
                        {fmtDMM(d)}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* Rows */}
            <tbody>
              {filteredEmps.map((emp, ri) => (
                <tr key={emp.id} style={{ background: ri % 2 === 0 ? '#fff' : '#fafaf8' }}>
                  {/* Sticky name cell */}
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 10,
                    background: ri % 2 === 0 ? '#fff' : '#fafaf8',
                    borderBottom: `1px solid ${HNH.line}`,
                    borderRight: `1px solid ${HNH.line}`,
                    padding: '5px 8px',
                    verticalAlign: 'middle',
                  }}>
                    {/* Tên — large bold */}
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: HNH.ink,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 82,
                    }}>
                      {emp.first_name || emp.name.split(' ').slice(-1)[0]}
                    </div>
                    {/* Họ đệm — small */}
                    {(emp.last_name || emp.name.split(' ').length > 1) && (
                      <div style={{
                        fontSize: 10, color: HNH.ink3, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 82,
                      }}>
                        {emp.last_name || emp.name.split(' ').slice(0, -1).join(' ')}
                      </div>
                    )}
                    {/* Mã NV — smallest */}
                    {emp.badge_id && (
                      <div style={{ fontSize: 9.5, color: HNH.ink4, fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
                        {emp.badge_id}
                      </div>
                    )}
                  </td>

                  {/* Date cells */}
                  {GRID_DATES.map((d, ci) => {
                    const dateStr = toIso(d)
                    const cellPlans = planMap[emp.id]?.[dateStr] ?? []
                    const dow = d.getDay()
                    const isWeekend = dow === 0 || dow === 6

                    return (
                      <td
                        key={ci}
                        onClick={() => handleCellClick(emp, d)}
                        style={{
                          background: isWeekend
                            ? (colBg(ci) === '#fff' ? '#fff7f7' : '#f5f2ef')
                            : colBg(ci),
                          borderBottom: `1px solid ${HNH.line}`,
                          borderRight: ci === 6 ? `2px solid ${HNH.navy}44` : `1px solid ${HNH.line}`,
                          padding: '4px',
                          verticalAlign: 'top',
                          cursor: 'pointer',
                          minHeight: 48,
                        }}
                      >
                        {cellPlans.length === 0 ? (
                          <div style={{
                            width: '100%', minHeight: 40,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Icon name="plus" size={12} color={HNH.line} stroke={2} />
                          </div>
                        ) : (
                          <div>
                            {cellPlans.map(p => (
                              <div key={p.id} style={{
                                background: shiftColor(p.shift_id),
                                borderRadius: 5, padding: '2px 4px', marginBottom: 2,
                              }}>
                                <div style={{
                                  fontSize: 9.5, fontWeight: 700, color: '#fff',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {abbrevShift(p.shift_name)}
                                </div>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>
                                  {p.start_time}
                                </div>
                              </div>
                            ))}
                            {cellPlans.length < 3 && (
                              <div style={{
                                borderRadius: 5, padding: '1px 4px',
                                border: `1px dashed ${HNH.line}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Icon name="plus" size={10} color={HNH.ink4 ?? HNH.ink3} stroke={2} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shift picker sheet */}
      {activeCell && (
        <ShiftPickerSheet
          cell={activeCell}
          availableShifts={availableShiftsForDept}
          cellPlans={activeCellPlans}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onClose={() => setActiveCell(null)}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ShiftManagementPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'schedule' | 'setup'>('schedule')
  const [userScope, setUserScope] = useState<Scope>('none')
  const [mgrDeptIds, setMgrDeptIds] = useState<number[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [employees, setEmployees] = useState<Emp[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [plans, setPlans] = useState<ShiftPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  const loadPlans = useCallback(async () => {
    try {
      const plansRes = await api.get<ShiftPlan[]>(
        `/api/employee/shift-mgmt/plan/?from_date=${GRID_FROM}&to_date=${GRID_TO}`
      )
      setPlans(plansRes)
    } catch (e) {
      console.error('plans load error', e)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [scopeRes, shiftsRes, deptsRes, empsRes, companiesRes] = await Promise.allSettled([
        api.get<{ scope: Scope; department_ids: number[] }>('/api/employee/shift-mgmt/scope/'),
        api.get<Shift[]>('/api/employee/shift-mgmt/shifts/'),
        api.get<Dept[]>('/api/employee/shift-mgmt/dept-shifts/'),
        api.get<Emp[]>('/api/employee/shift-mgmt/employees/'),
        api.get<Company[]>('/api/employee/companies/'),
      ])

      if (scopeRes.status === 'fulfilled') {
        setUserScope(scopeRes.value.scope)
        setMgrDeptIds(scopeRes.value.department_ids)
      }
      if (shiftsRes.status === 'fulfilled') setShifts(shiftsRes.value)
      if (deptsRes.status === 'fulfilled') setDepts(deptsRes.value)
      if (empsRes.status === 'fulfilled') setEmployees(empsRes.value)
      if (companiesRes.status === 'fulfilled') setCompanies(companiesRes.value)

      await loadPlans()
    } catch (e) {
      console.error('ShiftManagement load error', e)
    } finally {
      setLoading(false)
    }
  }, [loadPlans])

  useEffect(() => { loadData() }, [loadData])

  const [addDeptModal, setAddDeptModal] = useState<{ shiftId: number; deptId: number } | null>(null)

  const handleToggleDept = useCallback(async (shiftId: number, deptId: number, add: boolean, applyFrom?: string) => {
    try {
      if (add) {
        if (!applyFrom) {
          setAddDeptModal({ shiftId, deptId })
          return
        }
        await api.post('/api/employee/shift-mgmt/dept-shifts/', {
          department_id: deptId, shift_id: shiftId,
          auto_assign: true, apply_from: applyFrom,
        })
        setAddDeptModal(null)
      } else {
        await api.delete('/api/employee/shift-mgmt/dept-shifts/', { department_id: deptId, shift_id: shiftId })
      }
      loadData()
      showToast(add ? 'Đã gán ca cho phòng ban' : 'Đã bỏ gán ca + xóa lịch tương lai')
    } catch {
      showToast('Lỗi: không thể thay đổi')
    }
  }, [loadData])

  const handleAddPlan = useCallback(async (empId: number, shiftId: number, date: string) => {
    try {
      const res = await api.post<{ id: number }>('/api/employee/shift-mgmt/plan/', {
        employee_id: empId, shift_id: shiftId, date,
      })
      const shift = shifts.find(s => s.id === shiftId)
      // Compute start_time from shift schedules for the given date
      const d = new Date(date + 'T00:00:00')
      const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()]
      const sch = shift?.schedules.find(sc => sc.day.toLowerCase() === dayName && sc.start_time)
        ?? shift?.schedules.find(sc => sc.start_time)
      const startTime = sch?.start_time ?? '00:00'
      const newPlan: ShiftPlan = {
        id: res.id,
        employee_id: empId,
        shift_id: shiftId,
        shift_name: shift?.name ?? '',
        date,
        start_time: startTime,
      }
      setPlans(prev => [...prev, newPlan])
      showToast('Đã thêm ca')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi khi thêm ca'
      showToast(msg)
      throw e
    }
  }, [shifts])

  const handleRemovePlan = useCallback(async (planId: number) => {
    try {
      await api.delete('/api/employee/shift-mgmt/plan/', { plan_id: planId })
      setPlans(prev => prev.filter(p => p.id !== planId))
      showToast('Đã xóa ca')
    } catch {
      showToast('Lỗi khi xóa ca')
      throw new Error('remove failed')
    }
  }, [])

  const isCnb = userScope === 'cnb'

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar onBack={() => navigate(-1)} title="Quản lý Ca" />
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang tải dữ liệu...</div>
        </div>
      </div>
    )
  }

  if (userScope === 'none') {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar onBack={() => navigate(-1)} title="Quản lý Ca" />
        <div className="flex flex-col items-center justify-center gap-3" style={{ height: 250, padding: '0 32px', textAlign: 'center' }}>
          <Icon name="shield" size={40} color={HNH.ink4 ?? HNH.ink3} />
          <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>Không có quyền truy cập</div>
          <div style={{ fontSize: 13, color: HNH.ink3 }}>
            Liên hệ quản trị viên để được cấp quyền <strong>Quản lý Ca</strong> hoặc <strong>Chuyên viên C&B</strong>.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar onBack={() => navigate(-1)} title="Quản lý Ca" sub={isCnb ? 'Chuyên viên C&B' : 'Quản lý Ca'} />

      {/* Tab bar */}
      <div style={{
        display: 'flex', background: '#fff',
        borderBottom: `1px solid ${HNH.line}`,
        padding: '0 16px',
      }}>
        {[
          { key: 'schedule', label: 'Phân Ca' },
          ...(isCnb ? [{ key: 'setup', label: 'Thiết lập Ca' }] : []),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'schedule' | 'setup')}
            style={{
              flex: 1, height: 44, border: 'none', cursor: 'pointer', background: 'transparent',
              fontSize: 13.5, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? HNH.red : HNH.ink3,
              borderBottom: tab === t.key ? `2.5px solid ${HNH.red}` : '2.5px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'schedule' && (
        <ScheduleTab
          shifts={shifts}
          depts={depts}
          employees={employees}
          companies={companies}
          plans={plans}
          userScope={userScope}
          mgrDeptIds={mgrDeptIds}
          onAddPlan={handleAddPlan}
          onRemovePlan={handleRemovePlan}
        />
      )}
      {tab === 'setup' && (
        <SetupTab
          shifts={shifts}
          depts={depts}
          isCnb={isCnb}
          onToggleDept={handleToggleDept}
          onRefresh={loadData}
        />
      )}

      {/* Modal: chọn áp dụng ca */}
      {addDeptModal && (
        <div onClick={() => setAddDeptModal(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, width: 300,
          }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginBottom: 4 }}>Gán ca cho phòng ban</p>
            <p style={{ fontSize: 12, color: HNH.ink3, marginBottom: 16 }}>Tự động áp dụng ca cho nhân viên trong phòng từ:</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleToggleDept(addDeptModal.shiftId, addDeptModal.deptId, true, 'this_month')}
                style={{
                  padding: '12px', borderRadius: 10, border: `1px solid ${HNH.navy}`,
                  background: HNH.navy50, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: HNH.navy,
                }}
              >
                Tháng này (áp dụng ngay)
              </button>
              <button
                onClick={() => handleToggleDept(addDeptModal.shiftId, addDeptModal.deptId, true, 'next_month')}
                style={{
                  padding: '12px', borderRadius: 10, border: `1px solid ${HNH.gold}`,
                  background: HNH.goldSoft, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#a87908',
                }}
              >
                Tháng tiếp theo
              </button>
              <button
                onClick={() => setAddDeptModal(null)}
                style={{
                  padding: '10px', borderRadius: 10, border: `1px solid ${HNH.line}`,
                  background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink3,
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 70, left: 16, right: 16,
          background: HNH.ink, color: '#fff', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, fontWeight: 600,
          zIndex: 9999, textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
