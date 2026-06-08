import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

/* ── Types ── */
interface Perm { id: number; codename: string; name: string }

interface Group {
  id: number
  name: string
  member_count: number
  permissions: Perm[]
}

interface Member {
  id: number
  first_name: string
  last_name: string
  badge_id: string | null
  department: string | null
  department_id: number | null
  job_position: string | null
}

interface GroupDetail {
  id: number
  name: string
  permissions: Perm[]
  members: Member[]
  allowed_apps: string[]
  nav_tabs: string[]
}

const NAV_TAB_OPTIONS = [
  { id: 'home',   label: 'Trang chủ',  icon: 'home' },
  { id: 'attend', label: 'Chấm công',  icon: 'clock' },
  { id: 'apps',   label: 'Ứng dụng',   icon: 'grid' },
  { id: 'ruby',   label: 'Ruby AI',    icon: 'star' },
  { id: 'tasks',  label: 'Công việc',  icon: 'check' },
  { id: 'me',     label: 'Cá nhân',    icon: 'users' },
]

interface AvailEmp {
  id: number
  first_name: string
  last_name: string
  badge_id: string | null
  department: string | null
  department_id: number | null
}

interface Dept { id: number; name: string }

interface AppPermGroup {
  label: string
  permissions: Perm[]
}

/* ── Helpers ── */
const GROUP_COLORS = [HNH.navy, '#7c3aed', HNH.success, '#0891b2', '#c2410c', HNH.red]
function groupColor(id: number) { return GROUP_COLORS[id % GROUP_COLORS.length] }

const APP_FEATURES = [
  // ── Sử dụng (self-service) ──────────────────────────────────────────────
  { slug: 'attendance',         label: 'Chấm công',        icon: 'clock',   section: 'hrm' },
  { slug: 'proposals',          label: 'Đề xuất',          icon: 'send',    section: 'hrm' },
  { slug: 'approvals',          label: 'Phê duyệt',        icon: 'check',   section: 'hrm' },
  { slug: 'payslip',            label: 'Phiếu lương',      icon: 'doc',     section: 'hrm' },
  { slug: 'notifications',      label: 'Thông báo',        icon: 'bell',    section: 'hrm' },
  { slug: 'announcements',      label: 'Tin nội bộ',       icon: 'bell',    section: 'hrm' },
  { slug: 'documents',          label: 'Tài liệu',         icon: 'folder',  section: 'hrm' },
  // ── Quản lý chấm công ───────────────────────────────────────────────────
  { slug: 'attendance-activity',label: 'HĐ Chấm công',     icon: 'clock',   section: 'hrm' },
  { slug: 'monthly-att',        label: 'CC Tháng',         icon: 'grid',    section: 'hrm' },
  { slug: 'shift-management',   label: 'Quản lý Ca',       icon: 'clock',   section: 'hrm' },
  { slug: 'shift-planner',      label: 'Phân Ca NV',       icon: 'cal',     section: 'hrm' },
  { slug: 'hrm-wds-labelday',   label: 'Gán lịch bận',     icon: 'cal',     section: 'hrm' },
  { slug: 'hrm-att-setting',    label: 'Cài đặt CC',       icon: 'gear',    section: 'hrm' },
  // ── Quản lý nghỉ phép ───────────────────────────────────────────────────
  { slug: 'leave-management',   label: 'Quản lý Phép',     icon: 'leaf',    section: 'hrm' },
  // ── Nhân sự ─────────────────────────────────────────────────────────────
  { slug: 'employees',          label: 'Nhân sự',          icon: 'users',   section: 'hrm' },
  { slug: 'roles',              label: 'Vai trò & Quyền',  icon: 'shield',  section: 'hrm' },
  { slug: 'groups',             label: 'Nhóm Quyền',       icon: 'folder',  section: 'hrm' },
  { slug: 'onboarding',         label: 'On/Offboarding',   icon: 'star',    section: 'hrm' },
  { slug: 'promotion-hub',      label: 'Hub Thăng Tiến',   icon: 'trophy',  section: 'hrm' },
  { slug: 'journey',            label: 'Hành trình NV',    icon: 'layers',  section: 'hrm' },
  // ── Báo cáo / Dashboard ─────────────────────────────────────────────────
  { slug: 'dashboard',          label: 'Dashboard',        icon: 'grid',    section: 'hrm' },
  { slug: 'assets',             label: 'Tài sản',          icon: 'doc',     section: 'hrm' },
  { slug: 'reports',            label: 'Báo cáo',          icon: 'grid',    section: 'hrm' },
  { slug: 'payroll-mgmt',       label: 'Bảng lương',       icon: 'doc',     section: 'hrm' },
  { slug: 'announcement-hub',   label: 'Hub Thông Báo',    icon: 'send',    section: 'hrm' },
  { slug: 'pms',                label: 'Hiệu suất',        icon: 'target',  section: 'hrm' },
  { slug: 'training',           label: 'Đào tạo',          icon: 'book',    section: 'hrm' },
  { slug: 'org-chart',          label: 'Cây tổ chức',      icon: 'sitemap', section: 'hrm' },
  // ── eOffice ─────────────────────────────────────────────────────────────
  { slug: 'tasks',              label: 'Công việc',        icon: 'check',   section: 'eoffice' },
  { slug: 'projects',           label: 'Dự án',            icon: 'folder',  section: 'eoffice' },
  { slug: 'unified-calendar',   label: 'Lịch tổng hợp',   icon: 'cal',     section: 'eoffice' },
]

