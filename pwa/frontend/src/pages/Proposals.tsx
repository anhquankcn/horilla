import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

/* ── Types ── */
interface ProposalType {
  id: string
  icon: string
  label: string
  desc: string
  path: string | null
  tone: 'navy' | 'success' | 'gold' | 'red'
}

interface MyProposal {
  id: number
  leave_type: string | null
  leave_type_id: number | null
  start_date: string | null
  end_date: string | null
  start_date_breakdown: string
  end_date_breakdown: string
  requested_days: number | null
  description: string
  status: string
  created_at: string | null
  reject_reason: string
}

const proposals: ProposalType[] = [
  { id: 'leave', icon: 'palm', label: 'Nghỉ phép', desc: 'Xin nghỉ phép, nghỉ theo giờ', path: '/proposals/leave', tone: 'navy' },
  { id: 'shift', icon: 'clock', label: 'Đổi Ca', desc: 'Đề xuất đổi ca làm việc', path: '/proposals/shift', tone: 'gold' },
  { id: 'workday', icon: 'cal', label: 'Ngày Công', desc: 'Điều chỉnh ngày công', path: '/proposals/attendance', tone: 'success' },
  { id: 'worktype', icon: 'briefcase', label: 'Loại Hình LV', desc: 'Thay đổi loại hình làm việc', path: '/proposals/worktype', tone: 'navy' },
  { id: 'asset', icon: 'monitor', label: 'Tài sản Công cụ', desc: 'Yêu cầu cấp tài sản, công cụ', path: null, tone: 'red' },
]

const toneBg: Record<string, string> = {
  navy: HNH.navy50, gold: '#faf1d6', success: HNH.success50, red: HNH.red50,
}
const toneColor: Record<string, string> = {
  navy: HNH.navy, gold: '#a87908', success: HNH.success, red: HNH.red,
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'requested', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: 'Chờ duyệt', color: HNH.warn, bg: HNH.warn50 },
  approved: { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50 },
  rejected: { label: 'Từ chối', color: HNH.red, bg: HNH.red50 },
  cancelled: { label: 'Đã hủy', color: HNH.ink3, bg: HNH.cream2 },
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

