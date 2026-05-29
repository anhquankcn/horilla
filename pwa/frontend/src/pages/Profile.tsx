import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../lib/auth'

function ProfileGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.6, padding: '0 6px 6px' }}>{title}</div>
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function ProfileRow({ icon, label, detail, tone = 'ink', last, onClick }: {
  icon: string; label: string; detail?: string; tone?: 'ink' | 'red' | 'warn'; last?: boolean; onClick?: () => void
}) {
  const iconColor = tone === 'red' ? HNH.red : tone === 'warn' ? HNH.warn : HNH.ink2
  const iconBg = tone === 'red' ? HNH.red50 : tone === 'warn' ? HNH.warn50 : HNH.cream
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full bg-transparent border-none cursor-pointer text-left"
      style={{ padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${HNH.line}` }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, borderRadius: 10, background: iconBg }}
      >
        <Icon name={icon} size={16} color={iconColor} stroke={1.9} />
      </div>
      <div className="flex-1">
        <div style={{ fontSize: 14, fontWeight: 600, color: tone === 'red' ? HNH.red : HNH.ink }}>{label}</div>
        {detail && <div style={{ fontSize: 11.5, color: tone === 'warn' ? HNH.warn : HNH.ink3, marginTop: 1, fontWeight: 500 }}>{detail}</div>}
      </div>
      {tone !== 'red' && <Icon name="chev-r" size={16} color={HNH.ink4} stroke={2} />}
    </button>
  )
}

export function ProfilePage() {
  const { employee } = useAuth()

  const handleLogout = () => {
    window.location.href = '/bff/auth/logout'
  }

  const initials = employee
    ? `${(employee.employee_first_name?.[0] ?? '')}${(employee.employee_last_name?.[0] ?? '')}`.toUpperCase()
    : '??'
  const fullName = employee?.full_name ?? '—'
  const subtitle = [employee?.job_position_name, employee?.badge_id].filter(Boolean).join(' · ')

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      {/* Profile header card */}
      <div
        className="relative overflow-hidden"
        style={{
          margin: '6px 20px 0', borderRadius: 24,
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
              {employee?.work_level_name && <Badge tone="gold" soft={false} size="s">{employee.work_level_name}</Badge>}
              {employee?.department_name && <Badge tone="red" soft={false} size="s">{employee.department_name}</Badge>}
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div
          className="relative flex"
          style={{ marginTop: 18, background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 4px' }}
        >
          {[
            { v: '1.2', l: 'năm gắn bó' },
            { v: '—', l: 'tour đã dẫn' },
            { v: '—', l: 'đánh giá' },
          ].map((s, i) => (
            <div key={i} className="flex-1 text-center" style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800 }}>{s.v}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* List groups */}
      <div style={{ padding: '14px 20px 14px' }}>
        <ProfileGroup title="HỒ SƠ & GIẤY TỜ">
          <ProfileRow icon="doc" label="Thông tin cá nhân" detail="CCCD · BHXH" />
          <ProfileRow icon="shield" label="Thẻ nhân viên" detail="Còn hiệu lực" />
          <ProfileRow icon="globe" label="Ngôn ngữ" detail="VI · EN" />
          <ProfileRow icon="leaf" label="Chuyên môn" detail="CNTT" last />
        </ProfileGroup>

        <ProfileGroup title="CÔNG VIỆC">
          <ProfileRow icon="cal" label="Lịch ca tuần này" />
          <ProfileRow icon="bus" label="Lịch sử tour" detail="—" />
          <ProfileRow icon="money" label="Phiếu lương & thuế" />
          <ProfileRow icon="star" label="Đánh giá hiệu suất" last />
        </ProfileGroup>

        <ProfileGroup title="KHÁC">
          <ProfileRow icon="gear" label="Cài đặt" />
          <ProfileRow icon="phone" label="Liên hệ HR" detail="Ms. Hà · IP 102" />
          <ProfileRow icon="logout" label="Đăng xuất" tone="red" last onClick={handleLogout} />
        </ProfileGroup>
      </div>
    </div>
  )
}
