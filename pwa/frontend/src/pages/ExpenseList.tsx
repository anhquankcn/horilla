import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

interface Expense {
  id: number
  date_incurred: string
  category: string
  category_display: string
  description: string
  amount: number
  receipt: string | null
  status: string
  status_display: string
  manager_note: string
  hc_note: string
  created_at: string
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:          { bg: HNH.warn50,    color: HNH.warn },
  manager_approved: { bg: '#e0f0ff',     color: '#1a6cb5' },
  hc_approved:      { bg: HNH.success50, color: HNH.success },
  rejected:         { bg: HNH.red50,     color: HNH.red },
  cancelled:        { bg: '#f0f0f0',     color: HNH.ink3 },
}

const CATEGORY_ICONS: Record<string, string> = {
  tool: 'wrench', transport: 'car', license: 'file-text', other: 'package',
}

const CATEGORIES = [
  { key: '', label: 'Tất cả' },
  { key: 'tool', label: 'Công cụ' },
  { key: 'transport', label: 'Đi lại' },
  { key: 'license', label: 'License' },
  { key: 'other', label: 'Khác' },
]

const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

/* ── Card ── */
function ExpenseCard({ item, onClick }: { item: Expense; onClick: () => void }) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending
  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 10,
      border: `1px solid ${HNH.line}`, cursor: 'pointer',
    }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
        <div className="flex items-center gap-2">
          <Icon name={CATEGORY_ICONS[item.category] || 'package'} size={16} color={HNH.ink2} />
          <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{item.category_display}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
          background: sc.bg, color: sc.color,
        }}>
          {item.status_display}
        </span>
      </div>
      <p style={{ fontSize: 13, color: HNH.ink2, margin: 0, lineHeight: 1.4 }}>
        {item.description.length > 80 ? item.description.slice(0, 80) + '...' : item.description}
      </p>
      <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: HNH.red }}>
          {item.amount.toLocaleString('vi-VN')} ₫
        </span>
        <span style={{ fontSize: 11, color: HNH.ink3 }}>
          {new Date(item.date_incurred).toLocaleDateString('vi-VN')}
        </span>
      </div>
    </div>
  )
}

