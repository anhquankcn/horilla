import { useState, useEffect, useCallback, useRef } from 'react'
import { HNH } from '../lib/theme'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

/* ── Types ── */
interface TicketType { id: number; title: string; type: string; prefix: string }

interface TicketBrief {
  id: number; ticket_id: string; title: string
  ticket_type: { id: number; title: string } | null
  priority: string; status: string; status_display: string
  created_date: string; deadline: string | null
  comment_count: number; attachment_count: number
  employee_name: string
}

interface CommentItem {
  id: number; comment: string; author: string; author_id: number; date: string
  attachments: { id: number; url: string; format: string; name: string }[]
}

interface TicketDetail extends TicketBrief {
  description: string; resolved_date: string | null
  assigned_to: { id: number; name: string }[]
  comments: CommentItem[]
  attachments: { id: number; url: string; format: string; name: string }[]
}

/* ── Constants ── */
const PIPELINE: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'new',         label: 'Mới',           color: HNH.navy,    bg: HNH.navy50 },
  { key: 'in_progress', label: 'Đang xử lý',    color: '#d97706',   bg: '#fef3c7' },
  { key: 'on_hold',     label: 'Chờ phản hồi',  color: HNH.red,     bg: HNH.red50 },
  { key: 'resolved',    label: 'Đã giải quyết', color: HNH.success, bg: HNH.success50 },
  { key: 'canceled',    label: 'Đã đóng',       color: HNH.ink3,    bg: '#f0f0f0' },
]

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Thấp',    color: HNH.ink3,   bg: '#f0f0f0' },
  medium: { label: 'TB',      color: '#d97706',  bg: '#fef3c7' },
  high:   { label: 'Cao',     color: HNH.red,    bg: HNH.red50 },
}

/* ── Helpers ── */
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : null
const isOverdue = (d: string | null) => d ? new Date(d) < new Date() : false

/* ── Sub-components ── */

function PriorityBadge({ p }: { p: string }) {
  const m = PRIORITY_META[p] ?? PRIORITY_META.low
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, color: m.color, background: m.bg }}>
      {m.label}
    </span>
  )
}

function TicketCard({ ticket, onClick }: { ticket: TicketBrief; onClick: () => void }) {
  const overdue = isOverdue(ticket.deadline)
  return (
    <button
      onClick={onClick}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 12, padding: '12px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 10,
        border: `1px solid ${HNH.line}`,
      }}
    >
      <div className="flex items-start justify-between gap-2" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.2 }}>
          {ticket.ticket_id}
        </span>
        <PriorityBadge p={ticket.priority} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, margin: '0 0 8px', lineHeight: 1.4, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {ticket.title}
      </p>
      {ticket.ticket_type && (
        <span style={{ fontSize: 10, color: HNH.navy, background: HNH.navy50, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
          {ticket.ticket_type.title}
        </span>
      )}
      <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <div className="flex items-center gap-2">
          {ticket.comment_count > 0 && (
            <span style={{ fontSize: 11, color: HNH.ink3 }}>💬 {ticket.comment_count}</span>
          )}
          {ticket.attachment_count > 0 && (
            <span style={{ fontSize: 11, color: HNH.ink3 }}>📎 {ticket.attachment_count}</span>
          )}
        </div>
        {ticket.deadline && (
          <span style={{ fontSize: 10, fontWeight: 600, color: overdue ? HNH.red : HNH.ink3 }}>
            {overdue ? '⚠ ' : ''}{fmtDate(ticket.deadline)}
          </span>
        )}
      </div>
    </button>
  )
}

