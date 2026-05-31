import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

/* ── Types ── */
interface Role {
  id: number
  name: string
  job_position: string | null
  job_position_id: number | null
  department: string | null
  department_id: number | null
  employee_count: number
  permissions: string[]
  has_django_group: boolean
  kc_role_id: string | null
  kc_role_name: string | null
  kc_synced: boolean
}

interface PermEntry { id: number; codename: string; name: string }
type PermsByApp = Record<string, PermEntry[]>

interface Dept { id: number; name: string }

interface KcRole {
  id: string
  name: string
  description: string
  composite: boolean
}

/* ── Helpers ── */
const ROLE_COLORS = [HNH.navy, HNH.red, HNH.success, '#7c3aed', '#0891b2', '#c2410c']
function roleColor(id: number) { return ROLE_COLORS[id % ROLE_COLORS.length] }

/* ── Role Card ── */
function RoleCard({ role, onTap }: { role: Role; onTap: () => void }) {
  const bg = roleColor(role.id)
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
            <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink }}>{role.name}</div>
            {role.job_position && (
              <div style={{ fontSize: 12, color: HNH.ink2, fontWeight: 500, marginTop: 2 }}>{role.job_position}</div>
            )}
          </div>
          <div className="flex items-center gap-1" style={{
            background: HNH.cream2, borderRadius: 8, padding: '4px 8px',
          }}>
            <Icon name="users" size={12} color={HNH.ink3} stroke={2} />
            <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink2 }}>{role.employee_count}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
          {role.department && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: HNH.navy,
              background: HNH.navy50, borderRadius: 6, padding: '2px 8px',
            }}>
              {role.department}
            </span>
          )}
          {role.has_django_group && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: HNH.success,
              background: HNH.success50, borderRadius: 6, padding: '2px 8px',
            }}>
              HRM Group · {role.permissions.length} quyền
            </span>
          )}
          {!role.has_django_group && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: HNH.warn,
              background: HNH.warn50, borderRadius: 6, padding: '2px 8px',
            }}>
              Chưa có HRM Group
            </span>
          )}
          {role.kc_synced && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: '#7c3aed',
              background: '#f3e8ff', borderRadius: 6, padding: '2px 8px',
            }}>
              KC ✓
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

/* ── Permission Picker ── */
const APP_LABELS: Record<string, string> = {
  employee: 'Nhân sự', attendance: 'Chấm công', leave: 'Nghỉ phép',
  payroll: 'Lương', base: 'Hệ thống', recruitment: 'Tuyển dụng',
  asset: 'Tài sản', eoffice: 'eOffice',
}

