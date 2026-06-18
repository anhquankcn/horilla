import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

interface Opt { id: number; name: string }
interface StrOpt { id: string; name: string }
interface PosOpt extends Opt { department_id: number | null }
interface RoleOpt extends Opt { job_position_id: number | null }
interface Options {
  companies: Opt[]; departments: Opt[]; job_positions: PosOpt[]; job_roles: RoleOpt[]
  work_types: Opt[]; shifts: Opt[]; groups: Opt[]; default_shift_id: number | null
  marital_statuses: StrOpt[]; education_levels: StrOpt[]
}

interface Form {
  // Bắt buộc
  full_name: string; dob: string; gender: string; cccd: string
  email: string; phone: string; badge_id: string; date_joining: string
  company_id: number | null; department_id: number | null; job_position_id: number | null
  job_role_id: number | null; shift_id: number | null; work_type_id: number | null; job_title: string
  // Giấy tờ & hộ khẩu
  cccd_issue_date: string; cccd_issue_place: string; address: string; temporary_address: string
  ethnicity: string; birth_cert_place: string; marital_status: string; qualification: string
  major: string; license_plate: string
  // Ngân hàng & BHXH
  bank_account: string; bank_name: string; bank_branch: string; bhxh_number: string
  bhxh_hospital: string; tax_code: string; unemployment_benefit: boolean
  // Chủ hộ
  household_head_name: string; household_head_dob: string; household_head_cccd: string
  household_head_phone: string; household_address: string; household_relation: string
  group_ids: number[]
}

const EMPTY: Form = {
  full_name: '', dob: '', gender: 'female', cccd: '', email: '', phone: '', badge_id: '', date_joining: '',
  company_id: null, department_id: null, job_position_id: null, job_role_id: null, shift_id: null,
  work_type_id: null, job_title: '',
  cccd_issue_date: '', cccd_issue_place: 'Bộ Công an', address: '', temporary_address: '',
  ethnicity: 'Kinh', birth_cert_place: '', marital_status: 'single', qualification: '', major: '', license_plate: '',
  bank_account: '', bank_name: 'Vietcombank (VCB)', bank_branch: '', bhxh_number: '',
  bhxh_hospital: '', tax_code: '', unemployment_benefit: false,
  household_head_name: '', household_head_dob: '', household_head_cccd: '',
  household_head_phone: '', household_address: '', household_relation: '', group_ids: [],
}

