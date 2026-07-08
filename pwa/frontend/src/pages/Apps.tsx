import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'
import { WC2026_ENABLED } from '../lib/flags'

type ModuleGroup =
  | 'org' | 'attendance' | 'schedule' | 'payroll'
  | 'proposals' | 'support' | 'reports' | 'performance' | 'system'

interface AppFeature {
  slug: string
  icon: string
  label: string
  desc: string
  path: string | null
  tone: 'navy' | 'red' | 'gold' | 'success'
  group: ModuleGroup
  always?: boolean
}

const MODULE_META: Record<ModuleGroup, { label: string; icon: string; color: string; bg: string }> = {
  org:         { label: 'Tổ chức & Nhân sự',       icon: 'users',  color: HNH.navy,    bg: HNH.navy50 },
  attendance:  { label: 'Chấm công & Nghỉ phép',   icon: 'clock',  color: HNH.red,     bg: HNH.red50 },
  schedule:    { label: 'Lịch làm việc',           icon: 'cal',    color: HNH.success, bg: HNH.success50 },
  payroll:     { label: 'Lương',                   icon: 'doc',    color: '#a87908',   bg: '#faf1d6' },
  proposals:   { label: 'Đề xuất & YC Thanh toán', icon: 'send',   color: '#c2410c',   bg: '#ffedd5' },
  support:     { label: 'Hỗ trợ - Tiện ích',       icon: 'help',   color: '#6b7280',   bg: '#f3f4f6' },
  reports:     { label: 'Dashboard & Báo cáo',     icon: 'grid',   color: '#7c3aed',   bg: '#f5f3ff' },
  performance: { label: 'Đánh giá & Hiệu suất',    icon: 'target', color: '#be185d',   bg: '#fdf2f8' },
  system:      { label: 'Quản trị hệ thống',       icon: 'gear',   color: HNH.ink,     bg: '#eef0f4' },
}

const MODULE_ORDER: ModuleGroup[] = [
  'org', 'attendance', 'schedule', 'payroll',
  'proposals', 'support', 'reports', 'performance', 'system',
]

