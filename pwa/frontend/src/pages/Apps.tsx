import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

type FeatureGroup = 'use' | 'manage'

interface AppFeature {
  slug: string
  icon: string
  label: string
  desc: string
  path: string | null
  tone: 'navy' | 'red' | 'gold' | 'success'
  group: FeatureGroup
}

interface AppCard {
  id: string
  title: string
  subtitle: string
  gradient: string
  shadow: string
  accentBg: string
  icon: string
  features: AppFeature[]
}

const GROUP_LABELS: Record<FeatureGroup, { label: string; icon: string }> = {
  use: { label: 'Sử dụng', icon: 'star' },
  manage: { label: 'Quản lý', icon: 'gear' },
}

const apps: AppCard[] = [
  {
    id: 'hrm',
    title: 'HRM',
    subtitle: 'Quản lý nhân sự',
    gradient: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
    shadow: '0 10px 28px rgba(20,43,111,0.22)',
    accentBg: HNH.navy50,
    icon: 'users',
    features: [
      { slug: 'attendance', icon: 'clock', label: 'Chấm công', desc: 'Check-in, lịch sử, GPS', path: '/attendance', tone: 'navy', group: 'use' },
      { slug: 'work-schedule', icon: 'cal', label: 'Lịch làm việc', desc: 'Ca làm, giờ vào ra theo tuần', path: '/work-schedule', tone: 'navy', group: 'use' },
      { slug: 'monthly-attendance', icon: 'cal', label: 'Tính Công Tháng', desc: 'Lịch công HR xác nhận, trạng thái ngày công', path: '/attendance/monthly', tone: 'navy', group: 'use' },
      { slug: 'leave', icon: 'leaf', label: 'Nghỉ phép', desc: 'Số dư, lịch sử nghỉ phép, gửi đơn', path: '/leave', tone: 'success', group: 'use' },
      { slug: 'proposals', icon: 'send', label: 'Đề xuất', desc: 'Nghỉ phép, đổi ca, ngày công', path: '/proposals', tone: 'success', group: 'use' },
      { slug: 'approvals', icon: 'check', label: 'Phê duyệt', desc: 'Duyệt đề xuất nhân viên', path: '/approvals', tone: 'gold', group: 'use' },
      { slug: 'payslip', icon: 'doc', label: 'Phiếu lương', desc: 'Xem chi tiết lương hàng tháng', path: '/payslip', tone: 'navy', group: 'use' },
      { slug: 'notifications', icon: 'bell', label: 'Thông báo', desc: 'Xem thông báo hệ thống', path: '/notifications', tone: 'navy', group: 'use' },
      { slug: 'helpdesk', icon: 'help', label: 'Hỗ trợ IT', desc: 'Gửi yêu cầu hỗ trợ, theo dõi tiến độ', path: '/helpdesk', tone: 'navy', group: 'use' },
      { slug: 'employees', icon: 'users', label: 'Nhân sự', desc: 'Danh sách, hồ sơ nhân viên', path: '/employees', tone: 'navy', group: 'manage' },
      { slug: 'helpdesk', icon: 'help', label: 'YC Hỗ trợ', desc: 'Xem và xử lý tất cả yêu cầu hỗ trợ', path: '/helpdesk?tab=all', tone: 'red', group: 'manage' },
      { slug: 'roles', icon: 'shield', label: 'Vai trò & Quyền', desc: 'Phân quyền, nhóm vai trò', path: '/roles', tone: 'navy', group: 'manage' },
      { slug: 'groups', icon: 'folder', label: 'Nhóm Quyền', desc: 'Quản lý nhóm, phân nhân sự', path: '/groups', tone: 'navy', group: 'manage' },
      { slug: 'attendance-activity', icon: 'clock', label: 'HĐ Chấm công', desc: 'Tổng hợp hoạt động chấm công', path: '/attendance-activity', tone: 'navy', group: 'manage' },
      { slug: 'announcement-hub', icon: 'send', label: 'Hub Thông Báo', desc: 'Tạo & quản lý thông báo nội bộ', path: '/announcement-hub', tone: 'red', group: 'manage' },
      { slug: 'dashboard', icon: 'grid', label: 'Dashboard', desc: 'Tổng quan công ty, nhân sự, chấm công', path: '/dashboard', tone: 'navy', group: 'manage' },
      { slug: 'dashboard', icon: 'clock', label: 'Dashboard CC', desc: 'Nghỉ phép, đi muộn, xu hướng theo tháng', path: '/attendance-dashboard', tone: 'red', group: 'manage' },
      { slug: 'monthly-att', icon: 'grid', label: 'CC Tháng', desc: 'Bảng chấm công từng ngày cho toàn bộ nhân viên', path: '/attendance-monthly-detail', tone: 'navy', group: 'manage' },
      { slug: 'shift-management', icon: 'clock', label: 'Quản lý Ca', desc: 'Phân ca nhân viên, cấu hình ca theo phòng ban', path: '/shift-management', tone: 'red', group: 'manage' },
      { slug: 'leave-management', icon: 'leaf', label: 'Quản lý Phép', desc: 'Phép bù, thâm niên, duyệt đề xuất', path: '/leave-management', tone: 'success', group: 'manage' },
      { slug: 'assets', icon: 'doc', label: 'Tài sản', desc: 'Quản lý tài sản, cấp phát, yêu cầu', path: '/assets', tone: 'navy', group: 'manage' },
      { slug: 'reports', icon: 'grid', label: 'Báo cáo', desc: 'Chấm công, nghỉ phép, đề xuất', path: '/reports', tone: 'red', group: 'manage' },
      { slug: 'payroll-mgmt', icon: 'doc', label: 'Bảng lương', desc: 'Tổng hợp lương tháng, BHXH, thuế', path: '/payroll-mgmt', tone: 'gold', group: 'manage' },
      { slug: 'documents', icon: 'folder', label: 'Tài liệu', desc: 'Giấy tờ yêu cầu nộp, theo dõi trạng thái', path: '/documents', tone: 'navy', group: 'use' },
      { slug: 'onboarding', icon: 'star', label: 'On/Offboarding', desc: 'Onboarding, offboarding, đơn nghỉ việc', path: '/onboarding', tone: 'red', group: 'manage' },
      { slug: 'journey', icon: 'layers', label: 'Hành trình NV', desc: 'Vòng đời nhân viên, AI hỗ trợ', path: '/journey', tone: 'navy', group: 'manage' },
      { slug: 'pms', icon: 'target', label: 'Hiệu suất', desc: 'KPI, mục tiêu, Feedback 360', path: '/pms', tone: 'red', group: 'manage' },
      { slug: 'training', icon: 'book', label: 'Đào tạo', desc: 'Khóa học, chứng chỉ, phát triển NV', path: '/training', tone: 'gold', group: 'manage' },
      { slug: 'org-chart', icon: 'sitemap', label: 'Cây tổ chức', desc: 'Sơ đồ phân cấp, phân công quản lý', path: '/org-chart', tone: 'navy', group: 'manage' },
      { slug: 'promotion-hub', icon: 'trophy', label: 'Hub Thăng Tiến', desc: '9-Box, đề xuất, phê duyệt, công bố', path: '/promotion-hub', tone: 'gold', group: 'manage' },
    ],
  },
  {
    id: 'eoffice',
    title: 'eOffice',
    subtitle: 'Văn phòng điện tử',
    gradient: `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`,
    shadow: '0 10px 28px rgba(192,34,43,0.22)',
    accentBg: HNH.red50,
    icon: 'doc',
    features: [
      { slug: 'tasks', icon: 'check', label: 'Công việc', desc: 'Tasks, deadline, phân công', path: '/tasks', tone: 'red', group: 'use' },
      { slug: 'projects', icon: 'folder', label: 'Dự án', desc: 'Quản lý dự án, tiến độ', path: '/projects', tone: 'gold', group: 'use' },
      { slug: 'unified-calendar', icon: 'cal', label: 'Lịch tổng hợp', desc: 'Nghỉ phép, deadline, tour, dự án', path: '/unified-calendar', tone: 'gold', group: 'use' },
    ],
  },
]

