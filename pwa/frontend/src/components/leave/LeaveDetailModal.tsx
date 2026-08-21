import { useState, useEffect } from 'react'
import { HNH } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { api } from '../../lib/api'

// ── Modal "Chi tiết đơn nghỉ" dùng chung.
//    Nguồn gốc: App Feature Quản lý Phép (LeaveManagement). Dùng lại nguyên vẹn ở
//    Quản lý DS Đơn để 2 màn hình hiển thị chi tiết đơn GIỐNG HỆT nhau.
//    Dữ liệu lấy tươi từ /api/leave/hnh-leave-request-detail/<id>/ (có người gửi,
//    người duyệt, người theo dõi — những thứ danh sách không trả về).

export interface LeaveDetail {
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex justify-between gap-3" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
      <span style={{ fontSize: 12.5, color: HNH.ink3, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: HNH.ink, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function LeaveDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
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
