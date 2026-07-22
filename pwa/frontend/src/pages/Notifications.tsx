import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

/* ── Types ── */
interface Notification {
  id: number
  level: string
  unread: boolean
  verb: string
  description: string | null
  timestamp: string
  deleted: boolean
  data: Record<string, unknown> | string | null
  actor_name: string | null
  leave_status?: string | null
}

interface Paginated<T> { count: number; next: string | null; results: T[] }

/* ── Helpers ── */
type NotifTone = 'success' | 'red' | 'warn' | 'navy' | 'gold' | 'ink'

function notifMeta(verb: string, level: string): { initials: string; bg: string; tone: NotifTone; icon: string } {
  const v = verb.toLowerCase()
  if (v.includes('duyệt') || v.includes('approved'))
    return { initials: 'OK', bg: HNH.success, tone: 'success', icon: 'check' }
  if (v.includes('từ chối') || v.includes('rejected'))
    return { initials: '!', bg: HNH.red, tone: 'red', icon: 'x' }
  if (v.includes('nghỉ phép') || v.includes('leave') || v.includes('đề xuất'))
    return { initials: 'NP', bg: HNH.navy, tone: 'navy', icon: 'send' }
  if (v.includes('chấm công') || v.includes('attendance'))
    return { initials: 'CC', bg: HNH.warn, tone: 'warn', icon: 'clock' }
  if (v.includes('lương') || v.includes('payroll'))
    return { initials: 'KT', bg: '#a87908', tone: 'gold', icon: 'doc' }
  if (v.includes('tour') || v.includes('schedule'))
    return { initials: 'ĐH', bg: HNH.navy, tone: 'navy', icon: 'briefcase' }
  if (level === 'warning')
    return { initials: '!', bg: HNH.warn, tone: 'warn', icon: 'bell' }
  if (level === 'error')
    return { initials: '!', bg: HNH.red, tone: 'red', icon: 'x' }
  return { initials: 'TB', bg: HNH.ink2, tone: 'ink', icon: 'bell' }
}

/** Meta badge trạng thái đơn nghỉ (approved/rejected/requested/cancelled). */
function leaveStatusMeta(status: string | null | undefined):
  { label: string; color: string; bg: string; strong: boolean } | null {
  switch (status) {
    case 'approved': return { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50, strong: true }
    case 'rejected': return { label: 'Từ chối', color: HNH.red, bg: HNH.red50, strong: true }
    case 'cancelled': return { label: 'Đã huỷ', color: HNH.ink3, bg: HNH.cream2, strong: false }
    case 'requested': return { label: 'Chờ duyệt', color: '#a8730a', bg: `${HNH.warn}22`, strong: false }
    default: return null
  }
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function fullTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} · ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function dateGroup(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.floor((today.getTime() - notifDay.getTime()) / 86400000)
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Hôm qua'
  if (diff < 7) return 'Tuần này'
  if (diff < 30) return 'Tháng này'
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`
}

/** Parse the data field and return an action route + label if applicable. */
function parseNotifAction(n: Notification): { route: string; label: string } | null {
  if (!n.data) return null
  let d: Record<string, unknown>
  if (typeof n.data === 'string') {
    try { d = JSON.parse(n.data) } catch { return null }
  } else {
    d = n.data
  }

  const redirect = (d?.redirect as string) ?? ''
  const icon = (d?.icon as string) ?? ''

  if (!redirect && !icon) return null

  const r = redirect.toLowerCase()

  // Announcements
  if (icon === 'chatbubbles' || r === '/' || r === '')
    return { route: '/announcements', label: 'Xem tin nội bộ' }

  // Approver views: leave request, allocation, attendance request-view
  if (
    (r.includes('/leave/request-view') && !r.includes('/user-request-view')) ||
    r.includes('/leave/leave-allocation-request-view') ||
    (r.includes('/attendance') && r.includes('request-view'))
  ) return { route: '/approvals', label: 'Duyệt ngay' }

  // Employee's own leave requests
  if (r.includes('/leave/user-request-view') || r.includes('/leave'))
    return { route: '/proposals/leave', label: 'Xem đơn của tôi' }

  // Employee attendance
  if (r.includes('/attendance/view-my-attendance') || r.includes('/attendance'))
    return { route: '/attendance', label: 'Xem chấm công' }

  return null
}

/** Lấy danh sách id đơn nghỉ từ notification (để duyệt nhanh tại chỗ). */
function getLeaveIds(n: Notification): number[] {
  if (!n.data) return []
  let d: Record<string, unknown>
  if (typeof n.data === 'string') {
    try { d = JSON.parse(n.data) } catch { return [] }
  } else { d = n.data }
  const raw = d.leave_request_ids
  if (Array.isArray(raw)) return raw.map(Number).filter(x => !Number.isNaN(x))
  return []
}

/** id đơn nghỉ để mở chi tiết — lấy từ mảng leave_request_ids HOẶC redirect
 * kiểu /leave/request-view?id=N (đa số tin thực tế). */
function firstLeaveId(n: Notification): number | null {
  const arr = getLeaveIds(n)
  if (arr.length) return arr[0]
  if (!n.data) return null
  let d: Record<string, unknown>
  if (typeof n.data === 'string') { try { d = JSON.parse(n.data) } catch { return null } } else { d = n.data }
  const redirect = typeof d.redirect === 'string' ? d.redirect : ''
  if (/\/leave\/(user-)?request-view/.test(redirect)) {
    const m = redirect.match(/[?&]id=(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

/* ── Chi tiết đơn nghỉ (nội dung + quá trình duyệt/từ chối) ── */
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

function fmtLeaveDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function fmtLeaveDateTime(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${fmtLeaveDate(s)}`
}

