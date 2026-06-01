import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

/* ── Types ── */
type ApprovalTab = 'leave' | 'shift' | 'worktype' | 'attendance' | 'asset'

interface LeaveRequest {
  id: number
  employee_id: number
  employee_name: string
  badge_id: string | null
  leave_type: string | null
  start_date: string | null
  end_date: string | null
  requested_days: number | null
  description: string
  status: string
  requested_date: string | null
  start_date_breakdown: string
  end_date_breakdown: string
}

interface ShiftRequest {
  id: number
  employee_id: number
  employee_first_name: string
  employee_last_name: string
  shift_name: string | null
  previous_shift_name: string | null
  requested_date: string | null
  requested_till: string | null
  is_permanent_shift: boolean
  description: string | null
  approved: boolean
  canceled: boolean
}

interface WorkTypeRequest {
  id: number
  employee_id: number
  employee_first_name: string
  employee_last_name: string
  work_type_name: string | null
  previous_work_type_name: string | null
  requested_date: string | null
  requested_till: string | null
  is_permanent_work_type: boolean
  description: string | null
  approved: boolean
  canceled: boolean
}

interface AttendanceRequest {
  id: number
  employee_id: number
  employee_first_name: string
  employee_last_name: string
  badge_id: string | null
  attendance_date: string | null
  attendance_clock_in: string | null
  attendance_clock_out: string | null
  attendance_clock_in_date: string | null
  attendance_clock_out_date: string | null
  attendance_worked_hour: string | null
  shift_name: string | null
  request_description: string | null
  requested_data: string | null
}

interface AssetApprovalRequest {
  id: number
  asset_category_id: { id: number; asset_category_name: string }
  requested_employee_id: { id: number; full_name: string; badge_id: string | null }
  description: string | null
  asset_request_status: string
  asset_request_date: string | null
}

interface PaginatedResponse<T> { count: number; results: T[] }

const TABS: { id: ApprovalTab; label: string; icon: string }[] = [
  { id: 'leave', label: 'Nghỉ phép', icon: 'palm' },
  { id: 'shift', label: 'Đổi Ca', icon: 'clock' },
  { id: 'worktype', label: 'Loại CV', icon: 'briefcase' },
  { id: 'attendance', label: 'Ngày công', icon: 'cal' },
  { id: 'asset', label: 'Tài sản', icon: 'monitor' },
]

