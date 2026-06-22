import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShiftOption {
  id: number
  name: string
}

interface Department {
  id: number
  department: string
}

interface EmpRow {
  id: number
  name: string
  first_name: string
  last_name: string
  avatar: string | null
  badge_id: string
  department_id: number
}

interface PlanCell {
  plan_id: number
  shift_id: number
  shift_name: string
}

interface RequestCell {
  request_id: number
  shift_id: number
  shift_name: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by_id: number
}

interface PendingRequest {
  id: number
  employee_id: number
  employee_name: string
  shift_id: number
  shift_name: string
  date: string
  note: string
}

interface PlannerData {
  employees: EmpRow[]
  plans: Record<string, PlanCell>        // key: "{emp_id}_{date}"
  requests: Record<string, RequestCell>  // key: "{emp_id}_{date}"
  pending_requests: PendingRequest[]
  is_manager: boolean
  is_hr: boolean
  departments: Department[]
  all_shifts: ShiftOption[]
  dept_shifts: Record<number, number[]>  // dept_id -> [shift_id, ...]
  days: string[]                         // YYYY-MM-DD list for the month
}

type CopyScope = '1day' | 'this_week' | 'next_week' | 'this_month'

type ViewTab = 'grid' | 'pending'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function monthStr(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.toISOString().slice(0, 7)
}

function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number)
  const count = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0')
    return `${ym}-${dd}`
  })
}

function shortDay(date: string) {
  const d = new Date(date + 'T00:00:00')
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return days[d.getDay()]
}

function dayNum(date: string) {
  return date.slice(8)
}

function isWeekend(date: string) {
  const d = new Date(date + 'T00:00:00')
  return d.getDay() === 0 || d.getDay() === 6
}

// ── Shift Assign Modal ────────────────────────────────────────────────────────

interface AssignModalProps {
  empId: number
  empName: string
  deptId: number
  date: string
  isManager: boolean
  isHr: boolean
  allShifts: ShiftOption[]
  deptShifts: Record<number, number[]>
  existingPlanId?: number
  existingShiftId?: number
  onClose: () => void
  onAssigned: () => void
}

