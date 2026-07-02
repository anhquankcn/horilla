import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'
import { fmtCong } from '../lib/cong'

/* ── Types ── */
interface PayrollEntry {
  id: number
  year: number
  month: number
  month_label: string
  contract_type: string
  // Stored
  standard_days: number
  actual_days: number
  lcb_bhxh: number
  total_gross: number
  pc_chuc_vu: number
  pc_travel: number
  night_shifts: number
  night_shift_rate: number
  ot_normal: number
  ot_weekend: number
  ot_holiday: number
  kpi_pct: number
  incentive: number
  bonus: number
  other_adjust: number
  npt: number
  tam_ung: number
  notes: string
  // Computed
  J: number; K: number; O: number; S: number
  T: number; V: number; W: number; X: number
  AB: number; AC: number; AD: number; AE: number
  AF: number; AH: number; AI: number; AK: number
}

/* ── Helpers ── */
function fmt(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n))
}

function fmtM(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'tr'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k'
  return String(n)
}

/* ── Section Components ── */
function SectionHeader({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: '14px 0 6px' }}>
      <Icon name={icon} size={14} color={color} stroke={2} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color, letterSpacing: 0.3, textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  )
}

function Row({ label, value, sub, bold, accent, last }: {
  label: string; value: string; sub?: string; bold?: boolean; accent?: string; last?: boolean
}) {
  return (
    <div className="flex items-center justify-between" style={{
      padding: '9px 14px',
      borderBottom: last ? 'none' : `1px solid ${HNH.line}`,
    }}>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 12.5, color: HNH.ink, fontWeight: bold ? 700 : 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: bold ? 14 : 13, fontWeight: bold ? 800 : 600,
        color: accent || HNH.ink,
        whiteSpace: 'nowrap', marginLeft: 12,
      }}>
        {value}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: `1px solid ${HNH.line}`, overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

