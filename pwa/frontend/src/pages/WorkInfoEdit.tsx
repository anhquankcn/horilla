import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Option { id: number; name: string }
interface PositionOption extends Option { department_id: number | null }
interface RoleOption extends Option { position_id: number | null }

interface WorkInfoEditData {
  work_info_id: number | null
  employee_name: string
  badge_id: string | null
  current: {
    department_id: number | null
    job_position_id: number | null
    job_role_id: number | null
    shift_id: number | null
    work_type_id: number | null
    employee_type_id: number | null
    company_id: number | null
    reporting_manager_id: number | null
    date_joining: string | null
    contract_end_date: string | null
    location: string
    email: string
    mobile: string
    basic_salary: number
    salary_hour: number
  }
  options: {
    departments: Option[]
    positions: PositionOption[]
    roles: RoleOption[]
    shifts: Option[]
    work_types: Option[]
    employee_types: Option[]
    companies: Option[]
    managers: Option[]
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

// ── Field components ──────────────────────────────────────────────────────────

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, marginBottom: 5, letterSpacing: 0.3 }}>
      {label}{required && <span style={{ color: HNH.red, marginLeft: 2 }}>*</span>}
    </div>
  )
}

function SelectField({
  label, value, onChange, options, placeholder, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <FieldLabel label={label} required={required} />
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', appearance: 'none',
            background: '#fff', border: `1px solid ${HNH.line2}`,
            borderRadius: 10, padding: '10px 36px 10px 12px',
            fontSize: 14, color: value ? HNH.ink : HNH.ink3,
            fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">{placeholder ?? '— Chọn —'}</option>
          {options.map(o => (
            <option key={o.id} value={String(o.id)}>{o.name}</option>
          ))}
        </select>
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <Icon name="chev-d" size={14} color={HNH.ink3} stroke={2} />
        </div>
      </div>
    </div>
  )
}

