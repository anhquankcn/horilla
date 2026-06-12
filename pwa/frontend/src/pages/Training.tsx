import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

/* ── Types ── */
interface Enrollment {
  id: number
  status: string
  enrolled_date: string | null
  started_date: string | null
  completed_date: string | null
  score: number | null
  certificate: string | null
  notes: string
}

interface Course {
  id: number
  title: string
  description: string
  category: string | null
  category_id?: number | null
  course_type: string
  course_type_display: string
  instructor: string
  instructor_employee: string | null
  duration_hours: number
  max_participants: number
  enrolled_count: number
  completed_count: number
  start_date: string | null
  end_date: string | null
  location: string
  is_mandatory: boolean
  is_active?: boolean
  enrollment?: Enrollment
  is_enrolled?: boolean
  can_enroll?: boolean
}

interface TeamMember {
  id: number
  name: string
  department: string | null
  avatar: string | null
  courses: {
    course_title: string
    category: string | null
    status: string
    enrolled_date: string | null
    completed_date: string | null
    score: number | null
  }[]
  total: number
  completed: number
}

interface Category { id: number; name: string }
interface Department { id: number; department: string }

interface OverviewData {
  total_enrollments: number
  completed: number
  in_progress: number
  enrolled: number
  mandatory_pending: number
  upcoming_courses: Course[]
  recent_completed: Course[]
  team_enrollments: number
  team_completed: number
  is_manager: boolean
}

type Tab = 'overview' | 'my_courses' | 'catalog' | 'team' | 'manage'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'bar-chart' },
  { id: 'my_courses', label: 'Của tôi', icon: 'book' },
  { id: 'catalog', label: 'Danh mục', icon: 'graduation' },
  { id: 'team', label: 'Team', icon: 'users' },
  { id: 'manage', label: 'Quản lý', icon: 'gear' },
]

const STATUS_VI: Record<string, string> = {
  enrolled: 'Đã đăng ký',
  in_progress: 'Đang học',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  failed: 'Không đạt',
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  enrolled: { bg: '#eef1fa', fg: HNH.navy },
  in_progress: { bg: '#fef3c7', fg: '#d97706' },
  completed: { bg: '#ecfdf5', fg: '#059669' },
  cancelled: { bg: '#f3f4f6', fg: '#6b7280' },
  failed: { bg: '#fef2f2', fg: '#dc2626' },
}

const TYPE_OPTIONS = [
  { val: 'internal', label: 'Nội bộ' },
  { val: 'external', label: 'Bên ngoài' },
  { val: 'online', label: 'Online' },
  { val: 'onsite', label: 'Tại chỗ' },
]

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  internal: { icon: 'users', color: HNH.navy },
  external: { icon: 'globe', color: '#7c3aed' },
  online: { icon: 'monitor', color: '#0891b2' },
  onsite: { icon: 'pin', color: HNH.red },
}

/* ── Helpers ── */
function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.enrolled
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      background: c.bg, color: c.fg, whiteSpace: 'nowrap',
    }}>
      {STATUS_VI[status] || status}
    </span>
  )
}

