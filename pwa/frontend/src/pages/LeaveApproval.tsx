import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'

interface PendingRequest {
  id: number
  employee_id: number
  employee_name: string
  badge_id: string
  leave_type: string
  leave_payment: string | null
  start_date: string
  end_date: string
  requested_days: number
  description: string | null
  status: string
  requested_date: string | null
  start_date_breakdown: string
  end_date_breakdown: string
  is_hourly: boolean
  requested_hours: number | null
  start_time: string | null
  end_time: string | null
}

function fmtDate(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function fmtDateShort(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtTime(t: string | null) {
  if (!t) return ''
  return t.slice(0, 5)
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map(w => w[0].toUpperCase()).join('')
}

const AVATAR_COLORS = [
  '#c0222b', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2',
]
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

const BD_LABEL: Record<string, string> = {
  full_day: 'Cả ngày',
  first_half: 'Buổi sáng',
  second_half: 'Buổi chiều',
}

function bdLabel(bd: string) { return BD_LABEL[bd] ?? bd }

function paymentLabel(p: string | null) {
  if (p === 'unpaid_leave') return 'Không trả lương'
  return 'Có trả lương'
}

function daysLabel(r: PendingRequest) {
  if (r.is_hourly && r.requested_hours) return `${r.requested_hours}h`
  const d = r.requested_days
  return d % 1 === 0 ? `${d} ngày` : `${d.toFixed(2)} ngày`
}

function dateRange(r: PendingRequest) {
  if (r.start_date === r.end_date) return fmtDateShort(r.start_date)
  return `${fmtDateShort(r.start_date)} → ${fmtDateShort(r.end_date)}`
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ req, onClose, onApproved, onRejected }: {
  req: PendingRequest
  onClose: () => void
  onApproved: (id: number) => void
  onRejected: (id: number) => void
}) {
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const isPending = req.status === 'requested'

  async function handleApprove() {
    setLoading(true); setErr('')
    try {
      await api.post(`/api/leave/pwa-approve/${req.id}/`, {})
      onApproved(req.id)
    } catch (e: any) {
      setErr(e?.message ?? 'Lỗi duyệt đơn')
    } finally { setLoading(false) }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setErr('Vui lòng nhập lý do từ chối'); return }
    setLoading(true); setErr('')
    try {
      await api.post(`/api/leave/pwa-reject/${req.id}/`, { reason: rejectReason })
      onRejected(req.id)
    } catch (e: any) {
      setErr(e?.message ?? 'Lỗi từ chối đơn')
    } finally { setLoading(false) }
  }

  const stMap: Record<string, { label: string; c: string; bg: string }> = {
    requested: { label: 'Chờ duyệt', c: '#a87908', bg: '#faf1d6' },
    approved:  { label: 'Đã phê duyệt', c: HNH.success, bg: HNH.success50 },
    rejected:  { label: 'Từ chối', c: HNH.red, bg: HNH.red50 },
  }
  const st = stMap[req.status] ?? stMap.requested

  const title = req.description?.trim() || `${req.leave_type} ${dateRange(req)}`

  const infoRows: [string, React.ReactNode][] = [
    ['ID', <span style={{ color: HNH.red, fontWeight: 700 }}>#{req.id}</span>],
    ['Nhân viên', `${req.employee_name} (${req.badge_id})`],
    ['Loại nghỉ', req.leave_type],
    ['Hình thức', req.is_hourly ? 'Theo giờ' : 'Theo ngày'],
    ['Thanh toán', paymentLabel(req.leave_payment)],
    ['Ngày gửi', fmtDate(req.requested_date)],
  ]
  if (req.description?.trim()) {
    infoRows.push(['Mô tả', req.description])
  }

  // CA ĐỀ XUẤT rows
  const caRows: { date: string; detail: string }[] = []
  if (req.is_hourly && req.start_time && req.end_time) {
    caRows.push({ date: fmtDate(req.start_date), detail: `${fmtTime(req.start_time)} – ${fmtTime(req.end_time)}${req.requested_hours ? ` (${req.requested_hours}h)` : ''}` })
  } else if (req.start_date === req.end_date) {
    caRows.push({ date: fmtDate(req.start_date), detail: bdLabel(req.start_date_breakdown) })
  } else {
    caRows.push({ date: `${fmtDate(req.start_date)} → ${fmtDate(req.end_date)}`, detail: bdLabel(req.start_date_breakdown) })
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 300, background: 'rgba(0,0,0,0.45)', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, maxHeight: '88vh',
          background: '#fff', borderRadius: 20, display: 'flex',
          flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${HNH.line}` }}>
          <div className="flex items-start justify-between gap-3">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, lineHeight: 1.3 }}>{title}</div>
              <span style={{
                display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700,
                padding: '2px 10px', borderRadius: 20, background: st.bg, color: st.c,
              }}>{st.label}</span>
            </div>
            <button
              onClick={onClose}
              className="border-none cursor-pointer flex items-center justify-center shrink-0"
              style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream, marginTop: 2 }}
            >
              <Icon name="x" size={18} color={HNH.ink} stroke={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* THÔNG TIN CHÍNH */}
          <div style={{ padding: '12px 18px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.5, marginBottom: 4 }}>THÔNG TIN CHÍNH</div>
            <div style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {infoRows.map(([k, v], i) => (
                <div
                  key={k}
                  className="flex justify-between gap-3"
                  style={{
                    padding: '10px 14px',
                    borderBottom: i < infoRows.length - 1 ? `1px solid ${HNH.line}` : 'none',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: HNH.ink3, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontWeight: 600, color: HNH.ink, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CA ĐỀ XUẤT */}
          <div style={{ padding: '14px 18px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.5, marginBottom: 4 }}>CA ĐỀ XUẤT</div>
            <div style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {caRows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3"
                  style={{
                    padding: '12px 14px',
                    borderBottom: i < caRows.length - 1 ? `1px solid ${HNH.line}` : 'none',
                  }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 26, height: 26, borderRadius: 8, background: HNH.red50, fontSize: 11, fontWeight: 700, color: HNH.red }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.red }}>{row.date}</div>
                    <div style={{ fontSize: 12, color: HNH.ink2, marginTop: 1 }}>{row.detail}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3 }}>{daysLabel(req)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reject reason input */}
          {rejectMode && (
            <div style={{ padding: '0 18px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: HNH.red, marginBottom: 6 }}>LÝ DO TỪ CHỐI *</div>
              <textarea
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setErr('') }}
                placeholder="Nhập lý do từ chối..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12, fontSize: 13,
                  border: `1.5px solid ${HNH.red}`, resize: 'none', outline: 'none',
                  fontFamily: 'inherit', color: HNH.ink, background: HNH.red50,
                }}
              />
            </div>
          )}

          {err && (
            <div style={{ margin: '0 18px 12px', padding: '8px 12px', borderRadius: 10, background: HNH.red50, fontSize: 12, color: HNH.red, fontWeight: 600 }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer actions — chỉ hiện khi pending */}
        {isPending && (
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${HNH.line}`, display: 'flex', gap: 10 }}>
            {!rejectMode ? (
              <>
                <button
                  onClick={() => { setRejectMode(true); setErr('') }}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 14, fontSize: 14, fontWeight: 700,
                    border: `1.5px solid ${HNH.red}`, background: '#fff', color: HNH.red, cursor: 'pointer',
                  }}
                >
                  Từ chối
                </button>
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  style={{
                    flex: 1.5, padding: '12px 0', borderRadius: 14, fontSize: 14, fontWeight: 700,
                    border: 'none', background: HNH.success, color: '#fff', cursor: 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Đang xử lý...' : '✓ Duyệt'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setRejectMode(false); setRejectReason(''); setErr('') }}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 14, fontSize: 14, fontWeight: 700,
                    border: `1.5px solid ${HNH.line2}`, background: '#fff', color: HNH.ink2, cursor: 'pointer',
                  }}
                >
                  Huỷ
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  style={{
                    flex: 1.5, padding: '12px 0', borderRadius: 14, fontSize: 14, fontWeight: 700,
                    border: 'none', background: HNH.red, color: '#fff', cursor: 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Đang xử lý...' : 'Xác nhận từ chối'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Request card ──────────────────────────────────────────────────────────────

function RequestCard({ req, onClick, last }: { req: PendingRequest; onClick: () => void; last?: boolean }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3"
      style={{
        padding: '13px 16px',
        borderBottom: last ? 'none' : `1px solid ${HNH.line}`,
        cursor: 'pointer',
      }}
    >
      {/* Avatar */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 42, height: 42, borderRadius: 14, background: avatarColor(req.employee_id), color: '#fff', fontSize: 14, fontWeight: 700 }}
      >
        {initials(req.employee_name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, marginBottom: 2 }}>
          {req.employee_name}
          <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginLeft: 5 }}>{req.badge_id}</span>
        </div>
        <div style={{ fontSize: 12.5, color: HNH.ink2, marginBottom: 2 }}>{req.leave_type}</div>
        <div style={{ fontSize: 11.5, color: HNH.ink3 }}>{dateRange(req)} · {daysLabel(req)}</div>
        {req.description?.trim() && (
          <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            "{req.description}"
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Badge tone="warn" size="s">Chờ duyệt</Badge>
        <Icon name="chev-r" size={15} color={HNH.ink4} stroke={2} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LeaveApprovalPage() {
  const navigate = useNavigate()
  const { data: rawRequests, refresh } = useApi<PendingRequest[]>('/api/leave/pending-approvals/')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<PendingRequest | null>(null)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  const requests = useMemo(() => {
    const base = (rawRequests ?? []).filter(r => !dismissed.has(r.id))
    if (!search.trim()) return base
    const q = search.trim().toLowerCase()
    return base.filter(r =>
      r.employee_name.toLowerCase().includes(q) ||
      r.badge_id.toLowerCase().includes(q)
    )
  }, [rawRequests, dismissed, search])

  function handleApproved(id: number) {
    setDismissed(prev => new Set([...prev, id]))
    setDetail(null)
  }
  function handleRejected(id: number) {
    setDismissed(prev => new Set([...prev, id]))
    setDetail(null)
  }

  const pendingCount = (rawRequests ?? []).filter(r => !dismissed.has(r.id)).length

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Phê duyệt phép"
        sub={pendingCount > 0 ? `${pendingCount} ĐƠN CHỜ DUYỆT` : 'KHÔNG CÓ ĐƠN MỚI'}
      />

      <div style={{ padding: '12px 16px 100px' }}>
        {/* Search */}
        <div
          className="flex items-center gap-2"
          style={{ background: '#fff', borderRadius: 14, padding: '10px 14px', border: `1px solid ${HNH.line}`, marginBottom: 14 }}
        >
          <Icon name="search" size={16} color={HNH.ink3} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên nhân viên..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 14,
              color: HNH.ink, background: 'transparent', fontFamily: 'inherit',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="border-none cursor-pointer" style={{ background: 'none', padding: 0 }}>
              <Icon name="x" size={15} color={HNH.ink3} stroke={2} />
            </button>
          )}
        </div>

        {/* List */}
        {rawRequests === null ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
        ) : requests.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: 18, padding: '32px 20px',
            textAlign: 'center', border: `1px solid ${HNH.line}`,
          }}>
            <div style={{ fontSize: 36 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginTop: 10 }}>
              {search ? 'Không tìm thấy' : 'Không có đơn chờ duyệt'}
            </div>
            <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 4 }}>
              {search ? `Không có đơn nào của "${search}"` : 'Tất cả đơn đã được xử lý'}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
            {requests.map((r, i) => (
              <RequestCard
                key={r.id}
                req={r}
                last={i === requests.length - 1}
                onClick={() => setDetail(r)}
              />
            ))}
          </div>
        )}

        {/* Refresh hint */}
        {(rawRequests ?? []).length > 0 && dismissed.size > 0 && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              onClick={() => { setDismissed(new Set()); refresh() }}
              className="border-none cursor-pointer"
              style={{ fontSize: 12, color: HNH.ink3, background: 'none', textDecoration: 'underline' }}
            >
              Tải lại danh sách
            </button>
          </div>
        )}
      </div>

      {detail && (
        <DetailModal
          req={detail}
          onClose={() => setDetail(null)}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />
      )}
    </div>
  )
}
