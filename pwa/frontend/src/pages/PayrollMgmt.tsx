import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { api } from '../lib/api'

/* ── Types ── */
interface Dept { id: number; name: string }

interface Summary {
  employees: number
  total_gross: number
  total_net: number
  total_bhxh: number
  total_pit: number
  avg_net: number
}

interface PayrollRow {
  id: number
  employee_id: number | null
  name: string
  department: string
  position: string
  contract_type: string
  standard_days: number
  actual_days: number
  lcb_bhxh: number
  total_gross: number
  pc_chuc_vu: number
  pc_travel: number
  night_shifts: number
  ot_normal: number
  ot_weekend: number
  ot_holiday: number
  kpi_pct: number
  incentive: number
  bonus: number
  tam_ung: number
  npt: number
  J: number; K: number; O: number; S: number
  T: number; V: number; W: number; X: number
  AB: number; AC: number; AD: number; AE: number
  AF: number; AH: number; AI: number; AK: number
}

interface PayrollData {
  year: number
  month: number
  month_label: string
  departments: Dept[]
  summary: Summary
  rows: PayrollRow[]
}

type ContractFilter = '' | 'trial' | 'official' | 'performance'

const MONTH_NAMES = [
  'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12',
]

function vnd(n: number) {
  if (!n) return '0'
  return n.toLocaleString('vi-VN')
}

function vndShort(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'k'
  return String(n)
}

/* ── Summary cards ── */
function SummarySection({ s }: { s: Summary }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Top row: big numbers */}
      <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 6 }}>
        <div style={{
          background: 'linear-gradient(135deg, #142b6f 0%, #1e3a8a 100%)',
          borderRadius: 16, padding: '14px 16px', color: '#fff',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>Tổng Gross (AB)</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{vndShort(s.total_gross)}</div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
          borderRadius: 16, padding: '14px 16px', color: '#fff',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>Tổng Net (AK)</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{vndShort(s.total_net)}</div>
        </div>
      </div>
      {/* Bottom row: details */}
      <div className="grid grid-cols-4 gap-2">
        <StatMini label="Nhân sự" val={String(s.employees)} color={HNH.navy} bg={HNH.navy50} />
        <StatMini label="BQ Net" val={vndShort(s.avg_net)} color={HNH.success} bg={HNH.success50} />
        <StatMini label="BHXH" val={vndShort(s.total_bhxh)} color={HNH.warn} bg={HNH.warn50} />
        <StatMini label="Thuế" val={vndShort(s.total_pit)} color={HNH.red} bg={HNH.red50} />
      </div>
    </div>
  )
}

function StatMini({ label, val, color, bg }: { label: string; val: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color, opacity: 0.7 }}>{label}</div>
    </div>
  )
}

