import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

/* ── Types ── */
type Tab = 'create' | 'history' | 'received'
type TargetType = 'individual' | 'multi_user' | 'department' | 'company'

interface Emp {
  id: number; name: string; badge_id: string; department?: string
  accounting_code?: string; company_id?: number | null; department_id?: number | null
}
interface Dept { id: number; department: string }
interface Company { id: number; company: string }

interface AnnItem {
  id: number; title: string; body: string
  target_type: TargetType; target_label: string
  target_department: string | null; target_company: string | null
  sender_name: string; created_at: string
  recipient_count: number; read_count: number; feedback_count: number
  read?: boolean; read_at?: string | null
}

interface FeedbackItem { id: number; user_name: string; message: string; created_at: string }

interface AnnDetail extends AnnItem {
  is_sender: boolean
  feedbacks?: FeedbackItem[]
  recipients_detail?: { user_name: string; read: boolean; read_at: string | null }[]
  my_feedback?: { message: string; created_at: string } | null
}

/* ── Constants ── */
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'create', label: 'Tạo', icon: 'edit' },
  { key: 'history', label: 'Đã gửi', icon: 'send' },
  { key: 'received', label: 'Hộp thư', icon: 'bell' },
]

const TARGET_OPTIONS: { value: TargetType; label: string; icon: string; desc: string }[] = [
  { value: 'individual', label: 'Cá nhân', icon: 'users', desc: 'Gửi cho 1 nhân viên' },
  { value: 'multi_user', label: 'Nhiều người', icon: 'users', desc: 'Chọn nhiều nhân viên' },
  { value: 'department', label: 'Phòng ban', icon: 'folder', desc: 'Gửi cả phòng ban' },
  { value: 'company', label: 'Toàn công ty', icon: 'globe', desc: 'Gửi cho tất cả' },
]