/* ── Create Ticket Sheet ── */
function CreateSheet({
  ticketTypes, onClose, onCreated,
}: {
  ticketTypes: TicketType[]
  onClose: () => void
  onCreated: (t: TicketDetail) => void
}) {
  const [title, setTitle] = useState('')
  const [typeId, setTypeId] = useState('')
  const [priority, setPriority] = useState('low')
  const [desc, setDesc] = useState('')
  const [deadline, setDeadline] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    setErr('')
    if (!title.trim()) { setErr('Nhập tiêu đề yêu cầu'); return }
    if (!typeId) { setErr('Chọn loại yêu cầu'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('ticket_type', typeId)
      fd.append('priority', priority)
      fd.append('description', desc)
      if (deadline) fd.append('deadline', deadline)
      files.forEach(f => fd.append('files', f))
      const res = await api.postForm<TicketDetail>('/api/helpdesk/tickets/', fd)
      onCreated(res)
    } catch {
      setErr('Tạo yêu cầu thất bại, thử lại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 40px', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: HNH.ink, margin: 0 }}>Tạo yêu cầu hỗ trợ</h2>
          <button onClick={onClose} style={{ background: HNH.line, border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: HNH.ink2 }}>Hủy</button>
        </div>

        {err && <p style={{ color: HNH.red, fontSize: 13, marginBottom: 12 }}>{err}</p>}

        <Field label="Tiêu đề *">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Mô tả ngắn về vấn đề..."
            style={inputStyle}
          />
        </Field>

        <Field label="Loại yêu cầu *">
          <select value={typeId} onChange={e => setTypeId(e.target.value)} style={inputStyle}>
            <option value="">-- Chọn loại --</option>
            {ticketTypes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>

        <Field label="Mức độ ưu tiên">
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map(p => {
              const m = PRIORITY_META[p]
              return (
                <button key={p} onClick={() => setPriority(p)} style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${priority === p ? m.color : HNH.line}`,
                  background: priority === p ? m.bg : '#fff',
                  color: priority === p ? m.color : HNH.ink2,
                  cursor: 'pointer',
                }}>
                  {m.label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Mô tả chi tiết">
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)} rows={3}
            placeholder="Mô tả vấn đề, các bước tái hiện lỗi, ảnh chụp màn hình..."
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
          />
        </Field>

        <Field label="Deadline (không bắt buộc)">
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Đính kèm ảnh / file">
          <button
            onClick={() => fileRef.current?.click()}
            style={{ ...inputStyle, textAlign: 'left', color: HNH.ink2, cursor: 'pointer' }}
          >
            {files.length ? `${files.length} file đã chọn` : '+ Chọn ảnh hoặc file...'}
          </button>
          <input
            ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xlsx"
            style={{ display: 'none' }}
            onChange={e => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {files.map((f, i) => (
                <span key={i} style={{ display: 'inline-block', fontSize: 11, background: HNH.navy50, color: HNH.navy, padding: '2px 8px', borderRadius: 4, marginRight: 4, marginBottom: 4 }}>
                  {f.name}
                </span>
              ))}
            </div>
          )}
        </Field>

        <button
          onClick={submit} disabled={saving}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? HNH.ink4 : HNH.navy, color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 8,
          }}
        >
          {saving ? 'Đang gửi...' : 'Gửi yêu cầu'}
        </button>
      </div>
    </div>
  )
}

/* ── Ticket Detail Sheet ── */
function DetailSheet({
  ticket: initial, myId, onClose, onStatusChange,
}: {
  ticket: TicketDetail
  myId: number
  onClose: () => void
  onStatusChange: (id: number, s: string) => void
}) {
  const [ticket, setTicket] = useState(initial)
  const [commentText, setCommentText] = useState('')
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const col = PIPELINE.find(s => s.key === ticket.status) ?? PIPELINE[0]

  const sendComment = async () => {
    if (!commentText.trim()) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('comment', commentText.trim())
      commentFiles.forEach(f => fd.append('files', f))
      const c = await api.postForm<CommentItem>(`/api/helpdesk/tickets/${ticket.id}/comment/`, fd)
      setTicket(prev => ({ ...prev, comments: [...prev.comments, c], comment_count: prev.comment_count + 1 }))
      setCommentText('')
      setCommentFiles([])
    } catch { /* silent */ }
    setSending(false)
  }

  const changeStatus = async (newStatus: string) => {
    setChangingStatus(true)
    try {
      const updated = await api.patch<TicketDetail>(`/api/helpdesk/tickets/${ticket.id}/`, { status: newStatus })
      setTicket(updated)
      onStatusChange(ticket.id, newStatus)
    } catch { /* silent */ }
    setChangingStatus(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${HNH.line}` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3 }}>{ticket.ticket_id}</span>
            <button onClick={onClose} style={{ background: HNH.line, border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: HNH.ink2 }}>Đóng</button>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: HNH.ink, margin: '0 0 8px' }}>{ticket.title}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 11, fontWeight: 700, color: col.color, background: col.bg, padding: '3px 8px', borderRadius: 6 }}>
              {col.label}
            </span>
            <PriorityBadge p={ticket.priority} />
            {ticket.ticket_type && (
              <span style={{ fontSize: 11, color: HNH.navy, background: HNH.navy50, padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                {ticket.ticket_type.title}
              </span>
            )}
          </div>
        </div>

        {/* Body scroll */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px' }}>
          {ticket.description && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4 }}>Mô tả</p>
              <p style={{ fontSize: 13, color: HNH.ink2, lineHeight: 1.6, margin: 0 }}>{ticket.description}</p>
            </div>
          )}

          {/* Attachments */}
          {ticket.attachments.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>File đính kèm</p>
              <div className="flex flex-wrap gap-2">
                {ticket.attachments.map(a => (
                  a.format === 'image'
                    ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} style={{ height: 60, width: 60, objectFit: 'cover', borderRadius: 8, border: `1px solid ${HNH.line}` }} /></a>
                    : <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: HNH.navy, background: HNH.navy50, padding: '3px 8px', borderRadius: 4 }}>{a.name}</a>
                ))}
              </div>
            </div>
          )}

          {/* Status change buttons (own ticket or assigned) */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>Đổi trạng thái</p>
            <div className="flex flex-wrap gap-2">
              {PIPELINE.filter(s => s.key !== ticket.status && s.key !== 'canceled').map(s => (
                <button key={s.key} onClick={() => !changingStatus && changeStatus(s.key)}
                  style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.color}30`, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
                  → {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 8 }}>
              Trao đổi {ticket.comment_count > 0 ? `(${ticket.comment_count})` : ''}
            </p>
            {ticket.comments.length === 0 && (
              <p style={{ fontSize: 13, color: HNH.ink3, fontStyle: 'italic' }}>Chưa có trao đổi nào</p>
            )}
            {ticket.comments.map(c => (
              <div key={c.id} style={{ marginBottom: 12, background: c.author_id === myId ? HNH.navy50 : '#f8f8f8', borderRadius: 10, padding: '10px 12px' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.author_id === myId ? HNH.navy : HNH.ink2 }}>{c.author}</span>
                  <span style={{ fontSize: 10, color: HNH.ink3 }}>{c.date}</span>
                </div>
                <p style={{ fontSize: 13, color: HNH.ink, margin: 0, lineHeight: 1.5 }}>{c.comment}</p>
                {c.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                    {c.attachments.map(a => (
                      a.format === 'image'
                        ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 6 }} /></a>
                        : <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: HNH.navy, background: HNH.navy50, padding: '2px 6px', borderRadius: 4 }}>{a.name}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Comment input */}
        <div style={{ padding: '10px 16px 34px', borderTop: `1px solid ${HNH.line}`, background: '#fff' }}>
          <div className="flex gap-2 items-end">
            <div style={{ flex: 1 }}>
              <textarea
                value={commentText} onChange={e => setCommentText(e.target.value)} rows={1}
                placeholder="Nhập phản hồi..."
                style={{ ...inputStyle, resize: 'none', fontSize: 13, padding: '8px 12px' }}
              />
              {commentFiles.length > 0 && (
                <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>
                  {commentFiles.map(f => f.name).join(', ')}
                </div>
              )}
            </div>
            <button onClick={() => fileRef.current?.click()} style={{ background: HNH.line, border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 16, color: HNH.ink2 }}>📎</button>
            <button
              onClick={sendComment} disabled={sending || !commentText.trim()}
              style={{ background: !commentText.trim() ? HNH.ink4 : HNH.navy, border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: sending || !commentText.trim() ? 'not-allowed' : 'pointer' }}
            >
              Gửi
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setCommentFiles(Array.from(e.target.files ?? []))} />
        </div>
      </div>
    </div>
  )
}

/* ── Shared style ── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1.5px solid ${HNH.line}`, fontSize: 14, color: HNH.ink,
  background: '#fff', boxSizing: 'border-box', outline: 'none',
  fontFamily: 'inherit',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

/* ── Main Page ── */
export function HelpDeskPage() {
  const { employee } = useAuth()
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  const [tickets, setTickets] = useState<TicketBrief[]>([])
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [isManager, setIsManager] = useState(false)
  const [activeStatus, setActiveStatus] = useState<string>('new')
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchTickets = useCallback(async (t: 'mine' | 'all') => {
    setLoading(true)
    try {
      const res = await api.get<{ count: number; results: TicketBrief[]; is_manager: boolean }>(
        `/api/helpdesk/tickets/?tab=${t}`
      )
      setTickets(res.results)
      setIsManager(res.is_manager)
    } catch { setTickets([]) }
    setLoading(false)
  }, [])

  useEffect(() => {
    api.get<TicketType[]>('/api/helpdesk/ticket-types/').then(setTicketTypes).catch(() => {})
  }, [])

  useEffect(() => { fetchTickets(tab) }, [tab, fetchTickets])

  const openDetail = async (id: number) => {
    setLoadingDetail(true)
    try {
      const d = await api.get<TicketDetail>(`/api/helpdesk/tickets/${id}/`)
      setDetail(d)
    } catch { /* silent */ }
    setLoadingDetail(false)
  }

  const onCreated = (t: TicketDetail) => {
    setCreating(false)
    setTickets(prev => [t as unknown as TicketBrief, ...prev])
    setActiveStatus('new')
    setDetail(t)
  }

  const onStatusChange = (id: number, newStatus: string) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, status_display: PIPELINE.find(s => s.key === newStatus)?.label ?? newStatus } : t))
  }

  const byStatus = PIPELINE.map(s => ({
    ...s,
    items: tickets.filter(t => t.status === s.key),
  }))

  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh', background: HNH.cream }}>
      <TopBar title="Hỗ trợ" sub="Help Desk" />

      {/* Tab: mine / all */}
      {isManager && (
        <div className="flex" style={{ padding: '10px 16px 0', gap: 8 }}>
          {(['mine', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: tab === t ? HNH.navy : HNH.navy50, color: tab === t ? '#fff' : HNH.navy,
            }}>
              {t === 'mine' ? 'Của tôi' : 'Tất cả'}
            </button>
          ))}
        </div>
      )}

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto' }}>
        {byStatus.map(s => (
          <button key={s.key} onClick={() => setActiveStatus(s.key)} style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            background: activeStatus === s.key ? s.color : s.bg,
            color: activeStatus === s.key ? '#fff' : s.color,
          }}>
            {s.label} {s.items.length > 0 ? `(${s.items.length})` : ''}
          </button>
        ))}
      </div>

      {/* Kanban column content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 100px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: HNH.ink3, fontSize: 14 }}>Đang tải...</div>
        ) : byStatus.find(s => s.key === activeStatus)?.items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: '0 0 8px' }}>🎉</p>
            <p style={{ fontSize: 14, color: HNH.ink3 }}>Không có yêu cầu nào</p>
          </div>
        ) : (
          byStatus.find(s => s.key === activeStatus)?.items.map(t => (
            <TicketCard key={t.id} ticket={t} onClick={() => openDetail(t.id)} />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setCreating(true)}
        style={{
          position: 'fixed', bottom: 88, right: 20, width: 52, height: 52, borderRadius: '50%',
          background: HNH.navy, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(20,43,111,0.40)',
          color: '#fff', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
        }}
      >
        +
      </button>

      {/* Loading overlay for detail */}
      {loadingDetail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 24px', fontSize: 14, color: HNH.ink2 }}>Đang tải...</div>
        </div>
      )}

      {/* Sheets */}
      {creating && (
        <CreateSheet
          ticketTypes={ticketTypes}
          onClose={() => setCreating(false)}
          onCreated={onCreated}
        />
      )}
      {detail && (
        <DetailSheet
          ticket={detail}
          myId={employee?.id ?? 0}
          onClose={() => setDetail(null)}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  )
}
