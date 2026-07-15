import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL_W = 44
const NAME_W = 124   // khớp cột NHÂN VIÊN của CC Tháng (MonthlyAttendanceDetail)
const ROW_H = 44
const BAL_W = 52   // cột Phép đầu / Phép cuối

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmpInfo {
  id: number
  name: string
  badge_id: string
  accounting_code: string
  department: string
  dept_id: number | null
  company: string
  company_id: number | null
  leave_start: number
  leave_deduct: number
  leave_unpaid: number
  leave_taken: number
  leave_end: number
}

// Bỏ dấu tiếng Việt để tìm không dấu ra tên có dấu (gõ "nguyen" ra "NGUYỄN").
function noAccent(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
}

// Bảng màu phân biệt từng loại phép trong chú thích (legend) ở dưới bảng.
const LEAVE_TYPE_COLORS = ['#c0222b', '#0e7490', '#a87908', '#1f8a5b', '#7c3aed', '#be185d', '#2563eb', '#ea580c', '#0f766e', '#9333ea']

interface CellEntry {
  id: number
  code: string
  name: string
  status: string
  is_morning: boolean
  is_afternoon: boolean
  is_hourly: boolean
  time_range: string | null
  start_date?: string | null
  end_date?: string | null
  requested_days?: number | null
  requested_hours?: number | null
  description?: string
}

interface OverviewData {
  employees: EmpInfo[]
  cells: Record<string, CellEntry[]>
  days: string[]
  departments: { id: string; name: string; company_ids: number[] }[]
  companies: { id: string; name: string }[]
  year: number
  month: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  approved:  { bg: '#dcfce7', text: '#15803d' },
  requested: { bg: '#fef9c3', text: '#854d0e' },
  rejected:  { bg: '#fee2e2', text: '#dc2626' },
}

function shortDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
}

function isWeekend(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 || d.getDay() === 6
}

