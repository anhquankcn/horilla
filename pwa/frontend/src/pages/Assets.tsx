import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
interface Summary {
  total: number
  in_use: number
  available: number
  not_available: number
  pending_requests: number
}

interface Category { id: number; name: string; count: number }

interface AssetItem {
  id: number
  name: string
  tracking_id: string
  status: string
  category: string | null
  category_id: number | null
  owner_name: string | null
  owner_id: number | null
  purchase_date: string | null
  cost: string | null
  description: string
  lot: string | null
  expiry_date: string | null
}

interface Assignment {
  id: number
  asset_name: string
  asset_tracking_id: string
  category: string
  employee_name: string
  employee_id: number | null
  department: string
  assigned_date: string | null
  return_request: boolean
}

interface AssetRequest {
  id: number
  employee_name: string
  employee_id: number | null
  category_name: string
  description: string
  status: string
  request_date: string | null
}

interface DashData {
  summary: Summary
  categories: Category[]
  assets?: AssetItem[]
  assignments?: Assignment[]
  requests?: AssetRequest[]
}

type Tab = 'assets' | 'assignments' | 'requests'

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  'In use':        { color: HNH.warn,    bg: HNH.warn50,    label: 'Đang dùng' },
  'Available':     { color: HNH.success, bg: HNH.success50, label: 'Khả dụng' },
  'Not-Available': { color: HNH.red,     bg: HNH.red50,     label: 'Không KD' },
}

const REQ_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  'Requested': { color: HNH.navy,    bg: HNH.navy50,    label: 'Đang chờ' },
  'Approved':  { color: HNH.success, bg: HNH.success50, label: 'Đã duyệt' },
  'Rejected':  { color: HNH.red,     bg: HNH.red50,     label: 'Từ chối' },
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function fmtCost(val: string | null) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return n.toLocaleString('vi-VN') + ' đ'
}

/* ── Summary cards ── */
function SummaryCards({ s }: { s: Summary }) {
  const items = [
    { label: 'Tổng', val: s.total, color: HNH.navy, bg: HNH.navy50 },
    { label: 'Đang dùng', val: s.in_use, color: HNH.warn, bg: HNH.warn50 },
    { label: 'Khả dụng', val: s.available, color: HNH.success, bg: HNH.success50 },
    { label: 'Yêu cầu', val: s.pending_requests, color: HNH.red, bg: HNH.red50 },
  ]
  return (
    <div className="grid grid-cols-4 gap-2" style={{ marginBottom: 14 }}>
      {items.map(it => (
        <div key={it.label} style={{
          background: it.bg, borderRadius: 12, padding: '8px 6px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: it.color }}>{it.val}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: it.color, opacity: 0.8 }}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ── Status badge ── */
function StatusBadge({ status, map }: { status: string; map: Record<string, { color: string; bg: string; label: string }> }) {
  const s = map[status] || { color: HNH.ink3, bg: HNH.cream2, label: status }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: s.color,
      background: s.bg, borderRadius: 6, padding: '2px 8px',
    }}>
      {s.label}
    </span>
  )
}

/* ── Tab bar ── */
function TabBar({ active, onChange, pendingCount }: {
  active: Tab; onChange: (t: Tab) => void; pendingCount: number
}) {
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'assets', label: 'Tài sản', icon: 'doc' },
    { key: 'assignments', label: 'Cấp phát', icon: 'users' },
    { key: 'requests', label: 'Yêu cầu', icon: 'send' },
  ]
  return (
    <div className="flex" style={{
      background: '#fff', borderRadius: 14, padding: 3,
      border: `1px solid ${HNH.line}`, marginBottom: 12,
    }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer relative"
          style={{
            padding: '8px 4px', borderRadius: 11,
            background: active === t.key ? HNH.navy : 'transparent',
            color: active === t.key ? '#fff' : HNH.ink3,
            fontSize: 12, fontWeight: 700,
          }}
        >
          <Icon name={t.icon} size={14} color={active === t.key ? '#fff' : HNH.ink3} stroke={2} />
          {t.label}
          {t.key === 'requests' && pendingCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 8,
              width: 16, height: 16, borderRadius: '50%',
              background: HNH.red, color: '#fff',
              fontSize: 9, fontWeight: 800, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ── Search bar ── */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2" style={{
      background: '#fff', borderRadius: 12, padding: '7px 12px',
      border: `1px solid ${HNH.line}`, marginBottom: 10,
    }}>
      <Icon name="search" size={16} color={HNH.ink3} stroke={1.8} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Tìm tài sản, nhân viên..."
        className="flex-1 border-none outline-none bg-transparent"
        style={{ fontSize: 13, fontWeight: 500, color: HNH.ink }}
      />
      {value && (
        <button onClick={() => onChange('')} className="border-none cursor-pointer bg-transparent p-0">
          <Icon name="x" size={14} color={HNH.ink3} stroke={2} />
        </button>
      )}
    </div>
  )
}

/* ── Category filter chips ── */
function CategoryChips({ categories, active, onChange }: {
  categories: Category[]; active: number | null; onChange: (id: number | null) => void
}) {
  if (categories.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 10px', scrollbarWidth: 'none' }}>
      <button
        onClick={() => onChange(null)}
        className="shrink-0 border-none cursor-pointer whitespace-nowrap"
        style={{
          padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
          background: active === null ? HNH.navy : '#fff',
          color: active === null ? '#fff' : HNH.ink2,
          border: `1px solid ${active === null ? HNH.navy : HNH.line}`,
        }}
      >
        Tất cả
      </button>
      {categories.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.id === active ? null : c.id)}
          className="shrink-0 border-none cursor-pointer whitespace-nowrap"
          style={{
            padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: active === c.id ? HNH.navy : '#fff',
            color: active === c.id ? '#fff' : HNH.ink2,
            border: `1px solid ${active === c.id ? HNH.navy : HNH.line}`,
          }}
        >
          {c.name} ({c.count})
        </button>
      ))}
    </div>
  )
}