function LDRow({ label, value }: { label: string; value: React.ReactNode }) {
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
  const [err, setErr] = useState('')
  useEffect(() => {
    api.get<LeaveDetail>(`/api/leave/hnh-leave-request-detail/${id}/`)
      .then(setD)
      .catch(() => setErr('Không tải được chi tiết đơn (có thể bạn không có quyền xem).'))
      .finally(() => setLoading(false))
  }, [id])
  const range = d && d.start_date && d.end_date && d.end_date !== d.start_date
    ? `${fmtLeaveDate(d.start_date)} → ${fmtLeaveDate(d.end_date)}` : (d ? fmtLeaveDate(d.start_date) : '')
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 300, background: 'rgba(0,0,0,0.45)', padding: 16 }} onClick={e => { e.stopPropagation(); onClose() }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', background: '#fff', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: `1px solid ${HNH.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>Chi tiết đơn nghỉ</div>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer" style={{ padding: 4 }}><Icon name="x" size={18} color={HNH.ink3} stroke={2} /></button>
        </div>
        <div style={{ padding: '12px 18px 20px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
          ) : !d ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>{err || 'Không tải được chi tiết đơn.'}</div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>{d.employee_name}</div>
              <div style={{ fontSize: 11.5, color: HNH.navy, marginBottom: 8 }}>{[d.badge_id, d.department, d.company].filter(Boolean).join(' · ')}</div>
              <LDRow label="Loại nghỉ" value={d.leave_type} />
              <LDRow label="Thời gian" value={range} />
              {d.is_hourly && d.start_time && d.end_time && <LDRow label="Khung giờ" value={`${d.start_time} – ${d.end_time}`} />}
              <LDRow label="Số ngày" value={d.requested_days != null ? `${d.requested_days} ngày${d.requested_hours ? ` (${d.requested_hours}h)` : ''}` : null} />
              <LDRow label="Lý do" value={d.description || '—'} />
              <LDRow label="Người gửi" value={d.created_by} />
              <LDRow label="Thời gian gửi" value={d.requested_date ? fmtLeaveDateTime(d.requested_date) : null} />
              <LDRow label="Người duyệt" value={d.approved_by || '—'} />
              <LDRow label="Thời gian duyệt" value={d.approved_at ? fmtLeaveDateTime(d.approved_at) : null} />
              {d.status === 'rejected' && <LDRow label="Lý do từ chối" value={d.reject_reason || '—'} />}
              {d.cancelled_at && <LDRow label="Đã hủy" value={`${fmtLeaveDateTime(d.cancelled_at)}${d.cancelled_by ? ` · ${d.cancelled_by}` : ''}`} />}
              {d.cancel_reason && <LDRow label="Lý do hủy" value={d.cancel_reason} />}
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

type Filter = 'all' | 'unread'

/* ── Notification Detail Sheet ── */
function NotifDetailSheet({
  n,
  onClose,
  onRead,
  onActed,
}: {
  n: Notification
  onClose: () => void
  onRead: () => void
  onActed?: () => void
}) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const meta = notifMeta(n.verb, n.level)
  const action = parseNotifAction(n)
  const leaveIds = getLeaveIds(n)
  const ls = leaveStatusMeta(n.leave_status)
  // Duyệt nhanh tại chỗ: chỉ khi thông báo là ĐƠN CẦN DUYỆT (route /approvals) +
  // có id đơn VÀ đơn CÒN đang chờ (chưa duyệt/từ chối). Backend tự chặn nếu
  // không đủ quyền.
  const decided = n.leave_status === 'approved' || n.leave_status === 'rejected' || n.leave_status === 'cancelled'
  const canQuickApprove = leaveIds.length > 0 && action?.route === '/approvals' && !decided
  // Đơn đã duyệt/từ chối/huỷ → bỏ "Duyệt ngay", cho "Xem chi tiết" đơn.
  const detailLeaveId = decided ? firstLeaveId(n) : null
  const [acting, setActing] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [reason, setReason] = useState('')
  const [showLeaveDetail, setShowLeaveDetail] = useState(false)

  useEffect(() => {
    if (n.unread) onRead()
  }, [n.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = () => {
    if (!action) return
    onClose()
    navigate(action.route)
  }

  const doApprove = async () => {
    setActing(true)
    let ok = 0, done = 0, denied = false
    for (const id of leaveIds) {
      try {
        await api.post(`/api/leave/pwa-approve/${id}/`, {})
        ok++
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (/quyền|403/i.test(msg)) denied = true
        else if (/processed|đã/i.test(msg)) done++
      }
    }
    setActing(false)
    if (ok > 0) toast(`Đã duyệt ${ok} đơn`, 'success')
    else if (denied) toast('Bạn không có quyền duyệt đơn này')
    else if (done > 0) toast('Đơn đã được xử lý trước đó')
    else toast('Không duyệt được, thử lại')
    onActed?.()
  }

  const doReject = async () => {
    if (!reason.trim()) { toast('Nhập lý do từ chối'); return }
    setActing(true)
    let ok = 0
    for (const id of leaveIds) {
      try { await api.post(`/api/leave/pwa-reject/${id}/`, { reason: reason.trim() }); ok++ } catch { /* ignore */ }
    }
    setActing(false)
    toast(ok > 0 ? `Đã từ chối ${ok} đơn` : 'Không từ chối được', ok > 0 ? 'error' : undefined)
    onActed?.()
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 100, background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '24px 24px 0 0', width: '100%',
          maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: HNH.line }} />
        </div>

        {/* Header */}
        <div className="flex items-start gap-3" style={{ padding: '14px 20px 0' }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 46, height: 46, borderRadius: 14,
              background: `${meta.bg}18`,
            }}
          >
            <Icon name={meta.icon} size={20} color={meta.bg} stroke={2} />
          </div>
          <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, lineHeight: 1.4 }}>
              {n.verb}
            </div>
            {n.actor_name && (
              <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
                {n.actor_name}
              </div>
            )}
          </div>
          <button onClick={onClose} className="border-none cursor-pointer bg-transparent shrink-0" style={{ padding: 4 }}>
            <Icon name="x" size={18} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
          {ls && (
            <div className="flex items-center gap-2" style={{
              padding: '10px 14px', background: ls.bg, borderRadius: 12, marginBottom: 12,
              border: `1px solid ${ls.color}33`,
            }}>
              <Icon
                name={n.leave_status === 'approved' ? 'check' : n.leave_status === 'rejected' ? 'x' : 'clock'}
                size={16} color={ls.color} stroke={2.5}
              />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: ls.color }}>
                Trạng thái đơn: {ls.label}
              </span>
            </div>
          )}
          {n.description && (
            <div style={{
              padding: '14px 16px', background: HNH.cream, borderRadius: 14,
              fontSize: 14, color: HNH.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {n.description}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 10 }}>
            {fullTime(n.timestamp)}
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: '8px 20px calc(32px + env(safe-area-inset-bottom, 0px))' }}>
          {canQuickApprove ? (
            rejectMode ? (
              <>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Nhập lý do từ chối..."
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12,
                    fontSize: 13, border: `1.5px solid ${HNH.red}`, resize: 'none', outline: 'none',
                    fontFamily: 'inherit', color: HNH.ink, background: HNH.red50, marginBottom: 8,
                  }}
                />
                <div className="flex gap-2">
                  <button onClick={() => { setRejectMode(false); setReason('') }} disabled={acting}
                    className="flex-1 border-none cursor-pointer"
                    style={{ height: 46, borderRadius: 14, fontSize: 14, fontWeight: 700, background: HNH.cream2, color: HNH.ink2, border: `1.5px solid ${HNH.line}` }}>
                    Huỷ
                  </button>
                  <button onClick={doReject} disabled={acting}
                    className="flex-1 border-none cursor-pointer"
                    style={{ height: 46, borderRadius: 14, fontSize: 14, fontWeight: 800, background: HNH.red, color: '#fff', opacity: acting ? 0.6 : 1 }}>
                    {acting ? 'Đang gửi...' : 'Xác nhận từ chối'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <button onClick={() => setRejectMode(true)} disabled={acting}
                    className="flex items-center justify-center gap-1 border-none cursor-pointer"
                    style={{ flex: 1, height: 50, borderRadius: 16, fontSize: 15, fontWeight: 800, background: HNH.red50, color: HNH.red, border: `1.5px solid ${HNH.red}44` }}>
                    <Icon name="x" size={16} color={HNH.red} stroke={2.4} /> Từ chối
                  </button>
                  <button onClick={doApprove} disabled={acting}
                    className="flex items-center justify-center gap-1 border-none cursor-pointer"
                    style={{ flex: 1.4, height: 50, borderRadius: 16, fontSize: 15, fontWeight: 800, background: HNH.success, color: '#fff', opacity: acting ? 0.6 : 1 }}>
                    <Icon name="check" size={16} color="#fff" stroke={2.4} /> {acting ? 'Đang duyệt...' : 'Duyệt ngay'}
                  </button>
                </div>
                <button onClick={handleAction}
                  className="w-full border-none cursor-pointer bg-transparent"
                  style={{ marginTop: 8, height: 38, fontSize: 12.5, fontWeight: 600, color: HNH.ink3 }}>
                  Xem chi tiết trong màn Phê duyệt →
                </button>
              </>
            )
          ) : detailLeaveId ? (
            <button
              onClick={() => { onRead(); setShowLeaveDetail(true) }}
              className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
              style={{
                height: 50, borderRadius: 16, fontSize: 15, fontWeight: 800,
                background: `linear-gradient(135deg, ${HNH.navy} 0%, #0a1e3d 100%)`,
                color: '#fff',
              }}
            >
              <Icon name="doc" size={16} color="#fff" stroke={2.2} />
              Xem chi tiết
            </button>
          ) : action ? (
            <button
              onClick={handleAction}
              className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
              style={{
                height: 50, borderRadius: 16, fontSize: 15, fontWeight: 800,
                background: `linear-gradient(135deg, ${HNH.navy} 0%, #0a1e3d 100%)`,
                color: '#fff',
              }}
            >
              <Icon name="send" size={16} color="#fff" stroke={2.2} />
              {action.label}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-full border-none cursor-pointer"
              style={{
                height: 46, borderRadius: 14, fontSize: 14, fontWeight: 700,
                background: HNH.cream2, color: HNH.ink2,
                border: `1.5px solid ${HNH.line}`,
              }}
            >
              Đóng
            </button>
          )}
        </div>
      </div>
      {showLeaveDetail && detailLeaveId && (
        <LeaveDetailModal id={detailLeaveId} onClose={() => setShowLeaveDetail(false)} />
      )}
    </div>
  )
}

