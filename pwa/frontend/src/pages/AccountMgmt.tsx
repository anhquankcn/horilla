import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'

interface Dept { id: number; name: string }
interface EmpPreview { id: number; name: string; email: string; badge_id: string; job_position: string; has_kc: boolean }
interface KcRole { id: string; name: string; description?: string }
interface BulkResult { id: number; status: string; email?: string; message?: string }

function extractDept(desc?: string): string {
  if (!desc) return ''
  const parts = desc.split(' - ')
  return parts.length >= 2 ? parts[parts.length - 1].trim().toUpperCase() : ''
}

export function AccountMgmtPage() {
  const navigate = useNavigate()
  const [depts, setDepts] = useState<Dept[]>([])
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [employees, setEmployees] = useState<EmpPreview[]>([])
  const [allRoles, setAllRoles] = useState<KcRole[]>([])
  const [selectedEmps, setSelectedEmps] = useState<Set<number>>(new Set())
  const [roleMap, setRoleMap] = useState<Record<number, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [results, setResults] = useState<BulkResult[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/bff/api/employee/departments/', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setDepts(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})

    fetch('/bff/api/employee/kc-options/', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setAllRoles(data.roles || []))
      .catch(() => {})
  }, [])

  const loadDept = useCallback(async (deptId: number) => {
    setSelectedDept(deptId)
    setLoading(true)
    setError('')
    setResults(null)
    setSelectedEmps(new Set())
    setRoleMap({})
    try {
      const res = await fetch(`/bff/api/employee/kc-dept-preview/?department_id=${deptId}`, { credentials: 'include' })
      const data = await res.json()
      const emps: EmpPreview[] = data.results || []
      setEmployees(emps)

      const deptName = depts.find(d => d.id === deptId)?.name?.toUpperCase() || ''
      const deptRoles = allRoles.filter(r =>
        !r.name.startsWith('default-roles') && !r.name.startsWith('uma_') && !r.name.startsWith('offline_')
        && extractDept(r.description).includes(deptName)
      )

      const needKc = emps.filter(e => !e.has_kc && e.email)
      const newSelected = new Set(needKc.map(e => e.id))
      setSelectedEmps(newSelected)

      const newRoleMap: Record<number, string[]> = {}
      for (const emp of needKc) {
        const posUpper = (emp.job_position || '').toUpperCase()
        const bestMatch = deptRoles.find(r => r.name.toUpperCase().includes(posUpper) || posUpper.includes(r.name.toUpperCase()))
        newRoleMap[emp.id] = bestMatch ? [bestMatch.id] : deptRoles.length > 0 ? [deptRoles[0].id] : []
      }
      setRoleMap(newRoleMap)
    } catch { setError('Lỗi tải dữ liệu') }
    setLoading(false)
  }, [depts, allRoles])

  const toggleEmp = (id: number) => {
    const s = new Set(selectedEmps)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelectedEmps(s)
  }

  const handleCreate = async () => {
    const empList = employees.filter(e => selectedEmps.has(e.id) && !e.has_kc && e.email)
    if (empList.length === 0) { setError('Không có NV nào để tạo'); return }
    setCreating(true)
    setError('')
    setResults(null)
    try {
      const body = {
        employees: empList.map(e => ({ id: e.id, roles: roleMap[e.id] || [] })),
      }
      const res = await fetch('/bff/api/employee/kc-bulk-create/', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResults(data.results || [])
      if (selectedDept) loadDept(selectedDept)
    } catch (e: any) { setError(e.message || 'Lỗi') }
    setCreating(false)
  }

  const needKcCount = employees.filter(e => !e.has_kc && e.email).length
  const deptName = depts.find(d => d.id === selectedDept)?.name || ''
  const deptRoles = allRoles.filter(r =>
    !r.name.startsWith('default-roles') && !r.name.startsWith('uma_') && !r.name.startsWith('offline_')
    && extractDept(r.description).includes(deptName.toUpperCase())
  )

  return (
    <div style={{ flex: 1, background: HNH.cream }}>
      <TopBar onBack={() => navigate(-1)} title="Quản lý Tài khoản" sub="CẤP TK KEYCLOAK HÀNG LOẠT" />

      <div style={{ padding: '0 16px 100px' }}>
        {/* Dept selector — chip badges */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 14, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
          <div className="flex gap-2" style={{ whiteSpace: 'nowrap', paddingBottom: 4 }}>
            {depts.map(d => (
              <button key={d.id} onClick={() => loadDept(d.id)}
                style={{
                  padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  background: selectedDept === d.id ? HNH.navy : '#fff',
                  color: selectedDept === d.id ? '#fff' : HNH.ink,
                  boxShadow: selectedDept === d.id ? `0 2px 8px ${HNH.navy}30` : `0 1px 3px rgba(0,0,0,0.06)`,
                }}>
                {d.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: 10, background: HNH.red50, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: HNH.red }}>{error}</span>
          </div>
        )}

        {/* Results */}
        {results && (
          <div style={{ padding: 14, borderRadius: 12, background: HNH.success50, marginBottom: 16, border: `1px solid ${HNH.success}30` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.success, marginBottom: 6 }}>
              Kết quả: {results.filter(r => r.status === 'ok').length} thành công / {results.length} tổng
            </div>
            {results.filter(r => r.status !== 'ok').map(r => (
              <div key={r.id} style={{ fontSize: 11, color: HNH.red, marginTop: 2 }}>#{r.id}: {r.message}</div>
            ))}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>Đang kiểm tra tài khoản KC...</div>}

        {!loading && selectedDept && (
          <>
            {/* Stats */}
            <div className="flex gap-3" style={{ marginBottom: 12 }}>
              <div style={{ flex: 1, padding: 12, borderRadius: 12, background: '#fff', border: `1px solid ${HNH.line}`, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: HNH.ink }}>{employees.length}</div>
                <div style={{ fontSize: 11, color: HNH.ink3 }}>Tổng NV</div>
              </div>
              <div style={{ flex: 1, padding: 12, borderRadius: 12, background: HNH.success50, border: `1px solid ${HNH.success}30`, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: HNH.success }}>{employees.filter(e => e.has_kc).length}</div>
                <div style={{ fontSize: 11, color: HNH.success }}>Đã có TK</div>
              </div>
              <div style={{ flex: 1, padding: 12, borderRadius: 12, background: HNH.warn50, border: `1px solid ${HNH.warn}30`, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: HNH.warn }}>{needKcCount}</div>
                <div style={{ fontSize: 11, color: HNH.warn }}>Chưa có TK</div>
              </div>
            </div>

            {/* Employee list */}
            {employees.filter(e => !e.has_kc && e.email).map(emp => (
              <div key={emp.id} style={{
                background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 8,
                border: `1px solid ${selectedEmps.has(emp.id) ? HNH.navy + '50' : HNH.line}`,
              }}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selectedEmps.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: HNH.ink3 }}>{emp.email} · {emp.job_position}</div>
                  </div>
                </div>
                {selectedEmps.has(emp.id) && (
                  <select
                    value={roleMap[emp.id]?.[0] || ''}
                    onChange={e => setRoleMap(prev => ({ ...prev, [emp.id]: e.target.value ? [e.target.value] : [] }))}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, marginTop: 8,
                      border: `1px solid ${HNH.line}`, fontSize: 12, background: HNH.navy50,
                    }}
                  >
                    <option value="">Không gán role</option>
                    {deptRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    <optgroup label="Phòng khác">
                      {allRoles.filter(r => !deptRoles.includes(r) && !r.name.startsWith('default-') && !r.name.startsWith('uma_') && !r.name.startsWith('offline_')).slice(0, 30).map(r =>
                        <option key={r.id} value={r.id}>{r.name}</option>
                      )}
                    </optgroup>
                  </select>
                )}
              </div>
            ))}

            {/* Already have KC */}
            {employees.filter(e => e.has_kc).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Đã có tài khoản KC ({employees.filter(e => e.has_kc).length})
                </div>
                {employees.filter(e => e.has_kc).map(emp => (
                  <div key={emp.id} className="flex items-center gap-2" style={{
                    padding: '8px 14px', borderRadius: 10, marginBottom: 4,
                    background: HNH.success50, border: `1px solid ${HNH.success}20`,
                  }}>
                    <Icon name="check" size={14} color={HNH.success} />
                    <span style={{ fontSize: 12, color: HNH.success, fontWeight: 600 }}>{emp.name}</span>
                    <span style={{ fontSize: 11, color: HNH.ink3, marginLeft: 'auto' }}>{emp.email}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Create button */}
            {needKcCount > 0 && (
              <button
                onClick={handleCreate}
                disabled={creating || selectedEmps.size === 0}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14, marginTop: 16,
                  background: creating || selectedEmps.size === 0 ? HNH.ink4 : HNH.navy,
                  color: '#fff', border: 'none', cursor: creating ? 'default' : 'pointer',
                  fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {creating ? 'Đang tạo...' : `Tạo ${selectedEmps.size} tài khoản KC`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