function PermissionPicker({ allPerms, selected, onChange }: {
  allPerms: PermsByApp; selected: Set<number>; onChange: (s: Set<number>) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(next)
  }
  const toggleApp = (app: string) => {
    const perms = allPerms[app] || []
    const allSelected = perms.every(p => selected.has(p.id))
    const next = new Set(selected)
    perms.forEach(p => { if (allSelected) next.delete(p.id); else next.add(p.id) })
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-1">
      {Object.entries(allPerms).map(([app, perms]) => {
        const count = perms.filter(p => selected.has(p.id)).length
        const isOpen = expanded === app
        return (
          <div key={app}>
            <button
              onClick={() => setExpanded(isOpen ? null : app)}
              className="w-full flex items-center gap-2 border-none cursor-pointer"
              style={{ background: HNH.cream, borderRadius: 10, padding: '8px 12px' }}
            >
              <Icon name={isOpen ? 'chev-d' : 'chev-r'} size={14} color={HNH.ink3} stroke={2} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink, flex: 1, textAlign: 'left' }}>
                {APP_LABELS[app] || app}
              </span>
              {count > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 6, padding: '1px 6px' }}>
                  {count}/{perms.length}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); toggleApp(app) }}
                className="border-none cursor-pointer"
                style={{ background: HNH.navy50, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: HNH.navy }}
              >
                {perms.every(p => selected.has(p.id)) ? 'Bỏ tất cả' : 'Chọn tất cả'}
              </button>
            </button>
            {isOpen && (
              <div style={{ padding: '4px 0 4px 16px' }}>
                {perms.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer" style={{ padding: '5px 0' }}>
                    <input
                      type="checkbox" checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      style={{ width: 16, height: 16, accentColor: HNH.navy }}
                    />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: HNH.ink3, fontFamily: 'monospace' }}>{p.codename}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Detail Modal ── */
type DetailTab = 'info' | 'perms' | 'kc'

function RoleDetailModal({ role, kcRoles, onClose, onRoleUpdated, isTablet }: {
  role: Role; kcRoles: KcRole[] | null; onClose: () => void; onRoleUpdated: () => void; isTablet: boolean
}) {
  const [tab, setTab] = useState<DetailTab>('info')
  const [editMode, setEditMode] = useState(false)
  const [allPerms, setAllPerms] = useState<PermsByApp | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const kcMatch = role.kc_synced ? { id: role.kc_role_id!, name: role.kc_role_name! } : kcRoles?.find(r => r.name === role.name) || null

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'info', label: 'Thông tin' },
    { id: 'perms', label: 'Quyền HRM' },
    { id: 'kc', label: 'Keycloak' },
  ]

  const loadPerms = useCallback(async () => {
    if (allPerms) return
    try {
      const data = await api.get<PermsByApp>('/api/base/role-permissions/')
      setAllPerms(data)
    } catch { /* ignore */ }
  }, [allPerms])

  const enterEdit = async () => {
    await loadPerms()
    setEditMode(true)
    setSaveMsg(null)
    if (allPerms && role.permissions.length > 0) {
      const ids = new Set<number>()
      Object.values(allPerms).flat().forEach(p => {
        if (role.permissions.includes(p.codename)) ids.add(p.id)
      })
      setSelectedPerms(ids)
    }
  }

  useEffect(() => {
    if (editMode && allPerms && role.permissions.length > 0 && selectedPerms.size === 0) {
      const ids = new Set<number>()
      Object.values(allPerms).flat().forEach(p => {
        if (role.permissions.includes(p.codename)) ids.add(p.id)
      })
      setSelectedPerms(ids)
    }
  }, [editMode, allPerms, role.permissions, selectedPerms.size])

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await api.post<{ ok: boolean; action?: string; permissions_count?: number; error?: string }>(
        '/api/base/role-group-sync/',
        { role_id: role.id, permission_ids: Array.from(selectedPerms) }
      )
      if (res.ok) {
        setSaveMsg(res.action === 'created'
          ? `HRM Group "${role.name}" đã tạo thành công với ${res.permissions_count} quyền`
          : `Đã cập nhật ${res.permissions_count} quyền cho HRM Group`)
        setEditMode(false)
        onRoleUpdated()
      } else {
        setSaveMsg(`Lỗi: ${res.error}`)
      }
    } catch (e) {
      let msg = 'Unknown'
      if (e instanceof Error) {
        try { msg = JSON.parse(e.message).error } catch { msg = e.message }
      }
      setSaveMsg(`Lỗi: ${msg}`)
    } finally { setSaving(false) }
  }

  return (
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
          <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}` }}>
            <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
              <Icon name="x" size={18} color={HNH.ink} stroke={2} />
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Chi tiết vai trò</div>
            <div style={{ width: 36 }} />
          </div>

          {/* Role header */}
          <div style={{ padding: '20px 20px 16px', background: '#fff' }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center shrink-0" style={{
                width: 52, height: 52, borderRadius: 16,
                background: roleColor(role.id), color: '#fff',
              }}>
                <Icon name="shield" size={24} color="#fff" stroke={2} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink }}>{role.name}</div>
                {role.job_position && <div style={{ fontSize: 13, color: HNH.ink2, fontWeight: 500, marginTop: 2 }}>{role.job_position}</div>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
              {role.department && (
                <span style={{ fontSize: 11, fontWeight: 700, color: HNH.navy, background: HNH.navy50, borderRadius: 8, padding: '4px 12px' }}>
                  {role.department}
                </span>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink2, background: HNH.cream2, borderRadius: 8, padding: '4px 12px' }}>
                {role.employee_count} nhân viên
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '4px 12px',
                color: role.has_django_group ? HNH.success : HNH.warn,
                background: role.has_django_group ? HNH.success50 : HNH.warn50,
              }}>
                {role.has_django_group ? 'HRM Group ✓' : 'Chưa có HRM Group'}
              </span>
              {kcMatch && (
                <span style={{ fontSize: 11, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 8, padding: '4px 12px' }}>
                  KC Synced
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ padding: '8px 20px 0', background: HNH.cream }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setEditMode(false) }}
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
          <div style={{ padding: '12px 20px 32px' }}>
            {tab === 'info' && (
              <div style={{ background: '#fff', borderRadius: 18, padding: '12px 16px', border: `1px solid ${HNH.line}` }}>
                <InfoItem label="Vai trò" value={role.name} />
                <InfoItem label="Vị trí công việc" value={role.job_position} />
                <InfoItem label="Phòng ban" value={role.department} />
                <InfoItem label="Số nhân viên" value={String(role.employee_count)} />
                <InfoItem label="HRM Group" value={role.has_django_group ? 'Đã tạo' : 'Chưa tạo'} />
                <InfoItem label="Số quyền" value={role.has_django_group ? String(role.permissions.length) : '—'} />
              </div>
            )}

            {tab === 'perms' && (
              <div style={{ background: '#fff', borderRadius: 18, padding: '12px 16px', border: `1px solid ${HNH.line}` }}>
                {saveMsg && (
                  <div style={{
                    marginBottom: 10, padding: '8px 12px', borderRadius: 10,
                    background: saveMsg.startsWith('Lỗi') ? HNH.red50 : HNH.success50,
                    color: saveMsg.startsWith('Lỗi') ? HNH.red : HNH.success,
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {saveMsg}
                  </div>
                )}

                {editMode && allPerms ? (
                  <>
                    <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                        Chọn quyền ({selectedPerms.size} đã chọn)
                      </span>
                      <button
                        onClick={() => setEditMode(false)}
                        className="border-none cursor-pointer"
                        style={{ background: HNH.cream2, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: HNH.ink3 }}
                      >
                        Hủy
                      </button>
                    </div>
                    <PermissionPicker allPerms={allPerms} selected={selectedPerms} onChange={setSelectedPerms} />
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
                      style={{
                        marginTop: 14, padding: '12px 0', borderRadius: 14,
                        background: HNH.navy, color: '#fff',
                        fontSize: 14, fontWeight: 700,
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      <Icon name="check" size={16} color="#fff" stroke={2.5} />
                      {saving ? 'Đang lưu...' : role.has_django_group ? 'Cập nhật quyền' : 'Tạo HRM Group & gán quyền'}
                    </button>
                  </>
                ) : (
                  <>
                    {!role.has_django_group ? (
                      <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        <div className="flex items-center justify-center" style={{
                          width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
                          background: HNH.warn50,
                        }}>
                          <Icon name="shield" size={28} color={HNH.warn} stroke={1.8} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginBottom: 4 }}>
                          Chưa có HRM Group
                        </div>
                        <div style={{ fontSize: 12.5, color: HNH.ink3, marginBottom: 16, lineHeight: 1.5 }}>
                          Tạo HRM Group cho vai trò "{role.name}" để phân quyền truy cập các module trong hệ thống
                        </div>
                        <button
                          onClick={enterEdit}
                          className="flex items-center justify-center gap-2 border-none cursor-pointer"
                          style={{
                            margin: '0 auto', padding: '10px 24px', borderRadius: 12,
                            background: HNH.navy, color: '#fff',
                            fontSize: 13, fontWeight: 700,
                          }}
                        >
                          <Icon name="plus" size={16} color="#fff" stroke={2.5} />
                          Tạo HRM Group & phân quyền
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                            Quyền hiện tại ({role.permissions.length})
                          </span>
                          <button
                            onClick={enterEdit}
                            className="flex items-center gap-1 border-none cursor-pointer"
                            style={{ background: HNH.navy50, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: HNH.navy }}
                          >
                            <Icon name="edit" size={12} color={HNH.navy} stroke={2} />
                            Sửa quyền
                          </button>
                        </div>
                        {role.permissions.length === 0 ? (
                          <div style={{ padding: 12, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                            Chưa gán quyền nào — nhấn "Sửa quyền" để thêm
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {role.permissions.map(p => (
                              <div key={p} className="flex items-center gap-2" style={{ padding: '6px 0', borderBottom: `1px solid ${HNH.line}` }}>
                                <Icon name="check" size={14} color={HNH.success} stroke={2.5} />
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: HNH.ink, fontFamily: 'monospace' }}>{p}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'kc' && (
              <div style={{ background: '#fff', borderRadius: 18, padding: '12px 16px', border: `1px solid ${HNH.line}` }}>
                {kcMatch ? (
                  <div>
                    <div className="flex items-center gap-2" style={{ padding: '10px 0' }}>
                      <Icon name="check" size={18} color={HNH.success} stroke={2.5} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: HNH.success }}>Đã map với Keycloak Realm Role</span>
                    </div>
                    <InfoItem label="KC Role ID" value={kcMatch.id} />
                    <InfoItem label="KC Role Name" value={kcMatch.name} />
                    {role.kc_synced && (
                      <InfoItem label="Trạng thái" value="Đã lưu mapping trong HRM" />
                    )}
                  </div>
                ) : kcRoles === null ? (
                  <div style={{ padding: 16, textAlign: 'center', color: HNH.warn, fontSize: 13 }}>
                    <Icon name="alert" size={20} color={HNH.warn} />
                    <div style={{ marginTop: 8 }}>Keycloak chưa được cấu hình hoặc không kết nối được</div>
                  </div>
                ) : (
                  <div style={{ padding: 16, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                    <div style={{ marginBottom: 8 }}>Vai trò này chưa được map với Keycloak Realm</div>
                    <div style={{ fontSize: 12, color: HNH.ink4 }}>Nhấn "Sync Roles → KC" ở trang chính để tạo và map tự động</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: value ? HNH.ink : HNH.ink4, marginTop: 2 }}>{value || '—'}</div>
    </div>
  )
}

/* ── KC Sync Modal ── */
interface SyncDept {
  id: number
  name: string
  roles: SyncRole[]
  employees: SyncEmp[]
}
interface SyncRole {
  id: number; name: string; position: string | null
  kc_synced: boolean; kc_role_id: string | null; kc_role_name: string | null; synced_at: string | null
}
interface SyncEmp {
  id: number; name: string; email: string; role: string | null
  kc_synced: boolean; kc_user_id: string | null; kc_username: string | null; synced_at: string | null
}

type SyncTab = 'roles' | 'users'

function KCSyncModal({ onClose, isTablet, kcConnected }: {
  onClose: () => void; isTablet: boolean; kcConnected: boolean
}) {
  const [tab, setTab] = useState<SyncTab>('roles')
  const [depts, setDepts] = useState<SyncDept[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [selectedRoles, setSelectedRoles] = useState<Set<number>>(new Set())
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<SyncDept[]>('/api/base/keycloak/sync-overview/')
      setDepts(data)
      setExpanded(new Set(data.map(d => d.id)))
    } catch { setDepts([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  const allRoles = depts.flatMap(d => d.roles)
  const allEmps = depts.flatMap(d => d.employees)

  const toggleRole = (id: number) => {
    const next = new Set(selectedRoles)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedRoles(next)
  }
  const toggleUser = (id: number) => {
    const next = new Set(selectedUsers)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedUsers(next)
  }
  const toggleDeptRoles = (dept: SyncDept) => {
    const ids = dept.roles.map(r => r.id)
    const allSel = ids.every(id => selectedRoles.has(id))
    const next = new Set(selectedRoles)
    ids.forEach(id => { if (allSel) next.delete(id); else next.add(id) })
    setSelectedRoles(next)
  }
  const toggleDeptUsers = (dept: SyncDept) => {
    const ids = dept.employees.map(e => e.id)
    const allSel = ids.every(id => selectedUsers.has(id))
    const next = new Set(selectedUsers)
    ids.forEach(id => { if (allSel) next.delete(id); else next.add(id) })
    setSelectedUsers(next)
  }
  const selectAllItems = () => {
    if (tab === 'roles') {
      const all = allRoles.map(r => r.id)
      const allSel = all.every(id => selectedRoles.has(id))
      setSelectedRoles(allSel ? new Set() : new Set(all))
    } else {
      const all = allEmps.map(e => e.id)
      const allSel = all.every(id => selectedUsers.has(id))
      setSelectedUsers(allSel ? new Set() : new Set(all))
    }
  }

  const handleSync = async () => {
    const ids = tab === 'roles' ? Array.from(selectedRoles) : Array.from(selectedUsers)
    if (ids.length === 0) return
    setSyncing(true)
    setResult(null)
    try {
      const res = await api.post<{
        ok: boolean; created?: number; exists?: number; updated?: number; error?: string; errors?: { role?: string; employee?: string; error: string }[]
      }>('/api/base/keycloak/sync-selective/', { type: tab, ids })
      if (res.ok) {
        const parts: string[] = []
        if (res.created) parts.push(`${res.created} tạo mới`)
        if (res.exists) parts.push(`${res.exists} đã tồn tại`)
        if (res.updated) parts.push(`${res.updated} cập nhật`)
        if (res.errors?.length) parts.push(`${res.errors.length} lỗi`)
        setResult({ ok: true, msg: parts.join(', ') || 'Thành công' })
        setSelectedRoles(new Set())
        setSelectedUsers(new Set())
        fetchOverview()
      } else {
        setResult({ ok: false, msg: res.error || 'Lỗi không xác định' })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Lỗi' })
    } finally { setSyncing(false) }
  }

  const handleDelete = async (deleteOnKc: boolean) => {
    if (tab !== 'roles') return
    const syncedIds = Array.from(selectedRoles).filter(id => allRoles.find(r => r.id === id)?.kc_synced)
    if (syncedIds.length === 0) return
    const action = deleteOnKc ? 'Xóa mapping + Role trên KC' : 'Xóa mapping'
    if (!confirm(`${action} cho ${syncedIds.length} vai trò?`)) return
    setSyncing(true)
    setResult(null)
    try {
      const res = await api.post<{
        ok: boolean; deleted_mappings?: number; deleted_kc?: number; errors?: { role: string; error: string }[]
      }>('/api/base/keycloak/delete-sync/', { role_ids: syncedIds, delete_on_kc: deleteOnKc })
      if (res.ok) {
        const parts: string[] = [`${res.deleted_mappings} mapping đã xóa`]
        if (deleteOnKc && res.deleted_kc) parts.push(`${res.deleted_kc} role KC đã xóa`)
        if (res.errors?.length) parts.push(`${res.errors.length} lỗi`)
        setResult({ ok: true, msg: parts.join(', ') })
        setSelectedRoles(new Set())
        fetchOverview()
      } else {
        setResult({ ok: false, msg: 'Lỗi xóa đồng bộ' })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Lỗi' })
    } finally { setSyncing(false) }
  }

  const selCount = tab === 'roles' ? selectedRoles.size : selectedUsers.size
  const syncedCount = tab === 'roles'
    ? allRoles.filter(r => r.kc_synced).length
    : allEmps.filter(e => e.kc_synced).length
  const totalCount = tab === 'roles' ? allRoles.length : allEmps.length

  const selectedHasSynced = tab === 'roles'
    ? allRoles.some(r => selectedRoles.has(r.id) && r.kc_synced)
    : allEmps.some(e => selectedUsers.has(e.id) && e.kc_synced)
  const selectedHasNew = tab === 'roles'
    ? allRoles.some(r => selectedRoles.has(r.id) && !r.kc_synced)
    : allEmps.some(e => selectedUsers.has(e.id) && !e.kc_synced)
  const selectedSyncedCount = tab === 'roles'
    ? allRoles.filter(r => selectedRoles.has(r.id) && r.kc_synced).length
    : 0

  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={isTablet ? '' : 'flex-1 flex flex-col'}
        style={isTablet
          ? { width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }
          : { overflow: 'hidden' }
        }
      >
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: `1px solid ${HNH.line}`, flexShrink: 0 }}>
          <div className="flex items-center justify-between" style={{ padding: '12px 16px' }}>
            <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
              <Icon name="x" size={18} color={HNH.ink} stroke={2} />
            </button>
            <div className="flex items-center gap-2">
              <Icon name="globe" size={18} color={HNH.navy} stroke={2} />
              <span style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Đồng bộ Keycloak</span>
            </div>
            <div style={{
              fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '3px 8px',
              color: kcConnected ? HNH.success : HNH.warn,
              background: kcConnected ? HNH.success50 : HNH.warn50,
            }}>
              {kcConnected ? 'Kết nối OK' : 'Chưa kết nối'}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-2" style={{ padding: '0 16px 10px' }}>
            <div style={{ flex: 1, background: HNH.cream, borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: HNH.navy }}>{syncedCount}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Đã đồng bộ</div>
            </div>
            <div style={{ flex: 1, background: HNH.warn50, borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: HNH.warn }}>{totalCount - syncedCount}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Chưa đồng bộ</div>
            </div>
            <div style={{ flex: 1, background: HNH.navy50, borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: HNH.navy }}>{totalCount}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: HNH.ink3 }}>Tổng</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ padding: '0 16px' }}>
            {([
              { id: 'roles' as SyncTab, label: 'Vai trò', count: allRoles.length },
              { id: 'users' as SyncTab, label: 'Nhân viên', count: allEmps.length },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
                style={{
                  padding: '10px 0', background: 'transparent',
                  borderBottom: tab === t.id ? `2.5px solid ${HNH.navy}` : '2.5px solid transparent',
                  fontSize: 13, fontWeight: tab === t.id ? 700 : 600,
                  color: tab === t.id ? HNH.navy : HNH.ink3,
                }}
              >
                <Icon name={t.id === 'roles' ? 'shield' : 'users'} size={14} color={tab === t.id ? HNH.navy : HNH.ink3} stroke={2} />
                {t.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 6px',
                  background: tab === t.id ? HNH.navy50 : HNH.cream2,
                  color: tab === t.id ? HNH.navy : HNH.ink3,
                }}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Select all bar */}
        <div className="flex items-center justify-between" style={{
          padding: '8px 16px', background: HNH.cream, borderBottom: `1px solid ${HNH.line}`, flexShrink: 0,
        }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selCount > 0 && selCount === totalCount}
              onChange={selectAllItems}
              style={{ width: 16, height: 16, accentColor: HNH.navy }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>
              {selCount > 0 ? `Đã chọn ${selCount}` : 'Chọn tất cả'}
            </span>
          </label>
          {selCount > 0 && (
            <div className="flex items-center gap-1.5">
              {selectedHasNew && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 6, padding: '2px 6px' }}>
                  Tạo mới
                </span>
              )}
              {selectedHasSynced && (
                <span style={{ fontSize: 10, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 6, padding: '2px 6px' }}>
                  Cập nhật
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', background: HNH.cream, padding: '8px 16px 120px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
          ) : depts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Không có dữ liệu</div>
          ) : (
            depts.map(dept => {
              const items = tab === 'roles' ? dept.roles : dept.employees
              if (items.length === 0) return null
              const isOpen = expanded.has(dept.id)
              const deptSyncedCount = items.filter((i: SyncRole | SyncEmp) => i.kc_synced).length

              return (
                <div key={dept.id} style={{ marginBottom: 8 }}>
                  {/* Dept header */}
                  <button
                    onClick={() => {
                      const next = new Set(expanded)
                      if (next.has(dept.id)) next.delete(dept.id); else next.add(dept.id)
                      setExpanded(next)
                    }}
                    className="w-full flex items-center gap-2 border-none cursor-pointer"
                    style={{
                      background: '#fff', borderRadius: 12, padding: '10px 14px',
                      border: `1px solid ${HNH.line}`,
                    }}
                  >
                    <Icon name={isOpen ? 'chev-d' : 'chev-r'} size={14} color={HNH.ink3} stroke={2} />
                    <input
                      type="checkbox"
                      checked={items.length > 0 && items.every((i: SyncRole | SyncEmp) =>
                        tab === 'roles' ? selectedRoles.has(i.id) : selectedUsers.has(i.id)
                      )}
                      onChange={e => {
                        e.stopPropagation()
                        if (tab === 'roles') toggleDeptRoles(dept)
                        else toggleDeptUsers(dept)
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 16, height: 16, accentColor: HNH.navy }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, flex: 1, textAlign: 'left' }}>
                      {dept.name}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px',
                      color: deptSyncedCount === items.length ? HNH.success : HNH.warn,
                      background: deptSyncedCount === items.length ? HNH.success50 : HNH.warn50,
                    }}>
                      {deptSyncedCount}/{items.length}
                    </span>
                  </button>

                  {/* Items */}
                  {isOpen && (
                    <div style={{ padding: '4px 0 0 8px' }}>
                      {tab === 'roles' ? dept.roles.map(role => (
                        <label key={role.id} className="flex items-center gap-3 cursor-pointer" style={{
                          padding: '8px 12px', borderBottom: `1px solid ${HNH.line}`,
                          background: selectedRoles.has(role.id) ? HNH.navy50 : 'transparent',
                          borderRadius: 8, marginBottom: 2,
                        }}>
                          <input
                            type="checkbox" checked={selectedRoles.has(role.id)}
                            onChange={() => toggleRole(role.id)}
                            style={{ width: 16, height: 16, accentColor: HNH.navy, flexShrink: 0 }}
                          />
                          <div className="flex-1 min-w-0">
                            <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{role.name}</div>
                            {role.position && (
                              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>{role.position}</div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {role.kc_synced ? (
                              <>
                                <span style={{ fontSize: 10, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 6, padding: '2px 8px' }}>
                                  Đã đồng bộ
                                </span>
                                <span style={{ fontSize: 9, color: HNH.ink3 }}>{formatDate(role.synced_at)}</span>
                              </>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 700, color: HNH.warn, background: HNH.warn50, borderRadius: 6, padding: '2px 8px' }}>
                                Chưa đồng bộ
                              </span>
                            )}
                          </div>
                        </label>
                      )) : dept.employees.map(emp => (
                        <label key={emp.id} className="flex items-center gap-3 cursor-pointer" style={{
                          padding: '8px 12px', borderBottom: `1px solid ${HNH.line}`,
                          background: selectedUsers.has(emp.id) ? HNH.navy50 : 'transparent',
                          borderRadius: 8, marginBottom: 2,
                        }}>
                          <input
                            type="checkbox" checked={selectedUsers.has(emp.id)}
                            onChange={() => toggleUser(emp.id)}
                            style={{ width: 16, height: 16, accentColor: HNH.navy, flexShrink: 0 }}
                          />
                          <div className="flex-1 min-w-0">
                            <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{emp.name}</div>
                            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>{emp.email}</div>
                            {emp.role && (
                              <div style={{ fontSize: 10, color: HNH.ink2, marginTop: 1 }}>{emp.role}</div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {emp.kc_synced ? (
                              <>
                                <span style={{ fontSize: 10, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 6, padding: '2px 8px' }}>
                                  Đã đồng bộ
                                </span>
                                <span style={{ fontSize: 9, color: HNH.ink3 }}>{formatDate(emp.synced_at)}</span>
                              </>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 700, color: HNH.warn, background: HNH.warn50, borderRadius: 6, padding: '2px 8px' }}>
                                Chưa đồng bộ
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer action bar */}
        <div style={{
          position: isTablet ? 'relative' : 'fixed',
          bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: `1px solid ${HNH.line}`,
          padding: '12px 16px', flexShrink: 0,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
        }}>
          {result && (
            <div style={{
              marginBottom: 8, padding: '8px 12px', borderRadius: 10,
              background: result.ok ? HNH.success50 : HNH.red50,
              color: result.ok ? HNH.success : HNH.red,
              fontSize: 12, fontWeight: 700,
            }}>
              {result.ok ? 'Thành công: ' : 'Lỗi: '}{result.msg}
            </div>
          )}

          {selCount > 0 && (
            <div style={{ fontSize: 11, color: HNH.ink3, marginBottom: 6, textAlign: 'center' }}>
              {selectedHasNew && selectedHasSynced
                ? 'Tạo mới trên KC + Cập nhật đã có'
                : selectedHasNew
                  ? 'Tạo mới trên Keycloak'
                  : 'Cập nhật thông tin lên Keycloak'}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={selCount === 0 || syncing || !kcConnected}
              className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
              style={{
                padding: '12px 0', borderRadius: 14,
                background: selCount > 0 && kcConnected ? HNH.navy : HNH.cream2,
                color: selCount > 0 && kcConnected ? '#fff' : HNH.ink3,
                fontSize: 13, fontWeight: 700,
                opacity: syncing ? 0.6 : 1,
              }}
            >
              <Icon
                name={syncing ? 'refresh' : selectedHasSynced && !selectedHasNew ? 'refresh' : 'upload'}
                size={16}
                color={selCount > 0 && kcConnected ? '#fff' : HNH.ink3}
                stroke={2}
              />
              {syncing
                ? 'Đang...'
                : selCount === 0
                  ? 'Chọn mục để đồng bộ'
                  : `Đồng bộ ${selCount}`}
            </button>

            {tab === 'roles' && selectedSyncedCount > 0 && (
              <>
                <button
                  onClick={() => handleDelete(false)}
                  disabled={syncing}
                  className="flex items-center justify-center gap-1.5 border-none cursor-pointer"
                  style={{
                    padding: '12px 14px', borderRadius: 14,
                    background: HNH.warn50, color: HNH.warn,
                    fontSize: 12, fontWeight: 700,
                    opacity: syncing ? 0.6 : 1,
                  }}
                  title="Xóa mapping (giữ role trên KC)"
                >
                  <Icon name="x" size={14} color={HNH.warn} stroke={2.5} />
                  Xóa map
                </button>
                <button
                  onClick={() => handleDelete(true)}
                  disabled={syncing}
                  className="flex items-center justify-center gap-1.5 border-none cursor-pointer"
                  style={{
                    padding: '12px 14px', borderRadius: 14,
                    background: HNH.red50, color: HNH.red,
                    fontSize: 12, fontWeight: 700,
                    opacity: syncing ? 0.6 : 1,
                  }}
                  title="Xóa mapping + xóa role trên KC"
                >
                  <Icon name="x" size={14} color={HNH.red} stroke={2.5} />
                  Xóa KC
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Search ── */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2" style={{
      background: '#fff', borderRadius: 14, padding: '8px 14px',
      border: `1px solid ${HNH.line}`,
    }}>
      <Icon name="search" size={18} color={HNH.ink3} stroke={1.8} />
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder="Tìm vai trò, vị trí..."
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

/* ── Dept chips ── */
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

/* ── Main ── */
export function RolesPage() {
  const isTablet = useTablet()
  const [roles, setRoles] = useState<Role[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [kcRoles, setKcRoles] = useState<KcRole[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<number | null>(null)
  const [selected, setSelected] = useState<Role | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)

  const fetchRoles = useCallback(async (s: string, dept: number | null) => {
    setLoading(true)
    try {
      let path = '/api/base/role-directory/'
      const params: string[] = []
      if (s) params.push(`search=${encodeURIComponent(s)}`)
      if (dept) params.push(`department=${dept}`)
      if (params.length) path += '?' + params.join('&')
      const data = await api.get<Role[]>(path)
      setRoles(data)
    } catch { setRoles([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    api.get<Dept[]>('/api/employee/departments/').then(setDepts).catch(() => {})
    api.get<KcRole[]>('/api/base/keycloak/roles/').then(setKcRoles).catch(() => setKcRoles(null))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchRoles(search, deptFilter), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, deptFilter, fetchRoles])

  const grouped = roles.reduce<Record<string, Role[]>>((acc, r) => {
    const dept = r.department || 'Chưa phân phòng'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(r)
    return acc
  }, {})

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Quản lý Vai trò"
        trailing={
          <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, background: HNH.cream2, borderRadius: 8, padding: '4px 10px' }}>
            {roles.length} vai trò
          </div>
        }
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 900, margin: '0 auto' }}>
        <SearchBar value={search} onChange={setSearch} />

        {depts.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <DeptChips depts={depts} active={deptFilter} onPick={setDeptFilter} />
          </div>
        )}

        {/* KC Sync Button */}
        <button
          onClick={() => setShowSyncModal(true)}
          className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            marginTop: 14, padding: '12px 16px', borderRadius: 14,
            background: '#fff', border: `1px solid ${HNH.line}`,
          }}
        >
          <Icon name="globe" size={18} color={HNH.navy} stroke={2} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, flex: 1, textAlign: 'left' }}>
            Đồng bộ Keycloak
          </span>
          {kcRoles !== null ? (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 6, padding: '2px 8px' }}>
              Kết nối OK
            </span>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HNH.warn, background: HNH.warn50, borderRadius: 6, padding: '2px 8px' }}>
              Chưa kết nối
            </span>
          )}
          <Icon name="chev-r" size={16} color={HNH.ink3} stroke={2} />
        </button>

        {/* Role list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
        ) : roles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Không tìm thấy vai trò</div>
        ) : (
          Object.entries(grouped).map(([dept, deptRoles]) => (
            <div key={dept} style={{ marginTop: 16 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <div style={{ width: 3, height: 16, borderRadius: 2, background: HNH.navy }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{dept}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: HNH.ink3 }}>({deptRoles.length})</span>
              </div>
              <div className={isTablet ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2.5'}>
                {deptRoles.map(r => (
                  <RoleCard key={r.id} role={r} onTap={() => setSelected(r)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {selected && (
        <RoleDetailModal
          role={selected}
          kcRoles={kcRoles}
          onClose={() => setSelected(null)}
          onRoleUpdated={() => fetchRoles(search, deptFilter)}
          isTablet={isTablet}
        />
      )}

      {showSyncModal && (
        <KCSyncModal
          onClose={() => { setShowSyncModal(false); fetchRoles(search, deptFilter) }}
          isTablet={isTablet}
          kcConnected={kcRoles !== null}
        />
      )}
    </div>
  )
}
