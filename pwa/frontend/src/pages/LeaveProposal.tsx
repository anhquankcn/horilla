import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

/* ── Types ── */
interface LeaveBalance {
  id: number
  leave_type_id: number
  leave_type_name: string
  available_days: number
  carryforward_days: number
  total_days: number
}

interface LeaveSummary {
  balances: LeaveBalance[]
  pending_count: number
  approved_count: number
}

interface LeaveTypeOption {
  id: number
  name: string
}

interface Manager {
  id: number
  name: string
  position: string | null
  is_direct: boolean
}

interface Watcher {
  id: number
  name: string
  position: string | null
  department: string | null
}

type ViewState = 'overview' | 'form'
type ApprovalMode = 'single' | 'all' | 'sequential'

const BREAKDOWN_OPTIONS = [
  { value: 'full_day', label: 'Cả ngày' },
  { value: 'first_half', label: 'Nửa sáng' },
  { value: 'second_half', label: 'Nửa chiều' },
]

/* ── Balance Card ── */
function BalanceCard({ b }: { b: LeaveBalance }) {
  const pct = b.total_days > 0 ? Math.min(1, b.available_days / b.total_days) : 0
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '12px 14px',
      border: `1px solid ${HNH.line}`,
    }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>{b.leave_type_name}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: HNH.navy }}>
          {b.available_days}/{b.total_days}
        </span>
      </div>
      <div style={{
        height: 5, borderRadius: 3, background: HNH.cream2, marginTop: 8, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 3, width: `${pct * 100}%`,
          background: pct > 0.3 ? HNH.navy : HNH.red,
          transition: 'width 0.3s',
        }} />
      </div>
      {b.carryforward_days > 0 && (
        <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 4 }}>
          Phép chuyển: {b.carryforward_days} ngày
        </div>
      )}
    </div>
  )
}

