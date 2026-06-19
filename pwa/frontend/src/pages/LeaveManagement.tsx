import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
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
  proposed_by_name: string
  days: number
  note: string
  status: 'requested' | 'approved' | 'rejected'
  reject_reason: string
  approved_by_name: string
  approved_at: string | null
  created_at: string | null
}

function fmtDate(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
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

export function LeaveManagementPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string>('requested')
  const [showCreate, setShowCreate] = useState(false)

  const { data: proposals, refresh: refreshProposals } = useApi<Proposal[]>(
    `/api/leave/hnh-compensatory/?status=${statusFilter}`
  )
  const { data: teamEmployees } = useApi<TeamEmployee[]>('/api/leave/hnh-team-employees/')
  const { data: summaryData } = useApi<LeaveSummary>('/api/leave/hnh-leave-summary/')

  const isCnb = () => summaryData?.scope === 'cnb'

  const handleApprove = async (id: number) => {
    try {
      await api.post(`/api/leave/hnh-compensatory/${id}/approve/`, {})
      refreshProposals()
    } catch (e) {
      alert('Lỗi khi duyệt: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleReject = async (id: number, reason = '') => {
    try {
      await api.post(`/api/leave/hnh-compensatory/${id}/reject/`, { reason })
      refreshProposals()
    } catch (e) {
      alert('Lỗi khi từ chối: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa đề xuất này?')) return
    try {
      await api.del(`/api/leave/hnh-compensatory/${id}/`)
      refreshProposals()
    } catch (e) {
      alert('Lỗi: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const list = proposals ?? []
  const employees = teamEmployees ?? []

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
        {/* Filter tabs */}
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

        {/* Proposals list */}
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
      </div>

      {/* FAB — Create proposal */}
      {employees.length > 0 && (
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
