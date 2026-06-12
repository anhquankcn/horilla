import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

/* ── Types ── */
interface KR {
  id: number
  title: string
  description: string
  start_value: number
  current_value: number
  target_value: number
  progress: number
  status: string
  progress_type: string
  start_date: string | null
  end_date: string | null
  objective_title?: string
  objective_id?: number
  status_color?: string
  is_overdue?: boolean
}

interface CommentItem {
  id: number
  text: string
  author: string
  created_at: string | null
}

interface Objective {
  id: number
  title: string
  description: string
  employee: string
  employee_id: number | null
  department: string | null
  avatar: string | null
  status: string
  status_color: string
  progress: number
  start_date: string | null
  end_date: string | null
  is_overdue: boolean
  days_left: number | null
  key_results: KR[]
  comments: CommentItem[]
  is_mine: boolean
}

interface FeedbackItem {
  id: number
  title: string
  employee: string
  manager: string
  status: string
  status_color: string
  start_date: string | null
  end_date: string | null
  days_left: number | null
  is_cyclic: boolean
  my_role: string[]
  template: string | null
}

interface Overview {
  my_objectives: number
  by_status: Record<string, number>
  avg_progress: number
  my_key_results: number
  kr_completed: number
  feedback_total: number
  feedback_pending: number
  team_objectives: number
  team_avg_progress: number
  is_manager: boolean
}

type Tab = 'overview' | 'objectives' | 'key_results' | 'feedback'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'bar-chart' },
  { id: 'objectives', label: 'Mục tiêu', icon: 'target' },
  { id: 'key_results', label: 'KPI', icon: 'trending-up' },
  { id: 'feedback', label: 'Feedback', icon: 'message' },
]

const STATUS_VI: Record<string, string> = {
  'Not Started': 'Chưa bắt đầu',
  'On Track': 'Đúng tiến độ',
  'Behind': 'Chậm tiến độ',
  'At Risk': 'Rủi ro',
  'Closed': 'Hoàn thành',
}

/* ── Overview Tab ── */
function OverviewTab({ data }: { data: Overview }) {
  const statItems = [
    { label: 'Mục tiêu', value: data.my_objectives, icon: 'target', color: HNH.navy },
    { label: 'KPI', value: data.my_key_results, icon: 'trending-up', color: '#7c3aed' },
    { label: 'KPI hoàn thành', value: data.kr_completed, icon: 'check', color: HNH.success },
    { label: 'Feedback', value: data.feedback_total, icon: 'message', color: HNH.gold },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {statItems.map(s => (
          <div key={s.label} style={{
            background: HNH.white, borderRadius: 16, padding: 16,
            border: `1px solid ${HNH.line}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={s.icon} size={16} color={s.color} />
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: HNH.ink }}>{s.value}</div>
            <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Average progress */}
      <div style={{
        background: HNH.white, borderRadius: 16, padding: 20,
        border: `1px solid ${HNH.line}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink2, marginBottom: 12 }}>
          Tiến độ trung bình
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', position: 'relative',
            background: `conic-gradient(${HNH.success} ${data.avg_progress * 3.6}deg, ${HNH.line} 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: HNH.white,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: HNH.ink,
            }}>
              {data.avg_progress}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>
              {data.avg_progress >= 70 ? 'Tốt' : data.avg_progress >= 40 ? 'Đang tiến triển' : 'Cần cải thiện'}
            </div>
            <div style={{ fontSize: 12, color: HNH.ink3 }}>
              {data.my_objectives} mục tiêu · {data.my_key_results} KPI
            </div>
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      <div style={{
        background: HNH.white, borderRadius: 16, padding: 20,
        border: `1px solid ${HNH.line}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink2, marginBottom: 12 }}>
          Phân bổ trạng thái
        </div>
        {Object.entries(data.by_status).map(([status, count]) => (
          <div key={status} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: `1px solid ${HNH.line}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot status={status} />
              <span style={{ fontSize: 13, color: HNH.ink }}>{STATUS_VI[status] || status}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Team stats (if manager) */}
      {data.is_manager && data.team_objectives > 0 && (
        <div style={{
          background: `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
          borderRadius: 16, padding: 20, color: '#fff',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>
            Team của bạn
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.team_objectives}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Mục tiêu</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.team_avg_progress}%</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Tiến độ TB</div>
            </div>
          </div>
        </div>
      )}

      {/* Pending feedback */}
      {data.feedback_pending > 0 && (
        <div style={{
          background: HNH.warn50, borderRadius: 16, padding: 16,
          border: `1px solid ${HNH.gold}33`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Icon name="bell" size={18} color={HNH.warn} />
          <div style={{ fontSize: 13, color: HNH.ink }}>
            <strong>{data.feedback_pending}</strong> feedback đang chờ phản hồi
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Helpers ── */
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Not Started': '#6b7280',
    'On Track': '#059669',
    'Behind': '#d97706',
    'At Risk': '#dc2626',
    'Closed': '#6366f1',
  }
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: colors[status] || '#6b7280',
    }} />
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    'Not Started': { bg: '#f3f4f6', fg: '#6b7280' },
    'On Track': { bg: '#ecfdf5', fg: '#059669' },
    'Behind': { bg: '#fef3c7', fg: '#d97706' },
    'At Risk': { bg: '#fef2f2', fg: '#dc2626' },
    'Closed': { bg: '#eef2ff', fg: '#6366f1' },
  }
  const c = colors[status] || colors['Not Started']
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      background: c.bg, color: c.fg, whiteSpace: 'nowrap',
    }}>
      {STATUS_VI[status] || status}
    </span>
  )
}

