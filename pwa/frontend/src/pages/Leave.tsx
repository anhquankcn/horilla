import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'

interface LeaveTypeInfo {
  id: number
  name: string
  icon: string | null
  total_days: number
}

interface AvailableLeave {
  id: number
  leave_type_id: LeaveTypeInfo
  available_days: number
  carryforward_days: number
  total_leave_days: number
}

interface HNHSummarySlot {
  id: number | null
  leave_type_id: number | null
  name: string
  available_days: number
  total_days: number
  carryforward_days: number
}

interface HNHSummary {
  annual: HNHSummarySlot | null
  compensatory: HNHSummarySlot | null
  sick: HNHSummarySlot | null
  seniority: HNHSummarySlot
  seniority_days: number
}

interface LeaveRequestItem {
  id: number
  leave_type_id: LeaveTypeInfo
  start_date: string
  end_date: string
  requested_days: number
  status: string
}

interface Paginated<T> { count: number; results: T[] }

function fmtDate(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function LeaveTypeCard({ icon, iconColor, iconBg, label, tag, available, total, highlight }: {
  icon: string; iconColor: string; iconBg: string; label: string; tag?: string
  available: number; total: number; highlight?: boolean
}) {
  const avail = available % 1 === 0 ? String(available) : available.toFixed(1)
  const totalStr = total > 0 ? `/ ${total % 1 === 0 ? total : total.toFixed(1)} ngày` : 'ngày'
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '12px 14px',
      border: highlight ? `1.5px solid ${HNH.gold}` : `1px solid ${HNH.line}`,
      boxShadow: highlight ? '0 4px 12px rgba(212,160,23,0.15)' : 'none',
    }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: iconBg }}>
          <Icon name={icon} size={14} color={iconColor} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <span style={{ fontSize: 11.5, color: HNH.ink2, fontWeight: 600, lineHeight: 1.15 }}>{label}</span>
          {tag && <span style={{ fontSize: 10, color: '#a87908', fontWeight: 700, marginLeft: 4, background: '#faf1d6', borderRadius: 4, padding: '1px 5px' }}>{tag}</span>}
        </div>
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5, marginTop: 6 }}>
        {avail}<span style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, marginLeft: 2 }}>{totalStr}</span>
      </div>
    </div>
  )
}

