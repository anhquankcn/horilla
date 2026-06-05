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
  schedules: { day: string; start_time: string | null; end_time: string | null; is_night_shift: boolean }[]
}

interface Dept {
  id: number
  name: string
  shift_ids: number[]
}

interface Emp {
  id: number
  name: string
  badge_id: string
  department_id: number | null
  department_name: string
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
}

type Scope = 'cnb' | 'manager' | 'none'
type TimeScope = '1day' | 'weekdays' | 'next_week' | 'next_month'

const DAY_VI: Record<string, string> = {
  monday: 'T2', tuesday: 'T3', wednesday: 'T4',
  thursday: 'T5', friday: 'T6', saturday: 'T7', sunday: 'CN',
}
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function fmtDateVi(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function ShiftCard({ shift, depts, isCnb, onToggleDept }: {
  shift: Shift; depts: Dept[]; isCnb: boolean
  onToggleDept: (shiftId: number, deptId: number, add: boolean) => void
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
          {/* Assigned depts */}
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

          {/* Unassigned depts (C&B can add) */}
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
        </div>
      )}
    </div>
  )
}

// ── Setup Tab (C&B only) ───────────────────────────────────────────────────────

function SetupTab({ shifts, depts, onToggleDept, isCnb }: {
  shifts: Shift[]; depts: Dept[]; isCnb: boolean
  onToggleDept: (shiftId: number, deptId: number, add: boolean) => void
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
        <ShiftCard key={s.id} shift={s} depts={depts} isCnb={isCnb} onToggleDept={onToggleDept} />
      ))}
    </div>
  )
}

// ── Schedule Tab ───────────────────────────────────────────────────────────────

