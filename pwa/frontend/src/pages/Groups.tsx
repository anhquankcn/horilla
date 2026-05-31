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
}

interface AvailEmp {
  id: number
  first_name: string
  last_name: string
  badge_id: string | null
  department: string | null
  department_id: number | null
}

interface Dept { id: number; name: string }

/* ── Helpers ── */
const GROUP_COLORS = [HNH.navy, '#7c3aed', HNH.success, '#0891b2', '#c2410c', HNH.red]
function groupColor(id: number) { return GROUP_COLORS[id % GROUP_COLORS.length] }

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
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'hidden',
        borderRadius: 24, background: HNH.cream,
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
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

        {/* Dept filter */}
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

        {/* Select all button */}
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

        {/* List */}
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

        {/* Footer */}
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

/* ── Group Detail Modal ── */
function GroupDetailModal({ groupId, onClose, isTablet }: {
  groupId: number; onClose: () => void; isTablet: boolean
}) {
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
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
              <div style={{ width: 36 }} />
            </div>

            {/* Permissions section */}
            <div style={{ padding: '16px 16px 8px' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <Icon name="shield" size={15} color={HNH.navy} stroke={2} />
                <span style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>
                  Quyền ({detail.permissions.length})
                </span>
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
        {/* Search */}
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

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Không tìm thấy nhóm quyền
          </div>
        ) : (
          <div
            className={isTablet ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2.5'}
          >
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
