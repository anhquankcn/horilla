import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
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
  employee: { id: number; name: string; department: string }
  created_at: string
}

export function ExpenseApprovalsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [showNoteFor, setShowNoteFor] = useState<{ id: number; action: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ results: Expense[] }>('/api/expenses/requests/to-approve/')
      setItems(data.results)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAction = async (id: number, action: string) => {
    setActionId(id)
    try {
      await api.patch(`/api/expenses/requests/${id}/approve/`, { action, note })
      toast.toast(action === 'approve' ? 'Đã phê duyệt' : 'Đã từ chối')
      setShowNoteFor(null)
      setNote('')
      load()
    } catch (e: any) {
      try {
        const data = JSON.parse(e.message)
        toast.toast(data.error || 'Có lỗi', 'error')
      } catch { toast.toast('Có lỗi xảy ra', 'error') }
    }
    setActionId(null)
  }

  return (
    <div style={{ flex: 1 }}>
      <TopBar onBack={() => navigate(-1)} title="Duyệt chi phí" />
      <PullToRefresh onRefresh={load}>
        <div style={{ padding: '16px 16px 100px' }}>
          {loading && items.length === 0 && (
            <p style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 40 }}>Đang tải...</p>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Icon name="check-circle" size={40} color={HNH.success} />
              <p style={{ color: HNH.ink3, fontSize: 13, marginTop: 12 }}>Không có yêu cầu chờ duyệt</p>
            </div>
          )}
          {items.map(item => (
            <div
              key={item.id}
              style={{
                background: '#fff', borderRadius: 14, padding: 16,
                marginBottom: 12, border: `1px solid ${HNH.line}`,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{item.employee.name}</span>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>{item.employee.department}</span>
              </div>
              <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>{item.category_display}</span>
                <span style={{ fontSize: 11, color: HNH.ink3 }}>
                  {new Date(item.date_incurred).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <p style={{ fontSize: 13, color: HNH.ink2, margin: '0 0 8px', lineHeight: 1.4 }}>
                {item.description}
              </p>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: HNH.red }}>
                  {item.amount.toLocaleString('vi-VN')} ₫
                </span>
                {item.receipt && (
                  <a href={item.receipt} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: HNH.navy, fontWeight: 600, textDecoration: 'none' }}>
                    Xem chứng từ
                  </a>
                )}
              </div>

              {showNoteFor?.id === item.id ? (
                <div style={{ marginBottom: 8 }}>
                  <textarea
                    rows={2}
                    placeholder="Ghi chú (không bắt buộc)..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: `1px solid ${HNH.line}`, fontSize: 13, resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div className="flex gap-2" style={{ marginTop: 8 }}>
                    <button
                      onClick={() => handleAction(item.id, showNoteFor.action)}
                      disabled={actionId === item.id}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 700, color: '#fff',
                        background: showNoteFor.action === 'approve' ? HNH.success : HNH.red,
                      }}
                    >
                      {showNoteFor.action === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                    </button>
                    <button
                      onClick={() => { setShowNoteFor(null); setNote('') }}
                      style={{
                        padding: '10px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`,
                        background: '#fff', cursor: 'pointer', fontSize: 13, color: HNH.ink2,
                      }}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowNoteFor({ id: item.id, action: 'approve' })}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, color: '#fff', background: HNH.success,
                    }}
                  >
                    Phê duyệt
                  </button>
                  <button
                    onClick={() => setShowNoteFor({ id: item.id, action: 'reject' })}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, color: '#fff', background: HNH.red,
                    }}
                  >
                    Từ chối
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </PullToRefresh>
    </div>
  )
}
