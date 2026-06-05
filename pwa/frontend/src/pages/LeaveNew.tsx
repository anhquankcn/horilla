import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'

interface LeaveTypeInfo {
  id: number
  name: string
  icon: string | null
  total_days: number
}

interface AvailableLeave {
  id: number
  leave_type_id: LeaveTypeInfo
  available_days: number
  carryforward_days: number
  total_leave_days: number
}

interface HNHSummarySlot {
  id: number | null
  leave_type_id: number | null
  name: string
  available_days: number
  total_days: number
  carryforward_days: number
}

interface HNHSummary {
  annual: HNHSummarySlot | null
  compensatory: HNHSummarySlot | null
  sick: HNHSummarySlot | null
  seniority: HNHSummarySlot
  seniority_days: number
}

interface Paginated<T> { count: number; results: T[] }

function calcDays(start: string, end: string): number {
  if (!start) return 0
  const e = end || start
  const d1 = new Date(start)
  const d2 = new Date(e)
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
}

// Priority order for display: Phép Bù, Phép Năm, Phép Ốm, Phép Thâm Niên, others
function sortLeaveTypes(types: AvailableLeave[]): AvailableLeave[] {
  const priority = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('phép bù') || n.includes('bù')) return 0
    if (n.includes('phép năm') || n.includes('annual')) return 1
    if (n.includes('ốm') || n.includes('sick')) return 2
    if (n.includes('thâm niên') || n.includes('seniority')) return 3
    return 10
  }
  return [...types].sort((a, b) => priority(a.leave_type_id.name) - priority(b.leave_type_id.name))
}

function leaveIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes('bù')) return { icon: 'palm', color: '#a87908', bg: '#faf1d6' }
  if (n.includes('phép năm') || n.includes('annual')) return { icon: 'leaf', color: HNH.success, bg: HNH.success50 }
  if (n.includes('ốm')) return { icon: 'shield', color: HNH.navy, bg: HNH.navy50 }
  if (n.includes('thâm niên')) return { icon: 'star', color: HNH.red, bg: HNH.red50 }
  if (n.includes('thai sản')) return { icon: 'sparkle', color: HNH.red, bg: HNH.red50 }
  return { icon: 'cal', color: HNH.navy, bg: HNH.navy50 }
}

