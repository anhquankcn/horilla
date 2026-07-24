import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Types ──
interface Row { id: number; [k: string]: unknown }
interface Company { id: number; name: string }
interface Dept { id: number; name: string; company_ids: number[] }
interface Enum { key: string; label: string; values: string[] }
interface ListResp {
  count: number; next: string | null; previous: string | null; results: Row[]
  companies: Company[]; departments: Dept[]; join_years: number[]; can_edit: boolean
}

// ── Field metadata (khớp 9 nhóm Master Data) ──
type FT = 'text' | 'date' | 'num' | 'enum' | 'company' | 'department' | 'position' | 'ro'
interface Field { key: string; label: string; type?: FT; enumKey?: string }
interface Group { title: string; fields: Field[] }

const GROUPS: Group[] = [
  { title: 'Cơ cấu tổ chức', fields: [
    { key: 'company_code', label: 'Mã Cty' }, { key: 'company', label: 'Công ty', type: 'company' },
    { key: 'dept_code', label: 'Mã Phòng ban' }, { key: 'department', label: 'Phòng Ban', type: 'department' },
    { key: 'team', label: 'Bộ phận/Team' },
  ]},
  { title: 'Thông tin nhân viên', fields: [
    { key: 'badge_id', label: 'Mã NV' }, { key: 'accounting_code', label: 'Mã Kế toán' },
    { key: 'first_name', label: 'Họ đệm' }, { key: 'last_name', label: 'Tên' },
    { key: 'dob', label: 'Ngày sinh', type: 'date' }, { key: 'gender', label: 'Giới tính', type: 'enum', enumKey: 'gender' },
    { key: 'cccd', label: 'Số CCCD' }, { key: 'cccd_issue_date', label: 'Ngày cấp CCCD', type: 'date' },
    { key: 'cccd_issue_place', label: 'Nơi cấp CCCD' }, { key: 'nationality', label: 'Quốc tịch', type: 'enum', enumKey: 'nationality' },
    { key: 'marital_status', label: 'Hôn nhân', type: 'enum', enumKey: 'marital_status' },
  ]},
  { title: 'Liên hệ', fields: [
    { key: 'phone', label: 'ĐT cá nhân' }, { key: 'company_phone', label: 'ĐT công ty' },
    { key: 'company_email', label: 'Email công ty' }, { key: 'personal_email', label: 'Email cá nhân' },
    { key: 'address', label: 'Địa chỉ thường trú' }, { key: 'temporary_address', label: 'Địa chỉ hiện tại' },
    { key: 'emergency_contact_name', label: 'Người liên hệ khẩn cấp' }, { key: 'emergency_contact', label: 'SĐT khẩn cấp' },
  ]},
  { title: 'Tuyển dụng / Onboarding', fields: [
    { key: 'recruit_applied_date', label: 'Ngày ứng tuyển', type: 'date' },
    { key: 'recruit_source', label: 'Nguồn tuyển dụng', type: 'enum', enumKey: 'recruit_source' },
    { key: 'date_joining', label: 'Ngày nhận việc', type: 'date' },
    { key: 'probation_end', label: 'Ngày kết thúc thử việc', type: 'date' },
    { key: 'probation_salary', label: 'Lương thử việc' },
    { key: 'reporting_manager', label: 'Quản lý trực tiếp', type: 'ro' },
    { key: 'probation_status', label: 'Trạng thái thử việc', type: 'enum', enumKey: 'probation_status' },
  ]},
  { title: 'Hợp đồng & công việc', fields: [
    { key: 'job_position', label: 'Chức danh', type: 'position' }, { key: 'level_label', label: 'Cấp bậc' },
    { key: 'location', label: 'Nơi làm việc' },
    { key: 'contract1_type', label: 'Loại HĐ (Lần 1)', type: 'enum', enumKey: 'contract_type' },
    { key: 'contract1_no', label: 'Số HĐ (Lần 1)' }, { key: 'contract1_start', label: 'Bắt đầu HĐ 1', type: 'date' }, { key: 'contract1_end', label: 'Hết hạn HĐ 1', type: 'date' },
    { key: 'contract2_type', label: 'Loại HĐ (Lần 2)', type: 'enum', enumKey: 'contract_type' },
    { key: 'contract2_no', label: 'Số HĐ (Lần 2)' }, { key: 'contract2_start', label: 'Bắt đầu HĐ 2', type: 'date' }, { key: 'contract2_end', label: 'Hết hạn HĐ 2', type: 'date' },
    { key: 'contract3_type', label: 'Loại HĐ (Lần 3)', type: 'enum', enumKey: 'contract_type' },
    { key: 'contract3_no', label: 'Số HĐ (Lần 3)' }, { key: 'contract3_start', label: 'Bắt đầu HĐ 3', type: 'date' },
    { key: 'work_form', label: 'Hình thức làm việc', type: 'enum', enumKey: 'work_form' },
  ]},
  { title: 'Lương & phúc lợi', fields: [
    { key: 'gross_salary', label: 'Lương Gross (VND)', type: 'num' }, { key: 'allowance', label: 'Phụ cấp' },
    { key: 'pay_method', label: 'Hình thức trả lương', type: 'enum', enumKey: 'pay_method' },
    { key: 'bank_account', label: 'Số tài khoản' }, { key: 'bank_name', label: 'Ngân hàng' },
    { key: 'tax_code', label: 'Mã số thuế TNCN' }, { key: 'dependents_count', label: 'SL người phụ thuộc', type: 'num' },
    { key: 'dependents_names', label: 'Tên người phụ thuộc' }, { key: 'bhxh_number', label: 'Số sổ BHXH' },
  ]},
  { title: 'Học vấn', fields: [
    { key: 'education', label: 'Trình độ học vấn', type: 'enum', enumKey: 'education' },
    { key: 'major', label: 'Chuyên ngành' }, { key: 'school', label: 'Trường tốt nghiệp' },
  ]},
  { title: 'Đánh giá & phát triển', fields: [
    { key: 'eval_rating', label: 'Xếp loại đánh giá', type: 'enum', enumKey: 'eval_rating' },
    { key: 'raise_date', label: 'Ngày tăng lương', type: 'date' }, { key: 'raise_amount', label: 'Mức tăng' },
    { key: 'raise_effective', label: 'Ngày hiệu lực', type: 'date' }, { key: 'promotion_date', label: 'Ngày thăng chức', type: 'date' },
  ]},
  { title: 'Offboarding', fields: [
    { key: 'work_status', label: 'Trạng thái làm việc', type: 'enum', enumKey: 'work_status' },
    { key: 'resign_date', label: 'Ngày nghỉ việc', type: 'date' }, { key: 'resign_reason', label: 'Lý do nghỉ việc' },
    { key: 'resign_type', label: 'Loại nghỉ việc', type: 'enum', enumKey: 'resign_type' },
    { key: 'notice_date', label: 'Ngày báo trước', type: 'date' },
    { key: 'handover', label: 'Bàn giao công việc', type: 'enum', enumKey: 'handover' }, { key: 'note', label: 'Ghi chú' },
  ]},
]

