import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

interface WorkType {
  id: number
  work_type: string
}

interface PaginatedResponse<T> { count: number; results: T[] }

export function WorkTypeProposalPage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [loading, setLoading] = useState(true)

  const [workTypeId, setWorkTypeId] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [requestedTill, setRequestedTill] = useState('')
  const [isPermanent, setIsPermanent] = useState(true)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get<WorkType[] | PaginatedResponse<WorkType>>('/api/base/worktypes/?page_size=100')
      .then(d => setWorkTypes(Array.isArray(d) ? d : d.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toISOString().slice(0, 10)

  const handleSubmit = async () => {
    if (!workTypeId || !requestedDate) {
      setError('Vui lòng chọn loại công việc và ngày bắt đầu')
      return
    }
    if (!isPermanent && !requestedTill) {
      setError('Vui lòng chọn ngày kết thúc cho thay đổi tạm thời')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        employee_id: employee?.id,
        work_type_id: Number(workTypeId),
        requested_date: requestedDate,
        is_permanent_work_type: isPermanent,
        description,
      }
      if (!isPermanent && requestedTill) {
        payload.requested_till = requestedTill
      }
      await api.post('/api/base/worktype-requests/', payload)
      setSuccess(true)
      setTimeout(() => navigate('/proposals'), 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi đề xuất'
      try {
        const parsed = JSON.parse(msg)
        const firstErr = Object.values(parsed).flat()[0]
        setError(String(firstErr))
      } catch {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Đề xuất loại công việc" onBack={() => navigate('/proposals')} />

      <div style={{ padding: '0 16px 32px', maxWidth: 500, margin: '0 auto' }}>
        {success ? (
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
            {/* Work type selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                Loại công việc muốn đổi sang *
              </label>
              {loading ? (
                <div style={{ padding: 12, color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
              ) : (
                <select
                  value={workTypeId}
                  onChange={e => setWorkTypeId(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                    color: workTypeId ? HNH.ink : HNH.ink3, background: '#fff',
                    appearance: 'none', boxSizing: 'border-box',
                  }}
                >
                  <option value="">— Chọn loại công việc —</option>
                  {workTypes.map(w => (
                    <option key={w.id} value={w.id}>{w.work_type}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Permanent toggle */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                Loại thay đổi
              </label>
              <div className="flex gap-2">
                {[
                  { val: true, label: 'Vĩnh viễn' },
                  { val: false, label: 'Tạm thời' },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setIsPermanent(opt.val)}
                    className="flex-1 border-none cursor-pointer"
                    style={{
                      padding: '10px', borderRadius: 12,
                      background: isPermanent === opt.val ? HNH.navy : '#fff',
                      color: isPermanent === opt.val ? '#fff' : HNH.ink2,
                      fontSize: 13, fontWeight: 700,
                      border: `1.5px solid ${isPermanent === opt.val ? HNH.navy : HNH.line}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className={isPermanent ? '' : 'grid grid-cols-2 gap-3'} style={{ marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                  Ngày bắt đầu *
                </label>
                <input
                  type="date"
                  value={requestedDate}
                  min={today}
                  onChange={e => setRequestedDate(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                    color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                  }}
                />
              </div>
              {!isPermanent && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                    Ngày kết thúc *
                  </label>
                  <input
                    type="date"
                    value={requestedTill}
                    min={requestedDate || today}
                    onChange={e => setRequestedTill(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 14,
                      border: `1.5px solid ${HNH.line}`, fontSize: 14, fontWeight: 600,
                      color: HNH.ink, background: '#fff', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: HNH.ink2, display: 'block', marginBottom: 6 }}>
                Lý do
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Nhập lý do thay đổi loại công việc..."
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
        )}
      </div>
    </div>
  )
}