function ProgressRing({ value, size = 48, stroke = 4, color = HNH.success }: {
  value: number; size?: number; stroke?: number; color?: string
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(100, value) / 100)
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={HNH.line} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
    </svg>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${HNH.line}`, fontSize: 13, color: HNH.ink,
  background: HNH.white, outline: 'none', boxSizing: 'border-box',
}

/* ── Overview Tab ── */
function OverviewTab({ data, onGoTab }: { data: OverviewData; onGoTab: (t: Tab) => void }) {
  const stats = [
    { label: 'Tổng khóa học', value: data.total_enrollments, icon: 'book', color: HNH.navy },
    { label: 'Đang học', value: data.in_progress, icon: 'play', color: '#d97706' },
    { label: 'Hoàn thành', value: data.completed, icon: 'check', color: HNH.success },
    { label: 'Chờ bắt buộc', value: data.mandatory_pending, icon: 'alert', color: HNH.red },
  ]
  const completionPct = data.total_enrollments > 0
    ? Math.round((data.completed / data.total_enrollments) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: HNH.white, borderRadius: 16, padding: 16, border: `1px solid ${HNH.line}`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: s.color + '18',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
            }}>
              <Icon name={s.icon} size={16} color={s.color} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: HNH.ink }}>{s.value}</div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: HNH.white, borderRadius: 16, padding: 20, border: `1px solid ${HNH.line}`,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ position: 'relative' }}>
          <ProgressRing value={completionPct} size={64} stroke={5} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: HNH.ink,
          }}>{completionPct}%</div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>Tỷ lệ hoàn thành</div>
          <div style={{ fontSize: 12, color: HNH.ink3 }}>{data.completed}/{data.total_enrollments} khóa học</div>
        </div>
      </div>

      {data.mandatory_pending > 0 && (
        <div onClick={() => onGoTab('catalog')} style={{
          background: HNH.red50, borderRadius: 16, padding: 16, border: `1px solid ${HNH.red}22`,
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}>
          <Icon name="alert" size={18} color={HNH.red} />
          <div style={{ fontSize: 13, color: HNH.ink, flex: 1 }}>
            <strong>{data.mandatory_pending}</strong> khóa bắt buộc chưa hoàn thành
          </div>
          <Icon name="chev-r" size={14} color={HNH.ink3} />
        </div>
      )}

      {data.upcoming_courses.length > 0 && (
        <div style={{ background: HNH.white, borderRadius: 16, padding: 16, border: `1px solid ${HNH.line}` }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: HNH.ink2, marginBottom: 12,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Sắp diễn ra</span>
            <span style={{ fontSize: 11, color: HNH.navy, cursor: 'pointer' }} onClick={() => onGoTab('catalog')}>
              Xem tất cả
            </span>
          </div>
          {data.upcoming_courses.map(c => (
            <div key={c.id} style={{
              padding: '10px 0', borderBottom: `1px solid ${HNH.line}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: (TYPE_ICONS[c.course_type]?.color || HNH.navy) + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name={TYPE_ICONS[c.course_type]?.icon || 'book'} size={16}
                  color={TYPE_ICONS[c.course_type]?.color || HNH.navy} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: HNH.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 11, color: HNH.ink3 }}>
                  {formatDate(c.start_date)} · {c.duration_hours}h
                  {c.is_mandatory && <span style={{ color: HNH.red, fontWeight: 600 }}> · Bắt buộc</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.recent_completed.length > 0 && (
        <div style={{ background: HNH.white, borderRadius: 16, padding: 16, border: `1px solid ${HNH.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink2, marginBottom: 12 }}>
            Hoàn thành gần đây
          </div>
          {data.recent_completed.map(c => (
            <div key={c.id} style={{
              padding: '10px 0', borderBottom: `1px solid ${HNH.line}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: HNH.ink }}>{c.title}</div>
                <div style={{ fontSize: 11, color: HNH.ink3 }}>
                  {c.enrollment?.completed_date ? formatDate(c.enrollment.completed_date) : ''}
                  {c.enrollment?.score != null && ` · ${c.enrollment.score} điểm`}
                </div>
              </div>
              <StatusBadge status="completed" />
            </div>
          ))}
        </div>
      )}

      {data.is_manager && data.team_enrollments > 0 && (
        <div onClick={() => onGoTab('team')} style={{
          background: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
          borderRadius: 16, padding: 20, color: '#fff', cursor: 'pointer',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>Đào tạo Team</div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.team_enrollments}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Đăng ký</div></div>
            <div><div style={{ fontSize: 28, fontWeight: 700 }}>{data.team_completed}</div><div style={{ fontSize: 12, opacity: 0.7 }}>Hoàn thành</div></div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {data.team_enrollments > 0 ? Math.round((data.team_completed / data.team_enrollments) * 100) : 0}%
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Tỷ lệ</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Course Card ── */
function CourseCard({ course, onEnroll, onUpdateStatus, onCancel }: {
  course: Course
  onEnroll?: (id: number) => void
  onUpdateStatus?: (enrollId: number, status: string) => void
  onCancel?: (enrollId: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ti = TYPE_ICONS[course.course_type] || TYPE_ICONS.internal
  const enrollment = course.enrollment

  return (
    <div style={{ background: HNH.white, borderRadius: 16, overflow: 'hidden', border: `1px solid ${HNH.line}` }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: 16, cursor: 'pointer' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, background: ti.color + '15',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name={ti.icon} size={18} color={ti.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{course.title}</div>
              {enrollment && <StatusBadge status={enrollment.status} />}
            </div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>
              {course.category && <span>{course.category} · </span>}
              {course.course_type_display} · {course.duration_hours}h
              {course.is_mandatory && <span style={{ color: HNH.red, fontWeight: 600 }}> · Bắt buộc</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 11, color: HNH.ink3 }}>
          {(course.instructor_employee || course.instructor) && <span>GV: {course.instructor_employee || course.instructor}</span>}
          {course.start_date && <span>{formatDate(course.start_date)} → {formatDate(course.end_date)}</span>}
          {course.location && <span>{course.location}</span>}
          <div style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <Icon name="chev-d" size={14} color={HNH.ink3} />
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${HNH.line}`, padding: 16 }}>
          {course.description && (
            <div style={{ fontSize: 13, color: HNH.ink2, marginBottom: 12, lineHeight: 1.5 }}>{course.description}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 12 }}>
            <div style={{ background: HNH.cream, borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ color: HNH.ink3 }}>Đã đăng ký</div>
              <div style={{ fontWeight: 600, color: HNH.ink }}>{course.enrolled_count}</div>
            </div>
            <div style={{ background: HNH.cream, borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ color: HNH.ink3 }}>Hoàn thành</div>
              <div style={{ fontWeight: 600, color: HNH.ink }}>{course.completed_count}</div>
            </div>
          </div>
          {enrollment?.certificate && (
            <div style={{
              background: '#ecfdf5', borderRadius: 8, padding: '8px 12px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            }}>
              <Icon name="award" size={14} color={HNH.success} />
              <span style={{ color: HNH.success, fontWeight: 600 }}>Chứng chỉ: {enrollment.certificate}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {course.can_enroll && onEnroll && (
              <button onClick={() => onEnroll(course.id)} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: HNH.navy, color: '#fff', fontSize: 13, fontWeight: 600,
              }}>Đăng ký</button>
            )}
            {enrollment?.status === 'enrolled' && onUpdateStatus && (
              <button onClick={() => onUpdateStatus(enrollment.id, 'in_progress')} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#fef3c7', color: '#d97706', fontSize: 13, fontWeight: 600,
              }}>Bắt đầu học</button>
            )}
            {enrollment?.status === 'in_progress' && onUpdateStatus && (
              <button onClick={() => onUpdateStatus(enrollment.id, 'completed')} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#ecfdf5', color: '#059669', fontSize: 13, fontWeight: 600,
              }}>Hoàn thành</button>
            )}
            {enrollment && ['enrolled', 'in_progress'].includes(enrollment.status) && onCancel && (
              <button onClick={() => onCancel(enrollment.id)} style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${HNH.line}`, cursor: 'pointer',
                background: 'transparent', color: HNH.ink3, fontSize: 13,
              }}>Hủy đăng ký</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Team Member Card ── */
function TeamMemberCard({ member }: { member: TeamMember }) {
  const [expanded, setExpanded] = useState(false)
  const pct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0
  return (
    <div style={{ background: HNH.white, borderRadius: 16, overflow: 'hidden', border: `1px solid ${HNH.line}` }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: 16, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {member.avatar ? (
            <img src={member.avatar} alt="" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: HNH.navy + '18',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: HNH.navy,
            }}>{member.name.charAt(0)}</div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{member.name}</div>
            <div style={{ fontSize: 12, color: HNH.ink3 }}>{member.department || ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: pct >= 70 ? HNH.success : pct >= 40 ? '#d97706' : HNH.ink2 }}>
              {pct}%
            </div>
            <div style={{ fontSize: 11, color: HNH.ink3 }}>{member.completed}/{member.total}</div>
          </div>
          <div style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <Icon name="chev-d" size={14} color={HNH.ink3} />
          </div>
        </div>
      </div>
      {expanded && member.courses.length > 0 && (
        <div style={{ borderTop: `1px solid ${HNH.line}`, padding: '8px 16px 16px' }}>
          {member.courses.map((c, i) => (
            <div key={i} style={{
              padding: '8px 0', borderBottom: `1px solid ${HNH.line}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: HNH.ink }}>{c.course_title}</div>
                <div style={{ fontSize: 11, color: HNH.ink3 }}>
                  {c.category || ''}{c.enrolled_date ? ` · ${formatDate(c.enrolled_date)}` : ''}
                  {c.score != null && ` · ${c.score} điểm`}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Course Form (create / edit) ── */
const EMPTY_FORM = {
  title: '', description: '', course_type: 'internal', instructor: '',
  duration_hours: '', max_participants: '0', start_date: '', end_date: '',
  location: '', is_mandatory: false, category_id: '',
  target_departments: [] as number[],
}

function CourseForm({
  initial, categories, departments, onSave, onCancel, saving,
}: {
  initial?: Partial<typeof EMPTY_FORM>
  categories: Category[]
  departments: Department[]
  onSave: (data: typeof EMPTY_FORM) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM, ...initial })
  const set = (k: keyof typeof EMPTY_FORM, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }))
  const toggleDept = (id: number) =>
    setForm(f => ({
      ...f,
      target_departments: f.target_departments.includes(id)
        ? f.target_departments.filter(d => d !== id)
        : [...f.target_departments, id],
    }))

  return (
    <div style={{
      background: HNH.white, borderRadius: 16, padding: 20,
      border: `1.5px solid ${HNH.navy}33`,
    }}>
      <FieldRow label="Tên khóa học *">
        <input value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="VD: Kỹ năng giao tiếp khách hàng" style={inputStyle} />
      </FieldRow>

      <FieldRow label="Mô tả">
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="Nội dung, mục tiêu khóa học..." rows={3}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </FieldRow>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FieldRow label="Loại hình">
          <select value={form.course_type} onChange={e => set('course_type', e.target.value)} style={inputStyle}>
            {TYPE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
        </FieldRow>

        <FieldRow label="Danh mục">
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)} style={inputStyle}>
            <option value="">-- Không chọn --</option>
            {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </FieldRow>
      </div>

      <FieldRow label="Giảng viên">
        <input value={form.instructor} onChange={e => set('instructor', e.target.value)}
          placeholder="Tên giảng viên / tổ chức" style={inputStyle} />
      </FieldRow>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FieldRow label="Số giờ">
          <input type="number" min="0" step="0.5" value={form.duration_hours}
            onChange={e => set('duration_hours', e.target.value)} style={inputStyle} placeholder="0" />
        </FieldRow>

        <FieldRow label="Tối đa HV">
          <input type="number" min="0" value={form.max_participants}
            onChange={e => set('max_participants', e.target.value)} style={inputStyle} placeholder="0 = không giới hạn" />
        </FieldRow>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FieldRow label="Ngày bắt đầu">
          <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={inputStyle} />
        </FieldRow>
        <FieldRow label="Ngày kết thúc">
          <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={inputStyle} />
        </FieldRow>
      </div>

      <FieldRow label="Địa điểm">
        <input value={form.location} onChange={e => set('location', e.target.value)}
          placeholder="Phòng họp, địa chỉ, link Zoom..." style={inputStyle} />
      </FieldRow>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        padding: '10px 14px', background: HNH.cream2, borderRadius: 10,
        cursor: 'pointer',
      }} onClick={() => set('is_mandatory', !form.is_mandatory)}>
        <div style={{
          width: 20, height: 20, borderRadius: 5, border: `2px solid ${form.is_mandatory ? HNH.red : HNH.line}`,
          background: form.is_mandatory ? HNH.red : HNH.white,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {form.is_mandatory && <Icon name="check" size={12} color="#fff" stroke={2.5} />}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: HNH.ink }}>Khóa học bắt buộc</div>
          <div style={{ fontSize: 11, color: HNH.ink3 }}>Tất cả nhân viên phải hoàn thành</div>
        </div>
      </div>

      {departments.length > 0 && (
        <FieldRow label="Gán cho phòng ban (tự động đăng ký nhân viên)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {departments.map(d => {
              const selected = form.target_departments.includes(d.id)
              return (
                <button key={d.id} type="button" onClick={() => toggleDept(d.id)} style={{
                  padding: '5px 10px', borderRadius: 8,
                  border: `1.5px solid ${selected ? HNH.navy : HNH.line}`,
                  background: selected ? HNH.navy50 : HNH.white,
                  color: selected ? HNH.navy : HNH.ink3,
                  fontSize: 12, fontWeight: selected ? 600 : 400, cursor: 'pointer',
                }}>
                  {d.department}
                </button>
              )
            })}
          </div>
          {form.target_departments.length > 0 && (
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 6 }}>
              Nhân viên đang hoạt động của các phòng ban được chọn sẽ được tự động đăng ký
            </div>
          )}
        </FieldRow>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(form)} disabled={saving} style={{
          flex: 1, padding: '11px', borderRadius: 10, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          background: HNH.navy, color: '#fff', fontSize: 14, fontWeight: 600,
          opacity: saving ? 0.7 : 1,
        }}>
          {saving ? 'Đang lưu...' : 'Lưu khóa học'}
        </button>
        <button onClick={onCancel} style={{
          padding: '11px 16px', borderRadius: 10, border: `1px solid ${HNH.line}`, cursor: 'pointer',
          background: 'transparent', color: HNH.ink2, fontSize: 14,
        }}>
          Hủy
        </button>
      </div>
    </div>
  )
}

/* ── Manage Course Row ── */
function ManageCourseRow({ course, categories, departments, onEdit, onToggleActive }: {
  course: Course & { is_active: boolean; target_departments?: {id: number; department: string}[] }
  categories: Category[]
  departments: Department[]
  onEdit: (id: number, data: any) => void
  onToggleActive: (id: number, active: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const ti = TYPE_ICONS[course.course_type] || TYPE_ICONS.internal

  const handleSave = async (formData: typeof EMPTY_FORM) => {
    setSaving(true)
    await onEdit(course.id, formData)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <CourseForm
        initial={{
          title: course.title,
          description: course.description,
          course_type: course.course_type,
          instructor: course.instructor,
          duration_hours: String(course.duration_hours),
          max_participants: String(course.max_participants),
          start_date: course.start_date || '',
          end_date: course.end_date || '',
          location: course.location,
          is_mandatory: course.is_mandatory,
          category_id: course.category_id ? String(course.category_id) : '',
          target_departments: (course.target_departments || []).map(d => d.id),
        }}
        categories={categories}
        departments={departments}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
        saving={saving}
      />
    )
  }

  return (
    <div style={{
      background: HNH.white, borderRadius: 14, padding: '12px 16px',
      border: `1px solid ${HNH.line}`,
      opacity: course.is_active ? 1 : 0.55,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: ti.color + '15',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={ti.icon} size={16} color={ti.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{course.title}</div>
          <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>
            {course.category && `${course.category} · `}
            {TYPE_OPTIONS.find(o => o.val === course.course_type)?.label || course.course_type}
            {' · '}{course.duration_hours}h
            {course.is_mandatory && <span style={{ color: HNH.red, fontWeight: 600 }}> · Bắt buộc</span>}
            {!course.is_active && <span style={{ color: '#6b7280', fontWeight: 600 }}> · Đã ẩn</span>}
          </div>
          <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>
            {course.enrolled_count} đăng ký
            {course.start_date && ` · ${formatDate(course.start_date)} → ${formatDate(course.end_date)}`}
          </div>
          {course.target_departments && course.target_departments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {course.target_departments.map(d => (
                <span key={d.id} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 5,
                  background: HNH.navy50, color: HNH.navy, fontWeight: 500,
                }}>{d.department}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setEditing(true)} style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${HNH.line}`,
            background: HNH.cream, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="edit" size={14} color={HNH.navy} />
          </button>
          <button onClick={() => onToggleActive(course.id, !course.is_active)} style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${HNH.line}`,
            background: course.is_active ? '#fef2f2' : '#ecfdf5', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={course.is_active ? 'x' : 'check'} size={14}
              color={course.is_active ? HNH.red : HNH.success} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Manage Tab ── */
function ManageTab({ data, categories, departments, onRefresh }: {
  data: { courses: (Course & { is_active: boolean; target_departments?: {id: number; department: string}[] })[]; categories: Category[]; can_manage: boolean }
  categories: Category[]
  departments: Department[]
  onRefresh: () => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateCat, setShowCreateCat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [catName, setCatName] = useState('')
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'hidden'>('active')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  if (!data.can_manage) {
    return <EmptyState icon="gear" text="Không có quyền quản lý" sub="Liên hệ Admin để được cấp quyền" />
  }

  const handleCreate = async (formData: typeof EMPTY_FORM) => {
    if (!formData.title.trim()) return
    setSaving(true)
    try {
      await api.post('/api/employee/training/', {
        action: 'create_course',
        ...formData,
        duration_hours: parseFloat(formData.duration_hours) || 0,
        max_participants: parseInt(formData.max_participants) || 0,
        category_id: formData.category_id || null,
      })
      setShowCreate(false)
      showToast('Tạo khóa học thành công')
      onRefresh()
    } catch { showToast('Lỗi khi tạo khóa học') }
    setSaving(false)
  }

  const handleEdit = async (courseId: number, formData: typeof EMPTY_FORM) => {
    try {
      await api.post('/api/employee/training/', {
        action: 'update_course',
        course_id: courseId,
        ...formData,
        duration_hours: parseFloat(formData.duration_hours) || 0,
        max_participants: parseInt(formData.max_participants) || 0,
        category_id: formData.category_id || null,
      })
      showToast('Cập nhật thành công')
      onRefresh()
    } catch { showToast('Lỗi khi cập nhật') }
  }

  const handleToggleActive = async (courseId: number, active: boolean) => {
    try {
      await api.post('/api/employee/training/', {
        action: 'update_course', course_id: courseId, is_active: active,
      })
      showToast(active ? 'Đã hiển thị khóa học' : 'Đã ẩn khóa học')
      onRefresh()
    } catch { showToast('Lỗi') }
  }

  const handleCreateCategory = async () => {
    if (!catName.trim()) return
    setSaving(true)
    try {
      await api.post('/api/employee/training/', { action: 'create_category', name: catName })
      setCatName('')
      setShowCreateCat(false)
      showToast('Tạo danh mục thành công')
      onRefresh()
    } catch { showToast('Lỗi khi tạo danh mục') }
    setSaving(false)
  }

  const filtered = data.courses.filter(c =>
    filter === 'all' ? true : filter === 'active' ? c.is_active : !c.is_active
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)',
          background: HNH.ink, color: '#fff', padding: '10px 20px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>{toast}</div>
      )}

      {/* Header actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setShowCreate(!showCreate); setShowCreateCat(false) }} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: showCreate ? HNH.navy2 : HNH.navy, color: '#fff', fontSize: 13, fontWeight: 600,
        }}>
          <Icon name={showCreate ? 'x' : 'plus'} size={15} color="#fff" />
          {showCreate ? 'Hủy' : 'Tạo khóa học'}
        </button>
        <button onClick={() => { setShowCreateCat(!showCreateCat); setShowCreate(false) }} style={{
          padding: '10px 14px', borderRadius: 10, border: `1px solid ${HNH.line}`, cursor: 'pointer',
          background: showCreateCat ? HNH.cream2 : HNH.white, color: HNH.ink2, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name={showCreateCat ? 'x' : 'plus'} size={14} color={HNH.ink2} />
          Danh mục
        </button>
      </div>

      {/* Create course form */}
      {showCreate && (
        <CourseForm
          categories={categories}
          departments={departments}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          saving={saving}
        />
      )}

      {/* Create category inline */}
      {showCreateCat && (
        <div style={{
          background: HNH.white, borderRadius: 14, padding: 16, border: `1.5px solid ${HNH.gold}44`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink2, marginBottom: 10 }}>
            Tạo danh mục mới
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={catName} onChange={e => setCatName(e.target.value)}
              placeholder="VD: Kỹ năng mềm, Nghiệp vụ, An toàn..." style={{ ...inputStyle, flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && handleCreateCategory()} />
            <button onClick={handleCreateCategory} disabled={saving || !catName.trim()} style={{
              padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: HNH.gold, color: '#fff', fontSize: 13, fontWeight: 600,
              opacity: !catName.trim() ? 0.5 : 1,
            }}>Tạo</button>
          </div>
          {/* Existing categories */}
          {categories.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {categories.map(c => (
                <span key={c.id} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: HNH.cream2, color: HNH.ink2,
                }}>{c.name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter + stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['all', 'Tất cả'], ['active', 'Hiện'], ['hidden', 'Ẩn']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: filter === v ? 600 : 400,
              background: filter === v ? HNH.navy50 : 'transparent',
              color: filter === v ? HNH.navy : HNH.ink3,
            }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: HNH.ink3 }}>{filtered.length} khóa</span>
      </div>

      {/* Course list */}
      {filtered.length === 0 ? (
        <EmptyState icon="book" text="Chưa có khóa học nào" sub={'Nhấn "+ Tạo khóa học" để bắt đầu'} />
      ) : (
        filtered.map(c => (
          <ManageCourseRow
            key={c.id}
            course={c}
            categories={categories}
            departments={departments}
            onEdit={handleEdit}
            onToggleActive={handleToggleActive}
          />
        ))
      )}
    </div>
  )
}

/* ── Empty State ── */
function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 14 }}>
      <Icon name={icon} size={40} color={HNH.ink4} />
      <div style={{ marginTop: 12 }}>{text}</div>
      {sub && <div style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/* ── Main Page ── */
export function TrainingPage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const fetchTab = useCallback(async (t: Tab) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab: t })
      if (t === 'my_courses' && statusFilter) params.set('status', statusFilter)
      if (t === 'catalog' && categoryFilter) params.set('category', categoryFilter)
      const res = await api.get(`/api/employee/training/?${params}`) as any
      setData(res)
    } catch { setData(null) }
    setLoading(false)
  }, [statusFilter, categoryFilter])

  useEffect(() => { fetchTab(tab) }, [tab, fetchTab])

  const goTab = (t: Tab) => { setData(null); setTab(t) }

  const handleEnroll = async (courseId: number) => {
    try {
      await api.post('/api/employee/training/', { action: 'enroll', course_id: courseId })
      fetchTab(tab)
    } catch { /* */ }
  }

  const handleUpdateStatus = async (enrollId: number, status: string) => {
    try {
      await api.post('/api/employee/training/', { action: 'update_status', enrollment_id: enrollId, status })
      fetchTab(tab)
    } catch { /* */ }
  }

  const handleCancel = async (enrollId: number) => {
    try {
      await api.post('/api/employee/training/', { action: 'cancel', enrollment_id: enrollId })
      fetchTab(tab)
    } catch { /* */ }
  }

  const mx = isTablet ? 560 : undefined

  const STATUS_FILTERS = [
    { val: '', label: 'Tất cả' },
    { val: 'enrolled', label: 'Đã ĐK' },
    { val: 'in_progress', label: 'Đang học' },
    { val: 'completed', label: 'Hoàn thành' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: HNH.cream, display: 'flex', flexDirection: 'column' }}>
      <TopBar onBack={() => navigate(-1)} title="Đào tạo" />

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 16px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => goTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400, whiteSpace: 'nowrap',
            background: tab === t.id ? HNH.navy : 'transparent',
            color: tab === t.id ? '#fff' : HNH.ink2,
            transition: 'all 0.2s',
          }}>
            <Icon name={t.icon} size={14} color={tab === t.id ? '#fff' : HNH.ink3} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-filters */}
      {tab === 'my_courses' && (
        <div style={{
          display: 'flex', gap: 4, padding: '4px 16px',
          maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
        }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.val} onClick={() => setStatusFilter(f.val)} style={{
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: statusFilter === f.val ? 600 : 400,
              background: statusFilter === f.val ? HNH.navy50 : 'transparent',
              color: statusFilter === f.val ? HNH.navy : HNH.ink3,
            }}>{f.label}</button>
          ))}
        </div>
      )}

      {tab === 'catalog' && data?.categories?.length > 0 && (
        <div style={{
          display: 'flex', gap: 4, padding: '4px 16px',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
        }}>
          <button onClick={() => setCategoryFilter('')} style={{
            padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: !categoryFilter ? 600 : 400,
            background: !categoryFilter ? HNH.navy50 : 'transparent',
            color: !categoryFilter ? HNH.navy : HNH.ink3, whiteSpace: 'nowrap',
          }}>Tất cả</button>
          {(data.categories as Category[]).map((c: Category) => (
            <button key={c.id} onClick={() => setCategoryFilter(String(c.id))} style={{
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: categoryFilter === String(c.id) ? 600 : 400,
              background: categoryFilter === String(c.id) ? HNH.navy50 : 'transparent',
              color: categoryFilter === String(c.id) ? HNH.navy : HNH.ink3, whiteSpace: 'nowrap',
            }}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{
        flex: 1, padding: '12px 16px 100px', overflowY: 'auto',
        maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: HNH.ink3, fontSize: 14 }}>
            Đang tải...
          </div>
        ) : !data ? (
          <EmptyState icon="book" text="Không có dữ liệu" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tab === 'overview' && (
              <OverviewTab data={data as OverviewData} onGoTab={goTab} />
            )}

            {tab === 'my_courses' && (data.courses || []).length === 0 && (
              <EmptyState icon="book" text="Chưa đăng ký khóa nào" sub="Chuyển sang Danh mục để tìm khóa học" />
            )}
            {tab === 'my_courses' && (data.courses || []).map((c: Course) => (
              <CourseCard key={c.id} course={c} onUpdateStatus={handleUpdateStatus} onCancel={handleCancel} />
            ))}

            {tab === 'catalog' && (data.courses || []).length === 0 && (
              <EmptyState icon="graduation" text="Chưa có khóa học nào" sub="Tab Quản lý → Tạo khóa học" />
            )}
            {tab === 'catalog' && (data.courses || []).map((c: Course) => (
              <CourseCard key={c.id} course={c} onEnroll={handleEnroll} onUpdateStatus={handleUpdateStatus} onCancel={handleCancel} />
            ))}

            {tab === 'team' && !data.is_manager && <EmptyState icon="users" text="Chỉ quản lý mới xem được" />}
            {tab === 'team' && data.is_manager && (data.members || []).length === 0 && (
              <EmptyState icon="users" text="Team chưa có khóa đào tạo" />
            )}
            {tab === 'team' && data.is_manager && (data.members || []).map((m: TeamMember) => (
              <TeamMemberCard key={m.id} member={m} />
            ))}

            {tab === 'manage' && (
              <ManageTab
                data={data}
                categories={data.categories || []}
                departments={data.departments || []}
                onRefresh={() => fetchTab('manage')}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
