import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
type ProposalKind = 'shift' | 'worktype' | 'attendance' | 'asset'

interface UnifiedItem {
  id: number
  kind: ProposalKind
  title: string
  subtitle: string
  description: string
  status: string
  date: string | null
  raw: unknown
}

interface ShiftProposal {
  id: number
  shift_name: string | null
  previous_shift_name: string | null
  requested_date: string | null
  requested_till: string | null
  is_permanent_shift: boolean
  description: string
  status: string
}

interface WorkTypeProposal {
  id: number
  work_type_name: string | null
  previous_work_type_name: string | null
  requested_date: string | null
  requested_till: string | null
  is_permanent_work_type: boolean
  description: string
  status: string
}

interface AttendanceProposal {
  id: number
  attendance_date: string | null
  clock_in: string | null
  clock_out: string | null
  description: string
  request_type: string
  status: string
}

interface AssetProposal {
  id: number
  category_name: string | null
  description: string
  status: string
  request_date: string | null
}

const PROPOSAL_TYPES = [
  { id: 'shift' as const, icon: 'clock', label: 'Đổi Ca', desc: 'Đề xuất đổi ca làm việc', path: '/proposals/shift', tone: 'gold' },
  { id: 'attendance' as const, icon: 'cal', label: 'Ngày Công', desc: 'Điều chỉnh ngày công', path: '/proposals/attendance', tone: 'success' },
  { id: 'worktype' as const, icon: 'briefcase', label: 'Loại Hình LV', desc: 'Thay đổi loại hình làm việc', path: '/proposals/worktype', tone: 'navy' },
  { id: 'asset' as const, icon: 'monitor', label: 'Tài sản Công cụ', desc: 'Yêu cầu cấp tài sản, công cụ', path: '/proposals/asset', tone: 'red' },
]

const toneBg: Record<string, string> = { navy: HNH.navy50, gold: '#faf1d6', success: HNH.success50, red: HNH.red50 }
const toneColor: Record<string, string> = { navy: HNH.navy, gold: '#a87908', success: HNH.success, red: HNH.red }

const KIND_META: Record<ProposalKind, { icon: string; bg: string; color: string; label: string }> = {
  shift: { icon: 'clock', bg: '#faf1d6', color: '#a87908', label: 'Đổi Ca' },
  worktype: { icon: 'briefcase', bg: HNH.navy50, color: HNH.navy, label: 'Loại CV' },
  attendance: { icon: 'cal', bg: HNH.success50, color: HNH.success, label: 'Ngày Công' },
  asset: { icon: 'monitor', bg: HNH.red50, color: HNH.red, label: 'Tài sản' },
}