/* ── Status filter chips ── */
function StatusChips({ active, onChange }: { active: string; onChange: (s: string) => void }) {
  const options = [
    { key: '', label: 'Tất cả' },
    { key: 'In use', label: 'Đang dùng' },
    { key: 'Available', label: 'Khả dụng' },
    { key: 'Not-Available', label: 'Không KD' },
  ]
  return (
    <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 10px', scrollbarWidth: 'none' }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className="shrink-0 border-none cursor-pointer whitespace-nowrap"
          style={{
            padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: active === o.key ? HNH.navy : '#fff',
            color: active === o.key ? '#fff' : HNH.ink2,
            border: `1px solid ${active === o.key ? HNH.navy : HNH.line}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Asset Card ── */
function AssetCard({ asset, onTap }: { asset: AssetItem; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '12px 14px',
        border: `1px solid ${HNH.line}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{asset.name}</span>
            <StatusBadge status={asset.status} map={STATUS_STYLE} />
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {asset.tracking_id}{asset.category ? ` · ${asset.category}` : ''}
          </div>
        </div>
        <Icon name="chev-r" size={14} color={HNH.ink4} stroke={1.8} />
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
        {asset.owner_name && (
          <div className="flex items-center gap-1">
            <Icon name="user" size={11} color={HNH.ink3} stroke={2} />
            <span style={{ fontSize: 11, color: HNH.ink2, fontWeight: 600 }}>{asset.owner_name}</span>
          </div>
        )}
        {asset.cost && (
          <div style={{ fontSize: 11, color: HNH.navy, fontWeight: 700 }}>{fmtCost(asset.cost)}</div>
        )}
      </div>
    </button>
  )
}

/* ── Assignment Card ── */
function AssignmentCard({ a }: { a: Assignment }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '12px 14px',
      border: `1px solid ${HNH.line}`,
    }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{a.asset_name}</div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
            {a.asset_tracking_id}{a.category ? ` · ${a.category}` : ''}
          </div>
        </div>
        {a.return_request && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: HNH.warn,
            background: HNH.warn50, borderRadius: 6, padding: '2px 8px',
          }}>
            Yêu cầu trả
          </span>
        )}
      </div>
      <div className="flex items-center gap-3" style={{
        marginTop: 8, paddingTop: 8, borderTop: `1px solid ${HNH.line}`,
      }}>
        <div className="flex items-center gap-1.5">
          <Icon name="user" size={12} color={HNH.navy} stroke={2} />
          <span style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>{a.employee_name}</span>
        </div>
        {a.department && (
          <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{a.department}</span>
        )}
        <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginLeft: 'auto' }}>
          {fmtDate(a.assigned_date)}
        </span>
      </div>
    </div>
  )
}

