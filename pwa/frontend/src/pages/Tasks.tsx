import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'
import { useTablet } from '../lib/useTablet'

interface Task {
  id: number
  title: string
  description: string
  status: string
  priority: string
  due_date: string | null
  assigned_to: number
  assigned_to_name: string
  assigned_by_name: string
  department_name: string
  overdue_days: number
  is_overdue: boolean
  created_at: string
  updated_at: string
}

interface DeadlineGroup {
  key: string
  label: string
  color: string
  bg: string
  icon: string
  tasks: Task[]
  defaultOpen: boolean
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  to_do: { label: 'Cần làm', color: '#06b6d4', bg: '#ecfeff' },
  in_progress: { label: 'Đang làm', color: '#2563eb', bg: '#eff6ff' },
  done: { label: 'Hoàn thành', color: HNH.success, bg: HNH.success50 },
  blocked: { label: 'Bị chặn', color: '#ea580c', bg: '#fff7ed' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Thấp', color: HNH.ink3, bg: HNH.cream },
  normal: { label: 'B.thường', color: '#2563eb', bg: '#eff6ff' },
  high: { label: 'Cao', color: '#ea580c', bg: '#fff7ed' },
  urgent: { label: 'Khẩn', color: HNH.red, bg: HNH.red50 },
}

function groupTasksByDeadline(tasks: Task[]): DeadlineGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const day = today.getDay()
  const daysToSunday = day === 0 ? 0 : 7 - day
  const weekEnd = new Date(today)
  weekEnd.setDate(today.getDate() + daysToSunday)

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const bins: Record<string, Task[]> = {
    overdue: [], today: [], week: [], month: [], later: [], done: [],
  }

  for (const t of tasks) {
    if (t.status === 'done') { bins.done.push(t); continue }
    if (!t.due_date) { bins.later.push(t); continue }
    const d = new Date(t.due_date + 'T00:00:00')
    if (d < today) bins.overdue.push(t)
    else if (d.getTime() === today.getTime()) bins.today.push(t)
    else if (d <= weekEnd) bins.week.push(t)
    else if (d <= monthEnd) bins.month.push(t)
    else bins.later.push(t)
  }

  return [
    { key: 'overdue', label: 'Quá hạn', color: HNH.red, bg: HNH.red50, icon: 'alert', tasks: bins.overdue, defaultOpen: true },
    { key: 'today', label: 'Hôm nay', color: '#2563eb', bg: '#eff6ff', icon: 'star', tasks: bins.today, defaultOpen: true },
    { key: 'week', label: 'Tuần này', color: '#06b6d4', bg: '#ecfeff', icon: 'cal', tasks: bins.week, defaultOpen: true },
    { key: 'month', label: 'Tháng này', color: HNH.success, bg: HNH.success50, icon: 'cal', tasks: bins.month, defaultOpen: true },
    { key: 'later', label: 'Không có deadline / Xa hơn', color: HNH.ink3, bg: HNH.cream, icon: 'clock', tasks: bins.later, defaultOpen: false },
    { key: 'done', label: 'Hoàn thành', color: HNH.success, bg: HNH.success50, icon: 'check', tasks: bins.done, defaultOpen: false },
  ].filter(g => g.tasks.length > 0)
}