export function LeaveNewPage() {
  const navigate = useNavigate()
  const { data: balResp } = useApi<Paginated<AvailableLeave>>('/api/leave/available-leave/?page_size=20')
  const { data: summary } = useApi<HNHSummary>('/api/leave/hnh-leave-summary/')

  const rawTypes = balResp?.results ?? []
  const leaveTypes = sortLeaveTypes(rawTypes)

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-select Phép Bù if available, else Phép Năm
  useEffect(() => {
    if (selectedTypeId !== null || leaveTypes.length === 0) return
    const bu = leaveTypes.find(t => t.leave_type_id.name.toLowerCase().includes('bù') && t.available_days > 0)
    const annual = leaveTypes.find(t => t.leave_type_id.name.toLowerCase().includes('phép năm'))
    setSelectedTypeId((bu ?? annual ?? leaveTypes[0])?.leave_type_id?.id ?? null)
  }, [leaveTypes, selectedTypeId])

  const selected = leaveTypes.find(t => t.leave_type_id.id === selectedTypeId)
  const totalDays = calcDays(startDate, endDate)
  const canSubmit = selectedTypeId && startDate && reason.trim() && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/api/leave/user-request/', {
        leave_type_id: selectedTypeId,
        start_date: startDate,
        end_date: endDate || startDate,
        start_date_breakdown: 'full_day',
        end_date_breakdown: 'full_day',
        description: reason,
      })
      navigate('/leave')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Seniority days from summary
  const seniorityDays = summary?.seniority_days ?? 0

  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: HNH.cream }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '6px 16px 8px' }}>
        <button
          onClick={() => navigate(-1)}
          className="border-none bg-transparent cursor-pointer"
          style={{ height: 32, padding: '0 12px', borderRadius: 10, color: HNH.red, fontWeight: 600, fontSize: 14 }}
        >
          Hủy
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Đơn xin nghỉ</div>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="border-none cursor-pointer"
          style={{
            height: 32, padding: '0 14px', borderRadius: 10,
            background: canSubmit ? HNH.red : HNH.cream2,
            color: canSubmit ? '#fff' : HNH.ink3,
            fontWeight: 700, fontSize: 13.5,
          }}
        >
          {submitting ? '...' : 'Gửi'}
        </button>
      </div>

      <div className="flex-1 overflow-auto" style={{ padding: '6px 20px 20px' }}>
        {/* Error */}
        {error && (
          <div style={{
            background: HNH.red50, border: `1px solid ${HNH.red}`, borderRadius: 12,
            padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: HNH.red, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        {/* Priority notice when Phép Bù available */}
        {summary?.compensatory && summary.compensatory.available_days > 0 && (
          <div style={{
            background: '#faf1d6', border: `1px solid ${HNH.gold}`, borderRadius: 12,
            padding: '9px 12px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="palm" size={14} color="#a87908" stroke={2} />
            <span style={{ fontSize: 12, color: '#a87908', fontWeight: 700 }}>
              Bạn còn {summary.compensatory.available_days} ngày Phép Bù — sẽ được trừ trước
            </span>
          </div>
        )}

        {/* Type selector */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '6px 6px 6px' }}>LOẠI NGHỈ</div>
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
          {leaveTypes.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>
          )}
          {leaveTypes.map((opt, i) => {
            const isSelected = selectedTypeId === opt.leave_type_id.id
            const avail = opt.available_days % 1 === 0 ? opt.available_days : opt.available_days.toFixed(1)
            const total = opt.leave_type_id.total_days
            const remainStr = total > 1
              ? `${avail} / ${total % 1 === 0 ? total : total.toFixed(1)} ngày`
              : `${avail} ngày`
            const isBu = opt.leave_type_id.name.toLowerCase().includes('bù')
            const meta = leaveIcon(opt.leave_type_id.name)

            // Show seniority total from summary if available
            const displayRemain = isBu && summary?.compensatory
              ? `${summary.compensatory.available_days % 1 === 0 ? summary.compensatory.available_days : summary.compensatory.available_days.toFixed(1)} ngày`
              : remainStr

            return (
              <button
                key={opt.leave_type_id.id}
                onClick={() => setSelectedTypeId(opt.leave_type_id.id)}
                className="flex items-center gap-3 w-full bg-transparent border-none cursor-pointer text-left"
                style={{
                  padding: '12px 14px',
                  borderBottom: i === leaveTypes.length - 1 ? 'none' : `1px solid ${HNH.line}`,
                  background: isSelected ? (isBu ? '#faf1d6' : HNH.red50) : 'transparent',
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    border: `2px solid ${isSelected ? (isBu ? '#a87908' : HNH.red) : HNH.line2}`,
                    background: isSelected ? (isBu ? '#a87908' : HNH.red) : '#fff',
                  }}
                >
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg }}>
                  <Icon name={meta.icon} size={13} color={meta.color} stroke={2} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>
                    {opt.leave_type_id.name}
                    {isBu && (
                      <span style={{ fontSize: 10, color: '#a87908', fontWeight: 700, background: '#fceac9', borderRadius: 4, padding: '1px 5px' }}>
                        Ưu tiên
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{displayRemain}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Seniority info */}
        {seniorityDays > 0 && (
          <div style={{ fontSize: 11.5, color: HNH.ink3, padding: '8px 6px', fontStyle: 'italic' }}>
            Thâm niên: bạn được cộng thêm <strong style={{ color: HNH.red }}>{seniorityDays} ngày</strong> phép thâm niên năm nay
          </div>
        )}

        {/* Date range */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>KHOẢNG NGHỈ</div>
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: 12 }}>
          <div className="flex gap-2 items-center">
            <label className="flex-1" style={{
              padding: '10px 12px', borderRadius: 12, background: HNH.cream,
              border: startDate ? `1.5px solid ${HNH.red}` : `1px solid ${HNH.line}`,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 10.5, color: startDate ? HNH.red : HNH.ink3, fontWeight: 700, letterSpacing: 0.2 }}>TỪ NGÀY</div>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  width: '100%', border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 15, fontWeight: 700, color: HNH.ink, marginTop: 2,
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <Icon name="arrow-r" size={16} color={HNH.ink3} stroke={2} />
            <label className="flex-1" style={{
              padding: '10px 12px', borderRadius: 12, background: HNH.cream,
              border: endDate ? `1.5px solid ${HNH.red}` : `1px solid ${HNH.line}`,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 10.5, color: endDate ? HNH.red : HNH.ink3, fontWeight: 700, letterSpacing: 0.2 }}>ĐẾN NGÀY</div>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  width: '100%', border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 15, fontWeight: 700, color: HNH.ink, marginTop: 2,
                  fontFamily: 'inherit',
                }}
              />
            </label>
          </div>
          {startDate && (
            <div className="flex items-center justify-between" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${HNH.line2}` }}>
              <span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 600 }}>Tổng số ngày nghỉ</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: HNH.red }}>{totalDays} ngày</span>
            </div>
          )}
          {selected && startDate && totalDays > selected.total_leave_days && selected.leave_type_id.total_days > 1 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: HNH.red, fontWeight: 600 }}>
              Vượt quá số ngày phép còn lại ({selected.total_leave_days} ngày)
            </div>
          )}
        </div>

        {/* Reason input */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>LÝ DO</div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Nhập lý do xin nghỉ..."
          className="w-full resize-none"
          style={{
            background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: '12px 14px',
            fontSize: 14, color: HNH.ink, lineHeight: 1.4, minHeight: 90,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>
    </div>
  )
}
