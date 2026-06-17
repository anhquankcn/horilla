import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

interface Opt { id: number; name: string }
interface PosOpt extends Opt { department_id: number | null }
interface RoleOpt extends Opt { job_position_id: number | null }
interface Options {
  companies: Opt[]; departments: Opt[]; job_positions: PosOpt[]; job_roles: RoleOpt[]
  work_types: Opt[]; shifts: Opt[]; groups: Opt[]; default_shift_id: number | null
}

interface Form {
  first_name: string; last_name: string; email: string; badge_id: string; phone: string; gender: string
  company_id: number | null; department_id: number | null; job_position_id: number | null
  job_role_id: number | null; shift_id: number | null; work_type_id: number | null
  group_ids: number[]
}

const EMPTY: Form = {
  first_name: '', last_name: '', email: '', badge_id: '', phone: '', gender: 'male',
  company_id: null, department_id: null, job_position_id: null, job_role_id: null,
  shift_id: null, work_type_id: null, group_ids: [],
}

const STEPS = ['Thông tin', 'Vị trí công việc', 'Nhóm quyền', 'Xác nhận']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink3, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      {children}
    </div>
  )
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${HNH.line}`,
  fontSize: 14, boxSizing: 'border-box', background: '#fff',
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

export function OnboardEmployeePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [opts, setOpts] = useState<Options | null>(null)
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ name: string; badge_id: string; kc: any } | null>(null)

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

  const step1Valid = f.first_name.trim() && f.email.trim() && f.badge_id.trim()

  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const res = await api.post<{ name: string; badge_id: string; keycloak: any }>('/api/employee/onboard/', f)
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
        <div className="flex" style={{ gap: 4, marginBottom: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 4, borderRadius: 2, background: i <= step ? HNH.navy : HNH.line, marginBottom: 4 }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: i === step ? HNH.navy : HNH.ink3 }}>{s}</span>
            </div>
          ))}
        </div>

        {err && <div style={{ padding: 10, borderRadius: 10, background: HNH.red50, color: HNH.red, fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
        {!opts && !err && <div style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 30 }}>Đang tải…</div>}

        {opts && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 16px', border: `1px solid ${HNH.line}` }}>
            {step === 0 && (
              <>
                <Field label="Tên *"><input style={inputStyle} value={f.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Tên" /></Field>
                <Field label="Họ đệm"><input style={inputStyle} value={f.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Họ và tên đệm" /></Field>
                <Field label="Email * (dùng đăng nhập Microsoft)"><input style={inputStyle} type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="ten.abc@hongngocha.com" /></Field>
                <Field label="Mã nhân viên (badge) *"><input style={inputStyle} value={f.badge_id} onChange={e => set('badge_id', e.target.value)} placeholder="Mã NV" /></Field>
                <Field label="Số điện thoại"><input style={inputStyle} value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="SĐT" /></Field>
                <Field label="Giới tính">
                  <Select value={f.gender === 'male' ? 1 : f.gender === 'female' ? 2 : 3} onChange={v => set('gender', v === 1 ? 'male' : v === 2 ? 'female' : 'other')}
                    opts={[{ id: 1, name: 'Nam' }, { id: 2, name: 'Nữ' }, { id: 3, name: 'Khác' }]} placeholder="Chọn" />
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Công ty"><Select value={f.company_id} onChange={v => set('company_id', v)} opts={opts.companies} placeholder="Chọn công ty" /></Field>
                <Field label="Phòng ban"><Select value={f.department_id} onChange={v => { set('department_id', v); set('job_position_id', null); set('job_role_id', null) }} opts={opts.departments} placeholder="Chọn phòng ban" /></Field>
                <Field label="Vị trí công việc"><Select value={f.job_position_id} onChange={v => { set('job_position_id', v); set('job_role_id', null) }} opts={positions} placeholder="Chọn vị trí" /></Field>
                <Field label="Vai trò (→ role Keycloak)"><Select value={f.job_role_id} onChange={v => set('job_role_id', v)} opts={roles} placeholder="Chọn vai trò" /></Field>
                <Field label="Ca làm việc"><Select value={f.shift_id} onChange={v => set('shift_id', v)} opts={opts.shifts} placeholder="Chọn ca" /></Field>
                <Field label="Loại hình"><Select value={f.work_type_id} onChange={v => set('work_type_id', v)} opts={opts.work_types} placeholder="Chọn loại hình" /></Field>
              </>
            )}
            {step === 2 && (
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
            {step === 3 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: HNH.ink, marginBottom: 10 }}>Xác nhận tạo nhân sự</div>
                {[
                  ['Họ tên', `${f.last_name} ${f.first_name}`.trim()],
                  ['Email', f.email],
                  ['Mã NV', f.badge_id],
                  ['Công ty', opts.companies.find(o => o.id === f.company_id)?.name || '—'],
                  ['Phòng ban', opts.departments.find(o => o.id === f.department_id)?.name || '—'],
                  ['Vị trí', opts.job_positions.find(o => o.id === f.job_position_id)?.name || '—'],
                  ['Vai trò', opts.job_roles.find(o => o.id === f.job_role_id)?.name || '—'],
                  ['Ca', opts.shifts.find(o => o.id === f.shift_id)?.name || '—'],
                  ['Nhóm quyền', f.group_ids.map(id => opts.groups.find(g => g.id === id)?.name).filter(Boolean).join(', ') || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}`, fontSize: 13 }}>
                    <span style={{ color: HNH.ink3 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: HNH.ink, textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: HNH.navy50, fontSize: 12, color: HNH.navy, fontWeight: 600 }}>
                  Khi tạo: lập hồ sơ NV + gán vị trí/vai trò/ca + nhóm quyền + tạo tài khoản Keycloak (đăng nhập Microsoft).
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
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !step1Valid}
              style={{ flex: 2, padding: 13, borderRadius: 12, border: 'none', background: (step === 0 && !step1Valid) ? HNH.ink4 : HNH.navy, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Tiếp tục</button>
          ) : (
            <button onClick={submit} disabled={busy}
              style={{ flex: 2, padding: 13, borderRadius: 12, border: 'none', background: busy ? HNH.ink4 : HNH.success, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{busy ? 'Đang tạo…' : 'Tạo nhân sự + tài khoản'}</button>
          )}
        </div>
      )}
    </div>
  )
}