const features: AppFeature[] = [
  // ── Tổ chức & Nhân sự ──
  { slug: 'employees',     icon: 'users',   label: 'Nhân sự',         desc: 'Danh sách, hồ sơ nhân viên',               path: '/employees',      tone: 'navy',    group: 'org' },
  { slug: 'employees',     icon: 'users',   label: 'Onboarding NV',   desc: 'Tạo NV mới: gán vị trí, vai trò, nhóm quyền, tài khoản KC', path: '/onboard-employee', tone: 'red', group: 'org' },
  { slug: 'org-chart',     icon: 'sitemap', label: 'Cây tổ chức',     desc: 'Sơ đồ phân cấp, phân công quản lý',        path: '/org-chart',      tone: 'navy',    group: 'org' },
  { slug: 'roles',         icon: 'shield',  label: 'Vai trò & Quyền', desc: 'Phân quyền, nhóm vai trò',                 path: '/roles',          tone: 'navy',    group: 'org' },
  { slug: 'groups',        icon: 'folder',  label: 'Nhóm Quyền',      desc: 'Quản lý nhóm, phân nhân sự',               path: '/groups',         tone: 'navy',    group: 'org' },
  { slug: 'onboarding',    icon: 'star',    label: 'On/Offboarding',  desc: 'Onboarding, offboarding, đơn nghỉ việc',   path: '/onboarding',     tone: 'red',     group: 'org' },
  { slug: 'journey',       icon: 'layers',  label: 'Hành trình NV',   desc: 'Vòng đời nhân viên, AI hỗ trợ',            path: '/journey',        tone: 'navy',    group: 'org' },
  { slug: 'documents',     icon: 'folder',  label: 'Tài liệu',        desc: 'Giấy tờ yêu cầu nộp, theo dõi trạng thái', path: '/documents',     tone: 'navy',    group: 'org', always: true },
  { slug: 'account-mgmt',  icon: 'shield',  label: 'Quản lý TK',      desc: 'Cấp tài khoản KC hàng loạt theo phòng',     path: '/account-mgmt',  tone: 'navy',    group: 'org' },
  { slug: 'job-mgmt',      icon: 'layers',  label: 'Vị trí & Vai trò',desc: 'Quản lý vị trí và vai trò công việc',       path: '/job-mgmt',      tone: 'navy',    group: 'org' },

  // ── Chấm công & Nghỉ phép ──
  { slug: 'attendance',          icon: 'clock', label: 'Chấm công',     desc: 'Check-in, lịch sử, GPS',                               path: '/attendance',                tone: 'navy', group: 'attendance', always: true },
  { slug: 'monthly-attendance',  icon: 'cal',   label: 'Công Tháng',    desc: 'Lịch công HR xác nhận, trạng thái ngày công',          path: '/attendance/monthly',        tone: 'navy', group: 'attendance', always: true },
  { slug: 'attendance-activity', icon: 'clock', label: 'HĐ Chấm công', desc: 'Tổng hợp hoạt động chấm công',                         path: '/attendance-activity',       tone: 'navy', group: 'attendance' },
  { slug: 'monthly-att',         icon: 'grid',  label: 'CC Tháng',      desc: 'Bảng chấm công từng ngày cho toàn bộ nhân viên',       path: '/attendance-monthly-detail', tone: 'navy', group: 'attendance' },
  { slug: 'attendance-manager',   icon: 'users', label: 'Quản lý Công NV', desc: 'Bảng First-Last chấm công NV dưới quyền theo tháng', path: '/attendance-manager',        tone: 'red',  group: 'attendance' },
  { slug: 'hrm-att-setting',     icon: 'gear',  label: 'Cài đặt CC',   desc: 'Cấu hình Chấm công, Geofence',                         path: '/attendance-settings',       tone: 'navy', group: 'attendance' },
  { slug: 'leave',            icon: 'leaf',  label: 'Nghỉ phép',    desc: 'Số dư, lịch sử nghỉ phép, gửi đơn',  path: '/leave',            tone: 'success', group: 'attendance', always: true },
  { slug: 'leave-management', icon: 'leaf',  label: 'Quản lý Phép',    desc: 'Phép bù, thâm niên, duyệt đề xuất',   path: '/leave-management', tone: 'success', group: 'attendance' },
  { slug: 'leave-overview',   icon: 'grid',  label: 'Nghỉ phép Tháng', desc: 'Lịch nghỉ toàn bộ NV theo tháng + phép đầu/cuối, lọc công ty/phòng', path: '/leave/overview',  tone: 'success', group: 'attendance' },
  { slug: 'leave-import',     icon: 'upload', label: 'Import Phép Năm', desc: 'Nhập số ngày phép đầu năm từ file Excel', path: '/leave/import',   tone: 'gold',    group: 'attendance' },
  { slug: 'leave-approver-config', icon: 'gear', label: 'Cấu hình duyệt phép', desc: 'Gán người C&B duyệt theo công ty/phòng + xem người duyệt mỗi NV', path: '/leave/approver-config', tone: 'navy', group: 'attendance' },

  // ── Lịch làm việc ──
  { slug: 'work-schedule',       icon: 'cal',   label: 'Lịch làm việc', desc: 'Ca làm, giờ vào ra theo tuần',                         path: '/work-schedule',             tone: 'navy', group: 'schedule', always: true },
  { slug: 'calendar',            icon: 'cal',   label: 'Lịch',          desc: 'Lịch tổng hợp: nghỉ phép, ngày lễ, sự kiện công ty',    path: '/calendar',                  tone: 'navy', group: 'schedule', always: true },
  { slug: 'unified-calendar',  icon: 'cal',    label: 'Lịch tổng hợp',desc: 'Nghỉ phép, deadline, tour, dự án',        path: '/unified-calendar',  tone: 'gold',  group: 'schedule', always: true },
  { slug: 'calendar-sync',       icon: 'link',  label: 'Đồng bộ lịch',  desc: 'Đưa nghỉ phép, ngày lễ, sự kiện vào Outlook/Google',    path: '/calendar-sync',             tone: 'navy', group: 'schedule', always: true },
  { slug: 'outlook',           icon: 'mail',   label: 'Kết nối Outlook', desc: 'Đưa lịch họp Outlook vào màn Lịch của app', path: '/outlook',        tone: 'navy',  group: 'schedule', always: true },
  { slug: 'shift-management',    icon: 'clock', label: 'Quản lý Ca',    desc: 'Phân ca nhân viên, cấu hình ca theo phòng ban',        path: '/shift-management',          tone: 'red',  group: 'schedule' },
  { slug: 'shift-planner',      icon: 'cal',   label: 'Phân Ca NV',    desc: 'Lưới phân ca tháng theo phòng ban, quản lý, phê duyệt', path: '/shift-planner',             tone: 'red',  group: 'schedule', always: true },
  { slug: 'hrm-wds-labelday',    icon: 'cal',   label: 'Gán lịch bận',  desc: 'Tag Công tác / Sự kiện / Nghỉ ốm theo tuần',          path: '/labelday',                  tone: 'gold', group: 'schedule' },

  // ── Lương ──
  { slug: 'payslip',      icon: 'doc', label: 'Phiếu lương', desc: 'Xem chi tiết lương hàng tháng',    path: '/payslip',      tone: 'navy', group: 'payroll', always: true },
  { slug: 'payroll-mgmt', icon: 'doc', label: 'Bảng lương',  desc: 'Tổng hợp lương tháng, BHXH, thuế', path: '/payroll-mgmt', tone: 'gold', group: 'payroll' },

  // ── Đề xuất & YC Thanh toán ──
  { slug: 'proposals',        icon: 'send',  label: 'Đề xuất',      desc: 'Nghỉ phép, đổi ca, ngày công',        path: '/proposals',        tone: 'success', group: 'proposals', always: true },
  { slug: 'approvals',        icon: 'check', label: 'Phê duyệt',    desc: 'Duyệt đề xuất nhân viên',             path: '/approvals',        tone: 'gold',    group: 'proposals', always: true },
  { slug: 'expenses-admin', icon: 'doc', label: 'Chi phí HC', desc: 'Quản lý yêu cầu chi phí, tạo bảng kê', path: '/expenses/admin', tone: 'gold', group: 'proposals' },

  // ── Hỗ trợ - Tiện ích ──
  { slug: 'helpdesk',          icon: 'help',   label: 'Hỗ trợ IT',     desc: 'Gửi yêu cầu hỗ trợ, theo dõi tiến độ',   path: '/helpdesk',          tone: 'navy',  group: 'support', always: true },
  { slug: 'helpdesk',          icon: 'help',   label: 'YC Hỗ trợ',     desc: 'Xem và xử lý tất cả yêu cầu hỗ trợ',    path: '/helpdesk?tab=all',  tone: 'red',   group: 'support' },
  { slug: 'announcement-hub',  icon: 'send',   label: 'Hub Thông Báo', desc: 'Tạo & quản lý thông báo nội bộ',          path: '/announcement-hub',  tone: 'red',   group: 'support' },
  { slug: 'announcements',     icon: 'bell',   label: 'Tin nội bộ',    desc: 'Bản tin, thông báo BGĐ, quy định, sự kiện', path: '/announcements',   tone: 'red',   group: 'support', always: true },
  { slug: 'notifications',     icon: 'bell',   label: 'Thông báo',     desc: 'Xem thông báo hệ thống',                  path: '/notifications',     tone: 'navy',  group: 'support', always: true },
  { slug: 'assets',            icon: 'doc',    label: 'Tài sản',       desc: 'Quản lý tài sản, cấp phát, yêu cầu',     path: '/assets',            tone: 'navy',  group: 'support' },
  { slug: 'eoffice',           icon: 'file-text', label: 'eOffice',    desc: 'Quản lý công việc, phê duyệt, văn phòng điện tử', path: '/eoffice', tone: 'navy', group: 'support' },
  { slug: 'tasks',             icon: 'check',  label: 'Công việc',     desc: 'Tasks, deadline, phân công',              path: '/tasks',             tone: 'red',   group: 'support', always: true },
  { slug: 'projects',          icon: 'folder', label: 'Dự án',         desc: 'Quản lý dự án, tiến độ',                  path: '/projects',          tone: 'gold',  group: 'support', always: true },
  { slug: 'wc2026',            icon: 'trophy',    label: 'World Cup 2026', desc: 'Dự đoán kết quả trận đấu WC2026',             path: '/wc2026',  tone: 'gold', group: 'support', always: true },
  { slug: 'hrm-app-setting',   icon: 'gear',   label: 'Cài đặt App',  desc: 'Thông báo đẩy, bộ nhớ cache, tài khoản', path: '/settings',          tone: 'navy',  group: 'support', always: true },

  // ── Dashboard & Báo cáo ──
  { slug: 'dashboard', icon: 'grid',   label: 'Dashboard',    desc: 'Tổng quan công ty, nhân sự, chấm công',    path: '/dashboard',            tone: 'navy', group: 'reports' },
  { slug: 'dashboard', icon: 'clock',  label: 'Dashboard CC', desc: 'Nghỉ phép, đi muộn, xu hướng theo tháng',  path: '/attendance-dashboard', tone: 'red',  group: 'reports' },
  { slug: 'export-attendance', icon: 'doc', label: 'Xuất CC Excel', desc: 'Xuất hoạt động chấm công tháng ra Excel', path: '/export-attendance', tone: 'gold', group: 'reports' },
  { slug: 'reports',   icon: 'grid',   label: 'Báo cáo',      desc: 'Chấm công, nghỉ phép, đề xuất',            path: '/reports',              tone: 'red',  group: 'reports' },

  // ── Đánh giá & Hiệu suất ──
  { slug: 'pms',       icon: 'target', label: 'Hiệu suất',    desc: 'KPI, mục tiêu, Feedback 360',               path: '/pms',                  tone: 'red',  group: 'performance' },
  { slug: 'promotion-hub', icon: 'trophy',  label: 'Hub Thăng Tiến',  desc: '9-Box, đề xuất, phê duyệt, công bố',       path: '/promotion-hub',  tone: 'gold',    group: 'performance' },
  { slug: 'training',  icon: 'book',   label: 'Đào tạo',      desc: 'Khóa học, chứng chỉ, phát triển NV',        path: '/training',             tone: 'gold', group: 'performance' },

  // ── Quản trị hệ thống ──
  { slug: 'service-accounts',  icon: 'shield', label: 'Service Account', desc: 'Quản lý M2M token, scope, IP cho hệ thống ngoài', path: '/m2m', tone: 'navy', group: 'system' },
  { slug: 'service-accounts',  icon: 'gear',   label: 'Đồng bộ DB',      desc: 'Lịch sử & đối chiếu Standby→Stage (5h/13h)',      path: '/db-sync', tone: 'navy', group: 'system' },
]

