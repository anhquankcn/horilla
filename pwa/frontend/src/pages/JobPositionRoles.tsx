import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

interface Dept { id: number; department: string }
interface Position { id: number; job_position: string; department_id: number; department_name: string; role_count: number; employee_count: number }
interface Role { id: number; job_role: string; job_position_id: number; job_position_name: string; department_name: string; employee_count: number }
interface LinkedEmp { id: number; name: string; badge_id: string; department: string }

const F = (url: string, opts?: RequestInit) => fetch(url, { credentials: 'include', ...opts })
const J = (url: string, body: any) => F(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const PUT = (url: string, body: any) => F(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const DEL = (url: string) => F(url, { method: 'DELETE' })

type Tab = 'positions' | 'roles'

export function JobPositionRolesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('positions')
  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create forms
  const [showAddPos, setShowAddPos] = useState(false)
  const [newPosName, setNewPosName] = useState('')
  const [newPosDept, setNewPosDept] = useState<number | ''>('')
  const [showAddRole, setShowAddRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePos, setNewRolePos] = useState<number | ''>('')

  // Edit
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'position' | 'role'; id: number; name: string } | null>(null)
  const [linkedEmps, setLinkedEmps] = useState<LinkedEmp[]>([])
  const [linkedRoles, setLinkedRoles] = useState<string[]>([])
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Filter
  const [filterDept, setFilterDept] = useState<number | ''>('')

  useEffect(() => {
    F('/bff/api/employee/departments/').then(r => r.json()).then(d => setDepts(Array.isArray(d) ? d : d.results || [])).catch(() => {})
  }, [])

  const loadPositions = useCallback(async () => {
    setLoading(true)
    const url = filterDept ? `/bff/api/base/job-mgmt/positions/?department_id=${filterDept}` : '/bff/api/base/job-mgmt/positions/'
    const r = await F(url)
    const d = await r.json()
    setPositions(d.results || [])
    setLoading(false)
  }, [filterDept])

  const loadRoles = useCallback(async () => {
    setLoading(true)
    const url = '/bff/api/base/job-mgmt/roles/'
    const r = await F(url)
    const d = await r.json()
    setRoles(d.results || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (tab === 'positions') loadPositions(); else loadRoles() }, [tab, loadPositions, loadRoles])

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  const flashErr = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000) }

  const handleAddPosition = async () => {
    if (!newPosName.trim() || !newPosDept) return
    const r = await J('/bff/api/base/job-mgmt/positions/', { job_position: newPosName.trim(), department_id: newPosDept })
    const d = await r.json()
    if (!r.ok) { flashErr(d.error || 'Lỗi'); return }
    flash(`Đã tạo vị trí "${d.job_position}"`)
    setNewPosName(''); setNewPosDept(''); setShowAddPos(false)
    loadPositions()
  }

  const handleAddRole = async () => {
    if (!newRoleName.trim() || !newRolePos) return
    const r = await J('/bff/api/base/job-mgmt/roles/', { job_role: newRoleName.trim(), job_position_id: newRolePos })
    const d = await r.json()
    if (!r.ok) { flashErr(d.error || 'Lỗi'); return }
    flash(`Đã tạo vai trò "${d.job_role}"`)
    setNewRoleName(''); setNewRolePos(''); setShowAddRole(false)
    loadRoles()
  }

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return
    const isPos = tab === 'positions'
    const url = isPos ? `/bff/api/base/job-mgmt/positions/${editId}/` : `/bff/api/base/job-mgmt/roles/${editId}/`
    const body = isPos ? { job_position: editName.trim() } : { job_role: editName.trim() }
    const r = await PUT(url, body)
    if (!r.ok) { const d = await r.json(); flashErr(d.error || 'Lỗi'); return }
    flash('Đã cập nhật')
    setEditId(null); setEditName('')
    if (isPos) loadPositions(); else loadRoles()
  }

  const startDelete = async (type: 'position' | 'role', id: number, name: string) => {
    setDeleteTarget({ type, id, name })
    setLinkedEmps([])
    setLinkedRoles([])
    if (type === 'role') {
      const r = await F(`/bff/api/base/job-mgmt/roles/${id}/`)
      const d = await r.json()
      setLinkedEmps(d.employees || [])
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const { type, id } = deleteTarget
    if (type === 'position') {
      const r = await DEL(`/bff/api/base/job-mgmt/positions/${id}/`)
      const d = await r.json()
      if (!r.ok) {
        setLinkedRoles(d.linked_roles || [])
        flashErr(d.message || d.error || 'Lỗi')
        setDeleteLoading(false)
        return
      }
      flash('Đã xóa vị trí')
      loadPositions()
    } else {
      const r = await DEL(`/bff/api/base/job-mgmt/roles/${id}/?force=true`)
      const d = await r.json()
      if (!r.ok) { flashErr(d.message || d.error || 'Lỗi'); setDeleteLoading(false); return }
      flash(`Đã xóa vai trò${linkedEmps.length > 0 ? ` và gỡ liên kết ${linkedEmps.length} NV` : ''}`)
      loadRoles()
    }
    setDeleteTarget(null)
    setDeleteLoading(false)
  }

  const filteredPositions = positions
  const filteredRoles = filterDept ? roles.filter(r => {
    const pos = positions.find(p => p.id === r.job_position_id)
    return pos ? pos.department_id === filterDept : true
  }) : roles

  return (
    <div style={{ flex: 1, background: HNH.cream }}>
      <TopBar onBack={() => navigate(-1)} title="Vị trí & Vai trò" sub="QUẢN LÝ VỊ TRÍ VÀ VAI TRÒ CÔNG VIỆC" />

      <div style={{ padding: '0 16px 120px' }}>
        {/* Tabs */}
        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          {(['positions', 'roles'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t ? HNH.navy : '#fff', color: tab === t ? '#fff' : HNH.ink,
              fontSize: 13, fontWeight: 700,
            }}>
              {t === 'positions' ? 'Vị trí' : 'Vai trò CV'}
            </button>
          ))}
        </div>

        {/* Filter by dept */}
        <select value={filterDept} onChange={e => setFilterDept(e.target.value ? parseInt(e.target.value) : '')}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, fontWeight: 600, background: '#fff', marginBottom: 12, boxSizing: 'border-box' }}>
          <option value="">Tất cả phòng ban</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.department}</option>)}
        </select>

        {/* Success / Error */}
        {success && <div style={{ padding: 10, borderRadius: 10, background: HNH.success50, marginBottom: 10, fontSize: 12, fontWeight: 600, color: HNH.success }}>{success}</div>}
        {error && <div style={{ padding: 10, borderRadius: 10, background: HNH.red50, marginBottom: 10, fontSize: 12, fontWeight: 600, color: HNH.red }}>{error}</div>}

        {/* Add button */}
        <button onClick={() => tab === 'positions' ? setShowAddPos(true) : setShowAddRole(true)}
          style={{ width: '100%', padding: '12px', borderRadius: 12, border: `2px dashed ${HNH.navy}40`, background: HNH.navy50, color: HNH.navy, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="plus" size={14} color={HNH.navy} stroke={2.5} />
          {tab === 'positions' ? 'Thêm Vị trí' : 'Thêm Vai trò'}
        </button>

        {/* Add Position Form */}
        {showAddPos && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${HNH.navy}30` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>Tạo Vị trí mới</div>
            <select value={newPosDept} onChange={e => setNewPosDept(parseInt(e.target.value) || '')}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}>
              <option value="">Chọn phòng ban...</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.department}</option>)}
            </select>
            <input value={newPosName} onChange={e => setNewPosName(e.target.value)} placeholder="Tên vị trí..."
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
            <div className="flex gap-2">
              <button onClick={() => setShowAddPos(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: HNH.ink3 }}>Hủy</button>
              <button onClick={handleAddPosition} disabled={!newPosName.trim() || !newPosDept}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: HNH.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !newPosName.trim() || !newPosDept ? 0.5 : 1 }}>Tạo</button>
            </div>
          </div>
        )}

        {/* Add Role Form */}
        {showAddRole && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${HNH.navy}30` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 10 }}>Tạo Vai trò mới</div>
            <select value={newRolePos} onChange={e => setNewRolePos(parseInt(e.target.value) || '')}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}>
              <option value="">Chọn vị trí...</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.job_position} — {p.department_name}</option>)}
            </select>
            <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Tên vai trò..."
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
            <div className="flex gap-2">
              <button onClick={() => setShowAddRole(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: HNH.ink3 }}>Hủy</button>
              <button onClick={handleAddRole} disabled={!newRoleName.trim() || !newRolePos}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: HNH.navy, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !newRoleName.trim() || !newRolePos ? 0.5 : 1 }}>Tạo</button>
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>}

        {/* Position list */}
        {!loading && tab === 'positions' && filteredPositions.map(p => (
          <div key={p.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: `1px solid ${HNH.line}` }}>
            {editId === p.id ? (
              <div className="flex gap-2 items-center">
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${HNH.navy}40`, fontSize: 13 }} />
                <button onClick={handleSaveEdit} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: HNH.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Lưu</button>
                <button onClick={() => setEditId(null)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: '#fff', fontSize: 11, cursor: 'pointer', color: HNH.ink3 }}>Hủy</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{p.job_position}</div>
                  <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{p.department_name}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span style={{ fontSize: 10, fontWeight: 700, color: HNH.navy, background: HNH.navy50, padding: '3px 8px', borderRadius: 6 }}>{p.role_count} vai trò</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: HNH.success, background: HNH.success50, padding: '3px 8px', borderRadius: 6 }}>{p.employee_count} NV</span>
                  <button onClick={() => { setEditId(p.id); setEditName(p.job_position) }} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Icon name="edit" size={14} color={HNH.ink3} />
                  </button>
                  <button onClick={() => startDelete('position', p.id, p.job_position)} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Icon name="trash" size={14} color={HNH.red} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Role list */}
        {!loading && tab === 'roles' && filteredRoles.map(r => (
          <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: `1px solid ${HNH.line}` }}>
            {editId === r.id ? (
              <div className="flex gap-2 items-center">
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${HNH.navy}40`, fontSize: 13 }} />
                <button onClick={handleSaveEdit} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: HNH.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Lưu</button>
                <button onClick={() => setEditId(null)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: '#fff', fontSize: 11, cursor: 'pointer', color: HNH.ink3 }}>Hủy</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{r.job_role}</div>
                  <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{r.job_position_name} · {r.department_name}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.employee_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: HNH.warn, background: HNH.warn50, padding: '3px 8px', borderRadius: 6 }}>{r.employee_count} NV</span>
                  )}
                  <button onClick={() => { setEditId(r.id); setEditName(r.job_role) }} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Icon name="edit" size={14} color={HNH.ink3} />
                  </button>
                  <button onClick={() => startDelete('role', r.id, r.job_role)} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Icon name="trash" size={14} color={HNH.red} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!loading && tab === 'positions' && filteredPositions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Chưa có vị trí nào</div>
        )}
        {!loading && tab === 'roles' && filteredRoles.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Chưa có vai trò nào</div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: HNH.red, marginBottom: 12 }}>
              Xóa {deleteTarget.type === 'position' ? 'Vị trí' : 'Vai trò'}: {deleteTarget.name}
            </div>

            {deleteTarget.type === 'role' && linkedEmps.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.warn, marginBottom: 8 }}>
                  {linkedEmps.length} nhân viên đang gán vai trò này sẽ bị gỡ liên kết:
                </div>
                {linkedEmps.map(e => (
                  <div key={e.id} className="flex items-center gap-2" style={{ padding: '6px 10px', borderRadius: 8, background: HNH.warn50, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink }}>{e.name}</span>
                    <span style={{ fontSize: 10, color: HNH.ink3, marginLeft: 'auto' }}>{e.badge_id} · {e.department}</span>
                  </div>
                ))}
              </div>
            )}

            {deleteTarget.type === 'role' && linkedEmps.length === 0 && (
              <div style={{ fontSize: 13, color: HNH.ink3, marginBottom: 16 }}>Vai trò chưa gán cho nhân viên nào. Xóa an toàn.</div>
            )}

            {deleteTarget.type === 'position' && linkedRoles.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: HNH.red, marginBottom: 8 }}>
                  Không thể xóa — đang liên kết {linkedRoles.length} vai trò:
                </div>
                {linkedRoles.map(r => (
                  <div key={r} style={{ fontSize: 12, color: HNH.ink, padding: '4px 10px', borderRadius: 6, background: HNH.red50, marginBottom: 3 }}>{r}</div>
                ))}
              </div>
            )}

            {deleteTarget.type === 'position' && linkedRoles.length === 0 && (
              <div style={{ fontSize: 13, color: HNH.ink3, marginBottom: 16 }}>Xác nhận xóa vị trí này?</div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${HNH.line}`, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: HNH.ink3 }}>Hủy</button>
              {!(deleteTarget.type === 'position' && linkedRoles.length > 0) && (
                <button onClick={confirmDelete} disabled={deleteLoading}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: HNH.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: deleteLoading ? 0.6 : 1 }}>
                  {deleteLoading ? 'Đang xóa...' : linkedEmps.length > 0 ? `Gỡ ${linkedEmps.length} NV & Xóa` : 'Xóa'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
