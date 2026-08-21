import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'
import { LeaveDetailModal } from '../components/leave/LeaveDetailModal'

// ── Quản lý DS Đơn (C&B) — 1 trang gộp DS đơn nghỉ, lọc đa chiều, xử lý + Excel.
//    Đơn TỪ CHỐI (rejected) hiển thị đầy đủ ở đây.

interface Row {
  id: number; employee_id: number; employee_name: string; badge_id: string
  accounting_code: string; department: string | null; company: string | null
  job_position: string | null; manager_name: string | null; request_type_label: string; leave_type: string
  start_date: string; end_date: string; start_breakdown: string; end_breakdown: string
  requested_days: number | null; status: string; status_label: string
  description: string; reject_reason: string; requested_date: string | null
  updated_at: string | null; approved_by: string | null
  approved_at: string | null; cancelled_at: string | null; cancelled_by: string | null
  cancel_reason: string; refunded_days: number; seen: boolean
}
interface Company { id: number; name: string }
interface Department { id: number; name: string; company_ids: number[] }

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: 'Chờ duyệt', color: HNH.warn, bg: HNH.warn50 },
  approved: { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50 },
  rejected: { label: 'Đã từ chối', color: HNH.red, bg: HNH.red50 },
  cancelled: { label: 'Đã xóa', color: HNH.ink3, bg: HNH.cream2 },
}
const STATUS_FILTERS = [
  { k: 'all', lbl: 'Tất cả' },
  { k: 'requested', lbl: 'Chờ duyệt' },
  { k: 'approved', lbl: 'Đã duyệt' },
  { k: 'rejected', lbl: 'Đã từ chối' },
  { k: 'cancelled', lbl: 'Đã xóa' },
]
const SEEN_FILTERS = [
  { k: 'all', lbl: 'Tất cả' },
  { k: 'unseen', lbl: 'Chưa xem' },
  { k: 'seen', lbl: 'Đã xem' },
]
const BD_VI: Record<string, string> = { full_day: 'Cả ngày', first_half: 'Sáng', second_half: 'Chiều' }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const [d] = iso.split('T'); const p = d.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}
// Ngày + giờ (theo múi giờ thiết bị = VN). Chuỗi chỉ có ngày (không 'T') → chỉ hiện ngày.
function fmtDT(iso: string | null) {
  if (!iso) return '—'
  if (!iso.includes('T')) return fmtDate(iso)
  const d = new Date(iso)
  if (isNaN(d.getTime())) return fmtDate(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function RequestListPage() {
  const navigate = useNavigate()
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const [from, setFrom] = useState(ymd(first))
  const [to, setTo] = useState(ymd(last))
  const [status, setStatus] = useState('all')
  const [seen, setSeen] = useState('all')
  const [company, setCompany] = useState('')
  const [department, setDepartment] = useState('')
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [sort, setSort] = useState<'created_desc' | 'created_asc'>('created_desc')
  const [groupBySeen, setGroupBySeen] = useState(true)

  const [rows, setRows] = useState<Row[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [reasonModal, setReasonModal] = useState<{ id: number; kind: 'reject' | 'cancel' } | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [toast, setToast] = useState('')

  // debounce ô tìm kiếm
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 350); return () => clearTimeout(t) }, [q])

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (status !== 'all') p.set('status', status)
    if (seen !== 'all') p.set('seen', seen)
    if (company) p.set('company', company)
    if (department) p.set('department', department)
    if (qDebounced) p.set('q', qDebounced)
    p.set('sort', sort)
    return p.toString()
  }, [from, to, status, seen, company, department, qDebounced, sort])

  const reqIdRef = useRef(0)
  const load = useCallback(async () => {
    const rid = ++reqIdRef.current
    setLoading(true)
    try {
      const r = await api.get<{ results: Row[]; companies: Company[]; departments: Department[] }>(
        `/api/leave/hnh-request-list/?${params}`)
      if (rid !== reqIdRef.current) return
      setRows(r.results); setCompanies(r.companies); setDepartments(r.departments)
    } catch { if (rid === reqIdRef.current) setRows([]) }
    finally { if (rid === reqIdRef.current) setLoading(false) }
  }, [params])
  useEffect(() => { load() }, [load])

  const deptOptions = useMemo(() => {
    if (!company) return departments
    const cid = Number(company)
    return departments.filter(d => d.company_ids.includes(cid))
  }, [departments, company])

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200) }

  const doApprove = async (id: number) => {
    setBusy(id)
    try { await api.post(`/api/leave/pwa-approve/${id}/`, {}); showToast('Đã duyệt đơn'); await load() }
    catch { showToast('Lỗi khi duyệt') } finally { setBusy(null) }
  }
  const doReason = async () => {
    if (!reasonModal) return
    const reason = reasonText.trim()
    if (!reason) { showToast('Cần nhập lý do'); return }
    const { id, kind } = reasonModal
    setBusy(id); setReasonModal(null); setReasonText('')
    try {
      if (kind === 'reject') await api.post(`/api/leave/pwa-reject/${id}/`, { reason })
      else await api.post(`/api/leave/hnh-cancel-approved/${id}/`, { reason })
      showToast(kind === 'reject' ? 'Đã từ chối đơn' : 'Đã hủy đơn'); await load()
    } catch { showToast('Lỗi khi xử lý') } finally { setBusy(null) }
  }
  const toggleSeen = async (r: Row) => {
    setBusy(r.id)
    try {
      await api.post(`/api/leave/hnh-mark-seen/${r.id}/`, { seen: !r.seen })
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, seen: !x.seen } : x))
    } catch { showToast('Lỗi đánh dấu') } finally { setBusy(null) }
  }
  const doExport = async () => {
    setExporting(true)
    try {
      const resp = await fetch(`/bff/api/leave/hnh-request-list/export/?${params}`, { credentials: 'include' })
      if (!resp.ok) throw new Error()
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `DS_Don_${from}_${to}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
    } catch { showToast('Lỗi xuất Excel') } finally { setExporting(false) }
  }

  const selStyle: React.CSSProperties = { padding: '7px 9px', borderRadius: 9, border: `1px solid ${HNH.line}`, fontSize: 12.5, background: '#fff', color: HNH.ink, minWidth: 0 }
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? HNH.red : HNH.line}`, background: active ? HNH.red : '#fff',
    color: active ? '#fff' : HNH.ink2, whiteSpace: 'nowrap',
  })

  const unseenCount = rows.filter(r => !r.seen).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: HNH.cream }}>
      <TopBar title="Quản lý DS Đơn" sub="C&B · Đơn nghỉ phép" onBack={() => navigate(-1)} />

      {/* Bộ lọc */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${HNH.line}`, padding: '10px 12px', flexShrink: 0 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: HNH.ink3, fontWeight: 700 }}>Từ</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...selStyle, flex: 1 }} />
          <span style={{ fontSize: 12, color: HNH.ink3, fontWeight: 700 }}>đến</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...selStyle, flex: 1 }} />
        </div>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <select value={company} onChange={e => { setCompany(e.target.value); setDepartment('') }} style={{ ...selStyle, flex: 1 }}>
            <option value="">Tất cả công ty</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={department} onChange={e => setDepartment(e.target.value)} style={{ ...selStyle, flex: 1 }}>
            <option value="">Tất cả phòng ban</option>
            {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm họ tên (có/không dấu), mã NV, mã kế toán…"
          style={{ ...selStyle, width: '100%', marginBottom: 8 }} />
        <div className="flex items-center gap-1.5" style={{ overflowX: 'auto', paddingBottom: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 700, flexShrink: 0 }}>Xử lý:</span>
          {STATUS_FILTERS.map(s => <span key={s.k} onClick={() => setStatus(s.k)} style={chip(status === s.k)}>{s.lbl}</span>)}
        </div>
        <div className="flex items-center gap-1.5" style={{ overflowX: 'auto' }}>
          <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 700, flexShrink: 0 }}>Xem:</span>
          {SEEN_FILTERS.map(s => <span key={s.k} onClick={() => setSeen(s.k)} style={chip(seen === s.k)}>{s.lbl}</span>)}
        </div>
      </div>

      {/* Thanh tổng + Export */}
      <div className="flex items-center gap-2" style={{ background: '#fff', borderBottom: `1px solid ${HNH.line}`, padding: '7px 12px', flexShrink: 0 }}>
        <span style={{ fontSize: 12.5, color: HNH.ink2, fontWeight: 700 }}>{rows.length} đơn</span>
        {unseenCount > 0 && <span style={{ fontSize: 11, color: HNH.warn, fontWeight: 700, background: HNH.warn50, borderRadius: 6, padding: '2px 7px' }}>{unseenCount} chưa xem</span>}
        <button onClick={doExport} disabled={exporting || rows.length === 0}
          className="flex items-center gap-1.5 border-none cursor-pointer"
          style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 9, background: rows.length === 0 ? HNH.ink4 : HNH.success, color: '#fff', fontWeight: 700, fontSize: 12.5 }}>
          <Icon name="download" size={14} color="#fff" stroke={2.2} />{exporting ? 'Đang tải…' : 'Xuất Excel'}
        </button>
      </div>

      {/* Thanh sắp xếp + gom nhóm */}
      <div className="flex items-center gap-2" style={{ background: '#fff', borderBottom: `1px solid ${HNH.line}`, padding: '7px 12px', flexShrink: 0, overflowX: 'auto' }}>
        <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 700, flexShrink: 0 }}>Sắp xếp:</span>
        <span onClick={() => setSort('created_desc')} style={chip(sort === 'created_desc')}>Mới nhất trước</span>
        <span onClick={() => setSort('created_asc')} style={chip(sort === 'created_asc')}>Cũ nhất trước</span>
        <span onClick={() => setGroupBySeen(g => !g)} style={{ ...chip(groupBySeen), marginLeft: 'auto', flexShrink: 0 }}>
          {groupBySeen ? '☑' : '☐'} Gom Đã/Chưa xem
        </span>
      </div>

      {/* Danh sách */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 32px', minHeight: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Không có đơn phù hợp bộ lọc</div>
        ) : groupBySeen ? (
          [{ seen: false, lbl: 'Chưa xem' }, { seen: true, lbl: 'Đã xem' }].map(g => {
            const grp = rows.filter(r => r.seen === g.seen)
            if (!grp.length) return null
            return (
              <div key={String(g.seen)} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px 8px', position: 'sticky', top: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: g.seen ? HNH.ink3 : HNH.warn }}>{g.lbl}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: g.seen ? HNH.ink3 : HNH.warn, background: g.seen ? HNH.cream2 : HNH.warn50, borderRadius: 999, padding: '1px 8px' }}>{grp.length}</span>
                  <span style={{ flex: 1, height: 1, background: HNH.line }} />
                </div>
                {grp.map(renderCard)}
              </div>
            )
          })
        ) : rows.map(renderCard)}
      </div>

      {/* Chi tiết đơn — DÙNG CHUNG modal của App Feature Quản lý Phép */}
      {detailId != null && <LeaveDetailModal id={detailId} onClose={() => setDetailId(null)} />}

      {/* Modal nhập lý do */}
      {reasonModal && (
        <div onClick={() => setReasonModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 18, width: '100%', maxWidth: 520 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>{reasonModal.kind === 'reject' ? 'Lý do từ chối đơn' : 'Lý do hủy đơn'}</div>
            <textarea value={reasonText} onChange={e => setReasonText(e.target.value)} autoFocus rows={3}
              placeholder="Nhập lý do…" style={{ width: '100%', padding: 10, borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, resize: 'none', boxSizing: 'border-box' }} />
            <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
              <button onClick={() => setReasonModal(null)} className="flex-1 border-none cursor-pointer" style={{ padding: '10px', borderRadius: 10, background: HNH.cream2, color: HNH.ink2, fontWeight: 700, fontSize: 13 }}>Bỏ qua</button>
              <button onClick={doReason} className="flex-1 border-none cursor-pointer" style={{ padding: '10px', borderRadius: 10, background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 13 }}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: HNH.ink, color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, zIndex: 60, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}
    </div>
  )

  function renderCard(r: Row) {
          const st = STATUS_META[r.status] ?? { label: r.status_label, color: HNH.ink3, bg: HNH.cream2 }
          const isOpen = expanded === r.id
          const dateStr = r.end_date !== r.start_date ? `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` : fmtDate(r.start_date)
          return (
            <div key={r.id} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${r.seen ? HNH.line : HNH.warn50}`, padding: 12, marginBottom: 8, boxShadow: r.seen ? 'none' : '0 1px 6px rgba(201,122,22,0.10)' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 4 }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{r.employee_name}</span>
                {!r.seen && <span style={{ width: 7, height: 7, borderRadius: 999, background: HNH.warn }} />}
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 7, padding: '2px 8px' }}>{st.label}</span>
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink2 }}>{r.leave_type} · {dateStr} · <strong>{r.requested_days ?? '—'} ngày</strong></div>
              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>
                {r.badge_id}{r.accounting_code ? ` · KT:${r.accounting_code}` : ''}{r.company ? ` · ${r.company}` : ''}{r.department ? ` · ${r.department}` : ''}
              </div>
              {r.manager_name && <div style={{ fontSize: 11, color: HNH.navy, marginTop: 2, fontWeight: 600 }}>QL duyệt: {r.manager_name}</div>}
              {r.description && <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 4, fontStyle: 'italic' }}>Lý do: {r.description}</div>}
              {r.status === 'rejected' && r.reject_reason && <div style={{ fontSize: 11.5, color: HNH.red, marginTop: 3 }}>Từ chối: {r.reject_reason}</div>}
              {r.status === 'cancelled' && <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 3 }}>Hủy{r.cancelled_by ? ` bởi ${r.cancelled_by}` : ''}{r.cancel_reason ? ` · ${r.cancel_reason}` : ''}{r.refunded_days ? ` · hoàn ${r.refunded_days} ngày` : ''}</div>}

              {isOpen && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${HNH.line}`, fontSize: 11.5, color: HNH.ink2, display: 'grid', gap: 3 }}>
                  <div>Chức vụ: <b>{r.job_position || '—'}</b></div>
                  <div>Buổi: <b>{BD_VI[r.start_breakdown] || '—'}{r.end_breakdown && r.end_breakdown !== r.start_breakdown ? ` → ${BD_VI[r.end_breakdown]}` : ''}</b></div>
                </div>
              )}

              {/* Mốc thời gian (ngày giờ) — chữ nhỏ dưới card */}
              <div style={{ fontSize: 10.5, color: HNH.ink4, marginTop: 6, lineHeight: 1.55 }}>
                Tạo: <b style={{ color: HNH.ink3 }}>{fmtDT(r.requested_date)}</b>
                {r.updated_at && <> · Cập nhật: <b style={{ color: HNH.ink3 }}>{fmtDT(r.updated_at)}</b></>}
                {r.approved_at && <> · Duyệt: <b style={{ color: HNH.success }}>{fmtDT(r.approved_at)}</b>{r.approved_by ? <> bởi <b style={{ color: HNH.ink3 }}>{r.approved_by}</b></> : null}</>}
              </div>

              {/* Hành động */}
              <div className="flex items-center gap-2" style={{ marginTop: 9, flexWrap: 'wrap' }}>
                <button onClick={() => setDetailId(r.id)}
                  className="flex items-center gap-1 border-none cursor-pointer" style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, background: HNH.navy, color: '#fff' }}>
                  <Icon name="eye" size={13} color="#fff" stroke={2.2} />Xem chi tiết
                </button>
                <button onClick={() => toggleSeen(r)} disabled={busy === r.id}
                  className="border-none cursor-pointer" style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, background: r.seen ? HNH.cream2 : HNH.navy50, color: r.seen ? HNH.ink3 : HNH.navy }}>
                  {r.seen ? '✓ Đã xem' : 'Đánh dấu đã xem'}
                </button>
                {r.status === 'requested' && (
                  <>
                    <button onClick={() => doApprove(r.id)} disabled={busy === r.id}
                      className="border-none cursor-pointer" style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: HNH.success, color: '#fff' }}>Duyệt</button>
                    <button onClick={() => { setReasonModal({ id: r.id, kind: 'reject' }); setReasonText('') }} disabled={busy === r.id}
                      className="border-none cursor-pointer" style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: HNH.red50, color: HNH.red }}>Từ chối</button>
                  </>
                )}
                {r.status === 'approved' && (
                  <button onClick={() => { setReasonModal({ id: r.id, kind: 'cancel' }); setReasonText('') }} disabled={busy === r.id}
                    className="border-none cursor-pointer" style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: HNH.red50, color: HNH.red }}>Hủy đơn</button>
                )}
              </div>
            </div>
          )
  }
}