/* ── Helpers ── */
function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ngày trước`
  return new Date(ts).toLocaleDateString('vi-VN')
}

/* ── Sub Components ── */

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex" style={{
      margin: '0 16px 12px', background: HNH.cream2,
      borderRadius: 14, padding: 3, border: `1px solid ${HNH.line}`,
    }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
          style={{
            padding: '10px 0', borderRadius: 11, fontWeight: 700, fontSize: 13,
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? HNH.navy : HNH.ink3,
            boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          <Icon name={t.icon} size={14} color={tab === t.key ? HNH.navy : HNH.ink3} stroke={2} />
          {t.label}
        </button>
      ))}
    </div>
  )
}

function TargetTypeSelector({ value, onChange }: { value: TargetType; onChange: (v: TargetType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TARGET_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="flex items-center gap-2.5 border-none cursor-pointer text-left"
          style={{
            padding: '12px 14px', borderRadius: 14,
            background: value === opt.value ? HNH.navy : '#fff',
            border: `1.5px solid ${value === opt.value ? HNH.navy : HNH.line}`,
            transition: 'all 0.15s',
          }}
        >
          <div className="flex items-center justify-center shrink-0" style={{
            width: 32, height: 32, borderRadius: 10,
            background: value === opt.value ? 'rgba(255,255,255,0.2)' : HNH.navy50,
          }}>
            <Icon name={opt.icon} size={15} color={value === opt.value ? '#fff' : HNH.navy} stroke={2} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: value === opt.value ? '#fff' : HNH.ink }}>{opt.label}</div>
            <div style={{ fontSize: 10.5, color: value === opt.value ? 'rgba(255,255,255,0.7)' : HNH.ink3 }}>{opt.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function noAccent(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
}

function EmployeePicker({ selected, onToggle, employees, search, onSearch, companies }: {
  selected: Set<number>; onToggle: (id: number) => void
  employees: Emp[]; search: string; onSearch: (s: string) => void
  companies: Company[]
}) {
  const [fCompany, setFCompany] = useState<number | null>(companies.length === 1 ? companies[0].id : null)
  const [fDept, setFDept] = useState<number | null>(null)

  // Phòng ban khả dụng suy ra từ nhân sự thuộc công ty đang lọc (không cần map riêng)
  const deptOptions = useMemo(() => {
    const m = new Map<number, string>()
    for (const e of employees) {
      if (fCompany != null && e.company_id !== fCompany) continue
      if (e.department_id != null && e.department) m.set(e.department_id, e.department)
    }
    return [...m.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [employees, fCompany])

  const q = noAccent(search.trim())
  const filtered = employees.filter(e => {
    if (fCompany != null && e.company_id !== fCompany) return false
    if (fDept != null && e.department_id !== fDept) return false
    if (!q) return true
    return (
      noAccent(e.name).includes(q) ||
      (e.badge_id || '').toLowerCase().includes(q) ||
      (e.accounting_code || '').toLowerCase().includes(q)
    )
  })

  const selStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: 10, fontSize: 12.5,
    border: `1.5px solid ${HNH.line}`, background: '#fff', color: HNH.ink, fontWeight: 600,
    appearance: 'auto',
  }

  return (
    <div>
      {/* Lọc Công ty → Phòng ban */}
      <div className="flex gap-2" style={{ marginBottom: 8 }}>
        {companies.length > 1 && (
          <select
            value={fCompany ?? ''}
            onChange={e => { const v = e.target.value; setFCompany(v ? Number(v) : null); setFDept(null) }}
            style={selStyle}
          >
            <option value="">Tất cả công ty</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
          </select>
        )}
        <select
          value={fDept ?? ''}
          onChange={e => { const v = e.target.value; setFDept(v ? Number(v) : null) }}
          style={selStyle}
        >
          <option value="">Tất cả phòng ban</option>
          {deptOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2" style={{
        background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 12, padding: '8px 12px', marginBottom: 8,
      }}>
        <Icon name="search" size={16} color={HNH.ink3} stroke={2} />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Mã nhân sự, mã kế toán, họ tên..."
          style={{
            border: 'none', outline: 'none', flex: 1, fontSize: 13,
            color: HNH.ink, background: 'transparent',
          }}
        />
      </div>
      {selected.size > 0 && (
        <div style={{ fontSize: 12, color: HNH.navy, fontWeight: 700, marginBottom: 6 }}>
          Đã chọn: {selected.size} người
        </div>
      )}
      <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 12, border: `1px solid ${HNH.line}` }}>
        {filtered.slice(0, 50).map((e, i) => (
          <button
            key={e.id}
            onClick={() => onToggle(e.id)}
            className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
            style={{
              padding: '10px 14px', background: selected.has(e.id) ? `${HNH.navy}0a` : '#fff',
              borderBottom: i < filtered.length - 1 ? `1px solid ${HNH.line}` : 'none',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${selected.has(e.id) ? HNH.navy : HNH.ink4}`,
              background: selected.has(e.id) ? HNH.navy : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {selected.has(e.id) && <Icon name="check" size={12} color="#fff" stroke={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{e.name}</div>
              <div style={{ fontSize: 11, color: HNH.ink3 }}>{e.badge_id}{e.accounting_code ? ` · KT ${e.accounting_code}` : ''}{e.department ? ` · ${e.department}` : ''}</div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Không tìm thấy</div>
        )}
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: number | null
  options: { id: number; label: string }[]
  onChange: (id: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 6 }}>{label}</div>
      <select
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14,
          border: `1.5px solid ${HNH.line}`, background: '#fff', color: HNH.ink, fontWeight: 600,
          appearance: 'auto',
        }}
      >
        <option value="" disabled>Chọn...</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

function AnnCard({ item, onClick }: { item: AnnItem; onClick: () => void }) {
  const isReceived = item.read !== undefined
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full border-none cursor-pointer text-left"
      style={{
        padding: '14px 16px', borderRadius: 16, background: '#fff',
        border: `1px solid ${isReceived && !item.read ? HNH.navy : HNH.line}`,
        boxShadow: isReceived && !item.read ? `0 0 0 1px ${HNH.navy}20` : 'none',
      }}
    >
      <div className="flex items-center justify-center shrink-0" style={{
        width: 38, height: 38, borderRadius: 12, background: HNH.navy50,
      }}>
        <Icon name="send" size={18} color={HNH.navy} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: 14, fontWeight: 700, color: HNH.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
          }}>{item.title}</span>
          {isReceived && !item.read && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: HNH.red, flexShrink: 0 }} />
          )}
        </div>
        <div style={{
          fontSize: 12, color: HNH.ink3, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.body}</div>
        <div className="flex items-center gap-3" style={{ marginTop: 6, fontSize: 11, color: HNH.ink3 }}>
          <span>{isReceived ? item.sender_name : item.target_label}</span>
          <span>·</span>
          <span>{relTime(item.created_at)}</span>
          {!isReceived && (
            <>
              <span>·</span>
              <span style={{ color: HNH.navy, fontWeight: 600 }}>{item.feedback_count} phản hồi</span>
            </>
          )}
        </div>
      </div>
      <Icon name="chev-r" size={16} color={HNH.ink4} stroke={2} />
    </button>
  )
}

