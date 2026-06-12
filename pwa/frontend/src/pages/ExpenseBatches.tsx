import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

interface BatchItem {
  id: number
  date_incurred: string
  category_display: string
  description: string
  amount: number
  employee: { name: string; department: string }
}

interface Batch {
  id: number
  week_start: string
  week_end: string
  note: string
  item_count: number
  total_amount: number
  created_at: string
  items?: BatchItem[]
}

export function ExpenseBatchesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [weekStart, setWeekStart] = useState('')
  const [weekEnd, setWeekEnd] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedItems, setExpandedItems] = useState<BatchItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ results: Batch[] }>('/api/expenses/batches/')
      setBatches(data.results)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!weekStart || !weekEnd) { toast.toast('Chọn ngày bắt đầu và kết thúc', 'error'); return }
    setCreating(true)
    try {
      await api.post('/api/expenses/batches/', { week_start: weekStart, week_end: weekEnd, note })
      toast.toast('Đã tạo bảng kê')
      setShowCreate(false)
      setWeekStart(''); setWeekEnd(''); setNote('')
      load()
    } catch { toast.toast('Lỗi tạo bảng kê', 'error') }
    setCreating(false)
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    try {
      const data = await api.get<Batch & { items: BatchItem[] }>(`/api/expenses/batches/${id}/`)
      setExpandedItems(data.items || [])
      setExpandedId(id)
    } catch { toast.toast('Lỗi tải chi tiết', 'error') }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${HNH.line}`, fontSize: 13, background: '#fff',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ flex: 1 }}>
      <TopBar onBack={() => navigate(-1)} title="Bảng kê chi phí" />
      <PullToRefresh onRefresh={load}>
        <div style={{ padding: '16px 16px 100px' }}>
          {/* Create batch form */}
          {showCreate ? (
            <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, border: `1px solid ${HNH.line}` }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 12 }}>Tạo bảng kê mới</p>
              <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 4, display: 'block' }}>Từ ngày</label>
              <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 4, display: 'block' }}>Đến ngày</label>
              <input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 4, display: 'block' }}>Ghi chú</label>
              <input type="text" placeholder="Tuần 1 tháng 6..." value={note} onChange={e => setNote(e.target.value)}
                style={{ ...inputStyle, marginBottom: 12 }} />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={creating}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', background: HNH.navy }}>
                  {creating ? 'Đang tạo...' : 'Tạo'}
                </button>
                <button onClick={() => setShowCreate(false)}
                  style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2 }}>
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCreate(true)}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, marginBottom: 16,
                border: `1px dashed ${HNH.navy}`, background: HNH.navy50,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: HNH.navy,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <Icon name="plus" size={16} color={HNH.navy} />
              Tạo bảng kê mới
            </button>
          )}

          {loading && batches.length === 0 && (
            <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 40 }}>Đang tải...</p>
          )}

          {batches.map(b => (
            <div key={b.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 12, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
              <div
                onClick={() => toggleExpand(b.id)}
                style={{ padding: 16, cursor: 'pointer' }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>
                    {new Date(b.week_start).toLocaleDateString('vi-VN')} → {new Date(b.week_end).toLocaleDateString('vi-VN')}
                  </span>
                  <Icon name={expandedId === b.id ? 'chevron-up' : 'chevron-down'} size={16} color={HNH.ink3} />
                </div>
                {b.note && <p style={{ fontSize: 12, color: HNH.ink3, margin: '0 0 6px' }}>{b.note}</p>}
                <div className="flex items-center gap-4">
                  <span style={{ fontSize: 12, color: HNH.ink2 }}>{b.item_count} yêu cầu</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: HNH.red }}>
                    {b.total_amount.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
              </div>

              {expandedId === b.id && (
                <div style={{ borderTop: `1px solid ${HNH.line}`, padding: '12px 16px' }}>
                  {expandedItems.length === 0 && (
                    <p style={{ fontSize: 12, color: HNH.ink3, textAlign: 'center' }}>Chưa có yêu cầu trong bảng kê</p>
                  )}
                  {expandedItems.map(item => (
                    <div key={item.id} style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{item.employee.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: HNH.red }}>
                          {item.amount.toLocaleString('vi-VN')} ₫
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: HNH.ink3 }}>
                        {item.category_display} · {new Date(item.date_incurred).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </PullToRefresh>
    </div>
  )
}
