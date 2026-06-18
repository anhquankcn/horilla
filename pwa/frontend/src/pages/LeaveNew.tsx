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

type Breakdown = 'full_day' | 'first_half' | 'second_half'
interface DayPick { date: string; bd: Breakdown }

const BD_OPTS: { id: Breakdown; label: string; coef: number }[] = [
  { id: 'first_half', label: 'Sáng', coef: 0.5 },
  { id: 'second_half', label: 'Chiều', coef: 0.5 },
  { id: 'full_day', label: 'Cả ngày', coef: 1.0 },
]
const coefOf = (bd: Breakdown) => (bd === 'full_day' ? 1 : 0.5)

type Mode = 'day' | 'hour'
interface HourEntry { date: string; from: string; to: string }
const hoursOf = (e: HourEntry): number => {
  if (!e.from || !e.to) return 0
  const [fh, fm] = e.from.split(':').map(Number)
  const [th, tm] = e.to.split(':').map(Number)
  return Math.max(0, (th * 60 + tm - fh * 60 - fm) / 60)
}
const fmtDate = (s: string) => {
  const d = new Date(s)
  const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
  return `${wd}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

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
  const [mode, setMode] = useState<Mode>('day')
  const [days, setDays] = useState<DayPick[]>([])
  const [addDate, setAddDate] = useState('')
  const [hourEntries, setHourEntries] = useState<HourEntry[]>([])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedTypeId !== null || leaveTypes.length === 0) return
    const bu = leaveTypes.find(t => t.leave_type_id.name.toLowerCase().includes('bù') && t.available_days > 0)
    const annual = leaveTypes.find(t => t.leave_type_id.name.toLowerCase().includes('phép năm'))
    setSelectedTypeId((bu ?? annual ?? leaveTypes[0])?.leave_type_id?.id ?? null)
  }, [leaveTypes, selectedTypeId])

  const selected = leaveTypes.find(t => t.leave_type_id.id === selectedTypeId)
  const totalHours = hourEntries.reduce((s, e) => s + hoursOf(e), 0)
  const totalDays = mode === 'day'
    ? days.reduce((s, d) => s + coefOf(d.bd), 0)
    : Math.round((totalHours / 8) * 100) / 100
  const canSubmit = !!selectedTypeId && reason.trim() && !submitting && (
    mode === 'day' ? days.length > 0
      : hourEntries.length > 0 && hourEntries.every(e => e.date && hoursOf(e) > 0)
  )

  const addDay = (ds: string) => {
    if (!ds) return
    setDays(prev => prev.some(d => d.date === ds)
      ? prev
      : [...prev, { date: ds, bd: 'full_day' as Breakdown }].sort((a, b) => a.date.localeCompare(b.date)))
    setAddDate('')
  }
  const removeDay = (ds: string) => setDays(prev => prev.filter(d => d.date !== ds))
  const setBd = (ds: string, bd: Breakdown) => setDays(prev => prev.map(d => d.date === ds ? { ...d, bd } : d))

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      if (mode === 'day') {
        await api.post('/api/leave/user-request-days/', {
          leave_type_id: selectedTypeId,
          days: days.map(d => ({ date: d.date, breakdown: d.bd })),
          description: reason,
        })
      } else {
        await api.post('/api/leave/user-request-hours/', {
          leave_type_id: selectedTypeId,
          entries: hourEntries.map(e => ({ date: e.date, start_time: e.from, end_time: e.to })),
          description: reason,
        })
      }
      navigate('/leave')
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : 'Có lỗi xảy ra'
      try { const j = JSON.parse(msg); if (j.error) msg = j.error } catch { /* keep */ }
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const seniorityDays = summary?.seniority_days ?? 0
  const overBalance = !!selected && totalDays > selected.total_leave_days && selected.leave_type_id.total_days > 1

  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: HNH.cream }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '6px 16px 8px' }}>
        <button onClick={() => navigate(-1)} className="border-none bg-transparent cursor-pointer"
          style={{ height: 32, padding: '0 12px', borderRadius: 10, color: HNH.red, fontWeight: 600, fontSize: 14 }}>
          Hủy
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Đơn xin nghỉ ({mode === 'day' ? 'theo ngày' : 'theo giờ'})</div>
        <button onClick={handleSubmit} disabled={!canSubmit} className="border-none cursor-pointer"
          style={{
            height: 32, padding: '0 14px', borderRadius: 10,
            background: canSubmit ? HNH.red : HNH.cream2, color: canSubmit ? '#fff' : HNH.ink3,
            fontWeight: 700, fontSize: 13.5,
          }}>
          {submitting ? '...' : 'Gửi'}
        </button>
      </div>

      <div className="flex-1 overflow-auto" style={{ padding: '6px 20px 20px' }}>
        {error && (
          <div style={{ background: HNH.red50, border: `1px solid ${HNH.red}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: HNH.red, fontWeight: 600 }}>
            {error}
          </div>
        )}

        {summary?.compensatory && summary.compensatory.available_days > 0 && (
          <div style={{ background: '#faf1d6', border: `1px solid ${HNH.gold}`, borderRadius: 12, padding: '9px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="palm" size={14} color="#a87908" stroke={2} />
            <span style={{ fontSize: 12, color: '#a87908', fontWeight: 700 }}>
              Bạn còn {summary.compensatory.available_days} ngày Phép Bù — sẽ được trừ trước
            </span>
          </div>
        )}

        {/* Type selector */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '6px 6px 6px' }}>LOẠI NGHỈ</div>
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
          {leaveTypes.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>}
          {leaveTypes.map((opt, i) => {
            const isSelected = selectedTypeId === opt.leave_type_id.id
            const avail = opt.available_days % 1 === 0 ? opt.available_days : opt.available_days.toFixed(1)
            const total = opt.leave_type_id.total_days
            const remainStr = total > 1 ? `${avail} / ${total % 1 === 0 ? total : total.toFixed(1)} ngày` : `${avail} ngày`
            const isBu = opt.leave_type_id.name.toLowerCase().includes('bù')
            const meta = leaveIcon(opt.leave_type_id.name)
            const displayRemain = isBu && summary?.compensatory
              ? `${summary.compensatory.available_days % 1 === 0 ? summary.compensatory.available_days : summary.compensatory.available_days.toFixed(1)} ngày`
              : remainStr
            return (
              <button key={opt.leave_type_id.id} onClick={() => setSelectedTypeId(opt.leave_type_id.id)}
                className="flex items-center gap-3 w-full bg-transparent border-none cursor-pointer text-left"
                style={{ padding: '12px 14px', borderBottom: i === leaveTypes.length - 1 ? 'none' : `1px solid ${HNH.line}`, background: isSelected ? (isBu ? '#faf1d6' : HNH.red50) : 'transparent' }}>
                <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${isSelected ? (isBu ? '#a87908' : HNH.red) : HNH.line2}`, background: isSelected ? (isBu ? '#a87908' : HNH.red) : '#fff' }}>
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg }}>
                  <Icon name={meta.icon} size={13} color={meta.color} stroke={2} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>
                    {opt.leave_type_id.name}
                    {isBu && <span style={{ fontSize: 10, color: '#a87908', fontWeight: 700, background: '#fceac9', borderRadius: 4, padding: '1px 5px' }}>Ưu tiên</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>{displayRemain}</div>
                </div>
              </button>
            )
          })}
        </div>

        {seniorityDays > 0 && (
          <div style={{ fontSize: 11.5, color: HNH.ink3, padding: '8px 6px', fontStyle: 'italic' }}>
            Thâm niên: bạn được cộng thêm <strong style={{ color: HNH.red }}>{seniorityDays} ngày</strong> phép thâm niên năm nay
          </div>
        )}

        {/* Mode toggle: theo ngày / theo giờ */}
        <div className="flex gap-2" style={{ marginTop: 14 }}>
          {([['day', 'Theo ngày'], ['hour', 'Theo giờ']] as const).map(([m, lbl]) => {
            const sel = mode === m
            return (
              <button key={m} onClick={() => setMode(m)} className="flex-1 border-none cursor-pointer"
                style={{ padding: '10px 0', borderRadius: 12, fontSize: 13.5, fontWeight: 700, border: `1.5px solid ${sel ? HNH.red : HNH.line}`, background: sel ? HNH.red : '#fff', color: sel ? '#fff' : HNH.ink3 }}>
                {lbl}
              </button>
            )
          })}
        </div>

        {/* ===== THEO NGÀY ===== */}
        {mode === 'day' && (<>
        <div className="flex items-center justify-between" style={{ padding: '14px 6px 6px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4 }}>NGÀY NGHỈ</span>
          <span style={{ fontSize: 10.5, color: HNH.ink3 }}>Chọn nhiều ngày, mỗi ngày chọn buổi</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: 12 }}>
          {/* Add a day */}
          <label className="flex items-center gap-2" style={{ padding: '10px 12px', borderRadius: 12, background: HNH.cream, border: `1px dashed ${HNH.line2}`, cursor: 'pointer' }}>
            <Icon name="plus" size={16} color={HNH.red} stroke={2.5} />
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.red, flex: 1 }}>Thêm ngày nghỉ</span>
            <input type="date" value={addDate} onChange={e => addDay(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 700, color: HNH.ink3, fontFamily: 'inherit' }} />
          </label>

          {/* Selected days list */}
          {days.map(d => (
            <div key={d.date} style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: HNH.cream, border: `1px solid ${HNH.line}` }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{fmtDate(d.date)}</span>
                <button onClick={() => removeDay(d.date)} className="border-none bg-transparent cursor-pointer flex items-center" style={{ color: HNH.ink3, padding: 2 }}>
                  <Icon name="x" size={16} color={HNH.ink3} stroke={2} />
                </button>
              </div>
              <div className="flex gap-1.5">
                {BD_OPTS.map(o => {
                  const sel = d.bd === o.id
                  return (
                    <button key={o.id} onClick={() => setBd(d.date, o.id)} className="flex-1 border-none cursor-pointer"
                      style={{ padding: '7px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: `1.5px solid ${sel ? HNH.red : HNH.line}`, background: sel ? HNH.red : '#fff', color: sel ? '#fff' : HNH.ink3 }}>
                      {o.label} <span style={{ fontSize: 10, opacity: 0.8 }}>({o.coef})</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {days.length > 0 && (
            <div className="flex items-center justify-between" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${HNH.line2}` }}>
              <span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 600 }}>Tổng số ngày nghỉ</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: HNH.red }}>{totalDays % 1 === 0 ? totalDays : totalDays.toFixed(2)} ngày</span>
            </div>
          )}
          {overBalance && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: HNH.red, fontWeight: 600 }}>
              Vượt quá số ngày phép còn lại ({selected?.total_leave_days} ngày)
            </div>
          )}
        </div>
        </>)}

        {/* ===== THEO GIỜ ===== */}
        {mode === 'hour' && (<>
        <div className="flex items-center justify-between" style={{ padding: '14px 6px 6px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4 }}>NGÀY &amp; GIỜ NGHỈ</span>
          <span style={{ fontSize: 10.5, color: HNH.ink3 }}>8 giờ = 1 ngày phép</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: 12 }}>
          <button onClick={() => setHourEntries(prev => [...prev, { date: '', from: '08:00', to: '12:00' }])}
            className="flex items-center gap-2 w-full border-none cursor-pointer"
            style={{ padding: '10px 12px', borderRadius: 12, background: HNH.cream, border: `1px dashed ${HNH.line2}` }}>
            <Icon name="plus" size={16} color={HNH.red} stroke={2.5} />
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.red }}>Thêm khoảng giờ</span>
          </button>

          {hourEntries.map((e, idx) => {
            const h = hoursOf(e)
            const upd = (patch: Partial<HourEntry>) => setHourEntries(prev => prev.map((x, i) => i === idx ? { ...x, ...patch } : x))
            return (
              <div key={idx} style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: HNH.cream, border: `1px solid ${HNH.line}` }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <input type="date" value={e.date} onChange={ev => upd({ date: ev.target.value })}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, fontWeight: 700, color: HNH.ink, fontFamily: 'inherit' }} />
                  <button onClick={() => setHourEntries(prev => prev.filter((_, i) => i !== idx))} className="border-none bg-transparent cursor-pointer flex items-center" style={{ padding: 2 }}>
                    <Icon name="x" size={16} color={HNH.ink3} stroke={2} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex-1" style={{ padding: '7px 10px', borderRadius: 9, background: '#fff', border: `1px solid ${HNH.line}` }}>
                    <div style={{ fontSize: 9.5, color: HNH.ink3, fontWeight: 700 }}>TỪ GIỜ</div>
                    <input type="time" value={e.from} onChange={ev => upd({ from: ev.target.value })}
                      style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 14, fontWeight: 700, color: HNH.ink, fontFamily: 'inherit' }} />
                  </label>
                  <Icon name="arrow-r" size={14} color={HNH.ink3} stroke={2} />
                  <label className="flex-1" style={{ padding: '7px 10px', borderRadius: 9, background: '#fff', border: `1px solid ${HNH.line}` }}>
                    <div style={{ fontSize: 9.5, color: HNH.ink3, fontWeight: 700 }}>ĐẾN GIỜ</div>
                    <input type="time" value={e.to} onChange={ev => upd({ to: ev.target.value })}
                      style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 14, fontWeight: 700, color: HNH.ink, fontFamily: 'inherit' }} />
                  </label>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: h > 0 ? HNH.navy : HNH.ink4, minWidth: 42, textAlign: 'right' }}>
                    {h > 0 ? `${h % 1 === 0 ? h : h.toFixed(1)}h` : '—'}
                  </span>
                </div>
              </div>
            )
          })}

          {hourEntries.length > 0 && (
            <div className="flex items-center justify-between" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${HNH.line2}` }}>
              <span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 600 }}>Tổng {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h = quy đổi</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: HNH.red }}>{totalDays % 1 === 0 ? totalDays : totalDays.toFixed(2)} ngày</span>
            </div>
          )}
          {overBalance && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: HNH.red, fontWeight: 600 }}>
              Vượt quá số ngày phép còn lại ({selected?.total_leave_days} ngày)
            </div>
          )}
        </div>
        </>)}

        {/* Reason */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>LÝ DO</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do xin nghỉ..."
          className="w-full resize-none"
          style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: '12px 14px', fontSize: 14, color: HNH.ink, lineHeight: 1.4, minHeight: 90, fontFamily: 'inherit', outline: 'none' }} />
      </div>
    </div>
  )
}