const STEPS = ['Bắt buộc', 'Công việc', 'Giấy tờ & Hộ khẩu', 'Ngân hàng & BHXH', 'Chủ hộ', 'Nhóm quyền', 'Xác nhận']

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink3, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: HNH.ink4, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${HNH.line}`,
  fontSize: 14, boxSizing: 'border-box', background: '#fff',
}

function TextInput({ value, onChange, placeholder, type = 'text', upper = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; upper?: boolean
}) {
  return (
    <input style={inputStyle} type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)} />
  )
}

function Select({ value, onChange, opts, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; opts: Opt[]; placeholder: string
}) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} style={inputStyle}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

function StrSelect({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: StrOpt[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

// Tách "NGUYỄN THỊ LY" → last_name="NGUYỄN THỊ", first_name="LY"
function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: '', last_name: '' }
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return { first_name: parts[parts.length - 1], last_name: parts.slice(0, -1).join(' ') }
}

export function OnboardEmployeePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [opts, setOpts] = useState<Options | null>(null)
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ name: string; badge_id: string; kc: any } | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const onScanFile = async (file: File) => {
    setScanBusy(true); setScanMsg(null)
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = () => rej(new Error('Không đọc được ảnh'))
        r.readAsDataURL(file)
      })
      const r = await api.post<any>('/api/employee/onboard/scan-id/', {
        image_base64: dataUrl, mime_type: file.type || 'image/jpeg',
      })
      setF(p => ({
        ...p,
        full_name: (r.full_name || p.full_name).toUpperCase(),
        dob: r.dob || p.dob,
        gender: r.gender || p.gender,
        cccd: r.cccd || p.cccd,
        cccd_issue_date: r.cccd_issue_date || p.cccd_issue_date,
        cccd_issue_place: r.cccd_issue_place || p.cccd_issue_place,
        address: r.address || p.address,
        birth_cert_place: r.place_of_origin || p.birth_cert_place,
      }))
      const warns: string[] = r.warnings || []
      if (r.document_type && r.document_type !== 'cccd' && r.document_type !== 'cmnd' && r.document_type !== 'passport') {
        setScanMsg({ kind: 'warn', text: 'Ảnh có thể không phải CCCD/CMND — vui lòng kiểm tra kỹ.' })
      } else {
        const conf = r.confidence === 'low' ? ' (độ tin cậy thấp — kiểm tra kỹ)' : r.confidence === 'medium' ? ' (kiểm tra lại)' : ''
        setScanMsg({ kind: r.confidence === 'low' ? 'warn' : 'ok', text: `Đã đọc CCCD${conf}. Vui lòng soát & sửa trước khi lưu.${warns.length ? ' ⚠ ' + warns.join('; ') : ''}` })
      }
    } catch (e) {
      setScanMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Quét CCCD lỗi, thử lại' })
    } finally {
      setScanBusy(false)
      if (fileRef.current) fileRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  useEffect(() => {
    api.get<Options>('/api/employee/onboard/options/')
      .then(o => { setOpts(o); setF(p => ({ ...p, shift_id: o.default_shift_id })) })
      .catch(e => setErr(e instanceof Error ? e.message : 'Lỗi tải dữ liệu'))
  }, [])

  const set = (k: keyof Form, v: any) => setF(p => ({ ...p, [k]: v }))
  const toggleGroup = (id: number) => setF(p => ({
    ...p, group_ids: p.group_ids.includes(id) ? p.group_ids.filter(x => x !== id) : [...p.group_ids, id],
  }))

  const positions = (opts?.job_positions ?? []).filter(p => !f.department_id || p.department_id === f.department_id)
  const roles = (opts?.job_roles ?? []).filter(r => !f.job_position_id || r.job_position_id === f.job_position_id)

  const step0Valid = f.full_name.trim() && f.email.trim() && f.badge_id.trim()

  const missingRequired = (): string[] => {
    const m: string[] = []
    if (!f.full_name.trim()) m.push('Họ tên đầy đủ')
    if (!f.email.trim()) m.push('Email')
    if (!f.badge_id.trim()) m.push('Mã NV')
    if (!f.phone.trim()) m.push('Số điện thoại')
    if (!f.dob) m.push('Ngày sinh')
    if (!f.cccd.trim()) m.push('Số CCCD')
    if (!f.date_joining) m.push('Ngày vào làm')
    if (!f.company_id) m.push('Văn phòng làm việc')
    if (!f.department_id) m.push('Phòng ban')
    if (!f.job_position_id) m.push('Vị trí công việc')
    return m
  }

  const submit = async () => {
    const miss = missingRequired()
    if (miss.length) { setErr('Thiếu thông tin bắt buộc: ' + miss.join(', ')); return }
    setBusy(true); setErr('')
    const { first_name, last_name } = splitName(f.full_name)
    const payload = { ...f, first_name, last_name }
    try {
      const res = await api.post<{ name: string; badge_id: string; keycloak: any }>('/api/employee/onboard/', payload)
      setDone({ name: res.name, badge_id: res.badge_id, kc: res.keycloak })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi tạo nhân sự'); setBusy(false)
    }
  }

  if (done) {
    const kcOk = done.kc?.ok
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Onboarding" onBack={() => navigate('/apps')} />
        <div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginTop: 24 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, marginTop: 8 }}>Đã tạo {done.name}</div>
          <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 4 }}>Mã NV: <b>{done.badge_id}</b></div>
          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 12, display: 'inline-block',
            background: kcOk ? '#dcfce7' : '#fff1f2', color: kcOk ? '#15803d' : '#be123c', fontSize: 13, fontWeight: 600,
          }}>
            {kcOk ? `✓ Tài khoản Keycloak đã ${done.kc.action === 'created' ? 'tạo' : 'cập nhật'} (${done.kc.kc_username})` : `⚠ Keycloak: ${done.kc?.error || 'chưa tạo'}`}
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: HNH.ink3 }}>Đăng nhập bằng tài khoản Microsoft @hongngocha.com</div>
          <div className="flex gap-2" style={{ marginTop: 24, justifyContent: 'center' }}>
            <button onClick={() => { setDone(null); setF({ ...EMPTY, shift_id: opts?.default_shift_id ?? null }); setStep(0) }}
              style={{ padding: '11px 18px', borderRadius: 12, border: `1px solid ${HNH.line}`, background: '#fff', fontWeight: 700, color: HNH.ink2, cursor: 'pointer' }}>+ Thêm NV khác</button>
            <button onClick={() => navigate('/employees')}
              style={{ padding: '11px 18px', borderRadius: 12, border: 'none', background: HNH.navy, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Xem danh sách</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Onboarding nhân sự" sub="C&B tạo nhân viên mới" onBack={() => navigate('/apps')} />
      <div style={{ padding: '12px 16px 110px' }}>
        {/* Steps */}
        <div className="flex" style={{ gap: 3, marginBottom: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 4, borderRadius: 2, background: i <= step ? HNH.navy : HNH.line, marginBottom: 4 }} />
              <span style={{ fontSize: 8.5, fontWeight: 700, color: i === step ? HNH.navy : HNH.ink3 }}>{s}</span>
            </div>
          ))}
        </div>

        {err && <div style={{ padding: 10, borderRadius: 10, background: HNH.red50, color: HNH.red, fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
        {!opts && !err && <div style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 30 }}>Đang tải…</div>}

        {opts && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 16px', border: `1px solid ${HNH.line}` }}>
            {step === 0 && (
              <>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const file = e.target.files?.[0]; if (file) onScanFile(file) }} />
                <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const file = e.target.files?.[0]; if (file) onScanFile(file) }} />
                <div style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>Quét CCCD tự điền</div>
                <div className="flex gap-2" style={{ marginBottom: scanMsg ? 8 : 12 }}>
                  <button onClick={() => fileRef.current?.click()} disabled={scanBusy}
                    className="flex items-center justify-center gap-2"
                    style={{ flex: 1, padding: 11, borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 12.5,
                      border: `1.5px dashed ${HNH.navy}`, background: HNH.navy50, color: HNH.navy }}>
                    <Icon name="camera" size={16} color={HNH.navy} />
                    {scanBusy ? 'Đang đọc…' : 'Chụp CCCD'}
                  </button>
                  <button onClick={() => galleryRef.current?.click()} disabled={scanBusy}
                    className="flex items-center justify-center gap-2"
                    style={{ flex: 1, padding: 11, borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 12.5,
                      border: `1.5px dashed ${HNH.navy}`, background: HNH.navy50, color: HNH.navy }}>
                    <Icon name="upload" size={16} color={HNH.navy} />
                    {scanBusy ? 'Đang đọc…' : 'Tải ảnh từ máy'}
                  </button>
                </div>
                {scanMsg && (
                  <div style={{ padding: '9px 11px', borderRadius: 10, marginBottom: 12, fontSize: 12, fontWeight: 600,
                    background: scanMsg.kind === 'ok' ? '#dcfce7' : scanMsg.kind === 'warn' ? '#fff3cd' : HNH.red50,
                    color: scanMsg.kind === 'ok' ? '#15803d' : scanMsg.kind === 'warn' ? '#92660a' : HNH.red }}>
                    {scanMsg.text}
                  </div>
                )}
                <Field label="Họ tên đầy đủ * (VIẾT HOA)" hint="VD: NGUYỄN VĂN A — hệ thống tự tách Họ đệm / Tên">
                  <TextInput value={f.full_name} onChange={v => set('full_name', v)} placeholder="NGUYỄN VĂN A" upper />
                </Field>
                <Field label="Email * (đăng nhập Microsoft)">
                  <TextInput type="email" value={f.email} onChange={v => set('email', v)} placeholder="ten.abc@hongngocha.com" />
                </Field>
                <Field label="Mã nhân viên (badge) *">
                  <TextInput value={f.badge_id} onChange={v => set('badge_id', v)} placeholder="VD: HNH00xxx" />
                </Field>
                <Field label="Số điện thoại *">
                  <TextInput type="tel" value={f.phone} onChange={v => set('phone', v)} placeholder="SĐT" />
                </Field>
                <Field label="Ngày sinh *">
                  <TextInput type="date" value={f.dob} onChange={v => set('dob', v)} />
                </Field>
                <Field label="Giới tính">
                  <Select value={f.gender === 'male' ? 1 : f.gender === 'female' ? 2 : 3} onChange={v => set('gender', v === 1 ? 'male' : v === 2 ? 'female' : 'other')}
                    opts={[{ id: 1, name: 'Nam' }, { id: 2, name: 'Nữ' }, { id: 3, name: 'Khác' }]} placeholder="Chọn" />
                </Field>
                <Field label="Số CCCD/CMND *">
                  <TextInput value={f.cccd} onChange={v => set('cccd', v)} placeholder="VD: 079..." />
                </Field>
                <Field label="Ngày vào làm *">
                  <TextInput type="date" value={f.date_joining} onChange={v => set('date_joining', v)} />
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Văn phòng làm việc *"><Select value={f.company_id} onChange={v => set('company_id', v)} opts={opts.companies} placeholder="Chọn văn phòng" /></Field>
                <Field label="Phòng ban / Bộ phận *"><Select value={f.department_id} onChange={v => { set('department_id', v); set('job_position_id', null); set('job_role_id', null) }} opts={opts.departments} placeholder="Chọn phòng ban" /></Field>
                <Field label="Vị trí công việc *"><Select value={f.job_position_id} onChange={v => { set('job_position_id', v); set('job_role_id', null) }} opts={positions} placeholder="Chọn vị trí" /></Field>
                <Field label="Vai trò (→ role Keycloak)"><Select value={f.job_role_id} onChange={v => set('job_role_id', v)} opts={roles} placeholder="Chọn vai trò" /></Field>
                <Field label="Chức danh công việc" hint="VD: Nhân viên Booker (team Vé Đoàn)"><TextInput value={f.job_title} onChange={v => set('job_title', v)} placeholder="Chức danh cụ thể" /></Field>
                <Field label="Ca làm việc"><Select value={f.shift_id} onChange={v => set('shift_id', v)} opts={opts.shifts} placeholder="Chọn ca" /></Field>
                <Field label="Loại hình"><Select value={f.work_type_id} onChange={v => set('work_type_id', v)} opts={opts.work_types} placeholder="Chọn loại hình" /></Field>
              </>
            )}
            {step === 2 && (
              <>
                <Field label="Ngày cấp CCCD"><TextInput type="date" value={f.cccd_issue_date} onChange={v => set('cccd_issue_date', v)} /></Field>
                <Field label="Nơi cấp"><TextInput value={f.cccd_issue_place} onChange={v => set('cccd_issue_place', v)} placeholder="VD: Bộ Công an" /></Field>
                <Field label="Địa chỉ thường trú (theo CCCD)" hint="Nhập địa chỉ mới sau sáp nhập"><TextInput value={f.address} onChange={v => set('address', v)} placeholder="Số nhà, phường/xã, tỉnh/TP" /></Field>
                <Field label="Địa chỉ tạm trú / liên hệ"><TextInput value={f.temporary_address} onChange={v => set('temporary_address', v)} placeholder="Địa chỉ hiện tại" /></Field>
                <Field label="Dân tộc"><TextInput value={f.ethnicity} onChange={v => set('ethnicity', v)} placeholder="Kinh" /></Field>
                <Field label="Nơi cấp giấy khai sinh" hint="Tổ/Thôn - Xã/Phường - Quận/Huyện - Tỉnh"><TextInput value={f.birth_cert_place} onChange={v => set('birth_cert_place', v)} /></Field>
                <Field label="Tình trạng hôn nhân"><StrSelect value={f.marital_status} onChange={v => set('marital_status', v)} opts={opts.marital_statuses} /></Field>
                <Field label="Trình độ học vấn">
                  <select value={f.qualification} onChange={e => set('qualification', e.target.value)} style={inputStyle}>
                    <option value="">Chọn trình độ</option>
                    {opts.education_levels.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>
                <Field label="Chuyên ngành học" hint="Từ Trung cấp trở lên; THPT trở xuống ghi 'Không có'"><TextInput value={f.major} onChange={v => set('major', v)} /></Field>
                <Field label="Biển số xe"><TextInput value={f.license_plate} onChange={v => set('license_plate', v)} placeholder="VD: 59C1-30788" /></Field>
              </>
            )}
            {step === 3 && (
              <>
                <Field label="Số tài khoản ngân hàng" hint="Bắt buộc VCB — nếu chưa có ghi TK khác, mở VCB trong 7 ngày"><TextInput value={f.bank_account} onChange={v => set('bank_account', v)} /></Field>
                <Field label="Tên ngân hàng - Chi nhánh"><TextInput value={f.bank_branch} onChange={v => set('bank_branch', v)} placeholder="VD: VCB - CN HCM" /></Field>
                <Field label="Số sổ BHXH"><TextInput value={f.bhxh_number} onChange={v => set('bhxh_number', v)} placeholder="VD: 079..." /></Field>
                <Field label="Nơi đăng ký KCB BHXH"><TextInput value={f.bhxh_hospital} onChange={v => set('bhxh_hospital', v)} placeholder="VD: Bệnh viện Thống Nhất" /></Field>
                <Field label="Mã số thuế cá nhân"><TextInput value={f.tax_code} onChange={v => set('tax_code', v)} /></Field>
                <Field label="Đang hưởng trợ cấp thất nghiệp?">
                  <div className="flex gap-2">
                    {[['Không', false], ['Có', true]].map(([lbl, val]) => (
                      <button key={String(lbl)} onClick={() => set('unemployment_benefit', val)}
                        style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                          border: `1.5px solid ${f.unemployment_benefit === val ? HNH.navy : HNH.line}`,
                          background: f.unemployment_benefit === val ? HNH.navy50 : '#fff', color: HNH.ink }}>{lbl}</button>
                    ))}
                  </div>
                </Field>
              </>
            )}
            {step === 4 && (
              <>
                <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 10 }}>Thông tin chủ hộ trên hộ khẩu thường trú (phục vụ BHXH/thuế).</div>
                <Field label="Họ tên chủ hộ"><TextInput value={f.household_head_name} onChange={v => set('household_head_name', v)} placeholder="VD: Nguyễn Văn B" /></Field>
                <Field label="Ngày sinh chủ hộ"><TextInput type="date" value={f.household_head_dob} onChange={v => set('household_head_dob', v)} /></Field>
                <Field label="Số CCCD/CMND chủ hộ"><TextInput value={f.household_head_cccd} onChange={v => set('household_head_cccd', v)} /></Field>
                <Field label="SĐT chủ hộ"><TextInput type="tel" value={f.household_head_phone} onChange={v => set('household_head_phone', v)} /></Field>
                <Field label="Địa chỉ hộ khẩu thường trú"><TextInput value={f.household_address} onChange={v => set('household_address', v)} placeholder="VD: 04 Nguyễn Tất Thành, P12, Q4, TP.HCM" /></Field>
                <Field label="Quan hệ với chủ hộ"><TextInput value={f.household_relation} onChange={v => set('household_relation', v)} placeholder="VD: Con / Em / Con dâu..." /></Field>
              </>
            )}
            {step === 5 && (
              <>
                <div style={{ fontSize: 12.5, color: HNH.ink3, marginBottom: 10 }}>Chọn nhóm quyền cho nhân viên (có thể chọn nhiều).</div>
                {opts.groups.map(g => {
                  const sel = f.group_ids.includes(g.id)
                  return (
                    <button key={g.id} onClick={() => toggleGroup(g.id)} className="flex items-center gap-2 w-full"
                      style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer', textAlign: 'left',
                        border: `1.5px solid ${sel ? HNH.navy : HNH.line}`, background: sel ? HNH.navy50 : '#fff' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${sel ? HNH.navy : HNH.ink4}`, background: sel ? HNH.navy : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {sel && <Icon name="check" size={12} color="#fff" stroke={3} />}
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink }}>{g.name}</span>
                    </button>
                  )
                })}
                {opts.groups.length === 0 && <div style={{ fontSize: 12.5, color: HNH.ink3 }}>Chưa có nhóm quyền nào.</div>}
              </>
            )}
            {step === 6 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: HNH.ink, marginBottom: 10 }}>Xác nhận tạo nhân sự</div>
                {[
                  ['Họ tên', f.full_name],
                  ['Ngày sinh', f.dob || '—'],
                  ['Email', f.email],
                  ['Mã NV', f.badge_id],
                  ['SĐT', f.phone || '—'],
                  ['Số CCCD', f.cccd || '—'],
                  ['Ngày vào làm', f.date_joining || '—'],
                  ['Văn phòng', opts.companies.find(o => o.id === f.company_id)?.name || '—'],
                  ['Phòng ban', opts.departments.find(o => o.id === f.department_id)?.name || '—'],
                  ['Vị trí', opts.job_positions.find(o => o.id === f.job_position_id)?.name || '—'],
                  ['Chức danh', f.job_title || '—'],
                  ['Vai trò', opts.job_roles.find(o => o.id === f.job_role_id)?.name || '—'],
                  ['Số TK / NH', [f.bank_account, f.bank_branch].filter(Boolean).join(' · ') || '—'],
                  ['Số sổ BHXH', f.bhxh_number || '—'],
                  ['Chủ hộ', f.household_head_name || '—'],
                  ['Nhóm quyền', f.group_ids.map(id => opts.groups.find(g => g.id === id)?.name).filter(Boolean).join(', ') || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}`, fontSize: 13 }}>
                    <span style={{ color: HNH.ink3 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: HNH.ink, textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: HNH.navy50, fontSize: 12, color: HNH.navy, fontWeight: 600 }}>
                  Khi tạo: lập hồ sơ NV đầy đủ + gán vị trí/vai trò/ca + nhóm quyền + tạo tài khoản Keycloak (đăng nhập Microsoft). Thông tin chưa nhập có thể bổ sung sau.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      {opts && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: `1px solid ${HNH.line}`, padding: '10px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom,0px))', display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: 13, borderRadius: 12, border: `1px solid ${HNH.line}`, background: '#fff', fontWeight: 700, color: HNH.ink2, cursor: 'pointer' }}>Quay lại</button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !step0Valid}
              style={{ flex: 2, padding: 13, borderRadius: 12, border: 'none', background: (step === 0 && !step0Valid) ? HNH.ink4 : HNH.navy, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Tiếp tục</button>
          ) : (
            <button onClick={submit} disabled={busy}
              style={{ flex: 2, padding: 13, borderRadius: 12, border: 'none', background: busy ? HNH.ink4 : HNH.success, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{busy ? 'Đang tạo…' : 'Tạo nhân sự + tài khoản'}</button>
          )}
        </div>
      )}
    </div>
  )
}