function InputField({
  label, value, onChange, type = 'text', placeholder, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <FieldLabel label={label} required={required} />
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#fff', border: `1px solid ${HNH.line2}`,
          borderRadius: 10, padding: '10px 12px',
          fontSize: 14, color: HNH.ink,
          fontFamily: 'inherit', outline: 'none',
        }}
      />
    </div>
  )
}

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '14px 0 8px',
      fontSize: 12, fontWeight: 700, color: HNH.navy,
      letterSpacing: 0.5, textTransform: 'uppercase',
      borderBottom: `2px solid ${HNH.navy50}`, marginBottom: 14,
    }}>
      <Icon name={icon} size={14} color={HNH.navy} stroke={2} />
      {title}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function WorkInfoEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<WorkInfoEditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [departmentId, setDepartmentId] = useState('')
  const [jobPositionId, setJobPositionId] = useState('')
  const [jobRoleId, setJobRoleId] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [workTypeId, setWorkTypeId] = useState('')
  const [employeeTypeId, setEmployeeTypeId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [dateJoining, setDateJoining] = useState('')
  const [contractEndDate, setContractEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [workMobile, setWorkMobile] = useState('')
  const [basicSalary, setBasicSalary] = useState('')
  const [salaryHour, setSalaryHour] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const d = await api.get<WorkInfoEditData>(`/api/employee/${id}/work-info-edit/`)
      setData(d)
      const c = d.current
      setDepartmentId(safeStr(c.department_id))
      setJobPositionId(safeStr(c.job_position_id))
      setJobRoleId(safeStr(c.job_role_id))
      setShiftId(safeStr(c.shift_id))
      setWorkTypeId(safeStr(c.work_type_id))
      setEmployeeTypeId(safeStr(c.employee_type_id))
      setCompanyId(safeStr(c.company_id))
      setManagerId(safeStr(c.reporting_manager_id))
      setDateJoining(c.date_joining ?? '')
      setContractEndDate(c.contract_end_date ?? '')
      setLocation(c.location ?? '')
      setWorkEmail(c.email ?? '')
      setWorkMobile(c.mobile ?? '')
      setBasicSalary(c.basic_salary ? String(c.basic_salary) : '')
      setSalaryHour(c.salary_hour ? String(c.salary_hour) : '')
    } catch {
      setError('Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Filter positions by selected department
  const filteredPositions = data
    ? (departmentId
        ? data.options.positions.filter(p => String(p.department_id) === departmentId)
        : data.options.positions)
    : []

  // Filter roles by selected position
  const filteredRoles = data
    ? (jobPositionId
        ? data.options.roles.filter(r => String(r.position_id) === jobPositionId)
        : data.options.roles)
    : []

  const handleDeptChange = (v: string) => {
    setDepartmentId(v)
    setJobPositionId('')
    setJobRoleId('')
  }

  const handlePositionChange = (v: string) => {
    setJobPositionId(v)
    setJobRoleId('')
  }

  const handleSave = async () => {
    if (!data?.work_info_id) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    const payload: Record<string, unknown> = {
      department_id: departmentId ? Number(departmentId) : null,
      job_position_id: jobPositionId ? Number(jobPositionId) : null,
      job_role_id: jobRoleId ? Number(jobRoleId) : null,
      shift_id: shiftId ? Number(shiftId) : null,
      work_type_id: workTypeId ? Number(workTypeId) : null,
      employee_type_id: employeeTypeId ? Number(employeeTypeId) : null,
      company_id: companyId ? Number(companyId) : null,
      reporting_manager_id: managerId ? Number(managerId) : null,
      date_joining: dateJoining || null,
      contract_end_date: contractEndDate || null,
      location: location || null,
      email: workEmail || null,
      mobile: workMobile || null,
      basic_salary: basicSalary ? Number(basicSalary) : 0,
      salary_hour: salaryHour ? Number(salaryHour) : 0,
    }
    try {
      await api.put(`/api/employee/${id}/work-info-edit/`, payload)
      setSuccess(true)
      setTimeout(() => navigate(-1), 800)
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Lưu thất bại'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Cập nhật Work Info" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Cập nhật Work Info" onBack={() => navigate(-1)} />
        <div style={{ textAlign: 'center', padding: 60, color: HNH.ink3 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.red, marginTop: 12 }}>{error ?? 'Không tìm thấy'}</div>
        </div>
      </div>
    )
  }

  const opts = data.options

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Cập nhật Work Info" onBack={() => navigate(-1)} />

      {/* Employee header */}
      <div style={{
        margin: '12px 16px 0',
        background: HNH.navy, borderRadius: 16,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: '#fff',
        }}>
          {data.employee_name.split(' ').map(w => w[0]).slice(-2).join('')}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{data.employee_name}</div>
          {data.badge_id && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{data.badge_id}</div>
          )}
        </div>
      </div>

      {/* Form */}
      <div style={{ padding: '16px 16px 32px' }}>
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, padding: '16px' }}>

          {/* Tổ chức */}
          <SectionHeader title="Tổ chức" icon="briefcase" />
          <SelectField
            label="Công ty"
            value={companyId}
            onChange={setCompanyId}
            options={opts.companies}
          />
          <SelectField
            label="Phòng ban"
            value={departmentId}
            onChange={handleDeptChange}
            options={opts.departments}
          />
          <SelectField
            label="Vị trí công việc"
            value={jobPositionId}
            onChange={handlePositionChange}
            options={filteredPositions}
            placeholder={departmentId ? '— Chọn vị trí —' : '— Chọn phòng ban trước —'}
          />
          <SelectField
            label="Vai trò"
            value={jobRoleId}
            onChange={setJobRoleId}
            options={filteredRoles}
            placeholder={jobPositionId ? '— Chọn vai trò —' : '— Chọn vị trí trước —'}
          />
          <SelectField
            label="Quản lý trực tiếp"
            value={managerId}
            onChange={setManagerId}
            options={opts.managers}
            placeholder="— Không có —"
          />

          {/* Ca làm việc */}
          <SectionHeader title="Chế độ làm việc" icon="clock" />
          <SelectField
            label="Ca làm việc"
            value={shiftId}
            onChange={setShiftId}
            options={opts.shifts}
          />
          <SelectField
            label="Hình thức làm việc"
            value={workTypeId}
            onChange={setWorkTypeId}
            options={opts.work_types}
          />
          <SelectField
            label="Loại nhân viên"
            value={employeeTypeId}
            onChange={setEmployeeTypeId}
            options={opts.employee_types}
          />

          {/* Hợp đồng & Thời gian */}
          <SectionHeader title="Hợp đồng & Thời gian" icon="cal" />
          <InputField
            label="Ngày vào làm"
            value={dateJoining}
            onChange={setDateJoining}
            type="date"
          />
          <InputField
            label="Ngày kết thúc hợp đồng"
            value={contractEndDate}
            onChange={setContractEndDate}
            type="date"
          />

          {/* Liên hệ công việc */}
          <SectionHeader title="Liên hệ công việc" icon="mail" />
          <InputField
            label="Nơi làm việc"
            value={location}
            onChange={setLocation}
            placeholder="Văn phòng, Từ xa..."
          />
          <InputField
            label="Email công việc"
            value={workEmail}
            onChange={setWorkEmail}
            type="email"
            placeholder="email@hongngocha.com"
          />
          <InputField
            label="Điện thoại công việc"
            value={workMobile}
            onChange={setWorkMobile}
            type="tel"
            placeholder="0909 xxx xxx"
          />

          {/* Lương */}
          <SectionHeader title="Lương cơ bản" icon="shield" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FieldLabel label="Lương tháng (VNĐ)" />
              <input
                type="number"
                value={basicSalary}
                onChange={e => setBasicSalary(e.target.value)}
                placeholder="0"
                min={0}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#fff', border: `1px solid ${HNH.line2}`,
                  borderRadius: 10, padding: '10px 12px',
                  fontSize: 14, color: HNH.ink,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
            <div>
              <FieldLabel label="Lương giờ (VNĐ)" />
              <input
                type="number"
                value={salaryHour}
                onChange={e => setSalaryHour(e.target.value)}
                placeholder="0"
                min={0}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#fff', border: `1px solid ${HNH.line2}`,
                  borderRadius: 10, padding: '10px 12px',
                  fontSize: 14, color: HNH.ink,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 12,
            background: HNH.red50, color: HNH.red, fontSize: 13, fontWeight: 600,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 12,
            background: HNH.success50, color: HNH.success, fontSize: 13, fontWeight: 600,
          }}>
            Đã lưu thành công!
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !data.work_info_id}
          style={{
            width: '100%', marginTop: 16,
            background: saving ? HNH.ink3 : HNH.navy,
            color: '#fff', border: 'none', borderRadius: 14,
            padding: '15px', fontSize: 15, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {saving ? (
            <>Đang lưu...</>
          ) : (
            <>
              <Icon name="check" size={16} color="#fff" stroke={2.5} />
              Lưu thay đổi
            </>
          )}
        </button>
      </div>
    </div>
  )
}
