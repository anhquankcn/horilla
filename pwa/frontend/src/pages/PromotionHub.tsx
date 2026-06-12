import { useNavigate } from 'react-router-dom'
import { useState, useCallback, useEffect } from 'react'
import { api } from '../lib/api'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { EmployeeSearchSelect } from '../components/ui/EmployeeSearchSelect'

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'ninebox' | 'nominations' | 'approvals' | 'announcements'

type EmpOption = { id: number; employee_first_name: string; employee_last_name: string }
type PosOption = { id: number; job_position: string }
type DeptOption = { id: number; department: string }

type NineBoxAssessment = {
  id: number
  employee_id: number
  employee_name: string
  employee_avatar: string | null
  assessed_by_name: string
  period: string
  performance: number
  potential: number
  quadrant_label: string
  notes: string
  assessed_date: string
}

type ApprovalStep = {
  id: number
  order: number
  role: string
  role_label: string
  approver_id: number
  approver_name: string
  status: string
  status_label: string
  comment: string
  decided_at: string | null
}

type Announcement = {
  id: number
  title: string
  content: string
  is_published: boolean
  published_at: string | null
}

type Nomination = {
  id: number
  employee_id: number
  employee_name: string
  employee_avatar: string | null
  nominated_by_name: string
  status: string
  status_label: string
  current_job_position: string
  proposed_job_position: string
  current_department: string
  proposed_department: string
  nomination_reason: string
  expected_date: string | null
  effective_date: string | null
  decision_notes: string
  created_at: string
  ninebox_id: number | null
  ninebox_label: string
  steps?: ApprovalStep[]
  announcement?: Announcement | null
}

type PendingStep = {
  step_id: number
  nomination_id: number
  employee_name: string
  proposed_position: string
  role_label: string
  order: number
}

type OverviewStats = { draft: number; reviewing: number; approved: number; decided: number; announced: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initials = name.split(' ').slice(-2).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: HNH.red50,
      color: HNH.red, fontWeight: 700, fontSize: size * 0.36,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

const PERF_LABELS: Record<number, string> = { 1: 'Cần cải thiện', 2: 'Đạt yêu cầu', 3: 'Xuất sắc' }
const POT_LABELS: Record<number, string> = { 1: 'Tiềm năng thấp', 2: 'Tiềm năng trung bình', 3: 'Tiềm năng cao' }

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  draft:      { bg: '#f0f0f0', color: '#666' },
  submitted:  { bg: HNH.navy50, color: HNH.navy },
  reviewing:  { bg: HNH.warn50, color: HNH.warn },
  approved:   { bg: HNH.success50, color: HNH.success },
  rejected:   { bg: HNH.red50, color: HNH.red },
  decided:    { bg: HNH.goldSoft, color: '#a87908' },
  announced:  { bg: HNH.success50, color: HNH.success },
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const c = STATUS_COLOR[status] ?? { bg: '#eee', color: '#444' }
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  )
}

const NINEBOX_GRID: Record<string, { perf: number; pot: number; color: string }> = {
  'Ngôi sao':             { perf: 3, pot: 3, color: HNH.red },
  'Tiềm năng nổi bật':    { perf: 2, pot: 3, color: '#7c3aed' },
  'Bí ẩn':                { perf: 1, pot: 3, color: '#6366f1' },
  'Nhân tài thực dụng':   { perf: 3, pot: 2, color: '#e07b10' },
  'Cốt lõi':              { perf: 2, pot: 2, color: HNH.success },
  'Rủi ro':               { perf: 1, pot: 2, color: HNH.warn },
  'Hiệu suất cao':        { perf: 3, pot: 1, color: '#0284c7' },
  'Ổn định':              { perf: 2, pot: 1, color: HNH.ink2 },
  'Cần hỗ trợ':           { perf: 1, pot: 1, color: HNH.ink3 },
}

function quadrantColor(label: string): string {
  return NINEBOX_GRID[label]?.color ?? HNH.ink3
}

// ── NineBox Grid Visual ───────────────────────────────────────────────────────