const STATUS_NORMALIZE: Record<string, string> = {
  requested: 'requested', Requested: 'requested', pending: 'requested',
  approved: 'approved', Approved: 'approved',
  rejected: 'rejected', Rejected: 'rejected',
  cancelled: 'cancelled', canceled: 'cancelled',
}

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: 'Chờ duyệt', color: HNH.warn, bg: HNH.warn50 },
  approved: { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50 },
  rejected: { label: 'Từ chối', color: HNH.red, bg: HNH.red50 },
  cancelled: { label: 'Đã hủy', color: HNH.ink3, bg: HNH.cream2 },
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'requested', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const TYPE_OPTIONS: { value: ProposalKind | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'shift', label: 'Đổi Ca' },
  { value: 'attendance', label: 'Ngày Công' },
  { value: 'worktype', label: 'Loại CV' },
  { value: 'asset', label: 'Tài sản' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function normalizeShift(items: ShiftProposal[]): UnifiedItem[] {
  return items.map(r => ({
    id: r.id,
    kind: 'shift' as const,
    title: `${r.previous_shift_name || '—'} → ${r.shift_name || '—'}`,
    subtitle: `${fmtDate(r.requested_date)}${r.requested_till ? ` → ${fmtDate(r.requested_till)}` : ''} · ${r.is_permanent_shift ? 'Vĩnh viễn' : 'Tạm thời'}`,
    description: r.description || '',
    status: STATUS_NORMALIZE[r.status] || 'requested',
    date: r.requested_date,
    raw: r,
  }))
}

function normalizeWorkType(items: WorkTypeProposal[]): UnifiedItem[] {
  return items.map(r => ({
    id: r.id,
    kind: 'worktype' as const,
    title: `${r.previous_work_type_name || '—'} → ${r.work_type_name || '—'}`,
    subtitle: `${fmtDate(r.requested_date)}${r.requested_till ? ` → ${fmtDate(r.requested_till)}` : ''} · ${r.is_permanent_work_type ? 'Vĩnh viễn' : 'Tạm thời'}`,
    description: r.description || '',
    status: STATUS_NORMALIZE[r.status] || 'requested',
    date: r.requested_date,
    raw: r,
  }))
}

function normalizeAttendance(items: AttendanceProposal[]): UnifiedItem[] {
  return items.map(r => ({
    id: r.id,
    kind: 'attendance' as const,
    title: `Ngày công ${fmtDate(r.attendance_date)}`,
    subtitle: `${r.clock_in || '—'} → ${r.clock_out || '—'}`,
    description: r.description || '',
    status: STATUS_NORMALIZE[r.status] || 'requested',
    date: r.attendance_date,
    raw: r,
  }))
}

function normalizeAsset(items: AssetProposal[]): UnifiedItem[] {
  return items.map(r => ({
    id: r.id,
    kind: 'asset' as const,
    title: r.category_name || 'Tài sản',
    subtitle: fmtDate(r.request_date),
    description: r.description || '',
    status: STATUS_NORMALIZE[r.status] || 'requested',
    date: r.request_date,
    raw: r,
  }))
}

/* ── Unified Card ── */
function UnifiedCard({ item }: { item: UnifiedItem }) {
  const meta = KIND_META[item.kind]
  const st = STATUS_DISPLAY[item.status] || STATUS_DISPLAY.requested
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
          style={{ width: 38, height: 38, borderRadius: 11, background: meta.bg }}
        >
          <Icon name={meta.icon} size={18} color={meta.color} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
              {item.title}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            {item.subtitle}
          </div>
          {item.description && (
            <div style={{
              fontSize: 11, color: HNH.ink3, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.description}
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
          <span style={{
            fontSize: 9, fontWeight: 700, color: meta.color,
            background: meta.bg, borderRadius: 5, padding: '1.5px 6px',
          }}>
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function ProposalsPage() {
  const navigate = useNavigate()
  const [allItems, setAllItems] = useState<UnifiedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProposalKind | ''>('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [shift, wt, att, asset] = await Promise.all([
        api.get<ShiftProposal[]>('/api/base/my-shift-requests/').catch(() => [] as ShiftProposal[]),
        api.get<WorkTypeProposal[]>('/api/base/my-worktype-requests/').catch(() => [] as WorkTypeProposal[]),
        api.get<AttendanceProposal[]>('/api/attendance/my-attendance-requests/').catch(() => [] as AttendanceProposal[]),
        api.get<AssetProposal[]>('/api/asset/my-asset-requests/').catch(() => [] as AssetProposal[]),
      ])
      const merged = [
        ...normalizeShift(shift),
        ...normalizeWorkType(wt),
        ...normalizeAttendance(att),
        ...normalizeAsset(asset),
      ]
      merged.sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return b.date.localeCompare(a.date)
      })
      setAllItems(merged)
    } catch {
      setAllItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = allItems.filter(item => {
    if (statusFilter && item.status !== statusFilter) return false
    if (typeFilter && item.kind !== typeFilter) return false
    return true
  })

  const statusCounts = allItems.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar onBack={() => navigate(-1)} title="Đề xuất" />

      <PullToRefresh onRefresh={fetchAll}>
      <div style={{ padding: '8px 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {/* Proposal types */}
        <div style={{ fontSize: 12.5, fontWeight: 600, color: HNH.ink3, marginBottom: 10 }}>
          Tạo đề xuất mới
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {PROPOSAL_TYPES.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(p.path)}
              className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
              style={{
                background: '#fff', borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${HNH.line}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: 40, height: 40, borderRadius: 12, background: toneBg[p.tone] }}
              >
                <Icon name={p.icon} size={20} color={toneColor[p.tone]} stroke={2} />
              </div>
              <div className="flex-1 min-w-0">
                <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{p.label}</span>
                <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
                  {p.desc}
                </div>
              </div>
              <Icon name="chev-r" size={15} color={HNH.ink3} stroke={1.8} />
            </button>
          ))}
        </div>

        {/* My proposals — unified history */}
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink2 }}>
            Lịch sử đề xuất
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3 }}>
            {filtered.length} / {allItems.length} đề xuất
          </div>
        </div>

        {/* Status summary */}
        {!loading && allItems.length > 0 && (
          <div className="flex gap-2" style={{ marginBottom: 12 }}>
            {Object.entries(STATUS_DISPLAY).map(([key, st]) => {
              const cnt = statusCounts[key] || 0
              if (!cnt) return null
              return (
                <div key={key} className="flex items-center gap-1" style={{
                  background: st.bg, borderRadius: 8, padding: '4px 8px',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: st.color }}>{cnt}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: st.color }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 8 }}>
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value as ProposalKind | '')}
              className="border-none cursor-pointer"
              style={{
                padding: '4px 9px', borderRadius: 7,
                background: typeFilter === opt.value ? HNH.navy : '#fff',
                color: typeFilter === opt.value ? '#fff' : HNH.ink2,
                fontSize: 10.5, fontWeight: 700,
                border: `1.5px solid ${typeFilter === opt.value ? HNH.navy : HNH.line}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 12 }}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className="border-none cursor-pointer"
              style={{
                padding: '4px 9px', borderRadius: 7,
                background: statusFilter === opt.value ? HNH.ink : '#fff',
                color: statusFilter === opt.value ? '#fff' : HNH.ink2,
                fontSize: 10.5, fontWeight: 700,
                border: `1.5px solid ${statusFilter === opt.value ? HNH.ink : HNH.line}`,
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
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Icon name="doc" size={32} color={HNH.ink3} stroke={1.5} />
            <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink3, marginTop: 8 }}>
              {allItems.length === 0 ? 'Chưa có đề xuất nào' : 'Không có đề xuất khớp bộ lọc'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(item => (
              <div key={`${item.kind}-${item.id}`}>
                <UnifiedCard item={item} />
              </div>
            ))}
          </div>
        )}
      </div>
      </PullToRefresh>
    </div>
  )
}