const toneBg: Record<string, string> = {
  navy: HNH.navy50, red: HNH.red50, gold: '#faf1d6', success: HNH.success50,
}
const toneColor: Record<string, string> = {
  navy: HNH.navy, red: HNH.red, gold: '#a87908', success: HNH.success,
}

function groupFeatures(features: AppFeature[], allowed: Set<string> | null): { group: FeatureGroup; items: AppFeature[] }[] {
  const order: FeatureGroup[] = ['use', 'manage']
  const visible = allowed ? features.filter(f => allowed.has(f.slug)) : features
  return order
    .map(g => ({ group: g, items: visible.filter(f => f.group === g) }))
    .filter(g => g.items.length > 0)
}

function GroupLabel({ group, variant }: { group: FeatureGroup; variant: 'light' | 'dark' }) {
  const { label, icon } = GROUP_LABELS[group]
  const isLight = variant === 'light'
  return (
    <div className="flex items-center gap-1.5" style={{ padding: '4px 0 6px' }}>
      <Icon name={icon} size={12} color={isLight ? HNH.ink3 : 'rgba(255,255,255,0.55)'} stroke={2} />
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
        color: isLight ? HNH.ink3 : 'rgba(255,255,255,0.55)',
      }}>
        {label}
      </span>
    </div>
  )
}

type ViewMode = 'launcher' | 'list'

/* ── List view: feature as a row ── */
function FeatureRow({ f, onTap }: { f: AppFeature; onTap: () => void }) {
  const available = !!f.path
  return (
    <button
      onClick={onTap}
      disabled={!available}
      className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 16, padding: '14px 16px',
        opacity: available ? 1 : 0.55,
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
          {!available && <SoonBadge />}
        </div>
        <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{f.desc}</div>
      </div>
      {available && <Icon name="chev-r" size={16} color={HNH.ink3} stroke={1.8} />}
    </button>
  )
}