/* ── Group Card ── */
function GroupCard({ group, onTap }: { group: Group; onTap: () => void }) {
  const bg = groupColor(group.id)
  return (
    <button
      onClick={onTap}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: '#fff', borderRadius: 18, padding: 0,
        border: `1px solid ${HNH.line}`,
        boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 4, background: bg }} />
      <div style={{ padding: '14px 16px' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink }}>{group.name}</div>
            <div style={{ fontSize: 12, color: HNH.ink3, fontWeight: 500, marginTop: 3 }}>
              {group.permissions.length} quyền
            </div>
          </div>
          <div className="flex items-center gap-1.5" style={{
            background: HNH.navy50, borderRadius: 8, padding: '4px 10px',
          }}>
            <Icon name="users" size={13} color={HNH.navy} stroke={2} />
            <span style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>{group.member_count}</span>
          </div>
        </div>
        {group.permissions.length > 0 && (
          <div className="flex flex-wrap gap-1" style={{ marginTop: 8 }}>
            {group.permissions.slice(0, 4).map(p => (
              <span key={p.id} style={{
                fontSize: 10, fontWeight: 600, color: HNH.ink3,
                background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
              }}>
                {p.name.length > 30 ? p.name.slice(0, 28) + '…' : p.name}
              </span>
            ))}
            {group.permissions.length > 4 && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: HNH.ink3,
                background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
              }}>
                +{group.permissions.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

/* ── Add Members Modal ── */
function AddMembersModal({ groupId, groupName, depts, onClose, onAdded }: {
  groupId: number; groupName: string; depts: Dept[];
  onClose: () => void; onAdded: () => void
}) {
  const [available, setAvailable] = useState<AvailEmp[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deptFilter, setDeptFilter] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchAvailable = useCallback(async (dept: number | null) => {
    setLoading(true)
    try {
      let path = `/api/employee/groups/${groupId}/available-employees/`
      if (dept) path += `?department=${dept}`
      const data = await api.get<AvailEmp[]>(path)
      setAvailable(data)
    } catch { setAvailable([]) } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { fetchAvailable(deptFilter) }, [deptFilter, fetchAvailable])

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllInDept = () => {
    const ids = available.map(e => e.id)
    setSelected(new Set(ids))
  }

  const handleAdd = async () => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      await api.post(`/api/employee/groups/${groupId}/add-members/`, {
        employee_ids: Array.from(selected),
      })
      onAdded()
      onClose()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'hidden',
        borderRadius: 24, background: HNH.cream,
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="flex items-center justify-between shrink-0" style={{
          padding: '14px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}`,
        }}>
          <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}>
            <Icon name="x" size={17} color={HNH.ink} stroke={2} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Thêm vào {groupName}</div>
          <div style={{ width: 34 }} />
        </div>

        <div className="flex gap-2 overflow-x-auto shrink-0" style={{ padding: '10px 16px', scrollbarWidth: 'none' }}>
          <button
            onClick={() => { setDeptFilter(null); setSelected(new Set()) }}
            className="shrink-0 border-none cursor-pointer whitespace-nowrap"
            style={{
              padding: '5px 12px', borderRadius: 8,
              background: deptFilter === null ? HNH.navy : '#fff',
              color: deptFilter === null ? '#fff' : HNH.ink2,
              fontSize: 11, fontWeight: 700,
              border: `1px solid ${deptFilter === null ? HNH.navy : HNH.line}`,
            }}
          >
            Tất cả
          </button>
          {depts.map(d => (
            <button
              key={d.id}
              onClick={() => { setDeptFilter(d.id === deptFilter ? null : d.id); setSelected(new Set()) }}
              className="shrink-0 border-none cursor-pointer whitespace-nowrap"
              style={{
                padding: '5px 12px', borderRadius: 8,
                background: d.id === deptFilter ? HNH.navy : '#fff',
                color: d.id === deptFilter ? '#fff' : HNH.ink2,
                fontSize: 11, fontWeight: 700,
                border: `1px solid ${d.id === deptFilter ? HNH.navy : HNH.line}`,
              }}
            >
              {d.name}
            </button>
          ))}
        </div>

        {available.length > 0 && (
          <div className="shrink-0 flex items-center justify-between" style={{ padding: '0 16px 8px' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3 }}>
              {selected.size}/{available.length} đã chọn
            </span>
            <button
              onClick={selectAllInDept}
              className="border-none cursor-pointer"
              style={{
                fontSize: 11.5, fontWeight: 700, color: HNH.navy,
                background: HNH.navy50, borderRadius: 8, padding: '4px 10px',
              }}
            >
              Chọn tất cả
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ padding: '0 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
          ) : available.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Không có nhân viên khả dụng</div>
          ) : (
            <div className="flex flex-col gap-2">
              {available.map(emp => {
                const checked = selected.has(emp.id)
                return (
                  <button
                    key={emp.id}
                    onClick={() => toggle(emp.id)}
                    className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                    style={{
                      background: checked ? HNH.navy50 : '#fff',
                      borderRadius: 14, padding: '10px 14px',
                      border: `1.5px solid ${checked ? HNH.navy : HNH.line}`,
                    }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: checked ? HNH.navy : '#fff',
                        border: checked ? 'none' : `2px solid ${HNH.line}`,
                      }}
                    >
                      {checked && <Icon name="check" size={13} color="#fff" stroke={2.5} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                        {emp.first_name} {emp.last_name}
                      </div>
                      <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
                        {emp.department || 'Chưa phân phòng'}{emp.badge_id ? ` · ${emp.badge_id}` : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0" style={{ padding: '12px 16px', borderTop: `1px solid ${HNH.line}`, background: '#fff' }}>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0 || saving}
            className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
            style={{
              padding: '12px', borderRadius: 12,
              background: selected.size > 0 ? HNH.navy : HNH.cream2,
              color: selected.size > 0 ? '#fff' : HNH.ink3,
              fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1,
            }}
          >
            <Icon name="plus" size={16} color={selected.size > 0 ? '#fff' : HNH.ink3} stroke={2.2} />
            {saving ? 'Đang thêm...' : `Thêm ${selected.size} nhân viên`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Edit Group Modal ── */
type EditTab = 'info' | 'perms' | 'apps'

function EditGroupModal({ detail, onClose, onSaved }: {
  detail: GroupDetail
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<EditTab>('info')
  const [name, setName] = useState(detail.name)
  const [selectedPerms, setSelectedPerms] = useState<Set<number>>(
    new Set(detail.permissions.map(p => p.id))
  )
  const [selectedApps, setSelectedApps] = useState<Set<string>>(
    new Set(detail.allowed_apps || [])
  )
  // Empty set = all tabs shown (no restriction). Non-empty = only those tabs.
  const [selectedNavTabs, setSelectedNavTabs] = useState<Set<string>>(
    new Set(detail.nav_tabs || [])
  )
  const [allPerms, setAllPerms] = useState<Record<string, AppPermGroup>>({})
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set())
  const [permSearch, setPermSearch] = useState('')

  useEffect(() => {
    setLoadingPerms(true)
    api.get<Record<string, AppPermGroup>>('/api/employee/groups/all-permissions/')
      .then(setAllPerms)
      .catch(() => {})
      .finally(() => setLoadingPerms(false))
  }, [])

  const togglePerm = (id: number) => {
    setSelectedPerms(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAllInApp = (appKey: string) => {
    const group = allPerms[appKey]
    if (!group) return
    const ids = group.permissions.map(p => p.id)
    const allSelected = ids.every(id => selectedPerms.has(id))
    setSelectedPerms(prev => {
      const next = new Set(prev)
      ids.forEach(id => { if (allSelected) next.delete(id); else next.add(id) })
      return next
    })
  }

  const toggleExpandApp = (appKey: string) => {
    setExpandedApps(prev => {
      const next = new Set(prev)
      if (next.has(appKey)) next.delete(appKey); else next.add(appKey)
      return next
    })
  }

  const toggleApp = (slug: string) => {
    setSelectedApps(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  const toggleNavTab = (id: string) => {
    setSelectedNavTabs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/api/employee/groups/${detail.id}/update/`, {
        name: name.trim(),
        permission_ids: Array.from(selectedPerms),
        allowed_apps: Array.from(selectedApps),
        nav_tabs: Array.from(selectedNavTabs),
      })
      // Clear cached nav tabs so BottomNav re-fetches
      localStorage.removeItem('hnh_nav_tabs')
      onSaved()
      onClose()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const hasChanges = name.trim() !== detail.name
    || selectedPerms.size !== detail.permissions.length
    || !detail.permissions.every(p => selectedPerms.has(p.id))
    || selectedApps.size !== (detail.allowed_apps || []).length
    || !(detail.allowed_apps || []).every(a => selectedApps.has(a))
    || selectedNavTabs.size !== (detail.nav_tabs || []).length
    || !(detail.nav_tabs || []).every(t => selectedNavTabs.has(t))

  const tabs: { key: EditTab; label: string; icon: string }[] = [
    { key: 'info', label: 'Thông tin', icon: 'doc' },
    { key: 'perms', label: 'Quyền hệ thống', icon: 'shield' },
    { key: 'apps', label: 'Ứng dụng', icon: 'grid' },
  ]

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 540, maxHeight: '92vh', overflow: 'hidden',
        borderRadius: '24px 24px 0 0', background: HNH.cream,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between shrink-0" style={{
          padding: '14px 16px', background: '#fff',
          borderBottom: `1px solid ${HNH.line}`,
          borderRadius: '24px 24px 0 0',
        }}>
          <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}>
            <Icon name="x" size={17} color={HNH.ink} stroke={2} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Chỉnh sửa nhóm</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{
          padding: '8px 16px', background: '#fff',
          borderBottom: `1px solid ${HNH.line}`,
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
              style={{
                padding: '7px 4px', borderRadius: 10,
                background: tab === t.key ? HNH.navy : 'transparent',
                color: tab === t.key ? '#fff' : HNH.ink3,
                fontSize: 11.5, fontWeight: 700,
                transition: 'all 0.15s',
              }}
            >
              <Icon name={t.icon} size={13} color={tab === t.key ? '#fff' : HNH.ink3} stroke={2} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}>
          {tab === 'info' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                Tên nhóm quyền
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border-none outline-none"
                style={{
                  background: '#fff', borderRadius: 12, padding: '12px 14px',
                  border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                  color: HNH.ink,
                }}
              />
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4 }}>
                  Quyền hiện tại: {selectedPerms.size}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3 }}>
                  Ứng dụng hiển thị: {selectedApps.size > 0 ? selectedApps.size : 'Tất cả'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginTop: 2 }}>
                  Thành viên: {detail.members.length}
                </div>
              </div>

              {/* Nav tabs visibility */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 4 }}>
                  Bottom Nav hiển thị
                </div>
                <div style={{
                  fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginBottom: 10, lineHeight: 1.4,
                }}>
                  Bỏ chọn để ẩn tab đó khỏi thanh điều hướng.
                  {selectedNavTabs.size === 0 && (
                    <span style={{ color: HNH.success, fontWeight: 700 }}> (Đang hiện tất cả)</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {NAV_TAB_OPTIONS.map(tab => {
                    // Empty selectedNavTabs = all tabs shown; treat as all checked
                    const effectivelyAll = selectedNavTabs.size === 0
                    const checked = effectivelyAll || selectedNavTabs.has(tab.id)
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (effectivelyAll) {
                            // First click: switch to explicit-all mode then uncheck this tab
                            const all = new Set(NAV_TAB_OPTIONS.map(t => t.id))
                            all.delete(tab.id)
                            setSelectedNavTabs(all)
                          } else {
                            toggleNavTab(tab.id)
                          }
                        }}
                        className="flex flex-col items-center gap-1 border-none cursor-pointer"
                        style={{
                          background: checked ? HNH.navy50 : HNH.cream2,
                          borderRadius: 12, padding: '10px 6px',
                          border: `1.5px solid ${checked ? HNH.navy : HNH.line}`,
                        }}
                      >
                        <div
                          className="flex items-center justify-center"
                          style={{
                            width: 22, height: 22, borderRadius: 7,
                            background: checked ? HNH.navy : '#fff',
                            border: checked ? 'none' : `2px solid ${HNH.line}`,
                            marginBottom: 2,
                          }}
                        >
                          {checked && <Icon name="check" size={13} color="#fff" stroke={2.5} />}
                        </div>
                        <Icon name={tab.icon} size={15} color={checked ? HNH.navy : HNH.ink3} stroke={2} />
                        <span style={{
                          fontSize: 10.5, fontWeight: 700,
                          color: checked ? HNH.navy : HNH.ink3,
                          textAlign: 'center', lineHeight: 1.2,
                        }}>
                          {tab.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {selectedNavTabs.size > 0 && selectedNavTabs.size < NAV_TAB_OPTIONS.length && (
                  <button
                    onClick={() => setSelectedNavTabs(new Set())}
                    className="border-none cursor-pointer"
                    style={{
                      marginTop: 8, fontSize: 11, fontWeight: 600, color: HNH.ink3,
                      background: 'transparent', textDecoration: 'underline',
                    }}
                  >
                    Khôi phục hiện tất cả
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'perms' && (
            <div>
              <div className="flex items-center gap-2" style={{
                background: '#fff', borderRadius: 10, padding: '7px 12px',
                border: `1px solid ${HNH.line}`, marginBottom: 12,
              }}>
                <Icon name="search" size={15} color={HNH.ink3} stroke={1.8} />
                <input
                  type="text"
                  value={permSearch}
                  onChange={e => setPermSearch(e.target.value)}
                  placeholder="Tìm quyền..."
                  className="flex-1 border-none outline-none bg-transparent"
                  style={{ fontSize: 12.5, fontWeight: 500, color: HNH.ink }}
                />
                {permSearch && (
                  <button onClick={() => setPermSearch('')} className="border-none cursor-pointer bg-transparent p-0">
                    <Icon name="x" size={14} color={HNH.ink3} stroke={2} />
                  </button>
                )}
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, marginBottom: 10 }}>
                {selectedPerms.size} quyền đã chọn
              </div>

              {loadingPerms ? (
                <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.entries(allPerms).map(([appKey, group]) => {
                    const filteredPerms = permSearch
                      ? group.permissions.filter(p =>
                          p.name.toLowerCase().includes(permSearch.toLowerCase()) ||
                          p.codename.toLowerCase().includes(permSearch.toLowerCase())
                        )
                      : group.permissions
                    if (filteredPerms.length === 0) return null

                    const expanded = expandedApps.has(appKey) || !!permSearch
                    const selectedInApp = filteredPerms.filter(p => selectedPerms.has(p.id)).length
                    const allInApp = selectedInApp === filteredPerms.length

                    return (
                      <div key={appKey} style={{
                        background: '#fff', borderRadius: 14,
                        border: `1px solid ${HNH.line}`, overflow: 'hidden',
                      }}>
                        <button
                          onClick={() => toggleExpandApp(appKey)}
                          className="w-full flex items-center justify-between border-none cursor-pointer text-left"
                          style={{ padding: '10px 14px', background: 'transparent' }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              name={expanded ? 'chev-d' : 'chev-r'}
                              size={12} color={HNH.ink3} stroke={2}
                            />
                            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                              {group.label}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: HNH.ink3,
                              background: HNH.cream2, borderRadius: 6, padding: '1px 6px',
                            }}>
                              {selectedInApp}/{filteredPerms.length}
                            </span>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); toggleAllInApp(appKey) }}
                            className="border-none cursor-pointer"
                            style={{
                              fontSize: 10.5, fontWeight: 700,
                              color: allInApp ? HNH.red : HNH.navy,
                              background: allInApp ? HNH.red50 : HNH.navy50,
                              borderRadius: 6, padding: '2px 8px',
                            }}
                          >
                            {allInApp ? 'Bỏ tất cả' : 'Chọn tất cả'}
                          </button>
                        </button>

                        {expanded && (
                          <div style={{
                            borderTop: `1px solid ${HNH.line}`,
                            padding: '4px 10px 8px',
                            maxHeight: 260, overflowY: 'auto',
                          }}>
                            {filteredPerms.map(p => {
                              const checked = selectedPerms.has(p.id)
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => togglePerm(p.id)}
                                  className="w-full flex items-center gap-2 border-none cursor-pointer text-left"
                                  style={{ padding: '5px 4px', background: 'transparent' }}
                                >
                                  <div
                                    className="flex items-center justify-center shrink-0"
                                    style={{
                                      width: 18, height: 18, borderRadius: 5,
                                      background: checked ? HNH.navy : '#fff',
                                      border: checked ? 'none' : `1.5px solid ${HNH.line}`,
                                    }}
                                  >
                                    {checked && <Icon name="check" size={11} color="#fff" stroke={2.5} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink }}>
                                      {p.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: HNH.ink3, fontWeight: 500 }}>
                                      {p.codename}
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'apps' && (
            <div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 12,
                lineHeight: 1.5,
              }}>
                Chọn các ứng dụng mà nhóm này được phép truy cập trong PWA.
                {selectedApps.size === 0 && (
                  <span style={{ color: HNH.warn, fontWeight: 700 }}>
                    {' '}(Chưa chọn = Hiển thị tất cả)
                  </span>
                )}
              </div>

              {/* HRM section */}
              <div style={{ marginBottom: 16 }}>
                <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
                  <Icon name="users" size={13} color={HNH.navy} stroke={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>HRM</span>
                </div>
                <div className="flex flex-col gap-2">
                  {APP_FEATURES.filter(f => f.section === 'hrm').map(f => {
                    const checked = selectedApps.has(f.slug)
                    return (
                      <button
                        key={f.slug}
                        onClick={() => toggleApp(f.slug)}
                        className="w-full flex items-center gap-3 border-none cursor-pointer text-left"
                        style={{
                          background: checked ? HNH.navy50 : '#fff',
                          borderRadius: 14, padding: '11px 14px',
                          border: `1.5px solid ${checked ? HNH.navy : HNH.line}`,
                        }}
                      >
                        <div
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: 20, height: 20, borderRadius: 6,
                            background: checked ? HNH.navy : '#fff',
                            border: checked ? 'none' : `2px solid ${HNH.line}`,
                          }}
                        >
                          {checked && <Icon name="check" size={12} color="#fff" stroke={2.5} />}
                        </div>
                        <Icon name={f.icon} size={16} color={checked ? HNH.navy : HNH.ink3} stroke={2} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: checked ? HNH.navy : HNH.ink }}>
                          {f.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* eOffice section */}
              <div>
                <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
                  <Icon name="doc" size={13} color={HNH.red} stroke={2} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: HNH.red }}>eOffice</span>
                </div>
                <div className="flex flex-col gap-2">
                  {APP_FEATURES.filter(f => f.section === 'eoffice').map(f => {
                    const checked = selectedApps.has(f.slug)
                    return (
                      <button
                        key={f.slug}
                        onClick={() => toggleApp(f.slug)}
                        className="w-full flex items-center gap-3 border-none cursor-pointer text-left"
                        style={{
                          background: checked ? HNH.navy50 : '#fff',
                          borderRadius: 14, padding: '11px 14px',
                          border: `1.5px solid ${checked ? HNH.navy : HNH.line}`,
                        }}
                      >
                        <div
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: 20, height: 20, borderRadius: 6,
                            background: checked ? HNH.navy : '#fff',
                            border: checked ? 'none' : `2px solid ${HNH.line}`,
                          }}
                        >
                          {checked && <Icon name="check" size={12} color="#fff" stroke={2.5} />}
                        </div>
                        <Icon name={f.icon} size={16} color={checked ? HNH.navy : HNH.ink3} stroke={2} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: checked ? HNH.navy : HNH.ink }}>
                          {f.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="shrink-0" style={{
          padding: '12px 16px', borderTop: `1px solid ${HNH.line}`, background: '#fff',
        }}>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
            style={{
              padding: '13px', borderRadius: 12,
              background: hasChanges && name.trim() ? HNH.navy : HNH.cream2,
              color: hasChanges && name.trim() ? '#fff' : HNH.ink3,
              fontSize: 13.5, fontWeight: 700, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Group Detail Modal ── */
function GroupDetailModal({ groupId, onClose, isTablet }: {
  groupId: number; onClose: () => void; isTablet: boolean
}) {
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [depts, setDepts] = useState<Dept[]>([])
  const [removing, setRemoving] = useState<number | null>(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<GroupDetail>(`/api/employee/groups/${groupId}/`)
      setDetail(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => {
    fetchDetail()
    api.get<Dept[]>('/api/employee/departments/').then(setDepts).catch(() => {})
  }, [fetchDetail])

  const handleRemove = async (empId: number) => {
    if (!confirm('Hủy bỏ nhân viên này khỏi nhóm?')) return
    setRemoving(empId)
    try {
      await api.post(`/api/employee/groups/${groupId}/remove-members/`, {
        employee_ids: [empId],
      })
      fetchDetail()
    } catch { /* ignore */ } finally { setRemoving(null) }
  }

  if (loading || !detail) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      >
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Đang tải...</div>
      </div>
    )
  }

  return (
    <>
      <div
        className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className={isTablet ? '' : 'flex-1 overflow-y-auto'}
          style={isTablet
            ? { width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }
            : { WebkitOverflowScrolling: 'touch' as never }
          }
        >
          <div style={{ background: HNH.cream, minHeight: isTablet ? undefined : '100%' }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{
              padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}`,
            }}>
              <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer"
                style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
                <Icon name="x" size={18} color={HNH.ink} stroke={2} />
              </button>
              <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{detail.name}</div>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center justify-center border-none cursor-pointer"
                style={{ width: 36, height: 36, borderRadius: 10, background: HNH.navy50 }}
              >
                <Icon name="gear" size={17} color={HNH.navy} stroke={2} />
              </button>
            </div>

            {/* Permissions section */}
            <div style={{ padding: '16px 16px 8px' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div className="flex items-center gap-2">
                  <Icon name="shield" size={15} color={HNH.navy} stroke={2} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>
                    Quyền ({detail.permissions.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowEdit(true)}
                  className="border-none cursor-pointer"
                  style={{
                    fontSize: 11, fontWeight: 700, color: HNH.navy,
                    background: HNH.navy50, borderRadius: 8, padding: '4px 10px',
                  }}
                >
                  Chỉnh sửa
                </button>
              </div>
              <div style={{
                background: '#fff', borderRadius: 16, padding: '8px 14px',
                border: `1px solid ${HNH.line}`, maxHeight: 180, overflowY: 'auto',
              }}>
                {detail.permissions.length === 0 ? (
                  <div style={{ padding: '10px 0', fontSize: 12.5, color: HNH.ink3 }}>Chưa có quyền nào</div>
                ) : (
                  detail.permissions.map(p => (
                    <div key={p.id} className="flex items-center gap-2" style={{
                      padding: '6px 0', borderBottom: `1px solid ${HNH.line}`,
                    }}>
                      <Icon name="check" size={12} color={HNH.success} stroke={2.5} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: HNH.ink }}>{p.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* App visibility section */}
            {(detail.allowed_apps?.length ?? 0) > 0 && (
              <div style={{ padding: '8px 16px' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <Icon name="grid" size={15} color={HNH.navy} stroke={2} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>
                    Ứng dụng hiển thị ({detail.allowed_apps.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.allowed_apps.map(slug => {
                    const feat = APP_FEATURES.find(f => f.slug === slug)
                    return (
                      <span key={slug} style={{
                        fontSize: 11, fontWeight: 600, color: HNH.navy,
                        background: HNH.navy50, borderRadius: 8, padding: '3px 9px',
                      }}>
                        {feat?.label || slug}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Members section */}
            <div style={{ padding: '8px 16px 24px' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div className="flex items-center gap-2">
                  <Icon name="users" size={15} color={HNH.navy} stroke={2} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>
                    Nhân sự ({detail.members.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 border-none cursor-pointer"
                  style={{
                    background: HNH.navy, color: '#fff', borderRadius: 10,
                    padding: '7px 12px', fontSize: 12, fontWeight: 700,
                  }}
                >
                  <Icon name="plus" size={13} color="#fff" stroke={2.5} />
                  Thêm
                </button>
              </div>

              <div style={{
                background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
                overflow: 'hidden',
              }}>
                {detail.members.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: 12.5, color: HNH.ink3 }}>
                    Chưa có nhân viên trong nhóm
                  </div>
                ) : (
                  detail.members.map((m, i) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3"
                      style={{
                        padding: '10px 14px',
                        borderBottom: i < detail.members.length - 1 ? `1px solid ${HNH.line}` : 'none',
                      }}
                    >
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: groupColor(m.id), color: '#fff',
                          fontSize: 13, fontWeight: 700,
                        }}
                      >
                        {(m.first_name[0] || '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                          {m.first_name} {m.last_name}
                        </div>
                        <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>
                          {m.department || '—'}{m.job_position ? ` · ${m.job_position}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={removing === m.id}
                        className="flex items-center justify-center border-none cursor-pointer shrink-0"
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: '#fef2f2', opacity: removing === m.id ? 0.5 : 1,
                        }}
                      >
                        <Icon name="x" size={14} color="#dc2626" stroke={2.2} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddMembersModal
          groupId={groupId}
          groupName={detail.name}
          depts={depts}
          onClose={() => setShowAdd(false)}
          onAdded={fetchDetail}
        />
      )}

      {showEdit && (
        <EditGroupModal
          detail={detail}
          onClose={() => setShowEdit(false)}
          onSaved={fetchDetail}
        />
      )}
    </>
  )
}

/* ── Main page ── */
export function GroupsPage() {
  const isTablet = useTablet()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Group[]>('/api/employee/groups/')
      setGroups(data)
    } catch { setGroups([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const filtered = search
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Nhóm Quyền"
        trailing={
          <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, background: HNH.cream2, borderRadius: 8, padding: '4px 10px' }}>
            {groups.length} nhóm
          </div>
        }
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 900, margin: '0 auto' }}>
        <div className="flex items-center gap-2" style={{
          background: '#fff', borderRadius: 14, padding: '8px 14px',
          border: `1px solid ${HNH.line}`, marginBottom: 12,
        }}>
          <Icon name="search" size={18} color={HNH.ink3} stroke={1.8} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm nhóm quyền..."
            className="flex-1 border-none outline-none bg-transparent"
            style={{ fontSize: 13.5, fontWeight: 500, color: HNH.ink }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="border-none cursor-pointer bg-transparent p-0">
              <Icon name="x" size={16} color={HNH.ink3} stroke={2} />
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Không tìm thấy nhóm quyền
          </div>
        ) : (
          <div className={isTablet ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2.5'}>
            {filtered.map(g => (
              <GroupCard key={g.id} group={g} onTap={() => setSelectedId(g.id)} />
            ))}
          </div>
        )}
      </div>

      {selectedId && (
        <GroupDetailModal
          groupId={selectedId}
          onClose={() => { setSelectedId(null); fetchGroups() }}
          isTablet={isTablet}
        />
      )}
    </div>
  )
}
