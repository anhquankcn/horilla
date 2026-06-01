import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

/* ── Types ── */
interface ProjectItem {
  id: number; title: string; status: string; status_label: string
  start_date: string | null; end_date: string | null; description: string
  task_count: number; task_done: number; member_count: number; is_manager: boolean
}

interface TaskItem {
  id: number; title: string; status: string; status_label: string
  start_date: string | null; end_date: string | null; description: string
  stage_id: number; managers: string[]; members: string[]; is_my_task: boolean
}

interface Stage {
  id: number; title: string; sequence: number; is_end_stage: boolean; tasks: TaskItem[]
}

interface ProjectDetail {
  id: number; title: string; status: string; status_label: string
  start_date: string | null; end_date: string | null; description: string
  managers: { id: number; name: string }[]
  members: { id: number; name: string }[]
  is_manager: boolean; stages: Stage[]
}

/* ── Constants ── */
type StatusFilter = 'all' | 'in_progress' | 'new' | 'completed' | 'on_hold'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'in_progress', label: 'Đang thực hiện' },
  { key: 'new', label: 'Mới' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'on_hold', label: 'Tạm dừng' },
]

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  new: { bg: HNH.navy50, fg: HNH.navy },
  in_progress: { bg: HNH.warn50, fg: HNH.warn },
  completed: { bg: HNH.success50, fg: HNH.success },
  on_hold: { bg: '#faf1d6', fg: '#a87908' },
  cancelled: { bg: HNH.red50, fg: HNH.red },
  expired: { bg: '#eef0f4', fg: HNH.ink3 },
}

const TASK_STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  to_do: { bg: HNH.navy50, fg: HNH.navy },
  in_progress: { bg: HNH.warn50, fg: HNH.warn },
  completed: { bg: HNH.success50, fg: HNH.success },
  expired: { bg: '#eef0f4', fg: HNH.ink3 },
}

const TASK_STATUSES = [
  { key: 'to_do', label: 'To Do' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed', label: 'Hoàn thành' },
]

/* ── Helpers ── */
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
}

function progressPct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

/* ── Status Badge ── */
function StatusBadge({ status, label }: { status: string; label: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.new
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
      background: c.bg, color: c.fg,
    }}>{label}</span>
  )
}

