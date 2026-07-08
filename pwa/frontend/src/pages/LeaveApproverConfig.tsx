import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'
import { EmployeeSearchSelect } from '../components/ui/EmployeeSearchSelect'

interface CBRule {
  id: number
  company_id: number | null
  company: string | null
  department_id: number | null
  department: string | null
  manager_id: number | null
  manager_name: string | null
  manager_badge: string | null
}

interface ApproverRow {
  id: number
  name: string
  badge_id: string
  department: string | null
  company: string | null
  reporting_manager: string | null
  cb_manager: string | null
}

interface Meta {
  results: { id: number; name: string; sub?: string; badge_id?: string; department?: string }[]
  companies: { id: number; name: string }[]
  departments: { id: number; name: string; company_ids: number[] }[]
}

export function LeaveApproverConfigPage() {
  const navigate = useNavigate()
  const [company, setCompany] = useState<number | ''>('')
  const [department, setDepartment] = useState<number | ''>('')
  const [formManager, setFormManager] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: rules, refresh: refreshRules } = useApi<CBRule[]>('/api/leave/hnh-cb-managers/')
  const { data: meta } = useApi<Meta>('/api/leave/select-candidates/')

  const mapUrl = (() => {
    const p = new URLSearchParams()
    if (company) p.set('company', String(company))
    if (department) p.set('department', String(department))
    const q = p.toString()
    return `/api/leave/hnh-approver-map/${q ? `?${q}` : ''}`
  })()
  const { data: approverMap } = useApi<ApproverRow[]>(mapUrl)

  const deptOptions = (meta?.departments ?? []).filter(d => !company || (d.company_ids ?? []).includes(company))
  const people = (meta?.results ?? []).map(e => ({
    id: e.id,
    name: e.name,
    sub: [e.badge_id, e.department].filter(Boolean).join(' · '),
  }))

  const handleSaveRule = async () => {
    if (!formManager) { setError('Chọn người duyệt'); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/api/leave/hnh-cb-managers/', {
        company_id: company || null,
        department_id: department || null,
        manager_id: formManager,
      })
      setFormManager(null)
      refreshRules()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Xoá rule người duyệt này?')) return
    try {
      await api.del(`/api/leave/hnh-cb-managers/${id}/`)
      refreshRules()
    } catch (e) {
      alert('Lỗi: ' + (e instanceof Error ? e.message : ''))
    }
  }

  const ruleScope = (r: CBRule) => {
    const parts = [r.department, r.company].filter(Boolean)
    return parts.length ? parts.join(' · ') : 'Toàn công ty (mặc định)'
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar onBack={() => navigate(-1)} title="Cấu hình duyệt phép" sub="NGƯỜI C&B DUYỆT THEO PHÒNG" />

      <div style={{ padding: '0 20px 100px' }}>
        {/* Bộ lọc công ty / phòng ban — dùng cho cả form rule lẫn bản đồ */}
        <div className="flex gap-2" style={{ marginBottom: 14 }}>
          <select
            value={company}
            onChange={e => { setCompany(e.target.value ? Number(e.target.value) : ''); setDepartment('') }}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, background: '#fff', color: HNH.ink }}
          >
            <option value="">Tất cả công ty</option>
            {(meta?.companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={department}
            onChange={e => setDepartment(e.target.value ? Number(e.target.value) : '')}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, background: '#fff', color: HNH.ink }}
          >
            <option value="">Tất cả phòng ban</option>
            {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Form thêm/cập nhật rule */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 14, marginBottom: 16, border: `1px solid ${HNH.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
            Gán người duyệt cho: <span style={{ color: HNH.red }}>{[
              department ? deptOptions.find(d => d.id === department)?.name : null,
              company ? (meta?.companies ?? []).find(c => c.id === company)?.name : null,
            ].filter(Boolean).join(' · ') || 'Toàn công ty (mặc định)'}</span>
          </div>
          {error && (
            <div style={{ background: HNH.red50, borderRadius: 10, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: HNH.red }}>{error}</div>
          )}
          <div style={{ marginBottom: 10 }}>
            <EmployeeSearchSelect
              employees={people}
              value={formManager}
              onChange={id => setFormManager(id)}
              placeholder="Chọn người C&B duyệt..."
            />
          </div>
          <button
            onClick={handleSaveRule}
            disabled={saving || !formManager}
            className="w-full border-none cursor-pointer"
            style={{
              height: 44, borderRadius: 12,
              background: !saving && formManager ? HNH.red : HNH.cream2,
              color: !saving && formManager ? '#fff' : HNH.ink3,
              fontWeight: 700, fontSize: 14,
            }}
          >
            {saving ? 'Đang lưu...' : 'Lưu rule'}
          </button>
        </div>

        {/* Danh sách rule hiện có */}
        <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, marginBottom: 8 }}>
          RULE HIỆN CÓ ({(rules ?? []).length})
        </div>
        {(rules ?? []).length === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', color: HNH.ink3, fontSize: 13, border: `1px solid ${HNH.line}`, marginBottom: 16 }}>
            Chưa có rule nào
          </div>
        )}
        {(rules ?? []).map(r => (
          <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, border: `1px solid ${HNH.line}` }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{r.manager_name}</div>
                <div style={{ fontSize: 11.5, color: HNH.navy, marginTop: 1 }}>{ruleScope(r)}</div>
              </div>
              <button
                onClick={() => handleDeleteRule(r.id)}
                className="flex items-center justify-center border-none cursor-pointer"
                style={{ width: 34, height: 34, borderRadius: 10, background: HNH.red50 }}
                title="Xoá rule"
              >
                <Icon name="trash" size={16} color={HNH.red} stroke={2} />
              </button>
            </div>
          </div>
        ))}

        {/* Bản đồ người duyệt mỗi NV */}
        <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, margin: '18px 0 8px' }}>
          NGƯỜI DUYỆT MỖI NHÂN VIÊN ({(approverMap ?? []).length})
        </div>
        {(approverMap ?? []).map(row => (
          <div key={row.id} style={{ background: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, border: `1px solid ${HNH.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{row.name}</div>
            <div style={{ fontSize: 11, color: HNH.navy, marginTop: 1 }}>{[row.badge_id, row.department].filter(Boolean).join(' · ')}</div>
            <div className="flex gap-4" style={{ marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: HNH.ink3, fontWeight: 600 }}>QUẢN LÝ TRỰC TIẾP</div>
                <div style={{ fontSize: 12.5, color: HNH.ink2 }}>{row.reporting_manager || '—'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: HNH.ink3, fontWeight: 600 }}>C&B DUYỆT</div>
                <div style={{ fontSize: 12.5, color: row.cb_manager ? HNH.ink2 : HNH.red }}>{row.cb_manager || 'Chưa gán'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