function NineBoxGrid({ assessments }: { assessments: NineBoxAssessment[] }) {
  const cells: Record<string, NineBoxAssessment[]> = {}
  for (let p = 1; p <= 3; p++) for (let po = 1; po <= 3; po++) cells[`${p}_${po}`] = []
  for (const a of assessments) cells[`${a.performance}_${a.potential}`]?.push(a)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 2, marginBottom: 16 }}>
      {/* Y axis label */}
      <div style={{ gridColumn: '1', gridRow: '1 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, color: HNH.ink3, fontWeight: 600, letterSpacing: 1 }}>
          TIỀM NĂNG ↑
        </span>
      </div>
      {/* Headers */}
      {[3, 2, 1].map(pot => (
        [1, 2, 3].map(perf => {
          const key = `${perf}_${pot}`
          const list = cells[key] ?? []
          const labels = Object.entries(NINEBOX_GRID).find(([, v]) => v.perf === perf && v.pot === pot)
          const label = labels?.[0] ?? ''
          const col = quadrantColor(label)
          return (
            <div key={key} style={{
              background: col + '15',
              border: `1px solid ${col}40`,
              borderRadius: 6,
              padding: '8px 6px 6px',
              minHeight: 72,
            }}>
              <div style={{ fontSize: 10, color: col, fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
              </div>
              {list.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <Avatar src={a.employee_avatar} name={a.employee_name} size={20} />
                  <span style={{ fontSize: 10, color: HNH.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.employee_name.split(' ').slice(-1)[0]}
                  </span>
                </div>
              ))}
              {list.length === 0 && <div style={{ fontSize: 10, color: HNH.ink4 }}>—</div>}
            </div>
          )
        })
      ))}
      {/* X axis */}
      <div />
      {['Cần cải thiện', 'Đạt yêu cầu', 'Xuất sắc'].map(l => (
        <div key={l} style={{ textAlign: 'center', fontSize: 10, color: HNH.ink3, fontWeight: 600, paddingTop: 4 }}>{l}</div>
      ))}
      <div style={{ gridColumn: '2 / 5', textAlign: 'center', fontSize: 10, color: HNH.ink3, fontWeight: 600, letterSpacing: 1 }}>
        HIỆU SUẤT →
      </div>
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ pendingMine, stats, canManage, onNavigate }: {
  pendingMine: PendingStep[]
  stats: OverviewStats
  canManage: boolean
  onNavigate: (tab: Tab) => void
}) {
  return (
    <div style={{ padding: '0 16px 80px' }}>
      {canManage && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Nháp', value: stats.draft, color: HNH.ink3, tab: 'nominations' as Tab },
            { label: 'Đang duyệt', value: stats.reviewing, color: HNH.warn, tab: 'approvals' as Tab },
            { label: 'Đã phê duyệt', value: stats.approved, color: HNH.success, tab: 'approvals' as Tab },
            { label: 'Đã quyết định', value: stats.decided, color: '#a87908', tab: 'announcements' as Tab },
          ].map(s => (
            <button key={s.label} onClick={() => onNavigate(s.tab)} style={{
              background: HNH.white, border: `1px solid ${HNH.line}`, borderRadius: 10,
              padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{s.label}</div>
            </button>
          ))}
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink, marginBottom: 10 }}>
        Chờ phê duyệt của bạn
      </div>
      {pendingMine.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: HNH.ink3, fontSize: 13 }}>
          Không có hồ sơ nào chờ bạn phê duyệt
        </div>
      ) : (
        pendingMine.map(s => (
          <div key={s.step_id} style={{
            background: HNH.white, border: `1px solid ${HNH.line}`, borderRadius: 10,
            padding: '12px 14px', marginBottom: 8,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink }}>{s.employee_name}</div>
            <div style={{ fontSize: 12, color: HNH.ink2, marginTop: 2 }}>{s.proposed_position}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 4 }}>Vai trò: {s.role_label} · Bước {s.order}</div>
            <button
              onClick={() => onNavigate('approvals')}
              style={{
                marginTop: 8, background: HNH.red, color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Xử lý
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// ── NineBox Tab ───────────────────────────────────────────────────────────────

function NineBoxTab({ canManage }: { canManage: boolean }) {
  const [assessments, setAssessments] = useState<NineBoxAssessment[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [employees, setEmployees] = useState<EmpOption[]>([])
  const [period, setPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employee_id: '', period: '', performance: '2', potential: '2', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const load = useCallback(async (p: string) => {
    setLoading(true)
    try {
      const res = await api.get(`/api/employee/promotion-hub/?tab=ninebox${p ? '&period=' + p : ''}`) as any
      setAssessments(res.assessments ?? [])
      setPeriods(res.periods ?? [])
      setEmployees(res.employees ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [load, period])

  const handleSave = async () => {
    if (!form.employee_id || !form.period) return
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/api/employee/promotion-hub/', { action: 'assess_ninebox', ...form })
      setShowForm(false)
      setForm({ employee_id: '', period: '', performance: '2', potential: '2', notes: '' })
      load(period)
    } catch (e: any) {
      setFormError(e?.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '0 16px 80px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, background: HNH.white }}
        >
          <option value="">Tất cả kỳ</option>
          {periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, cursor: 'pointer', fontSize: 12 }}
        >
          {viewMode === 'grid' ? 'Danh sách' : 'Lưới 9-Box'}
        </button>
        {canManage && (
          <button
            onClick={() => setShowForm(true)}
            style={{ padding: '8px 14px', borderRadius: 8, background: HNH.red, color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            + Đánh giá
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3 }}>Đang tải...</div>
      ) : viewMode === 'grid' ? (
        <NineBoxGrid assessments={assessments} />
      ) : (
        assessments.map(a => (
          <div key={a.id} style={{
            background: HNH.white, border: `1px solid ${HNH.line}`, borderRadius: 10,
            padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <Avatar src={a.employee_avatar} name={a.employee_name} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink }}>{a.employee_name}</div>
              <div style={{ fontSize: 12, color: HNH.ink2, marginTop: 2 }}>{a.period} · {a.assessed_date}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ background: HNH.red50, color: HNH.red, borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
                  Hiệu suất: {PERF_LABELS[a.performance]}
                </span>
                <span style={{ background: HNH.navy50, color: HNH.navy, borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
                  Tiềm năng: {POT_LABELS[a.potential]}
                </span>
                <span style={{ background: quadrantColor(a.quadrant_label) + '18', color: quadrantColor(a.quadrant_label), borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  {a.quadrant_label}
                </span>
              </div>
              {a.notes && <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 4 }}>{a.notes}</div>}
            </div>
          </div>
        ))
      )}
      {/* Assess Form Sheet */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink, marginBottom: 16 }}>Đánh giá 9-Box</div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Nhân viên *</label>
            <div style={{ marginTop: 4, marginBottom: 12 }}>
              <EmployeeSearchSelect
                employees={employees.map(e => ({ id: e.id, name: `${e.employee_last_name} ${e.employee_first_name}`.trim() }))}
                value={Number(form.employee_id) || null}
                onChange={id => setForm(f => ({ ...f, employee_id: String(id ?? '') }))}
                placeholder="Nhập tên nhân viên..."
              />
            </div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Kỳ đánh giá *</label>
            <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
              placeholder="VD: 2025-H1, 2025-Q2"
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Hiệu suất *</label>
            <select value={form.performance} onChange={e => setForm(f => ({ ...f, performance: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, background: HNH.white }}>
              {Object.entries(PERF_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Tiềm năng *</label>
            <select value={form.potential} onChange={e => setForm(f => ({ ...f, potential: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, background: HNH.white }}>
              {Object.entries(POT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Ghi chú</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} placeholder="Nhận xét, quan sát..."
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 16, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }} />
            {formError && (
              <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{formError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowForm(false); setFormError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, background: HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Đang lưu...' : 'Lưu đánh giá'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Nominations Tab ───────────────────────────────────────────────────────────

function NominationsTab({ canManage }: { canManage: boolean }) {
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [employees, setEmployees] = useState<EmpOption[]>([])
  const [positions, setPositions] = useState<PosOption[]>([])
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<Nomination | null>(null)
  const [showSubmit, setShowSubmit] = useState<Nomination | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_id: '', nomination_reason: '', expected_date: '',
    proposed_job_position_id: '', proposed_department_id: '',
    current_job_position_id: '', current_department_id: '',
  })
  const [steps, setSteps] = useState<{ approver_id: string; role: string }[]>([{ approver_id: '', role: 'hr' }])
  const [createError, setCreateError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/api/employee/promotion-hub/?tab=nominations${statusFilter ? '&status=' + statusFilter : ''}`) as any
      setNominations(res.nominations ?? [])
      setEmployees(res.employees ?? [])
      setPositions(res.positions ?? [])
      setDepartments(res.departments ?? [])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.employee_id) return
    setSaving(true)
    setCreateError(null)
    try {
      await api.post('/api/employee/promotion-hub/', { action: 'create_nomination', ...form })
      setShowCreate(false)
      setForm({ employee_id: '', nomination_reason: '', expected_date: '', proposed_job_position_id: '', proposed_department_id: '', current_job_position_id: '', current_department_id: '' })
      load()
    } catch (e: any) {
      setCreateError(e?.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!showSubmit) return
    const valid = steps.filter(s => s.approver_id)
    if (!valid.length) return
    setSaving(true)
    setSubmitError(null)
    try {
      await api.post('/api/employee/promotion-hub/', {
        action: 'submit_nomination',
        nomination_id: showSubmit.id,
        steps: valid,
      })
      setShowSubmit(null)
      load()
    } catch (e: any) {
      setSubmitError(e?.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  const STATUS_OPTS = [
    { v: '', l: 'Tất cả' }, { v: 'draft', l: 'Nháp' }, { v: 'submitted', l: 'Đã đề xuất' },
    { v: 'reviewing', l: 'Đang xem xét' }, { v: 'approved', l: 'Đã phê duyệt' },
    { v: 'rejected', l: 'Từ chối' }, { v: 'decided', l: 'Đã quyết định' }, { v: 'announced', l: 'Đã công bố' },
  ]


  return (
    <div style={{ padding: '0 16px 80px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, background: HNH.white }}>
          {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '8px 14px', borderRadius: 8, background: HNH.red, color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + Tạo
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3 }}>Đang tải...</div>
      ) : nominations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3, fontSize: 13 }}>Chưa có hồ sơ đề xuất</div>
      ) : (
        nominations.map(n => (
          <div key={n.id} style={{
            background: HNH.white, border: `1px solid ${HNH.line}`, borderRadius: 10,
            padding: '12px 14px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Avatar src={n.employee_avatar} name={n.employee_name} size={38} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink }}>{n.employee_name}</div>
                <div style={{ fontSize: 12, color: HNH.ink2 }}>
                  {n.current_job_position || '—'} → <span style={{ color: HNH.red, fontWeight: 600 }}>{n.proposed_job_position || '—'}</span>
                </div>
              </div>
              <StatusBadge status={n.status} label={n.status_label} />
            </div>
            {n.ninebox_label && (
              <div style={{ fontSize: 11, color: quadrantColor(n.ninebox_label), fontWeight: 600, marginBottom: 4 }}>
                9-Box: {n.ninebox_label}
              </div>
            )}
            <div style={{ fontSize: 12, color: HNH.ink3 }}>Tạo: {n.created_at} · Người đề xuất: {n.nominated_by_name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowDetail(n)}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 12, cursor: 'pointer' }}>
                Chi tiết
              </button>
              {n.status === 'draft' && canManage && (
                <button onClick={() => { setShowSubmit(n); setSteps([{ approver_id: '', role: 'hr' }]) }}
                  style={{ padding: '5px 12px', borderRadius: 6, background: HNH.red, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Gửi phê duyệt
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {/* Create Sheet */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink, marginBottom: 16 }}>Tạo hồ sơ đề xuất</div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Nhân viên *</label>
            <div style={{ marginTop: 4, marginBottom: 12 }}>
              <EmployeeSearchSelect
                employees={employees.map(e => ({ id: e.id, name: `${e.employee_last_name} ${e.employee_first_name}`.trim() }))}
                value={Number(form.employee_id) || null}
                onChange={id => setForm(f => ({ ...f, employee_id: String(id ?? '') }))}
                placeholder="Nhập tên nhân viên..."
              />
            </div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Chức vụ đề xuất</label>
            <select value={form.proposed_job_position_id} onChange={e => setForm(f => ({ ...f, proposed_job_position_id: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, background: HNH.white }}>
              <option value="">—</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.job_position}</option>)}
            </select>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Phòng ban đề xuất</label>
            <select value={form.proposed_department_id} onChange={e => setForm(f => ({ ...f, proposed_department_id: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, background: HNH.white }}>
              <option value="">—</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.department}</option>)}
            </select>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Dự kiến hiệu lực</label>
            <input type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Lý do đề xuất</label>
            <textarea value={form.nomination_reason} onChange={e => setForm(f => ({ ...f, nomination_reason: e.target.value }))}
              rows={3} placeholder="Lý do đề xuất thăng tiến..."
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 16, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }} />
            {createError && (
              <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{createError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowCreate(false); setCreateError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={handleCreate} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, background: HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Đang tạo...' : 'Tạo hồ sơ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      {showDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink }}>Chi tiết hồ sơ</div>
              <button onClick={() => setShowDetail(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: HNH.ink3, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Avatar src={showDetail.employee_avatar} name={showDetail.employee_name} size={48} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink }}>{showDetail.employee_name}</div>
                <StatusBadge status={showDetail.status} label={showDetail.status_label} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                ['Chức vụ hiện tại', showDetail.current_job_position],
                ['Chức vụ đề xuất', showDetail.proposed_job_position],
                ['Phòng ban hiện tại', showDetail.current_department],
                ['Phòng ban đề xuất', showDetail.proposed_department],
                ['Dự kiến hiệu lực', showDetail.expected_date],
                ['Ngày hiệu lực', showDetail.effective_date],
              ].map(([label, val]) => val ? (
                <div key={label as string}>
                  <div style={{ fontSize: 10, color: HNH.ink3, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 13, color: HNH.ink }}>{val}</div>
                </div>
              ) : null)}
            </div>
            {showDetail.nomination_reason && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600, marginBottom: 4 }}>Lý do đề xuất</div>
                <div style={{ fontSize: 13, color: HNH.ink, background: HNH.cream, borderRadius: 8, padding: '10px 12px' }}>{showDetail.nomination_reason}</div>
              </div>
            )}
            {showDetail.decision_notes && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600, marginBottom: 4 }}>Ghi chú quyết định</div>
                <div style={{ fontSize: 13, color: HNH.ink, background: HNH.goldSoft, borderRadius: 8, padding: '10px 12px' }}>{showDetail.decision_notes}</div>
              </div>
            )}
            {showDetail.steps && showDetail.steps.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600, marginBottom: 8 }}>Chuỗi phê duyệt</div>
                {showDetail.steps.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px 12px', background: HNH.cream, borderRadius: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: s.status === 'approved' ? HNH.success : s.status === 'rejected' ? HNH.red : HNH.line, color: s.status === 'pending' ? HNH.ink3 : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {s.order}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: HNH.ink }}>{s.approver_name}</div>
                      <div style={{ fontSize: 11, color: HNH.ink3 }}>{s.role_label} · <StatusBadge status={s.status} label={s.status_label} /></div>
                      {s.comment && <div style={{ fontSize: 11, color: HNH.ink2, marginTop: 2 }}>{s.comment}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit Sheet */}
      {showSubmit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink, marginBottom: 6 }}>Gửi phê duyệt</div>
            <div style={{ fontSize: 13, color: HNH.ink2, marginBottom: 16 }}>{showSubmit.employee_name}</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: HNH.ink, marginBottom: 8 }}>Chuỗi phê duyệt</div>
            {steps.map((s, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: HNH.red, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: HNH.ink3 }}>NGƯỜI DUYỆT</div>
                  {steps.length > 1 && (
                    <button onClick={() => setSteps(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: HNH.red, fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>×</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div style={{ flex: 2 }}>
                    <EmployeeSearchSelect
                      employees={employees.map(e => ({ id: e.id, name: `${e.employee_last_name} ${e.employee_first_name}`.trim() }))}
                      value={Number(s.approver_id) || null}
                      onChange={id => setSteps(prev => prev.map((x, j) => j === i ? { ...x, approver_id: String(id ?? '') } : x))}
                      placeholder="Tìm người duyệt..."
                    />
                  </div>
                  <select value={s.role} onChange={e => setSteps(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                    style={{ flex: 1, padding: '8px 8px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 12, background: HNH.white }}>
                    {[{ v: 'manager', l: 'Quản lý' }, { v: 'hr', l: 'Nhân sự' }, { v: 'bgd', l: 'BGĐ' }, { v: 'other', l: 'Khác' }].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              </div>
            ))}
            <button onClick={() => setSteps(prev => [...prev, { approver_id: '', role: 'hr' }])}
              style={{ background: 'none', border: `1px dashed ${HNH.line}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: HNH.ink2, cursor: 'pointer', width: '100%', marginBottom: 16 }}>
              + Thêm bước
            </button>
            {submitError && (
              <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{submitError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowSubmit(null); setSubmitError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={handleSubmit} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, background: HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Đang gửi...' : 'Gửi phê duyệt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Approvals Tab ─────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const [reviewing, setReviewing] = useState<Nomination[]>([])
  const [mySteps, setMySteps] = useState<any[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showApprove, setShowApprove] = useState<{ stepId: number; empName: string } | null>(null)
  const [decide, setDecide] = useState<Nomination | null>(null)
  const [approveForm, setApproveForm] = useState({ decision: 'approved', comment: '' })
  const [decideForm, setDecideForm] = useState({ effective_date: '', decision_notes: '' })
  const [saving, setSaving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [decideError, setDecideError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/employee/promotion-hub/?tab=approvals') as any
      setReviewing(res.reviewing ?? [])
      setMySteps(res.my_steps ?? [])
      setCanManage(res.can_manage ?? false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async () => {
    if (!showApprove) return
    setSaving(true)
    setApproveError(null)
    try {
      await api.post('/api/employee/promotion-hub/', { action: 'approve_step', step_id: showApprove.stepId, ...approveForm })
      setShowApprove(null)
      load()
    } catch (e: any) {
      setApproveError(e?.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  const handleDecide = async () => {
    if (!decide) return
    setSaving(true)
    setDecideError(null)
    try {
      await api.post('/api/employee/promotion-hub/', { action: 'decide', nomination_id: decide.id, ...decideForm })
      setDecide(null)
      load()
    } catch (e: any) {
      setDecideError(e?.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '0 16px 80px' }}>
      {/* My pending steps */}
      {mySteps.filter((s: any) => s.status === 'pending').length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink, marginBottom: 10 }}>Cần xử lý</div>
          {mySteps.filter((s: any) => s.status === 'pending').map((s: any) => (
            <div key={s.step_id} style={{ background: HNH.red50, border: `1px solid ${HNH.red}30`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink }}>{s.employee_name}</div>
              <div style={{ fontSize: 12, color: HNH.ink2 }}>{s.proposed_position}</div>
              <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 4 }}>{s.role_label} · Bước {s.order}</div>
              <button onClick={() => { setShowApprove({ stepId: s.step_id, empName: s.employee_name }); setApproveForm({ decision: 'approved', comment: '' }) }}
                style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, background: HNH.red, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Xử lý
              </button>
            </div>
          ))}
        </>
      )}

      {/* Reviewing (manager) */}
      {canManage && reviewing.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink, marginBottom: 10, marginTop: 16 }}>Đang xem xét</div>
          {reviewing.map(n => (
            <div key={n.id} style={{ background: HNH.white, border: `1px solid ${HNH.line}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink }}>{n.employee_name}</div>
                  <div style={{ fontSize: 12, color: HNH.ink2 }}>{n.current_job_position} → <span style={{ color: HNH.red }}>{n.proposed_job_position}</span></div>
                </div>
                <StatusBadge status={n.status} label={n.status_label} />
              </div>
              {n.steps && n.steps.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 10px', background: HNH.cream, borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: s.status === 'approved' ? HNH.success : s.status === 'rejected' ? HNH.red : HNH.line, color: s.status === 'pending' ? HNH.ink3 : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{s.order}</div>
                  <div style={{ flex: 1, fontSize: 12, color: HNH.ink }}>{s.approver_name} <span style={{ color: HNH.ink3 }}>({s.role_label})</span></div>
                  <StatusBadge status={s.status} label={s.status_label} />
                </div>
              ))}
              {n.status === 'approved' && (
                <button onClick={() => { setDecide(n); setDecideForm({ effective_date: '', decision_notes: '' }) }}
                  style={{ marginTop: 10, padding: '6px 14px', borderRadius: 6, background: HNH.gold, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Ra quyết định
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3 }}>Đang tải...</div>}
      {!loading && mySteps.filter((s: any) => s.status === 'pending').length === 0 && (!canManage || reviewing.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3, fontSize: 13 }}>Không có hồ sơ cần xử lý</div>
      )}

      {/* Approve Sheet */}
      {showApprove && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink, marginBottom: 6 }}>Xử lý phê duyệt</div>
            <div style={{ fontSize: 13, color: HNH.ink2, marginBottom: 16 }}>{showApprove.empName}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[{ v: 'approved', l: 'Đồng ý', color: HNH.success }, { v: 'rejected', l: 'Từ chối', color: HNH.red }].map(o => (
                <button key={o.v} onClick={() => setApproveForm(f => ({ ...f, decision: o.v }))}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${approveForm.decision === o.v ? o.color : HNH.line}`, background: approveForm.decision === o.v ? o.color + '18' : HNH.white, color: o.color, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  {o.l}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Nhận xét</label>
            <textarea value={approveForm.comment} onChange={e => setApproveForm(f => ({ ...f, comment: e.target.value }))}
              rows={3} placeholder="Nhận xét (tuỳ chọn)..."
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 16, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }} />
            {approveError && (
              <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{approveError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowApprove(null); setApproveError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={handleApprove} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, background: approveForm.decision === 'approved' ? HNH.success : HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Đang xử lý...' : approveForm.decision === 'approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decide Sheet */}
      {decide && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink, marginBottom: 6 }}>Ra quyết định</div>
            <div style={{ fontSize: 13, color: HNH.ink2, marginBottom: 16 }}>{decide.employee_name} → {decide.proposed_job_position}</div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Ngày hiệu lực</label>
            <input type="date" value={decideForm.effective_date} onChange={e => setDecideForm(f => ({ ...f, effective_date: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Ghi chú quyết định</label>
            <textarea value={decideForm.decision_notes} onChange={e => setDecideForm(f => ({ ...f, decision_notes: e.target.value }))}
              rows={3} placeholder="Nội dung quyết định chính thức..."
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 16, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }} />
            {decideError && (
              <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{decideError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setDecide(null); setDecideError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={handleDecide} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, background: HNH.gold, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Đang lưu...' : 'Xác nhận quyết định'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Announcements Tab ─────────────────────────────────────────────────────────

function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [decided, setDecided] = useState<Nomination[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState<Nomination | null>(null)
  const [createForm, setCreateForm] = useState({ title: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState<number | null>(null)
  const [annError, setAnnError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/employee/promotion-hub/?tab=announcements') as any
      setAnnouncements(res.announcements ?? [])
      setDecided(res.decided ?? [])
      setCanManage(res.can_manage ?? false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!showCreate || !createForm.title || !createForm.content) return
    setSaving(true)
    setAnnError(null)
    try {
      await api.post('/api/employee/promotion-hub/', { action: 'create_announcement', nomination_id: showCreate.id, ...createForm })
      setShowCreate(null)
      load()
    } catch (e: any) {
      setAnnError(e?.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async (annId: number) => {
    setPublishing(annId)
    setPublishError(null)
    try {
      await api.post('/api/employee/promotion-hub/', { action: 'publish_announcement', announcement_id: annId })
      load()
    } catch (e: any) {
      setPublishError(e?.message || 'Có lỗi khi công bố')
    } finally {
      setPublishing(null)
    }
  }

  return (
    <div style={{ padding: '0 16px 80px' }}>
      {canManage && decided.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink, marginBottom: 10 }}>Chờ soạn thông báo</div>
          {decided.map(n => (
            <div key={n.id} style={{ background: HNH.goldSoft, border: `1px solid ${HNH.gold}40`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: HNH.ink }}>{n.employee_name}</div>
              <div style={{ fontSize: 12, color: HNH.ink2 }}>{n.proposed_job_position}</div>
              <button onClick={() => { setShowCreate(n); setCreateForm({ title: `Quyết định bổ nhiệm ${n.employee_name}`, content: `Kính gửi toàn thể nhân viên,\n\nCông ty trân trọng thông báo quyết định bổ nhiệm Ông/Bà ${n.employee_name} giữ chức vụ ${n.proposed_job_position}.\n\nQuyết định có hiệu lực kể từ ngày ${n.effective_date || '...'}.` }) }}
                style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, background: '#a87908', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Soạn thông báo
              </button>
            </div>
          ))}
          <div style={{ height: 16 }} />
        </>
      )}

      {publishError && (
        <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{publishError}</div>
      )}
      <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink, marginBottom: 10 }}>Tất cả thông báo</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: HNH.ink3 }}>Đang tải...</div>
      ) : announcements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: HNH.ink3, fontSize: 13 }}>Chưa có thông báo nào</div>
      ) : (
        announcements.map(a => (
          <div key={a.id} style={{
            background: HNH.white, border: `1px solid ${HNH.line}`, borderRadius: 10,
            padding: '14px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: HNH.ink, flex: 1, marginRight: 8 }}>{a.title}</div>
              <span style={{ background: a.is_published ? HNH.success50 : HNH.warn50, color: a.is_published ? HNH.success : HNH.warn, borderRadius: 10, padding: '2px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                {a.is_published ? 'Đã công bố' : 'Nháp'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: HNH.ink2, marginBottom: 8 }}>
              {a.employee_name} → {a.proposed_position}
            </div>
            <div style={{ fontSize: 12, color: HNH.ink3, whiteSpace: 'pre-line', marginBottom: 8 }}>{a.content}</div>
            <div style={{ fontSize: 11, color: HNH.ink4 }}>
              {a.is_published ? `Công bố: ${a.published_at}` : `Tạo: ${a.created_at}`}
            </div>
            {!a.is_published && canManage && (
              <button onClick={() => handlePublish(a.id)} disabled={publishing === a.id}
                style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, background: HNH.success, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: publishing === a.id ? 0.6 : 1 }}>
                {publishing === a.id ? 'Đang công bố...' : 'Công bố'}
              </button>
            )}
          </div>
        ))
      )}

      {/* Create Announcement Sheet */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: HNH.white, borderRadius: '16px 16px 0 0', width: '100%', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink, marginBottom: 4 }}>Soạn thông báo</div>
            <div style={{ fontSize: 13, color: HNH.ink2, marginBottom: 16 }}>{showCreate.employee_name} → {showCreate.proposed_job_position}</div>
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Tiêu đề *</label>
            <input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 12, marginTop: 4, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 12, color: HNH.ink2, fontWeight: 600 }}>Nội dung *</label>
            <textarea value={createForm.content} onChange={e => setCreateForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, marginBottom: 16, marginTop: 4, resize: 'vertical', boxSizing: 'border-box' }} />
            {annError && (
              <div style={{ background: HNH.red50, color: HNH.red, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>{annError}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowCreate(null); setAnnError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={handleCreate} disabled={saving}
                style={{ flex: 2, padding: '11px', borderRadius: 8, background: HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Đang lưu...' : 'Lưu thông báo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Guide Modal ───────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
  {
    icon: '🎯',
    title: 'Đánh giá 9-Box',
    tab: 'ninebox' as Tab,
    color: HNH.red,
    desc: 'Quản lý chấm điểm Hiệu suất (1–3) × Tiềm năng (1–3) cho từng nhân viên. Ma trận 9 ô giúp xác định ai sẵn sàng được bổ nhiệm.',
  },
  {
    icon: '📋',
    title: 'Tạo hồ sơ đề xuất',
    tab: 'nominations' as Tab,
    color: '#7c3aed',
    desc: 'HR hoặc Quản lý lập hồ sơ đề xuất thăng tiến / bổ nhiệm: chọn nhân viên, vị trí mới, lý do và ngày dự kiến hiệu lực.',
  },
  {
    icon: '✅',
    title: 'Phê duyệt đa cấp',
    tab: 'approvals' as Tab,
    color: '#e07b10',
    desc: 'Hồ sơ lần lượt qua các cấp duyệt đã cấu hình (Trưởng phòng → HR → Ban Giám đốc). Mỗi cấp Duyệt hoặc Từ chối và ghi chú.',
  },
  {
    icon: '🏆',
    title: 'Ra quyết định',
    tab: 'nominations' as Tab,
    color: '#a87908',
    desc: 'Sau khi tất cả bước phê duyệt hoàn tất, người có thẩm quyền ban hành quyết định chính thức: Đồng ý, Từ chối hoặc Điều chỉnh.',
  },
  {
    icon: '📢',
    title: 'Công bố nội bộ',
    tab: 'announcements' as Tab,
    color: HNH.success,
    desc: 'Soạn thông báo nội bộ chúc mừng nhân viên được bổ nhiệm và công bố chính thức tới toàn thể nhân viên công ty.',
  },
]

const GUIDE_KEY = 'hnh_promo_guide_seen_v1'

function GuideModal({ onClose, onGo }: { onClose: () => void; onGo: (tab: Tab) => void }) {
  const [step, setStep] = useState(0)
  const [dontShow, setDontShow] = useState(false)
  const current = GUIDE_STEPS[step]
  const isLast = step === GUIDE_STEPS.length - 1

  const handleClose = () => {
    if (dontShow) localStorage.setItem(GUIDE_KEY, '1')
    onClose()
  }

  const handleGo = () => {
    if (dontShow) localStorage.setItem(GUIDE_KEY, '1')
    onClose()
    onGo(current.tab)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: HNH.white, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '92vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 0' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: HNH.ink }}>Quy trình Bổ nhiệm &amp; Thăng tiến</div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>5 bước từ đánh giá đến công bố</div>
          </div>
          <button onClick={handleClose} style={{ background: '#f0f0f0', border: 'none', borderRadius: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Icon name="x" size={14} color={HNH.ink2} stroke={2} />
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 0 2px' }}>
          {GUIDE_STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, background: i === step ? current.color : '#e0e0e0', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.2s' }} />
          ))}
        </div>

        {/* Step card */}
        <div style={{ margin: '16px 20px', background: `${current.color}0d`, borderRadius: 16, padding: '22px 20px', borderLeft: `4px solid ${current.color}` }}>
          <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1 }}>{current.icon}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ background: current.color, color: '#fff', borderRadius: 20, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {step + 1}
            </span>
            <span style={{ fontWeight: 800, fontSize: 16, color: HNH.ink }}>{current.title}</span>
          </div>
          <div style={{ fontSize: 14, color: HNH.ink2, lineHeight: 1.6 }}>{current.desc}</div>
        </div>

        {/* Step list overview */}
        <div style={{ margin: '0 20px 16px' }}>
          {GUIDE_STEPS.map((s, i) => (
            <button key={i} onClick={() => setStep(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 0', textAlign: 'left' }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: i === step ? s.color : i < step ? `${s.color}30` : '#f0f0f0', color: i === step ? '#fff' : i < step ? s.color : HNH.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {i < step ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: i === step ? 700 : 500, color: i === step ? HNH.ink : HNH.ink3 }}>{s.title}</span>
              {i < GUIDE_STEPS.length - 1 && (
                <div style={{ width: 1, height: 12, background: '#e0e0e0', position: 'absolute', left: 33, marginTop: 34 }} />
              )}
            </button>
          ))}
        </div>

        {/* Don't show again */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 16px' }}>
          <input type="checkbox" id="guide-dontshow" checked={dontShow} onChange={e => setDontShow(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: HNH.red }} />
          <label htmlFor="guide-dontshow" style={{ fontSize: 12, color: HNH.ink3, cursor: 'pointer' }}>Không hiện hướng dẫn này khi mở Hub lần sau</label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, padding: '0 20px 24px' }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${HNH.line}`, background: HNH.white, fontSize: 14, fontWeight: 600, color: HNH.ink2, cursor: 'pointer' }}>
              ← Trước
            </button>
          )}
          {!isLast ? (
            <button onClick={() => setStep(s => s + 1)}
              style={{ flex: 2, padding: '12px', borderRadius: 10, background: current.color, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Tiếp theo →
            </button>
          ) : (
            <button onClick={handleGo}
              style={{ flex: 2, padding: '12px', borderRadius: 10, background: HNH.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Bắt đầu sử dụng 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PromotionHubPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [overviewData, setOverviewData] = useState<{ pendingMine: PendingStep[]; stats: OverviewStats; canManage: boolean } | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(false)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const res = await api.get('/api/employee/promotion-hub/?tab=overview') as any
      setOverviewData({
        pendingMine: res.pending_mine ?? [],
        stats: res.stats ?? { draft: 0, reviewing: 0, approved: 0, decided: 0, announced: 0 },
        canManage: res.can_manage ?? false,
      })
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  // Show guide on first visit unless dismissed
  useEffect(() => {
    if (!localStorage.getItem(GUIDE_KEY)) setShowGuide(true)
  }, [])

  // Load overview on mount to get canManage for all tabs
  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => { if (tab === 'overview') loadOverview() }, [tab, loadOverview])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'ninebox', label: '9-Box' },
    { id: 'nominations', label: 'Đề xuất' },
    { id: 'approvals', label: 'Phê duyệt' },
    { id: 'announcements', label: 'Công bố' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: HNH.cream, paddingBottom: 0 }}>
      {showGuide && (
        <GuideModal
          onClose={() => setShowGuide(false)}
          onGo={t => { setShowGuide(false); setTab(t) }}
        />
      )}

      {/* Header */}
      <div style={{ background: HNH.red, padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 8px', display: 'flex' }}>
            <Icon name="trophy" size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>Hub Thăng Tiến</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>9-Box · Đề xuất · Phê duyệt · Quyết định · Công bố</div>
          </div>
          <button onClick={() => setShowGuide(true)}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            title="Hướng dẫn quy trình">
            <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: 1 }}>?</span>
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                background: 'transparent', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.6)',
                borderBottom: tab === t.id ? '2px solid #fff' : '2px solid transparent',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingTop: 16 }}>
        {tab === 'overview' && (
          overviewLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: HNH.ink3 }}>Đang tải...</div>
          ) : overviewData ? (
            <OverviewTab
              pendingMine={overviewData.pendingMine}
              stats={overviewData.stats}
              canManage={overviewData.canManage}
              onNavigate={setTab}
            />
          ) : null
        )}
        {tab === 'ninebox' && <NineBoxTab canManage={overviewData?.canManage ?? false} />}
        {tab === 'nominations' && <NominationsTab canManage={overviewData?.canManage ?? false} />}
        {tab === 'approvals' && <ApprovalsTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
      </div>
    </div>
  )
}
