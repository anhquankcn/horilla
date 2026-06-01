import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../lib/auth'
import { useTablet } from '../lib/useTablet'

/* ── Helpers ── */
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function yearsFromDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const years = diff / (365.25 * 86400000)
  if (years < 1) {
    const months = Math.floor(years * 12)
    return months <= 0 ? '< 1 tháng' : `${months} tháng`
  }
  return `${years.toFixed(1)} năm`
}

function genderLabel(g: string): string {
  if (g === 'male') return 'Nam'
  if (g === 'female') return 'Nữ'
  if (g === 'other') return 'Khác'
  return g || '—'
}

function maritalLabel(m: string): string {
  if (m === 'single') return 'Độc thân'
  if (m === 'married') return 'Đã kết hôn'
  if (m === 'divorced') return 'Đã ly hôn'
  return m || '—'
}

function fullAddress(e: { address: string; city: string; state: string; country: string; zip: string }): string {
  return [e.address, e.city, e.state, e.country, e.zip].filter(Boolean).join(', ') || '—'
}

/* ── Section components ── */
function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: HNH.ink3,
      letterSpacing: 0.6, padding: '0 6px 6px',
      textTransform: 'uppercase',
    }}>
      {title}
    </div>
  )
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${HNH.line}`, overflow: 'hidden',
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function InfoRow({ icon, label, value, tone, last, onClick }: {
  icon: string
  label: string
  value?: string | null
  tone?: 'ink' | 'red' | 'navy' | 'gold'
  last?: boolean
  onClick?: () => void
}) {
  const t = tone ?? 'ink'
  const iconColor = t === 'red' ? HNH.red : t === 'navy' ? HNH.navy : t === 'gold' ? '#a87908' : HNH.ink2
  const iconBg = t === 'red' ? HNH.red50 : t === 'navy' ? HNH.navy50 : t === 'gold' ? '#faf1d6' : HNH.cream

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex items-center gap-3 w-full text-left ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        padding: '11px 14px',
        borderBottom: last ? 'none' : `1px solid ${HNH.line}`,
        background: 'transparent', border: 'none',
        borderBottomWidth: last ? 0 : 1,
        borderBottomStyle: 'solid',
        borderBottomColor: HNH.line,
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 30, height: 30, borderRadius: 9, background: iconBg }}
      >
        <Icon name={icon} size={14} color={iconColor} stroke={1.9} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3 }}>{label}</div>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: t === 'red' ? HNH.red : HNH.ink,
          marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value || '—'}
        </div>
      </div>
      {onClick && <Icon name="chev-r" size={16} color={HNH.ink4} stroke={2} />}
    </Tag>
  )
}

/* ── Main ── */
export function ProfilePage() {
  const { employee } = useAuth()
  const isTablet = useTablet()
  const px = isTablet ? 28 : 20

  const handleLogout = () => {
    window.location.href = '/bff/auth/logout'
  }

  const e = employee
  const initials = e
    ? `${(e.employee_first_name?.[0] ?? '')}${(e.employee_last_name?.[0] ?? '')}`.toUpperCase()
    : '??'
  const fullName = e?.full_name ?? '—'
  const subtitle = [e?.job_position_name, e?.badge_id].filter(Boolean).join(' · ')

  const tenure = yearsFromDate(e?.date_joining ?? null)

  /* ── Sections ── */
  const personalSection = (
    <>
      <SectionTitle title="Thông tin cá nhân" />
      <InfoCard>
        <InfoRow icon="mail" label="Email" value={e?.email} />
        <InfoRow icon="phone" label="Số điện thoại" value={e?.phone} />
        <InfoRow icon="cal" label="Ngày sinh" value={fmtDate(e?.dob ?? null)} />
        <InfoRow icon="users" label="Giới tính" value={e ? genderLabel(e.gender) : '—'} />
        <InfoRow icon="star" label="Tình trạng hôn nhân" value={e ? maritalLabel(e.marital_status) : '—'} />
        {(e?.children ?? 0) > 0 && (
          <InfoRow icon="users" label="Số con" value={String(e!.children)} />
        )}
        <InfoRow icon="globe" label="Địa chỉ" value={e ? fullAddress(e) : '—'} />
        <InfoRow icon="leaf" label="Trình độ" value={e?.qualification} last />
      </InfoCard>
    </>
  )

  const workSection = (
    <>
      <SectionTitle title="Công việc" />
      <InfoCard>
        <InfoRow icon="briefcase" label="Công ty" value={e?.company_name} tone="navy" />
        <InfoRow icon="folder" label="Phòng ban" value={e?.department_name} />
        <InfoRow icon="shield" label="Vị trí" value={e?.job_position_name} />
        {e?.job_role_name && (
          <InfoRow icon="star" label="Vai trò" value={e.job_role_name} />
        )}
        <InfoRow icon="clock" label="Ca làm việc" value={e?.shift_name} />
        <InfoRow icon="users" label="Quản lý trực tiếp" value={e?.reporting_manager_name} />
        <InfoRow icon="cal" label="Ngày vào làm" value={fmtDate(e?.date_joining ?? null)} />
        {e?.work_level_name && (
          <InfoRow icon="star" label="Cấp bậc" value={e.work_level_name} tone="gold" />
        )}
        <InfoRow icon="check" label="Trạng thái" value={e?.is_active ? 'Đang làm việc' : 'Đã nghỉ'} tone={e?.is_active ? 'navy' : 'red'} last />
      </InfoCard>
    </>
  )

  const emergencySection = (
    <>
      <SectionTitle title="Liên hệ khẩn cấp" />
      <InfoCard>
        <InfoRow icon="users" label="Người liên hệ" value={e?.emergency_contact_name} />
        <InfoRow icon="star" label="Mối quan hệ" value={e?.emergency_contact_relation} />
        <InfoRow icon="phone" label="Số điện thoại" value={e?.emergency_contact} last />
      </InfoCard>
    </>
  )

  const otherSection = (
    <>
      <SectionTitle title="Khác" />
      <InfoCard>
        <InfoRow icon="logout" label="Đăng xuất" value="Thoát tài khoản" tone="red" last onClick={handleLogout} />
      </InfoCard>
    </>
  )

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      {/* Profile header card */}
      <div
        className="relative overflow-hidden"
        style={{
          margin: `6px ${px}px 0`, borderRadius: 24,
          background: `linear-gradient(180deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
          padding: '22px 20px 18px', color: '#fff',
        }}
      >
        <div className="absolute" style={{ right: -40, top: -50, width: 160, height: 160, borderRadius: '50%', background: HNH.red, opacity: 0.2 }} />
        <div className="relative flex items-center gap-3.5">
          <Avatar initials={initials} size={62} bg={HNH.red} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>{fullName}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{subtitle || '—'}</div>
            <div className="flex gap-1.5" style={{ marginTop: 8 }}>
              {e?.work_level_name && <Badge tone="gold" soft={false} size="s">{e.work_level_name}</Badge>}
              {e?.department_name && <Badge tone="red" soft={false} size="s">{e.department_name}</Badge>}
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div
          className="relative flex"
          style={{ marginTop: 18, background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 4px' }}
        >
          {[
            { v: tenure, l: 'thâm niên' },
            { v: e?.badge_id ?? '—', l: 'mã nhân viên' },
            { v: e?.is_active ? 'Active' : 'Inactive', l: 'trạng thái' },
          ].map((s, i) => (
            <div key={i} className="flex-1 text-center" style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 16, fontWeight: 800 }}>{s.v}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: `14px ${px}px 32px` }}>
        {isTablet ? (
          <div className="flex gap-4">
            <div style={{ flex: 1, minWidth: 0 }}>
              {personalSection}
              {emergencySection}
              {otherSection}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {workSection}
            </div>
          </div>
        ) : (
          <>
            {personalSection}
            {workSection}
            {emergencySection}
            {otherSection}
          </>
        )}
      </div>
    </div>
  )
}
