import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'
import {
  ProfileData, ProfileTab,
  ProfileTabBar, ProfileTabContent,
} from '../components/employee/ProfileTabs'

/* ── Types ── */
interface Emp {
  id: number
  badge_id: string | null
  first_name: string
  last_name: string
  email: string
  phone: string
  profile: string | null
  gender: string
  department: string | null
  department_id: number | null
  job_position: string | null
  job_role: string | null
  company: string | null
  shift: string | null
  work_type: string | null
  employee_type: string | null
  date_joining: string | null
  reporting_manager: string | null
}

interface Dept { id: number; name: string }
interface Comp { id: number; name: string }
interface Pos { id: number; name: string; department_id: number }
interface RoleOpt { id: number; name: string }

type EmpTab = 'assigned' | 'pending'

interface PageResp { count: number; results: Emp[] }

/* ── Helpers ── */
function initials(e: Emp) {
  const f = e.first_name?.[0] ?? ''
  const l = e.last_name?.[0] ?? ''
  return (f + l).toUpperCase() || '?'
}

function fullName(e: Emp) {
  return `${e.first_name} ${e.last_name}`.trim()
}

const AVATAR_COLORS = [
  HNH.navy, HNH.red, HNH.success, '#7c3aed', '#0891b2', '#c2410c', '#4f46e5', '#0d9488',
]
function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}


/* ── Employee Avatar ── */
function EmpAvatar({ emp, size = 44 }: { emp: Emp; size?: number }) {
  if (emp.profile) {
    return (
      <img
        src={emp.profile}
        alt={fullName(emp)}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size, height: size,
        background: avatarColor(emp.id), color: '#fff',
        fontSize: size * 0.36, fontWeight: 700, letterSpacing: 0.3,
      }}
    >
      {initials(emp)}
    </div>
  )
}

/* ── Employee Card ── */
function EmpCard({ emp, onTap }: { emp: Emp; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="flex items-start gap-3 w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 18, padding: '16px 16px',
        border: `1px solid ${HNH.line}`,
        boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
      }}
    >
      <EmpAvatar emp={emp} size={48} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink }}>{fullName(emp)}</div>
        {emp.badge_id && (
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, marginTop: 1 }}>{emp.badge_id}</div>
        )}
        {emp.job_position && (
          <div style={{ fontSize: 12.5, color: HNH.ink2, fontWeight: 500, marginTop: 3 }}>{emp.job_position}</div>
        )}
        {emp.department && (
          <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: HNH.navy,
              background: HNH.navy50, borderRadius: 6, padding: '2px 8px',
            }}>
              {emp.department}
            </span>
          </div>
        )}
      </div>
      <Icon name="chev-r" size={16} color={HNH.ink3} stroke={1.6} />
    </button>
  )
}

/* ── Detail Modal ── */

function SelectField({ label, value, options, onChange, disabled }: {
  label: string; value: number | null; options: { id: number; name: string }[];
  onChange: (v: number | null) => void; disabled?: boolean
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
        className="w-full border-none outline-none"
        style={{
          padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: disabled ? HNH.cream2 : '#fff', color: HNH.ink,
          border: `1px solid ${HNH.line}`,
        }}
      >
        <option value="">— Chọn —</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  )
}