/* ── Launcher view: feature as an icon tile ── */
function FeatureIcon({ f, onTap, iconBox }: { f: AppFeature; onTap: () => void; iconBox: number }) {
  const available = !!f.path
  const iconSize = iconBox >= 56 ? 26 : 18
  const radius = iconBox >= 56 ? 18 : 14
  return (
    <button
      onClick={onTap}
      disabled={!available}
      className="flex flex-col items-center gap-1.5 border-none cursor-pointer bg-transparent"
      style={{ opacity: available ? 1 : 0.5, padding: 0, width: iconBox + 24 }}
    >
      <div
        className="flex items-center justify-center relative"
        style={{
          width: iconBox, height: iconBox, borderRadius: radius,
          background: toneBg[f.tone],
          boxShadow: available ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <Icon name={f.icon} size={iconSize} color={toneColor[f.tone]} stroke={2.2} />
        {!available && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              top: -4, right: -4, width: 16, height: 16, borderRadius: '50%',
              background: HNH.cream2, border: `1.5px solid ${HNH.line}`,
            }}
          >
            <Icon name="clock" size={9} color={HNH.ink3} stroke={2} />
          </div>
        )}
      </div>
      <span
        className="text-center"
        style={{
          fontSize: iconBox >= 56 ? 11.5 : 10,
          fontWeight: 600, color: HNH.ink,
          lineHeight: 1.2, maxWidth: iconBox + 20,
          wordBreak: 'break-word',
        }}
      >
        {f.label}
      </span>
    </button>
  )
}

function SoonBadge() {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: HNH.ink3,
      background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
      letterSpacing: 0.3, textTransform: 'uppercase',
    }}>
      Sắp ra mắt
    </span>
  )
}

/* ── App card header (shared) ── */
function AppHeader({ app }: { app: AppCard }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: app.gradient, borderRadius: 22,
        padding: '20px 20px 16px', boxShadow: app.shadow,
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
  )
}

/* ── Toggle button ── */
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex" style={{
      background: HNH.cream2, borderRadius: 10, padding: 3,
      border: `1px solid ${HNH.line}`,
    }}>
      {(['launcher', 'list'] as const).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="flex items-center justify-center border-none cursor-pointer"
          style={{
            width: 32, height: 28, borderRadius: 8,
            background: mode === m ? '#fff' : 'transparent',
            boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <Icon
            name={m === 'launcher' ? 'grid' : 'doc'}
            size={14}
            color={mode === m ? HNH.ink : HNH.ink3}
            stroke={2}
          />
        </button>
      ))}
    </div>
  )
}

export function AppsPage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [mode, setMode] = useState<ViewMode>('launcher')
  const [allowedApps, setAllowedApps] = useState<Set<string> | null>(null)

  useEffect(() => {
    api.get<{ allowed: string[]; is_admin: boolean }>('/api/employee/my-apps/')
      .then(data => setAllowedApps(new Set(data.allowed)))
      .catch(() => setAllowedApps(null))
  }, [])

  const iconBox = isTablet ? 56 : 48

  const getGroups = (app: AppCard) => groupFeatures(app.features, allowedApps)

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Ứng dụng"
        trailing={<ViewToggle mode={mode} onChange={setMode} />}
      />
      <div style={{ padding: '12px 16px 32px', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {apps.map(app => (
            <div key={app.id}>
              {mode === 'list' ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <AppHeader app={app} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(() => {
                      const groups = getGroups(app)
                      const multi = groups.length > 1
                      return groups.map(({ group, items }) => (
                        <div key={group}>
                          {multi && <GroupLabel group={group} variant="light" />}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {items.map(f => (
                              <FeatureRow key={f.label} f={f} onTap={() => f.path && navigate(f.path)} />
                            ))}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                </>
              ) : (
                <div
                  className="relative overflow-hidden"
                  style={{
                    background: app.gradient, borderRadius: 22,
                    padding: '20px 20px 20px', boxShadow: app.shadow,
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      right: -40, top: -40, width: 140, height: 140,
                      borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
                    }}
                  />
                  {/* App title row */}
                  <div className="relative flex items-center gap-3" style={{ marginBottom: 18 }}>
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 44, height: 44, borderRadius: 13,
                        background: 'rgba(255,255,255,0.18)',
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <Icon name={app.icon} size={22} color="#fff" stroke={2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
                        {app.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                        {app.subtitle}
                      </div>
                    </div>
                  </div>
                  {/* Feature icon grid — grouped */}
                  <div
                    className="relative"
                    style={{
                      background: 'rgba(255,255,255,0.92)',
                      backdropFilter: 'blur(12px)',
                      borderRadius: 16, padding: '14px 16px',
                    }}
                  >
                    {(() => {
                      const groups = getGroups(app)
                      const multi = groups.length > 1
                      return groups.map(({ group, items }, gi) => (
                        <div key={group} style={{ marginTop: gi > 0 ? 10 : 0 }}>
                          {multi && <GroupLabel group={group} variant="light" />}
                          <div className="flex flex-wrap gap-4" style={{ paddingTop: 2 }}>
                            {items.map(f => (
                              <FeatureIcon
                                key={f.label}
                                f={f}
                                iconBox={iconBox}
                                onTap={() => f.path && navigate(f.path)}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