/* ── Leave Form ── */
function LeaveForm({ leaveTypes, managers, watchers, onSubmit, submitting, editData }: {
  leaveTypes: LeaveTypeOption[]
  managers: Manager[]
  watchers: Watcher[]
  onSubmit: (data: Record<string, unknown>) => void
  submitting: boolean
  editData?: EditData | null
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(editData?.leave_type_id || '')
  const [isHourly, setIsHourly] = useState(editData?.isHourly || false)
  const [startDate, setStartDate] = useState(editData?.start_date || '')
  const [endDate, setEndDate] = useState(editData?.end_date || '')
  const [startBreakdown, setStartBreakdown] = useState(editData?.start_date_breakdown || 'full_day')
  const [endBreakdown, setEndBreakdown] = useState(editData?.end_date_breakdown || 'full_day')
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('12:00')
  const [description, setDescription] = useState(editData?.description || '')
  const [selectedManagers, setSelectedManagers] = useState<number[]>([])
  const [selectedWatchers, setSelectedWatchers] = useState<number[]>([])
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('single')

  useEffect(() => {
    const direct = managers.find(m => m.is_direct)
    if (direct) setSelectedManagers([direct.id])
  }, [managers])

  useEffect(() => {
    if (watchers.length > 0) setSelectedWatchers(watchers.map(w => w.id))
  }, [watchers])

  const toggleManager = (id: number) => {
    setSelectedManagers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleWatcher = (id: number) => {
    setSelectedWatchers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const canSubmit = !!leaveTypeId && !!startDate && (isHourly || !!description) && selectedManagers.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      leave_type_id: parseInt(leaveTypeId),
      start_date: startDate,
      end_date: isHourly ? startDate : (endDate || startDate),
      start_date_breakdown: isHourly ? 'full_day' : startBreakdown,
      end_date_breakdown: isHourly ? 'full_day' : endBreakdown,
      description: isHourly
        ? `[Nghỉ theo giờ] ${startTime}–${endTime}${description ? '. ' + description : ''}`
        : description,
      approval_mode: approvalMode,
      approver_ids: selectedManagers,
      watcher_ids: selectedWatchers,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hourly leave toggle */}
      <div className="flex items-center gap-3" style={{
        background: HNH.navy50, borderRadius: 12, padding: '10px 14px',
      }}>
        <input
          type="checkbox"
          checked={isHourly}
          onChange={e => {
            setIsHourly(e.target.checked)
            if (e.target.checked && !leaveTypeId && leaveTypes.length > 0) {
              setLeaveTypeId(String(leaveTypes[0].id))
            }
          }}
          style={{ width: 18, height: 18, accentColor: HNH.navy }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: HNH.navy }}>Nghỉ theo Giờ</div>
          <div style={{ fontSize: 11, color: HNH.ink3 }}>Chọn ngày và giờ bắt đầu/kết thúc</div>
        </div>
      </div>

      {/* Leave type */}
      <Field label="Loại nghỉ phép">
        <select
          value={leaveTypeId}
          onChange={e => setLeaveTypeId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Chọn loại nghỉ phép</option>
          {leaveTypes.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>

      {/* Dates */}
      <div className="flex gap-3">
        <Field label={isHourly ? 'Ngày nghỉ' : 'Từ ngày'} flex>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </Field>
        {!isHourly && (
          <Field label="Đến ngày" flex>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </Field>
        )}
      </div>

      {/* Time for hourly leave */}
      {isHourly && (
        <div className="flex gap-3">
          <Field label="Giờ bắt đầu" flex>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Giờ kết thúc" flex>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      )}

      {/* Breakdown for normal leave */}
      {!isHourly && (
        <div className="flex gap-3">
          <Field label="Ngày đầu" flex>
            <select value={startBreakdown} onChange={e => setStartBreakdown(e.target.value)} style={inputStyle}>
              {BREAKDOWN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Ngày cuối" flex>
            <select value={endBreakdown} onChange={e => setEndBreakdown(e.target.value)} style={inputStyle}>
              {BREAKDOWN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      )}

      {/* Description */}
      <Field label="Lý do">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Nhập lý do nghỉ phép..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      {/* Manager selection */}
      <Field label="Người phê duyệt">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {managers.map(m => {
            const checked = selectedManagers.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleManager(m.id)}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{
                  background: checked ? HNH.navy50 : '#fff',
                  borderRadius: 10, padding: '8px 12px',
                  border: `1.5px solid ${checked ? HNH.navy : HNH.line}`,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  background: checked ? HNH.navy : '#fff',
                  border: checked ? 'none' : `2px solid ${HNH.line}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <Icon name="check" size={11} color="#fff" stroke={2.5} />}
                </div>
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink }}>{m.name}</span>
                  {m.position && (
                    <span style={{ fontSize: 11, color: HNH.ink3, marginLeft: 6 }}>{m.position}</span>
                  )}
                </div>
                {m.is_direct && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, color: HNH.navy,
                    background: HNH.navy50, borderRadius: 5, padding: '2px 6px',
                  }}>
                    Trực tiếp
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Field>

      {/* Approval mode */}
      {selectedManagers.length > 1 && (
        <Field label="Hình thức duyệt">
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'single', label: '1 người duyệt' },
              { value: 'all', label: 'Tất cả duyệt' },
              { value: 'sequential', label: 'Theo thứ tự' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setApprovalMode(opt.value)}
                className="border-none cursor-pointer"
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: approvalMode === opt.value ? HNH.navy : '#fff',
                  color: approvalMode === opt.value ? '#fff' : HNH.ink2,
                  fontSize: 11.5, fontWeight: 700,
                  border: `1.5px solid ${approvalMode === opt.value ? HNH.navy : HNH.line}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Watchers */}
      {watchers.length > 0 && (
        <Field label="Người theo dõi (C&B)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {watchers.map(w => {
              const checked = selectedWatchers.includes(w.id)
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWatcher(w.id)}
                  className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                  style={{
                    background: checked ? HNH.success50 : '#fff',
                    borderRadius: 10, padding: '8px 12px',
                    border: `1.5px solid ${checked ? HNH.success : HNH.line}`,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 5,
                    background: checked ? HNH.success : '#fff',
                    border: checked ? 'none' : `2px solid ${HNH.line}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <Icon name="check" size={11} color="#fff" stroke={2.5} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink }}>{w.name}</span>
                    {w.position && (
                      <span style={{ fontSize: 11, color: HNH.ink3, marginLeft: 6 }}>{w.position}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, color: HNH.success,
                    background: HNH.success50, borderRadius: 5, padding: '2px 6px',
                  }}>
                    C&B
                  </span>
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
        style={{
          padding: '14px', borderRadius: 14, marginTop: 4,
          background: canSubmit ? HNH.navy : HNH.cream2,
          color: canSubmit ? '#fff' : HNH.ink3,
          fontSize: 14, fontWeight: 700, opacity: submitting ? 0.6 : 1,
        }}
      >
        <Icon name="send" size={16} color={canSubmit ? '#fff' : HNH.ink3} stroke={2} />
        {submitting ? 'Đang gửi...' : 'Gửi đề xuất'}
      </button>
    </div>
  )
}

/* ── Field wrapper ── */
function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: HNH.ink2, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${HNH.line}`, background: '#fff',
  fontSize: 13, fontWeight: 500, color: HNH.ink,
  outline: 'none', boxSizing: 'border-box',
}

interface EditData {
  leave_type_id: string
  start_date: string
  end_date: string
  start_date_breakdown: string
  end_date_breakdown: string
  description: string
  isHourly: boolean
}

/* ── Main Page ── */
export function LeaveProposalPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editId = searchParams.get('edit')

  const [view, setView] = useState<ViewState>(editId ? 'form' : 'overview')
  const [summary, setSummary] = useState<LeaveSummary | null>(null)
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([])
  const [managers, setManagers] = useState<Manager[]>([])
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editData, setEditData] = useState<EditData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, mgrRes, watchRes] = await Promise.all([
        api.get<LeaveSummary>('/api/leave/my-summary/'),
        api.get<Manager[]>('/api/leave/available-managers/'),
        api.get<Watcher[]>('/api/leave/watcher-candidates/'),
      ])
      setSummary(sumRes)
      setManagers(mgrRes)
      setWatchers(watchRes)
      const types = sumRes.balances.map(b => ({ id: b.leave_type_id, name: b.leave_type_name }))
      setLeaveTypes(types)

      if (editId) {
        const proposals = await api.get<Array<Record<string, unknown>>>(`/api/leave/my-proposals/`)
        const target = proposals.find((p: Record<string, unknown>) => String(p.id) === editId)
        if (target) {
          const desc = (target.description as string) || ''
          const isHourly = desc.startsWith('[Nghỉ theo giờ]')
          setEditData({
            leave_type_id: target.leave_type_id ? String(target.leave_type_id) : '',
            start_date: (target.start_date as string) || '',
            end_date: (target.end_date as string) || '',
            start_date_breakdown: (target.start_date_breakdown as string) || 'full_day',
            end_date_breakdown: (target.end_date_breakdown as string) || 'full_day',
            description: isHourly ? desc.replace(/^\[Nghỉ theo giờ\]\s*\d{2}:\d{2}–\d{2}:\d{2}\.?\s*/, '') : desc,
            isHourly,
          })
        }
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [editId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      await api.post('/api/leave/user-request/', data)
      if (editId) {
        navigate('/proposals', { replace: true })
      } else {
        setView('overview')
        fetchData()
      }
    } catch { /* ignore */ } finally { setSubmitting(false) }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        onBack={() => navigate(-1)}
        title="Nghỉ phép"
        trailing={
          view === 'overview' ? (
            <button
              onClick={() => setView('form')}
              className="flex items-center gap-1.5 border-none cursor-pointer"
              style={{
                background: HNH.navy, color: '#fff', borderRadius: 10,
                padding: '7px 12px', fontSize: 12, fontWeight: 700,
              }}
            >
              <Icon name="plus" size={14} color="#fff" stroke={2.5} />
              Tạo đề xuất
            </button>
          ) : (
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 border-none cursor-pointer"
              style={{
                background: HNH.cream2, color: HNH.ink2, borderRadius: 10,
                padding: '7px 12px', fontSize: 12, fontWeight: 700,
                border: `1px solid ${HNH.line}`,
              }}
            >
              <Icon name="chev-r" size={13} color={HNH.ink2} stroke={2} />
              Quay lại
            </button>
          )
        }
      />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
            Đang tải...
          </div>
        ) : view === 'overview' ? (
          <>
            {/* Stats */}
            {summary && (
              <div className="flex gap-3" style={{ marginBottom: 14 }}>
                <div className="flex items-center gap-1.5" style={{
                  background: HNH.warn50, borderRadius: 10, padding: '6px 12px',
                }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: HNH.warn }}>{summary.pending_count}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.warn }}>Chờ duyệt</span>
                </div>
                <div className="flex items-center gap-1.5" style={{
                  background: HNH.success50, borderRadius: 10, padding: '6px 12px',
                }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: HNH.success }}>{summary.approved_count}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.success }}>Đã duyệt</span>
                </div>
              </div>
            )}

            {/* Leave balances */}
            <div style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, marginBottom: 8 }}>
              Số dư nghỉ phép
            </div>
            {summary && summary.balances.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {summary.balances.map(b => <BalanceCard key={b.id} b={b} />)}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13 }}>
                Chưa có phép được phân bổ
              </div>
            )}
          </>
        ) : (
          <LeaveForm
            leaveTypes={leaveTypes}
            managers={managers}
            watchers={watchers}
            onSubmit={handleSubmit}
            submitting={submitting}
            editData={editData}
          />
        )}
      </div>
    </div>
  )
}
