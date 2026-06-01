import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'

/* ── Types ── */
interface MyAttendanceRequest {
  id: number
  attendance_date: string | null
  clock_in: string | null
  clock_out: string | null
  clock_in_date: string | null
  clock_out_date: string | null
  worked_hour: string
  shift_name: string | null
  work_type_name: string | null
  description: string
  request_type: string
  status: string
}

const STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ duyệt', color: HNH.warn, bg: HNH.warn50 },
  approved: { label: 'Đã duyệt', color: HNH.success, bg: HNH.success50 },
  normal: { label: 'Bình thường', color: HNH.ink3, bg: HNH.cream2 },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function fmtTime(t: string | null) {
  return t || '—'
}

/* ── Request Card ── */
function RequestCard({ r }: { r: MyAttendanceRequest }) {
  const st = STATUS_DISPLAY[r.status] || STATUS_DISPLAY.normal
  const isCreate = r.request_type === 'create_request'
  return (
    <div
      style={{
        background: '#fff', borderRadius: 14, padding: '12px 14px',
        border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 38, height: 38, borderRadius: 11,
            background: isCreate ? HNH.success50 : HNH.navy50,
          }}
        >
          <Icon
            name={isCreate ? 'plus' : 'clock'}
            size={18}
            color={isCreate ? HNH.success : HNH.navy}
            stroke={2}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
              {formatDate(r.attendance_date)}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: HNH.ink3 }}>
              {isCreate ? 'Tạo mới' : 'Điều chỉnh'}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 2 }}>
            Vào: {fmtTime(r.clock_in)} · Ra: {fmtTime(r.clock_out)} · {r.worked_hour}h
          </div>
          {r.description && (
            <div style={{
              fontSize: 11, color: HNH.ink3, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.description}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color: st.color,
          background: st.bg, borderRadius: 6, padding: '2px 7px', flexShrink: 0,
        }}>
          {st.label}
        </span>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function AttendanceProposalPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'form' | 'list'>('form')
  const [myRequests, setMyRequests] = useState<MyAttendanceRequest[]>([])
  const [listLoading, setListLoading] = useState(false)

  // Form state
  const [attDate, setAttDate] = useState('')
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const fetchRequests = useCallback(async () => {
    setListLoading(true)
    try {
      const data = await api.get<MyAttendanceRequest[]>('/api/attendance/my-attendance-requests/')
      setMyRequests(data)
    } catch { setMyRequests([]) } finally { setListLoading(false) }
  }, [])

  useEffect(() => {
    if (mode === 'list') fetchRequests()
  }, [mode, fetchRequests])

  const handleSubmit = async () => {
    if (!attDate || !clockIn) {
      setError('Vui lòng chọn ngày và giờ vào')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await api.post('/api/attendance/pwa-attendance-request/', {
        attendance_date: attDate,
        attendance_clock_in: clockIn,
        attendance_clock_out: clockOut || null,
        description,
      })
      setSuccess(true)
      setTimeout(() => navigate('/proposals'), 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi đề xuất'
      try {
        const parsed = JSON.parse(msg)
        setError(parsed.error || Object.values(parsed).flat()[0] as string)
      } catch {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Điều chỉnh ngày công" onBack={() => navigate('/proposals')} />

      <div style={{ padding: '0 16px 32px', maxWidth: 500, margin: '0 auto' }}>
        {/* Mode toggle */}
        <div className="flex gap-2" style={{ marginBottom: 16 }}>
          {([
            { id: 'form' as const, label: 'Tạo đề xuất', icon: 'plus' },
            { id: 'list' as const, label: 'Lịch sử', icon: 'doc' },
          ]).map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
              style={{
                padding: '10px', borderRadius: 12,
                background: mode === m.id ? HNH.navy : '#fff',
                color: mode === m.id ? '#fff' : HNH.ink2,
                fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${mode === m.id ? HNH.navy : HNH.line}`,
              }}
            >
              <Icon name={m.icon} size={14} color={mode === m.id ? '#fff' : HNH.ink3} stroke={2} />
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'form' ? (
          success ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: HNH.success50,
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              }}>
                <Icon name="check" size={28} color={HNH.success} stroke={2.5} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: HNH.ink }}>Đã gửi đề xuất!</div>
              <div style={{ fontSize: 13, color: HNH.ink3, marginTop: 4 }}>Đang chuyển về trang đề xuất...</div>
            </div>
          ) : (
            <>
              {/* Info banner */}
              <div style={{
                background: HNH.navy50, borderRadius: 14, padding: '12px 14px',
                marginBottom: 16, border: `1px solid ${HNH.navy}20`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: HNH.navy, lineHeight: 1.5 }}>
                  Dùng form này để điều chỉnh giờ vào/ra cho một ngày cụ thể.
                  Nếu ngày đã có bản ghi chấm công, hệ thống sẽ gửi yêu cầu cập nhật.
                  Nếu chưa có, sẽ tạo bản ghi mới chờ duyệt.
                </div>
              </div>

              {/* Date */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                  Ngày công *
                </label>
                <input
                  type="date"
                  value={attDate}
                  max={today}
                  onChange={e => setAttDate(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                    color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Clock in / out */}
              <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                    Giờ vào *
                  </label>
                  <input
                    type="time"
                    value={clockIn}
                    onChange={e => setClockIn(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 14,
                      border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                      color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                    Giờ ra
                  </label>
                  <input
                    type="time"
                    value={clockOut}
                    onChange={e => setClockOut(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 14,
                      border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                      color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                  Lý do điều chỉnh
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="VD: Quên chấm công, máy chấm lỗi, đi công tác..."
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                    color: HNH.ink, background: '#fff', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  background: HNH.red50, borderRadius: 12, padding: '10px 14px',
                  fontSize: 12.5, fontWeight: 600, color: HNH.red, marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 border-none cursor-pointer"
                style={{
                  padding: 14, borderRadius: 14,
                  background: HNH.navy, color: '#fff',
                  fontSize: 14, fontWeight: 700,
                  opacity: submitting ? 0.6 : 1,
                  boxShadow: '0 4px 14px rgba(20,43,111,0.2)',
                }}
              >
                <Icon name="send" size={16} color="#fff" stroke={2} />
                {submitting ? 'Đang gửi...' : 'Gửi đề xuất'}
              </button>
            </>
          )
        ) : (
          /* List mode */
          listLoading ? (
            <div style={{ textAlign: 'center', padding: 30, color: HNH.ink3, fontSize: 13, fontWeight: 600 }}>
              Đang tải...
            </div>
          ) : myRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Icon name="doc" size={32} color={HNH.ink3} stroke={1.5} />
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink3, marginTop: 8 }}>
                Chưa có đề xuất điều chỉnh nào
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myRequests.map(r => <RequestCard key={r.id} r={r} />)}
            </div>
          )
        )}
      </div>
    </div>
  )
}
