import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

interface Expense {
  id: number
  date_incurred: string
  category: string
  category_display: string
  description: string
  amount: number
  status: string
  status_display: string
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
  tool: 'wrench',
  transport: 'car',
  license: 'file-text',
  other: 'package',
}

function ExpenseCard({ item, onClick }: { item: Expense; onClick: () => void }) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 10,
        border: `1px solid ${HNH.line}`,
        cursor: 'pointer',
      }}
    >
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
        <div className="flex items-center gap-2">
          <Icon name={CATEGORY_ICONS[item.category] || 'package'} size={16} color={HNH.ink2} />
          <span style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{item.category_display}</span>
        </div>
        <span
          style={{
            fontSize: 11, fontWeight: 600,
            padding: '2px 8px', borderRadius: 6,
            background: sc.bg, color: sc.color,
          }}
        >
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

export function ExpenseListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter
        ? `/api/expenses/requests/my/?status=${filter}`
        : '/api/expenses/requests/my/'
      const data = await api.get<{ results: Expense[] }>(url)
      setItems(data.results)
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const filters = [
    { key: '', label: 'Tất cả' },
    { key: 'pending', label: 'Chờ duyệt' },
    { key: 'manager_approved', label: 'Đã duyệt' },
    { key: 'hc_approved', label: 'HC xác nhận' },
    { key: 'rejected', label: 'Từ chối' },
  ]

  return (
    <div style={{ flex: 1 }}>
      <TopBar title="Chi phí của tôi" />
      <div style={{ padding: '0 16px' }}>
        <div className="flex gap-2 overflow-x-auto" style={{ padding: '12px 0', marginBottom: 4 }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                background: filter === f.key ? HNH.red : HNH.cream2,
                color: filter === f.key ? '#fff' : HNH.ink2,
              }}
            >
              {f.label}
            </button>
          ))}
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
              <p style={{ color: HNH.ink3, fontSize: 13, marginTop: 12 }}>Chưa có yêu cầu chi phí nào</p>
            </div>
          )}
          {items.map(item => (
            <ExpenseCard key={item.id} item={item} onClick={() => {}} />
          ))}
        </div>
      </PullToRefresh>

      {/* FAB — Submit mới */}
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
    </div>
  )
}