/* ── Project Card ── */
function ProjectCard({ p, onClick }: { p: ProjectItem; onClick: () => void }) {
  const pct = progressPct(p.task_done, p.task_count)
  return (
    <button
      onClick={onClick}
      className="w-full border-none cursor-pointer text-left"
      style={{
        padding: '16px', borderRadius: 18, background: '#fff',
        border: `1px solid ${HNH.line}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{p.title}</div>
          <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 3 }}>{p.description}</div>
        </div>
        <StatusBadge status={p.status} label={p.status_label} />
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: HNH.ink2 }}>
            {p.task_done}/{p.task_count} task
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? HNH.success : HNH.navy }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: HNH.cream2 }}>
          <div style={{
            height: '100%', borderRadius: 3, width: `${pct}%`,
            background: pct === 100 ? HNH.success : HNH.navy,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4" style={{ marginTop: 10, fontSize: 11, color: HNH.ink3 }}>
        <span className="flex items-center gap-1">
          <Icon name="users" size={12} color={HNH.ink3} stroke={2} />
          {p.member_count}
        </span>
        <span>{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</span>
        {p.is_manager && (
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
            background: HNH.gold + '20', color: '#a87908',
          }}>PM</span>
        )}
      </div>
    </button>
  )
}

/* ── Task Card ── */
function TaskCard({ t, onStatusChange }: { t: TaskItem; onStatusChange: (status: string) => void }) {
  const c = TASK_STATUS_COLOR[t.status] ?? TASK_STATUS_COLOR.to_do
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14, background: '#fff',
      border: `1px solid ${t.is_my_task ? HNH.navy + '30' : HNH.line}`,
    }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{t.title}</div>
          {t.description && (
            <div style={{
              fontSize: 12, color: HNH.ink3, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            } as React.CSSProperties}>{t.description}</div>
          )}
        </div>
        {t.is_my_task && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: HNH.navy, flexShrink: 0, marginTop: 4 }} />
        )}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
        <div className="flex items-center gap-2">
          {t.end_date && (
            <span className="flex items-center gap-1" style={{ fontSize: 11, color: HNH.ink3 }}>
              <Icon name="clock" size={11} color={HNH.ink3} stroke={2} />
              {fmtDate(t.end_date)}
            </span>
          )}
          {t.members.length > 0 && (
            <span style={{ fontSize: 11, color: HNH.ink3 }}>
              {t.members.slice(0, 2).join(', ')}{t.members.length > 2 ? ` +${t.members.length - 2}` : ''}
            </span>
          )}
        </div>

        {/* Status quick-change */}
        <div className="flex gap-1">
          {TASK_STATUSES.map(s => (
            <button
              key={s.key}
              onClick={() => onStatusChange(s.key)}
              className="border-none cursor-pointer"
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                background: t.status === s.key ? c.bg : 'transparent',
                color: t.status === s.key ? c.fg : HNH.ink4,
                border: t.status === s.key ? 'none' : `1px solid ${HNH.line}`,
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Detail View (bottom sheet) ── */
function ProjectDetailSheet({ detail, onClose, onTaskStatus }: {
  detail: ProjectDetail; onClose: () => void
  onTaskStatus: (taskId: number, status: string) => void
}) {
  const totalTasks = detail.stages.reduce((s, st) => s + st.tasks.length, 0)
  const doneTasks = detail.stages.reduce(
    (s, st) => s + st.tasks.filter(t => t.status === 'completed').length, 0
  )
  const pct = progressPct(doneTasks, totalTasks)

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 100, background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: HNH.cream, borderRadius: '24px 24px 0 0', width: '100%',
          maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 0' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink }}>{detail.title}</div>
              <StatusBadge status={detail.status} label={detail.status_label} />
            </div>
            <button onClick={onClose} className="border-none cursor-pointer bg-transparent" style={{ padding: 4 }}>
              <Icon name="x" size={20} color={HNH.ink3} stroke={2} />
            </button>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8, fontSize: 12, color: HNH.ink3 }}>
            <span>{fmtDate(detail.start_date)} → {fmtDate(detail.end_date)}</span>
            <span>{detail.managers.map(m => m.name).join(', ')}</span>
          </div>

          {detail.description && (
            <div style={{
              marginTop: 10, padding: 12, background: '#fff', borderRadius: 12,
              fontSize: 13, color: HNH.ink2, lineHeight: 1.5,
              maxHeight: 80, overflow: 'auto',
            }}>{detail.description}</div>
          )}

          {/* Progress */}
          <div style={{ marginTop: 12 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2 }}>
                Tiến độ: {doneTasks}/{totalTasks} task
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? HNH.success : HNH.navy }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: HNH.cream2 }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${pct}%`,
                background: pct === 100 ? HNH.success : HNH.navy,
              }} />
            </div>
          </div>
        </div>

        {/* Stages + Tasks */}
        <div style={{ padding: '14px 20px 24px', overflowY: 'auto', flex: 1 }}>
          {detail.stages.map(stage => (
            <div key={stage.id} style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <div style={{
                  width: 4, height: 16, borderRadius: 2,
                  background: stage.is_end_stage ? HNH.success : HNH.navy,
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                  {stage.title}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: HNH.ink3,
                  background: HNH.cream2, borderRadius: 6, padding: '2px 7px',
                }}>{stage.tasks.length}</span>
              </div>

              {stage.tasks.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {stage.tasks.map(t => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      onStatusChange={status => onTaskStatus(t.id, status)}
                    />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '16px', textAlign: 'center', color: HNH.ink3,
                  fontSize: 12, background: '#fff', borderRadius: 12,
                  border: `1px dashed ${HNH.line}`,
                }}>Không có task</div>
              )}
            </div>
          ))}

          {detail.stages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3 }}>
              <Icon name="folder" size={36} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 13, marginTop: 8 }}>Chưa có stage nào</div>
            </div>
          )}

          {/* Members */}
          {detail.members.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 6 }}>
                Thành viên ({detail.members.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.members.map(m => (
                  <span key={m.id} style={{
                    fontSize: 11.5, fontWeight: 600, padding: '4px 10px',
                    borderRadius: 8, background: '#fff', color: HNH.ink,
                    border: `1px solid ${HNH.line}`,
                  }}>{m.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function ProjectsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [detail, setDetail] = useState<ProjectDetail | null>(null)

  const load = useCallback(async (f: StatusFilter) => {
    setLoading(true)
    try {
      const params = f !== 'all' ? `?status=${f}` : ''
      const data = await api.get<ProjectItem[]>(`/api/project/my-projects/${params}`)
      setProjects(data)
    } catch { setProjects([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const openDetail = async (id: number) => {
    try {
      const d = await api.get<ProjectDetail>(`/api/project/${id}/`)
      setDetail(d)
    } catch { toast('Không thể tải dự án') }
  }

  const handleTaskStatus = async (taskId: number, status: string) => {
    try {
      await api.patch(`/api/project/tasks/${taskId}/status/`, { status })
      if (detail) {
        const d = await api.get<ProjectDetail>(`/api/project/${detail.id}/`)
        setDetail(d)
      }
      load(filter)
    } catch { toast('Lỗi cập nhật task') }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Dự án" onBack={() => navigate(-1)} />

      <PullToRefresh onRefresh={async () => { await load(filter) }}>
        <div style={{ padding: '0 16px 32px', maxWidth: 640, margin: '0 auto' }}>
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto" style={{ marginBottom: 12, paddingBottom: 2 }}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="border-none cursor-pointer shrink-0"
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: filter === f.key ? HNH.navy : '#fff',
                  color: filter === f.key ? '#fff' : HNH.ink2,
                  fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${filter === f.key ? HNH.navy : HNH.line}`,
                }}
              >{f.label}</button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13 }}>
              Đang tải...
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50 }}>
              <Icon name="folder" size={40} color={HNH.ink4} stroke={1.5} />
              <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, marginTop: 12 }}>
                Không có dự án
              </div>
              <div style={{ fontSize: 12.5, color: HNH.ink3, marginTop: 4 }}>
                Bạn chưa tham gia dự án nào
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {projects.map(p => (
                <ProjectCard key={p.id} p={p} onClick={() => openDetail(p.id)} />
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>

      {detail && (
        <ProjectDetailSheet
          detail={detail}
          onClose={() => setDetail(null)}
          onTaskStatus={handleTaskStatus}
        />
      )}
    </div>
  )
}