function AssignModal({
  empId, empName, deptId, date, isManager, isHr,
  allShifts, deptShifts, existingPlanId, existingShiftId,
  onClose, onAssigned,
}: AssignModalProps) {
  const { toast: showToast } = useToast()
  const [selectedShift, setSelectedShift] = useState<number | null>(existingShiftId ?? null)
  const [copyScope, setCopyScope] = useState<CopyScope>('1day')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const validShiftIds = new Set(deptShifts[deptId] ?? allShifts.map(s => s.id))
  const validShifts = allShifts.filter(s => validShiftIds.has(s.id))

  const canDirectAssign = isManager || isHr

  const handleSave = async () => {
    if (!selectedShift) { showToast('Vui lòng chọn ca'); return }
    setSaving(true)
    try {
      await api.post('/api/employee/shift-planner/', {
        employee_id: empId,
        shift_id: selectedShift,
        date,
        copy_scope: copyScope,
        note,
      })
      showToast(canDirectAssign ? 'Đã phân ca' : 'Đã gửi đề xuất đổi ca')
      onAssigned()
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi phân ca')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existingPlanId) return
    if (!confirm('Xoá ca đã phân?')) return
    setSaving(true)
    try {
      await api.delete('/api/employee/shift-planner/', { plan_id: existingPlanId })
      showToast('Đã xoá ca')
      onAssigned()
    } catch {
      showToast('Lỗi khi xoá ca')
    } finally {
      setSaving(false)
    }
  }

  const copyScopeOptions: { value: CopyScope; label: string }[] = [
    { value: '1day', label: 'Chỉ ngày này' },
    { value: 'this_week', label: 'Cả tuần này' },
    { value: 'next_week', label: 'Tuần tiếp theo' },
    { value: 'this_month', label: 'Cả tháng' },
  ]

  const d = new Date(date + 'T00:00:00')
  const dayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0', width: '100%',
          maxHeight: '90vh', overflowY: 'auto', padding: '24px 20px calc(40px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 17, color: HNH.ink, marginBottom: 4 }}>
          Phân ca — {empName}
        </div>
        <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 18 }}>
          {dayLabels[d.getDay()]}, {dayNum(date)}/{date.slice(5, 7)}/{date.slice(0, 4)}
          {!canDirectAssign && (
            <span style={{ marginLeft: 8, color: HNH.warn, fontWeight: 600 }}>· Cần quản lý duyệt</span>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 8 }}>Chọn ca</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {validShifts.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedShift(s.id)}
                style={{
                  padding: '10px 14px', borderRadius: 12, textAlign: 'left',
                  border: `2px solid ${selectedShift === s.id ? HNH.red : HNH.line}`,
                  background: selectedShift === s.id ? HNH.red50 : '#fff',
                  color: HNH.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {s.name}
              </button>
            ))}
            {validShifts.length === 0 && (
              <div style={{ fontSize: 13, color: HNH.ink3, padding: '8px 0' }}>
                Không có ca hợp lệ cho phòng ban này. HR cần thêm ca trước.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 8 }}>Áp dụng cho</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {copyScopeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCopyScope(opt.value)}
                style={{
                  padding: '9px 10px', borderRadius: 10,
                  border: `2px solid ${copyScope === opt.value ? HNH.navy : HNH.line}`,
                  background: copyScope === opt.value ? HNH.navy50 : '#fff',
                  color: copyScope === opt.value ? HNH.navy : HNH.ink2,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!canDirectAssign && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>Ghi chú (tùy chọn)</div>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Lý do đổi ca..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                border: `1.5px solid ${HNH.line}`, fontSize: 14, color: HNH.ink,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {existingPlanId && canDirectAssign && (
            <button
              onClick={handleDelete}
              disabled={saving}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 12,
                border: `1.5px solid ${HNH.red}30`, background: HNH.red50,
                fontSize: 13, fontWeight: 600, color: HNH.red,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              Xoá ca
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              border: `1.5px solid ${HNH.line}`, background: '#fff',
              fontSize: 14, fontWeight: 600, color: HNH.ink2, cursor: 'pointer',
            }}
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedShift}
            style={{
              flex: 2, padding: '12px 0', borderRadius: 12,
              border: 'none', background: HNH.red,
              fontSize: 14, fontWeight: 700, color: '#fff',
              cursor: (saving || !selectedShift) ? 'not-allowed' : 'pointer',
              opacity: (saving || !selectedShift) ? 0.6 : 1,
            }}
          >
            {saving ? 'Đang lưu...' : (canDirectAssign ? 'Phân ca' : 'Gửi đề xuất')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Approve Modal ─────────────────────────────────────────────────────────────

interface ApproveModalProps {
  request: PendingRequest
  allShifts: ShiftOption[]
  onClose: () => void
  onDone: () => void
}

function ApproveModal({ request, allShifts, onClose, onDone }: ApproveModalProps) {
  const { toast: showToast } = useToast()
  const [copyScope, setCopyScope] = useState<CopyScope>('1day')
  const [saving, setSaving] = useState(false)

  const shift = allShifts.find(s => s.id === request.shift_id)

  const handleApprove = async () => {
    setSaving(true)
    try {
      await api.patch('/api/employee/shift-planner/', {
        action: 'approve', request_id: request.id, copy_scope: copyScope,
      })
      showToast('Đã duyệt')
      onDone()
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi duyệt')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async () => {
    setSaving(true)
    try {
      await api.patch('/api/employee/shift-planner/', {
        action: 'reject', request_id: request.id,
      })
      showToast('Đã từ chối')
      onDone()
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi từ chối')
    } finally {
      setSaving(false)
    }
  }

  const copyScopeOptions: { value: CopyScope; label: string }[] = [
    { value: '1day', label: 'Chỉ ngày này' },
    { value: 'this_week', label: 'Cả tuần này' },
    { value: 'next_week', label: 'Tuần tiếp theo' },
    { value: 'this_month', label: 'Cả tháng' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0', width: '100%',
          maxHeight: '85vh', overflowY: 'auto', padding: '24px 20px calc(40px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 17, color: HNH.ink, marginBottom: 4 }}>
          Duyệt đề xuất đổi ca
        </div>
        <div style={{ fontSize: 13, color: HNH.ink2, marginBottom: 18, lineHeight: 1.5 }}>
          <strong>{request.employee_name}</strong> — <span style={{ color: HNH.red }}>{shift?.name ?? `Ca #${request.shift_id}`}</span>
          <br />
          Ngày {request.date.slice(8)}/{request.date.slice(5, 7)}/{request.date.slice(0, 4)}
          {request.note && <><br /><span style={{ color: HNH.ink3 }}>"{request.note}"</span></>}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 8 }}>Áp dụng cho</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {copyScopeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCopyScope(opt.value)}
                style={{
                  padding: '9px 10px', borderRadius: 10,
                  border: `2px solid ${copyScope === opt.value ? HNH.navy : HNH.line}`,
                  background: copyScope === opt.value ? HNH.navy50 : '#fff',
                  color: copyScope === opt.value ? HNH.navy : HNH.ink2,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleReject}
            disabled={saving}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              border: `1.5px solid ${HNH.red}30`, background: HNH.red50,
              fontSize: 13, fontWeight: 600, color: HNH.red,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            Từ chối
          </button>
          <button
            onClick={handleApprove}
            disabled={saving}
            style={{
              flex: 2, padding: '12px 0', borderRadius: 12,
              border: 'none', background: HNH.success,
              fontSize: 14, fontWeight: 700, color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Đang lưu...' : 'Duyệt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Grid View ─────────────────────────────────────────────────────────────────

const CELL_W = 56
const NAME_W = 120
const ROW_H = 52

interface GridViewProps {
  data: PlannerData
  days: string[]
  onCellClick: (empId: number, empName: string, deptId: number, date: string, planCell?: PlanCell) => void
  today: string
}

function GridView({ data, days, onCellClick, today }: GridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      const todayIdx = days.indexOf(today)
      if (todayIdx >= 0) {
        scrollRef.current.scrollLeft = Math.max(0, todayIdx * CELL_W - 80)
      }
    }
  }, [days, today])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sticky header row */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: `1px solid ${HNH.line}`, flexShrink: 0 }}>
        <div style={{ width: NAME_W, flexShrink: 0, padding: '8px 10px', fontSize: 11, fontWeight: 700, color: HNH.ink3, borderRight: `1px solid ${HNH.line}` }}>
          Nhân viên
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', display: 'flex' }}>
          {days.map(d => (
            <div
              key={d}
              style={{
                width: CELL_W, flexShrink: 0, textAlign: 'center',
                padding: '4px 2px',
                background: d === today ? HNH.red50 : isWeekend(d) ? '#fafafa' : '#fff',
                borderLeft: `1px solid ${HNH.line}`,
              }}
            >
              <div style={{ fontSize: 9.5, fontWeight: 600, color: isWeekend(d) ? HNH.red : HNH.ink3 }}>{shortDay(d)}</div>
              <div style={{ fontSize: 13, fontWeight: d === today ? 800 : 600, color: d === today ? HNH.red : HNH.ink }}>{dayNum(d)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Employee rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {data.employees.map(emp => (
          <div key={emp.id} style={{ display: 'flex', borderBottom: `1px solid ${HNH.line}` }}>
            {/* Name column — sticky */}
            <div style={{
              width: NAME_W, flexShrink: 0, padding: '0 8px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1,
              height: ROW_H, borderRight: `1px solid ${HNH.line}`,
              position: 'sticky', left: 0, background: '#fff', zIndex: 1,
            }}>
              {/* Tên — prominent */}
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {emp.first_name || emp.name.split(' ').slice(-1)[0]}
              </div>
              {/* Họ đệm — small */}
              {(emp.last_name || emp.name.split(' ').length > 1) && (
                <div style={{ fontSize: 10, color: HNH.ink3, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {emp.last_name || emp.name.split(' ').slice(0, -1).join(' ')}
                </div>
              )}
              {/* Mã NV — smallest */}
              <div style={{ fontSize: 9.5, color: HNH.ink4, fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {emp.badge_id}
              </div>
            </div>

            {/* Day cells */}
            <div style={{ flex: 1, overflowX: 'auto', display: 'flex' }}>
              {days.map(d => {
                const key = `${emp.id}_${d}`
                const plan = data.plans[key]
                const req = data.requests[key]
                const isToday = d === today

                let bg: string = isWeekend(d) ? '#fafafa' : '#fff'
                let label = ''
                let labelColor: string = HNH.ink3
                let dotColor: string = ''

                if (plan) {
                  bg = '#ecfdf5'
                  label = plan.shift_name.length > 6 ? plan.shift_name.slice(0, 5) + '…' : plan.shift_name
                  labelColor = '#059669'
                } else if (req) {
                  if (req.status === 'pending') {
                    bg = '#fffbeb'
                    label = '⏳'
                    labelColor = HNH.warn
                    dotColor = HNH.warn
                  } else if (req.status === 'rejected') {
                    bg = HNH.red50
                    label = '✗'
                    labelColor = HNH.red
                  }
                }

                if (isToday) bg = plan ? '#d1fae5' : req ? '#fef3c7' : HNH.red50

                return (
                  <button
                    key={d}
                    onClick={() => onCellClick(emp.id, emp.name, emp.department_id, d, plan)}
                    style={{
                      width: CELL_W, height: ROW_H, flexShrink: 0,
                      border: 'none', borderLeft: `1px solid ${HNH.line}`,
                      background: bg, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 1,
                      padding: 2,
                    }}
                  >
                    {label ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: labelColor, lineHeight: 1.2, textAlign: 'center' }}>
                        {label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 16, color: HNH.line }}>+</span>
                    )}
                    {dotColor && <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {data.employees.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
            Không có nhân viên nào trong phạm vi quản lý
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pending Tab ───────────────────────────────────────────────────────────────

interface PendingTabProps {
  requests: PendingRequest[]
  allShifts: ShiftOption[]
  onApprove: (req: PendingRequest) => void
  onReject: (reqId: number) => void
  rejecting: number | null
}

function PendingTab({ requests, allShifts, onApprove, onReject, rejecting }: PendingTabProps) {
  const shiftMap = Object.fromEntries(allShifts.map(s => [s.id, s.name]))

  if (requests.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
        <Icon name="check" size={40} color={HNH.success} stroke={1.5} />
        <div style={{ fontSize: 14, color: HNH.ink3, fontWeight: 600 }}>Không có đề xuất nào chờ duyệt</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 32px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {requests.map(req => (
          <div
            key={req.id}
            style={{
              background: '#fff', borderRadius: 14,
              border: `1px solid ${HNH.line}`,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{req.employee_name}</div>
                <div style={{ fontSize: 12, color: HNH.red, fontWeight: 600, marginTop: 2 }}>
                  {shiftMap[req.shift_id] ?? `Ca #${req.shift_id}`}
                </div>
                <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2 }}>
                  {req.date.slice(8)}/{req.date.slice(5, 7)}/{req.date.slice(0, 4)}
                </div>
                {req.note && (
                  <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 3, fontStyle: 'italic' }}>
                    "{req.note}"
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 2 }}>
                <button
                  onClick={() => onReject(req.id)}
                  disabled={rejecting === req.id}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    border: `1.5px solid ${HNH.red}30`, background: HNH.red50,
                    fontSize: 12, fontWeight: 600, color: HNH.red,
                    cursor: rejecting === req.id ? 'not-allowed' : 'pointer',
                    opacity: rejecting === req.id ? 0.6 : 1,
                  }}
                >
                  Từ chối
                </button>
                <button
                  onClick={() => onApprove(req)}
                  style={{
                    padding: '6px 12px', borderRadius: 8,
                    border: 'none', background: HNH.success,
                    fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
                  }}
                >
                  Duyệt
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ShiftPlannerPage() {
  const navigate = useNavigate()
  const { toast: showToast } = useToast()
  const today = todayStr()

  const [month, setMonth] = useState(() => monthStr(0))
  const [deptId, setDeptId] = useState<number | null>(null)
  const [data, setData] = useState<PlannerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewTab, setViewTab] = useState<ViewTab>('grid')

  const [assignModal, setAssignModal] = useState<{
    empId: number; empName: string; deptId: number; date: string
    planCell?: PlanCell
  } | null>(null)

  const [approveModal, setApproveModal] = useState<PendingRequest | null>(null)
  const [rejecting, setRejecting] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month })
      if (deptId) params.set('dept_id', String(deptId))
      const res = await api.get<PlannerData>(`/api/employee/shift-planner/?${params}`)
      setData(res)
    } catch {
      showToast('Không thể tải dữ liệu phân ca')
    } finally {
      setLoading(false)
    }
  }, [month, deptId, showToast])

  useEffect(() => { load() }, [load])

  const days = daysInMonth(month)

  const handleCellClick = (empId: number, empName: string, empDeptId: number, date: string, planCell?: PlanCell) => {
    setAssignModal({ empId, empName, deptId: empDeptId, date, planCell })
  }

  const handleRejectQuick = async (reqId: number) => {
    setRejecting(reqId)
    try {
      await api.patch('/api/employee/shift-planner/', { action: 'reject', request_id: reqId })
      showToast('Đã từ chối')
      load()
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi từ chối')
    } finally {
      setRejecting(null)
    }
  }

  const pendingCount = data?.pending_requests?.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: HNH.cream, overflow: 'hidden' }}>
      <TopBar title="Phân Ca Nhân Viên" onBack={() => navigate(-1)} />

      {/* Filters */}
      <div style={{ background: '#fff', padding: '10px 16px', borderBottom: `1px solid ${HNH.line}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Month picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: HNH.cream, borderRadius: 10, padding: '6px 10px' }}>
            <button
              onClick={() => setMonth(prev => {
                const d = new Date(prev + '-01'); d.setMonth(d.getMonth() - 1)
                return d.toISOString().slice(0, 7)
              })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <Icon name="chev-l" size={16} color={HNH.ink2} stroke={2} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, minWidth: 72, textAlign: 'center' }}>
              {month.slice(5)}/{month.slice(0, 4)}
            </span>
            <button
              onClick={() => setMonth(prev => {
                const d = new Date(prev + '-01'); d.setMonth(d.getMonth() + 1)
                return d.toISOString().slice(0, 7)
              })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <Icon name="chev-r" size={16} color={HNH.ink2} stroke={2} />
            </button>
          </div>

          {/* Dept filter */}
          {data && data.departments.length > 1 && (
            <select
              value={deptId ?? ''}
              onChange={e => setDeptId(e.target.value ? Number(e.target.value) : null)}
              style={{
                flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 10,
                border: `1.5px solid ${HNH.line}`, fontSize: 13, color: HNH.ink,
                background: '#fff', outline: 'none',
              }}
            >
              <option value="">Tất cả phòng ban</option>
              {data.departments.map(d => (
                <option key={d.id} value={d.id}>{d.department}</option>
              ))}
            </select>
          )}

          {/* Tab toggle */}
          <div style={{ display: 'flex', background: HNH.cream2, borderRadius: 10, padding: 3, border: `1px solid ${HNH.line}` }}>
            {(['grid', 'pending'] as ViewTab[]).map(t => (
              <button
                key={t}
                onClick={() => setViewTab(t)}
                style={{
                  position: 'relative', padding: '5px 10px', borderRadius: 8, border: 'none',
                  background: viewTab === t ? '#fff' : 'transparent',
                  fontSize: 12, fontWeight: 600, color: viewTab === t ? HNH.ink : HNH.ink3,
                  cursor: 'pointer',
                  boxShadow: viewTab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t === 'grid' ? 'Lịch' : 'Chờ duyệt'}
                {t === 'pending' && pendingCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: HNH.red, color: '#fff',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: 9, fontWeight: 700, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${HNH.line}`, borderTopColor: HNH.red, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : data ? (
        viewTab === 'grid' ? (
          <GridView
            data={data}
            days={days}
            onCellClick={handleCellClick}
            today={today}
          />
        ) : (
          <PendingTab
            requests={data.pending_requests}
            allShifts={data.all_shifts}
            onApprove={req => setApproveModal(req)}
            onReject={handleRejectQuick}
            rejecting={rejecting}
          />
        )
      ) : null}

      {/* Legend */}
      {viewTab === 'grid' && !loading && (
        <div style={{
          background: '#fff', borderTop: `1px solid ${HNH.line}`,
          padding: '8px 16px', display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0,
        }}>
          {[
            { bg: '#ecfdf5', color: '#059669', label: 'Đã phân' },
            { bg: '#fffbeb', color: HNH.warn, label: 'Chờ duyệt' },
            { bg: HNH.red50, color: HNH.red, label: 'Từ chối' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: item.bg, border: `1px solid ${item.color}30` }} />
              <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{item.label}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          {data && (
            <div style={{ fontSize: 11, color: HNH.ink4 }}>
              {data.is_hr ? 'HR' : data.is_manager ? 'Quản lý' : 'Nhân viên'}
            </div>
          )}
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && data && (
        <AssignModal
          empId={assignModal.empId}
          empName={assignModal.empName}
          deptId={assignModal.deptId}
          date={assignModal.date}
          isManager={data.is_manager}
          isHr={data.is_hr}
          allShifts={data.all_shifts}
          deptShifts={data.dept_shifts}
          existingPlanId={assignModal.planCell?.plan_id}
          existingShiftId={assignModal.planCell?.shift_id}
          onClose={() => setAssignModal(null)}
          onAssigned={() => { setAssignModal(null); load() }}
        />
      )}

      {/* Approve Modal */}
      {approveModal && data && (
        <ApproveModal
          request={approveModal}
          allShifts={data.all_shifts}
          onClose={() => setApproveModal(null)}
          onDone={() => { setApproveModal(null); load() }}
        />
      )}
    </div>
  )
}