function dayNum(dateStr: string) {
  return dateStr.slice(8)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── Leave Cell ────────────────────────────────────────────────────────────────

function LeaveCell({ entries }: { entries: CellEntry[] }) {
  if (!entries.length) return null

  const first = entries[0]
  const c = STATUS_COLORS[first.status] || STATUS_COLORS.requested
  const extra = entries.length > 1
  const code = first.code.slice(0, 3)

  if (first.is_hourly && first.time_range) {
    return (
      <div style={{
        height: '100%', background: c.bg, borderRadius: 3, padding: '1px 2px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 6.5, fontWeight: 700, color: c.text,
          textAlign: 'center', lineHeight: 1.15, whiteSpace: 'pre',
        }}>
          {first.time_range.replace('-', '\n')}
        </span>
      </div>
    )
  }

  const isMorning = first.is_morning
  const isAfternoon = first.is_afternoon

  if (isMorning && !isAfternoon) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          flex: 1, background: c.bg, borderRadius: '3px 3px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 7.5, fontWeight: 700, color: c.text }}>{code}</span>
        </div>
        <div style={{ flex: 1 }} />
      </div>
    )
  }

  if (!isMorning && isAfternoon) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }} />
        <div style={{
          flex: 1, background: c.bg, borderRadius: '0 0 3px 3px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 7.5, fontWeight: 700, color: c.text }}>{code}</span>
        </div>
      </div>
    )
  }

  // Full day
  return (
    <div style={{
      height: '100%', background: c.bg, borderRadius: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: c.text, textAlign: 'center' }}>
        {code}{extra ? '+' : ''}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Modal chi tiết phép 1 NV (breakdown + C&B sửa tay) ──────────────────────
interface LeaveBalance {
  leave_type_id: number
  name: string
  available_days: number
  carryforward_days: number
  start: number
  taken_this_year: number
  count_this_year: number
  deduct: boolean
}
interface LeaveDetailData {
  employee: { id: number; name: string; badge_id: string; department: string; company: string }
  balances: LeaveBalance[]
  total_start: number
  is_cnb: boolean
}

const inpStyle: CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`,
  fontSize: 13, background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
}

function LeaveDetailModal({ emp, onClose, onChanged }: {
  emp: { id: number; name: string }; onClose: () => void; onChanged: () => void
}) {
  const [data, setData] = useState<LeaveDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [eAvail, setEAvail] = useState('')
  const [eCarry, setECarry] = useState('')
  const [eReason, setEReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.get<LeaveDetailData>(`/api/leave/hnh-leave-detail/?employee_id=${emp.id}`))
    } catch { /* silent */ } finally { setLoading(false) }
  }, [emp.id])
  useEffect(() => { load() }, [load])

  function startEdit(b: LeaveBalance) {
    setEditId(b.leave_type_id); setEAvail(String(b.available_days))
    setECarry(String(b.carryforward_days)); setEReason('')
  }
  async function saveEdit(b: LeaveBalance) {
    setSaving(true)
    try {
      await api.post('/api/leave/hnh-adjust-balance/', {
        employee_id: emp.id, leave_type_id: b.leave_type_id,
        available_days: parseFloat(eAvail) || 0, carryforward_days: parseFloat(eCarry) || 0,
        reason: eReason,
      })
      setEditId(null); await load(); onChanged()
    } catch { alert('Không lưu được số dư') } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', padding: '18px 18px 28px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data?.employee.name ?? emp.name}</div>
            {data && <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>{data.employee.badge_id}{data.employee.department ? ` · ${data.employee.department}` : ''}</div>}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <Icon name="x" size={20} color={HNH.ink3} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Đang tải…</div>
        ) : data && (
          <>
            <div style={{ background: HNH.navy50, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }} className="flex items-center justify-between">
              <span style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>Tổng Phép đầu (các loại trừ dư)</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: HNH.navy }}>{data.total_start}</span>
            </div>

            {data.balances.filter(b => !/ốm|sick/i.test(b.name)).map(b => (
              <div key={b.leave_type_id} style={{ border: `1px solid ${HNH.line}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8, background: b.deduct ? '#fff' : HNH.cream }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                    {b.name}
                    {b.deduct && <span style={{ fontSize: 9, marginLeft: 6, color: HNH.navy, background: HNH.navy50, borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>trừ dư</span>}
                  </div>
                  {data.is_cnb && editId !== b.leave_type_id && (
                    <button onClick={() => startEdit(b)} style={{ fontSize: 11, fontWeight: 700, color: HNH.red, background: HNH.red50, border: 'none', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>Sửa</button>
                  )}
                </div>

                {editId === b.leave_type_id ? (
                  <div style={{ marginTop: 8 }}>
                    <div className="flex gap-2">
                      <label style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: HNH.ink3, marginBottom: 3, fontWeight: 600 }}>Khả dụng</div>
                        <input value={eAvail} onChange={e => setEAvail(e.target.value)} type="number" step="0.5" style={inpStyle} />
                      </label>
                      <label style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: HNH.ink3, marginBottom: 3, fontWeight: 600 }}>{/phép năm/i.test(b.name) ? 'Phép tồn' : 'Chuyển kỳ'}</div>
                        <input value={eCarry} onChange={e => setECarry(e.target.value)} type="number" step="0.5" style={inpStyle} />
                      </label>
                    </div>
                    <input value={eReason} onChange={e => setEReason(e.target.value)} placeholder="Lý do điều chỉnh (tuỳ chọn)" style={{ ...inpStyle, marginTop: 6 }} />
                    <div className="flex gap-2" style={{ marginTop: 8 }}>
                      <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', color: HNH.ink2, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
                      <button onClick={() => saveEdit(b)} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: saving ? HNH.ink4 : HNH.navy, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4" style={{ marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: HNH.ink2 }}>Phép đầu: <b style={{ color: HNH.ink }}>{b.start}</b></span>
                    <span style={{ color: HNH.ink2 }}>Đã dùng: <b style={{ color: b.taken_this_year > 0 ? '#a87908' : HNH.ink }}>{b.taken_this_year}</b></span>
                    {b.count_this_year > 0 && <span style={{ color: HNH.ink3, fontSize: 11 }}>· {b.count_this_year} lượt</span>}
                  </div>
                )}
              </div>
            ))}
            {data.balances.filter(b => !/ốm|sick/i.test(b.name)).length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>NV chưa có số dư phép nào.</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal chi tiết ĐƠN nghỉ (bấm vào ô ngày) — giữa màn hình ─────────────────
function LeaveRequestDetailModal({ emp, entries, onClose }: {
  emp: EmpInfo
  entries: CellEntry[]
  onClose: () => void
}) {
  const stLabel: Record<string, string> = { approved: 'Đã duyệt', requested: 'Chờ duyệt', rejected: 'Từ chối' }
  const fmtD = (s?: string | null) => {
    if (!s) return '—'
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${HNH.line}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>Chi tiết đơn nghỉ</div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {emp.name}{emp.badge_id ? ` · ${emp.badge_id}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: HNH.cream, borderRadius: 10, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="x" size={18} color={HNH.ink} stroke={2} />
          </button>
        </div>

        {/* Body — mỗi đơn 1 khối */}
        <div style={{ padding: '12px 18px 18px' }}>
          {entries.map((en, i) => {
            const c = STATUS_COLORS[en.status] || STATUS_COLORS.requested
            const range = en.start_date && en.end_date && en.start_date !== en.end_date
              ? `${fmtD(en.start_date)} → ${fmtD(en.end_date)}`
              : fmtD(en.start_date)
            const rows: [string, string][] = [['Loại nghỉ', en.name], ['Thời gian', range]]
            if (en.is_hourly && en.time_range) {
              rows.push(['Khung giờ', `${en.time_range}${en.requested_hours ? ` (${en.requested_hours}h)` : ''}`])
            } else {
              rows.push(['Buổi', en.is_morning && en.is_afternoon ? 'Cả ngày' : en.is_morning ? 'Buổi sáng' : 'Buổi chiều'])
            }
            if (en.requested_days != null) {
              rows.push(['Số ngày', `${en.requested_days % 1 === 0 ? en.requested_days : en.requested_days.toFixed(2)} ngày`])
            }
            const last = i === entries.length - 1
            return (
              <div key={`${en.id}_${i}`} style={{ marginBottom: last ? 0 : 14, paddingBottom: last ? 0 : 14, borderBottom: last ? 'none' : `1px solid ${HNH.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: c.bg, color: c.text }}>
                    {stLabel[en.status] || en.status}
                  </span>
                </div>
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${HNH.line}`, fontSize: 13 }}>
                    <span style={{ color: HNH.ink3, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: HNH.ink, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
                {en.description && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.3 }}>NỘI DUNG / LÝ DO</div>
                    <div style={{ marginTop: 5, background: HNH.cream, borderRadius: 10, padding: '9px 11px', fontSize: 13, color: HNH.ink, lineHeight: 1.5 }}>{en.description}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function LeaveOverviewPage() {
  const navigate = useNavigate()
  const today = todayStr()
  const gridRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [companyFilter, setCompanyFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const [arisingFilter, setArisingFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [detailEmp, setDetailEmp] = useState<{ id: number; name: string } | null>(null)
  const [detailEntry, setDetailEntry] = useState<{ emp: EmpInfo; entries: CellEntry[] } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      if (deptFilter) params.set('dept_id', deptFilter)
      if (companyFilter) params.set('company_id', companyFilter)
      const res = await api.get<OverviewData>(`/api/leave/hnh-leave-overview/?${params}`)
      setData(res)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [year, month, deptFilter, companyFilter])

  useEffect(() => { load() }, [load])

  // Focus ngay vào các cột Phép đầu / Phát sinh / Còn lại khi mở bảng
  useEffect(() => {
    if (!data || !gridRef.current) return
    gridRef.current.scrollLeft = 0
  }, [data])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const resp = await fetch(`/bff/api/leave/export-excel/?${params}`, { credentials: 'include' })
      if (!resp.ok) throw new Error()
      const blob = await resp.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `NghiPhep_T${String(month).padStart(2, '0')}-${year}.xlsx`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      alert('Không thể xuất file')
    } finally {
      setExporting(false)
    }
  }

  const employees = (data?.employees ?? []).filter(e => {
    // Lọc theo điều kiện Phát sinh nghỉ phép trong tháng
    if (arisingFilter === 'yes' && !((e.leave_taken ?? 0) > 0)) return false
    if (arisingFilter === 'no' && (e.leave_taken ?? 0) > 0) return false
    const q = search.trim()
    if (!q) return true
    const qn = noAccent(q)
    // Tìm theo Họ tên (không dấu ra có dấu), Mã HRM (badge_id), Mã Kế toán (accounting_code)
    return noAccent(e.name).includes(qn)
      || (e.badge_id || '').toLowerCase().includes(qn)
      || (e.accounting_code || '').toLowerCase().includes(qn)
  })

  const days = data?.days ?? []
  const departments = data?.departments ?? []
  const companies = data?.companies ?? []
  const deptOptions = departments.filter(d => !companyFilter || (d.company_ids ?? []).includes(Number(companyFilter)))

  // Gom các loại phép xuất hiện trong tháng → chú thích viết tắt → tên đầy đủ, mỗi loại một màu
  const leaveTypes = (() => {
    const m = new Map<string, string>()  // tên đầy đủ -> viết tắt hiển thị (khớp ô bảng: 3 ký tự)
    Object.values(data?.cells ?? {}).forEach(list => list.forEach(en => {
      if (en.name && !m.has(en.name)) m.set(en.name, (en.code || '').slice(0, 3))
    }))
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
      .map(([name, code], i) => ({ name, code, color: LEAVE_TYPE_COLORS[i % LEAVE_TYPE_COLORS.length] }))
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', overflow: 'hidden' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Tổng Quan Nghỉ Phép"
        sub={data ? `${employees.length} NHÂN VIÊN · T${month}/${year}` : ''}
        trailing={
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center justify-center border-none cursor-pointer"
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: HNH.cream, opacity: exporting ? 0.6 : 1,
            }}
            title="Xuất Excel"
          >
            <Icon name="download" size={18} color={HNH.ink} stroke={2} />
          </button>
        }
      />

      {/* Controls */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        {/* Month nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            style={{
              border: 'none', background: HNH.cream, borderRadius: 8,
              width: 30, height: 30, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="chev-l" size={16} color={HNH.ink2} stroke={2} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, color: HNH.ink, minWidth: 88, textAlign: 'center' }}>
            T{month}/{year}
          </div>
          <button
            onClick={nextMonth}
            style={{
              border: 'none', background: HNH.cream, borderRadius: 8,
              width: 30, height: 30, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="chev-r" size={16} color={HNH.ink2} stroke={2} />
          </button>
        </div>

        {/* Lọc công ty — pills navy (giống CC Tháng) */}
        {companies.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            <button
              onClick={() => { setCompanyFilter(''); setDeptFilter('') }}
              style={{
                flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                padding: '0 12px', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600,
                background: companyFilter === '' ? HNH.navy : HNH.cream2,
                color: companyFilter === '' ? '#fff' : HNH.ink2,
              }}
            >
              Tất cả công ty
            </button>
            {companies.map(c => {
              const on = companyFilter === String(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => { setCompanyFilter(String(c.id)); setDeptFilter('') }}
                  style={{
                    flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                    padding: '0 12px', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600,
                    background: on ? HNH.navy : HNH.cream2,
                    color: on ? '#fff' : HNH.ink2,
                  }}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Lọc phòng ban — pills đỏ (giống CC Tháng) */}
        {deptOptions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            <button
              onClick={() => setDeptFilter('')}
              style={{
                flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                padding: '0 12px', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600,
                background: deptFilter === '' ? HNH.red : HNH.cream2,
                color: deptFilter === '' ? '#fff' : HNH.ink2,
              }}
            >
              Tất cả phòng
            </button>
            {deptOptions.map(d => {
              const on = deptFilter === String(d.id)
              return (
                <button
                  key={d.id}
                  onClick={() => setDeptFilter(String(d.id))}
                  style={{
                    flexShrink: 0, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer',
                    padding: '0 12px', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600,
                    background: on ? HNH.red : HNH.cream2,
                    color: on ? '#fff' : HNH.ink2,
                  }}
                >
                  {d.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Search: Họ tên / Mã HRM / Mã Kế toán */}
        <div
          className="flex items-center gap-2"
          style={{ background: HNH.cream, borderRadius: 10, padding: '7px 12px' }}
        >
          <Icon name="search" size={14} color={HNH.ink3} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, mã HRM, mã kế toán..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 13,
              color: HNH.ink, background: 'transparent', fontFamily: 'inherit',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Icon name="x" size={13} color={HNH.ink3} stroke={2} />
            </button>
          )}
        </div>

        {/* Lọc theo điều kiện Phát sinh nghỉ phép trong tháng */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12, color: HNH.ink3, whiteSpace: 'nowrap' }}>Phát sinh:</span>
          <div className="flex items-center gap-1" style={{ flex: 1 }}>
            {([
              { k: 'all', label: 'Tất cả' },
              { k: 'yes', label: 'Có' },
              { k: 'no', label: 'Không' },
            ] as const).map(opt => {
              const on = arisingFilter === opt.k
              return (
                <button
                  key={opt.k}
                  onClick={() => setArisingFilter(opt.k)}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12.5, fontWeight: on ? 700 : 500, fontFamily: 'inherit',
                    border: `1px solid ${on ? HNH.red : HNH.line}`,
                    background: on ? HNH.red : '#fff',
                    color: on ? '#fff' : HNH.ink2,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: HNH.ink3, fontSize: 13 }}>
          Đang tải...
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div
            ref={gridRef}
            style={{ flex: 1, overflow: 'auto' }}
          >
            {/* Header row — sticky top */}
            <div style={{
              display: 'flex', position: 'sticky', top: 0,
              background: '#fff', borderBottom: `1px solid ${HNH.line}`, zIndex: 2,
            }}>
              {/* Corner cell — sticky top + left; header navy "NHÂN VIÊN" (giống CC Tháng) */}
              <div style={{
                width: NAME_W, flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 3, background: HNH.navy,
                borderRight: `1px solid ${HNH.line}`,
                padding: '5px 8px',
                fontSize: 11, fontWeight: 600, color: '#c7d7f4',
                display: 'flex', alignItems: 'center',
              }}>
                NHÂN VIÊN
              </div>
              {/* Cột tổng hợp dồn lên đầu: Phép đầu · [Trừ phép · Không lương = Phát sinh] · Còn lại */}
              <div style={{ width: BAL_W, flexShrink: 0, textAlign: 'center', padding: '3px 2px', borderLeft: `1px solid ${HNH.line}`, background: HNH.navy50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: HNH.navy, lineHeight: 1.2 }}>Phép<br />đầu</div>
              </div>
              <div style={{ width: BAL_W, flexShrink: 0, textAlign: 'center', padding: '3px 2px', borderLeft: `1px solid ${HNH.line}`, background: '#faf1d6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#a87908', lineHeight: 1.15 }}>Trừ<br />phép</div>
              </div>
              <div style={{ width: BAL_W, flexShrink: 0, textAlign: 'center', padding: '3px 2px', borderLeft: `1px solid ${HNH.line}`, background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#c2410c', lineHeight: 1.15 }}>Không<br />lương</div>
              </div>
              <div style={{ width: BAL_W, flexShrink: 0, textAlign: 'center', padding: '3px 2px', borderLeft: `1px solid ${HNH.line}`, background: HNH.success50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: HNH.success, lineHeight: 1.2 }}>Còn<br />lại</div>
              </div>
              {days.map(d => (
                <div
                  key={d}
                  style={{
                    width: CELL_W, flexShrink: 0, textAlign: 'center', padding: '3px 2px',
                    background: d === today ? '#fff1f2' : isWeekend(d) ? '#fafafa' : '#fff',
                    borderLeft: `1px solid ${HNH.line}`,
                  }}
                >
                  <div style={{
                    fontSize: 8, fontWeight: 600,
                    color: isWeekend(d) ? HNH.red : HNH.ink3,
                  }}>
                    {shortDay(d)}
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: d === today ? 800 : 600,
                    color: d === today ? HNH.red : HNH.ink,
                  }}>
                    {dayNum(d)}
                  </div>
                </div>
              ))}
            </div>

            {/* Employee rows */}
            {employees.map(emp => (
              <div
                key={emp.id}
                style={{ display: 'flex', borderBottom: `1px solid ${HNH.line}` }}
              >
                {/* Name col — sticky left, bấm để xem chi tiết phép NV */}
                <div
                  onClick={() => setDetailEmp({ id: emp.id, name: emp.name })}
                  title="Xem chi tiết phép"
                  style={{
                    width: NAME_W, flexShrink: 0, cursor: 'pointer',
                    position: 'sticky', left: 0, zIndex: 1, background: '#fff',
                    borderRight: `1px solid ${HNH.line}`,
                    padding: '0 8px', height: ROW_H,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1,
                  }}>
                  {/* Tên gọi — dòng đầu, đậm (giống CC Tháng) */}
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: HNH.ink,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: NAME_W - 16,
                  }}>
                    {emp.name.split(' ').slice(-1)[0]}
                  </div>
                  {/* Họ đệm — chỉ hiện khi tên có nhiều hơn 1 từ (giống CC Tháng) */}
                  {emp.name.split(' ').length > 1 && (
                    <div style={{
                      fontSize: 10, color: HNH.ink3, fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: NAME_W - 16,
                    }}>
                      {emp.name.split(' ').slice(0, -1).join(' ')}
                    </div>
                  )}
                  {/* Mã NV — dòng cuối, nhỏ nhất, màu navy (giống CC Tháng) */}
                  {emp.badge_id && (
                    <div style={{
                      fontSize: 9.5, color: HNH.navy, fontWeight: 600, letterSpacing: 0.2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: NAME_W - 16,
                    }}>
                      {emp.badge_id}
                    </div>
                  )}
                </div>

                {/* Cột tổng hợp: Phép đầu · [Trừ phép · Không lương] · Còn lại */}
                <div style={{ width: BAL_W, height: ROW_H, flexShrink: 0, borderLeft: `1px solid ${HNH.line}`, background: HNH.navy50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: HNH.navy }}>
                  {emp.leave_start % 1 === 0 ? emp.leave_start : +emp.leave_start.toFixed(2)}
                </div>
                <div style={{ width: BAL_W, height: ROW_H, flexShrink: 0, borderLeft: `1px solid ${HNH.line}`, background: '#faf1d6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: emp.leave_deduct > 0 ? '#a87908' : HNH.ink4 }}>
                  {emp.leave_deduct % 1 === 0 ? emp.leave_deduct : +emp.leave_deduct.toFixed(2)}
                </div>
                <div style={{ width: BAL_W, height: ROW_H, flexShrink: 0, borderLeft: `1px solid ${HNH.line}`, background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: emp.leave_unpaid > 0 ? '#c2410c' : HNH.ink4 }}>
                  {emp.leave_unpaid % 1 === 0 ? emp.leave_unpaid : +emp.leave_unpaid.toFixed(2)}
                </div>
                <div style={{ width: BAL_W, height: ROW_H, flexShrink: 0, borderLeft: `1px solid ${HNH.line}`, background: HNH.success50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: HNH.success }}>
                  {emp.leave_end % 1 === 0 ? emp.leave_end : +emp.leave_end.toFixed(2)}
                </div>

                {/* Day cells */}
                {days.map(d => {
                  const key = `${emp.id}_${d}`
                  const entries = data?.cells[key] ?? []
                  const isToday = d === today
                  const hasLeave = entries.length > 0
                  return (
                    <div
                      key={d}
                      onClick={() => hasLeave && setDetailEntry({ emp, entries })}
                      title={hasLeave ? 'Xem chi tiết đơn nghỉ' : undefined}
                      style={{
                        width: CELL_W, height: ROW_H, flexShrink: 0,
                        borderLeft: `1px solid ${HNH.line}`,
                        background: isToday ? '#fff1f2' : isWeekend(d) ? '#fafafa' : '#fff',
                        padding: 3,
                        cursor: hasLeave ? 'pointer' : 'default',
                      }}
                    >
                      <LeaveCell entries={entries} />
                    </div>
                  )
                })}
              </div>
            ))}

            {employees.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                {search || arisingFilter !== 'all' ? 'Không tìm thấy nhân viên phù hợp' : 'Không có dữ liệu'}
              </div>
            )}
          </div>

          {/* Chú thích viết tắt loại phép — mỗi loại một màu */}
          {leaveTypes.length > 0 && (
            <div style={{
              display: 'flex', gap: 10, padding: '7px 14px',
              background: HNH.cream, borderTop: `1px solid ${HNH.line}`,
              flexShrink: 0, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: HNH.ink3, letterSpacing: 0.3 }}>LOẠI PHÉP:</span>
              {leaveTypes.map(t => (
                <div key={t.name} className="flex items-center gap-1" title={t.name}>
                  <span style={{
                    minWidth: 26, textAlign: 'center', padding: '1px 4px', borderRadius: 4,
                    background: t.color, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 0.2,
                  }}>
                    {t.code}
                  </span>
                  <span style={{ fontSize: 10.5, color: HNH.ink2, fontWeight: 600 }}>{t.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Legend trạng thái đơn */}
          <div style={{
            display: 'flex', gap: 14, padding: '6px 14px',
            background: '#fff', borderTop: `1px solid ${HNH.line}`,
            flexShrink: 0, justifyContent: 'center', flexWrap: 'wrap',
          }}>
            {[
              { label: 'Đã duyệt', key: 'approved' },
              { label: 'Chờ duyệt', key: 'requested' },
              { label: 'Từ chối', key: 'rejected' },
            ].map(({ label, key }) => {
              const c = STATUS_COLORS[key]
              return (
                <div key={key} className="flex items-center gap-1">
                  <div style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: c.bg, border: `1px solid ${c.text}50`,
                  }} />
                  <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>{label}</span>
                </div>
              )
            })}
            <div className="flex items-center gap-1">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: '#dcfce7', position: 'relative', overflow: 'hidden', border: '1px solid #15803d50' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#dcfce7' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'transparent' }} />
              </div>
              <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 500 }}>Nửa ngày</span>
            </div>
          </div>
        </div>
      )}

      {detailEmp && (
        <LeaveDetailModal emp={detailEmp} onClose={() => setDetailEmp(null)} onChanged={load} />
      )}

      {detailEntry && (
        <LeaveRequestDetailModal
          emp={detailEntry.emp}
          entries={detailEntry.entries}
          onClose={() => setDetailEntry(null)}
        />
      )}
    </div>
  )
}
