import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

/* ── Types ── */
interface PendingRequest {
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

/* ── Request Card ── */
function RequestCard({ req, onTap }: { req: PendingRequest; onTap: () => void }) {
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
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: HNH.warn50,
          }}
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

/* ── Detail Modal ── */
function DetailModal({ req, onClose, onAction }: {
  req: PendingRequest
  onClose: () => void
  onAction: (action: 'approve' | 'reject', reason?: string) => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [acting, setActing] = useState(false)

  const handleApprove = async () => {
    setActing(true)
    onAction('approve')
  }

  const handleReject = async () => {
    if (!reason.trim()) return
    setActing(true)
    onAction('reject', reason)
  }

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
        {/* Header */}
        <div className="flex items-center justify-between" style={{
          padding: '14px 16px', background: '#fff',
          borderBottom: `1px solid ${HNH.line}`,
          borderRadius: '24px 24px 0 0',
        }}>
          <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}>
            <Icon name="x" size={17} color={HNH.ink} stroke={2} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Chi tiết đề xuất</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Content */}
        <div style={{ padding: '16px' }}>
          {/* Employee info */}
          <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
            <div className="flex items-center justify-center"
              style={{ width: 44, height: 44, borderRadius: 13, background: HNH.navy50 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: HNH.navy }}>
                {(req.employee_name[0] || '?').toUpperCase()}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{req.employee_name}</div>
              <div style={{ fontSize: 12, color: HNH.ink3 }}>{req.badge_id || ''}</div>
            </div>
          </div>

          {/* Details grid */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: '14px', border: `1px solid ${HNH.line}`,
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

          {/* Actions */}
          {!showReject ? (
            <div className="flex gap-3" style={{ marginTop: 20 }}>
              <button
                onClick={handleApprove}
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
          ) : (
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
                  onClick={handleReject}
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
          )}
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{value}</div>
    </div>
  )
}

/* ── Main Page ── */
export function ApprovalsPage() {
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReq, setSelectedReq] = useState<PendingRequest | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<PendingRequest[]>('/api/leave/pending-approvals/')
      setRequests(data)
    } catch { setRequests([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  const handleAction = async (action: 'approve' | 'reject', reason?: string) => {
    if (!selectedReq) return
    try {
      if (action === 'approve') {
        await api.post(`/api/leave/pwa-approve/${selectedReq.id}/`, {})
      } else {
        await api.post(`/api/leave/pwa-reject/${selectedReq.id}/`, { reason })
      }
      setSelectedReq(null)
      fetchPending()
    } catch { /* ignore */ }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Phê duyệt"
        trailing={
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: requests.length > 0 ? HNH.warn : HNH.ink3,
            background: requests.length > 0 ? HNH.warn50 : HNH.cream2,
            borderRadius: 8, padding: '4px 10px',
          }}>
            {requests.length} chờ duyệt
          </div>
        }
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Icon name="check" size={40} color={HNH.success} stroke={1.5} />
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
              Không có đề xuất nào chờ duyệt
            </div>
            <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
              Các đề xuất mới sẽ hiển thị tại đây
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(r => (
              <RequestCard key={r.id} req={r} onTap={() => setSelectedReq(r)} />
            ))}
          </div>
        )}
      </div>

      {selectedReq && (
        <DetailModal
          req={selectedReq}
          onClose={() => setSelectedReq(null)}
          onAction={handleAction}
        />
      )}
    </div>
  )
}