function AssignPositionPanel({ emp, onDone }: { emp: Emp; onDone: (updated: Partial<Emp>) => void }) {
  const [companies, setCompanies] = useState<Comp[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Pos[]>([])
  const [roles, setRoles] = useState<RoleOpt[]>([])

  const [selCompany, setSelCompany] = useState<number | null>(null)
  const [selDept, setSelDept] = useState<number | null>(null)
  const [selPos, setSelPos] = useState<number | null>(null)
  const [selRole, setSelRole] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Comp[]>('/api/employee/companies/').then(setCompanies).catch(() => {})
    api.get<Dept[]>('/api/employee/departments/').then(setDepts).catch(() => {})
  }, [])

  useEffect(() => {
    if (selDept) {
      api.get<Pos[]>(`/api/employee/positions/?department=${selDept}`).then(setPositions).catch(() => {})
    } else {
      setPositions([])
    }
    setSelPos(null)
    setSelRole(null)
  }, [selDept])

  useEffect(() => {
    if (selPos) {
      api.get<RoleOpt[]>(`/api/employee/roles-for-position/?position=${selPos}`).then(r => {
        setRoles(r)
        if (r.length > 0) setSelRole(r[0].id)
      }).catch(() => {})
    } else {
      setRoles([])
      setSelRole(null)
    }
  }, [selPos])

  const handleAssign = async () => {
    if (!selPos) return
    setSaving(true)
    try {
      const res = await api.post<{ ok: boolean; position: string; role: string | null }>('/api/employee/assign-position/', {
        employee_id: emp.id,
        company_id: selCompany,
        department_id: selDept,
        position_id: selPos,
        role_id: selRole,
      })
      if (res.ok) {
        const dept = depts.find(d => d.id === selDept)
        const company = companies.find(c => c.id === selCompany)
        onDone({
          job_position: res.position,
          job_role: res.role,
          department: dept?.name ?? null,
          department_id: selDept,
          company: company?.name ?? null,
        })
      }
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '12px 0' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <Icon name="briefcase" size={16} color={HNH.navy} stroke={2} />
        <span style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>Giao Vị Trí</span>
      </div>
      <SelectField label="Công ty" value={selCompany} options={companies} onChange={setSelCompany} />
      <SelectField label="Phòng ban" value={selDept} options={depts} onChange={setSelDept} />
      <SelectField label="Vị trí" value={selPos} options={positions} onChange={setSelPos} disabled={!selDept} />
      <SelectField label="Vai trò" value={selRole} options={roles} onChange={setSelRole} disabled={!selPos} />
      <button
        onClick={handleAssign}
        disabled={!selPos || saving}
        className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
        style={{
          padding: '12px', borderRadius: 12, marginTop: 6,
          background: selPos ? HNH.navy : HNH.cream2,
          color: selPos ? '#fff' : HNH.ink3,
          fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1,
        }}
      >
        <Icon name="check" size={16} color={selPos ? '#fff' : HNH.ink3} stroke={2.2} />
        {saving ? 'Đang lưu...' : 'Giao Vị Trí'}
      </button>
    </div>
  )
}