function ModalShell({ open, children, isTablet }: { open: boolean; children: React.ReactNode; isTablet: boolean }) {
  if (!open) return null
  return (
    <div
      className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
      style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className={isTablet ? '' : 'flex-1 overflow-y-auto'}
        style={isTablet
          ? { width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }
          : { WebkitOverflowScrolling: 'touch' as never }
        }
      >
        <div style={{ minHeight: isTablet ? undefined : '100%', background: HNH.cream, paddingBottom: 20, borderRadius: isTablet ? 24 : 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function TaskFormModal({ open, onClose, onSaved, editTask, isTablet }: {
  open: boolean; onClose: () => void; onSaved: () => void; editTask: Task | null; isTablet: boolean
}) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(editTask?.title ?? '')
      setDesc(editTask?.description ?? '')
      setPriority(editTask?.priority ?? 'normal')
      setDueDate(editTask?.due_date ?? '')
      setError('')
      setSaving(false)
    }
  }, [open, editTask])

  if (!open) return null

  const isEdit = !!editTask

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.put(`/api/eoffice/tasks/${editTask!.id}/`, {
          title, description: desc, priority, due_date: dueDate || null,
        })
      } else {
        await api.post('/api/eoffice/tasks/', {
          title, description: desc, priority, due_date: dueDate || null,
        })
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra'
      setError(msg)
    } finally { setSaving(false) }
  }

  return (
    <ModalShell open={open} isTablet={isTablet}>
      <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}`, borderRadius: isTablet ? '24px 24px 0 0' : 0 }}>
        <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
          <Icon name="x" size={18} color={HNH.ink} stroke={2} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>{isEdit ? 'Sửa công việc' : 'Tạo công việc'}</div>
        <div style={{ width: 36 }} />
      </div>

      <div className="flex flex-col gap-3" style={{ padding: '16px' }}>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: HNH.red50, color: HNH.red, fontSize: 13, fontWeight: 600 }}>
            {error}
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4, display: 'block' }}>Tiêu đề *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nhập tiêu đề công việc"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${HNH.line}`, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4, display: 'block' }}>Mô tả</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Mô tả chi tiết..." rows={3}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${HNH.line}`, fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4, display: 'block' }}>Ưu tiên</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${HNH.line}`, fontSize: 14, background: '#fff' }}>
              <option value="low">Thấp</option>
              <option value="normal">Bình thường</option>
              <option value="high">Cao</option>
              <option value="urgent">Khẩn cấp</option>
            </select>
          </div>
          <div className="flex-1">
            <label style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4, display: 'block' }}>Deadline</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${HNH.line}`, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
          style={{
            marginTop: 8, height: 48, borderRadius: 14,
            background: saving ? HNH.ink3 : HNH.navy,
            color: '#fff', fontWeight: 700, fontSize: 14,
            opacity: !title.trim() ? 0.5 : 1,
          }}
        >
          <Icon name="check" size={18} color="#fff" stroke={2.2} />
          {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo công việc'}
        </button>
      </div>
    </ModalShell>
  )
}

function TaskDetailModal({ open, onClose, task, onRefresh, isTablet }: {
  open: boolean; onClose: () => void; task: Task | null; onRefresh: () => void; isTablet: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setEditing(false); setError(''); setDeleting(false) } }, [open])

  if (!open || !task) return null
  const sm = STATUS_META[task.status] ?? STATUS_META.to_do
  const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.normal

  async function changeStatus(newStatus: string) {
    setStatusChanging(true)
    setError('')
    try {
      await api.put(`/api/eoffice/tasks/${task!.id}/`, { status: newStatus })
      onRefresh()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không thể đổi trạng thái.')
    } finally { setStatusChanging(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await api.del(`/api/eoffice/tasks/${task!.id}/`)
      onRefresh()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không thể xóa. Vui lòng thử lại.')
    } finally { setDeleting(false) }
  }

  const statusActions = [
    { key: 'to_do', label: 'Cần làm' },
    { key: 'in_progress', label: 'Đang làm' },
    { key: 'done', label: 'Hoàn thành' },
    { key: 'blocked', label: 'Bị chặn' },
  ].filter(s => s.key !== task.status)

  return (
    <>
      <ModalShell open={open && !editing} isTablet={isTablet}>
        <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}`, borderRadius: isTablet ? '24px 24px 0 0' : 0 }}>
          <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
            <Icon name="x" size={18} color={HNH.ink} stroke={2} />
          </button>
          <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Chi tiết công việc</div>
          <button onClick={() => setEditing(true)} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
            <Icon name="doc" size={16} color={HNH.ink} stroke={2} />
          </button>
        </div>

        <div style={{ padding: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: HNH.red50, color: HNH.red, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', border: `1px solid ${HNH.line}`, marginBottom: 12 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: sm.bg, color: sm.color }}>{sm.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: pm.bg, color: pm.color }}>{pm.label}</span>
              {task.is_overdue && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: HNH.red50, color: HNH.red }}>Trễ {task.overdue_days} ngày</span>}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: HNH.ink, lineHeight: 1.4 }}>{task.title}</div>
            {task.description && <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 8, lineHeight: 1.5 }}>{task.description}</div>}
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: '12px 16px', border: `1px solid ${HNH.line}`, marginBottom: 12 }}>
            {[
              { label: 'Giao cho', value: task.assigned_to_name },
              { label: 'Người giao', value: task.assigned_by_name },
              { label: 'Phòng ban', value: task.department_name },
              { label: 'Deadline', value: task.due_date ? task.due_date.split('-').reverse().join('/') : '—' },
            ].map((r, i, arr) => (
              <div key={r.label} className="flex justify-between" style={{ padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${HNH.line}` : 'none' }}>
                <span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 500 }}>{r.label}</span>
                <span style={{ fontSize: 12.5, color: HNH.ink, fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>Chuyển trạng thái</div>
          <div className="flex gap-2 flex-wrap">
            {statusActions.map(s => {
              const m = STATUS_META[s.key]
              return (
                <button key={s.key} onClick={() => changeStatus(s.key)} disabled={statusChanging}
                  className="border-none cursor-pointer" style={{ padding: '8px 16px', borderRadius: 10, background: m.bg, color: m.color, fontWeight: 700, fontSize: 12 }}>
                  {s.label}
                </button>
              )
            })}
          </div>

          {deleting ? (
            <div className="flex gap-2" style={{ marginTop: 20 }}>
              <button
                onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 border-none cursor-pointer"
                style={{ height: 44, borderRadius: 14, background: HNH.red, color: '#fff', fontWeight: 700, fontSize: 13 }}
              >
                <Icon name="x" size={14} color="#fff" stroke={2.2} />
                Xác nhận xóa
              </button>
              <button
                onClick={() => setDeleting(false)}
                className="flex items-center justify-center border-none cursor-pointer"
                style={{ height: 44, borderRadius: 14, background: HNH.cream, color: HNH.ink, fontWeight: 700, fontSize: 13, padding: '0 20px' }}
              >
                Hủy
              </button>
            </div>
          ) : (
            <button onClick={() => setDeleting(true)}
              className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
              style={{ marginTop: 20, height: 44, borderRadius: 14, background: HNH.red50, color: HNH.red, fontWeight: 700, fontSize: 13 }}>
              <Icon name="x" size={14} color={HNH.red} stroke={2.2} />
              Xóa công việc
            </button>
          )}
        </div>
      </ModalShell>

      <TaskFormModal
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => { onRefresh(); onClose() }}
        editTask={task}
        isTablet={isTablet}
      />
    </>
  )
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const sm = STATUS_META[task.status] ?? STATUS_META.to_do
  const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.normal
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full text-left border-none cursor-pointer"
      style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 16, padding: '12px 14px' }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sm.color, flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: sm.bg, color: sm.color }}>{sm.label}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: pm.bg, color: pm.color }}>{pm.label}</span>
          {task.due_date && (
            <span style={{ fontSize: 10.5, color: HNH.ink3 }}>
              {task.due_date.slice(8)}/{task.due_date.slice(5, 7)}
            </span>
          )}
          {task.is_overdue && <span style={{ fontSize: 10.5, fontWeight: 700, color: HNH.red }}>Trễ {task.overdue_days}d</span>}
        </div>
      </div>
      <Icon name="chev-r" size={14} color={HNH.ink4} stroke={1.5} />
    </button>
  )
}

function GroupSection({ group, isTablet, onTaskClick }: {
  group: DeadlineGroup; isTablet: boolean; onTaskClick: (task: Task) => void
}) {
  const [open, setOpen] = useState(group.defaultOpen)

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full border-none bg-transparent cursor-pointer text-left"
        style={{ padding: '8px 0' }}
      >
        <div
          className="flex items-center justify-center"
          style={{ width: 26, height: 26, borderRadius: 8, background: group.bg }}
        >
          <Icon name={group.icon} size={13} color={group.color} stroke={2} />
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: group.color }}>{group.label}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 6,
          background: group.bg, color: group.color,
        }}>
          {group.tasks.length}
        </span>
        <div className="ml-auto" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }}>
          <Icon name="chev-r" size={14} color={HNH.ink4} stroke={2} />
        </div>
      </button>

      {open && (
        <div
          className={isTablet ? 'grid gap-2' : 'flex flex-col gap-2'}
          style={isTablet ? { gridTemplateColumns: '1fr 1fr', paddingBottom: 6 } : { paddingBottom: 6 }}
        >
          {group.tasks.map(t => (
            <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function TasksPage() {
  const navigate = useNavigate()
  const isTablet = useTablet()
  const px = isTablet ? 28 : 20
  const [filterStatus, setFilterStatus] = useState('')
  const path = filterStatus ? `/api/eoffice/my-tasks/?status=${filterStatus}` : '/api/eoffice/my-tasks/'
  const { data: tasks, loading, refresh } = useApi<Task[]>(path)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const groups = tasks ? groupTasksByDeadline(tasks) : []

  const filters = [
    { key: '', label: 'Tất cả' },
    { key: 'to_do', label: 'Cần làm' },
    { key: 'in_progress', label: 'Đang làm' },
    { key: 'blocked', label: 'Bị chặn' },
    { key: 'done', label: 'Xong' },
  ]

  return (
    <div style={{ padding: '6px 0 14px' }}>
      <div className="flex items-center justify-between" style={{ padding: `8px ${px}px 12px` }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: HNH.ink, letterSpacing: -0.3 }}>Công việc</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/tasks/1stopshop')}
            className="flex items-center gap-1.5 border-none cursor-pointer"
            style={{ background: HNH.cream, color: HNH.navy, padding: '8px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12, border: `1px solid ${HNH.line}` }}
          >
            <Icon name="globe" size={14} color={HNH.navy} stroke={2} />
            1StopShop
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 border-none cursor-pointer"
            style={{ background: HNH.navy, color: '#fff', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12 }}
          >
            <Icon name="plus" size={14} color="#fff" stroke={2.5} />
            Tạo mới
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto" style={{ padding: `0 ${px}px 12px`, scrollbarWidth: 'none' }}>
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className="border-none cursor-pointer shrink-0"
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: filterStatus === f.key ? HNH.navy : '#fff',
              color: filterStatus === f.key ? '#fff' : HNH.ink3,
              border: `1px solid ${filterStatus === f.key ? HNH.navy : HNH.line}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task groups by deadline */}
      <div style={{ padding: `0 ${px}px` }}>
        {loading && <div style={{ padding: 30, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>}

        {!loading && tasks && tasks.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}` }}>
            <Icon name="doc" size={32} color={HNH.ink3} />
            <div style={{ color: HNH.ink3, fontSize: 13, marginTop: 8 }}>Chưa có công việc</div>
          </div>
        )}

        {groups.map(g => (
          <GroupSection key={g.key} group={g} isTablet={isTablet} onTaskClick={setSelectedTask} />
        ))}
      </div>

      <TaskFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={refresh} editTask={null} isTablet={isTablet} />
      <TaskDetailModal open={!!selectedTask} onClose={() => setSelectedTask(null)} task={selectedTask} onRefresh={refresh} isTablet={isTablet} />
    </div>
  )
}
