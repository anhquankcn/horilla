import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

interface LeaveRow {
  id: number; employee_name: string; badge_id: string; department: string | null; is_self: boolean
  leave_type: string; start_date: string; end_date: string; requested_days: number; status: string; description: string
}
interface AttRow {
  employee_id: number; employee_name: string; badge_id: string; department: string | null; is_self: boolean
  clock_in: string | null; clock_out: string | null; worked_hour: string | null; validated: boolean | null; status: string
}

const STATUS_VI: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: 'Chờ duyệt', color: HNH.warn, bg: HNH.warn50 },
  approved: { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50 },
  cancelled: { label: 'Đã xóa', color: HNH.ink3, bg: HNH.cream },
  rejected: { label: 'Từ chối', color: HNH.red, bg: HNH.red50 },
}
function fmtDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function TeamMonitorPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'leave' | 'attendance'>('leave')
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [day, setDay] = useState(ymd(now))
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [atts, setAtts] = useState<AttRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadLeave = useCallback(async () => {
    setLoading(true)
    try { setLeaves((await api.get<{ results: LeaveRow[] }>(`/api/leave/team-leaves/?month=${month}`)).results) }
    catch { setLeaves([]) } finally { setLoading(false) }
  }, [month])
  const loadAtt = useCallback(async () => {
    setLoading(true)
    try { setAtts((await api.get<{ results: AttRow[] }>(`/api/attendance/team-attendance/?date=${day}`)).results) }
    catch { setAtts([]) } finally { setLoading(false) }
  }, [day])
  useEffect(() => { if (tab === 'leave') loadLeave(); else loadAtt() }, [tab, loadLeave, loadAtt])

  const selStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, background: '#fff', color: HNH.ink }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: HNH.cream }}>
      <TopBar title="Theo dõi Team" sub="Cấp dưới trực tiếp + bạn" onBack={() => navigate(-1)} />

      {/* Tabs */}
      <div className="flex" style={{ background: '#fff', borderBottom: `1px solid ${HNH.line}`, flexShrink: 0 }}>
        {([['leave', 'Nghỉ phép', 'leaf'], ['attendance', 'Chấm công', 'clock']] as const).map(([k, lbl, ic]) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
            style={{ padding: '12px 0', background: 'transparent', color: tab === k ? HNH.red : HNH.ink3, fontWeight: 700, fontSize: 13.5, borderBottom: `2px solid ${tab === k ? HNH.red : 'transparent'}` }}>
            <Icon name={ic} size={15} color={tab === k ? HNH.red : HNH.ink3} stroke={2} />{lbl}
          </button>
        ))}
      </div>

      {/* Filter */}
      <div style={{ padding: '8px 12px', background: '#fff', borderBottom: `1px solid ${HNH.line}`, flexShrink: 0 }}>
        {tab === 'leave'
          ? <div className="flex items-center gap-2"><span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 600 }}>Tháng:</span><input type="month" value={month} onChange={e => setMonth(e.target.value)} style={selStyle} /></div>
          : <div className="flex items-center gap-2"><span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 600 }}>Ngày:</span><input type="date" value={day} onChange={e => setDay(e.target.value)} style={selStyle} /></div>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 32px', minHeight: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải…</div>
        ) : tab === 'leave' ? (
          leaves.length === 0
            ? <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Không có đơn nghỉ trong tháng</div>
            : leaves.map(l => {
              const st = STATUS_VI[l.status] ?? { label: l.status, color: HNH.ink3, bg: HNH.cream }
              return (
                <div key={l.id} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}`, padding: 12, marginBottom: 8 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{l.employee_name}</span>
                    {l.is_self && <span style={{ fontSize: 9, fontWeight: 700, color: HNH.navy, background: HNH.navy50, borderRadius: 5, padding: '1px 5px' }}>Bạn</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 7, padding: '2px 8px' }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: HNH.ink2 }}>{l.leave_type} · {fmtDate(l.start_date)}{l.end_date !== l.start_date ? ` → ${fmtDate(l.end_date)}` : ''} · <strong>{l.requested_days} ngày</strong></div>
                  <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{l.badge_id}{l.department ? ` · ${l.department}` : ''}</div>
                  {l.description && <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 4, fontStyle: 'italic' }}>{l.description}</div>}
                </div>
              )
            })
        ) : (
          atts.length === 0
            ? <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Team trống</div>
            : atts.map(a => (
              <div key={a.employee_id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${HNH.line}`, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{a.employee_name}</span>
                    {a.is_self && <span style={{ fontSize: 9, fontWeight: 700, color: HNH.navy, background: HNH.navy50, borderRadius: 5, padding: '1px 5px' }}>Bạn</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 1 }}>{a.badge_id}{a.department ? ` · ${a.department}` : ''}</div>
                </div>
                {a.status === 'absent' ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink4 }}>Chưa chấm</span>
                ) : (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: HNH.success }}>{a.clock_in ?? '--:--'}</span>
                      <span style={{ color: HNH.ink4 }}> → </span>
                      <span style={{ color: a.clock_out ? HNH.red : HNH.ink4 }}>{a.clock_out ?? '--:--'}</span>
                    </div>
                    {a.worked_hour && <div style={{ fontSize: 10.5, color: HNH.ink3 }}>{a.worked_hour} giờ{a.validated === false ? ' · chờ duyệt' : ''}</div>}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  )
}