const BREAKDOWN_VI: Record<string, string> = {
  full_day: 'Cả ngày',
  first_half: 'Nửa sáng',
  second_half: 'Nửa chiều',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function daysSince(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return '1 ngày trước'
  return `${diff} ngày trước`
}

/* ── Leave Card ── */
function LeaveCard({ req, onTap }: { req: LeaveRequest; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '14px 16px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: HNH.warn50 }}
        >
          <Icon name="palm" size={20} color={HNH.warn} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{req.employee_name}</span>
            {req.badge_id && (
              <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>{req.badge_id}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, marginTop: 2 }}>
            {req.leave_type || 'Nghỉ phép'}
            {req.requested_days ? ` · ${req.requested_days} ngày` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {formatDate(req.start_date)}
            {req.end_date && req.end_date !== req.start_date ? ` → ${formatDate(req.end_date)}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: HNH.warn,
            background: HNH.warn50, borderRadius: 6, padding: '2px 7px',
          }}>
            Chờ duyệt
          </div>
          <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 4 }}>
            {daysSince(req.requested_date)}
          </div>
        </div>
      </div>
    </button>
  )
}

/* ── Shift Card ── */
function ShiftCard({ req, onTap }: { req: ShiftRequest; onTap: () => void }) {
  const name = `${req.employee_first_name} ${req.employee_last_name}`.trim()
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '14px 16px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: '#faf1d6' }}
        >
          <Icon name="clock" size={20} color="#a87908" stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{name}</div>
          <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, marginTop: 2 }}>
            {req.previous_shift_name || '—'} → {req.shift_name || '—'}
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {formatDate(req.requested_date)}
            {req.requested_till ? ` → ${formatDate(req.requested_till)}` : ''}
            {req.is_permanent_shift ? ' · Vĩnh viễn' : ' · Tạm thời'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: HNH.warn,
            background: HNH.warn50, borderRadius: 6, padding: '2px 7px',
          }}>
            Chờ duyệt
          </div>
          <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 4 }}>
            {daysSince(req.requested_date)}
          </div>
        </div>
      </div>
    </button>
  )
}

/* ── WorkType Card ── */
function WorkTypeCard({ req, onTap }: { req: WorkTypeRequest; onTap: () => void }) {
  const name = `${req.employee_first_name} ${req.employee_last_name}`.trim()
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '14px 16px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: HNH.navy50 }}
        >
          <Icon name="briefcase" size={20} color={HNH.navy} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{name}</div>
          <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, marginTop: 2 }}>
            {req.previous_work_type_name || '—'} → {req.work_type_name || '—'}
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {formatDate(req.requested_date)}
            {req.requested_till ? ` → ${formatDate(req.requested_till)}` : ''}
            {req.is_permanent_work_type ? ' · Vĩnh viễn' : ' · Tạm thời'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: HNH.warn,
            background: HNH.warn50, borderRadius: 6, padding: '2px 7px',
          }}>
            Chờ duyệt
          </div>
          <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 4 }}>
            {daysSince(req.requested_date)}
          </div>
        </div>
      </div>
    </button>
  )
}

/* ── Asset Card ── */
function AssetApprovalCard({ req, onTap }: { req: AssetApprovalRequest; onTap: () => void }) {
  const name = req.requested_employee_id?.full_name || '—'
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '14px 16px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: HNH.red50 }}
        >
          <Icon name="monitor" size={20} color={HNH.red} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{name}</span>
            {req.requested_employee_id?.badge_id && (
              <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>
                {req.requested_employee_id.badge_id}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, marginTop: 2 }}>
            {req.asset_category_id?.asset_category_name || 'Tài sản'}
          </div>
          {req.description && (
            <div style={{
              fontSize: 11, color: HNH.ink3, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {req.description}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: HNH.warn,
            background: HNH.warn50, borderRadius: 6, padding: '2px 7px',
          }}>
            Chờ duyệt
          </div>
          <div style={{ fontSize: 10, color: HNH.ink3, marginTop: 4 }}>
            {daysSince(req.asset_request_date)}
          </div>
        </div>
      </div>
    </button>
  )
}

/* ── Attendance Card ── */
function AttendanceCard({ req, onTap }: { req: AttendanceRequest; onTap: () => void }) {
  const name = `${req.employee_first_name} ${req.employee_last_name}`.trim()
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '14px 16px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: HNH.success50 }}
        >
          <Icon name="cal" size={20} color={HNH.success} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{name}</span>
            {req.badge_id && (
              <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>{req.badge_id}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, marginTop: 2 }}>
            {formatDate(req.attendance_date)}
            {req.attendance_clock_in ? ` · ${req.attendance_clock_in}` : ''}
            {req.attendance_clock_out ? ` → ${req.attendance_clock_out}` : ''}
          </div>
          {req.request_description && (
            <div style={{
              fontSize: 11, color: HNH.ink3, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {req.request_description}
            </div>
          )}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: HNH.warn,
          background: HNH.warn50, borderRadius: 6, padding: '2px 7px', flexShrink: 0,
        }}>
          Chờ duyệt
        </div>
      </div>
    </button>
  )
}

/* ── Detail Modals ── */
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{value}</div>
    </div>
  )
}

function ModalShell({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto',
        borderRadius: '24px 24px 0 0', background: HNH.cream,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
      }}>
        <div className="flex items-center justify-between" style={{
          padding: '14px 16px', background: '#fff',
          borderBottom: `1px solid ${HNH.line}`,
          borderRadius: '24px 24px 0 0',
        }}>
          <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}>
            <Icon name="x" size={17} color={HNH.ink} stroke={2} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{title}</div>
          <div style={{ width: 34 }} />
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  )
}

function ApproveRejectActions({ acting, onApprove, onReject }: {
  acting: boolean
  onApprove: () => void
  onReject: (reason: string) => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')

  if (showReject) {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: HNH.red, marginBottom: 6 }}>
          Lý do từ chối *
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Nhập lý do từ chối..."
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: `1.5px solid ${HNH.red}`, background: '#fff',
            fontSize: 13, color: HNH.ink, outline: 'none',
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        <div className="flex gap-3" style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowReject(false)}
            className="flex-1 border-none cursor-pointer"
            style={{
              padding: '12px', borderRadius: 12,
              background: HNH.cream2, color: HNH.ink2,
              fontSize: 13, fontWeight: 700, border: `1px solid ${HNH.line}`,
            }}
          >
            Hủy
          </button>
          <button
            onClick={() => { if (reason.trim()) onReject(reason) }}
            disabled={!reason.trim() || acting}
            className="flex-1 border-none cursor-pointer"
            style={{
              padding: '12px', borderRadius: 12,
              background: reason.trim() ? HNH.red : HNH.cream2,
              color: reason.trim() ? '#fff' : HNH.ink3,
              fontSize: 13, fontWeight: 700, opacity: acting ? 0.6 : 1,
            }}
          >
            Xác nhận Từ chối
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3" style={{ marginTop: 20 }}>
      <button
        onClick={onApprove}
        disabled={acting}
        className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
        style={{
          padding: '13px', borderRadius: 12,
          background: HNH.success, color: '#fff',
          fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
        }}
      >
        <Icon name="check" size={16} color="#fff" stroke={2.5} />
        Duyệt
      </button>
      <button
        onClick={() => setShowReject(true)}
        disabled={acting}
        className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
        style={{
          padding: '13px', borderRadius: 12,
          background: HNH.red, color: '#fff',
          fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
        }}
      >
        <Icon name="x" size={16} color="#fff" stroke={2.5} />
        Từ chối
      </button>
    </div>
  )
}

function EmployeeAvatar({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
      <div className="flex items-center justify-center"
        style={{ width: 44, height: 44, borderRadius: 13, background: HNH.navy50 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: HNH.navy }}>
          {(name[0] || '?').toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{name}</div>
    </div>
  )
}

/* ── Leave Detail Modal ── */
function LeaveDetailModal({ req, onClose, onAction }: {
  req: LeaveRequest; onClose: () => void
  onAction: (action: 'approve' | 'reject', reason?: string) => void
}) {
  const [acting, setActing] = useState(false)
  return (
    <ModalShell title="Phê duyệt nghỉ phép" onClose={onClose}>
      <EmployeeAvatar name={req.employee_name} />
      <div style={{
        background: '#fff', borderRadius: 16, padding: 14, border: `1px solid ${HNH.line}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
      }}>
        <DetailField label="Loại nghỉ" value={req.leave_type || '—'} />
        <DetailField label="Số ngày" value={req.requested_days ? `${req.requested_days} ngày` : '—'} />
        <DetailField label="Từ ngày" value={`${formatDate(req.start_date)} (${BREAKDOWN_VI[req.start_date_breakdown] || ''})`} />
        <DetailField label="Đến ngày" value={`${formatDate(req.end_date)} (${BREAKDOWN_VI[req.end_date_breakdown] || ''})`} />
        <div style={{ gridColumn: '1/-1' }}>
          <DetailField label="Lý do" value={req.description || '—'} />
        </div>
        <DetailField label="Ngày gửi" value={formatDate(req.requested_date)} />
      </div>
      <ApproveRejectActions
        acting={acting}
        onApprove={() => { setActing(true); onAction('approve') }}
        onReject={(r) => { setActing(true); onAction('reject', r) }}
      />
    </ModalShell>
  )
}

/* ── Shift Detail Modal ── */
function ShiftDetailModal({ req, onClose, onAction }: {
  req: ShiftRequest; onClose: () => void
  onAction: (action: 'approve' | 'reject') => void
}) {
  const [acting, setActing] = useState(false)
  const name = `${req.employee_first_name} ${req.employee_last_name}`.trim()
  return (
    <ModalShell title="Phê duyệt đổi ca" onClose={onClose}>
      <EmployeeAvatar name={name} />
      <div style={{
        background: '#fff', borderRadius: 16, padding: 14, border: `1px solid ${HNH.line}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
      }}>
        <DetailField label="Ca hiện tại" value={req.previous_shift_name || '—'} />
        <DetailField label="Ca muốn đổi" value={req.shift_name || '—'} />
        <DetailField label="Ngày bắt đầu" value={formatDate(req.requested_date)} />
        {req.requested_till
          ? <DetailField label="Ngày kết thúc" value={formatDate(req.requested_till)} />
          : <DetailField label="Loại thay đổi" value="Vĩnh viễn" />
        }
        <div style={{ gridColumn: '1/-1' }}>
          <DetailField label="Lý do" value={req.description || '—'} />
        </div>
      </div>
      <div className="flex gap-3" style={{ marginTop: 20 }}>
        <button
          onClick={() => { setActing(true); onAction('approve') }}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '13px', borderRadius: 12,
            background: HNH.success, color: '#fff',
            fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
          }}
        >
          <Icon name="check" size={16} color="#fff" stroke={2.5} />
          Duyệt
        </button>
        <button
          onClick={() => { setActing(true); onAction('reject') }}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '13px', borderRadius: 12,
            background: HNH.red, color: '#fff',
            fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
          }}
        >
          <Icon name="x" size={16} color="#fff" stroke={2.5} />
          Từ chối
        </button>
      </div>
    </ModalShell>
  )
}

/* ── WorkType Detail Modal ── */
function WorkTypeDetailModal({ req, onClose, onAction }: {
  req: WorkTypeRequest; onClose: () => void
  onAction: (action: 'approve' | 'reject') => void
}) {
  const [acting, setActing] = useState(false)
  const name = `${req.employee_first_name} ${req.employee_last_name}`.trim()
  return (
    <ModalShell title="Phê duyệt loại công việc" onClose={onClose}>
      <EmployeeAvatar name={name} />
      <div style={{
        background: '#fff', borderRadius: 16, padding: 14, border: `1px solid ${HNH.line}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
      }}>
        <DetailField label="Loại CV hiện tại" value={req.previous_work_type_name || '—'} />
        <DetailField label="Loại CV muốn đổi" value={req.work_type_name || '—'} />
        <DetailField label="Ngày bắt đầu" value={formatDate(req.requested_date)} />
        {req.requested_till
          ? <DetailField label="Ngày kết thúc" value={formatDate(req.requested_till)} />
          : <DetailField label="Loại thay đổi" value="Vĩnh viễn" />
        }
        <div style={{ gridColumn: '1/-1' }}>
          <DetailField label="Lý do" value={req.description || '—'} />
        </div>
      </div>
      <div className="flex gap-3" style={{ marginTop: 20 }}>
        <button
          onClick={() => { setActing(true); onAction('approve') }}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '13px', borderRadius: 12,
            background: HNH.success, color: '#fff',
            fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
          }}
        >
          <Icon name="check" size={16} color="#fff" stroke={2.5} />
          Duyệt
        </button>
        <button
          onClick={() => { setActing(true); onAction('reject') }}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '13px', borderRadius: 12,
            background: HNH.red, color: '#fff',
            fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
          }}
        >
          <Icon name="x" size={16} color="#fff" stroke={2.5} />
          Từ chối
        </button>
      </div>
    </ModalShell>
  )
}

