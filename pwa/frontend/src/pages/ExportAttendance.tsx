import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

interface Row {
  stt: number
  employee_code: string
  accounting_code: string
  first_name: string
  full_name: string
  date: string
  weekday: string
  clock_in: string
  clock_out: string
  worked: string
  detail: string
  is_late: boolean
  is_early: boolean
  late_mins: number
  early_mins: number
  coefficient: number
  work_pct: number
  cong: number
  note: string
}

interface Opt { id: number; name: string }

const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']
const PAGE_SIZES = [20, 50, 100, 200]

const _ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const firstOfMonth = (y: number, m: number) => _ymd(y, m, 1)
const lastOfMonth = (y: number, m: number) => _ymd(y, m, new Date(y, m, 0).getDate())

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', flexShrink: 0,
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      background: active ? HNH.navy : '#fff', color: active ? '#fff' : HNH.ink2,
      boxShadow: active ? `0 2px 8px ${HNH.navy}30` : `0 1px 3px rgba(0,0,0,0.06)`,
    }}>{label}</button>
  )
}

export function ExportAttendancePage() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [companies, setCompanies] = useState<Opt[]>([])
  const [depts, setDepts] = useState<Opt[]>([])
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [deptId, setDeptId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [qApplied, setQApplied] = useState('')
  const [fromDate, setFromDate] = useState(() => firstOfMonth(now.getFullYear(), now.getMonth() + 1))
  const [toDate, setToDate] = useState(() => lastOfMonth(now.getFullYear(), now.getMonth() + 1))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const monthFirst = firstOfMonth(year, month)
  const monthLast = lastOfMonth(year, month)

  // Đổi tháng → reset khoảng ngày về đầu/cuối tháng + về trang 1
  useEffect(() => {
    setFromDate(firstOfMonth(year, month))
    setToDate(lastOfMonth(year, month))
    setPage(1)
  }, [year, month])

  // Đổi bộ lọc / khoảng ngày / số dòng/trang → về trang 1
  useEffect(() => { setPage(1) }, [companyId, deptId, qApplied, fromDate, toDate, pageSize])

  // Debounce ô tìm kiếm (Tên / Mã NV / Mã KT) — tránh gọi API mỗi ký tự
  useEffect(() => {
    const id = setTimeout(() => setQApplied(q.trim()), 400)
    return () => clearTimeout(id)
  }, [q])

  // Danh sách Công ty + Phòng ban để lọc (badge)
  useEffect(() => {
    fetch('/bff/api/employee/companies/', { credentials: 'include' })
      .then(r => r.ok ? r.json() : []).then((arr: any[]) =>
        setCompanies(arr.map(c => ({ id: c.id, name: c.company ?? c.name })))).catch(() => {})
    fetch('/bff/api/employee/departments/', { credentials: 'include' })
      .then(r => r.ok ? r.json() : []).then((arr: any[]) =>
        setDepts(arr.map(d => ({ id: d.id, name: d.department ?? d.name })))).catch(() => {})
  }, [])
  useEffect(() => { setDeptId(null) }, [companyId])

  const filterQS = `${companyId ? `&company_id=${companyId}` : ''}${deptId ? `&department_id=${deptId}` : ''}${qApplied ? `&q=${encodeURIComponent(qApplied)}` : ''}`

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/bff/api/attendance/export-monthly/?year=${year}&month=${month}&from_date=${fromDate}&to_date=${toDate}&page=${page}&page_size=${pageSize}${filterQS}`, { credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `Lỗi ${res.status}`)
        setRows([]); setTotal(0); setTotalPages(1)
      } else {
        const data = await res.json()
        setRows(data.results || [])
        setTotal(data.count ?? 0)
        setTotalPages(data.total_pages ?? 1)
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi')
    }
    setLoading(false)
  }, [year, month, fromDate, toDate, page, pageSize, filterQS])

  useEffect(() => { load() }, [load])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/bff/api/attendance/export-monthly/xlsx/?year=${year}&month=${month}&from_date=${fromDate}&to_date=${toDate}${filterQS}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `HoatDong_ChamCong_T${month}_${year}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Lỗi tải file')
    }
    setDownloading(false)
  }

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => {
    const isNow = year === now.getFullYear() && month === now.getMonth() + 1
    if (isNow) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1)
  }

  return (
    <div style={{ flex: 1, background: HNH.cream }}>
      <TopBar onBack={() => navigate(-1)} title="Xuất Chấm công" sub="HOẠT ĐỘNG CHẤM CÔNG" />

      <div style={{ padding: '0 16px 120px' }}>
        {/* Month picker */}
        <div className="flex items-center justify-between" style={{
          padding: '12px 16px', borderRadius: 14, marginBottom: 12,
          background: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
        }}>
          <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            <Icon name="chevron-left" size={16} color="#fff" />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{MONTH_NAMES[month - 1]} / {year}</span>
          <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            <Icon name="chevron-right" size={16} color="#fff" />
          </button>
        </div>

        {/* Từ ngày – Đến ngày (trong tháng đang chọn) */}
        <div className="flex items-end gap-2" style={{ marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, display: 'block', marginBottom: 3 }}>TỪ NGÀY</label>
            <input type="date" value={fromDate} min={monthFirst} max={monthLast}
              onChange={e => setFromDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, boxSizing: 'border-box', color: HNH.ink, background: '#fff', fontFamily: 'inherit' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, display: 'block', marginBottom: 3 }}>ĐẾN NGÀY</label>
            <input type="date" value={toDate} min={fromDate || monthFirst} max={monthLast}
              onChange={e => setToDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, boxSizing: 'border-box', color: HNH.ink, background: '#fff', fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* Ô lọc theo Tên / Mã NV / Mã KT (nhiều NV: cách nhau dấu phẩy) */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <Icon name="search" size={15} color={HNH.ink3} />
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Lọc theo Tên / Mã NV / Mã KT (vd: Trâm  hoặc  PVHT, an.nd)"
            style={{ width: '100%', padding: '10px 30px 10px 32px', borderRadius: 12, border: `1px solid ${HNH.line}`, fontSize: 13, boxSizing: 'border-box' }}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: HNH.ink3, fontSize: 16 }}>×</button>
          )}
        </div>

        {/* Lọc Công ty / Phòng ban */}
        {companies.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 4 }}>
            <Chip label="Tất cả Cty" active={companyId === null} onClick={() => setCompanyId(null)} />
            {companies.map(c => <Chip key={c.id} label={c.name} active={companyId === c.id} onClick={() => setCompanyId(c.id)} />)}
          </div>
        )}
        {depts.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
            <Chip label="Tất cả Phòng" active={deptId === null} onClick={() => setDeptId(null)} />
            {depts.map(d => <Chip key={d.id} label={d.name} active={deptId === d.id} onClick={() => setDeptId(d.id)} />)}
          </div>
        )}

        {/* Stats + download */}
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: HNH.ink2 }}>
            {loading ? 'Đang tải...' : `${total} dòng`}
          </span>
          <button
            onClick={handleDownload}
            disabled={downloading || rows.length === 0}
            style={{
              padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: downloading || rows.length === 0 ? HNH.ink4 : HNH.success,
              color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="doc" size={16} color="#fff" />
            {downloading ? 'Đang tải...' : 'Xuất Excel'}
          </button>
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: 10, background: HNH.red50, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: HNH.red }}>{error}</span>
          </div>
        )}

        {/* Thanh trên bảng: trang hiện tại + số dòng/trang (góc phải) */}
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: HNH.ink3 }}>{total > 0 ? `Trang ${page}/${totalPages}` : ''}</span>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 12, color: HNH.ink3 }}>Số dòng/trang</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 12, fontWeight: 600, color: HNH.ink, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Data table */}
        <div style={{ overflowX: 'auto', borderRadius: 14, border: `1px solid ${HNH.line}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 1200 }}>
            <thead>
              <tr style={{ background: HNH.navy, color: '#fff' }}>
                {['STT','Mã NV','Mã KT','Tên','Họ tên','Ngày','Thứ','Vào','Ra','Giờ làm','Lượt chấm','Trễ','Sớm','Hệ số','% NC','Công','Ghi chú'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `2px solid ${HNH.navy2}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : HNH.cream }}>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}` }}>{r.stt}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontWeight: 600 }}>{r.employee_code}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}` }}>{r.accounting_code}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}` }}>{r.first_name}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, whiteSpace: 'nowrap' }}>{r.full_name}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, whiteSpace: 'nowrap' }}>
                    {new Date(r.date).toLocaleDateString('vi-VN')}
                  </td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontWeight: 600 }}>{r.weekday}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontFamily: 'monospace' }}>{r.clock_in}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontFamily: 'monospace' }}>{r.clock_out}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontFamily: 'monospace', fontWeight: 700 }}>{r.worked}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontSize: 10, color: HNH.ink3 }}>{r.detail}</td>
                  <td style={{
                    padding: '6px', borderBottom: `1px solid ${HNH.line}`,
                    color: r.is_late ? HNH.red : HNH.ink4, fontWeight: r.is_late ? 700 : 400,
                    background: r.is_late ? HNH.red50 : 'transparent',
                  }}>{r.is_late ? 'Có' : ''}</td>
                  <td style={{
                    padding: '6px', borderBottom: `1px solid ${HNH.line}`,
                    color: r.is_early ? HNH.warn : HNH.ink4, fontWeight: r.is_early ? 700 : 400,
                    background: r.is_early ? HNH.warn50 : 'transparent',
                  }}>{r.is_early ? 'Có' : ''}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, textAlign: 'center', fontWeight: 600 }}>{r.coefficient}</td>
                  <td style={{
                    padding: '6px', borderBottom: `1px solid ${HNH.line}`, textAlign: 'center', fontWeight: 700,
                    color: r.work_pct >= 100 ? HNH.success : r.work_pct >= 80 ? HNH.warn : HNH.red,
                  }}>{r.work_pct}%</td>
                  <td style={{
                    padding: '6px', borderBottom: `1px solid ${HNH.line}`, textAlign: 'center', fontWeight: 800,
                    color: r.cong >= 1 ? HNH.success : '#c2410c',
                  }}>{r.cong}</td>
                  <td style={{ padding: '6px', borderBottom: `1px solid ${HNH.line}`, fontSize: 10, color: HNH.ink2 }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3" style={{ marginTop: 14 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', color: page <= 1 ? HNH.ink4 : HNH.navy, fontSize: 13, fontWeight: 700, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>‹ Trước</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', color: page >= totalPages ? HNH.ink4 : HNH.navy, fontSize: 13, fontWeight: 700, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Sau ›</button>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
            Không có dữ liệu chấm công tháng này
          </div>
        )}
      </div>
    </div>
  )
}
