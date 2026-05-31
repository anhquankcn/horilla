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
  const kcMatch = kcRoles?.find(r => r.name === role.name)

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
      setSaveMsg(`Lỗi: ${e instanceof Error ? e.message : 'Unknown'}`)
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
                {kcRoles === null ? (
                  <div style={{ padding: 16, textAlign: 'center', color: HNH.warn, fontSize: 13 }}>
                    <Icon name="alert" size={20} color={HNH.warn} />
                    <div style={{ marginTop: 8 }}>Keycloak chưa được cấu hình hoặc không kết nối được</div>
                  </div>
                ) : kcMatch ? (
                  <div>
                    <div className="flex items-center gap-2" style={{ padding: '10px 0' }}>
                      <Icon name="check" size={18} color={HNH.success} stroke={2.5} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: HNH.success }}>Đã đồng bộ lên Keycloak</span>
                    </div>
                    <InfoItem label="KC Role ID" value={kcMatch.id} />
                    <InfoItem label="KC Role Name" value={kcMatch.name} />
                    <InfoItem label="Mô tả" value={kcMatch.description || '—'} />
                  </div>
                ) : (
                  <div style={{ padding: 16, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                    Vai trò này chưa được đồng bộ lên Keycloak Realm
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

/* ── Sync Panel ── */
function SyncPanel({ kcRoles, onSyncRoles, onSyncUsers, syncing }: {
  kcRoles: KcRole[] | null
  onSyncRoles: () => void
  onSyncUsers: () => void
  syncing: string | null
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: 16,
      border: `1px solid ${HNH.line}`, marginTop: 14,
    }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <Icon name="globe" size={18} color={HNH.navy} stroke={2} />
        <span style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>Keycloak Sync</span>
        {kcRoles !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.success, background: HNH.success50, borderRadius: 6, padding: '2px 8px', marginLeft: 'auto' }}>
            Kết nối OK · {kcRoles.length} roles
          </span>
        )}
        {kcRoles === null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.warn, background: HNH.warn50, borderRadius: 6, padding: '2px 8px', marginLeft: 'auto' }}>
            Chưa kết nối
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSyncRoles}
          disabled={syncing !== null || kcRoles === null}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '10px 14px', borderRadius: 12,
            background: kcRoles !== null ? HNH.navy : HNH.cream2,
            color: kcRoles !== null ? '#fff' : HNH.ink3,
            fontSize: 12.5, fontWeight: 700,
            opacity: syncing !== null ? 0.6 : 1,
          }}
        >
          <Icon name="arrow-up" size={14} color={kcRoles !== null ? '#fff' : HNH.ink3} stroke={2} />
          {syncing === 'roles' ? 'Đang đồng bộ...' : 'Sync Roles → KC'}
        </button>
        <button
          onClick={onSyncUsers}
          disabled={syncing !== null || kcRoles === null}
          className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
          style={{
            padding: '10px 14px', borderRadius: 12,
            background: kcRoles !== null ? HNH.red : HNH.cream2,
            color: kcRoles !== null ? '#fff' : HNH.ink3,
            fontSize: 12.5, fontWeight: 700,
            opacity: syncing !== null ? 0.6 : 1,
          }}
        >
          <Icon name="users" size={14} color={kcRoles !== null ? '#fff' : HNH.ink3} stroke={2} />
          {syncing === 'users' ? 'Đang đồng bộ...' : 'Sync Users → KC'}
        </button>
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
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

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

  const handleSyncRoles = useCallback(async () => {
    setSyncing('roles')
    setSyncMsg(null)
    try {
      const res = await api.post<{ ok: boolean; created?: number; exists?: number; error?: string }>(
        '/api/base/keycloak/sync-roles/', {}
      )
      if (res.ok) {
        setSyncMsg(`Roles: ${res.created} tạo mới, ${res.exists} đã tồn tại`)
        api.get<KcRole[]>('/api/base/keycloak/roles/').then(setKcRoles).catch(() => {})
      } else {
        setSyncMsg(`Lỗi: ${res.error}`)
      }
    } catch (e) {
      setSyncMsg(`Lỗi: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally { setSyncing(null) }
  }, [])

  const handleSyncUsers = useCallback(async () => {
    setSyncing('users')
    setSyncMsg(null)
    try {
      const res = await api.post<{ ok: boolean; created?: number; updated?: number; error?: string }>(
        '/api/base/keycloak/sync-users/', {}
      )
      if (res.ok) {
        setSyncMsg(`Users: ${res.created} tạo mới, ${res.updated} cập nhật`)
      } else {
        setSyncMsg(`Lỗi: ${res.error}`)
      }
    } catch (e) {
      setSyncMsg(`Lỗi: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally { setSyncing(null) }
  }, [])

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

        {/* KC Sync Panel */}
        <SyncPanel
          kcRoles={kcRoles}
          onSyncRoles={handleSyncRoles}
          onSyncUsers={handleSyncUsers}
          syncing={syncing}
        />
        {syncMsg && (
          <div style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 12,
            background: syncMsg.startsWith('Lỗi') ? HNH.red50 : HNH.success50,
            color: syncMsg.startsWith('Lỗi') ? HNH.red : HNH.success,
            fontSize: 12.5, fontWeight: 700,
          }}>
            {syncMsg}
          </div>
        )}

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
    </div>
  )
}
