import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'
import { EmployeeSearchSelect } from '../components/ui/EmployeeSearchSelect'

interface TeamEmployee {
  id: number
  name: string
  badge_id: string
  department: string
}

interface LeaveSummary {
  scope: 'cnb' | 'manager' | 'employee'
}

interface Proposal {
  id: number
  employee_id: number
  employee_name: string
  company?: string | null
  department?: string | null
  proposed_by_name: string
  days: number
  note: string
  status: 'requested' | 'approved' | 'rejected'
  reject_reason: string
  approved_by_name: string
  approved_at: string | null
  created_at: string | null
}

interface ApprovedLeave {
  id: number
  employee_id: number
  employee_name: string
  badge_id: string
  accounting_code?: string
  company?: string | null
  department?: string | null
  leave_type: string
  start_date: string
  end_date: string
  requested_days: number | null
  description: string
  status?: string
  has_conflict: boolean
  worked_days: string[]
  requested_date?: string | null
  approved_at?: string | null
  seen?: boolean
}

function fmtDate(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function fmtDateTime(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${fmtDate(s)}`
}

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function StatusBadge({ status }: { status: Proposal['status'] }) {
  if (status === 'approved') return <Badge tone="success" size="s">Đã duyệt</Badge>
  if (status === 'rejected') return <Badge tone="red" size="s">Từ chối</Badge>
  return <Badge tone="warn" size="s">Chờ duyệt</Badge>
}

function ProposalCard({ proposal, isCnb, onApprove, onReject, onDelete }: {
  proposal: Proposal
  isCnb: boolean
  onApprove?: (id: number) => void
  onReject?: (id: number, reason: string) => void
  onDelete?: (id: number) => void
}) {
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
      border: `1px solid ${HNH.line}`,
      boxShadow: proposal.status === 'requested' ? '0 2px 8px rgba(15,20,40,0.05)' : 'none',
    }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{proposal.employee_name}</div>
          {(proposal.company || proposal.department) && <div style={{ fontSize: 11, color: HNH.navy, marginTop: 1 }}>{[proposal.department, proposal.company].filter(Boolean).join(' · ')}</div>}
          <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{proposal.proposed_by_name && `Do: ${proposal.proposed_by_name}`}</div>
        </div>
        <StatusBadge status={proposal.status} />
      </div>

      <div className="flex items-center gap-4" style={{ marginTop: 10 }}>
        <div style={{ background: HNH.gold + '22', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#a87908', letterSpacing: -0.5 }}>{proposal.days}</div>
          <div style={{ fontSize: 10, color: '#a87908', fontWeight: 600 }}>ngày bù</div>
        </div>
        <div className="flex-1">
          {proposal.note && <div style={{ fontSize: 12.5, color: HNH.ink2, fontStyle: 'italic' }}>"{proposal.note}"</div>}
          {proposal.created_at && <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>Tạo: {fmtDate(proposal.created_at)}</div>}
          {proposal.approved_at && <div style={{ fontSize: 11, color: HNH.success, marginTop: 2 }}>Duyệt: {fmtDate(proposal.approved_at)} · {proposal.approved_by_name}</div>}
          {proposal.status === 'rejected' && proposal.reject_reason && (
            <div style={{ fontSize: 11, color: HNH.red, marginTop: 2 }}>Lý do: {proposal.reject_reason}</div>
          )}
        </div>
      </div>

      {/* Actions */}
      {proposal.status === 'requested' && (
        <div className="flex gap-2" style={{ marginTop: 12 }}>
          {isCnb && (
            <>
              {!showRejectForm ? (
                <>
                  <button
                    onClick={() => onApprove?.(proposal.id)}
                    className="flex-1 flex items-center justify-center gap-1 border-none cursor-pointer"
                    style={{ height: 36, borderRadius: 10, background: HNH.success, color: '#fff', fontWeight: 700, fontSize: 13 }}
                  >
                    <Icon name="check" size={14} color="#fff" stroke={2.5} />
                    Duyệt
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="flex-1 flex items-center justify-center gap-1 border-none cursor-pointer"
                    style={{ height: 36, borderRadius: 10, background: HNH.red50, color: HNH.red, fontWeight: 700, fontSize: 13 }}
                  >
                    Từ chối
                  </button>
                </>
              ) : (
                <div className="flex-1">
                  <input
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Lý do từ chối..."
                    style={{
                      width: '100%', border: `1px solid ${HNH.line}`, borderRadius: 8,
                      padding: '6px 10px', fontSize: 13, color: HNH.ink,
                      fontFamily: 'inherit', marginBottom: 6, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onReject?.(proposal.id, rejectNote); }}
                      className="flex-1 border-none cursor-pointer"
                      style={{ height: 32, borderRadius: 8, background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 12 }}
                    >
                      Xác nhận
                    </button>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="flex-1 border-none cursor-pointer"
                      style={{ height: 32, borderRadius: 8, background: HNH.cream2, color: HNH.ink2, fontWeight: 600, fontSize: 12 }}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {!isCnb && (
            <button
              onClick={() => onDelete?.(proposal.id)}
              className="border-none cursor-pointer"
              style={{ height: 32, borderRadius: 8, background: HNH.cream2, color: HNH.ink3, fontWeight: 600, fontSize: 12, padding: '0 14px' }}
            >
              Xóa
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CreateProposalModal({ employees, onClose, onCreated }: {
  employees: TeamEmployee[]
  onClose: () => void
  onCreated: () => void
}) {
  const [empId, setEmpId] = useState<number | null>(null)
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = empId && parseFloat(days) > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/api/leave/hnh-compensatory/', {
        employee_id: empId,
        days: parseFloat(days),
        note,
      })
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(15,20,40,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', maxHeight: '85dvh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>Đề xuất Phép Bù</div>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer" style={{ color: HNH.ink3 }}>
            <Icon name="close" size={20} color={HNH.ink3} />
          </button>
        </div>

        {error && (
          <div style={{ background: HNH.red50, border: `1px solid ${HNH.red}`, borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: HNH.red }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, marginBottom: 6 }}>NHÂN VIÊN</div>
        <div style={{ marginBottom: 14 }}>
          <EmployeeSearchSelect
            employees={employees.map(e => ({
              id: e.id,
              name: e.name,
              sub: [e.badge_id, e.department].filter(Boolean).join(' · '),
            }))}
            value={empId}
            onChange={id => setEmpId(id)}
            placeholder="Nhập tên hoặc mã NV..."
          />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, marginBottom: 6 }}>SỐ NGÀY BÙ</div>
        <input
          type="number"
          min="0.5"
          step="0.5"
          value={days}
          onChange={e => setDays(e.target.value)}
          placeholder="Ví dụ: 1 hoặc 0.5"
          style={{
            width: '100%', border: `1px solid ${HNH.line}`, borderRadius: 12, padding: '10px 12px',
            fontSize: 14, color: HNH.ink, fontFamily: 'inherit', background: '#fff',
            marginBottom: 14, outline: 'none', boxSizing: 'border-box',
          }}
        />

        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, marginBottom: 6 }}>GHI CHÚ</div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Lý do đề xuất phép bù..."
          style={{
            width: '100%', border: `1px solid ${HNH.line}`, borderRadius: 12, padding: '10px 12px',
            fontSize: 14, color: HNH.ink, fontFamily: 'inherit', background: '#fff',
            marginBottom: 18, outline: 'none', boxSizing: 'border-box', resize: 'none', minHeight: 72,
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full border-none cursor-pointer"
          style={{
            height: 48, borderRadius: 14,
            background: canSubmit ? HNH.red : HNH.cream2,
            color: canSubmit ? '#fff' : HNH.ink3,
            fontWeight: 700, fontSize: 15,
          }}
        >
          {submitting ? 'Đang gửi...' : 'Gửi đề xuất'}
        </button>
      </div>
    </div>
  )
}

interface LeaveDetail {
  id: number; employee_name: string; badge_id: string
  department?: string | null; company?: string | null
  leave_type: string | null; start_date: string | null; end_date: string | null
  is_hourly: boolean; start_time: string | null; end_time: string | null
  requested_days: number | null; requested_hours: number | null
  description: string; status: string; reject_reason: string
  requested_date: string | null; created_by: string | null
  approved_at: string | null; approved_by: string | null
  cancelled_at: string | null; cancelled_by: string | null; cancel_reason: string
  watchers: { id: number; name: string; badge_id: string }[]
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex justify-between gap-3" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
      <span style={{ fontSize: 12.5, color: HNH.ink3, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: HNH.ink, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function LeaveDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [d, setD] = useState<LeaveDetail | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<LeaveDetail>(`/api/leave/hnh-leave-request-detail/${id}/`)
      .then(setD).catch(() => setD(null)).finally(() => setLoading(false))
  }, [id])
  const range = d && d.start_date && d.end_date && d.end_date !== d.start_date
    ? `${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}` : (d ? fmtDate(d.start_date) : '')
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 300, background: 'rgba(0,0,0,0.45)', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', background: '#fff', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: `1px solid ${HNH.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>Chi tiết đơn nghỉ</div>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer" style={{ padding: 4 }}><Icon name="x" size={18} color={HNH.ink3} stroke={2} /></button>
        </div>
        <div style={{ padding: '12px 18px 20px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
          ) : !d ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Không tải được chi tiết đơn.</div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>{d.employee_name}</div>
              <div style={{ fontSize: 11.5, color: HNH.navy, marginBottom: 8 }}>{[d.badge_id, d.department, d.company].filter(Boolean).join(' · ')}</div>
              <DetailRow label="Loại nghỉ" value={d.leave_type} />
              <DetailRow label="Thời gian" value={range} />
              {d.is_hourly && d.start_time && d.end_time && <DetailRow label="Khung giờ" value={`${d.start_time} – ${d.end_time}`} />}
              <DetailRow label="Số ngày" value={d.requested_days != null ? `${d.requested_days} ngày${d.requested_hours ? ` (${d.requested_hours}h)` : ''}` : null} />
              <DetailRow label="Lý do" value={d.description || '—'} />
              <DetailRow label="Người gửi" value={d.created_by} />
              <DetailRow label="Thời gian gửi" value={d.requested_date ? fmtDateTime(d.requested_date) : null} />
              <DetailRow label="Người duyệt" value={d.approved_by || '—'} />
              <DetailRow label="Thời gian duyệt" value={d.approved_at ? fmtDateTime(d.approved_at) : null} />
              {d.status === 'rejected' && <DetailRow label="Lý do từ chối" value={d.reject_reason || '—'} />}
              {d.cancelled_at && <DetailRow label="Đã hủy" value={`${fmtDateTime(d.cancelled_at)}${d.cancelled_by ? ` · ${d.cancelled_by}` : ''}`} />}
              {d.cancel_reason && <DetailRow label="Lý do hủy" value={d.cancel_reason} />}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12.5, color: HNH.ink3, marginBottom: 4 }}>Người theo dõi</div>
                {d.watchers.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: HNH.ink4 }}>Không có</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {d.watchers.map(w => (
                      <span key={w.id} style={{ fontSize: 11.5, fontWeight: 600, color: HNH.navy, background: HNH.navy50, borderRadius: 8, padding: '3px 9px' }}>{w.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Toggle nhanh: đánh dấu đơn đã được C&B xem xét hay chưa.
function SeenToggle({ seen, onToggle }: { seen: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(!seen) }}
      title={seen ? 'Đã C&B xem xét — bấm để bỏ đánh dấu' : 'Chưa xem xét — bấm để đánh dấu đã xem'}
      className="flex items-center gap-1 border-none cursor-pointer"
      style={{
        fontSize: 10, fontWeight: 800, borderRadius: 20, padding: '2px 5px 2px 8px',
        background: seen ? HNH.success50 : HNH.cream2,
        color: seen ? HNH.success : HNH.ink3, letterSpacing: 0.2, whiteSpace: 'nowrap',
      }}
    >
      {seen ? 'Đã xem xét' : 'Chưa xem'}
      <span style={{
        width: 26, height: 15, borderRadius: 10, position: 'relative',
        background: seen ? HNH.success : HNH.line, display: 'inline-block', transition: 'background .15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: seen ? 13 : 2, width: 11, height: 11,
          borderRadius: '50%', background: '#fff', transition: 'left .15s',
        }} />
      </span>
    </button>
  )
}

function ApprovedLeaveCard({ leave, isCnb, onCancel, onMarkSeen }: {
  leave: ApprovedLeave
  isCnb: boolean
  onCancel: (id: number, reason: string) => void
  onMarkSeen: (id: number, seen: boolean) => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const [reason, setReason] = useState('')
  const [showForm, setShowForm] = useState(false)
  const range = leave.end_date && leave.end_date !== leave.start_date
    ? `${fmtDate(leave.start_date)} → ${fmtDate(leave.end_date)}`
    : fmtDate(leave.start_date)

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
      border: `1px solid ${leave.has_conflict ? HNH.red : HNH.line}`,
    }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{leave.employee_name}</div>
          {(leave.badge_id || leave.accounting_code) && (
            <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 1, fontWeight: 600 }}>
              {[leave.badge_id && `Mã NV: ${leave.badge_id}`, leave.accounting_code && `Mã KT: ${leave.accounting_code}`].filter(Boolean).join(' · ')}
            </div>
          )}
          {(leave.company || leave.department) && (
            <div style={{ fontSize: 11, color: HNH.navy, marginTop: 1 }}>{[leave.department, leave.company].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isCnb && <SeenToggle seen={leave.seen !== false} onToggle={(next) => onMarkSeen(leave.id, next)} />}
          <Badge tone="success" size="s">Đã duyệt</Badge>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12.5, color: HNH.ink2 }}>
        <span style={{ fontWeight: 700, color: HNH.ink }}>{leave.leave_type}</span>
        {' · '}{range}
        {leave.requested_days != null && <> · {leave.requested_days} ngày</>}
      </div>
      {leave.approved_at && (
        <div style={{ fontSize: 11.5, color: HNH.success, marginTop: 3, fontWeight: 600 }}>Duyệt ngày {fmtDate(leave.approved_at)}</div>
      )}
      {leave.description && (
        <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 3, fontStyle: 'italic' }}>"{leave.description}"</div>
      )}

      {leave.has_conflict && (
        <div style={{ marginTop: 8, background: HNH.red50, borderRadius: 10, padding: '7px 10px', fontSize: 11.5, color: HNH.red, fontWeight: 600 }}>
          ⚠ NV đã chấm công {leave.worked_days.length} ngày trong kỳ nghỉ: {leave.worked_days.map(d => fmtDate(d)).join(', ')}
        </div>
      )}

      {isCnb && (
        <div style={{ marginTop: 12 }}>
          {!showForm ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowDetail(true)}
                className="flex items-center gap-1 border-none cursor-pointer"
                style={{ height: 34, borderRadius: 10, background: HNH.navy50, color: HNH.navy, fontWeight: 700, fontSize: 12.5, padding: '0 14px' }}
              >
                <Icon name="doc" size={13} color={HNH.navy} stroke={2} />
                Xem chi tiết
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="border-none cursor-pointer"
                style={{ height: 34, borderRadius: 10, background: HNH.red50, color: HNH.red, fontWeight: 700, fontSize: 12.5, padding: '0 16px' }}
              >
                Hủy đơn
              </button>
            </div>
          ) : (
            <div>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Lý do hủy đơn..."
                style={{
                  width: '100%', border: `1px solid ${HNH.line}`, borderRadius: 8,
                  padding: '6px 10px', fontSize: 13, color: HNH.ink,
                  fontFamily: 'inherit', marginBottom: 6, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { if (reason.trim()) onCancel(leave.id, reason.trim()) }}
                  className="flex-1 border-none cursor-pointer"
                  style={{ height: 32, borderRadius: 8, background: reason.trim() ? HNH.red : HNH.cream2, color: reason.trim() ? '#fff' : HNH.ink3, fontWeight: 700, fontSize: 12 }}
                >
                  Xác nhận hủy
                </button>
                <button
                  onClick={() => { setShowForm(false); setReason('') }}
                  className="flex-1 border-none cursor-pointer"
                  style={{ height: 32, borderRadius: 8, background: HNH.cream2, color: HNH.ink2, fontWeight: 600, fontSize: 12 }}
                >
                  Thoát
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {showDetail && <LeaveDetailModal id={leave.id} onClose={() => setShowDetail(false)} />}
    </div>
  )
}

function PendingLeaveCard({ leave, isCnb, onApprove, onReject, onMarkSeen }: {
  leave: ApprovedLeave
  isCnb: boolean
  onApprove: (id: number) => void
  onReject: (id: number, reason: string) => void
  onMarkSeen: (id: number, seen: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const range = leave.end_date && leave.end_date !== leave.start_date
    ? `${fmtDate(leave.start_date)} → ${fmtDate(leave.end_date)}`
    : fmtDate(leave.start_date)
  const isNew = isCnb && leave.seen === false
  const openDetail = () => {
    setExpanded(v => !v)
    if (isNew) onMarkSeen(leave.id, true)  // mở xem chi tiết → đánh dấu đã xem
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
      border: `1px solid ${HNH.line}`, boxShadow: '0 2px 8px rgba(15,20,40,0.05)',
    }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{leave.employee_name}</div>
          {(leave.badge_id || leave.accounting_code) && (
            <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 1, fontWeight: 600 }}>
              {[leave.badge_id && `Mã NV: ${leave.badge_id}`, leave.accounting_code && `Mã KT: ${leave.accounting_code}`].filter(Boolean).join(' · ')}
            </div>
          )}
          {(leave.company || leave.department) && (
            <div style={{ fontSize: 11, color: HNH.navy, marginTop: 1 }}>{[leave.department, leave.company].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isCnb && isNew && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: HNH.red, borderRadius: 6, padding: '2px 7px', letterSpacing: 0.3 }}>NEW</span>
          )}
          {isCnb && <SeenToggle seen={leave.seen !== false} onToggle={(next) => onMarkSeen(leave.id, next)} />}
          <Badge tone="warn" size="s">Chờ duyệt</Badge>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12.5, color: HNH.ink2 }}>
        <span style={{ fontWeight: 700, color: HNH.ink }}>{leave.leave_type}</span>
        {' · '}{range}
        {leave.requested_days != null && <> · {leave.requested_days} ngày</>}
      </div>
      {leave.requested_date && (
        <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>Gửi ngày {fmtDate(leave.requested_date)}</div>
      )}
      {(leave.description || expanded) && (
        <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 3, fontStyle: 'italic' }}>{leave.description ? `"${leave.description}"` : 'Không có lý do'}</div>
      )}
      {isCnb && (
        <button onClick={openDetail}
          className="border-none bg-transparent cursor-pointer"
          style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: HNH.navy, padding: 0 }}>
          {expanded ? 'Thu gọn' : 'Xem chi tiết'}
        </button>
      )}

      {isCnb && (
        <div style={{ marginTop: 12 }}>
          {!showReject ? (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(leave.id)}
                className="flex-1 flex items-center justify-center gap-1 border-none cursor-pointer"
                style={{ height: 36, borderRadius: 10, background: HNH.success, color: '#fff', fontWeight: 700, fontSize: 13 }}
              >
                <Icon name="check" size={14} color="#fff" stroke={2.5} />
                Duyệt
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="flex-1 border-none cursor-pointer"
                style={{ height: 36, borderRadius: 10, background: HNH.red50, color: HNH.red, fontWeight: 700, fontSize: 13 }}
              >
                Từ chối
              </button>
            </div>
          ) : (
            <div>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Lý do từ chối..."
                style={{
                  width: '100%', border: `1px solid ${HNH.line}`, borderRadius: 8,
                  padding: '6px 10px', fontSize: 13, color: HNH.ink,
                  fontFamily: 'inherit', marginBottom: 6, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onReject(leave.id, reason)}
                  className="flex-1 border-none cursor-pointer"
                  style={{ height: 32, borderRadius: 8, background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 12 }}
                >
                  Xác nhận
                </button>
                <button
                  onClick={() => { setShowReject(false); setReason('') }}
                  className="flex-1 border-none cursor-pointer"
                  style={{ height: 32, borderRadius: 8, background: HNH.cream2, color: HNH.ink2, fontWeight: 600, fontSize: 12 }}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function LeaveManagementPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'bu' | 'leave'>('leave')
  const [statusFilter, setStatusFilter] = useState<string>('requested')
  const [company, setCompany] = useState<number | ''>('')
  const [department, setDepartment] = useState<number | ''>('')
  const [month, setMonth] = useState(thisMonth())
  const [leaveStatus, setLeaveStatus] = useState<'requested' | 'approved'>('requested')
  const [showCreate, setShowCreate] = useState(false)
  // Tìm kiếm đơn nghỉ theo Họ tên / Mã NV HRM / Mã Kế toán (debounce 300ms).
  const [leaveSearch, setLeaveSearch] = useState('')
  const [leaveSearchQ, setLeaveSearchQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setLeaveSearchQ(leaveSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [leaveSearch])

  const propUrl = (() => {
    const p = new URLSearchParams({ status: statusFilter })
    if (company) p.set('company', String(company))
    if (department) p.set('department', String(department))
    return `/api/leave/hnh-compensatory/?${p.toString()}`
  })()
  const { data: proposals, refresh: refreshProposals } = useApi<Proposal[]>(propUrl)
  const { data: teamEmployees } = useApi<TeamEmployee[]>('/api/leave/hnh-team-employees/')
  const { data: summaryData } = useApi<LeaveSummary>('/api/leave/hnh-leave-summary/')
  // Danh sách công ty/phòng ban cho dropdown lọc (chỉ C&B/Admin dùng).
  const { data: meta } = useApi<{ companies: { id: number; name: string }[]; departments: { id: number; name: string; company_ids: number[] }[] }>('/api/leave/select-candidates/')

  const isCnb = () => summaryData?.scope === 'cnb'
  const deptOptions = (meta?.departments ?? []).filter(d => !company || (d.company_ids ?? []).includes(company))

  // Tab "Đơn nghỉ" (chỉ C&B): đơn chờ duyệt (toàn cty) để duyệt, hoặc đơn đã
  // duyệt trong tháng để xem/hủy — theo bộ lọc trạng thái leaveStatus.
  const approvedUrl = (() => {
    const p = new URLSearchParams({ status: leaveStatus })
    if (leaveStatus === 'approved') p.set('month', month)
    if (company) p.set('company', String(company))
    if (department) p.set('department', String(department))
    if (leaveSearchQ) p.set('q', leaveSearchQ)
    return `/api/leave/hnh-approved-leaves/?${p.toString()}`
  })()
  const { data: approvedLeaves, refresh: refreshApproved } = useApi<ApprovedLeave[]>(
    isCnb() && view === 'leave' ? approvedUrl : null,
  )

  // Số lượng hiển thị cạnh nhãn tab: đơn chờ duyệt, đơn đã duyệt (tháng đang
  // xem), đề xuất Phép Bù đang chờ — luôn tải cho C&B để badge hiện ở mọi tab.
  const countsUrl = (() => {
    const p = new URLSearchParams({ month })
    if (company) p.set('company', String(company))
    if (department) p.set('department', String(department))
    return `/api/leave/hnh-leave-counts/?${p.toString()}`
  })()
  const { data: leaveCounts, refresh: refreshCounts } = useApi<{ pending: number; approved: number; bu_pending: number }>(
    isCnb() ? countsUrl : null,
  )

  const handleCancelApproved = async (id: number, reason: string) => {
    try {
      await api.post(`/api/leave/hnh-cancel-approved/${id}/`, { reason })
      refreshApproved(); refreshCounts()
    } catch (e) {
      alert('Lỗi khi hủy đơn: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleApproveLeave = async (id: number) => {
    try {
      await api.post(`/api/leave/pwa-approve/${id}/`, {})
      refreshApproved(); refreshCounts()
    } catch (e) {
      alert('Lỗi khi duyệt: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleRejectLeave = async (id: number, reason: string) => {
    try {
      await api.post(`/api/leave/pwa-reject/${id}/`, { reason })
      refreshApproved(); refreshCounts()
    } catch (e) {
      alert('Lỗi khi từ chối: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleMarkSeen = async (id: number, seen: boolean) => {
    try {
      await api.post(`/api/leave/hnh-mark-seen/${id}/`, { seen })
      refreshApproved()  // cập nhật trạng thái đã xem xét
    } catch { /* ignore */ }
  }

  const handleApprove = async (id: number) => {
    try {
      await api.post(`/api/leave/hnh-compensatory/${id}/approve/`, {})
      refreshProposals(); refreshCounts()
    } catch (e) {
      alert('Lỗi khi duyệt: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleReject = async (id: number, reason = '') => {
    try {
      await api.post(`/api/leave/hnh-compensatory/${id}/reject/`, { reason })
      refreshProposals(); refreshCounts()
    } catch (e) {
      alert('Lỗi khi từ chối: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa đề xuất này?')) return
    try {
      await api.del(`/api/leave/hnh-compensatory/${id}/`)
      refreshProposals(); refreshCounts()
    } catch (e) {
      alert('Lỗi: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const list = proposals ?? []
  const employees = teamEmployees ?? []

  // Badge số lượng cạnh nhãn tab (Chờ duyệt / Đã duyệt / Phép Bù).
  const renderCount = (n: number, active: boolean) => (
    <span style={{
      marginLeft: 6, fontSize: 11, fontWeight: 800, padding: '0 7px',
      borderRadius: 10, display: 'inline-block', lineHeight: '17px',
      background: active ? 'rgba(255,255,255,0.28)' : '#fdecec',
      color: active ? '#fff' : HNH.red,
    }}>{n}</span>
  )

  const FILTERS = [
    { key: 'requested', label: 'Chờ duyệt' },
    { key: 'approved', label: 'Đã duyệt' },
    { key: 'rejected', label: 'Từ chối' },
  ]

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Quản lý Phép"
        sub="PHÉP BÙ · THÂM NIÊN"
        trailing={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/leave/import')}
              className="flex items-center justify-center border-none cursor-pointer"
              style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 2px rgba(15,20,40,0.06)' }}
              title="Nhập dữ liệu nghỉ phép"
            >
              <Icon name="upload" size={18} color={HNH.ink} stroke={2} />
            </button>
            <button
              onClick={() => navigate('/leave/overview')}
              className="flex items-center justify-center border-none cursor-pointer"
              style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 2px rgba(15,20,40,0.06)' }}
              title="Tổng quan tháng"
            >
              <Icon name="grid" size={18} color={HNH.ink} stroke={2} />
            </button>
          </div>
        }
      />

      <div style={{ padding: '0 20px 100px' }}>
        {/* Chuyển chế độ: Phép Bù (đề xuất) / Đơn nghỉ đã duyệt — chỉ C&B */}
        {isCnb() && (
          <div className="flex gap-2" style={{ marginBottom: 14 }}>
            {([['leave', 'Đơn nghỉ'], ['bu', 'Phép Bù']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className="flex-1 border-none cursor-pointer"
                style={{
                  height: 38, borderRadius: 12, fontSize: 13, fontWeight: 700,
                  background: view === key ? HNH.ink : '#fff',
                  color: view === key ? '#fff' : HNH.ink3,
                  border: `1.5px solid ${view === key ? HNH.ink : HNH.line}`,
                }}
              >
                {label}
                {key === 'bu' && (leaveCounts?.bu_pending ?? 0) > 0 && renderCount(leaveCounts!.bu_pending, view === key)}
              </button>
            ))}
          </div>
        )}

        {/* Filter trạng thái (chỉ tab Phép Bù) */}
        {view === 'bu' && (
          <div className="flex gap-2" style={{ marginBottom: 16 }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className="border-none cursor-pointer"
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700,
                  background: statusFilter === f.key ? HNH.red : '#fff',
                  color: statusFilter === f.key ? '#fff' : HNH.ink3,
                  border: `1.5px solid ${statusFilter === f.key ? HNH.red : HNH.line}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Lọc trạng thái + chọn tháng (chỉ tab Đơn nghỉ) */}
        {view === 'leave' && (
          <>
            <div className="flex gap-2" style={{ marginBottom: 12 }}>
              {([['requested', 'Chờ duyệt'], ['approved', 'Đã duyệt']] as const).map(([key, label]) => {
                const n = key === 'requested' ? (leaveCounts?.pending ?? 0) : (leaveCounts?.approved ?? 0)
                return (
                  <button
                    key={key}
                    onClick={() => setLeaveStatus(key)}
                    className="flex-1 border-none cursor-pointer"
                    style={{
                      height: 36, borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                      background: leaveStatus === key ? HNH.red : '#fff',
                      color: leaveStatus === key ? '#fff' : HNH.ink3,
                      border: `1.5px solid ${leaveStatus === key ? HNH.red : HNH.line}`,
                    }}
                  >
                    {label}{renderCount(n, leaveStatus === key)}
                  </button>
                )
              })}
            </div>
            {leaveStatus === 'approved' && (
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value || thisMonth())}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 12, marginBottom: 12,
                  border: `1px solid ${HNH.line}`, fontSize: 14, color: HNH.ink,
                  background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            )}
            {isCnb() && (
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input
                  value={leaveSearch}
                  onChange={e => setLeaveSearch(e.target.value)}
                  placeholder="Tìm theo Họ tên / Mã NV HRM / Mã Kế toán…"
                  style={{
                    width: '100%', padding: '9px 34px 9px 12px', borderRadius: 12,
                    border: `1px solid ${HNH.line}`, fontSize: 13.5, color: HNH.ink,
                    background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
                  }}
                />
                {leaveSearch && (
                  <button
                    onClick={() => setLeaveSearch('')}
                    className="border-none bg-transparent cursor-pointer"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: HNH.ink3, fontSize: 16, lineHeight: 1, padding: 4 }}
                    aria-label="Xóa tìm kiếm"
                  >×</button>
                )}
              </div>
            )}
          </>
        )}

        {/* Lọc công ty / phòng ban — chỉ C&B/Admin (xem toàn bộ mọi công ty) */}
        {isCnb() && (
          <div className="flex gap-2" style={{ marginBottom: 14 }}>
            <select value={company} onChange={e => { setCompany(e.target.value ? Number(e.target.value) : ''); setDepartment('') }}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, background: '#fff', color: HNH.ink }}>
              <option value="">Tất cả công ty</option>
              {(meta?.companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={department} onChange={e => setDepartment(e.target.value ? Number(e.target.value) : '')}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, background: '#fff', color: HNH.ink }}>
              <option value="">Tất cả phòng ban</option>
              {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}

        {/* Proposals list (Phép Bù) */}
        {view === 'bu' && (
          <>
            {list.length === 0 && (
              <div style={{
                background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center',
                color: HNH.ink3, fontSize: 13, border: `1px solid ${HNH.line}`,
              }}>
                Không có đề xuất nào
              </div>
            )}
            {list.map(p => (
              <ProposalCard
                key={p.id}
                proposal={p}
                isCnb={isCnb()}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}

        {/* Đơn nghỉ: chờ duyệt (duyệt/từ chối) hoặc đã duyệt (hủy + cảnh báo xung đột) */}
        {view === 'leave' && (
          <>
            {(approvedLeaves ?? []).length === 0 && (
              <div style={{
                background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center',
                color: HNH.ink3, fontSize: 13, border: `1px solid ${HNH.line}`,
              }}>
                {leaveStatus === 'requested' ? 'Không có đơn chờ duyệt' : 'Không có đơn nghỉ đã duyệt trong tháng'}
              </div>
            )}
            {(approvedLeaves ?? []).map(l => (
              leaveStatus === 'requested' ? (
                <PendingLeaveCard
                  key={l.id}
                  leave={l}
                  isCnb={isCnb()}
                  onApprove={handleApproveLeave}
                  onReject={handleRejectLeave}
                  onMarkSeen={handleMarkSeen}
                />
              ) : (
                <ApprovedLeaveCard
                  key={l.id}
                  leave={l}
                  isCnb={isCnb()}
                  onCancel={handleCancelApproved}
                  onMarkSeen={handleMarkSeen}
                />
              )
            ))}
          </>
        )}
      </div>

      {/* FAB — Create proposal (chỉ tab Phép Bù) */}
      {view === 'bu' && employees.length > 0 && (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed flex items-center justify-center border-none cursor-pointer z-40"
          style={{
            right: 22, bottom: 92, width: 54, height: 54,
            borderRadius: 18, background: HNH.red, color: '#fff',
            boxShadow: '0 10px 24px rgba(192,34,43,0.35)',
          }}
        >
          <Icon name="plus" size={24} color="#fff" stroke={2.4} />
        </button>
      )}

      {showCreate && (
        <CreateProposalModal
          employees={employees}
          onClose={() => setShowCreate(false)}
          onCreated={refreshProposals}
        />
      )}
    </div>
  )
}