/* ── Notification Card ── */
function NotifCard({ n, onOpen, onDelete }: {
  n: Notification
  onOpen: () => void
  onDelete: () => void
}) {
  const meta = notifMeta(n.verb, n.level)
  const time = relativeTime(n.timestamp)
  const ls = leaveStatusMeta(n.leave_status)

  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: '13px 14px',
        // Đơn đã Duyệt/Từ chối → nổi bật: viền trái màu + nền nhạt theo trạng thái.
        paddingLeft: ls?.strong ? 11 : 14,
        borderLeft: ls?.strong ? `3px solid ${ls.color}` : undefined,
        background: ls?.strong ? ls.bg : (n.unread ? `${HNH.navy}08` : 'transparent'),
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={onOpen}
    >
      {/* Icon avatar */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${meta.bg}18`,
        }}
      >
        <Icon name={meta.icon} size={18} color={meta.bg} stroke={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <div style={{
                fontSize: 13, fontWeight: n.unread ? 700 : 600, color: HNH.ink,
                lineHeight: 1.4,
              }}>
                {n.verb}
              </div>
              {ls && (
                <span style={{
                  fontSize: 10.5, fontWeight: 800, color: ls.color, background: ls.bg,
                  borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
                  border: `1px solid ${ls.color}33`, letterSpacing: 0.2,
                }}>
                  {ls.label}
                </span>
              )}
            </div>
            {n.description && (
              <div style={{
                fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              } as React.CSSProperties}>
                {n.description}
              </div>
            )}
            {n.actor_name && (
              <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
                {n.actor_name}
              </div>
            )}
          </div>
          {n.unread && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: HNH.red, flexShrink: 0, marginTop: 4,
            }} />
          )}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{time}</span>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center border-none cursor-pointer"
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'transparent', padding: 0,
            }}
          >
            <Icon name="x" size={12} color={HNH.ink3} stroke={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
/* ── Thiết lập cá nhân ── */
interface PersonalSettings {
  allow_outside_office_checkin: boolean
  meeting_reminder_enabled: boolean
}

function Switch({ on, busy, onClick }: { on: boolean; busy?: boolean; onClick: () => void }) {
  const w = 46, h = 26, knob = h - 6
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="border-none shrink-0"
      style={{
        width: w, height: h, padding: 0, position: 'relative', borderRadius: h / 2,
        cursor: busy ? 'default' : 'pointer', background: on ? HNH.success : HNH.ink4,
        opacity: busy ? 0.6 : 1, transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? w - knob - 3 : 3, width: knob, height: knob,
        borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

function SettingRow({ icon, title, desc, on, busy, onToggle }: {
  icon: string; title: string; desc: string; on: boolean; busy: boolean; onToggle: () => void
}) {
  return (
    <div className="flex items-start gap-3" style={{ padding: '14px 4px' }}>
      <div className="flex items-center justify-center shrink-0" style={{
        width: 38, height: 38, borderRadius: 11, background: HNH.navy50,
      }}>
        <Icon name={icon} size={18} color={HNH.navy} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
      <div style={{ paddingTop: 4 }}>
        <Switch on={on} busy={busy} onClick={onToggle} />
      </div>
    </div>
  )
}

function PersonalSettingsModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [s, setS] = useState<PersonalSettings | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    api.get<PersonalSettings>('/api/employee/me/personal-settings/')
      .then(setS)
      .catch(() => toast('Không tải được thiết lập'))
  }, [toast])

  const toggle = async (key: keyof PersonalSettings) => {
    if (!s || saving) return
    const next = !s[key]
    setS({ ...s, [key]: next })   // optimistic
    setSaving(key)
    try {
      const res = await api.put<PersonalSettings>('/api/employee/me/personal-settings/', { [key]: next })
      setS(res)
    } catch {
      setS(prev => (prev ? { ...prev, [key]: !next } : prev))  // revert
      toast('Lưu thất bại, thử lại')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(15,20,40,0.4)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', width: '100%', maxWidth: 600, borderRadius: '20px 20px 0 0',
          padding: '8px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: HNH.line }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: HNH.ink, margin: '14px 4px 4px' }}>
          Thiết lập cá nhân
        </div>
        {s === null ? (
          <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <SettingRow
              icon="clock"
              title="Chấm công ngoài văn phòng"
              desc="Cho phép chấm công khi ở ngoài khu vực văn phòng (ngoài geofence). Phù hợp cho HDV, lái xe, đi tour."
              on={s.allow_outside_office_checkin}
              busy={saving === 'allow_outside_office_checkin'}
              onToggle={() => toggle('allow_outside_office_checkin')}
            />
            <div style={{ height: 1, background: HNH.line, margin: '2px 0' }} />
            <SettingRow
              icon="bell"
              title="Nhắc lịch bận sắp tới"
              desc="Tự động báo trước 15 phút cho lịch bận chính thức trong Lịch làm việc 10 ngày (đồng bộ từ Outlook, bỏ qua lịch đã huỷ)."
              on={s.meeting_reminder_enabled}
              busy={saving === 'meeting_reminder_enabled'}
              onToggle={() => toggle('meeting_reminder_enabled')}
            />
          </div>
        )}
        <button
          onClick={onClose}
          className="border-none cursor-pointer"
          style={{
            width: '100%', height: 44, borderRadius: 12, marginTop: 14,
            background: HNH.cream2, color: HNH.ink2, fontSize: 14, fontWeight: 700,
          }}
        >
          Đóng
        </button>
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [detail, setDetail] = useState<Notification | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const fetchNotifications = useCallback(async (f: Filter) => {
    setLoading(true)
    try {
      const type = f === 'unread' ? 'unread' : 'all'
      const data = await api.get<Paginated<Notification>>(
        `/api/notifications/list/${type}?page_size=50`
      )
      setNotifications(data.results)
      setTotal(data.count)
      setNextPage(data.next)
    } catch { setNotifications([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchNotifications(filter) }, [filter, fetchNotifications])

  const loadMore = async () => {
    if (!nextPage || loadingMore) return
    setLoadingMore(true)
    try {
      const url = nextPage.replace(/^.*\/bff/, '')
      const data = await api.get<Paginated<Notification>>(url)
      setNotifications(prev => [...prev, ...data.results])
      setNextPage(data.next)
    } catch { /* ignore */ } finally { setLoadingMore(false) }
  }

  const markRead = async (id: number) => {
    await api.post(`/api/notifications/${id}/`, {})
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, unread: false } : n)
      const remaining = updated.filter(n => n.unread).length
      if (remaining === 0) navigator.clearAppBadge?.()
      else navigator.setAppBadge?.(remaining)
      return updated
    })
  }

  const deleteNotif = async (id: number) => {
    await api.del(`/api/notifications/${id}/`)
    setNotifications(prev => prev.filter(n => n.id !== id))
    setTotal(prev => prev - 1)
    if (detail?.id === id) setDetail(null)
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await api.post('/api/notifications/bulk-read/', {})
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
      navigator.clearAppBadge?.()
      toast('Đã đọc tất cả thông báo')
    } finally { setMarkingAll(false) }
  }

  const handleRefresh = useCallback(async () => {
    await fetchNotifications(filter)
  }, [filter, fetchNotifications])

  const unreadCount = notifications.filter(n => n.unread).length

  // Group by date
  const grouped: { label: string; items: Notification[] }[] = []
  for (const n of notifications) {
    const label = dateGroup(n.timestamp)
    const last = grouped[grouped.length - 1]
    if (last && last.label === label) {
      last.items.push(n)
    } else {
      grouped.push({ label, items: [n] })
    }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Thông báo"
        onBack={() => navigate(-1)}
        trailing={
          <>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="border-none cursor-pointer"
                style={{
                  fontSize: 11.5, fontWeight: 700, color: HNH.navy,
                  background: HNH.navy50, borderRadius: 8, padding: '5px 10px',
                  opacity: markingAll ? 0.5 : 1,
                }}
              >
                Đọc tất cả
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Thiết lập cá nhân"
              title="Thiết lập cá nhân"
              className="flex items-center justify-center border-none cursor-pointer shrink-0"
              style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', boxShadow: '0 1px 4px rgba(15,20,40,0.09)' }}
            >
              <Icon name="gear" size={19} color={HNH.ink2} stroke={2} />
            </button>
          </>
        }
      />
      {showSettings && <PersonalSettingsModal onClose={() => setShowSettings(false)} />}

      <PullToRefresh onRefresh={handleRefresh}>
      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {/* Filters + count */}
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex gap-2">
            {([
              { key: 'all' as Filter, label: 'Tất cả' },
              { key: 'unread' as Filter, label: 'Chưa đọc' },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="border-none cursor-pointer"
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: filter === f.key ? HNH.navy : '#fff',
                  color: filter === f.key ? '#fff' : HNH.ink2,
                  fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${filter === f.key ? HNH.navy : HNH.line}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3 }}>
            {total} thông báo
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Icon name="bell" size={36} color={HNH.ink3} stroke={1.5} />
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
              {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}
            </div>
            <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
              Thông báo mới sẽ hiển thị tại đây
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(g => (
              <div key={g.label}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: HNH.ink3,
                  letterSpacing: 0.3, textTransform: 'uppercase',
                  padding: '4px 2px 6px',
                }}>
                  {g.label}
                </div>
                <div style={{
                  background: '#fff', borderRadius: 16,
                  border: `1px solid ${HNH.line}`, overflow: 'hidden',
                }}>
                  {g.items.map((n, i) => (
                    <div key={n.id} style={{
                      borderBottom: i < g.items.length - 1 ? `1px solid ${HNH.line}` : 'none',
                    }}>
                      <NotifCard
                        n={n}
                        onOpen={() => setDetail(n)}
                        onDelete={() => deleteNotif(n.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Load more */}
            {nextPage && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full border-none cursor-pointer"
                style={{
                  padding: '12px', borderRadius: 12,
                  background: '#fff', color: HNH.navy,
                  fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${HNH.line}`,
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            )}
          </div>
        )}
      </div>
      </PullToRefresh>

      {detail && (
        <NotifDetailSheet
          n={detail}
          onClose={() => setDetail(null)}
          onRead={() => markRead(detail.id)}
          onActed={() => { setDetail(null); fetchNotifications(filter) }}
        />
      )}
    </div>
  )
}
