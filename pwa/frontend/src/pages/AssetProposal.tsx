import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

/* ── Types ── */
interface AssetCategory {
  id: number
  asset_category_name: string
}

interface MyAssetRequest {
  id: number
  category_name: string | null
  category_id: number | null
  description: string
  status: string
  request_date: string | null
}

interface PaginatedResponse<T> { count: number; results: T[] }

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  Requested: { label: 'Chờ duyệt', color: HNH.warn, bg: HNH.warn50 },
  Approved: { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50 },
  Rejected: { label: 'Từ chối', color: HNH.red, bg: HNH.red50 },
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'Requested', label: 'Chờ duyệt' },
  { value: 'Approved', label: 'Đã duyệt' },
  { value: 'Rejected', label: 'Từ chối' },
]

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

/* ── Request Card ── */
function RequestCard({ r }: { r: MyAssetRequest }) {
  const st = STATUS_DISPLAY[r.status] || STATUS_DISPLAY.Requested
  return (
    <div
      style={{
        background: '#fff', borderRadius: 14, padding: '12px 14px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 38, height: 38, borderRadius: 11, background: HNH.red50 }}
        >
          <Icon name="monitor" size={18} color={HNH.red} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
              {r.category_name || 'Tài sản'}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {formatDate(r.request_date)}
          </div>
          {r.description && (
            <div style={{
              fontSize: 11, color: HNH.ink3, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.description}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color: st.color,
          background: st.bg, borderRadius: 6, padding: '2px 7px', flexShrink: 0,
        }}>
          {st.label}
        </span>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function AssetProposalPage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const [mode, setMode] = useState<'form' | 'list'>('form')

  // Form state
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // List state
  const [myRequests, setMyRequests] = useState<MyAssetRequest[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    api.get<AssetCategory[] | PaginatedResponse<AssetCategory>>('/api/asset/asset-categories/?page_size=100')
      .then(d => setCategories(Array.isArray(d) ? d : d.results))
      .catch(() => {})
      .finally(() => setCatLoading(false))
  }, [])

  const fetchRequests = useCallback(async () => {
    setListLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const url = `/api/asset/my-asset-requests/${params.toString() ? '?' + params : ''}`
      const data = await api.get<MyAssetRequest[]>(url)
      setMyRequests(data)
    } catch { setMyRequests([]) } finally { setListLoading(false) }
  }, [statusFilter])

  useEffect(() => {
    if (mode === 'list') fetchRequests()
  }, [mode, fetchRequests])

  const handleSubmit = async () => {
    if (!categoryId) {
      setError('Vui lòng chọn loại tài sản')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await api.post('/api/asset/asset-requests/', {
        requested_employee_id: employee?.id,
        asset_category_id: Number(categoryId),
        description,
      })
      setSuccess(true)
      setTimeout(() => navigate('/proposals'), 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi yêu cầu'
      try {
        const parsed = JSON.parse(msg)
        const firstErr = Object.values(parsed).flat()[0]
        setError(String(firstErr))
      } catch {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Yêu cầu tài sản" onBack={() => navigate('/proposals')} />

      <div style={{ padding: '0 16px 32px', maxWidth: 500, margin: '0 auto' }}>
        {/* Mode toggle */}
        <div className="flex gap-2" style={{ marginBottom: 16 }}>
          {([
            { id: 'form' as const, label: 'Tạo yêu cầu', icon: 'plus' },
            { id: 'list' as const, label: 'Lịch sử', icon: 'doc' },
          ]).map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
              style={{
                padding: '10px', borderRadius: 12,
                background: mode === m.id ? HNH.navy : '#fff',
                color: mode === m.id ? '#fff' : HNH.ink2,
                fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${mode === m.id ? HNH.navy : HNH.line}`,
              }}
            >
              <Icon name={m.icon} size={14} color={mode === m.id ? '#fff' : HNH.ink3} stroke={2} />
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'form' ? (
          success ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: HNH.success50,
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              }}>
                <Icon name="check" size={28} color={HNH.success} stroke={2.5} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>Đã gửi yêu cầu!</div>
              <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 4 }}>Đang chuyển về trang đề xuất...</div>
            </div>
          ) : (
            <>
              {/* Category selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                  Loại tài sản / công cụ *
                </label>
                {catLoading ? (
                  <div style={{ padding: 12, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
                ) : (
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 14,
                      border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                      color: categoryId ? HNH.ink : HNH.ink3, background: '#fff',
                      appearance: 'none', boxSizing: 'border-box',
                    }}
                  >
                    <option value="">— Chọn loại tài sản —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.asset_category_name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                  Mô tả yêu cầu
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="VD: Cần laptop để làm việc, yêu cầu cấp điện thoại công vụ..."
                  rows={4}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                    color: HNH.ink, background: '#fff', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: HNH.red50, borderRadius: 12, padding: '10px 14px',
                  fontSize: 12.5, fontWeight: 600, color: HNH.red, marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
                style={{
                  padding: 14, borderRadius: 14,
                  background: HNH.navy, color: '#fff',
                  fontSize: 14, fontWeight: 700,
                  opacity: submitting ? 0.6 : 1,
                  boxShadow: '0 4px 14px rgba(20,43,111,0.2)',
                }}
              >
                <Icon name="send" size={16} color="#fff" stroke={2} />
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </>
          )
        ) : (
          /* List mode */
          <>
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

            {listLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
                Đang tải...
              </div>
            ) : myRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Icon name="monitor" size={32} color={HNH.ink3} stroke={1.5} />
                <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink3, marginTop: 8 }}>
                  Chưa có yêu cầu nào
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myRequests.map(r => <RequestCard key={r.id} r={r} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
