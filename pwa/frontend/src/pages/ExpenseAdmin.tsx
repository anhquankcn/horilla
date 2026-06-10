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
  category_display: string
  description: string
  amount: number
  receipt: string | null
  status: string
  status_display: string
  batch_id: number | null
  employee: { id: number; name: string; department: string }
}

interface Batch { id: number; week_start: string; week_end: string; note: string }

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:          { bg: HNH.warn50,    color: HNH.warn },
  manager_approved: { bg: '#e0f0ff',     color: '#1a6cb5' },
  hc_approved:      { bg: HNH.success50, color: HNH.success },
  rejected:         { bg: HNH.red50,     color: HNH.red },
  cancelled:        { bg: '#f0f0f0',     color: HNH.ink3 },
}

export function ExpenseAdminPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<Expense[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('manager_approved')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [selectedBatch, setSelectedBatch] = useState('')

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

  const handleConfirm = async (id: number) => {
    if (!selectedBatch) { toast.error('Chọn bảng kê trước'); return }
    try {
      await api.patch(`/api/expenses/requests/${id}/hc-confirm/`, { batch_id: parseInt(selectedBatch) })
      toast.success('Đã xác nhận')
      setConfirmId(null)
      setSelectedBatch('')
      load()
    } catch (e: any) {
      try { toast.error(JSON.parse(e.message).error || 'Lỗi') } catch { toast.error('Lỗi') }
    }
  }

  const filters = [
    { key: 'manager_approved', label: 'Chờ HC' },
    { key: 'hc_approved', label: 'Đã xác nhận' },
    { key: 'pending', label: 'Chờ QL' },
    { key: '', label: 'Tất cả' },
  ]

  return (
    <div style={{ flex: 1 }}>
      <TopBar title="Quản lý chi phí (HC)" />
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
                style={{
                  background: '#fff', borderRadius: 14, padding: 16,
                  marginBottom: 12, border: `1px solid ${HNH.line}`,
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{item.employee.name}</span>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: sc.bg, color: sc.color,
                    }}
                  >
                    {item.status_display}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>{item.employee.department}</span>
                <div className="flex items-center gap-2" style={{ margin: '6px 0' }}>
                  <span style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>{item.category_display}</span>
                  <span style={{ fontSize: 11, color: HNH.ink3 }}>
                    {new Date(item.date_incurred).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: HNH.ink2, margin: '0 0 6px', lineHeight: 1.4 }}>
                  {item.description.length > 100 ? item.description.slice(0, 100) + '...' : item.description}
                </p>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: HNH.red }}>
                    {item.amount.toLocaleString('vi-VN')} ₫
                  </span>
                  {item.receipt && (
                    <a href={item.receipt} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, textDecoration: 'none' }}>
                      Chứng từ
                    </a>
                  )}
                </div>

                {item.status === 'manager_approved' && confirmId !== item.id && (
                  <button
                    onClick={() => setConfirmId(item.id)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                      cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      color: '#fff', background: HNH.navy,
                    }}
                  >
                    Xác nhận HC
                  </button>
                )}

                {confirmId === item.id && (
                  <div>
                    <select
                      value={selectedBatch}
                      onChange={e => setSelectedBatch(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 8,
                        background: '#fff',
                      }}
                    >
                      <option value="">Chọn bảng kê...</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.week_start} → {b.week_end} {b.note && `(${b.note})`}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm(item.id)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                          cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          color: '#fff', background: HNH.success,
                        }}
                      >
                        Xác nhận
                      </button>
                      <button
                        onClick={() => { setConfirmId(null); setSelectedBatch('') }}
                        style={{
                          padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`,
                          background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2,
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </PullToRefresh>
    </div>
  )
}
