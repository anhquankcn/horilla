import { useNavigate } from 'react-router-dom'
import { useState, useCallback, useEffect } from 'react'
import { api } from '../lib/api'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'

// ── Types ────────────────────────────────────────────────────────────────────

type TreeNode = {
  id: number
  name: string
  avatar: string | null
  badge_id: string
  position: string
  department: string
  manager_id: number | null
  children: TreeNode[]
}

type EmpFlat = {
  id: number
  name: string
  avatar: string | null
  badge_id: string
  position: string
  department: string
  manager_id: number | null
  manager_name: string
}

type MgrOption = {
  id: number
  name: string
  position: string
  department: string
}

type Tab = 'tree' | 'edit'

// ── Constants ────────────────────────────────────────────────────────────────

const DEPTH_COLORS = [HNH.red, '#e07b10', '#059669', '#6366f1', '#0284c7', '#7c3aed']

// ── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initials = name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2)
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: HNH.red, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700,
    }}>
      {initials}
    </div>
  )
}

// ── Tree View ────────────────────────────────────────────────────────────────

function TreeNodeCard({
  node, depth, expanded, onToggle,
}: {
  node: TreeNode
  depth: number
  expanded: Set<number>
  onToggle: (id: number) => void
}) {
  const isExpanded = expanded.has(node.id)
  const hasChildren = node.children.length > 0
  const lineColor = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)]

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: depth === 0 ? '#fff' : HNH.cream,
        border: `1px solid ${depth === 0 ? HNH.red + '40' : HNH.line}`,
        borderLeft: depth > 0 ? `3px solid ${lineColor}` : `3px solid ${HNH.red}`,
        borderRadius: 10, padding: '10px 12px', marginBottom: 6,
      }}>
        <Avatar src={node.avatar} name={node.name} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.name}
          </div>
          <div style={{ fontSize: 12, color: HNH.ink2, marginTop: 1 }}>
            {node.position || '—'}
          </div>
          {node.department && (
            <div style={{
              display: 'inline-block', marginTop: 3,
              background: lineColor + '18', color: lineColor,
              borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 500,
            }}>
              {node.department}
            </div>
          )}
        </div>
        {hasChildren && (
          <button
            onClick={() => onToggle(node.id)}
            style={{
              border: 'none', background: lineColor + '18', borderRadius: 20,
              padding: '4px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              color: lineColor, fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}
          >
            <span>{node.children.length}</span>
            <Icon name={isExpanded ? 'chev-d' : 'chev-r'} size={13} color={lineColor} />
          </button>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div style={{ marginLeft: 8, borderLeft: `2px dashed ${lineColor}40`, paddingLeft: 4, marginBottom: 4 }}>
          {node.children.map(child => (
            <TreeNodeCard
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Manager Picker Overlay ───────────────────────────────────────────────────

function ManagerPicker({
  emp,
  options,
  onSelect,
  onClose,
}: {
  emp: EmpFlat
  options: MgrOption[]
  onSelect: (managerId: number | null) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? options.filter(o =>
        o.name.toLowerCase().includes(q.toLowerCase()) ||
        o.position.toLowerCase().includes(q.toLowerCase()) ||
        o.department.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 50)
    : options.slice(0, 50)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: '100%', maxHeight: '75vh',
          background: '#fff', borderRadius: '18px 18px 0 0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${HNH.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, color: HNH.ink3 }}>Người quản lý cho</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: HNH.ink }}>{emp.name}</div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
              <Icon name="x" size={20} color={HNH.ink2} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <Icon name="search" size={16} color={HNH.ink3} />
            </div>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Tìm theo tên, chức vụ, phòng ban..."
              style={{
                width: '100%', boxSizing: 'border-box',
                border: `1px solid ${HNH.line}`, borderRadius: 8,
                padding: '8px 10px 8px 32px', fontSize: 14,
                outline: 'none', background: HNH.cream,
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Clear option */}
          <div
            onClick={() => onSelect(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', cursor: 'pointer',
              borderBottom: `1px solid ${HNH.line}`,
              background: !emp.manager_id ? HNH.red50 : 'transparent',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: HNH.cream2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="x" size={16} color={HNH.ink3} />
            </div>
            <div>
              <div style={{ fontSize: 14, color: HNH.ink2, fontStyle: 'italic' }}>Xóa người quản lý</div>
              <div style={{ fontSize: 11, color: HNH.ink3 }}>Nhân viên sẽ không có manager</div>
            </div>
          </div>

          {filtered.map(opt => {
            const isCurrentMgr = opt.id === emp.manager_id
            return (
              <div
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', cursor: 'pointer',
                  background: isCurrentMgr ? HNH.red50 : 'transparent',
                  borderBottom: `1px solid ${HNH.line}`,
                }}
              >
                <Avatar src={null} name={opt.name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: isCurrentMgr ? 700 : 400, color: isCurrentMgr ? HNH.red : HNH.ink }}>
                    {opt.name}
                    {isCurrentMgr && <span style={{ marginLeft: 6, fontSize: 11, background: HNH.red, color: '#fff', borderRadius: 4, padding: '1px 5px' }}>Hiện tại</span>}
                  </div>
                  <div style={{ fontSize: 12, color: HNH.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[opt.position, opt.department].filter(Boolean).join(' • ')}
                  </div>
                </div>
                {isCurrentMgr && <Icon name="check" size={16} color={HNH.red} />}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: HNH.ink3, fontSize: 14 }}>
              Không tìm thấy nhân viên
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Edit Row ─────────────────────────────────────────────────────────────────

function EditRow({ emp, onEditClick }: { emp: EmpFlat; onEditClick: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderBottom: `1px solid ${HNH.line}`,
      background: '#fff',
    }}>
      <Avatar src={emp.avatar} name={emp.name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {emp.name}
        </div>
        <div style={{ fontSize: 12, color: HNH.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {emp.position || '—'}{emp.department ? ` • ${emp.department}` : ''}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, color: emp.manager_name ? HNH.ink2 : HNH.ink3, fontStyle: emp.manager_name ? 'normal' : 'italic' }}>
          {emp.manager_name ? `↑ ${emp.manager_name}` : 'Chưa có người quản lý'}
        </div>
      </div>
      <button
        onClick={onEditClick}
        style={{
          border: `1px solid ${HNH.line}`, background: HNH.cream,
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          color: HNH.ink2, fontSize: 12, flexShrink: 0,
        }}
      >
        <Icon name="pencil" size={14} color={HNH.ink2} />
        Sửa
      </button>
    </div>
  )
}

// ── Search Result Card ────────────────────────────────────────────────────────

function SearchResultCard({ node }: { node: TreeNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: '#fff', border: `1px solid ${HNH.line}`,
      borderRadius: 10, padding: '10px 12px', marginBottom: 6,
    }}>
      <Avatar src={node.avatar} name={node.name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink }}>{node.name}</div>
        <div style={{ fontSize: 12, color: HNH.ink3 }}>
          {[node.position, node.department].filter(Boolean).join(' • ')}
        </div>
        <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 1 }}>
          {node.children.length > 0 && `Quản lý ${node.children.length} người`}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function OrgChartPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('tree')

  // Tree tab state
  const [tree, setTree] = useState<TreeNode[]>([])
  const [treeTotal, setTreeTotal] = useState(0)
  const [withoutMgr, setWithoutMgr] = useState(0)
  const [treeLoading, setTreeLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [treeSearch, setTreeSearch] = useState('')
  const [flatForSearch, setFlatForSearch] = useState<TreeNode[]>([])

  // Edit tab state
  const [employees, setEmployees] = useState<EmpFlat[]>([])
  const [managersSelect, setManagersSelect] = useState<MgrOption[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [deptFilter, setDeptFilter] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editSearch, setEditSearch] = useState('')
  const [editingEmp, setEditingEmp] = useState<EmpFlat | null>(null)
  const [saving, setSaving] = useState(false)

  const [canEdit, setCanEdit] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // Flatten tree for search
  const flattenTree = useCallback((nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = []
    const walk = (arr: TreeNode[]) => {
      for (const n of arr) {
        result.push(n)
        if (n.children.length) walk(n.children)
      }
    }
    walk(nodes)
    return result
  }, [])

  const fetchTree = useCallback(async () => {
    setTreeLoading(true)
    try {
      const res = await api.get('/api/employee/org-chart/?tab=tree') as any
      setTree(res.tree || [])
      setTreeTotal(res.total || 0)
      setWithoutMgr(res.without_manager || 0)
      setCanEdit(res.can_edit || false)
      setDepartments(res.departments || [])
      setFlatForSearch(flattenTree(res.tree || []))

      // Auto-expand first-level (root children)
      const firstLevel = new Set<number>()
      for (const root of res.tree || []) {
        firstLevel.add(root.id)
      }
      setExpanded(firstLevel)
    } catch {
      showToast('Không thể tải cây tổ chức')
    } finally {
      setTreeLoading(false)
    }
  }, [flattenTree])

  const fetchList = useCallback(async () => {
    setEditLoading(true)
    try {
      const params = new URLSearchParams({ tab: 'list' })
      if (deptFilter) params.set('department', deptFilter)
      if (editSearch) params.set('q', editSearch)
      const res = await api.get(`/api/employee/org-chart/?${params}`) as any
      setEmployees(res.employees || [])
      setManagersSelect(res.managers_select || [])
      setDepartments(res.departments || [])
      setCanEdit(res.can_edit || false)
    } catch {
      showToast('Không thể tải danh sách nhân viên')
    } finally {
      setEditLoading(false)
    }
  }, [deptFilter, editSearch])

  useEffect(() => { fetchTree() }, [fetchTree])

  useEffect(() => {
    if (tab === 'edit') fetchList()
  }, [tab, fetchList])

  const toggleExpand = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpanded(new Set(flatForSearch.map(n => n.id)))
  }, [flatForSearch])

  const collapseAll = useCallback(() => setExpanded(new Set()), [])

  const handleSetManager = useCallback(async (managerId: number | null) => {
    if (!editingEmp) return
    setSaving(true)
    try {
      await api.post('/api/employee/org-chart/', {
        action: 'set_manager',
        employee_id: editingEmp.id,
        manager_id: managerId,
      })
      setEmployees(prev => prev.map(e =>
        e.id === editingEmp.id
          ? {
              ...e,
              manager_id: managerId,
              manager_name: managerId ? (managersSelect.find(m => m.id === managerId)?.name || '') : '',
            }
          : e
      ))
      showToast(managerId ? 'Đã cập nhật người quản lý' : 'Đã xóa người quản lý')
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi cập nhật')
    } finally {
      setSaving(false)
      setEditingEmp(null)
    }
  }, [editingEmp, managersSelect])

  // Filter tree search
  const treeSearchResults = treeSearch.trim()
    ? flatForSearch.filter(n =>
        n.name.toLowerCase().includes(treeSearch.toLowerCase()) ||
        n.position.toLowerCase().includes(treeSearch.toLowerCase()) ||
        n.department.toLowerCase().includes(treeSearch.toLowerCase())
      )
    : []

  // Filter employees in edit tab
  const filteredEmployees = editSearch.trim()
    ? employees.filter(e =>
        e.name.toLowerCase().includes(editSearch.toLowerCase()) ||
        e.position.toLowerCase().includes(editSearch.toLowerCase())
      )
    : employees

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: HNH.cream, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#fff', padding: '14px 16px 0', borderBottom: `1px solid ${HNH.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: HNH.ink }}>Cây tổ chức</div>
            <div style={{ fontSize: 12, color: HNH.ink3 }}>{treeTotal} nhân viên · {withoutMgr} chưa có manager</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'tree' && (
              <>
                <button onClick={expandAll} style={btnStyle}>Mở rộng</button>
                <button onClick={collapseAll} style={btnStyle}>Thu gọn</button>
                <button onClick={fetchTree} style={{ ...btnStyle, background: HNH.red, color: '#fff', borderColor: HNH.red }}>Cập nhật</button>
              </>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {([['tree', 'sitemap', 'Cây tổ chức'], ['edit', 'pencil', 'Phân công']] as [Tab, string, string][])
            .filter(([t]) => t !== 'edit' || canEdit)
            .map(([t, icon, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, border: 'none', background: 'none', cursor: 'pointer',
                  padding: '8px 0 10px',
                  borderBottom: tab === t ? `2px solid ${HNH.red}` : '2px solid transparent',
                  color: tab === t ? HNH.red : HNH.ink3,
                  fontWeight: tab === t ? 700 : 400, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Icon name={icon} size={16} color={tab === t ? HNH.red : HNH.ink3} />
                {label}
              </button>
            ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

        {/* ── Tree Tab ── */}
        {tab === 'tree' && (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <Icon name="search" size={16} color={HNH.ink3} />
              </div>
              <input
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="Tìm nhân viên, chức vụ, phòng ban..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: `1px solid ${HNH.line}`, borderRadius: 10,
                  padding: '9px 10px 9px 32px', fontSize: 14,
                  outline: 'none', background: '#fff',
                }}
              />
              {treeSearch && (
                <button
                  onClick={() => setTreeSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}
                >
                  <Icon name="x" size={16} color={HNH.ink3} />
                </button>
              )}
            </div>

            {treeLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Đang tải...</div>
            ) : treeSearch.trim() ? (
              <>
                <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 8 }}>{treeSearchResults.length} kết quả</div>
                {treeSearchResults.length === 0
                  ? <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Không tìm thấy</div>
                  : treeSearchResults.map(n => <SearchResultCard key={n.id} node={n} />)
                }
              </>
            ) : (
              tree.map(root => (
                <TreeNodeCard
                  key={root.id}
                  node={root}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggleExpand}
                />
              ))
            )}
          </>
        )}

        {/* ── Edit Tab ── */}
        {tab === 'edit' && (
          <>
            {/* Dept filter */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
              {['', ...departments].map(d => (
                <button
                  key={d || '__all'}
                  onClick={() => setDeptFilter(d)}
                  style={{
                    border: `1px solid ${deptFilter === d ? HNH.red : HNH.line}`,
                    background: deptFilter === d ? HNH.red : '#fff',
                    color: deptFilter === d ? '#fff' : HNH.ink2,
                    borderRadius: 20, padding: '5px 12px', fontSize: 12,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {d || 'Tất cả'}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <Icon name="search" size={16} color={HNH.ink3} />
              </div>
              <input
                value={editSearch}
                onChange={e => setEditSearch(e.target.value)}
                placeholder="Tìm nhân viên..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: `1px solid ${HNH.line}`, borderRadius: 10,
                  padding: '9px 10px 9px 32px', fontSize: 14,
                  outline: 'none', background: '#fff',
                }}
              />
            </div>

            {editLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3 }}>Đang tải...</div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', background: HNH.cream, borderBottom: `1px solid ${HNH.line}`, fontSize: 12, color: HNH.ink3 }}>
                  {filteredEmployees.length} nhân viên
                </div>
                {filteredEmployees.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: HNH.ink3 }}>Không có nhân viên nào</div>
                ) : (
                  filteredEmployees.map(emp => (
                    <EditRow
                      key={emp.id}
                      emp={emp}
                      onEditClick={() => setEditingEmp(emp)}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Manager Picker Overlay */}
      {editingEmp && (
        <ManagerPicker
          emp={editingEmp}
          options={managersSelect.filter(o => o.id !== editingEmp.id)}
          onSelect={handleSetManager}
          onClose={() => setEditingEmp(null)}
        />
      )}

      {/* Saving overlay */}
      {saving && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 24px', fontWeight: 600, color: HNH.ink }}>
            Đang lưu...
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: HNH.ink, color: '#fff', borderRadius: 20,
          padding: '8px 18px', fontSize: 13, fontWeight: 500,
          zIndex: 400, pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  border: `1px solid ${HNH.line}`,
  background: '#fff',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  color: HNH.ink2,
}
