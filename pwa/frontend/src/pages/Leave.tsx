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

interface LeaveRequestItem {
  id: number
  leave_type_id: LeaveTypeInfo
  start_date: string
  end_date: string
  requested_days: number
  status: string
}

interface Paginated<T> { count: number; results: T[] }

function leaveTypeMeta(name: string): { icon: string; tone: string } {
  const n = name.toLowerCase()
  if (n.includes('phép năm')) return { icon: 'leaf', tone: 'navy' }
  if (n.includes('bù')) return { icon: 'palm', tone: 'gold' }
  if (n.includes('ốm')) return { icon: 'shield', tone: 'navy' }
  if (n.includes('thai sản')) return { icon: 'sparkle', tone: 'red' }
  if (n.includes('kết hôn')) return { icon: 'star', tone: 'gold' }
  if (n.includes('tang')) return { icon: 'flag', tone: 'ink' }
  if (n.includes('không lương')) return { icon: 'money', tone: 'ink' }
  if (n.includes('chăm sóc')) return { icon: 'star', tone: 'red' }
  return { icon: 'cal', tone: 'navy' }
}

function fmtDate(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function LeavePill({ icon, label, remain, total, tone, highlight }: {
  icon: string; label: string; remain: string; total: string; tone: string; highlight?: boolean
}) {
  const tones: Record<string, { c: string; bg: string }> = {
    navy: { c: HNH.navy, bg: HNH.navy50 },
    red: { c: HNH.red, bg: HNH.red50 },
    gold: { c: '#a87908', bg: '#faf1d6' },
    ink: { c: HNH.ink2, bg: HNH.cream2 },
  }
  const t = tones[tone] ?? tones.navy
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '12px 14px',
      border: highlight ? `1.5px solid ${HNH.gold}` : `1px solid ${HNH.line}`,
      boxShadow: highlight ? '0 4px 12px rgba(212,160,23,0.15)' : 'none',
    }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: t.bg }}>
          <Icon name={icon} size={14} color={t.c} stroke={2} />
        </div>
        <span className="flex-1 min-w-0" style={{ fontSize: 11.5, color: HNH.ink2, fontWeight: 600, lineHeight: 1.15 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5, marginTop: 6 }}>
        {remain}<span style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, marginLeft: 2 }}>{total}</span>
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
  const { data: balResp } = useApi<Paginated<AvailableLeave>>('/api/leave/available-leave/?page_size=20')
  const { data: reqResp } = useApi<Paginated<LeaveRequestItem>>('/api/leave/user-request/')

  const balances = balResp?.results ?? []
  const requests = reqResp?.results ?? []
  const now = new Date()

  const annual = balances.find(b => b.leave_type_id.name.toLowerCase().includes('phép năm')) ?? balances[0]
  const others = balances.filter(b => b !== annual)

  const annualAvail = annual?.available_days ?? 0
  const annualTotal = annual?.leave_type_id.total_days ?? 0
  const annualUsed = Math.max(0, annualTotal - annualAvail - (annual?.carryforward_days ?? 0))
  const annualPending = requests.filter(r =>
    r.status === 'requested' && annual && r.leave_type_id.id === annual.leave_type_id.id
  ).reduce((sum, r) => sum + (r.requested_days ?? 0), 0)

  const usedPct = annualTotal > 0 ? Math.round((annualUsed / annualTotal) * 100) : 0
  const pendPct = annualTotal > 0 ? Math.round((annualPending / annualTotal) * 100) : 0

  const mapStatus = (s: string): 'approved' | 'pending' | 'rejected' => {
    if (s === 'approved') return 'approved'
    if (s === 'requested') return 'pending'
    return 'rejected'
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%', position: 'relative' }}>
      <TopBar
        title="Nghỉ phép"
        sub={`QUYỀN LỢI · ${now.getFullYear()}`}
        trailing={
          <button
            className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 2px rgba(15,20,40,0.06)' }}
          >
            <Icon name="cal" size={18} color={HNH.ink} />
          </button>
        }
      />

      <div style={{ padding: '0 20px 100px' }}>
        {/* Big balance card */}
        {annual && (
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
                  {annualTotal > 0 && (
                    <span style={{ fontSize: 16, color: HNH.ink3, fontWeight: 600 }}>/ {annualTotal % 1 === 0 ? annualTotal : annualTotal.toFixed(1)} ngày</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: HNH.success50 }}>
                <Icon name="leaf" size={26} color={HNH.success} stroke={1.8} />
              </div>
            </div>

            {annualTotal > 0 && (
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
            )}
          </div>
        )}

        {/* Other leave types */}
        {others.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 4px 8px' }}>LOẠI NGHỈ KHÁC</div>
            <div className="grid grid-cols-2 gap-2">
              {others.map(b => {
                const meta = leaveTypeMeta(b.leave_type_id.name)
                const avail = b.available_days % 1 === 0 ? String(b.available_days) : b.available_days.toFixed(1)
                const total = b.leave_type_id.total_days
                const totalStr = total > 1 ? `/ ${total % 1 === 0 ? total : total.toFixed(1)}` : 'ngày'
                return (
                  <LeavePill
                    key={b.id}
                    icon={meta.icon}
                    label={b.leave_type_id.name}
                    remain={avail}
                    total={totalStr}
                    tone={meta.tone}
                    highlight={b.leave_type_id.name.toLowerCase().includes('bù')}
                  />
                )
              })}
            </div>
          </>
        )}

        {balances.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 22, padding: 20, border: `1px solid ${HNH.line}`, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
            Chưa có dữ liệu nghỉ phép
          </div>
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