// Cột hiển thị trong bảng (rút gọn; đầy đủ ở modal + Excel)
const TABLE_COLS: { key: string; label: string; w: number }[] = [
  { key: 'company', label: 'Công ty', w: 150 }, { key: 'department', label: 'Phòng ban', w: 150 },
  { key: 'job_position', label: 'Chức danh', w: 140 }, { key: 'gender', label: 'Giới tính', w: 70 },
  { key: 'dob', label: 'Ngày sinh', w: 96 }, { key: 'phone', label: 'ĐT cá nhân', w: 110 },
  { key: 'personal_email', label: 'Email cá nhân', w: 170 }, { key: 'date_joining', label: 'Ngày vào', w: 96 },
  { key: 'gross_salary', label: 'Lương Gross', w: 110 }, { key: 'bank_name', label: 'Ngân hàng', w: 110 },
  { key: 'tax_code', label: 'MST', w: 100 }, { key: 'bhxh_number', label: 'Sổ BHXH', w: 110 },
  { key: 'education', label: 'Học vấn', w: 100 }, { key: 'work_status', label: 'Trạng thái', w: 120 },
]

const fmtDate = (s: unknown) => {
  if (!s || typeof s !== 'string') return ''
  const d = new Date(s); if (isNaN(d.getTime())) return String(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
const fmtCell = (key: string, v: unknown) => {
  if (v == null || v === '') return ''
  if (key.includes('date') || key === 'dob') return fmtDate(v)
  if (key === 'gross_salary' && typeof v === 'number') return v.toLocaleString('vi-VN')
  return String(v)
}
const CODE_W = 96, NAME_W = 150

export function DataNhanSuPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [joinYears, setJoinYears] = useState<number[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [enums, setEnums] = useState<Record<string, string[]>>({})
  const [detailId, setDetailId] = useState<number | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [deptId, setDeptId] = useState('')
  const [joinYear, setJoinYear] = useState('')
  const [workStatus, setWorkStatus] = useState<'active' | 'inactive' | 'all'>('active')  // mặc định Đang làm việc

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(1) }, [q, companyId, deptId, joinYear, workStatus])

  useEffect(() => {
    api.get<{ enums: Enum[] }>('/api/employee/hr-categories/')
      .then(d => setEnums(Object.fromEntries(d.enums.map(e => [e.key, e.values]))))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), page_size: '50' })
      if (q) p.set('q', q)
      if (companyId) p.set('company_id', companyId)
      if (deptId) p.set('department_id', deptId)
      if (joinYear) p.set('join_year', joinYear)
      if (workStatus === 'active') p.set('active', '1')
      else if (workStatus === 'inactive') p.set('active', '0')
      const d = await api.get<ListResp>(`/api/employee/hr-master/?${p}`)
      setRows(d.results); setCount(d.count); setCompanies(d.companies)
      setDepartments(d.departments); setJoinYears(d.join_years); setCanEdit(d.can_edit)
    } catch { setRows([]) } finally { setLoading(false) }
  }, [page, q, companyId, deptId, joinYear, workStatus])
  useEffect(() => { load() }, [load])

  const deptOptions = useMemo(
    () => departments.filter(d => !companyId || (d.company_ids ?? []).includes(Number(companyId))),
    [departments, companyId])

  async function handleExport() {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (q) p.set('q', q); if (companyId) p.set('company_id', companyId)
      if (deptId) p.set('department_id', deptId); if (joinYear) p.set('join_year', joinYear)
      if (workStatus === 'active') p.set('active', '1')
      else if (workStatus === 'inactive') p.set('active', '0')
      const resp = await fetch(`/bff/api/employee/hr-master/export/?${p}`, { credentials: 'include' })
      if (!resp.ok) throw new Error()
      const blob = await resp.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = 'MasterData_NhanSu.xlsx'; a.click(); URL.revokeObjectURL(a.href)
    } catch { alert('Không thể xuất file') } finally { setExporting(false) }
  }

  const totalPages = Math.max(1, Math.ceil(count / 50))
  const selStyle: React.CSSProperties = { flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 12.5, background: '#fff', color: HNH.ink }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', overflow: 'hidden' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Data Nhân sự"
        sub={`${count} NHÂN SỰ`}
        trailing={
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center border-none cursor-pointer"
            style={{ height: 38, borderRadius: 12, padding: '0 14px', gap: 6, background: HNH.success, color: '#fff', fontWeight: 800, fontSize: 13, opacity: exporting ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            <Icon name="download" size={16} color="#fff" stroke={2.2} />{exporting ? 'Đang xuất…' : 'Excel'}
          </button>
        }
      />

      {/* Filters */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${HNH.line}`, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm Họ tên / Mã NV / Mã Kế toán…"
            style={{ width: '100%', padding: '9px 34px 9px 12px', borderRadius: 12, border: `1px solid ${HNH.line}`, fontSize: 13.5, color: HNH.ink, boxSizing: 'border-box', outline: 'none' }} />
          {search && <button onClick={() => setSearch('')} className="border-none bg-transparent cursor-pointer" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: HNH.ink3, fontSize: 16, padding: 4 }}>×</button>}
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <select value={companyId} onChange={e => { setCompanyId(e.target.value); setDeptId('') }} style={selStyle}>
            <option value="">Tất cả công ty</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={deptId} onChange={e => setDeptId(e.target.value)} style={selStyle}>
            <option value="">Tất cả phòng ban</option>
            {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={joinYear} onChange={e => setJoinYear(e.target.value)} style={selStyle}>
            <option value="">Mọi năm vào</option>
            {joinYears.map(y => <option key={y} value={y}>Vào năm {y}</option>)}
          </select>
          <select value={workStatus} onChange={e => setWorkStatus(e.target.value as 'active' | 'inactive' | 'all')} style={selStyle}>
            <option value="active">Đang làm việc</option>
            <option value="inactive">Đã nghỉ việc</option>
            <option value="all">Tất cả trạng thái</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Không có nhân sự phù hợp</div>
        ) : (
          <div style={{ minWidth: 'max-content' }}>
            {/* Header */}
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, background: HNH.ink, height: 40 }}>
              <div style={{ position: 'sticky', left: 0, zIndex: 3, width: CODE_W, ...hdr(), borderRight: `1px solid rgba(255,255,255,0.15)` }}>Mã NV</div>
              <div style={{ position: 'sticky', left: CODE_W, zIndex: 3, width: NAME_W, ...hdr(), borderRight: `1px solid rgba(255,255,255,0.15)` }}>Họ và tên</div>
              {TABLE_COLS.map(c => <div key={c.key} style={{ width: c.w, ...hdr() }}>{c.label}</div>)}
            </div>
            {/* Rows */}
            {rows.map((r, i) => (
              <div key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer"
                style={{ display: 'flex', height: 42, background: i % 2 ? '#fafafa' : '#fff', borderBottom: `1px solid ${HNH.line}` }}>
                <div style={{ position: 'sticky', left: 0, zIndex: 1, width: CODE_W, ...cell(), fontWeight: 700, color: HNH.navy, background: 'inherit', borderRight: `1px solid ${HNH.line}` }}>{String(r.badge_id || '')}</div>
                <div style={{ position: 'sticky', left: CODE_W, zIndex: 1, width: NAME_W, ...cell(), fontWeight: 600, color: HNH.ink, background: 'inherit', borderRight: `1px solid ${HNH.line}` }}>{String(r.name || '')}</div>
                {TABLE_COLS.map(c => <div key={c.key} style={{ width: c.w, ...cell(), color: HNH.ink2 }}>{fmtCell(c.key, r[c.key])}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3" style={{ padding: '8px', borderTop: `1px solid ${HNH.line}`, flexShrink: 0 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border-none cursor-pointer" style={{ padding: '6px 12px', borderRadius: 8, background: page <= 1 ? HNH.cream2 : HNH.navy, color: page <= 1 ? HNH.ink4 : '#fff', fontWeight: 700, fontSize: 12.5 }}>← Trước</button>
          <span style={{ fontSize: 12.5, color: HNH.ink2, fontWeight: 600 }}>Trang {page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="border-none cursor-pointer" style={{ padding: '6px 12px', borderRadius: 8, background: page >= totalPages ? HNH.cream2 : HNH.navy, color: page >= totalPages ? HNH.ink4 : '#fff', fontWeight: 700, fontSize: 12.5 }}>Sau →</button>
        </div>
      )}

      {detailId != null && (
        <EmployeeDetailModal id={detailId} canEdit={canEdit} enums={enums} companies={companies}
          departments={departments} onClose={() => setDetailId(null)} onSaved={() => { setDetailId(null); load() }} />
      )}
    </div>
  )
}

const hdr = (): React.CSSProperties => ({ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, letterSpacing: 0.2 })
const cell = (): React.CSSProperties => ({ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })

// ── Detail / Edit modal ──
function EmployeeDetailModal({ id, canEdit, enums, companies, departments, onClose, onSaved }: {
  id: number; canEdit: boolean; enums: Record<string, string[]>
  companies: Company[]; departments: Dept[]; onClose: () => void; onSaved: () => void
}) {
  const [data, setData] = useState<Row | null>(null)
  const [edit, setEdit] = useState<Row>({} as Row)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [positions, setPositions] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    api.get<Row>(`/api/employee/hr-master/${id}/`).then(d => { setData(d); setEdit(d) }).catch(() => setErr('Không tải được'))
    api.get<{ positions: { id: number; name: string }[] }>('/api/employee/hr-categories/').then(d => setPositions(d.positions)).catch(() => {})
  }, [id])

  const deptOptions = useMemo(() => departments.filter(d => !edit.company_id || (d.company_ids ?? []).includes(Number(edit.company_id))), [departments, edit.company_id])

  const save = async () => {
    setSaving(true); setErr('')
    try {
      // Chỉ gửi các key có trong GROUPS + FK ids (bỏ field readonly).
      const body: Record<string, unknown> = {}
      for (const g of GROUPS) for (const f of g.fields) {
        if (f.type === 'ro') continue
        body[f.key] = edit[f.key] ?? ''
      }
      for (const k of ['company_id', 'department_id', 'job_position_id', 'badge_id']) body[k] = edit[k] ?? ''
      const out = await api.put<Row>(`/api/employee/hr-master/${id}/`, body)
      setData(out); setEdit(out); setMode('view'); onSaved()
    } catch (e) {
      let m = e instanceof Error ? e.message : 'Lỗi khi lưu'
      try { const j = JSON.parse(m); if (j.detail) m = j.detail } catch { /* keep */ }
      setErr(m)
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, color: HNH.ink, background: '#fff', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }

  const renderField = (f: Field) => {
    const val = edit[f.key]
    const strVal = val == null ? '' : String(val)
    if (mode === 'view' || f.type === 'ro') {
      const disp = f.type === 'company' ? String(data?.company ?? '')
        : f.type === 'department' ? String(data?.department ?? '')
        : f.type === 'position' ? String(data?.job_position ?? '')
        : fmtCell(f.key, data?.[f.key])
      return <div style={{ fontSize: 13, color: disp ? HNH.ink : HNH.ink4, fontWeight: 600, minHeight: 18 }}>{disp || '—'}</div>
    }
    if (f.type === 'company') {
      return <select value={String(edit.company_id ?? '')} onChange={e => setEdit({ ...edit, company_id: e.target.value, department_id: '' })} style={inp}>
        <option value="">—</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    }
    if (f.type === 'department') {
      return <select value={String(edit.department_id ?? '')} onChange={e => setEdit({ ...edit, department_id: e.target.value })} style={inp}>
        <option value="">—</option>{deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
    }
    if (f.type === 'position') {
      return <select value={String(edit.job_position_id ?? '')} onChange={e => setEdit({ ...edit, job_position_id: e.target.value })} style={inp}>
        <option value="">—</option>{positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    }
    if (f.type === 'enum') {
      return <select value={strVal} onChange={e => setEdit({ ...edit, [f.key]: e.target.value })} style={inp}>
        <option value="">—</option>{(enums[f.enumKey || ''] || []).map(v => <option key={v} value={v}>{v}</option>)}</select>
    }
    return <input type={f.type === 'date' ? 'date' : f.type === 'num' ? 'number' : 'text'} value={strVal}
      onChange={e => setEdit({ ...edit, [f.key]: e.target.value })} style={inp} />
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 320, background: 'rgba(0,0,0,0.5)', padding: 12 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: `1px solid ${HNH.line}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(data?.name || '…')}</div>
            <div style={{ fontSize: 11.5, color: HNH.navy, fontWeight: 600 }}>{String(data?.badge_id || '')}{data?.accounting_code ? ` · KT: ${data.accounting_code}` : ''}</div>
          </div>
          <button onClick={onClose} className="border-none cursor-pointer flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}><Icon name="x" size={18} color={HNH.ink} stroke={2} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {err && <div style={{ background: HNH.red50, border: `1px solid ${HNH.red}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: HNH.red, marginBottom: 10, fontWeight: 600 }}>{err}</div>}
          {!data ? <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3 }}>Đang tải…</div> : GROUPS.map(g => (
            <div key={g.title} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: HNH.red, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 7, borderBottom: `1.5px solid ${HNH.red50}`, paddingBottom: 3 }}>{g.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                {g.fields.map(f => (
                  <div key={f.key} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: HNH.ink3, marginBottom: 2, fontWeight: 600 }}>{f.label}</div>
                    {renderField(f)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2" style={{ padding: '10px 16px', borderTop: `1px solid ${HNH.line}` }}>
            {mode === 'view' ? (
              <button onClick={() => setMode('edit')} className="w-full border-none cursor-pointer" style={{ height: 46, borderRadius: 12, background: HNH.navy, color: '#fff', fontWeight: 800, fontSize: 14.5 }}>Chỉnh sửa</button>
            ) : (<>
              <button onClick={() => { setMode('view'); setEdit(data as Row); setErr('') }} disabled={saving} className="flex-1 border-none cursor-pointer" style={{ height: 46, borderRadius: 12, background: HNH.cream2, color: HNH.ink2, fontWeight: 700, fontSize: 14 }}>Hủy</button>
              <button onClick={save} disabled={saving} className="border-none cursor-pointer" style={{ flex: 1.6, height: 46, borderRadius: 12, background: HNH.success, color: '#fff', fontWeight: 800, fontSize: 14.5, opacity: saving ? 0.6 : 1 }}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
            </>)}
          </div>
        )}
      </div>
    </div>
  )
}
