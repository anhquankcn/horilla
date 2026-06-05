import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayData {
  type: 'workday' | 'off' | 'holiday' | 'leave'
  status: 'present' | 'absent' | 'off' | 'leave' | 'holiday' | 'future'
  shift_start: string | null
  shift_end: string | null
  clock_in: string | null
  clock_out: string | null
  worked_hours: string | null
  minimum_hour: string | null
  overtime: string | null
  overtime_approved: boolean
  validated: boolean
  is_validate_request: boolean
  late_come: boolean
  early_out: boolean
  attendance_id: number | null
  comment_count: number
  leave_type: string | null
  leave_is_paid: boolean
  holiday_name: string | null
}

interface CalendarData {
  year: number
  month: number
  shift: { name: string } | null
  days: Record<string, DayData>
}

interface Comment {
  id: number
  author_name: string
  is_hr: boolean
  content: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VN_MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                   'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']
const DAY_HEADERS = ['T2','T3','T4','T5','T6','T7','CN']

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtMonth(y: number, m: number) { return `${y}-${pad(m)}` }
function fmtDate(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }

// ── Status helpers ─────────────────────────────────────────────────────────────

// Blue = validated workday | Yellow = pending | Green = paid leave (tính công)
// Gray = unpaid/approved leave (không tính công) | Red = absent (không phép) | Purple = holiday
function statusColor(day: DayData | undefined): string {
  if (!day) return 'transparent'
  if (day.status === 'future') return 'transparent'
  if (day.status === 'holiday') return '#8b5cf6'
  if (day.status === 'leave') return day.leave_is_paid ? '#16a34a' : '#9ca3af'
  if (day.status === 'off') return 'transparent'
  if (day.status === 'absent') return HNH.red
  // present
  if (day.validated) return '#2563eb'
  if (day.is_validate_request) return '#f59e0b'
  return '#94a3b8'
}

function statusLabel(day: DayData): string {
  if (day.status === 'holiday') return day.holiday_name || 'Lễ'
  if (day.status === 'leave') return day.leave_type || 'Nghỉ phép'
  if (day.status === 'off') return 'Nghỉ'
  if (day.status === 'future') return ''
  if (day.status === 'absent') return 'Vắng'
  if (day.validated) return 'Hợp lệ'
  if (day.is_validate_request) return 'Chờ duyệt'
  return 'Chưa xác nhận'
}

function statusBg(day: DayData): string {
  const c = statusColor(day)
  return c === 'transparent' ? 'transparent' : c + '22'
}

// ── Detail Bottom Sheet ────────────────────────────────────────────────────────