const toneBg: Record<string, string> = {
  navy: HNH.navy50, red: HNH.red50, gold: '#faf1d6', success: HNH.success50,
}
const toneColor: Record<string, string> = {
  navy: HNH.navy, red: HNH.red, gold: '#a87908', success: HNH.success,
}

function getModuleFeatures(group: ModuleGroup, allowed: Set<string> | null): AppFeature[] {
  return features.filter(f => {
    if (f.group !== group) return false
    // WC2026 chỉ hiện khi cờ bật (stage); prod tắt cờ → ẩn card (khớp route bị gate)
    if (f.slug === 'wc2026' && !WC2026_ENABLED) return false
    if (f.always) return true
    return !allowed || allowed.has(f.slug)
  })
}

function ModuleSectionHeader({ group }: { group: ModuleGroup }) {
  const meta = MODULE_META[group]
  return (
    <div className="flex items-center gap-2.5" style={{ marginBottom: 10 }}>
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 30, height: 30, borderRadius: 9, background: meta.color }}
      >
        <Icon name={meta.icon} size={15} color="#fff" stroke={2.2} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: HNH.ink, letterSpacing: -0.2 }}>
        {meta.label}
      </span>
      <div style={{ flex: 1, height: 1.5, background: HNH.line }} />
    </div>
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

type ViewMode = 'launcher' | 'list'

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

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Ứng dụng"
        trailing={<ViewToggle mode={mode} onChange={setMode} />}
      />
      <div style={{ padding: '12px 16px 32px', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {MODULE_ORDER.map(group => {
            const items = getModuleFeatures(group, allowedApps)
            if (items.length === 0) return null
            return (
              <div key={group}>
                <ModuleSectionHeader group={group} />
                {mode === 'list' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(f => (
                      <FeatureRow
                        key={`${f.slug}-${f.path}`}
                        f={f}
                        onTap={() => f.path && navigate(f.path)}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#fff', borderRadius: 16,
                      padding: '16px 16px 12px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div className="flex flex-wrap gap-4">
                      {items.map(f => (
                        <FeatureIcon
                          key={`${f.slug}-${f.path}`}
                          f={f}
                          iconBox={iconBox}
                          onTap={() => f.path && navigate(f.path)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