function ProgressBar({ value, height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <div style={{
      height, borderRadius: height / 2, background: HNH.line, overflow: 'hidden', width: '100%',
    }}>
      <div style={{
        height: '100%', borderRadius: height / 2,
        width: `${Math.min(100, Math.max(0, value))}%`,
        background: value >= 100 ? HNH.success : value >= 70 ? '#059669' : value >= 40 ? HNH.gold : HNH.warn,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function formatDate(d: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

/* ── Objective Card ── */
function ObjectiveCard({
  obj, onUpdateStatus, onUpdateKR, onAddComment,
}: {
  obj: Objective
  onUpdateStatus: (id: number, status: string) => void
  onUpdateKR: (krId: number, value: number) => void
  onAddComment: (objId: number, text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [commentText, setCommentText] = useState('')

  return (
    <div style={{
      background: HNH.white, borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${HNH.line}`,
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: 16, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink, marginBottom: 4 }}>
              {obj.title}
            </div>
            {!obj.is_mine && (
              <div style={{ fontSize: 12, color: HNH.ink3 }}>
                {obj.employee}{obj.department ? ` · ${obj.department}` : ''}
              </div>
            )}
          </div>
          <StatusBadge status={obj.status} />
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ProgressBar value={obj.progress} />
          <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, minWidth: 36, textAlign: 'right' }}>
            {obj.progress}%
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: HNH.ink3 }}>
          {obj.start_date && <span>{formatDate(obj.start_date)} → {formatDate(obj.end_date)}</span>}
          <span>{obj.key_results.length} KPI</span>
          {obj.is_overdue && <span style={{ color: '#dc2626', fontWeight: 600 }}>Quá hạn</span>}
          {obj.days_left != null && obj.days_left > 0 && !obj.is_overdue && (
            <span>Còn {obj.days_left} ngày</span>
          )}
          <div style={{
            marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>
            <Icon name="chev-d" size={14} color={HNH.ink3} />
          </div>
        </div>
      </div>

      {/* Expanded: Key Results + Comments */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${HNH.line}`, padding: 16 }}>
          {/* Key Results */}
          {obj.key_results.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 8 }}>
                Key Results
              </div>
              {obj.key_results.map(kr => (
                <KRRow key={kr.id} kr={kr} canEdit={obj.is_mine} onUpdate={onUpdateKR} />
              ))}
            </div>
          )}

          {/* Status change */}
          {obj.is_mine && obj.status !== 'Closed' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6 }}>
                Cập nhật trạng thái
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Not Started', 'On Track', 'Behind', 'At Risk', 'Closed'].map(s => (
                  <button
                    key={s}
                    onClick={() => onUpdateStatus(obj.id, s)}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: obj.status === s ? HNH.navy : HNH.cream2,
                      color: obj.status === s ? '#fff' : HNH.ink2,
                      fontWeight: obj.status === s ? 600 : 400,
                    }}
                  >
                    {STATUS_VI[s] || s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          {obj.comments.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, marginBottom: 6 }}>
                Bình luận
              </div>
              {obj.comments.map(c => (
                <div key={c.id} style={{
                  padding: '8px 0', borderBottom: `1px solid ${HNH.line}`,
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, color: HNH.ink }}>{c.author}</span>
                  <span style={{ color: HNH.ink3, marginLeft: 6 }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('vi-VN') : ''}
                  </span>
                  <div style={{ color: HNH.ink2, marginTop: 2 }}>{c.text}</div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Thêm bình luận..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${HNH.line}`,
                fontSize: 13, outline: 'none', background: HNH.cream,
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && commentText.trim()) {
                  onAddComment(obj.id, commentText)
                  setCommentText('')
                }
              }}
            />
            <button
              onClick={() => {
                if (commentText.trim()) {
                  onAddComment(obj.id, commentText)
                  setCommentText('')
                }
              }}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: HNH.navy, color: '#fff', fontSize: 12, fontWeight: 600,
              }}
            >
              Gửi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── KR Row ── */
function KRRow({ kr, canEdit, onUpdate }: { kr: KR; canEdit: boolean; onUpdate: (id: number, val: number) => void }) {
  const pct = kr.target_value > 0 ? Math.round((kr.current_value / kr.target_value) * 100) : 0
  return (
    <div style={{
      padding: '10px 0', borderBottom: `1px solid ${HNH.line}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: HNH.ink, fontWeight: 500 }}>{kr.title}</span>
        <StatusBadge status={kr.status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ProgressBar value={pct} height={4} />
        <span style={{ fontSize: 11, fontWeight: 600, color: HNH.ink2, minWidth: 30, textAlign: 'right' }}>
          {pct}%
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: HNH.ink3 }}>
        {canEdit ? (
          <>
            <input
              type="number"
              defaultValue={kr.current_value}
              min={0}
              style={{
                width: 60, padding: '3px 6px', borderRadius: 4, border: `1px solid ${HNH.line}`,
                fontSize: 12, textAlign: 'center',
              }}
              onBlur={e => {
                const v = parseInt(e.target.value) || 0
                if (v !== kr.current_value) onUpdate(kr.id, v)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = parseInt((e.target as HTMLInputElement).value) || 0
                  if (v !== kr.current_value) onUpdate(kr.id, v)
                }
              }}
            />
            <span>/ {kr.target_value}</span>
          </>
        ) : (
          <span>{kr.current_value} / {kr.target_value}</span>
        )}
        {kr.progress_type !== '%' && <span>({kr.progress_type})</span>}
      </div>
    </div>
  )
}