function DetailModal({ detail, onClose, onFeedback }: {
  detail: AnnDetail; onClose: () => void; onFeedback: (msg: string) => void
}) {
  const [fbText, setFbText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    if (!fbText.trim() || sending) return
    setSending(true)
    await onFeedback(fbText.trim())
    setFbText('')
    setSending(false)
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 100, background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '24px 24px 0 0', width: '100%',
          maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '18px 20px 0' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: HNH.ink }}>{detail.title}</div>
          <button onClick={onClose} className="border-none cursor-pointer bg-transparent" style={{ padding: 4 }}>
            <Icon name="x" size={20} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        <div style={{ padding: '0 20px', overflowY: 'auto', flex: 1 }}>
          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
              background: HNH.navy50, color: HNH.navy,
            }}>{detail.target_label}</span>
            {detail.target_department && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 8, background: HNH.cream2, color: HNH.ink2 }}>
                {detail.target_department}
              </span>
            )}
            <span style={{ fontSize: 11, color: HNH.ink3 }}>{relTime(detail.created_at)}</span>
          </div>

          <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 6 }}>
            Gửi bởi: <strong style={{ color: HNH.ink }}>{detail.sender_name}</strong>
          </div>

          {/* Body */}
          <div style={{
            marginTop: 14, padding: 16, background: HNH.cream, borderRadius: 14,
            fontSize: 14, color: HNH.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {detail.body}
          </div>

          {/* Stats (sender view) */}
          {detail.is_sender && (
            <div className="flex gap-3" style={{ marginTop: 14 }}>
              {[
                { label: 'Gửi', val: detail.recipient_count, color: HNH.navy },
                { label: 'Đã đọc', val: detail.read_count, color: HNH.success },
                { label: 'Phản hồi', val: detail.feedback_count, color: '#a87908' },
              ].map(s => (
                <div key={s.label} className="flex-1" style={{
                  background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 12, padding: '10px 12px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Feedbacks (sender view) */}
          {detail.is_sender && detail.feedbacks && detail.feedbacks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>Phản hồi</div>
              {detail.feedbacks.map(fb => (
                <div key={fb.id} style={{
                  padding: '12px 14px', borderRadius: 14, background: '#fff',
                  border: `1px solid ${HNH.line}`, marginBottom: 6,
                }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{fb.user_name}</span>
                    <span style={{ fontSize: 10.5, color: HNH.ink3 }}>{relTime(fb.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: HNH.ink2, marginTop: 4 }}>{fb.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recipients list (sender view) */}
          {detail.is_sender && detail.recipients_detail && detail.recipients_detail.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
                Người nhận ({detail.recipients_detail.length})
              </div>
              <div style={{ borderRadius: 14, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
                {detail.recipients_detail.map((r, i) => (
                  <div key={i} className="flex items-center justify-between" style={{
                    padding: '10px 14px', background: '#fff',
                    borderBottom: i < detail.recipients_detail!.length - 1 ? `1px solid ${HNH.line}` : 'none',
                  }}>
                    <span style={{ fontSize: 13, color: HNH.ink }}>{r.user_name}</span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: r.read ? HNH.success50 : HNH.cream2,
                      color: r.read ? HNH.success : HNH.ink3,
                    }}>{r.read ? 'Đã đọc' : 'Chưa đọc'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My feedback (recipient view) */}
          {!detail.is_sender && detail.my_feedback && (
            <div style={{
              marginTop: 14, padding: '12px 14px', borderRadius: 14,
              background: HNH.success50, border: `1px solid ${HNH.success}30`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.success, marginBottom: 4 }}>Phản hồi của bạn</div>
              <div style={{ fontSize: 13, color: HNH.ink }}>{detail.my_feedback.message}</div>
            </div>
          )}

          {/* Feedback input (recipient view, no existing feedback) */}
          {!detail.is_sender && !detail.my_feedback && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 6 }}>Phản hồi</div>
              <textarea
                value={fbText}
                onChange={e => setFbText(e.target.value)}
                placeholder="Viết phản hồi..."
                rows={3}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14,
                  border: `1.5px solid ${HNH.line}`, resize: 'none', fontFamily: 'inherit',
                  color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!fbText.trim() || sending}
                className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
                style={{
                  marginTop: 8, height: 44, borderRadius: 12, fontWeight: 700, fontSize: 14,
                  background: fbText.trim() ? HNH.navy : HNH.cream2,
                  color: fbText.trim() ? '#fff' : HNH.ink3,
                }}
              >
                <Icon name="send" size={16} color={fbText.trim() ? '#fff' : HNH.ink3} stroke={2} />
                {sending ? 'Đang gửi...' : 'Gửi phản hồi'}
              </button>
            </div>
          )}
        </div>

        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function AnnouncementHubPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('create')

  // Create form state
  const [targetType, setTargetType] = useState<TargetType>('company')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set())
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null)
  const [sendAsSystem, setSendAsSystem] = useState(false)
  const [empSearch, setEmpSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Data
  const [employees, setEmployees] = useState<Emp[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [history, setHistory] = useState<AnnItem[]>([])
  const [received, setReceived] = useState<AnnItem[]>([])
  const [detail, setDetail] = useState<AnnDetail | null>(null)
  const [loading, setLoading] = useState(false)

  // Load targets data
  useEffect(() => {
    api.get<{ departments: Dept[]; companies: Company[] }>('/api/notifications/announcements/targets/')
      .then(d => {
        setDepartments(d.departments)
        setCompanies(d.companies)
        if (d.companies.length === 1) setSelectedCompany(d.companies[0].id)
      })
      .catch(() => {})

    api.get<{ results: Emp[] } | Emp[]>('/api/employee/employee-selector/?page_size=500')
      .then(d => {
        const list = Array.isArray(d) ? d : (d.results ?? [])
        setEmployees(list.map((e: any) => ({
          id: e.id,
          name: e.employee_first_name
            ? `${e.employee_first_name} ${e.employee_last_name ?? ''}`.trim()
            : e.employee_name ?? `#${e.id}`,
          badge_id: e.badge_id ?? '',
          department: e.department_name ?? e.department ?? '',
          accounting_code: e.accounting_code ?? '',
          company_id: e.company_id ?? null,
          department_id: e.department_id ?? null,
        })))
      })
      .catch(() => {})
  }, [])

  const loadHistory = useCallback(() => {
    setLoading(true)
    api.get<AnnItem[]>('/api/notifications/announcements/history/')
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadReceived = useCallback(() => {
    setLoading(true)
    api.get<AnnItem[]>('/api/notifications/announcements/received/')
      .then(setReceived)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'history') loadHistory()
    if (tab === 'received') loadReceived()
  }, [tab, loadHistory, loadReceived])

  const openDetail = async (id: number) => {
    try {
      const d = await api.get<AnnDetail>(`/api/notifications/announcements/${id}/`)
      setDetail(d)
    } catch {
      toast('Không thể tải thông báo')
    }
  }

  const handleFeedback = async (msg: string) => {
    if (!detail) return
    try {
      await api.post(`/api/notifications/announcements/${detail.id}/feedback/`, { message: msg })
      const d = await api.get<AnnDetail>(`/api/notifications/announcements/${detail.id}/`)
      setDetail(d)
      toast('Đã gửi phản hồi')
    } catch {
      toast('Lỗi khi gửi phản hồi')
    }
  }

  const toggleUser = (id: number) => {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const canSend = (): boolean => {
    if (!title.trim() || !body.trim()) return false
    if (targetType === 'individual' && selectedUsers.size !== 1) return false
    if (targetType === 'multi_user' && selectedUsers.size === 0) return false
    if (targetType === 'department' && !selectedDept) return false
    return true
  }

  const handleSend = async () => {
    if (!canSend() || submitting) return
    setSubmitting(true)
    try {
      const payload: Record<string, any> = { title: title.trim(), body: body.trim(), target_type: targetType, send_as_system: sendAsSystem }
      if (targetType === 'individual') payload.user_id = [...selectedUsers][0]
      if (targetType === 'multi_user') payload.user_ids = [...selectedUsers]
      if (targetType === 'department') payload.department_id = selectedDept
      if (targetType === 'company') payload.company_id = selectedCompany

      await api.post('/api/notifications/announcements/', payload)
      toast('Đã gửi thông báo thành công!')
      setTitle(''); setBody(''); setSelectedUsers(new Set()); setEmpSearch(''); setSendAsSystem(false)
      setTab('history')
      loadHistory()
    } catch {
      toast('Lỗi khi gửi thông báo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Hub Thông Báo" onBack={() => navigate(-1)} />
      <TabBar tab={tab} onChange={setTab} />

      <PullToRefresh onRefresh={async () => {
        if (tab === 'history') loadHistory()
        if (tab === 'received') loadReceived()
      }}>
        <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>

          {/* ── Create Tab ── */}
          {tab === 'create' && (
            <div className="flex flex-col gap-4">
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 8 }}>Gửi tới</div>
                <TargetTypeSelector value={targetType} onChange={v => { setTargetType(v); setSelectedUsers(new Set()) }} />
              </div>

              {(targetType === 'individual' || targetType === 'multi_user') && (
                <EmployeePicker
                  selected={selectedUsers}
                  onToggle={id => {
                    if (targetType === 'individual') {
                      setSelectedUsers(prev => prev.has(id) ? new Set() : new Set([id]))
                    } else {
                      toggleUser(id)
                    }
                  }}
                  employees={employees}
                  search={empSearch}
                  onSearch={setEmpSearch}
                  companies={companies}
                />
              )}

              {targetType === 'department' && (
                <SelectField
                  label="Phòng ban"
                  value={selectedDept}
                  options={departments.map(d => ({ id: d.id, label: d.department }))}
                  onChange={setSelectedDept}
                />
              )}

              {targetType === 'company' && companies.length > 1 && (
                <SelectField
                  label="Công ty"
                  value={selectedCompany}
                  options={companies.map(c => ({ id: c.id, label: c.company }))}
                  onChange={setSelectedCompany}
                />
              )}

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 6 }}>Tiêu đề</div>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Nhập tiêu đề thông báo..."
                  maxLength={200}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14,
                    border: `1.5px solid ${HNH.line}`, color: HNH.ink, background: '#fff',
                    fontWeight: 600, boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 6 }}>Nội dung</div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Nhập nội dung thông báo..."
                  rows={5}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14,
                    border: `1.5px solid ${HNH.line}`, resize: 'vertical', fontFamily: 'inherit',
                    color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Send as system toggle */}
              <button
                onClick={() => setSendAsSystem(v => !v)}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  padding: '12px 14px', borderRadius: 14, background: '#fff',
                  border: `1.5px solid ${sendAsSystem ? HNH.navy : HNH.line}`,
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                  border: `2px solid ${sendAsSystem ? HNH.navy : HNH.ink4}`,
                  background: sendAsSystem ? HNH.navy : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sendAsSystem && <Icon name="check" size={13} color="#fff" stroke={3} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>Gửi với tên HRM System</div>
                  <div style={{ fontSize: 11, color: HNH.ink3 }}>Hiển thị "HRM System" thay vì tên cá nhân</div>
                </div>
              </button>

              <button
                onClick={handleSend}
                disabled={!canSend() || submitting}
                className="flex items-center justify-center gap-2 border-none cursor-pointer"
                style={{
                  height: 50, borderRadius: 14, fontWeight: 700, fontSize: 15,
                  background: canSend() ? HNH.navy : HNH.cream2,
                  color: canSend() ? '#fff' : HNH.ink3,
                  boxShadow: canSend() ? '0 6px 14px rgba(20,43,111,0.2)' : 'none',
                }}
              >
                <Icon name="send" size={18} color={canSend() ? '#fff' : HNH.ink3} stroke={2} />
                {submitting ? 'Đang gửi...' : 'Gửi thông báo'}
              </button>
            </div>
          )}

          {/* ── History Tab ── */}
          {tab === 'history' && (
            <div className="flex flex-col gap-3">
              {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Đang tải...</div>}
              {!loading && history.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Icon name="send" size={40} color={HNH.ink4} stroke={1.5} />
                  <div style={{ fontSize: 14, color: HNH.ink3, marginTop: 12 }}>Chưa gửi thông báo nào</div>
                </div>
              )}
              {history.map(item => (
                <AnnCard key={item.id} item={item} onClick={() => openDetail(item.id)} />
              ))}
            </div>
          )}

          {/* ── Received Tab ── */}
          {tab === 'received' && (
            <div className="flex flex-col gap-3">
              {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Đang tải...</div>}
              {!loading && received.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Icon name="bell" size={40} color={HNH.ink4} stroke={1.5} />
                  <div style={{ fontSize: 14, color: HNH.ink3, marginTop: 12 }}>Chưa nhận thông báo nào</div>
                </div>
              )}
              {received.map(item => (
                <AnnCard key={item.id} item={item} onClick={() => openDetail(item.id)} />
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>

      {/* Detail Modal */}
      {detail && (
        <DetailModal detail={detail} onClose={() => setDetail(null)} onFeedback={handleFeedback} />
      )}
    </div>
  )
}