function LeaveRequestRow({ type, dates, days, status, last }: {
  type: string; dates: string; days: string; status: 'approved' | 'pending' | 'rejected'; last?: boolean
}) {
  const statusMap = {
    approved: { label: 'Đã duyệt', tone: 'success' as const },
    pending: { label: 'Chờ duyệt', tone: 'warn' as const },
    rejected: { label: 'Từ chối', tone: 'red' as const },
  }
  const s = statusMap[status]
  return (
    <div className="flex items-center gap-3" style={{ padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${HNH.line}` }}>
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 38, height: 38, borderRadius: 12, background: HNH.cream }}
      >
        <Icon name="cal" size={18} color={HNH.ink2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{type} · {days}</div>
        <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{dates}</div>
      </div>
      <Badge tone={s.tone} size="s">{s.label}</Badge>
    </div>
  )
}

export function LeavePage() {
  const navigate = useNavigate()
  const { data: summary } = useApi<HNHSummary>('/api/leave/hnh-leave-summary/')
  const { data: balResp } = useApi<Paginated<AvailableLeave>>('/api/leave/available-leave/?page_size=20')
  const { data: reqResp } = useApi<Paginated<LeaveRequestItem>>('/api/leave/user-request/')

  const requests = reqResp?.results ?? []
  const balances = balResp?.results ?? []
  const now = new Date()

  const annualFallback = balances.find(b => b.leave_type_id.name.toLowerCase().includes('phép năm'))
  const annualAvail = summary?.annual?.available_days ?? annualFallback?.available_days ?? 0
  const annualTotal = summary?.annual?.total_days ?? annualFallback?.leave_type_id?.total_days ?? 0
  const annualUsed = Math.max(0, annualTotal - annualAvail)
  const annualPending = requests.filter(r =>
    r.status === 'requested' && r.leave_type_id.name.toLowerCase().includes('phép năm')
  ).reduce((sum, r) => sum + (r.requested_days ?? 0), 0)

  const usedPct = annualTotal > 0 ? Math.round((annualUsed / annualTotal) * 100) : 0
  const pendPct = annualTotal > 0 ? Math.round((annualPending / annualTotal) * 100) : 0

  const mapStatus = (s: string): 'approved' | 'pending' | 'rejected' => {
    if (s === 'approved') return 'approved'
    if (s === 'requested') return 'pending'
    return 'rejected'
  }

  type FourTypeCard = { icon: string; iconColor: string; iconBg: string; label: string; tag?: string; available: number; total: number; highlight?: boolean }
  const fourTypes: FourTypeCard[] = []
  if (summary?.compensatory) {
    fourTypes.push({ icon: 'palm', iconColor: '#a87908', iconBg: '#faf1d6', label: summary.compensatory.name, tag: 'Dùng trước', available: summary.compensatory.available_days, total: summary.compensatory.total_days, highlight: true })
  }
  if (summary?.sick) {
    fourTypes.push({ icon: 'shield', iconColor: HNH.navy, iconBg: HNH.navy50, label: summary.sick.name, available: summary.sick.available_days, total: summary.sick.total_days })
  }
  if (summary?.seniority && (summary.seniority.available_days > 0 || summary.seniority_days > 0)) {
    fourTypes.push({ icon: 'star', iconColor: HNH.red, iconBg: HNH.red50, label: summary.seniority.name, available: summary.seniority.available_days, total: summary.seniority.total_days })
  }

  // Fallback to balances if summary not loaded yet
  const otherBalances = summary
    ? []
    : balances.filter(b => !b.leave_type_id.name.toLowerCase().includes('phép năm'))

  return (
    <div style={{ background: HNH.cream, minHeight: '100%', position: 'relative' }}>
      <TopBar
        title="Nghỉ phép"
        sub={`QUYỀN LỢI · ${now.getFullYear()}`}
        trailing={
          <button
            onClick={() => navigate('/leave-management')}
            className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 2px rgba(15,20,40,0.06)' }}
            title="Quản lý phép"
          >
            <Icon name="settings" size={18} color={HNH.ink} />
          </button>
        }
      />

      <div style={{ padding: '0 20px 100px' }}>
        {/* Big annual leave card */}
        {(annualTotal > 0 || annualAvail > 0) && (
          <div style={{
            background: '#fff', borderRadius: 22, padding: 18,
            border: `1px solid ${HNH.line}`,
            boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
          }}>
            <div className="flex justify-between items-start">
              <div>
                <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Phép năm còn lại</div>
                <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
                  <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 44, fontWeight: 800, color: HNH.ink, lineHeight: 1, letterSpacing: -1.5 }}>
                    {annualAvail % 1 === 0 ? annualAvail : annualAvail.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 16, color: HNH.ink3, fontWeight: 600 }}>/ {annualTotal % 1 === 0 ? annualTotal : annualTotal.toFixed(1)} ngày</span>
                </div>
              </div>
              <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: HNH.success50 }}>
                <Icon name="leaf" size={26} color={HNH.success} stroke={1.8} />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="flex overflow-hidden" style={{ width: '100%', height: 10, borderRadius: 999, background: HNH.cream2 }}>
                {usedPct > 0 && <div style={{ width: `${usedPct}%`, background: HNH.red, borderRadius: '999px 0 0 999px' }} />}
                {pendPct > 0 && <div style={{ width: `${pendPct}%`, background: HNH.warn, opacity: 0.7 }} />}
              </div>
              <div className="flex justify-between" style={{ marginTop: 8 }}>
                <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: HNH.ink3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.red }} />
                  Đã dùng <strong style={{ color: HNH.ink, fontWeight: 700 }}>{annualUsed % 1 === 0 ? annualUsed : annualUsed.toFixed(1)}</strong>
                </div>
                <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: HNH.ink3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.warn }} />
                  Chờ duyệt <strong style={{ color: HNH.ink, fontWeight: 700 }}>{annualPending % 1 === 0 ? annualPending : annualPending.toFixed(1)}</strong>
                </div>
                <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: HNH.ink3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.cream2, border: `1px solid ${HNH.line2}` }} />
                  Còn lại <strong style={{ color: HNH.ink, fontWeight: 700 }}>{annualAvail % 1 === 0 ? annualAvail : annualAvail.toFixed(1)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4-type priority cards */}
        {fourTypes.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 4px 8px' }}>QUYỀN LỢI KHÁC</div>
            <div className="grid grid-cols-2 gap-2">
              {fourTypes.map((t, i) => (
                <LeaveTypeCard key={i} {...t} />
              ))}
            </div>
          </>
        )}

        {/* Fallback other balances (when summary API not available) */}
        {fourTypes.length === 0 && otherBalances.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 4px 8px' }}>LOẠI NGHỈ KHÁC</div>
            <div className="grid grid-cols-2 gap-2">
              {otherBalances.map(b => {
                const isBu = b.leave_type_id.name.toLowerCase().includes('bù')
                return (
                  <LeaveTypeCard
                    key={b.id}
                    icon={isBu ? 'palm' : 'cal'}
                    iconColor={isBu ? '#a87908' : HNH.navy}
                    iconBg={isBu ? '#faf1d6' : HNH.navy50}
                    label={b.leave_type_id.name}
                    tag={isBu ? 'Dùng trước' : undefined}
                    available={b.available_days}
                    total={b.leave_type_id.total_days}
                    highlight={isBu}
                  />
                )
              })}
            </div>
          </>
        )}

        {/* Recent requests */}
        <div className="flex items-center justify-between" style={{ padding: '16px 4px 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4 }}>ĐƠN GẦN ĐÂY</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
          {requests.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Chưa có đơn nghỉ phép</div>
          )}
          {requests.slice(0, 8).map((r, i) => {
            const dateStr = r.start_date === r.end_date
              ? fmtDate(r.start_date)
              : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`
            const days = r.requested_days % 1 === 0
              ? `${r.requested_days} ngày`
              : `${r.requested_days.toFixed(1)} ngày`
            return (
              <LeaveRequestRow
                key={r.id}
                type={r.leave_type_id.name}
                dates={dateStr}
                days={days}
                status={mapStatus(r.status)}
                last={i === Math.min(requests.length, 8) - 1}
              />
            )
          })}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/leave/new')}
        className="fixed flex items-center justify-center border-none cursor-pointer z-40"
        style={{
          right: 22, bottom: 92, width: 54, height: 54,
          borderRadius: 18, background: HNH.red, color: '#fff',
          boxShadow: '0 10px 24px rgba(192,34,43,0.35)',
        }}
      >
        <Icon name="plus" size={24} color="#fff" stroke={2.4} />
      </button>
    </div>
  )
}
