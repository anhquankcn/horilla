import { useState, useEffect, useCallback, useMemo } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

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

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
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
type DetailTab = 'info' | 'work'

function InfoRow({ label, value, icon }: { label: string; value: string | null; icon?: string }) {
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: `1px solid ${HNH.line}` }}>
      {icon && (
        <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 9, background: HNH.cream2, marginTop: 1 }}>
          <Icon name={icon} size={15} color={HNH.ink3} stroke={1.8} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: value ? HNH.ink : HNH.ink4, marginTop: 1, wordBreak: 'break-word' }}>
          {value || '—'}
        </div>
      </div>
    </div>
  )
}

function DetailModal({ emp, onClose, isTablet }: { emp: Emp; onClose: () => void; isTablet: boolean }) {
  const [tab, setTab] = useState<DetailTab>('info')

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'info', label: 'Thông tin' },
    { id: 'work', label: 'Công việc' },
  ]

  return (
    <div
      className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={isTablet ? '' : 'flex-1 overflow-y-auto'}
        style={isTablet
          ? { width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }
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
            <div style={{ width: 36 }} />
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

          {/* Tabs */}
          <div className="flex" style={{ padding: '8px 20px 0', background: HNH.cream }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 border-none cursor-pointer"
                style={{
                  padding: '10px 0', background: 'transparent',
                  borderBottom: tab === t.id ? `2.5px solid ${HNH.navy}` : '2.5px solid transparent',
                  fontSize: 13, fontWeight: tab === t.id ? 700 : 600,
                  color: tab === t.id ? HNH.navy : HNH.ink3,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '8px 20px 32px' }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: '4px 16px', border: `1px solid ${HNH.line}` }}>
              {tab === 'info' && (
                <>
                  <InfoRow icon="doc" label="Họ và Tên" value={fullName(emp)} />
                  <InfoRow icon="doc" label="Badge ID" value={emp.badge_id} />
                  <InfoRow icon="send" label="Email" value={emp.email} />
                  <InfoRow icon="phone" label="Điện thoại" value={emp.phone} />
                  <InfoRow icon="users" label="Giới tính" value={emp.gender === 'male' ? 'Nam' : emp.gender === 'female' ? 'Nữ' : emp.gender || '—'} />
                </>
              )}
              {tab === 'work' && (
                <>
                  <InfoRow icon="home" label="Công ty" value={emp.company} />
                  <InfoRow icon="users" label="Phòng ban" value={emp.department} />
                  <InfoRow icon="star" label="Chức danh" value={emp.job_position} />
                  <InfoRow icon="shield" label="Vai trò" value={emp.job_role} />
                  <InfoRow icon="clock" label="Ca làm việc" value={emp.shift} />
                  <InfoRow icon="doc" label="Hình thức" value={emp.work_type} />
                  <InfoRow icon="flag" label="Loại NV" value={emp.employee_type} />
                  <InfoRow icon="cal" label="Ngày vào làm" value={formatDate(emp.date_joining)} />
                  <InfoRow icon="users" label="Quản lý" value={emp.reporting_manager} />
                </>
              )}
            </div>
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
  const isTablet = useTablet()
  const [employees, setEmployees] = useState<Emp[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<number | null>(null)
  const [selected, setSelected] = useState<Emp | null>(null)
  const [total, setTotal] = useState(0)

  const fetchEmployees = useCallback(async (s: string, dept: number | null) => {
    setLoading(true)
    try {
      let path = '/api/employee/directory/?page_size=50'
      if (s) path += `&search=${encodeURIComponent(s)}`
      if (dept) path += `&department=${dept}`
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
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchEmployees(search, deptFilter), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, deptFilter, fetchEmployees])

  const deptName = useMemo(() => {
    if (!deptFilter) return null
    return depts.find(d => d.id === deptFilter)?.name ?? null
  }, [deptFilter, depts])

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
        {/* Search */}
        <SearchBar value={search} onChange={setSearch} />

        {/* Department filters */}
        {depts.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <DeptChips depts={depts} active={deptFilter} onPick={setDeptFilter} />
          </div>
        )}

        {/* Active filter label */}
        {deptName && (
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
        <DetailModal emp={selected} onClose={() => setSelected(null)} isTablet={isTablet} />
      )}
    </div>
  )
}