/* ── Detail Modal ── */
function DetailModal({ item, onClose, onUpdated }: {
  item: Expense
  onClose: () => void
  onUpdated: () => void
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const [cancelling, setCancelling] = useState(false)
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending
  const isPending = item.status === 'pending'

  const handleCancel = async () => {
    if (!confirm('Bạn chắc chắn muốn hủy yêu cầu này?')) return
    setCancelling(true)
    try {
      await api.del(`/api/expenses/requests/${item.id}/`)
      toast.toast('Đã hủy yêu cầu')
      onClose()
      onUpdated()
    } catch {
      toast.toast('Không thể hủy', 'error')
    }
    setCancelling(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto',
          padding: '20px 20px 32px',
          animation: 'slide-up 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>Chi tiết yêu cầu</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} color={HNH.ink3} />
          </button>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
            background: sc.bg, color: sc.color,
          }}>
            {item.status_display}
          </span>
          {isPending && (
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Có thể sửa / hủy</span>
          )}
        </div>

        {/* Info rows */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Danh mục</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, margin: '2px 0 0' }}>
              {item.category_display}
            </p>
          </div>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Ngày phát sinh</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, margin: '2px 0 0' }}>
              {new Date(item.date_incurred).toLocaleDateString('vi-VN')}
            </p>
          </div>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Số tiền</span>
            <p style={{ fontSize: 18, fontWeight: 700, color: HNH.red, margin: '2px 0 0' }}>
              {item.amount.toLocaleString('vi-VN')} ₫
            </p>
          </div>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Ngày tạo</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, margin: '2px 0 0' }}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '—'}
            </p>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: HNH.ink3 }}>Mô tả</span>
          <p style={{ fontSize: 13, color: HNH.ink, margin: '4px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {item.description}
          </p>
        </div>

        {/* Receipt */}
        {item.receipt && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: HNH.ink3, display: 'block', marginBottom: 6 }}>Chứng từ</span>
            {item.receipt.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <a href={item.receipt} target="_blank" rel="noreferrer">
                <img src={item.receipt} alt="receipt" style={{
                  width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 12,
                  border: `1px solid ${HNH.line}`,
                }} />
              </a>
            ) : (
              <a href={item.receipt} target="_blank" rel="noreferrer"
                className="flex items-center gap-2"
                style={{
                  padding: '12px 16px', borderRadius: 12, border: `1px solid ${HNH.line}`,
                  textDecoration: 'none', color: HNH.navy, fontWeight: 600, fontSize: 13,
                }}>
                <Icon name="file-text" size={18} color={HNH.navy} />
                Xem chứng từ
              </a>
            )}
          </div>
        )}

        {/* Notes */}
        {item.manager_note && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: HNH.navy50 }}>
            <span style={{ fontSize: 11, color: HNH.navy, fontWeight: 600 }}>Ghi chú quản lý</span>
            <p style={{ fontSize: 13, color: HNH.ink, margin: '4px 0 0' }}>{item.manager_note}</p>
          </div>
        )}
        {item.hc_note && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: HNH.goldSoft }}>
            <span style={{ fontSize: 11, color: '#a87908', fontWeight: 600 }}>Ghi chú Hành chính</span>
            <p style={{ fontSize: 13, color: HNH.ink, margin: '4px 0 0' }}>{item.hc_note}</p>
          </div>
        )}

        {/* Actions for pending */}
        {isPending && (
          <div className="flex gap-2" style={{ marginTop: 16 }}>
            <button
              onClick={() => { onClose(); navigate(`/expenses/submit?edit=${item.id}`) }}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${HNH.navy}`,
                background: HNH.navy50, cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: HNH.navy,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="edit" size={16} color={HNH.navy} />
              Sửa
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${HNH.red}`,
                background: HNH.red50, cursor: cancelling ? 'default' : 'pointer',
                fontSize: 14, fontWeight: 700, color: HNH.red,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="x" size={16} color={HNH.red} />
              {cancelling ? 'Đang hủy...' : 'Hủy yêu cầu'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page ── */
export function ExpenseListPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [statusFilter, setStatusFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [items, setItems] = useState<Expense[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [role, setRole] = useState<{ is_manager: boolean; is_hc: boolean; pending_approvals: number; pending_hc: number } | null>(null)

  useEffect(() => {
    api.get<{ is_manager: boolean; is_hc: boolean; pending_approvals: number; pending_hc: number }>('/api/expenses/my-role/')
      .then(setRole)
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = monthRange(year, month)
    let url = `/api/expenses/requests/my/?date_from=${from}&date_to=${to}`
    if (statusFilter) url += `&status=${statusFilter}`
    if (catFilter) url += `&category=${catFilter}`
    try {
      const data = await api.get<{ results: Expense[]; total_amount: number }>(url)
      setItems(data.results)
      setTotalAmount(data.total_amount)
    } catch { /* ignore */ }
    setLoading(false)
  }, [year, month, statusFilter, catFilter])

  useEffect(() => { load() }, [load])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div style={{ flex: 1 }}>
      <TopBar onBack={() => navigate(-1)} title="Chi phí của tôi" />

      {/* Role navigation cards */}
      {role && (role.is_manager || role.is_hc) && (
        <div className="flex gap-2" style={{ padding: '8px 16px 4px' }}>
          {role.is_manager && (
            <button
              onClick={() => navigate('/expenses/approvals')}
              className="flex items-center gap-2"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 12,
                border: `1px solid ${HNH.gold}`, background: HNH.goldSoft,
                cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#a87908',
              }}
            >
              <Icon name="check" size={16} color="#a87908" />
              Duyệt chi phí
              {role.pending_approvals > 0 && (
                <span style={{
                  marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 10,
                  background: HNH.red, color: '#fff', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                }}>
                  {role.pending_approvals}
                </span>
              )}
            </button>
          )}
          {role.is_hc && (
            <button
              onClick={() => navigate('/expenses/admin')}
              className="flex items-center gap-2"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 12,
                border: `1px solid ${HNH.navy}`, background: HNH.navy50,
                cursor: 'pointer', fontSize: 13, fontWeight: 700, color: HNH.navy,
              }}
            >
              <Icon name="file-text" size={16} color={HNH.navy} />
              Quản lý HC
              {role.pending_hc > 0 && (
                <span style={{
                  marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 10,
                  background: HNH.red, color: '#fff', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                }}>
                  {role.pending_hc}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Month picker + total */}
      <div style={{
        margin: '0 16px 8px', padding: '14px 16px', borderRadius: 14,
        background: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            <Icon name="chevron-left" size={16} color="#fff" />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {MONTH_NAMES[month - 1]} / {year}
          </span>
          <button onClick={nextMonth} disabled={isCurrentMonth}
            style={{
              background: isCurrentMonth ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: 8, padding: '6px 10px', cursor: isCurrentMonth ? 'default' : 'pointer',
            }}>
            <Icon name="chevron-right" size={16} color={isCurrentMonth ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </button>
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Tổng chi phí</span>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '2px 0 0' }}>
              {totalAmount.toLocaleString('vi-VN')} ₫
            </p>
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {items.length} yêu cầu
          </span>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto" style={{ padding: '4px 16px 4px' }}>
        {[
          { key: '', label: 'Tất cả' },
          { key: 'pending', label: 'Chờ duyệt' },
          { key: 'manager_approved', label: 'Đã duyệt' },
          { key: 'hc_approved', label: 'HC xác nhận' },
          { key: 'rejected', label: 'Từ chối' },
          { key: 'cancelled', label: 'Đã hủy' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: statusFilter === f.key ? HNH.navy : HNH.cream2,
              color: statusFilter === f.key ? '#fff' : HNH.ink2,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto" style={{ padding: '2px 16px 8px' }}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCatFilter(c.key)}
            style={{
              padding: '4px 10px', borderRadius: 16, border: `1px solid ${catFilter === c.key ? HNH.gold : HNH.line}`,
              cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              background: catFilter === c.key ? HNH.goldSoft : '#fff',
              color: catFilter === c.key ? '#a87908' : HNH.ink3,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      <PullToRefresh onRefresh={load}>
        <div style={{ padding: '0 16px 100px' }}>
          {loading && items.length === 0 && (
            <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 40 }}>Đang tải...</p>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Icon name="inbox" size={40} color={HNH.ink4} />
              <p style={{ color: HNH.ink3, fontSize: 13, marginTop: 12 }}>
                Chưa có chi phí trong {MONTH_NAMES[month - 1]}
              </p>
            </div>
          )}
          {items.map(item => (
            <ExpenseCard key={item.id} item={item} onClick={() => setSelected(item)} />
          ))}
        </div>
      </PullToRefresh>

      {/* FAB */}
      <button
        onClick={() => navigate('/expenses/submit')}
        style={{
          position: 'fixed', bottom: 90, right: 20,
          width: 52, height: 52, borderRadius: 16,
          background: HNH.red, color: '#fff',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(192,34,43,0.35)',
          zIndex: 20,
        }}
      >
        <Icon name="plus" size={24} color="#fff" />
      </button>

      {/* Detail modal */}
      {selected && (
        <DetailModal item={selected} onClose={() => setSelected(null)} onUpdated={load} />
      )}
    </div>
  )
}
