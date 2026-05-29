import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { useApi } from '../lib/useApi'

interface TourInfo {
  id: number
  name: string
  code: string
  tour_type: string
  destination: string
  departure: string
  duration_display: string
  status: string
}

interface TourScheduleItem {
  id: number
  schedule_code: string
  tour: TourInfo
  start_date: string
  end_date: string
  pax: number
  lead_guide: { id: number; full_name: string } | null
  status: string
  duration_display: string
}

interface Paginated<T> { count: number; results: T[] }

interface BizModule {
  id: string; emoji: string; label: string; desc: string
  tone: { c: string; bg: string }; count?: string; highlight?: boolean
}

const modules: BizModule[] = [
  { id: 'air', emoji: '✈', label: 'Vé máy bay', desc: 'API booking · PNR · hạn giữ chỗ', tone: { c: HNH.navy, bg: HNH.navy50 } },
  { id: 'visa', emoji: '🛂', label: 'Visa', desc: 'Tư vấn · nộp hồ sơ · xử lý rejected', tone: { c: '#a87908', bg: '#faf1d6' } },
  { id: 'ots', emoji: '🎯', label: 'OTS', desc: 'e-SIM · Xe thuê · Fast Track · Tàu · Bus · Golf', tone: { c: '#5b21b6', bg: '#ede9fe' } },
  { id: 'sales', emoji: '💼', label: 'Kinh doanh', desc: 'CRM · pipeline · báo giá · chuyển đổi', tone: { c: HNH.success, bg: HNH.success50 } },
  { id: 'acc', emoji: '📊', label: 'Kế toán', desc: 'Thanh toán · hóa đơn · công nợ · báo cáo', tone: { c: HNH.ink, bg: HNH.cream2 } },
  { id: 'hr', emoji: '👥', label: 'HC-NS', desc: 'Nghỉ phép · chấm công · đào tạo · đánh giá', tone: { c: HNH.red, bg: HNH.red50 } },
  { id: 'it', emoji: '🛠️', label: 'IT Helpdesk', desc: 'Báo hỏng · tài khoản · phần mềm · thiết bị', tone: { c: '#0e7490', bg: '#cffafe' } },
]

const statusMap: Record<string, { label: string; tone: 'success' | 'warn' | 'navy' | 'ink' | 'red' }> = {
  scheduled: { label: 'Đã lên lịch', tone: 'navy' },
  confirmed: { label: 'Xác nhận', tone: 'success' },
  ongoing: { label: 'Đang thực hiện', tone: 'warn' },
  completed: { label: 'Hoàn thành', tone: 'ink' },
  cancelled: { label: 'Đã hủy', tone: 'red' },
}

const typeLabel: Record<string, string> = {
  domestic: 'Trong nước',
  international: 'Quốc tế',
  incentive: 'Incentive',
  mice: 'MICE',
}

