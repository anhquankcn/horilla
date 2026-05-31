import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

interface AppFeature {
  icon: string
  label: string
  desc: string
  path: string | null
  tone: 'navy' | 'red' | 'gold' | 'success'
}

interface AppCard {
  id: string
  title: string
  subtitle: string
  gradient: string
  shadow: string
  icon: string
  features: AppFeature[]
}

const apps: AppCard[] = [
  {
    id: 'hrm',
    title: 'HRM',
    subtitle: 'Quản lý nhân sự',
    gradient: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
    shadow: '0 10px 28px rgba(20,43,111,0.22)',
    icon: 'users',
    features: [
      { icon: 'clock', label: 'Chấm công', desc: 'Check-in, lịch sử, GPS', path: '/attendance', tone: 'navy' },
      { icon: 'shield', label: 'Quản lý Vai trò', desc: 'Phân quyền, nhóm vai trò', path: null, tone: 'navy' },
    ],
  },
  {
    id: 'eoffice',
    title: 'eOffice',
    subtitle: 'Văn phòng điện tử',
    gradient: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
    shadow: '0 10px 28px rgba(192,34,43,0.22)',
    icon: 'doc',
    features: [
      { icon: 'check', label: 'Công việc', desc: 'Tasks, deadline, phân công', path: '/tasks', tone: 'red' },
      { icon: 'folder', label: 'Dự án', desc: 'Quản lý dự án, tiến độ', path: null, tone: 'gold' },
      { icon: 'send', label: 'Đề xuất', desc: 'Tạo & duyệt đề xuất nội bộ', path: null, tone: 'success' },
    ],
  },
]

const toneBg: Record<string, string> = {
  navy: HNH.navy50,
  red: HNH.red50,
  gold: '#faf1d6',
  success: HNH.success50,
}
const toneColor: Record<string, string> = {
  navy: HNH.navy,
  red: HNH.red,
  gold: '#a87908',
  success: HNH.success,
}

function FeatureRow({ f, onTap }: { f: AppFeature; onTap: () => void }) {
  const available = !!f.path
  return (
    <button
      onClick={onTap}
      disabled={!available}
      className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: '14px 16px',
        opacity: available ? 1 : 0.55,
        transition: 'transform 0.12s',
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, borderRadius: 12, background: toneBg[f.tone] }}
      >
        <Icon name={f.icon} size={20} color={toneColor[f.tone]} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{f.label}</span>
          {!available && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: HNH.ink3,
              background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
              letterSpacing: 0.3, textTransform: 'uppercase',
            }}>
              Sắp ra mắt
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{f.desc}</div>
      </div>
      {available && <Icon name="chev-r" size={16} color={HNH.ink3} stroke={1.8} />}
    </button>
  )
}

export function AppsPage() {
  const navigate = useNavigate()

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Ứng dụng" />
      <div style={{ padding: '16px 16px 32px', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {apps.map(app => (
            <div key={app.id}>
              <div
                className="relative overflow-hidden"
                style={{
                  background: app.gradient,
                  borderRadius: 22,
                  padding: '20px 20px 16px',
                  boxShadow: app.shadow,
                  marginBottom: 10,
                }}
              >
                <div
                  className="absolute"
                  style={{
                    right: -40, top: -40, width: 140, height: 140,
                    borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
                  }}
                />
                <div className="relative flex items-center gap-3">
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 48, height: 48, borderRadius: 14,
                      background: 'rgba(255,255,255,0.18)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <Icon name={app.icon} size={24} color="#fff" stroke={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
                      {app.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                      {app.subtitle}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {app.features.map(f => (
                  <FeatureRow
                    key={f.label}
                    f={f}
                    onTap={() => f.path && navigate(f.path)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