function DetailSheet({ dateStr, day, onClose }: {
  dateStr: string
  day: DayData
  onClose: () => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [d, m, y] = [
    parseInt(dateStr.split('-')[2]),
    parseInt(dateStr.split('-')[1]),
    parseInt(dateStr.split('-')[0]),
  ]
  const dateLabel = `${d}/${m}/${y}`

  useEffect(() => {
    if (!day.attendance_id) return
    setLoadingComments(true)
    api.get<Comment[]>(`/api/attendance/attendance/${day.attendance_id}/comments/`)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false))
  }, [day.attendance_id])

  const sendComment = async () => {
    if (!commentText.trim() || !day.attendance_id || sending) return
    setSending(true)
    try {
      const c = await api.post<Comment>(
        `/api/attendance/attendance/${day.attendance_id}/comments/`,
        { content: commentText.trim() }
      )
      setComments(prev => [...prev, c])
      setCommentText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch { /* ignore */ }
    setSending(false)
  }

  const color = statusColor(day)
  const label = statusLabel(day)

  const Row = ({ icon, label: lbl, value, accent }: { icon: string; label: string; value: string; accent?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
      <div style={{ background: HNH.cream, borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon as any} size={14} color={HNH.ink3} stroke={2} />
      </div>
      <div style={{ fontSize: 12, color: HNH.ink3, flex: 1 }}>{lbl}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent || HNH.ink }}>{value}</div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: HNH.white, borderRadius: '20px 20px 0 0', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 10px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>{dateLabel}</div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>
              {day.shift_start && day.shift_end ? `Ca ${day.shift_start} – ${day.shift_end}` : 'Không có ca'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: statusBg(day), color: color === 'transparent' ? HNH.ink3 : color, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
              {label}
            </div>
            <button onClick={onClose} style={{ background: '#f0f0f0', border: 'none', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="x" size={12} color={HNH.ink3} stroke={2} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>

          {/* Attendance section */}
          {day.attendance_id && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Chấm công</div>
              <div style={{ background: HNH.white, borderRadius: 12, border: `1px solid ${HNH.line}`, padding: '0 12px' }}>
                {day.clock_in && <Row icon="log-in" label="Giờ vào" value={day.clock_in} />}
                {day.clock_out && <Row icon="log-out" label="Giờ ra" value={day.clock_out} />}
                {day.worked_hours && <Row icon="time" label="Giờ thực tế" value={day.worked_hours.replace(':','h ') + 'p'} />}
                {day.minimum_hour && <Row icon="flag" label="Giờ tối thiểu" value={day.minimum_hour.replace(':','h ') + 'p'} />}
                {day.late_come && <Row icon="alert-circle" label="Đi trễ" value="Có" accent={HNH.red} />}
                {day.early_out && <Row icon="alert-circle" label="Về sớm" value="Có" accent="#f59e0b" />}
              </div>
            </div>
          )}

          {/* Payroll basis section */}
          {day.attendance_id && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Cơ sở tính lương</div>
              <div style={{ background: HNH.white, borderRadius: 12, border: `1px solid ${HNH.line}`, padding: '0 12px' }}>
                <Row
                  icon={day.validated ? 'checkmark-circle' : 'time'}
                  label="Xác nhận bởi HR"
                  value={day.validated ? 'Đã xác nhận' : (day.is_validate_request ? 'Đang chờ duyệt' : 'Chưa xác nhận')}
                  accent={day.validated ? HNH.success : (day.is_validate_request ? '#f59e0b' : HNH.ink3)}
                />
                {day.overtime && day.overtime !== '00:00' && (
                  <Row
                    icon="flash"
                    label="Tăng ca"
                    value={`${day.overtime.replace(':','h ')}p${day.overtime_approved ? ' ✓' : ' (chờ)'}`}
                    accent={day.overtime_approved ? HNH.success : '#f59e0b'}
                  />
                )}
                {!day.validated && !day.is_validate_request && (
                  <div style={{ padding: '10px 0', fontSize: 12, color: HNH.ink3, lineHeight: 1.5 }}>
                    Ngày công này chưa được HR xác nhận. Nếu bạn đã chấm công, hãy gửi yêu cầu xác nhận hoặc để lại ý kiến bên dưới.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No attendance */}
          {!day.attendance_id && day.status === 'absent' && (
            <div style={{ background: '#fff5f5', borderRadius: 12, border: `1px solid ${HNH.red}22`, padding: '14px 14px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: HNH.red, marginBottom: 4 }}>Không có dữ liệu chấm công</div>
              <div style={{ fontSize: 12, color: HNH.ink3 }}>Hệ thống không ghi nhận chấm công ngày này. Liên hệ HR hoặc gửi ý kiến bên dưới.</div>
            </div>
          )}

          {/* Leave / Holiday info */}
          {(day.leave_type || day.holiday_name) && (
            <div style={{ background: day.holiday_name ? '#f5f3ff' : '#eff6ff', borderRadius: 12, border: `1px solid ${day.holiday_name ? '#8b5cf6' : '#3b82f6'}22`, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: day.holiday_name ? '#8b5cf6' : '#3b82f6' }}>
                {day.holiday_name ? `🎉 ${day.holiday_name}` : `🌴 ${day.leave_type}`}
              </div>
            </div>
          )}

          {/* Comments section */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Ý kiến & Phản hồi {comments.length > 0 && `(${comments.length})`}
            </div>

            {!day.attendance_id && day.status !== 'absent' ? (
              <div style={{ fontSize: 12, color: HNH.ink3, padding: '8px 0' }}>Không có dữ liệu chấm công để phản hồi.</div>
            ) : (
              <>
                {loadingComments ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
                ) : comments.length === 0 ? (
                  <div style={{ background: HNH.cream, borderRadius: 10, padding: '12px 14px', fontSize: 12, color: HNH.ink3, textAlign: 'center' }}>
                    Chưa có ý kiến. Gửi phản hồi nếu có thắc mắc về ngày công này.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{
                        background: c.is_hr ? HNH.navy50 : HNH.cream,
                        borderRadius: 10,
                        padding: '10px 12px',
                        borderLeft: c.is_hr ? `3px solid ${HNH.navy}` : `3px solid ${HNH.line}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: c.is_hr ? HNH.navy : HNH.ink2 }}>
                            {c.is_hr ? '🏢 ' : ''}{c.author_name}
                            {c.is_hr && <span style={{ marginLeft: 5, fontSize: 10, background: HNH.navy, color: '#fff', borderRadius: 4, padding: '1px 5px' }}>HR</span>}
                          </div>
                          <div style={{ fontSize: 10, color: HNH.ink3 }}>
                            {new Date(c.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: HNH.ink, lineHeight: 1.5 }}>{c.content}</div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                )}

                {/* Input */}
                <div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Nhập ý kiến hoặc khiếu nại..."
                    rows={2}
                    style={{
                      flex: 1, borderRadius: 10, border: `1px solid ${HNH.line}`, padding: '8px 10px',
                      fontSize: 13, color: HNH.ink, background: HNH.white, resize: 'none',
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button
                    onClick={sendComment}
                    disabled={!commentText.trim() || sending || !day.attendance_id}
                    style={{
                      background: commentText.trim() && !sending ? HNH.navy : HNH.line,
                      border: 'none', borderRadius: 10, width: 42, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: commentText.trim() ? 'pointer' : 'default', transition: 'background 0.15s',
                    }}
                  >
                    <Icon name="send" size={16} color="#fff" stroke={2} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ days }: { days: Record<string, DayData> }) {
  const today = new Date().toISOString().slice(0, 10)
  let present = 0, absent = 0, validated = 0
  for (const [d, v] of Object.entries(days)) {
    if (d > today) continue
    if (v.status === 'present') { present++; if (v.validated) validated++ }
    if (v.status === 'absent') absent++
  }
  const Stat = ({ label, val, color }: { label: string; val: number; color: string }) => (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 11, color: HNH.ink3, fontWeight: 500 }}>{label}</div>
    </div>
  )
  return (
    <div style={{ margin: '0 16px 12px', background: HNH.white, borderRadius: 14, border: `1px solid ${HNH.line}`, padding: '12px 8px', display: 'flex' }}>
      <Stat label="Đi làm" val={present} color={HNH.ink} />
      <div style={{ width: 1, background: HNH.line }} />
      <Stat label="Đã xác nhận" val={validated} color={HNH.success} />
      <div style={{ width: 1, background: HNH.line }} />
      <Stat label="Vắng" val={absent} color={HNH.red} />
    </div>
  )
}

// ── Calendar Grid ─────────────────────────────────────────────────────────────

function CalendarGrid({ year, month, days, selected, onSelect }: {
  year: number
  month: number
  days: Record<string, DayData>
  selected: string | null
  onSelect: (d: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  // Get first day of month (0=Mon..6=Sun in our grid)
  const firstDate = new Date(year, month - 1, 1)
  const firstDow = (firstDate.getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ padding: '0 12px', marginBottom: 12 }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_HEADERS.map((h, i) => (
          <div key={h} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: i >= 5 ? '#f59e0b' : HNH.ink3, padding: '4px 0' }}>{h}</div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />
          const dateStr = fmtDate(year, month, day)
          const data = days[dateStr]
          const isToday = dateStr === today
          const isSel = dateStr === selected
          const dotColor = statusColor(data)
          const isWeekend = idx % 7 >= 5
          const hasComment = data?.comment_count > 0

          return (
            <button
              key={dateStr}
              onClick={() => data && data.status !== 'future' && onSelect(dateStr)}
              style={{
                border: isSel ? `2px solid ${HNH.navy}` : isToday ? `2px solid ${HNH.red}` : `1px solid ${HNH.line}`,
                borderRadius: 10, background: isSel ? HNH.navy50 : HNH.white,
                padding: '6px 2px', cursor: data && data.status !== 'future' ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 46,
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: isToday ? 800 : 600,
                color: isSel ? HNH.navy : isToday ? HNH.red : isWeekend ? '#d97706' : HNH.ink,
              }}>
                {day}
              </div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {dotColor !== 'transparent' && (
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: dotColor }} />
                )}
                {hasComment && (
                  <div style={{ width: 5, height: 5, borderRadius: 3, background: HNH.navy }} />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10, paddingLeft: 2 }}>
        {[
          { color: '#2563eb', label: 'Hợp lệ' },
          { color: '#f59e0b', label: 'Chờ duyệt' },
          { color: '#94a3b8', label: 'Chưa xác nhận' },
          { color: '#16a34a', label: 'NP tính công' },
          { color: '#9ca3af', label: 'NP có phép' },
          { color: HNH.red, label: 'Vắng' },
          { color: '#8b5cf6', label: 'Lễ' },
          { color: HNH.navy, label: 'Có ý kiến' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 4, background: color }} />
            <span style={{ fontSize: 10, color: HNH.ink3 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MonthlyAttendancePage() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get<CalendarData>(`/api/attendance/my-calendar/?month=${fmtMonth(year, month)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, month])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelected(null)
  }
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setSelected(null) }
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

  const selectedDay = selected && data?.days[selected] ? data.days[selected] : null

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Tính Công Tháng" onBack={() => navigate(-1)} />

      {/* Month navigator */}
      <div style={{ background: HNH.white, borderBottom: `1px solid ${HNH.line}`, padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={prevMonth} style={{ background: HNH.cream, border: 'none', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="chev-l" size={16} color={HNH.ink2} stroke={2} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>{VN_MONTHS[month - 1]} {year}</div>
            {data?.shift?.name && <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>Ca: {data.shift.name}</div>}
          </div>
          <button onClick={nextMonth} style={{ background: HNH.cream, border: 'none', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="chev-r" size={16} color={HNH.ink2} stroke={2} />
          </button>
        </div>
        {!isCurrentMonth && (
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <button onClick={goToday} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: HNH.navy, cursor: 'pointer' }}>Về tháng này</button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: HNH.ink3 }}>Đang tải...</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: '60px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
          <div style={{ fontSize: 14, color: HNH.ink3 }}>Không thể tải dữ liệu</div>
        </div>
      ) : (
        <>
          <div style={{ height: 12 }} />
          <SummaryBar days={data.days} />
          <CalendarGrid year={year} month={month} days={data.days} selected={selected} onSelect={setSelected} />
        </>
      )}

      {selected && selectedDay && (
        <DetailSheet dateStr={selected} day={selectedDay} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