/* ── Main ── */
export function PayslipPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<PayrollEntry[]>('/api/payroll/my-monthly-payroll/')
      setEntries(data)
    } catch { setEntries([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const entry = entries[selectedIdx] ?? null
  const monthLabel = entry ? `${entry.month_label} ${entry.year}` : '—'

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Phiếu lương"
        sub={monthLabel}
        onBack={() => navigate(-1)}
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Icon name="doc" size={36} color={HNH.ink3} stroke={1.5} />
            <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
              Chưa có phiếu lương
            </div>
            <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
              Phiếu lương sẽ hiển thị khi HR tạo bảng lương
            </div>
          </div>
        )}

        {!loading && entry && (
          <>
            {/* Month selector */}
            <div className="flex gap-2 overflow-x-auto" style={{ padding: '4px 0 14px', scrollbarWidth: 'none' }}>
              {entries.map((e, i) => {
                const active = i === selectedIdx
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedIdx(i)}
                    className="shrink-0 text-center border-none cursor-pointer"
                    style={{
                      padding: '8px 12px', borderRadius: 12, minWidth: 60,
                      background: active ? HNH.ink : '#fff',
                      color: active ? '#fff' : HNH.ink2,
                      border: active ? 'none' : `1px solid ${HNH.line}`,
                      fontSize: 11, fontWeight: 600,
                    }}
                  >
                    <div>T{String(e.month).padStart(2, '0')}/{String(e.year).slice(-2)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmtM(e.AK)}</div>
                  </button>
                )
              })}
            </div>

            {/* Hero — Net Pay */}
            <div
              className="relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${HNH.ink} 0%, #1a1f3a 100%)`,
                borderRadius: 22, padding: '20px', color: '#fff',
              }}
            >
              <div className="absolute" style={{
                right: -30, top: -40, width: 160, height: 160,
                borderRadius: '50%', background: HNH.gold, opacity: 0.2, filter: 'blur(2px)',
              }} />
              <div className="relative">
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>
                  THỰC LĨNH · {entry.month_label.toUpperCase()} {entry.year}
                </div>
                <div style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 36, fontWeight: 800, letterSpacing: -1, marginTop: 4,
                }}>
                  {fmt(entry.AK)} <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>₫</span>
                </div>
                <div className="flex justify-between" style={{
                  marginTop: 14, paddingTop: 10,
                  borderTop: '1px solid rgba(255,255,255,0.12)',
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>GROSS</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmt(entry.AB)}₫</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>BẢO HIỂM</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>-{fmt(entry.AF)}₫</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>THUẾ TNCN</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>-{fmt(entry.AI)}₫</div>
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '2px 8px',
                  }}>
                    {entry.contract_type}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                    {fmtCong(entry.actual_days)}/{entry.standard_days} ngày công
                  </span>
                </div>
              </div>
            </div>

            {/* ── Lương cơ bản ── */}
            <SectionHeader icon="briefcase" label="Lương cơ bản" color={HNH.navy} />
            <Card>
              <Row label="Ngày công chuẩn (E)" value={`${entry.standard_days} ngày`} />
              <Row label="Ngày công thực tế (F)" value={`${fmtCong(entry.actual_days)} ngày`} />
              <Row label="LCB đóng BHXH (G)" value={`${fmt(entry.lcb_bhxh)}₫`} />
              <Row label="Tổng Gross TT (H)" value={`${fmt(entry.total_gross)}₫`} />
              <Row label="LCB thực tế (J)" value={`${fmt(entry.J)}₫`} bold accent={HNH.navy} last />
            </Card>

            {/* ── Phụ cấp ── */}
            <SectionHeader icon="star" label="Phụ cấp" color="#7c3aed" />
            <Card>
              <Row label="PC Chức vụ (I)" value={`${fmt(entry.pc_chuc_vu)}₫`} />
              <Row label="PC Đi lại (L)" value={`${fmt(entry.pc_travel)}₫`} />
              <Row label="LHS Pool (K)" value={`${fmt(entry.K)}₫`} sub="H − G − L + I" last />
            </Card>

            {/* ── OT & Ca đêm ── */}
            {(entry.night_shifts > 0 || entry.ot_normal > 0 || entry.ot_weekend > 0 || entry.ot_holiday > 0) && (
              <>
                <SectionHeader icon="clock" label="OT & Ca đêm" color="#0891b2" />
                <Card>
                  {entry.night_shifts > 0 && (
                    <Row
                      label="Ca đêm (O)"
                      value={`${fmt(entry.O)}₫`}
                      sub={`${entry.night_shifts} ca × ${fmt(entry.night_shift_rate)}₫`}
                    />
                  )}
                  {entry.ot_normal > 0 && (
                    <Row label="OT ngày thường (P)" value={`${entry.ot_normal}h`} sub={`× ${fmt(entry.S)}₫/h × 4`} />
                  )}
                  {entry.ot_weekend > 0 && (
                    <Row label="OT cuối tuần (Q)" value={`${entry.ot_weekend}h`} sub={`× ${fmt(entry.S)}₫/h × 4.5`} />
                  )}
                  {entry.ot_holiday > 0 && (
                    <Row label="OT ngày lễ (R)" value={`${entry.ot_holiday}h`} sub={`× ${fmt(entry.S)}₫/h × 5`} />
                  )}
                  <Row label="Tổng OT (T)" value={`${fmt(entry.T)}₫`} bold accent="#0891b2" last />
                </Card>
              </>
            )}

            {/* ── KPI & Thưởng ── */}
            <SectionHeader icon="star" label="KPI & Thưởng" color={HNH.success} />
            <Card>
              <Row label="% KPI tháng (U)" value={`${entry.kpi_pct}%`} />
              <Row label="KPI thực nhận (V)" value={`${fmt(entry.V)}₫`} bold accent={HNH.success} />
              {entry.incentive > 0 && <Row label="Incentive (Y)" value={`${fmt(entry.incentive)}₫`} />}
              {entry.bonus > 0 && <Row label="Bonus / T13 (Z)" value={`${fmt(entry.bonus)}₫`} />}
              {entry.other_adjust !== 0 && <Row label="Phát sinh khác (AA)" value={`${fmt(entry.other_adjust)}₫`} last />}
              {entry.incentive === 0 && entry.bonus === 0 && entry.other_adjust === 0 && (
                <Row label="Gap KPI (W)" value={`${fmt(entry.W)}₫`} sub="K − V" last />
              )}
            </Card>

            {/* ── Khấu trừ ── */}
            <SectionHeader icon="shield" label="Khấu trừ" color={HNH.red} />
            <Card>
              <Row label="BHXH 8% (AC)" value={`-${fmt(entry.AC)}₫`} accent={HNH.red} />
              <Row label="BHYT 1.5% (AD)" value={`-${fmt(entry.AD)}₫`} accent={HNH.red} />
              <Row label="BHTN 1% (AE)" value={`-${fmt(entry.AE)}₫`} accent={HNH.red} />
              <Row label="Tổng BH (AF)" value={`-${fmt(entry.AF)}₫`} bold accent={HNH.red} />
              <Row label="Thu nhập chịu thuế (AH)" value={`${fmt(entry.AH)}₫`} sub={`NPT: ${entry.npt} người`} />
              <Row label="Thuế TNCN (AI)" value={`-${fmt(entry.AI)}₫`} bold accent={HNH.red} />
              {entry.tam_ung > 0 && (
                <Row label="Tạm ứng (AJ)" value={`-${fmt(entry.tam_ung)}₫`} accent={HNH.red} />
              )}
            </Card>

            {/* ── Tổng kết ── */}
            <div style={{ marginTop: 16 }}>
              <Card>
                <Row label="Gross thực tế (AB)" value={`${fmt(entry.AB)}₫`} bold />
                <div style={{
                  padding: '14px', background: HNH.navy50,
                  borderTop: `1px solid ${HNH.line}`,
                }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 14, fontWeight: 800, color: HNH.navy }}>THỰC LĨNH (AK)</span>
                    <span style={{
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontSize: 18, fontWeight: 800, color: HNH.navy,
                    }}>
                      {fmt(entry.AK)}₫
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Notes */}
            {entry.notes && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: '#fff', borderRadius: 12,
                border: `1px solid ${HNH.line}`,
                fontSize: 12, color: HNH.ink3, fontWeight: 500,
              }}>
                {entry.notes}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