/* ── Month nav ── */
function MonthNav({ year, month, onPrev, onNext }: {
  year: number; month: number; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
      <button onClick={onPrev} className="flex items-center justify-center border-none cursor-pointer"
        style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${HNH.line}` }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 19l-7-7 7-7" stroke={HNH.ink2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>
        {MONTH_NAMES[month - 1]} {year}
      </div>
      <button onClick={onNext} className="flex items-center justify-center border-none cursor-pointer"
        style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${HNH.line}` }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 5l7 7-7 7" stroke={HNH.ink2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

/* ── Filters ── */
function Filters({ depts, dept, onDept, ctype, onCtype, search, onSearch }: {
  depts: Dept[]; dept: string; onDept: (v: string) => void
  ctype: ContractFilter; onCtype: (v: ContractFilter) => void
  search: string; onSearch: (v: string) => void
}) {
  const ctypes: { key: ContractFilter; label: string }[] = [
    { key: '', label: 'Tất cả HĐ' },
    { key: 'trial', label: 'Thử việc' },
    { key: 'official', label: 'Chính thức' },
    { key: 'performance', label: 'Hiệu suất' },
  ]

  return (
    <>
      {/* Search */}
      <div className="flex items-center gap-2" style={{
        background: '#fff', borderRadius: 12, padding: '7px 12px',
        border: `1px solid ${HNH.line}`, marginBottom: 8,
      }}>
        <Icon name="search" size={16} color={HNH.ink3} stroke={1.8} />
        <input
          type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Tìm nhân viên..."
          className="flex-1 border-none outline-none bg-transparent"
          style={{ fontSize: 13, fontWeight: 500, color: HNH.ink }}
        />
        {search && (
          <button onClick={() => onSearch('')} className="border-none cursor-pointer bg-transparent p-0">
            <Icon name="x" size={14} color={HNH.ink3} stroke={2} />
          </button>
        )}
      </div>

      {/* Contract type */}
      <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 8px', scrollbarWidth: 'none' }}>
        {ctypes.map(c => (
          <button key={c.key} onClick={() => onCtype(c.key)}
            className="shrink-0 border-none cursor-pointer whitespace-nowrap"
            style={{
              padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: ctype === c.key ? HNH.navy : '#fff',
              color: ctype === c.key ? '#fff' : HNH.ink2,
              border: `1px solid ${ctype === c.key ? HNH.navy : HNH.line}`,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Department */}
      {depts.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto" style={{ padding: '0 0 10px', scrollbarWidth: 'none' }}>
          <button onClick={() => onDept('')}
            className="shrink-0 border-none cursor-pointer whitespace-nowrap"
            style={{
              padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: !dept ? HNH.navy : '#fff',
              color: !dept ? '#fff' : HNH.ink2,
              border: `1px solid ${!dept ? HNH.navy : HNH.line}`,
            }}
          >
            Tất cả PB
          </button>
          {depts.map(d => (
            <button key={d.id} onClick={() => onDept(String(d.id) === dept ? '' : String(d.id))}
              className="shrink-0 border-none cursor-pointer whitespace-nowrap"
              style={{
                padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: String(d.id) === dept ? HNH.navy : '#fff',
                color: String(d.id) === dept ? '#fff' : HNH.ink2,
                border: `1px solid ${String(d.id) === dept ? HNH.navy : HNH.line}`,
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/* ── Contract type badge ── */
const CT_COLORS: Record<string, { color: string; bg: string }> = {
  'HĐ Thử việc': { color: HNH.warn, bg: HNH.warn50 },
  'HĐ Chính thức': { color: HNH.success, bg: HNH.success50 },
  'HĐ Hiệu suất': { color: HNH.navy, bg: HNH.navy50 },
}

/* ── Employee payroll card ── */
function PayrollCard({ row, onTap, isOpen }: { row: PayrollRow; onTap: () => void; isOpen: boolean }) {
  const ct = CT_COLORS[row.contract_type] || { color: HNH.ink3, bg: HNH.cream2 }
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16,
        border: `1px solid ${HNH.line}`, overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 14px' }}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{row.name}</span>
              <span style={{
                fontSize: 9.5, fontWeight: 700, color: ct.color,
                background: ct.bg, borderRadius: 6, padding: '1px 7px',
              }}>
                {row.contract_type}
              </span>
            </div>
            {(row.department || row.position) && (
              <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
                {row.department}{row.position ? ` · ${row.position}` : ''}
              </div>
            )}
          </div>
          <Icon name={isOpen ? 'chev-d' : 'chev-r'} size={12} color={HNH.ink4} stroke={2} />
        </div>

        {/* Quick numbers */}
        <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: HNH.ink3 }}>Gross</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: HNH.navy }}>{vnd(row.AB)}</div>
          </div>
          <div style={{ width: 1, height: 20, background: HNH.line }} />
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: HNH.ink3 }}>Net</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: HNH.success }}>{vnd(row.AK)}</div>
          </div>
          <div style={{ width: 1, height: 20, background: HNH.line }} />
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: HNH.ink3 }}>Ngày</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{row.actual_days}/{row.standard_days}</div>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {isOpen && (
        <div style={{
          padding: '12px 14px', borderTop: `1px solid ${HNH.line}`,
          background: HNH.cream,
        }}>
          {/* Salary breakdown */}
          <SectionLabel text="Thu nhập" />
          <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
            <Cell label="G · LCB BHXH" val={vnd(row.lcb_bhxh)} />
            <Cell label="H · Tổng Gross" val={vnd(row.total_gross)} />
            <Cell label="I · PC Chức vụ" val={vnd(row.pc_chuc_vu)} />
            <Cell label="L · PC Đi lại" val={vnd(row.pc_travel)} />
            <Cell label="J · LCB thực" val={vnd(row.J)} />
            <Cell label="K · LHS Pool" val={vnd(row.K)} />
          </div>

          <SectionLabel text="Tăng ca & KPI" />
          <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
            <Cell label="OT thường" val={`${row.ot_normal} giờ`} />
            <Cell label="OT cuối tuần" val={`${row.ot_weekend} giờ`} />
            <Cell label="OT lễ" val={`${row.ot_holiday} giờ`} />
            <Cell label="T · Tổng OT" val={vnd(row.T)} color={HNH.warn} />
            <Cell label="U · KPI %" val={`${row.kpi_pct}%`} />
            <Cell label="V · KPI thực nhận" val={vnd(row.V)} color={HNH.navy} />
          </div>

          {(row.night_shifts > 0 || row.incentive > 0 || row.bonus > 0) && (
            <>
              <SectionLabel text="Phụ cấp & Thưởng" />
              <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
                {row.night_shifts > 0 && <Cell label="O · Ca đêm" val={vnd(row.O)} />}
                {row.incentive > 0 && <Cell label="Y · Incentive" val={vnd(row.incentive)} />}
                {row.bonus > 0 && <Cell label="Z · Bonus" val={vnd(row.bonus)} />}
              </div>
            </>
          )}

          <SectionLabel text="Khấu trừ" />
          <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
            <Cell label="AC · BHXH (8%)" val={vnd(row.AC)} color={HNH.red} />
            <Cell label="AD · BHYT (1.5%)" val={vnd(row.AD)} color={HNH.red} />
            <Cell label="AE · BHTN (1%)" val={vnd(row.AE)} color={HNH.red} />
            <Cell label="AF · Tổng BH" val={vnd(row.AF)} color={HNH.red} />
            <Cell label="AH · Thu nhập chịu thuế" val={vnd(row.AH)} />
            <Cell label="AI · Thuế TNCN" val={vnd(row.AI)} color={HNH.red} />
            <Cell label="NPT" val={`${row.npt} người`} />
            {row.tam_ung > 0 && <Cell label="AJ · Tạm ứng" val={vnd(row.tam_ung)} />}
          </div>

          {/* Final */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            borderRadius: 12, padding: '10px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>AK · Thực nhận</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{vnd(row.AK)}</span>
          </div>
        </div>
      )}
    </button>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
      {text}
    </div>
  )
}

function Cell({ label, val, color }: { label: string; val: string; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '5px 8px' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: HNH.ink3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: color || HNH.ink }}>{val}</div>
    </div>
  )
}

/* ── Main Page ── */
export function PayrollMgmtPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [dept, setDept] = useState('')
  const [ctype, setCtype] = useState<ContractFilter>('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<PayrollData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      })
      if (dept) params.set('department', dept)
      if (ctype) params.set('contract_type', ctype)
      if (search) params.set('search', search)
      const d = await api.get<PayrollData>(`/api/payroll/payroll-management/?${params}`)
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [year, month, dept, ctype, search])

  useEffect(() => { fetchData() }, [fetchData])

  const goMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(m)
    setYear(y)
    setExpandedId(null)
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Bảng lương"
        trailing={
          data ? (
            <span style={{
              fontSize: 11, fontWeight: 700, color: HNH.ink3,
              background: HNH.cream2, borderRadius: 8, padding: '4px 10px',
            }}>
              {data.summary.employees} NV
            </span>
          ) : null
        }
      />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: '0 16px 32px', maxWidth: 720, margin: '0 auto' }}>

          <MonthNav year={year} month={month} onPrev={() => goMonth(-1)} onNext={() => goMonth(1)} />

          {data && <SummarySection s={data.summary} />}

          <Filters
            depts={data?.departments || []}
            dept={dept} onDept={setDept}
            ctype={ctype} onCtype={setCtype}
            search={search} onSearch={setSearch}
          />

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Đang tải...
            </div>
          ) : data && data.rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.rows.map(r => (
                <PayrollCard
                  key={r.id}
                  row={r}
                  isOpen={expandedId === r.id}
                  onTap={() => setExpandedId(expandedId === r.id ? null : r.id)}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Icon name="doc" size={40} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
                Chưa có dữ liệu lương
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
                Chưa generate bảng lương cho tháng này
              </div>
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