/* ── Proposal Card ── */
function ProposalCard({ p, onTap }: { p: MyProposal; onTap: () => void }) {
  const st = STATUS_DISPLAY[p.status] || STATUS_DISPLAY.requested
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 14, padding: '12px 14px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 38, height: 38, borderRadius: 11, background: HNH.navy50 }}
        >
          <Icon name="palm" size={18} color={HNH.navy} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
              {p.leave_type || 'Nghỉ phép'}
            </span>
            {p.requested_days && (
              <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>
                {p.requested_days} ngày
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {formatDate(p.start_date)}
            {p.end_date && p.end_date !== p.start_date ? ` → ${formatDate(p.end_date)}` : ''}
            {p.start_date_breakdown !== 'full_day' ? ` (${BREAKDOWN_VI[p.start_date_breakdown] || ''})` : ''}
          </div>
          {p.description && (
            <div style={{
              fontSize: 11, color: HNH.ink3, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.description}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span style={{
            fontSize: 10, fontWeight: 700, color: st.color,
            background: st.bg, borderRadius: 6, padding: '2px 7px',
          }}>
            {st.label}
          </span>
          <Icon name="chev-r" size={14} color={HNH.ink3} stroke={1.5} />
        </div>
      </div>
    </button>
  )
}

/* ── Detail Modal ── */
function DetailModal({ p, onClose, onEdit }: {
  p: MyProposal
  onClose: () => void
  onEdit: () => void
}) {
  const st = STATUS_DISPLAY[p.status] || STATUS_DISPLAY.requested
  const canEdit = p.status === 'requested' || p.status === 'rejected'

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 540, maxHeight: '85vh', overflow: 'auto',
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
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: st.color,
            background: st.bg, borderRadius: 6, padding: '3px 8px',
          }}>
            {st.label}
          </span>
        </div>

        {/* Content */}
        <div style={{ padding: 16 }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 14,
            border: `1px solid ${HNH.line}`,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
          }}>
            <DetailField label="Loại nghỉ" value={p.leave_type || '—'} />
            <DetailField label="Số ngày" value={p.requested_days ? `${p.requested_days} ngày` : '—'} />
            <DetailField label="Từ ngày" value={`${formatDate(p.start_date)} (${BREAKDOWN_VI[p.start_date_breakdown] || ''})`} />
            <DetailField label="Đến ngày" value={`${formatDate(p.end_date)} (${BREAKDOWN_VI[p.end_date_breakdown] || ''})`} />
            <div style={{ gridColumn: '1/-1' }}>
              <DetailField label="Lý do" value={p.description || '—'} />
            </div>
            {p.reject_reason && (
              <div style={{ gridColumn: '1/-1' }}>
                <DetailField label="Lý do từ chối" value={p.reject_reason} isRed />
              </div>
            )}
          </div>

          {canEdit && (
            <button
              onClick={onEdit}
              className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
              style={{
                marginTop: 16, padding: 13, borderRadius: 12,
                background: HNH.navy, color: '#fff',
                fontSize: 13.5, fontWeight: 700,
              }}
            >
              <Icon name="send" size={15} color="#fff" stroke={2} />
              {p.status === 'rejected' ? 'Chỉnh sửa & Gửi lại' : 'Chỉnh sửa'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value, isRed }: { label: string; value: string; isRed?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: isRed ? HNH.red : HNH.ink3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: isRed ? HNH.red : HNH.ink }}>{value}</div>
    </div>
  )
}

/* ── Main Page ── */
export function ProposalsPage() {
  const navigate = useNavigate()
  const [myProposals, setMyProposals] = useState<MyProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedProposal, setSelectedProposal] = useState<MyProposal | null>(null)

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const url = `/api/leave/my-proposals/${params.toString() ? '?' + params : ''}`
      const data = await api.get<MyProposal[]>(url)
      setMyProposals(data)
    } catch { setMyProposals([]) } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { fetchProposals() }, [fetchProposals])

  const handleEdit = (p: MyProposal) => {
    setSelectedProposal(null)
    navigate(`/proposals/leave?edit=${p.id}`)
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Đề xuất" />

      <div style={{ padding: '8px 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {/* Proposal types */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: HNH.ink3, marginBottom: 10 }}>
          Tạo đề xuất mới
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {proposals.map(p => {
            const available = !!p.path
            return (
              <button
                key={p.id}
                onClick={() => p.path && navigate(p.path)}
                disabled={!available}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  background: '#fff', borderRadius: 14, padding: '12px 14px',
                  border: `1px solid ${HNH.line}`,
                  opacity: available ? 1 : 0.55,
                  boxShadow: available ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 12, background: toneBg[p.tone] }}
                >
                  <Icon name={p.icon} size={20} color={toneColor[p.tone]} stroke={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{p.label}</span>
                    {!available && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: HNH.ink3,
                        background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
                        textTransform: 'uppercase', letterSpacing: 0.3,
                      }}>
                        Sắp ra mắt
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
                    {p.desc}
                  </div>
                </div>
                {available && <Icon name="chev-r" size={15} color={HNH.ink3} stroke={1.8} />}
              </button>
            )
          })}
        </div>

        {/* My proposals list */}
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink2 }}>
            Đề xuất của tôi
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3 }}>
            {myProposals.length} đề xuất
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className="border-none cursor-pointer"
              style={{
                padding: '5px 10px', borderRadius: 8,
                background: statusFilter === opt.value ? HNH.navy : '#fff',
                color: statusFilter === opt.value ? '#fff' : HNH.ink2,
                fontSize: 11, fontWeight: 700,
                border: `1.5px solid ${statusFilter === opt.value ? HNH.navy : HNH.line}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : myProposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Icon name="doc" size={32} color={HNH.ink3} stroke={1.5} />
            <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink3, marginTop: 8 }}>
              Chưa có đề xuất nào
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myProposals.map(p => (
              <ProposalCard key={p.id} p={p} onTap={() => setSelectedProposal(p)} />
            ))}
          </div>
        )}
      </div>

      {selectedProposal && (
        <DetailModal
          p={selectedProposal}
          onClose={() => setSelectedProposal(null)}
          onEdit={() => handleEdit(selectedProposal)}
        />
      )}
    </div>
  )
}
