import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'

interface PayslipData {
  id: number
  start_date: string
  end_date: string
  basic_pay: number
  gross_pay: number
  deduction: number
  net_pay: number
  status: string
  pay_head_data: Record<string, unknown>
  contract_wage: number
}

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function fmtVND(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n))
}

function PayRow({ label, sub, amount, tone, last }: {
  label: string; sub?: string; amount: string; tone?: 'gold' | 'muted'; last?: boolean
}) {
  const positive = !amount.startsWith('-')
  const amtColor = tone === 'gold' ? '#a87908' : tone === 'muted' ? HNH.ink3 : HNH.ink
  return (
    <div className="flex items-center justify-between" style={{ padding: '11px 14px', borderBottom: last ? 'none' : `1px solid ${HNH.line}` }}>
      <div>
        <div style={{ fontSize: 13.5, color: HNH.ink, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14.5, fontWeight: 700, color: amtColor }}>
        {positive ? '+' : ''}{amount} <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600 }}>₫</span>
      </div>
    </div>
  )
}

export function PayslipPage() {
  const navigate = useNavigate()
  const { data: payslipResp, loading } = useApi<PaginatedResponse<PayslipData>>('/api/payroll/my-payslip/')

  const payslips = payslipResp?.results ?? []
  const latest = payslips[0] ?? null

  const monthLabel = latest
    ? `THÁNG ${new Date(latest.start_date).getMonth() + 1} · ${new Date(latest.start_date).getFullYear()}`
    : '—'

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Phiếu lương"
        sub={monthLabel}
        onBack={() => navigate(-1)}
        trailing={
          <button
            className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 2px rgba(15,20,40,0.06)' }}
          >
            <Icon name="doc" size={18} color={HNH.ink} />
          </button>
        }
      />

      <div style={{ padding: '0 20px 20px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Đang tải...</div>}

        {!loading && !latest && (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Chưa có phiếu lương nào.</div>
        )}

        {!loading && payslips.length > 0 && (
          <>
            {/* Month switcher */}
            <div className="flex gap-1.5 overflow-auto" style={{ padding: '0 0 12px' }}>
              {payslips.slice(0, 6).reverse().map((p) => {
                const d = new Date(p.start_date)
                const m = `T${String(d.getMonth() + 1).padStart(2, '0')}`
                const y = String(d.getFullYear()).slice(-2)
                const active = p.id === latest!.id
                return (
                  <div
                    key={p.id}
                    className="shrink-0 text-center"
                    style={{
                      padding: '8px 12px', borderRadius: 12, minWidth: 56,
                      background: active ? HNH.ink : '#fff',
                      color: active ? '#fff' : HNH.ink2,
                      border: active ? 'none' : `1px solid ${HNH.line}`,
                      fontSize: 11, fontWeight: 600,
                    }}
                  >
                    <div>{m}/{y}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 1 }}>{(p.net_pay / 1_000_000).toFixed(1)}tr</div>
                  </div>
                )
              })}
            </div>

            {/* Hero amount */}
            <div
              className="relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${HNH.ink} 0%, #1a1f3a 100%)`,
                borderRadius: 22, padding: 20, color: '#fff',
              }}
            >
              <div className="absolute" style={{ right: -30, top: -40, width: 160, height: 160, borderRadius: '50%', background: HNH.gold, opacity: 0.2, filter: 'blur(2px)' }} />
              <div className="relative">
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>
                  THỰC LĨNH · {monthLabel}
                </div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 38, fontWeight: 800, letterSpacing: -1, marginTop: 4 }}>
                  {fmtVND(latest!.net_pay)} <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>₫</span>
                </div>
                <div className="flex justify-between" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>GROSS</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{fmtVND(latest!.gross_pay)}₫</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>KHẤU TRỪ</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{fmtVND(latest!.deduction)}₫</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>TRẠNG THÁI</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>
                      {latest!.status === 'paid' ? 'Đã trả' : latest!.status === 'confirmed' ? 'Đã xác nhận' : 'Nháp'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 8px' }}>CHI TIẾT</div>
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
              <PayRow label="Lương cơ bản" amount={fmtVND(latest!.basic_pay)} />
              <PayRow label="Gross" amount={fmtVND(latest!.gross_pay)} />
              <PayRow label="Khấu trừ" amount={`-${fmtVND(latest!.deduction)}`} tone="muted" />
              <PayRow label="Thực lĩnh (Net)" amount={fmtVND(latest!.net_pay)} tone="gold" last />
            </div>

            <button
              className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
              style={{
                marginTop: 14, height: 50, borderRadius: 14, border: `1.5px solid ${HNH.ink}`,
                background: '#fff', color: HNH.ink, fontWeight: 700, fontSize: 14,
              }}
            >
              <Icon name="doc" size={18} color={HNH.ink} stroke={1.9} />
              Tải phiếu lương PDF
            </button>
          </>
        )}
      </div>
    </div>
  )
}