/* ── Request Card ── */
function RequestCard({ r, onApprove, onReject, acting }: {
  r: AssetRequest; onApprove: () => void; onReject: () => void; acting: boolean
}) {
  const isPending = r.status === 'Requested'
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '12px 14px',
      border: `1px solid ${HNH.line}`,
    }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{r.employee_name}</span>
            <StatusBadge status={r.status} map={REQ_STATUS_STYLE} />
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {r.category_name} · {fmtDate(r.request_date)}
          </div>
          {r.description && (
            <div style={{ fontSize: 12, color: HNH.ink2, fontWeight: 500, marginTop: 4 }}>
              {r.description}
            </div>
          )}
        </div>
      </div>
      {isPending && (
        <div className="flex gap-2" style={{ marginTop: 10 }}>
          <button
            onClick={onReject}
            disabled={acting}
            className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
            style={{
              padding: '8px', borderRadius: 10,
              background: HNH.red50, color: HNH.red, fontSize: 12, fontWeight: 700,
              opacity: acting ? 0.5 : 1,
            }}
          >
            <Icon name="x" size={13} color={HNH.red} stroke={2.5} />
            Từ chối
          </button>
          <button
            onClick={onApprove}
            disabled={acting}
            className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
            style={{
              padding: '8px', borderRadius: 10,
              background: HNH.success, color: '#fff', fontSize: 12, fontWeight: 700,
              opacity: acting ? 0.5 : 1,
            }}
          >
            <Icon name="check" size={13} color="#fff" stroke={2.5} />
            Duyệt
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Asset Detail Modal ── */
function AssetDetailModal({ asset, onClose }: { asset: AssetItem; onClose: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Mã theo dõi', value: asset.tracking_id },
    { label: 'Danh mục', value: asset.category || '—' },
    { label: 'Trạng thái', value: STATUS_STYLE[asset.status]?.label || asset.status },
    { label: 'Người dùng', value: asset.owner_name || 'Chưa cấp phát' },
    { label: 'Ngày mua', value: fmtDate(asset.purchase_date) },
    { label: 'Chi phí', value: fmtCost(asset.cost) },
    { label: 'Lô hàng', value: asset.lot || '—' },
    { label: 'Hết hạn', value: asset.expiry_date ? fmtDate(asset.expiry_date) : '—' },
  ]
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
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
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Chi tiết tài sản</div>
          <div style={{ width: 34 }} />
        </div>

        <div style={{ padding: '16px' }}>
          {/* Name + status */}
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 44, height: 44, borderRadius: 13, background: HNH.navy50 }}
            >
              <Icon name="doc" size={22} color={HNH.navy} stroke={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>{asset.name}</div>
              <StatusBadge status={asset.status} map={STATUS_STYLE} />
            </div>
          </div>

          {/* Description */}
          {asset.description && (
            <div style={{
              background: '#fff', borderRadius: 14, padding: '10px 14px',
              border: `1px solid ${HNH.line}`, marginBottom: 12,
              fontSize: 13, color: HNH.ink2, fontWeight: 500, lineHeight: 1.5,
            }}>
              {asset.description}
            </div>
          )}

          {/* Detail rows */}
          <div style={{
            background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}`,
            overflow: 'hidden',
          }}>
            {rows.map((r, i) => (
              <div key={r.label} className="flex items-center justify-between" style={{
                padding: '10px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${HNH.line}` : 'none',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Approve Modal (select asset to assign) ── */
function ApproveModal({ req, onClose, onDone }: {
  req: AssetRequest; onClose: () => void; onDone: () => void
}) {
  const [availableAssets, setAvailableAssets] = useState<{ id: number; name: string; tracking_id: string }[]>([])
  const [selectedAsset, setSelectedAsset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<DashData>(`/api/asset/pwa-dashboard/?tab=assets&status=Available`)
      .then(d => {
        setAvailableAssets((d.assets || []).map(a => ({ id: a.id, name: a.name, tracking_id: a.tracking_id })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleApprove = async () => {
    if (!selectedAsset) return
    setSaving(true)
    try {
      await api.put(`/api/asset/asset-approve/${req.id}`, { asset_id: selectedAsset })
      onDone()
      onClose()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10001, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 420, maxHeight: '80vh', overflow: 'hidden',
        borderRadius: 24, background: HNH.cream,
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="flex items-center justify-between shrink-0" style={{
          padding: '14px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        }}>
          <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}>
            <Icon name="x" size={17} color={HNH.ink} stroke={2} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Duyệt & cấp tài sản</div>
          <div style={{ width: 34 }} />
        </div>

        <div style={{ padding: '12px 16px 4px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3 }}>
            Chọn tài sản khả dụng để cấp cho <strong style={{ color: HNH.ink }}>{req.employee_name}</strong>
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink3, marginTop: 2 }}>
            Danh mục: {req.category_name}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
          ) : availableAssets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>
              Không có tài sản khả dụng
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {availableAssets.map(a => {
                const checked = selectedAsset === a.id
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAsset(a.id)}
                    className="w-full flex items-center gap-3 border-none cursor-pointer text-left"
                    style={{
                      background: checked ? HNH.navy50 : '#fff',
                      borderRadius: 14, padding: '10px 14px',
                      border: `1.5px solid ${checked ? HNH.navy : HNH.line}`,
                    }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: checked ? HNH.navy : '#fff',
                        border: checked ? 'none' : `2px solid ${HNH.line}`,
                      }}
                    >
                      {checked && <Icon name="check" size={13} color="#fff" stroke={2.5} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{a.tracking_id}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0" style={{ padding: '12px 16px', borderTop: `1px solid ${HNH.line}`, background: '#fff' }}>
          <button
            onClick={handleApprove}
            disabled={!selectedAsset || saving}
            className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
            style={{
              padding: '12px', borderRadius: 12,
              background: selectedAsset ? HNH.success : HNH.cream2,
              color: selectedAsset ? '#fff' : HNH.ink3,
              fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Đang xử lý...' : 'Duyệt & cấp phát'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function AssetsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('assets')
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [reqStatusFilter, setReqStatusFilter] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null)
  const [approving, setApproving] = useState<AssetRequest | null>(null)
  const [actingId, setActingId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab })
      if (search) params.set('search', search)
      if (tab === 'assets') {
        if (statusFilter) params.set('status', statusFilter)
        if (categoryFilter) params.set('category', String(categoryFilter))
      }
      if (tab === 'requests' && reqStatusFilter) {
        params.set('req_status', reqStatusFilter)
      }
      const d = await api.get<DashData>(`/api/asset/pwa-dashboard/?${params}`)
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tab, search, statusFilter, categoryFilter, reqStatusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleReject = async (id: number) => {
    setActingId(id)
    try {
      await api.put(`/api/asset/asset-reject/${id}`, {})
      fetchData()
    } catch { /* ignore */ } finally { setActingId(null) }
  }

  const summary = data?.summary || { total: 0, in_use: 0, available: 0, not_available: 0, pending_requests: 0 }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar onBack={() => navigate(-1)} title="Quản lý Tài sản" />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: '0 16px 32px', maxWidth: 720, margin: '0 auto' }}>

          <SummaryCards s={summary} />

          <TabBar active={tab} onChange={t => { setTab(t); setSearch('') }} pendingCount={summary.pending_requests} />

          <SearchBar value={search} onChange={setSearch} />

          {/* Filters for assets tab */}
          {tab === 'assets' && data && (
            <>
              <StatusChips active={statusFilter} onChange={setStatusFilter} />
              <CategoryChips
                categories={data.categories}
                active={categoryFilter}
                onChange={setCategoryFilter}
              />
            </>
          )}

          {/* Filter for requests tab */}
          {tab === 'requests' && (
            <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 10px', scrollbarWidth: 'none' }}>
              {[
                { key: '', label: 'Tất cả' },
                { key: 'Requested', label: 'Đang chờ' },
                { key: 'Approved', label: 'Đã duyệt' },
                { key: 'Rejected', label: 'Từ chối' },
              ].map(o => (
                <button
                  key={o.key}
                  onClick={() => setReqStatusFilter(o.key)}
                  className="shrink-0 border-none cursor-pointer whitespace-nowrap"
                  style={{
                    padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: reqStatusFilter === o.key ? HNH.navy : '#fff',
                    color: reqStatusFilter === o.key ? '#fff' : HNH.ink2,
                    border: `1px solid ${reqStatusFilter === o.key ? HNH.navy : HNH.line}`,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 50, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Đang tải...
            </div>
          ) : (
            <>
              {/* Assets list */}
              {tab === 'assets' && (
                <div className="flex flex-col gap-2">
                  {(data?.assets || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
                      Không có tài sản
                    </div>
                  ) : (
                    (data?.assets || []).map(a => (
                      <AssetCard key={a.id} asset={a} onTap={() => setSelectedAsset(a)} />
                    ))
                  )}
                </div>
              )}

              {/* Assignments list */}
              {tab === 'assignments' && (
                <div className="flex flex-col gap-2">
                  {(data?.assignments || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
                      Không có cấp phát nào
                    </div>
                  ) : (
                    (data?.assignments || []).map(a => (
                      <AssignmentCard key={a.id} a={a} />
                    ))
                  )}
                </div>
              )}

              {/* Requests list */}
              {tab === 'requests' && (
                <div className="flex flex-col gap-2">
                  {(data?.requests || []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
                      Không có yêu cầu nào
                    </div>
                  ) : (
                    (data?.requests || []).map(r => (
                      <RequestCard
                        key={r.id}
                        r={r}
                        acting={actingId === r.id}
                        onApprove={() => setApproving(r)}
                        onReject={() => handleReject(r.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      {selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}

      {approving && (
        <ApproveModal
          req={approving}
          onClose={() => setApproving(null)}
          onDone={fetchData}
        />
      )}
    </div>
  )
}