function fmtDate(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function BizTile({ emoji, label, desc, tone, count, highlight }: BizModule) {
  return (
    <div
      className="relative flex flex-col gap-1"
      style={{
        background: highlight ? tone.bg : '#fff',
        border: highlight ? `1.5px solid ${tone.c}` : `1px solid ${HNH.line}`,
        borderRadius: 16, padding: '14px 12px',
        boxShadow: highlight ? `0 4px 12px ${tone.c}22` : '0 1px 2px rgba(15,20,40,0.03)',
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex items-center justify-center"
          style={{ width: 38, height: 38, borderRadius: 11, background: tone.bg, fontSize: 22 }}
        >{emoji}</div>
        {count && (
          <span style={{
            padding: '2px 7px', borderRadius: 999,
            background: highlight ? tone.c : HNH.cream2,
            color: highlight ? '#fff' : HNH.ink3,
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2,
          }}>{count}</span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, letterSpacing: -0.1, marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: HNH.ink3, lineHeight: 1.3, minHeight: 28 }}>{desc}</div>
    </div>
  )
}

export function BusinessPage() {
  const { data: schedResp } = useApi<Paginated<TourScheduleItem>>('/api/tourism/schedules/?page_size=10')
  const schedules = schedResp?.results ?? []
  const upcomingCount = schedules.filter(s => s.status === 'scheduled' || s.status === 'confirmed').length

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <div style={{ padding: '12px 18px 100px' }}>
        {/* Title */}
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Chọn nghiệp vụ</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: HNH.ink, letterSpacing: -0.5, marginTop: 2 }}>
              Bạn cần làm gì?
            </div>
          </div>
        </div>

        {/* Tour section */}
        <div style={{ marginTop: 14 }}>
          <div className="flex items-center justify-between" style={{ padding: '0 2px 8px' }}>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, background: HNH.red50, fontSize: 16 }}>
                🗺
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Tour</span>
              {upcomingCount > 0 && <Badge tone="red" size="s">{upcomingCount} sắp tới</Badge>}
            </div>
          </div>

          {schedules.length === 0 && (
            <div style={{
              background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
              padding: 20, textAlign: 'center', color: HNH.ink3, fontSize: 13,
            }}>
              Chưa có lịch tour
            </div>
          )}

          {schedules.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
              {schedules.slice(0, 5).map((s, i) => {
                const st = statusMap[s.status] ?? statusMap.scheduled
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3"
                    style={{
                      padding: '12px 14px',
                      borderBottom: i === Math.min(schedules.length, 5) - 1 ? 'none' : `1px solid ${HNH.line}`,
                    }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 42, height: 42, borderRadius: 12, background: HNH.red50 }}
                    >
                      <Icon name="globe" size={20} color={HNH.red} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5" style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>
                        <span className="truncate">{s.tour.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2 }}>
                        <span>{s.tour.destination}</span>
                        <span>·</span>
                        <span>{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</span>
                        <span>·</span>
                        <span>{s.tour.duration_display}</span>
                        {s.pax > 0 && <><span>·</span><span>{s.pax} khách</span></>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 4 }}>
                        <Badge tone={st.tone} size="s">{st.label}</Badge>
                        <Badge tone="ink" size="s">{typeLabel[s.tour.tour_type] ?? s.tour.tour_type}</Badge>
                        {s.lead_guide && <Badge tone="navy" size="s">HDV: {s.lead_guide.full_name}</Badge>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Other modules grid */}
        <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '16px 2px 8px' }}>NGHIỆP VỤ KHÁC</div>
        <div className="grid grid-cols-2 gap-2.5">
          {modules.map(m => (
            <BizTile key={m.id} {...m} />
          ))}
        </div>

        {/* BI Reports — featured row */}
        <div
          className="relative overflow-hidden flex items-center gap-3.5"
          style={{
            marginTop: 12, borderRadius: 18, padding: '14px 16px',
            background: `linear-gradient(135deg, ${HNH.navy} 0%, #0d1f4f 65%, ${HNH.red} 165%)`,
            color: '#fff',
          }}
        >
          <div className="absolute" style={{ right: -30, top: -30, width: 120, height: 120, borderRadius: '50%', background: HNH.red, opacity: 0.22 }} />
          <div
            className="relative flex items-end justify-center gap-0.5 shrink-0"
            style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'rgba(255,255,255,0.14)', padding: 8,
            }}
          >
            <div style={{ width: 6, height: 14, borderRadius: 2, background: HNH.gold }} />
            <div style={{ width: 6, height: 22, borderRadius: 2, background: '#fff' }} />
            <div style={{ width: 6, height: 18, borderRadius: 2, background: '#fff', opacity: 0.7 }} />
            <div style={{ width: 6, height: 28, borderRadius: 2, background: HNH.red }} />
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, background: HNH.gold, color: '#3a2a04' }}>BoD · TP</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600, letterSpacing: 0.3 }}>D-1 · W · M · Q · Y</span>
            </div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.3, marginTop: 4, lineHeight: 1.1 }}>BI Reports</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2, lineHeight: 1.35 }}>KPI · OKRs · KQ Kinh doanh · Vận hành · Tài chính</div>
          </div>
          <Icon name="chev-r" size={18} color="#fff" stroke={2.2} />
        </div>
      </div>
    </div>
  )
}