function ScheduleTab({
  shifts, depts, employees, plans, userScope, mgrDeptIds,
  onAssign, loading,
}: {
  shifts: Shift[]; depts: Dept[]; employees: Emp[]
  plans: ShiftPlan[]; userScope: Scope; mgrDeptIds: number[]
  onAssign: (empIds: number[], shiftId: number, scope: TimeScope, date: string, weekdays: number[]) => Promise<void>
  loading: boolean
}) {
  const today = new Date()
  const [timeScope, setTimeScope] = useState<TimeScope>('1day')
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10))
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([0, 1, 2, 3, 4]) // Mon-Fri
  const [filterDeptId, setFilterDeptId] = useState<number | null>(null)
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set())
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null)
  const [applying, setApplying] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const isCnb = userScope === 'cnb'

  // Department list filtered by scope
  const availableDepts = useMemo(() => {
    if (isCnb) return depts
    return depts.filter(d => mgrDeptIds.includes(d.id))
  }, [depts, isCnb, mgrDeptIds])

  // Available shifts for selected dept (if dept-shift config exists, use it; else all)
  const selectedDept = availableDepts.find(d => d.id === filterDeptId) ?? null
  const availableShifts = useMemo(() => {
    if (!selectedDept || selectedDept.shift_ids.length === 0) return shifts
    return shifts.filter(s => selectedDept.shift_ids.includes(s.id))
  }, [shifts, selectedDept])

  // Employees filtered
  const filteredEmps = useMemo(() => {
    let list = employees
    if (filterDeptId) list = list.filter(e => e.department_id === filterDeptId)
    if (searchQ) {
      const q = searchQ.toLowerCase()
      list = list.filter(e => e.name.toLowerCase().includes(q) || e.badge_id.includes(q))
    }
    return list
  }, [employees, filterDeptId, searchQ])

  // Plans map: employee_id → {[date]: plan}
  const planMap = useMemo(() => {
    const m: Record<number, Record<string, ShiftPlan>> = {}
    for (const p of plans) {
      if (!m[p.employee_id]) m[p.employee_id] = {}
      m[p.employee_id][p.date] = p
    }
    return m
  }, [plans])

  // Compute preview dates
  const previewDates = useMemo((): Date[] => {
    const base = new Date(selectedDate + 'T00:00:00')
    if (timeScope === '1day') return [base]
    if (timeScope === 'weekdays') {
      const result: Date[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(base)
        d.setDate(d.getDate() + i)
        if (selectedWeekdays.includes(d.getDay() === 0 ? 6 : d.getDay() - 1)) result.push(d)
      }
      return result
    }
    if (timeScope === 'next_week') {
      const daysAhead = 7 - (base.getDay() || 7) + 1
      const monday = new Date(base)
      monday.setDate(base.getDate() + daysAhead)
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        return d
      })
    }
    if (timeScope === 'next_month') {
      const nm = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      const days = new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate()
      return Array.from({ length: days }, (_, i) => new Date(nm.getFullYear(), nm.getMonth(), i + 1))
    }
    return []
  }, [timeScope, selectedDate, selectedWeekdays])

  const toggleEmp = (id: number) => {
    setSelectedEmpIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedEmpIds.size === filteredEmps.length) {
      setSelectedEmpIds(new Set())
    } else {
      setSelectedEmpIds(new Set(filteredEmps.map(e => e.id)))
    }
  }

  const toggleWeekday = (wd: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(wd) ? prev.filter(x => x !== wd) : [...prev, wd]
    )
  }

  const handleApply = async () => {
    if (!selectedShiftId || selectedEmpIds.size === 0) return
    setApplying(true)
    try {
      await onAssign(
        Array.from(selectedEmpIds),
        selectedShiftId,
        timeScope,
        selectedDate,
        selectedWeekdays,
      )
    } finally {
      setApplying(false)
    }
  }

  const previewLabel = (() => {
    if (timeScope === '1day') return fmtDateVi(new Date(selectedDate + 'T00:00:00'))
    if (timeScope === 'next_week') return 'Tuần tới'
    if (timeScope === 'next_month') return 'Tháng tới'
    return `${previewDates.length} ngày`
  })()

  const selectedShift = shifts.find(s => s.id === selectedShiftId)

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* ── Scope selector ── */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          Phạm vi áp dụng
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { key: '1day', label: '1 ngày' },
            { key: 'weekdays', label: 'Ngày chọn' },
            { key: 'next_week', label: 'Tuần tới' },
            { key: 'next_month', label: 'Tháng tới' },
          ] as { key: TimeScope; label: string }[]).map(opt => (
            <button
              key={opt.key}
              onClick={() => setTimeScope(opt.key)}
              style={{
                flex: 1, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: timeScope === opt.key ? HNH.navy : HNH.cream2,
                color: timeScope === opt.key ? '#fff' : HNH.ink2,
                fontSize: 11.5, fontWeight: 700,
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Date / weekday picker ── */}
      {(timeScope === '1day' || timeScope === 'weekdays') && (
        <div style={{ padding: '10px 16px 0' }}>
          {timeScope === '1day' && (
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                width: '100%', height: 40, borderRadius: 10, border: `1px solid ${HNH.line}`,
                padding: '0 12px', fontSize: 13, fontWeight: 600, color: HNH.ink,
                background: '#fff', boxSizing: 'border-box',
              }}
            />
          )}
          {timeScope === 'weekdays' && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Chọn ngày trong tuần
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {WEEKDAY_LABELS.map((lbl, i) => (
                  <button
                    key={i}
                    onClick={() => toggleWeekday(i)}
                    style={{
                      flex: 1, height: 36, borderRadius: 9, border: 'none', cursor: 'pointer',
                      background: selectedWeekdays.includes(i) ? HNH.red : HNH.cream2,
                      color: selectedWeekdays.includes(i) ? '#fff' : HNH.ink3,
                      fontSize: 11.5, fontWeight: 700,
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{
                  width: '100%', height: 36, borderRadius: 10, border: `1px solid ${HNH.line}`,
                  padding: '0 12px', fontSize: 12.5, color: HNH.ink, background: '#fff',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 4 }}>
                Bắt đầu từ ngày trên, áp dụng cho các ngày đã chọn trong 7 ngày tiếp theo.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview dates */}
      {previewDates.length > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {previewDates.slice(0, 14).map((d, i) => (
              <div key={i} style={{
                background: HNH.cream2, borderRadius: 7, padding: '3px 8px',
                fontSize: 11, fontWeight: 600, color: HNH.ink2,
              }}>
                {fmtDateVi(d)}
              </div>
            ))}
            {previewDates.length > 14 && (
              <div style={{
                background: HNH.cream2, borderRadius: 7, padding: '3px 8px',
                fontSize: 11, fontWeight: 600, color: HNH.ink3,
              }}>
                +{previewDates.length - 14} ngày
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Dept filter ── */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          Phòng ban
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            onClick={() => setFilterDeptId(null)}
            style={{
              flexShrink: 0, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer',
              padding: '0 12px',
              background: filterDeptId === null ? HNH.red : HNH.cream2,
              color: filterDeptId === null ? '#fff' : HNH.ink2,
              fontSize: 12, fontWeight: 600,
            }}
          >
            Tất cả
          </button>
          {availableDepts.map(d => (
            <button
              key={d.id}
              onClick={() => setFilterDeptId(d.id)}
              style={{
                flexShrink: 0, height: 32, borderRadius: 9, border: 'none', cursor: 'pointer',
                padding: '0 12px', whiteSpace: 'nowrap',
                background: filterDeptId === d.id ? HNH.navy : HNH.cream2,
                color: filterDeptId === d.id ? '#fff' : HNH.ink2,
                fontSize: 12, fontWeight: 600,
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Shift picker ── */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
          Ca sẽ áp dụng
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {availableShifts.map(s => {
            const firstSched = s.schedules.find(sc => sc.start_time)
            const timeStr = firstSched ? `${firstSched.start_time}–${firstSched.end_time}` : ''
            const active = selectedShiftId === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSelectedShiftId(s.id)}
                style={{
                  flexShrink: 0, borderRadius: 11, cursor: 'pointer',
                  padding: '7px 12px', textAlign: 'left',
                  background: active ? HNH.red : '#fff',
                  border: `1.5px solid ${active ? HNH.red : HNH.line}`,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#fff' : HNH.ink, whiteSpace: 'nowrap' }}>
                  {s.name}
                </div>
                {timeStr && (
                  <div style={{ fontSize: 10.5, color: active ? 'rgba(255,255,255,0.75)' : HNH.ink3, marginTop: 1 }}>
                    {timeStr}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Employee list ── */}
      <div style={{ padding: '12px 16px 0' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Nhân viên ({filteredEmps.length})
          </div>
          <button
            onClick={toggleAll}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: HNH.navy, fontWeight: 600 }}
          >
            {selectedEmpIds.size === filteredEmps.length && filteredEmps.length > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2" style={{
          background: '#fff', borderRadius: 10, border: `1px solid ${HNH.line}`,
          padding: '8px 12px', marginBottom: 8,
        }}>
          <Icon name="search" size={15} color={HNH.ink3} />
          <input
            placeholder="Tìm nhân viên..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, color: HNH.ink, background: 'transparent' }}
          />
        </div>

        {/* Employee rows */}
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
          {filteredEmps.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
              Không có nhân viên phù hợp.
            </div>
          )}
          {filteredEmps.map((emp, i) => {
            const checked = selectedEmpIds.has(emp.id)
            // Find planned shift for selected date (1day scope)
            const planForDate = planMap[emp.id]?.[selectedDate]
            return (
              <button
                key={emp.id}
                onClick={() => toggleEmp(emp.id)}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  padding: '10px 14px',
                  borderBottom: i < filteredEmps.length - 1 ? `1px solid ${HNH.line}` : 'none',
                  background: checked ? HNH.navy + '12' : 'transparent',
                  transition: 'background 0.12s',
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${checked ? HNH.navy : HNH.line}`,
                  background: checked ? HNH.navy : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <Icon name="check" size={11} color="#fff" stroke={3} />}
                </div>

                {/* Avatar */}
                {emp.avatar ? (
                  <img src={emp.avatar} alt="" style={{ width: 32, height: 32, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, background: HNH.cream2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon name="user" size={16} color={HNH.ink3} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {emp.name}
                  </div>
                  <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
                    {emp.department_name || '—'}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {planForDate ? (
                    <Badge tone="gold" size="s">{planForDate.shift_name}</Badge>
                  ) : emp.shift_name ? (
                    <Badge tone="navy" size="s">{emp.shift_name}</Badge>
                  ) : (
                    <Badge tone="ink" size="s">Chưa có ca</Badge>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Fixed bottom apply bar ── */}
      <div style={{
        position: 'fixed', bottom: 56, left: 0, right: 0,
        padding: '12px 16px',
        background: 'rgba(250,249,246,0.95)', backdropFilter: 'blur(10px)',
        borderTop: `1px solid ${HNH.line}`,
        zIndex: 100,
      }}>
        {selectedEmpIds.size > 0 && selectedShiftId ? (
          <div className="flex items-center gap-3">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>
                {selectedShift?.name} · {previewLabel}
              </div>
              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
                {selectedEmpIds.size} nhân viên · {previewDates.length} ngày
              </div>
            </div>
            <button
              onClick={handleApply}
              disabled={applying || loading}
              style={{
                height: 44, paddingLeft: 20, paddingRight: 20, borderRadius: 13,
                border: 'none', cursor: 'pointer',
                background: applying ? HNH.ink3 : HNH.red,
                color: '#fff', fontSize: 14, fontWeight: 700,
                boxShadow: applying ? 'none' : '0 4px 12px rgba(192,34,43,0.28)',
              }}
            >
              {applying ? 'Đang lưu...' : 'Áp dụng'}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 12.5, color: HNH.ink3 }}>
            {selectedEmpIds.size === 0
              ? 'Chọn nhân viên và ca để phân lịch'
              : 'Chọn ca để áp dụng'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ShiftManagementPage() {
  const [tab, setTab] = useState<'schedule' | 'setup'>('schedule')
  const [userScope, setUserScope] = useState<Scope>('none')
  const [mgrDeptIds, setMgrDeptIds] = useState<number[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [employees, setEmployees] = useState<Emp[]>([])
  const [plans, setPlans] = useState<ShiftPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [scopeRes, shiftsRes, deptsRes, empsRes] = await Promise.all([
        api.get<{ scope: Scope; department_ids: number[] }>('/api/employee/shift-mgmt/scope/'),
        api.get<Shift[]>('/api/employee/shift-mgmt/shifts/'),
        api.get<Dept[]>('/api/employee/shift-mgmt/dept-shifts/'),
        api.get<Emp[]>('/api/employee/shift-mgmt/employees/'),
      ])
      setUserScope(scopeRes.scope)
      setMgrDeptIds(scopeRes.department_ids)
      setShifts(shiftsRes)
      setDepts(deptsRes)
      setEmployees(empsRes)

      // Load plans for next 60 days
      const today = new Date()
      const from = today.toISOString().slice(0, 10)
      const to = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10)
      const plansRes = await api.get<ShiftPlan[]>(`/api/employee/shift-mgmt/plan/?from_date=${from}&to_date=${to}`)
      setPlans(plansRes)
    } catch (e) {
      console.error('ShiftManagement load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleToggleDept = useCallback(async (shiftId: number, deptId: number, add: boolean) => {
    try {
      if (add) {
        await api.post('/api/employee/shift-mgmt/dept-shifts/', { department_id: deptId, shift_id: shiftId })
      } else {
        await api.delete('/api/employee/shift-mgmt/dept-shifts/', { department_id: deptId, shift_id: shiftId })
      }
      // Optimistic update
      setShifts(prev => prev.map(s => {
        if (s.id !== shiftId) return s
        return {
          ...s,
          department_ids: add
            ? [...s.department_ids, deptId]
            : s.department_ids.filter(id => id !== deptId),
        }
      }))
      setDepts(prev => prev.map(d => {
        if (d.id !== deptId) return d
        return {
          ...d,
          shift_ids: add
            ? [...d.shift_ids, shiftId]
            : d.shift_ids.filter(id => id !== shiftId),
        }
      }))
      showToast(add ? 'Đã gán ca cho phòng ban' : 'Đã bỏ gán ca')
    } catch {
      showToast('Lỗi: không thể thay đổi')
    }
  }, [])

  const handleAssign = useCallback(async (
    empIds: number[], shiftId: number, scope: TimeScope, date: string, weekdays: number[]
  ) => {
    try {
      const res = await api.post<{ created: number; updated: number; dates: string[] }>(
        '/api/employee/shift-mgmt/plan/',
        { employee_ids: empIds, shift_id: shiftId, scope, date, weekdays }
      )
      // Reload plans after assign
      const today = new Date()
      const from = today.toISOString().slice(0, 10)
      const to = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10)
      const plansRes = await api.get<ShiftPlan[]>(`/api/employee/shift-mgmt/plan/?from_date=${from}&to_date=${to}`)
      setPlans(plansRes)
      showToast(`Đã phân ca: ${res.created + res.updated} bản ghi (${res.dates.length} ngày)`)
    } catch {
      showToast('Lỗi: không thể phân ca')
    }
  }, [])

  const handleDeletePlan = useCallback(async (empId: number, dateStr: string) => {
    try {
      await api.delete('/api/employee/shift-mgmt/plan/', {
        employee_ids: [empId],
        from_date: dateStr,
        to_date: dateStr,
      })
      setPlans(prev => prev.filter(p => !(p.employee_id === empId && p.date === dateStr)))
    } catch {
      showToast('Lỗi: không thể xóa lịch')
    }
  }, [])

  const isCnb = userScope === 'cnb'

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Quản lý Ca" />
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <div style={{ fontSize: 13, color: HNH.ink3 }}>Đang tải dữ liệu...</div>
        </div>
      </div>
    )
  }

  if (userScope === 'none') {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Quản lý Ca" />
        <div className="flex flex-col items-center justify-center gap-3" style={{ height: 250, padding: '0 32px', textAlign: 'center' }}>
          <Icon name="shield" size={40} color={HNH.ink4} />
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
      <TopBar title="Quản lý Ca" sub={isCnb ? 'Chuyên viên C&B' : 'Quản lý Ca'} />

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

      {/* Content */}
      {tab === 'schedule' && (
        <ScheduleTab
          shifts={shifts}
          depts={depts}
          employees={employees}
          plans={plans}
          userScope={userScope}
          mgrDeptIds={mgrDeptIds}
          onAssign={handleAssign}
          loading={loading}
        />
      )}
      {tab === 'setup' && (
        <SetupTab
          shifts={shifts}
          depts={depts}
          isCnb={isCnb}
          onToggleDept={handleToggleDept}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 70, left: 16, right: 16,
          background: HNH.ink, color: '#fff', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, fontWeight: 600,
          zIndex: 9999, textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