/* ── Asset Detail Modal ── */
function AssetDetailModal({ req, onClose, onReject }: {
  req: AssetApprovalRequest; onClose: () => void
  onReject: () => void
}) {
  const [acting, setActing] = useState(false)
  const name = req.requested_employee_id?.full_name || '—'
  return (
    <ModalShell title="Yêu cầu tài sản" onClose={onClose}>
      <EmployeeAvatar name={name} />
      <div style={{
        background: '#fff', borderRadius: 16, padding: 14, border: `1px solid ${HNH.line}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
      }}>
        <DetailField label="Loại tài sản" value={req.asset_category_id?.asset_category_name || '—'} />
        <DetailField label="Ngày gửi" value={formatDate(req.asset_request_date)} />
        <div style={{ gridColumn: '1/-1' }}>
          <DetailField label="Mô tả" value={req.description || '—'} />
        </div>
      </div>
      <div style={{
        background: HNH.warn50, borderRadius: 12, padding: '10px 14px',
        fontSize: 12, fontWeight: 600, color: '#a87908', marginTop: 16,
      }}>
        Duyệt cấp tài sản cần chọn tài sản cụ thể — vui lòng duyệt trên hệ thống web.
      </div>
      <button
        onClick={() => { setActing(true); onReject() }}
        disabled={acting}
        className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
        style={{
          marginTop: 12, padding: '13px', borderRadius: 12,
          background: HNH.red, color: '#fff',
          fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
        }}
      >
        <Icon name="x" size={16} color="#fff" stroke={2.5} />
        Từ chối yêu cầu
      </button>
    </ModalShell>
  )
}

/* ── Attendance Detail Modal ── */
function AttendanceDetailModal({ req, onClose, onAction }: {
  req: AttendanceRequest; onClose: () => void
  onAction: (action: 'approve' | 'reject') => void
}) {
  const [acting, setActing] = useState(false)
  const name = `${req.employee_first_name} ${req.employee_last_name}`.trim()

  let requestedIn = req.attendance_clock_in
  let requestedOut = req.attendance_clock_out
  if (req.requested_data) {
    try {
      const rd = JSON.parse(req.requested_data)
      if (rd.attendance_clock_in) requestedIn = rd.attendance_clock_in
      if (rd.attendance_clock_out) requestedOut = rd.attendance_clock_out
    } catch { /* ignore */ }
  }

  return (
    <ModalShell title="Phê duyệt ngày công" onClose={onClose}>
      <EmployeeAvatar name={name} />
      <div style={{
        background: '#fff', borderRadius: 16, padding: 14, border: `1px solid ${HNH.line}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
      }}>
        <DetailField label="Ngày" value={formatDate(req.attendance_date)} />
        <DetailField label="Ca" value={req.shift_name || '—'} />
        <DetailField label="Giờ vào (yêu cầu)" value={requestedIn || '—'} />
        <DetailField label="Giờ ra (yêu cầu)" value={requestedOut || '—'} />
        {req.attendance_clock_in && req.requested_data && (
          <>
            <DetailField label="Giờ vào (hiện tại)" value={req.attendance_clock_in || '—'} />
            <DetailField label="Giờ ra (hiện tại)" value={req.attendance_clock_out || '—'} />
          </>
        )}
        <div style={{ gridColumn: '1/-1' }}>
          <DetailField label="Lý do" value={req.request_description || '—'} />
        </div>
      </div>
      <div className="flex gap-3" style={{ marginTop: 20 }}>
        <button
          onClick={() => { setActing(true); onAction('approve') }}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '13px', borderRadius: 12,
            background: HNH.success, color: '#fff',
            fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
          }}
        >
          <Icon name="check" size={16} color="#fff" stroke={2.5} />
          Duyệt
        </button>
        <button
          onClick={() => { setActing(true); onAction('reject') }}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '13px', borderRadius: 12,
            background: HNH.red, color: '#fff',
            fontSize: 13.5, fontWeight: 700, opacity: acting ? 0.6 : 1,
          }}
        >
          <Icon name="x" size={16} color="#fff" stroke={2.5} />
          Từ chối
        </button>
      </div>
    </ModalShell>
  )
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <Icon name="check" size={40} color={HNH.success} stroke={1.5} />
      <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
        Không có đề xuất nào chờ duyệt
      </div>
      <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
        Các đề xuất mới sẽ hiển thị tại đây
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function ApprovalsPage() {
  const [tab, setTab] = useState<ApprovalTab>('leave')
  const [leaveReqs, setLeaveReqs] = useState<LeaveRequest[]>([])
  const [shiftReqs, setShiftReqs] = useState<ShiftRequest[]>([])
  const [wtReqs, setWtReqs] = useState<WorkTypeRequest[]>([])
  const [attReqs, setAttReqs] = useState<AttendanceRequest[]>([])
  const [assetReqs, setAssetReqs] = useState<AssetApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null)
  const [selectedShift, setSelectedShift] = useState<ShiftRequest | null>(null)
  const [selectedWt, setSelectedWt] = useState<WorkTypeRequest | null>(null)
  const [selectedAtt, setSelectedAtt] = useState<AttendanceRequest | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<AssetApprovalRequest | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [leaveData, shiftData, wtData, attData, assetData] = await Promise.all([
        api.get<LeaveRequest[]>('/api/leave/pending-approvals/'),
        api.get<PaginatedResponse<ShiftRequest>>('/api/base/shift-requests/?approved=false&canceled=false&page_size=100'),
        api.get<PaginatedResponse<WorkTypeRequest>>('/api/base/worktype-requests/?approved=false&canceled=false&page_size=100'),
        api.get<PaginatedResponse<AttendanceRequest>>('/api/attendance/attendance-request/?page_size=100'),
        api.get<PaginatedResponse<AssetApprovalRequest>>('/api/asset/asset-requests/?asset_request_status=Requested&page_size=100'),
      ])
      setLeaveReqs(leaveData)
      setShiftReqs(shiftData.results)
      setWtReqs(wtData.results)
      setAttReqs(attData.results)
      setAssetReqs(assetData.results)
    } catch {
      setLeaveReqs([])
      setShiftReqs([])
      setWtReqs([])
      setAttReqs([])
      setAssetReqs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalPending = leaveReqs.length + shiftReqs.length + wtReqs.length + attReqs.length + assetReqs.length

  const handleLeaveAction = async (action: 'approve' | 'reject', reason?: string) => {
    if (!selectedLeave) return
    try {
      if (action === 'approve') {
        await api.post(`/api/leave/pwa-approve/${selectedLeave.id}/`, {})
      } else {
        await api.post(`/api/leave/pwa-reject/${selectedLeave.id}/`, { reason })
      }
      setSelectedLeave(null)
      fetchAll()
    } catch { /* ignore */ }
  }

  const handleShiftAction = async (action: 'approve' | 'reject') => {
    if (!selectedShift) return
    try {
      if (action === 'approve') {
        await api.put(`/api/base/shift-request-approve/${selectedShift.id}`, {})
      } else {
        await api.post(`/api/base/shift-request-cancel/${selectedShift.id}`, {})
      }
      setSelectedShift(null)
      fetchAll()
    } catch { /* ignore */ }
  }

  const handleWtAction = async (action: 'approve' | 'reject') => {
    if (!selectedWt) return
    try {
      if (action === 'approve') {
        await api.put(`/api/base/worktype-requests-approve/${selectedWt.id}/`, {})
      } else {
        await api.put(`/api/base/worktype-requests-cancel/${selectedWt.id}/`, {})
      }
      setSelectedWt(null)
      fetchAll()
    } catch { /* ignore */ }
  }

  const handleAttAction = async (action: 'approve' | 'reject') => {
    if (!selectedAtt) return
    try {
      if (action === 'approve') {
        await api.put(`/api/attendance/attendance-request-approve/${selectedAtt.id}`, {})
      } else {
        await api.put(`/api/attendance/attendance-request-cancel/${selectedAtt.id}`, {})
      }
      setSelectedAtt(null)
      fetchAll()
    } catch { /* ignore */ }
  }

  const handleAssetReject = async () => {
    if (!selectedAsset) return
    try {
      await api.put(`/api/asset/asset-reject/${selectedAsset.id}`, {})
      setSelectedAsset(null)
      fetchAll()
    } catch { /* ignore */ }
  }

  const tabCounts: Record<ApprovalTab, number> = {
    leave: leaveReqs.length,
    shift: shiftReqs.length,
    worktype: wtReqs.length,
    attendance: attReqs.length,
    asset: assetReqs.length,
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Phê duyệt"
        trailing={
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: totalPending > 0 ? HNH.warn : HNH.ink3,
            background: totalPending > 0 ? HNH.warn50 : HNH.cream2,
            borderRadius: 8, padding: '4px 10px',
          }}>
            {totalPending} chờ duyệt
          </div>
        }
      />

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 16px', maxWidth: 600, margin: '0 auto',
        borderBottom: `1.5px solid ${HNH.line}`,
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          const count = tabCounts[t.id]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center justify-center gap-1.5 border-none cursor-pointer"
              style={{
                flex: 1, padding: '10px 4px', background: 'transparent',
                borderBottom: active ? `2.5px solid ${HNH.navy}` : '2.5px solid transparent',
                marginBottom: -1.5,
              }}
            >
              <Icon name={t.icon} size={14} color={active ? HNH.navy : HNH.ink3} stroke={2} />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: active ? HNH.navy : HNH.ink3,
              }}>
                {t.label}
              </span>
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#fff',
                  background: active ? HNH.navy : HNH.ink3,
                  borderRadius: 6, padding: '1px 5px', minWidth: 16, textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '12px 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : (
          <>
            {/* Leave tab */}
            {tab === 'leave' && (
              leaveReqs.length === 0 ? <EmptyState /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {leaveReqs.map(r => (
                    <LeaveCard key={r.id} req={r} onTap={() => setSelectedLeave(r)} />
                  ))}
                </div>
              )
            )}

            {/* Shift tab */}
            {tab === 'shift' && (
              shiftReqs.length === 0 ? <EmptyState /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {shiftReqs.map(r => (
                    <ShiftCard key={r.id} req={r} onTap={() => setSelectedShift(r)} />
                  ))}
                </div>
              )
            )}

            {/* WorkType tab */}
            {tab === 'worktype' && (
              wtReqs.length === 0 ? <EmptyState /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {wtReqs.map(r => (
                    <WorkTypeCard key={r.id} req={r} onTap={() => setSelectedWt(r)} />
                  ))}
                </div>
              )
            )}

            {/* Attendance tab */}
            {tab === 'attendance' && (
              attReqs.length === 0 ? <EmptyState /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {attReqs.map(r => (
                    <AttendanceCard key={r.id} req={r} onTap={() => setSelectedAtt(r)} />
                  ))}
                </div>
              )
            )}

            {/* Asset tab */}
            {tab === 'asset' && (
              assetReqs.length === 0 ? <EmptyState /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {assetReqs.map(r => (
                    <AssetApprovalCard key={r.id} req={r} onTap={() => setSelectedAsset(r)} />
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>

      {selectedLeave && (
        <LeaveDetailModal
          req={selectedLeave}
          onClose={() => setSelectedLeave(null)}
          onAction={handleLeaveAction}
        />
      )}
      {selectedShift && (
        <ShiftDetailModal
          req={selectedShift}
          onClose={() => setSelectedShift(null)}
          onAction={handleShiftAction}
        />
      )}
      {selectedWt && (
        <WorkTypeDetailModal
          req={selectedWt}
          onClose={() => setSelectedWt(null)}
          onAction={handleWtAction}
        />
      )}
      {selectedAtt && (
        <AttendanceDetailModal
          req={selectedAtt}
          onClose={() => setSelectedAtt(null)}
          onAction={handleAttAction}
        />
      )}
      {selectedAsset && (
        <AssetDetailModal
          req={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onReject={handleAssetReject}
        />
      )}
    </div>
  )
}
