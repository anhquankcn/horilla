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
  batch_id: number | null
  created_at: string
  employee: { id: number; name: string; department: string; badge_id: string }
  approver: { id: number; name: string } | null
}

interface Batch { id: number; week_start: string; week_end: string; note: string }

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:          { bg: HNH.warn50,    color: HNH.warn },
  manager_approved: { bg: '#e0f0ff',     color: '#1a6cb5' },
  hc_approved:      { bg: HNH.success50, color: HNH.success },
  rejected:         { bg: HNH.red50,     color: HNH.red },
  cancelled:        { bg: '#f0f0f0',     color: HNH.ink3 },
}

/* ── Detail Modal ── */
function AdminDetailModal({ item, batches, onClose, onUpdated }: {
  item: Expense
  batches: Batch[]
  onClose: () => void
  onUpdated: () => void
}) {
  const toast = useToast()
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending
  const [selectedBatch, setSelectedBatch] = useState('')
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    if (!selectedBatch) { toast.toast('Chọn bảng kê trước', 'error'); return }
    setConfirming(true)
    try {
      await api.patch(`/api/expenses/requests/${item.id}/hc-confirm/`, { batch_id: parseInt(selectedBatch) })
      toast.toast('Đã xác nhận HC')
      onClose()
      onUpdated()
    } catch (e: any) {
      try { toast.toast(JSON.parse(e.message).error || 'Lỗi', 'error') } catch { toast.toast('Lỗi', 'error') }
    }
    setConfirming(false)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto',
        padding: '20px 20px 32px',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>Chi tiết yêu cầu</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={20} color={HNH.ink3} />
          </button>
        </div>

        {/* Status */}
        <span style={{
          display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
          background: sc.bg, color: sc.color, marginBottom: 16,
        }}>
          {item.status_display}
        </span>

        {/* Employee info */}
        <div style={{ padding: '12px 14px', borderRadius: 12, background: HNH.cream2, marginBottom: 12 }}>
          <div className="flex items-center justify-between">
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{item.employee.name}</span>
              <p style={{ fontSize: 12, color: HNH.ink3, margin: '2px 0 0' }}>{item.employee.department}</p>
            </div>
            {item.employee.badge_id && (
              <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600 }}>{item.employee.badge_id}</span>
            )}
          </div>
        </div>

        {/* Approver info */}
        <div style={{
          padding: '10px 14px', borderRadius: 12, marginBottom: 16,
          background: item.status === 'pending' ? HNH.warn50 : HNH.navy50,
          border: `1px solid ${item.status === 'pending' ? HNH.warn + '30' : HNH.navy + '20'}`,
        }}>
          <span style={{ fontSize: 11, color: item.status === 'pending' ? HNH.warn : HNH.navy, fontWeight: 600 }}>
            {item.status === 'pending' ? 'Đang chờ phê duyệt bởi' : 'Người phê duyệt'}
          </span>
          <p style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, margin: '4px 0 0' }}>
            {item.approver ? item.approver.name : 'Chưa có quản lý'}
          </p>
          {item.status === 'pending' && item.approver && (
            <p style={{ fontSize: 11, color: HNH.warn, margin: '4px 0 0', fontStyle: 'italic' }}>
              Liên hệ nhắc nhở nếu quá lâu chưa duyệt
            </p>
          )}
        </div>

        {/* Expense details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: HNH.ink3 }}>Danh mục</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, margin: '2px 0 0' }}>{item.category_display}</p>
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

        {/* HC Confirm action */}
        {item.status === 'manager_approved' && (
          <div style={{ marginTop: 16 }}>
            <select
              value={selectedBatch}
              onChange={e => setSelectedBatch(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 8,
                background: '#fff', boxSizing: 'border-box',
              }}
            >
              <option value="">Chọn bảng kê...</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.week_start} → {b.week_end} {b.note && `(${b.note})`}
                </option>
              ))}
            </select>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                cursor: confirming ? 'default' : 'pointer', fontSize: 14, fontWeight: 700,
                color: '#fff', background: confirming ? HNH.ink4 : HNH.navy,
              }}
            >
              {confirming ? 'Đang xác nhận...' : 'Xác nhận HC'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page ── */
export function ExpenseAdminPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Expense[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState<Expense | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter
        ? `/api/expenses/requests/admin/?status=${filter}`
        : '/api/expenses/requests/admin/'
      const [expData, batchData] = await Promise.all([
        api.get<{ results: Expense[] }>(url),
        api.get<{ results: Batch[] }>('/api/expenses/batches/'),
      ])
      setItems(expData.results)
      setBatches(batchData.results)
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const filters = [
    { key: 'pending', label: 'Chờ QL duyệt' },
    { key: 'manager_approved', label: 'Chờ HC' },
    { key: 'hc_approved', label: 'Đã xác nhận' },
    { key: 'rejected', label: 'Từ chối' },
    { key: '', label: 'Tất cả' },
  ]

  return (
    <div style={{ flex: 1 }}>
      <TopBar onBack={() => navigate(-1)} title="Quản lý chi phí (HC)" />
      <div style={{ padding: '0 16px' }}>
        <div className="flex gap-2 overflow-x-auto" style={{ padding: '12px 0' }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                background: filter === f.key ? HNH.navy : HNH.cream2,
                color: filter === f.key ? '#fff' : HNH.ink2,
              }}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => navigate('/expenses/batches')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: `1px solid ${HNH.gold}`,
              cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: HNH.goldSoft, color: '#a87908',
            }}
          >
            Bảng kê
          </button>
        </div>
      </div>

      <PullToRefresh onRefresh={load}>
        <div style={{ padding: '0 16px 100px' }}>
          {loading && items.length === 0 && (
            <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 40 }}>Đang tải...</p>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Icon name="inbox" size={40} color={HNH.ink4} />
              <p style={{ color: HNH.ink3, fontSize: 13, marginTop: 12 }}>Không có yêu cầu</p>
            </div>
          )}
          {items.map(item => {
            const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending
            return (
              <div
                key={item.id}
                onClick={() => setSelected(item)}
                style={{
                  background: '#fff', borderRadius: 14, padding: 16,
                  marginBottom: 12, border: `1px solid ${HNH.line}`, cursor: 'pointer',
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{item.employee.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    background: sc.bg, color: sc.color,
                  }}>
                    {item.status_display}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>{item.employee.department}</span>

                {/* Approver line for pending */}
                {item.status === 'pending' && item.approver && (
                  <div className="flex items-center gap-1" style={{ margin: '6px 0 2px' }}>
                    <Icon name="user" size={11} color={HNH.warn} />
                    <span style={{ fontSize: 11, color: HNH.warn, fontWeight: 600 }}>
                      Chờ duyệt: {item.approver.name}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2" style={{ margin: '4px 0' }}>
                  <span style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>{item.category_display}</span>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>
                    {new Date(item.date_incurred).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: HNH.ink2, margin: '0 0 6px', lineHeight: 1.4 }}>
                  {item.description.length > 80 ? item.description.slice(0, 80) + '...' : item.description}
                </p>
                <span style={{ fontSize: 16, fontWeight: 700, color: HNH.red }}>
                  {item.amount.toLocaleString('vi-VN')} ₫
                </span>
              </div>
            )
          })}
        </div>
      </PullToRefresh>

      {/* Detail modal */}
      {selected && (
        <AdminDetailModal
          item={selected}
          batches={batches}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}