/* ── KR Card (standalone) ── */
function KRCard({ kr, onUpdate }: { kr: KR; onUpdate: (id: number, val: number) => void }) {
  const pct = kr.target_value > 0 ? Math.round((kr.current_value / kr.target_value) * 100) : 0
  return (
    <div style={{
      background: HNH.white, borderRadius: 16, padding: 16,
      border: `1px solid ${HNH.line}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{kr.title}</span>
        <StatusBadge status={kr.status} />
      </div>
      {kr.objective_title && (
        <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 8 }}>
          Mục tiêu: {kr.objective_title}
        </div>
      )}

      {/* Value display */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: 12, background: HNH.cream, borderRadius: 12, marginBottom: 10,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: HNH.ink3, marginBottom: 2 }}>Hiện tại</div>
          <input
            type="number"
            defaultValue={kr.current_value}
            min={0}
            style={{
              width: 64, padding: '4px 6px', borderRadius: 6, border: `1px solid ${HNH.line}`,
              fontSize: 16, fontWeight: 700, textAlign: 'center', background: HNH.white,
            }}
            onBlur={e => {
              const v = parseInt(e.target.value) || 0
              if (v !== kr.current_value) onUpdate(kr.id, v)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = parseInt((e.target as HTMLInputElement).value) || 0
                if (v !== kr.current_value) onUpdate(kr.id, v)
              }
            }}
          />
        </div>
        <div style={{ fontSize: 18, color: HNH.ink3 }}>/</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: HNH.ink3, marginBottom: 2 }}>Mục tiêu</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>{kr.target_value}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ProgressBar value={pct} />
        <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2, minWidth: 36, textAlign: 'right' }}>
          {pct}%
        </span>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: HNH.ink3 }}>
        {kr.start_date && <span>{formatDate(kr.start_date)} → {formatDate(kr.end_date)}</span>}
        {kr.is_overdue && <span style={{ color: '#dc2626', fontWeight: 600 }}>Quá hạn</span>}
      </div>
    </div>
  )
}

/* ── Feedback Card ── */
function FeedbackCard({ fb }: { fb: FeedbackItem }) {
  const roleLabels: Record<string, string> = {
    employee: 'Nhân viên',
    manager: 'Quản lý',
    colleague: 'Đồng nghiệp',
    subordinate: 'Cấp dưới',
  }
  return (
    <div style={{
      background: HNH.white, borderRadius: 16, padding: 16,
      border: `1px solid ${HNH.line}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{fb.title}</span>
        <StatusBadge status={fb.status} />
      </div>

      <div style={{ fontSize: 12, color: HNH.ink2, marginBottom: 8 }}>
        {fb.employee}{fb.manager ? ` · QL: ${fb.manager}` : ''}
      </div>

      {/* My roles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {fb.my_role.map(r => (
          <span key={r} style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            background: HNH.navy50, color: HNH.navy,
          }}>
            {roleLabels[r] || r}
          </span>
        ))}
        {fb.is_cyclic && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            background: '#fef3c7', color: '#d97706',
          }}>
            Định kỳ
          </span>
        )}
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: HNH.ink3 }}>
        {fb.start_date && <span>{formatDate(fb.start_date)} → {formatDate(fb.end_date)}</span>}
        {fb.days_left != null && fb.days_left > 0 && <span>Còn {fb.days_left} ngày</span>}
        {fb.days_left != null && fb.days_left < 0 && (
          <span style={{ color: '#dc2626', fontWeight: 600 }}>Quá hạn</span>
        )}
        {fb.template && <span>{fb.template}</span>}
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function PMSPage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [scope, setScope] = useState<'my' | 'team'>('my')
  const [canViewTeam, setCanViewTeam] = useState(false)

  const fetchTab = useCallback(async (t: Tab, s?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab: t })
      if (t === 'objectives' && s) params.set('scope', s)
      const res = await api.get(`/api/employee/pms/?${params}`) as any
      setData(res)
      if (res.can_view_team !== undefined) setCanViewTeam(res.can_view_team)
    } catch {
      setData(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTab(tab, scope) }, [tab, scope, fetchTab])

  const handleUpdateStatus = async (objId: number, status: string) => {
    try {
      await api.post('/api/employee/pms/', { action: 'update_obj_status', obj_id: objId, status })
      fetchTab(tab, scope)
    } catch { /* */ }
  }

  const handleUpdateKR = async (krId: number, value: number) => {
    try {
      await api.post('/api/employee/pms/', { action: 'update_kr_value', kr_id: krId, current_value: value })
      fetchTab(tab, scope)
    } catch { /* */ }
  }

  const handleAddComment = async (objId: number, text: string) => {
    try {
      await api.post('/api/employee/pms/', { action: 'add_comment', obj_id: objId, comment: text })
      fetchTab(tab, scope)
    } catch { /* */ }
  }

  const mx = isTablet ? 560 : undefined

  return (
    <div style={{ minHeight: '100dvh', background: HNH.cream, display: 'flex', flexDirection: 'column' }}>
      <TopBar onBack={() => navigate(-1)} title="Hiệu suất" />

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 16px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setData(null); setTab(t.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400, whiteSpace: 'nowrap',
              background: tab === t.id ? HNH.navy : 'transparent',
              color: tab === t.id ? '#fff' : HNH.ink2,
              transition: 'all 0.2s',
            }}
          >
            <Icon name={t.icon} size={14} color={tab === t.id ? '#fff' : HNH.ink3} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Scope toggle (objectives tab only) */}
      {tab === 'objectives' && canViewTeam && (
        <div style={{
          display: 'flex', gap: 4, padding: '4px 16px',
          maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
        }}>
          {(['my', 'team'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: scope === s ? 600 : 400,
                background: scope === s ? HNH.navy50 : 'transparent',
                color: scope === s ? HNH.navy : HNH.ink3,
              }}
            >
              {s === 'my' ? 'Của tôi' : 'Team'}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{
        flex: 1, padding: '12px 16px 100px', overflowY: 'auto',
        maxWidth: mx, margin: mx ? '0 auto' : undefined, width: '100%',
      }}>
        {loading ? (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: 200, color: HNH.ink3, fontSize: 14,
          }}>
            Đang tải...
          </div>
        ) : !data ? (
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            height: 200, color: HNH.ink3, fontSize: 14, textAlign: 'center',
          }}>
            <Icon name="target" size={40} color={HNH.ink4} />
            <div style={{ marginTop: 12 }}>Không có dữ liệu</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tab === 'overview' && <OverviewTab data={data as Overview} />}

            {tab === 'objectives' && (data.objectives || []).length === 0 && (
              <div style={{
                textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 14,
              }}>
                <Icon name="target" size={40} color={HNH.ink4} />
                <div style={{ marginTop: 12 }}>Chưa có mục tiêu nào</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Tạo mục tiêu tại trang PMS trên web
                </div>
              </div>
            )}
            {tab === 'objectives' && (data.objectives || []).map((obj: Objective) => (
              <ObjectiveCard
                key={obj.id}
                obj={obj}
                onUpdateStatus={handleUpdateStatus}
                onUpdateKR={handleUpdateKR}
                onAddComment={handleAddComment}
              />
            ))}

            {tab === 'key_results' && (data.key_results || []).length === 0 && (
              <div style={{
                textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 14,
              }}>
                <Icon name="trending-up" size={40} color={HNH.ink4} />
                <div style={{ marginTop: 12 }}>Chưa có KPI nào</div>
              </div>
            )}
            {tab === 'key_results' && (data.key_results || []).map((kr: KR) => (
              <KRCard key={kr.id} kr={kr} onUpdate={handleUpdateKR} />
            ))}

            {tab === 'feedback' && (data.feedbacks || []).length === 0 && (
              <div style={{
                textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 14,
              }}>
                <Icon name="message" size={40} color={HNH.ink4} />
                <div style={{ marginTop: 12 }}>Chưa có feedback nào</div>
              </div>
            )}
            {tab === 'feedback' && (data.feedbacks || []).map((fb: FeedbackItem) => (
              <FeedbackCard key={fb.id} fb={fb} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