function ChangeRolePanel({ emp, onDone }: { emp: Emp; onDone: (role: string) => void }) {
  const [roles, setRoles] = useState<RoleOpt[]>([])
  const [selRole, setSelRole] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!emp.department_id) return
    api.get<Pos[]>(`/api/employee/positions/?department=${emp.department_id}`).then(positions => {
      const pos = positions.find(p => p.name === emp.job_position)
      if (pos) {
        api.get<RoleOpt[]>(`/api/employee/roles-for-position/?position=${pos.id}`).then(r => {
          setRoles(r)
          const current = r.find(rl => rl.name === emp.job_role)
          if (current) setSelRole(current.id)
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [emp.department_id, emp.job_position, emp.job_role])

  const handleChange = async () => {
    if (!selRole) return
    setSaving(true)
    try {
      const res = await api.post<{ ok: boolean; role: string }>('/api/employee/change-role/', {
        employee_id: emp.id,
        role_id: selRole,
      })
      if (res.ok) onDone(res.role)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  if (roles.length <= 1) return null

  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${HNH.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6 }}>
        Đổi Vai trò
      </div>
      <div className="flex gap-2">
        <select
          value={selRole ?? ''}
          onChange={e => setSelRole(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 border-none outline-none"
          style={{
            padding: '9px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: '#fff', color: HNH.ink, border: `1px solid ${HNH.line}`,
          }}
        >
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button
          onClick={handleChange}
          disabled={saving}
          className="border-none cursor-pointer flex items-center justify-center"
          style={{ padding: '8px 14px', borderRadius: 10, background: HNH.navy, opacity: saving ? 0.6 : 1 }}
        >
          <Icon name="check" size={15} color="#fff" stroke={2.2} />
        </button>
      </div>
    </div>
  )
}

function DetailModal({ emp: initialEmp, onClose, isTablet, onEmpUpdated, onViewProfile }: {
  emp: Emp; onClose: () => void; isTablet: boolean; onEmpUpdated?: (emp: Emp) => void
  onViewProfile?: (id: number) => void
}) {
  const [emp, setEmp] = useState(initialEmp)
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    setProfileLoading(true)
    api.get<ProfileData>(`/api/employee/${emp.id}/profile/`)
      .then(d => setProfileData(d))
      .catch(() => setProfileData(null))
      .finally(() => setProfileLoading(false))
  }, [emp.id])

  const hasPosition = !!emp.job_position

  const handleRevoke = async () => {
    if (!confirm('Thu hồi Vị trí của nhân viên này?')) return
    setRevoking(true)
    try {
      const res = await api.post<{ ok: boolean }>('/api/employee/revoke-position/', { employee_id: emp.id })
      if (res.ok) {
        const updated = { ...emp, job_position: null, job_role: null }
        setEmp(updated)
        onEmpUpdated?.(updated)
      }
    } catch { /* ignore */ } finally { setRevoking(false) }
  }

  const handleAssigned = (partial: Partial<Emp>) => {
    const updated = { ...emp, ...partial }
    setEmp(updated)
    setShowAssign(false)
    onEmpUpdated?.(updated)
  }

  const handleRoleChanged = (role: string) => {
    const updated = { ...emp, job_role: role }
    setEmp(updated)
    onEmpUpdated?.(updated)
  }

  const canEdit = profileData?.can_edit_work_info || !profileData?.is_self || false

  return (
    <div
      className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={isTablet ? '' : 'flex-1 overflow-y-auto'}
        style={isTablet
          ? { width: '100%', maxWidth: 560, maxHeight: '92vh', overflow: 'auto', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }
          : { WebkitOverflowScrolling: 'touch' as never }
        }
      >
        <div style={{ background: HNH.cream, minHeight: isTablet ? undefined : '100%' }}>
          {/* Header */}
          <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}` }}>
            <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
              <Icon name="x" size={18} color={HNH.ink} stroke={2} />
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Hồ sơ nhân viên</div>
            <button
              onClick={() => onViewProfile?.(emp.id)}
              className="flex items-center gap-1 border-none cursor-pointer"
              style={{ background: HNH.navy50, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: HNH.navy }}
            >
              <Icon name="doc" size={12} color={HNH.navy} stroke={2} />
              Trang đầy đủ
            </button>
          </div>

          {/* Profile header */}
          <div className="flex flex-col items-center" style={{ padding: '24px 20px 16px', background: '#fff' }}>
            <EmpAvatar emp={emp} size={72} />
            <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, marginTop: 12, textAlign: 'center' }}>{fullName(emp)}</div>
            {emp.badge_id && <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink3, marginTop: 2 }}>{emp.badge_id}</div>}
            {emp.job_position && <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink2, marginTop: 4 }}>{emp.job_position}</div>}
            <div className="flex gap-2" style={{ marginTop: 10 }}>
              {emp.department && (
                <span style={{ fontSize: 11, fontWeight: 700, color: HNH.navy, background: HNH.navy50, borderRadius: 8, padding: '4px 12px' }}>
                  {emp.department}
                </span>
              )}
              {emp.employee_type && (
                <span style={{ fontSize: 11, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 8, padding: '4px 12px' }}>
                  {emp.employee_type}
                </span>
              )}
            </div>
          </div>

          {/* Quick contact */}
          <div className="flex gap-2" style={{ padding: '12px 20px', background: '#fff', borderBottom: `1px solid ${HNH.line}` }}>
            {emp.phone && (
              <a href={`tel:${emp.phone}`} className="flex items-center gap-2 flex-1 no-underline" style={{
                background: HNH.navy50, borderRadius: 12, padding: '10px 14px',
              }}>
                <Icon name="phone" size={16} color={HNH.navy} stroke={2} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.navy }}>{emp.phone}</span>
              </a>
            )}
            {emp.email && (
              <a href={`mailto:${emp.email}`} className="flex items-center gap-2 flex-1 no-underline" style={{
                background: HNH.red50, borderRadius: 12, padding: '10px 14px',
              }}>
                <Icon name="send" size={16} color={HNH.red} stroke={2} />
                <span className="truncate" style={{ fontSize: 12.5, fontWeight: 700, color: HNH.red }}>{emp.email}</span>
              </a>
            )}
          </div>

          {/* 4 tabs */}
          <ProfileTabBar tab={tab} onTab={setTab} px={20} />

          {/* Tab content */}
          <div style={{ padding: '4px 20px 32px' }}>
            {profileLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
            ) : profileData ? (
              <>
                {/* Tổng quan tab also has work-management actions */}
                {tab === 'overview' && (
                  <>
                    <ProfileTabContent tab="overview" data={profileData} canEdit={canEdit} />
                    {/* Work management actions (assign/revoke position) */}
                    <div style={{
                      background: '#fff', borderRadius: 18,
                      border: `1px solid ${HNH.line}`, padding: '12px 16px',
                      marginTop: 4,
                    }}>
                      {hasPosition && <ChangeRolePanel emp={emp} onDone={handleRoleChanged} />}
                      <div style={{ paddingTop: hasPosition ? 0 : 4 }}>
                        {hasPosition ? (
                          <button
                            onClick={handleRevoke}
                            disabled={revoking}
                            className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
                            style={{
                              padding: '11px', borderRadius: 12,
                              background: '#fef2f2', color: '#dc2626',
                              fontSize: 13, fontWeight: 700, opacity: revoking ? 0.6 : 1,
                              border: '1px solid #fecaca',
                            }}
                          >
                            <Icon name="trash" size={15} color="#dc2626" stroke={2} />
                            {revoking ? 'Đang thu hồi...' : 'Thu hồi Vị trí'}
                          </button>
                        ) : !showAssign ? (
                          <button
                            onClick={() => setShowAssign(true)}
                            className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
                            style={{
                              padding: '11px', borderRadius: 12,
                              background: HNH.navy, color: '#fff',
                              fontSize: 13, fontWeight: 700,
                            }}
                          >
                            <Icon name="briefcase" size={15} color="#fff" stroke={2} />
                            Giao Vị Trí
                          </button>
                        ) : null}
                      </div>
                      {!hasPosition && showAssign && (
                        <AssignPositionPanel emp={emp} onDone={handleAssigned} />
                      )}
                    </div>
                  </>
                )}
                {tab !== 'overview' && (
                  <ProfileTabContent tab={tab} data={profileData} canEdit={canEdit} />
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
                Không tải được dữ liệu
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Search bar ── */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2" style={{
      background: '#fff', borderRadius: 14, padding: '8px 14px',
      border: `1px solid ${HNH.line}`,
    }}>
      <Icon name="search" size={18} color={HNH.ink3} stroke={1.8} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Tìm theo tên, mã NV, SĐT..."
        className="flex-1 border-none outline-none bg-transparent"
        style={{ fontSize: 13.5, fontWeight: 500, color: HNH.ink }}
      />
      {value && (
        <button onClick={() => onChange('')} className="border-none cursor-pointer bg-transparent p-0">
          <Icon name="x" size={16} color={HNH.ink3} stroke={2} />
        </button>
      )}
    </div>
  )
}

/* ── Department filter ── */
function DeptChips({ depts, active, onPick }: { depts: Dept[]; active: number | null; onPick: (id: number | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto" style={{ padding: '2px 0', scrollbarWidth: 'none' }}>
      <button
        onClick={() => onPick(null)}
        className="shrink-0 border-none cursor-pointer"
        style={{
          padding: '6px 14px', borderRadius: 10,
          background: active === null ? HNH.navy : '#fff',
          color: active === null ? '#fff' : HNH.ink2,
          fontSize: 12, fontWeight: 700,
          border: `1px solid ${active === null ? HNH.navy : HNH.line}`,
        }}
      >
        Tất cả
      </button>
      {depts.map(d => (
        <button
          key={d.id}
          onClick={() => onPick(d.id === active ? null : d.id)}
          className="shrink-0 border-none cursor-pointer whitespace-nowrap"
          style={{
            padding: '6px 14px', borderRadius: 10,
            background: d.id === active ? HNH.navy : '#fff',
            color: d.id === active ? '#fff' : HNH.ink2,
            fontSize: 12, fontWeight: 700,
            border: `1px solid ${d.id === active ? HNH.navy : HNH.line}`,
          }}
        >
          {d.name}
        </button>
      ))}
    </div>
  )
}

/* ── Main page ── */
export function EmployeesPage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [employees, setEmployees] = useState<Emp[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [companies, setCompanies] = useState<Comp[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<number | null>(null)
  const [companyFilter, setCompanyFilter] = useState<number | null>(null)
  const [tab, setTab] = useState<EmpTab>('assigned')
  const [selected, setSelected] = useState<Emp | null>(null)
  const [total, setTotal] = useState(0)

  const fetchEmployees = useCallback(async (s: string, dept: number | null, company: number | null, status: EmpTab) => {
    setLoading(true)
    try {
      let path = '/api/employee/directory/?page_size=50'
      if (s) path += `&search=${encodeURIComponent(s)}`
      if (dept) path += `&department=${dept}`
      if (company) path += `&company=${company}`
      path += `&status=${status}`
      const data = await api.get<PageResp>(path)
      setEmployees(data.results)
      setTotal(data.count)
    } catch {
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api.get<Dept[]>('/api/employee/departments/').then(setDepts).catch(() => {})
    api.get<Comp[]>('/api/employee/companies/').then(setCompanies).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchEmployees(search, deptFilter, companyFilter, tab), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, deptFilter, companyFilter, tab, fetchEmployees])

  const deptName = useMemo(() => {
    if (!deptFilter) return null
    return depts.find(d => d.id === deptFilter)?.name ?? null
  }, [deptFilter, depts])

  const handleEmpUpdated = useCallback((updated: Emp) => {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e))
    setSelected(updated)
  }, [])

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Nhân sự"
        trailing={
          <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, background: HNH.cream2, borderRadius: 8, padding: '4px 10px' }}>
            {total} người
          </div>
        }
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 900, margin: '0 auto' }}>
        {/* Tabs: Assigned / Pending */}
        <div className="flex" style={{ background: '#fff', borderRadius: 12, padding: 3, border: `1px solid ${HNH.line}`, marginBottom: 10 }}>
          {([
            { id: 'assigned' as EmpTab, label: 'Phòng ban', icon: 'users' },
            { id: 'pending' as EmpTab, label: 'Chờ / Tạm nghỉ', icon: 'clock' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDeptFilter(null); setCompanyFilter(null) }}
              className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
              style={{
                padding: '9px 0', borderRadius: 10,
                background: tab === t.id ? HNH.navy : 'transparent',
                color: tab === t.id ? '#fff' : HNH.ink3,
                fontSize: 12.5, fontWeight: 700,
              }}
            >
              <Icon name={t.icon} size={14} color={tab === t.id ? '#fff' : HNH.ink3} stroke={2} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Search + filters — tablet: single toolbar row; mobile: stacked chips */}
        {isTablet ? (
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <SearchBar value={search} onChange={setSearch} />
            </div>
            {tab === 'assigned' && companies.length > 1 && (
              <select
                value={companyFilter ?? ''}
                onChange={e => setCompanyFilter(e.target.value ? Number(e.target.value) : null)}
                style={{
                  padding: '9px 32px 9px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${companyFilter !== null ? HNH.red : HNH.line}`,
                  background: companyFilter !== null ? HNH.red50 : '#fff',
                  color: companyFilter !== null ? HNH.red : HNH.ink2,
                  fontSize: 13, fontWeight: 600,
                  appearance: 'none', WebkitAppearance: 'none',
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a8fa6'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
                  minWidth: 140,
                }}
              >
                <option value="">Tất cả Cty</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {tab === 'assigned' && depts.length > 0 && (
              <select
                value={deptFilter ?? ''}
                onChange={e => setDeptFilter(e.target.value ? Number(e.target.value) : null)}
                style={{
                  padding: '9px 32px 9px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${deptFilter !== null ? HNH.navy : HNH.line}`,
                  background: deptFilter !== null ? HNH.navy50 : '#fff',
                  color: deptFilter !== null ? HNH.navy : HNH.ink2,
                  fontSize: 13, fontWeight: 600,
                  appearance: 'none', WebkitAppearance: 'none',
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a8fa6'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
                  minWidth: 160,
                }}
              >
                <option value="">Tất cả Phòng ban</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>
        ) : (
          <>
            <SearchBar value={search} onChange={setSearch} />

            {/* Company chips */}
            {tab === 'assigned' && companies.length > 1 && (
              <div className="flex gap-2 overflow-x-auto" style={{ marginTop: 10, padding: '2px 0', scrollbarWidth: 'none' }}>
                <button
                  onClick={() => setCompanyFilter(null)}
                  className="shrink-0 border-none cursor-pointer whitespace-nowrap"
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: companyFilter === null ? HNH.red : '#fff',
                    color: companyFilter === null ? '#fff' : HNH.ink2,
                    fontSize: 11, fontWeight: 700,
                    border: `1px solid ${companyFilter === null ? HNH.red : HNH.line}`,
                  }}
                >Tất cả Cty</button>
                {companies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCompanyFilter(c.id === companyFilter ? null : c.id)}
                    className="shrink-0 border-none cursor-pointer whitespace-nowrap"
                    style={{
                      padding: '5px 12px', borderRadius: 8,
                      background: c.id === companyFilter ? HNH.red : '#fff',
                      color: c.id === companyFilter ? '#fff' : HNH.ink2,
                      fontSize: 11, fontWeight: 700,
                      border: `1px solid ${c.id === companyFilter ? HNH.red : HNH.line}`,
                    }}
                  >{c.name}</button>
                ))}
              </div>
            )}

            {/* Department chips */}
            {tab === 'assigned' && depts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <DeptChips depts={depts} active={deptFilter} onPick={setDeptFilter} />
              </div>
            )}
          </>
        )}

        {/* Active filter label (mobile only — tablet shows via select highlight) */}
        {!isTablet && tab === 'assigned' && deptName && (
          <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2 }}>Phòng ban:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: HNH.navy, background: HNH.navy50, borderRadius: 6, padding: '2px 8px' }}>
              {deptName}
            </span>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Không tìm thấy nhân viên
          </div>
        ) : (
          <div
            className={isTablet ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2.5'}
            style={{ marginTop: 14 }}
          >
            {employees.map(emp => (
              <EmpCard key={emp.id} emp={emp} onTap={() => setSelected(emp)} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <DetailModal
          emp={selected}
          onClose={() => setSelected(null)}
          isTablet={isTablet}
          onEmpUpdated={handleEmpUpdated}
          onViewProfile={(id) => { setSelected(null); navigate(`/employees/${id}`) }}
        />
      )}
    </div>
  )
}
