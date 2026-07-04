import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

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
interface Person { id: number; name: string; position: string | null; is_direct?: boolean; department?: string | null; company?: string | null; locked?: boolean; badge_id?: string | null; accounting_code?: string | null }
interface PickCompany { id: number; name: string }
interface PickDept { id: number; name: string; company_ids: number[] }
interface CandidatesResp { results: Person[]; companies: PickCompany[]; departments: PickDept[] }

type Breakdown = 'full_day' | 'first_half' | 'second_half'
interface DayPick { date: string; bd: Breakdown }

const BD_OPTS: { id: Breakdown; label: string; coef: number }[] = [
  { id: 'first_half', label: 'Sáng', coef: 0.5 },
  { id: 'second_half', label: 'Chiều', coef: 0.5 },
  { id: 'full_day', label: 'Cả ngày', coef: 1.0 },
]
const coefOf = (bd: Breakdown) => (bd === 'full_day' ? 1 : 0.5)

type Mode = 'day' | 'hour'
interface HourFrame { from: string; to: string }
interface HourDay { date: string; frames: HourFrame[] }
const frameHours = (f: HourFrame): number => {
  if (!f.from || !f.to) return 0
  const [fh, fm] = f.from.split(':').map(Number)
  const [th, tm] = f.to.split(':').map(Number)
  return Math.max(0, (th * 60 + tm - fh * 60 - fm) / 60)
}
const dayHours = (d: HourDay): number => d.frames.reduce((s, f) => s + frameHours(f), 0)
const fmtDate = (s: string) => {
  const d = new Date(s + 'T00:00:00')
  const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
  return `${wd}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const pad2 = (n: number) => String(n).padStart(2, '0')

// ───────── CalendarPicker ─────────
const VN_MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

function CalendarPicker({ open, onClose, selectedDates, onToggle, singleSelect = false, onSelect }: {
  open: boolean
  onClose: () => void
  selectedDates: string[]
  onToggle?: (date: string) => void
  singleSelect?: boolean
  onSelect?: (date: string) => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  // Reset to today's month on open; if single-select has a selected date, jump to that month
  useEffect(() => {
    if (!open) return
    if (singleSelect && selectedDates.length === 1) {
      const parts = selectedDates[0].split('-').map(Number)
      setYear(parts[0])
      setMonth(parts[1] - 1)
    } else {
      setYear(now.getFullYear())
      setMonth(now.getMonth())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  const offset = (firstDow + 6) % 7                 // Mon-first offset

  const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

  if (!open) return null

  const handleDate = (ds: string) => {
    if (singleSelect && onSelect) { onSelect(ds); onClose() }
    else onToggle?.(ds)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 260, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: '20px 20px 0 0', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 10px' }}>
          <button onClick={prevMonth}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chev-l" size={18} color={HNH.ink2} stroke={2} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>{VN_MONTHS[month]} {year}</span>
          <button onClick={nextMonth}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${HNH.line}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chev-r" size={18} color={HNH.ink2} stroke={2} />
          </button>
        </div>
        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 10px' }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: d === 'CN' ? HNH.red : HNH.ink3, paddingBottom: 6 }}>{d}</div>
          ))}
        </div>
        {/* Date grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 10px', gap: '3px 0' }}>
          {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1
            const ds = `${year}-${pad2(month + 1)}-${pad2(dayNum)}`
            const isSel = selectedDates.includes(ds)
            const isToday = ds === todayStr
            const colIdx = (offset + i) % 7
            const isWeekend = colIdx === 5 || colIdx === 6
            return (
              <button key={ds} onClick={() => handleDate(ds)}
                style={{
                  width: '100%', aspectRatio: '1', maxWidth: 44, margin: '0 auto',
                  borderRadius: '50%', border: isToday && !isSel ? `1.5px solid ${HNH.red}` : 'none',
                  background: isSel ? HNH.red : 'transparent',
                  color: isSel ? '#fff' : isWeekend ? HNH.red : HNH.ink,
                  fontWeight: isSel || isToday ? 700 : 400,
                  fontSize: 15, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {dayNum}
              </button>
            )
          })}
        </div>
        {/* Footer for multi-select */}
        {!singleSelect && (
          <div style={{ padding: '14px 16px 0' }}>
            <button onClick={onClose}
              style={{ width: '100%', height: 50, borderRadius: 14, background: HNH.red, color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Xong{selectedDates.length > 0 ? ` · ${selectedDates.length} ngày đã chọn` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────── TimePickerModal ─────────
function TimePickerModal({ open, onClose, value, onChange }: {
  open: boolean
  onClose: () => void
  value: string
  onChange: (v: string) => void
}) {
  const [hh, setHh] = useState(8)
  const [mm, setMm] = useState(0)
  const hrRef = useRef<HTMLDivElement>(null)
  const mnRef = useRef<HTMLDivElement>(null)
  const ITEM_H = 48

  useEffect(() => {
    if (!open) return
    const parts = value.split(':').map(Number)
    const h = isNaN(parts[0]) ? 8 : parts[0]
    const rawM = isNaN(parts[1]) ? 0 : parts[1]
    const m = Math.round(rawM / 5) * 5 % 60
    setHh(h)
    setMm(m)
    // Scroll to selected item
    const timeout = setTimeout(() => {
      if (hrRef.current) hrRef.current.scrollTop = h * ITEM_H - ITEM_H * 2
      if (mnRef.current) mnRef.current.scrollTop = (m / 5) * ITEM_H - ITEM_H * 2
    }, 60)
    return () => clearTimeout(timeout)
  }, [open, value])

  if (!open) return null

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

  const confirm = () => { onChange(`${pad2(hh)}:${pad2(mm)}`); onClose() }

  const colStyle: React.CSSProperties = {
    height: 240, overflowY: 'auto', width: 80,
    scrollbarWidth: 'none', msOverflowStyle: 'none',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 270, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: '20px 20px 0 0', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, textAlign: 'center', padding: '6px 0 14px' }}>Chọn giờ</div>

        {/* Drum columns */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          {/* Highlight bar at center */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 180, height: ITEM_H, background: HNH.red50, borderRadius: 12, pointerEvents: 'none' }} />

          <div ref={hrRef} style={colStyle}>
            <div style={{ height: ITEM_H * 2 }} />
            {hours.map(h => (
              <button key={h} onClick={() => setHh(h)}
                style={{ height: ITEM_H, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: h === hh ? 22 : 17, fontWeight: h === hh ? 800 : 400, color: h === hh ? HNH.red : HNH.ink3 }}>
                {pad2(h)}
              </button>
            ))}
            <div style={{ height: ITEM_H * 2 }} />
          </div>

          <div style={{ fontSize: 24, fontWeight: 900, color: HNH.ink, padding: '0 4px', lineHeight: 1 }}>:</div>

          <div ref={mnRef} style={colStyle}>
            <div style={{ height: ITEM_H * 2 }} />
            {minutes.map(m => (
              <button key={m} onClick={() => setMm(m)}
                style={{ height: ITEM_H, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: m === mm ? 22 : 17, fontWeight: m === mm ? 800 : 400, color: m === mm ? HNH.red : HNH.ink3 }}>
                {pad2(m)}
              </button>
            ))}
            <div style={{ height: ITEM_H * 2 }} />
          </div>
        </div>

        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, height: 48, borderRadius: 13, border: `1.5px solid ${HNH.line}`, background: '#fff', fontWeight: 700, fontSize: 14, color: HNH.ink3, cursor: 'pointer' }}>
            Huỷ
          </button>
          <button onClick={confirm}
            style={{ flex: 2, height: 48, borderRadius: 13, border: 'none', background: HNH.red, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
            {pad2(hh)}:{pad2(mm)} ✓
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────── PersonPicker ─────────
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

function PersonPicker({ selectedIds, knownPeople, onChange, onLearnPeople, lockedIds, accent, accentBg, addLabel, emptyText }: {
  selectedIds: number[]; knownPeople: Person[]; onChange: (ids: number[]) => void
  onLearnPeople: (p: Person[]) => void; lockedIds: number[]
  accent: string; accentBg: string; addLabel: string; emptyText: string
}) {
  const [open, setOpen] = useState(false)
  const [company, setCompany] = useState<number | ''>('')
  const [department, setDepartment] = useState<number | ''>('')
  const [q, setQ] = useState('')
  const [resp, setResp] = useState<CandidatesResp | null>(null)
  const [loading, setLoading] = useState(false)

  // Lọc theo công ty/phòng/từ khóa — fetch có debounce 250ms
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(() => {
      const p = new URLSearchParams()
      if (company) p.set('company', String(company))
      if (department) p.set('department', String(department))
      if (q.trim()) p.set('search', q.trim())
      api.get<CandidatesResp>(`/api/leave/select-candidates/?${p.toString()}`)
        .then(r => { setResp(r); onLearnPeople(r.results) })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company, department, q])

  const isLocked = (id: number) => lockedIds.includes(id)
  const isSel = (id: number) => selectedIds.includes(id)
  const chosen = knownPeople.filter(p => selectedIds.includes(p.id))
  const toggle = (p: Person) => {
    if (isLocked(p.id)) return
    onLearnPeople([p])
    onChange(isSel(p.id) ? selectedIds.filter(x => x !== p.id) : [...selectedIds, p.id])
  }
  const remove = (id: number) => { if (!isLocked(id)) onChange(selectedIds.filter(x => x !== id)) }
  const deptOptions = (resp?.departments ?? []).filter(d => !company || (d.company_ids ?? []).includes(company))

  const inputStyle = { padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 13, color: HNH.ink, background: '#fff', fontFamily: 'inherit', outline: 'none' } as const

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: 12 }}>
        <div className="flex flex-wrap gap-2">
          {chosen.length === 0 && <span style={{ fontSize: 12, color: HNH.ink3 }}>{emptyText}</span>}
          {chosen.map(p => (
            <span key={p.id} className="flex items-center gap-1" style={{ padding: isLocked(p.id) ? '6px 12px' : '6px 8px 6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, background: accentBg, color: accent, border: `1.5px solid ${accent}` }}>
              {p.name}{p.is_direct ? ' (QLTT)' : ''}{isLocked(p.id) ? ' · C&B cố định' : ''}
              {!isLocked(p.id) && (
                <button onClick={() => remove(p.id)} className="border-none bg-transparent cursor-pointer flex items-center" style={{ padding: 0, marginLeft: 2 }}>
                  <Icon name="x" size={13} color={accent} stroke={2.5} />
                </button>
              )}
            </span>
          ))}
          <button onClick={() => { setQ(''); setCompany(''); setDepartment(''); setOpen(true) }} className="flex items-center gap-1 border-none cursor-pointer"
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, background: '#fff', border: `1.5px dashed ${HNH.line2}`, color: HNH.navy }}>
            <Icon name="plus" size={13} color={HNH.navy} stroke={2.5} /> {addLabel}
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 200, background: 'rgba(0,0,0,0.4)' }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '82vh', background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: `1px solid ${HNH.line}` }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: HNH.ink }}>{addLabel}</span>
              <button onClick={() => setOpen(false)} className="border-none cursor-pointer flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: HNH.cream }}>
                <Icon name="x" size={18} color={HNH.ink} stroke={2} />
              </button>
            </div>
            {/* Bộ lọc công ty + phòng ban */}
            <div className="flex gap-2" style={{ padding: '10px 16px 6px' }}>
              <select value={company} onChange={e => { setCompany(e.target.value ? Number(e.target.value) : ''); setDepartment('') }} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Tất cả công ty</option>
                {(resp?.companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={department} onChange={e => setDepartment(e.target.value ? Number(e.target.value) : '')} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Tất cả phòng ban</option>
                {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ padding: '4px 16px 10px' }}>
              <div className="flex items-center gap-2" style={{ padding: '9px 12px', borderRadius: 12, background: HNH.cream, border: `1px solid ${HNH.line}` }}>
                <Icon name="search" size={16} color={HNH.ink3} stroke={2} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên, mã kế toán, mã NV..." autoFocus
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: HNH.ink, fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
              {loading && <div style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 20 }}>Đang tải...</div>}
              {!loading && (resp?.results.length ?? 0) === 0 && <div style={{ textAlign: 'center', color: HNH.ink3, fontSize: 13, padding: 20 }}>Không tìm thấy</div>}
              {!loading && (resp?.results ?? []).map(p => {
                const sel = isSel(p.id)
                const locked = isLocked(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p)} disabled={locked} className="flex items-center gap-3 w-full border-none text-left"
                    style={{ padding: '11px 10px', borderRadius: 12, background: sel ? accentBg : 'transparent', marginBottom: 2, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.65 : 1 }}>
                    <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${sel ? accent : HNH.ink4}`, background: sel ? accent : '#fff' }}>
                      {sel && <Icon name="check" size={13} color="#fff" stroke={3} />}
                    </div>
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{p.name}{p.accounting_code ? ` · ${p.accounting_code}` : ''}{locked ? ' · C&B cố định' : ''}</div>
                      {(p.position || p.department || p.company) && <div style={{ fontSize: 11.5, color: HNH.ink3 }}>{[p.position, p.department, p.company].filter(Boolean).join(' · ')}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${HNH.line}` }}>
              <button onClick={() => setOpen(false)} className="w-full border-none cursor-pointer" style={{ padding: 12, borderRadius: 12, background: HNH.navy, color: '#fff', fontWeight: 800, fontSize: 14 }}>
                Xong ({selectedIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ───────── LeaveNewPage ─────────
export function LeaveNewPage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const { data: balResp } = useApi<Paginated<AvailableLeave>>('/api/leave/available-leave/?page_size=20')
  const { data: summary } = useApi<HNHSummary>('/api/leave/hnh-leave-summary/')
  const { data: managers } = useApi<Person[]>('/api/leave/available-managers/')
  const { data: watchersData } = useApi<Person[]>('/api/leave/watcher-candidates/')
  const { data: cbManagers } = useApi<Person[]>('/api/leave/cb-managers/')

  // Cache tên người (để render chip) gom từ mọi nguồn + lựa chọn trong modal
  const [peopleCache, setPeopleCache] = useState<Record<number, Person>>({})
  const learnPeople = (ps: Person[]) => setPeopleCache(prev => {
    const next = { ...prev }
    ps.forEach(p => { next[p.id] = { ...next[p.id], ...p } })
    return next
  })
  useEffect(() => { if (managers) learnPeople(managers) }, [managers])
  useEffect(() => { if (watchersData) learnPeople(watchersData) }, [watchersData])
  useEffect(() => { if (cbManagers) learnPeople(cbManagers) }, [cbManagers])
  const lockedIds = (cbManagers ?? []).map(c => c.id)

  const rawTypes = balResp?.results ?? []
  const leaveTypes = sortLeaveTypes(rawTypes).filter(t => !/ốm|sick/i.test(t.leave_type_id.name))
  const { data: allTypesResp } = useApi<Paginated<{ id: number; name: string }>>('/api/leave/leave-type/?page_size=50')
  const deductingIds = new Set(leaveTypes.map(t => t.leave_type_id.id))
  const NHOM2_RE = /(công tác|hiếu|hỷ|phúc lợi|không lương)/i
  const nonDeductTypes = (allTypesResp?.results ?? []).filter(t => NHOM2_RE.test(t.name) && !deductingIds.has(t.id))

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('day')
  const [days, setDays] = useState<DayPick[]>([])
  const [hourDays, setHourDays] = useState<HourDay[]>([])
  const [title, setTitle] = useState('')
  const [approverIds, setApproverIds] = useState<number[]>([])
  const [watcherIds, setWatcherIds] = useState<number[]>([])
  const [reason, setReason] = useState('')

  // Pre-fill title with employee name
  useEffect(() => {
    if (employee?.full_name && !title) {
      setTitle(`Đơn nghỉ phép của ${employee.full_name}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.full_name])

  // Calendar & time picker modal state
  const [dayCalOpen, setDayCalOpen] = useState(false)
  const [hourDayPickerIdx, setHourDayPickerIdx] = useState<number | null>(null)
  const [timePicker, setTimePicker] = useState<{ di: number; fi: number; field: 'from' | 'to'; value: string } | null>(null)

  // Mặc định: quản lý trực tiếp là người duyệt đầu tiên + C&B cố định (khóa)
  useEffect(() => {
    if (!managers || !cbManagers) return
    setApproverIds(prev => {
      if (prev.length > 0) return prev
      const ids: number[] = []
      const direct = managers.find(m => m.is_direct)
      if (direct) ids.push(direct.id)
      cbManagers.forEach(c => { if (!ids.includes(c.id)) ids.push(c.id) })
      return ids
    })
  }, [managers, cbManagers])

  // C&B luôn được pin vào Người theo dõi (không bỏ chọn được)
  useEffect(() => {
    if (!cbManagers || cbManagers.length === 0) return
    setWatcherIds(prev => {
      const ids = [...prev]
      cbManagers.forEach(c => { if (!ids.includes(c.id)) ids.push(c.id) })
      return ids
    })
  }, [cbManagers])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (selectedTypeId !== null || leaveTypes.length === 0) return
    const bu = leaveTypes.find(t => t.leave_type_id.name.toLowerCase().includes('bù') && t.available_days > 0)
    const annual = leaveTypes.find(t => t.leave_type_id.name.toLowerCase().includes('phép năm'))
    setSelectedTypeId((bu ?? annual ?? leaveTypes[0])?.leave_type_id?.id ?? null)
  }, [leaveTypes, selectedTypeId])

  const selected = leaveTypes.find(t => t.leave_type_id.id === selectedTypeId)
  const isNonDeduct = !!selectedTypeId && nonDeductTypes.some(t => t.id === selectedTypeId)
  const selectedTypeName = selected?.leave_type_id.name
    ?? nonDeductTypes.find(t => t.id === selectedTypeId)?.name ?? '—'
  const totalHours = hourDays.reduce((s, d) => s + dayHours(d), 0)
  const totalDays = mode === 'day'
    ? days.reduce((s, d) => s + coefOf(d.bd), 0)
    : Math.round((totalHours / 8) * 100) / 100
  const canSubmit = !!selectedTypeId && title.trim() && reason.trim() && approverIds.length > 0 && !submitting && (
    mode === 'day' ? days.length > 0
      : hourDays.length > 0 && hourDays.every(d => d.date && d.frames.length > 0 && d.frames.every(f => frameHours(f) > 0))
  )

  // Toggle a day in the multi-select calendar
  const toggleDay = (ds: string) => {
    setDays(prev => {
      if (prev.some(d => d.date === ds)) return prev.filter(d => d.date !== ds)
      return [...prev, { date: ds, bd: 'full_day' as Breakdown }].sort((a, b) => a.date.localeCompare(b.date))
    })
  }
  const removeDay = (ds: string) => setDays(prev => prev.filter(d => d.date !== ds))
  const setBd = (ds: string, bd: Breakdown) => setDays(prev => prev.map(d => d.date === ds ? { ...d, bd } : d))

  // Confirm time picker
  const confirmTime = (v: string) => {
    if (!timePicker) return
    const { di, fi, field } = timePicker
    setHourDays(prev => prev.map((d, i) => i === di ? {
      ...d, frames: d.frames.map((f, j) => j === fi ? { ...f, [field]: v } : f)
    } : d))
    setTimePicker(null)
  }

  const doSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    const desc = title.trim() ? `${title.trim()} — ${reason.trim()}` : reason.trim()
    try {
      if (mode === 'day') {
        await api.post('/api/leave/user-request-days/', {
          leave_type_id: selectedTypeId,
          days: days.map(d => ({ date: d.date, breakdown: d.bd })),
          description: desc, approver_ids: approverIds, watcher_ids: watcherIds,
        })
      } else {
        const entries = hourDays.flatMap(d => d.frames.map(f => ({ date: d.date, start_time: f.from, end_time: f.to })))
        await api.post('/api/leave/user-request-hours/', {
          leave_type_id: selectedTypeId,
          entries,
          description: desc, approver_ids: approverIds, watcher_ids: watcherIds,
        })
      }
      setConfirmOpen(false)
      navigate('/leave')
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : 'Có lỗi xảy ra'
      try { const j = JSON.parse(msg); if (j.error) msg = j.error } catch { /* keep */ }
      setError(msg); setConfirmOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  const seniorityDays = summary?.seniority_days ?? 0
  const overBalance = !!selected && totalDays > selected.total_leave_days && selected.leave_type_id.total_days > 1
  const bdLabel = (bd: Breakdown) => BD_OPTS.find(o => o.id === bd)?.label ?? ''
  const approverNames = approverIds.map(id => peopleCache[id]?.name).filter(Boolean) as string[]
  const watcherNames = watcherIds.map(id => peopleCache[id]?.name).filter(Boolean) as string[]

  return (
    <div className="flex flex-col" style={{ background: HNH.cream, height: '100dvh' }}>
      {/* Header — chừa safe-area-inset-top để không bị 'tai thỏ'/Dynamic Island che (iPhone 15) */}
      <div className="flex items-center justify-between" style={{ padding: '6px 12px 8px', paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 border-none bg-transparent cursor-pointer"
          style={{ height: 36, padding: '0 8px', borderRadius: 10, color: HNH.red, fontWeight: 600, fontSize: 14.5 }}>
          <Icon name="chev-l" size={18} color={HNH.red} stroke={2.5} /> Quay lại
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Đơn xin nghỉ ({mode === 'day' ? 'theo ngày' : 'theo giờ'})</div>
        <div style={{ width: 72 }} />
      </div>

      <div className="flex-1 overflow-auto" style={{ padding: '6px 20px 20px', minHeight: 0 }}>
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

        {/* Tiêu đề */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '6px 6px 6px' }}>TIÊU ĐỀ <span style={{ color: HNH.red }}>*</span></div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Đơn nghỉ phép của Nguyễn Văn A"
          className="w-full"
          style={{ background: '#fff', borderRadius: 14, border: `1px solid ${HNH.line}`, padding: '11px 14px', fontSize: 14, color: HNH.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />

        {/* Type selector */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>LOẠI NGHỈ — TRỪ PHÉP</div>
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

        {/* Nhóm 2 — KHÔNG trừ phép */}
        {nonDeductTypes.length > 0 && (
          <>
            <div className="flex items-center gap-2" style={{ padding: '12px 6px 6px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4 }}>KHÔNG TRỪ PHÉP</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a87908', background: '#faf1d6', borderRadius: 5, padding: '1px 6px' }}>Ghi nhận thủ tục</span>
            </div>
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
              {nonDeductTypes.map((t, i) => {
                const isSelected = selectedTypeId === t.id
                return (
                  <button key={t.id} onClick={() => setSelectedTypeId(t.id)}
                    className="flex items-center gap-3 w-full bg-transparent border-none cursor-pointer text-left"
                    style={{ padding: '12px 14px', borderBottom: i === nonDeductTypes.length - 1 ? 'none' : `1px solid ${HNH.line}`, background: isSelected ? HNH.navy50 : 'transparent' }}>
                    <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${isSelected ? HNH.navy : HNH.line2}`, background: isSelected ? HNH.navy : '#fff' }}>
                      {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <div className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28, borderRadius: 8, background: HNH.cream2 }}>
                      <Icon name="doc" size={13} color={HNH.ink2} stroke={2} />
                    </div>
                    <div className="flex-1">
                      <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{t.name}</div>
                      <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 1 }}>Không trừ phép năm</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

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
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4 }}>NGÀY NGHỈ <span style={{ color: HNH.red }}>*</span></span>
          <span style={{ fontSize: 10.5, color: HNH.ink3 }}>Chọn nhiều ngày, mỗi ngày chọn buổi</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: 12 }}>
          {/* Open calendar button */}
          <button onClick={() => setDayCalOpen(true)}
            className="flex items-center gap-2 w-full border-none cursor-pointer"
            style={{ padding: '10px 12px', borderRadius: 12, background: HNH.cream, border: `1px dashed ${HNH.red}` }}>
            <Icon name="cal" size={16} color={HNH.red} stroke={2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: HNH.red, flex: 1, textAlign: 'left' }}>
              {days.length === 0 ? 'Chọn ngày nghỉ' : `Thêm / chỉnh ngày (${days.length} ngày)`}
            </span>
            <Icon name="chev-r" size={14} color={HNH.red} stroke={2} />
          </button>

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
          <span style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4 }}>NGÀY &amp; KHUNG GIỜ NGHỈ <span style={{ color: HNH.red }}>*</span></span>
          <span style={{ fontSize: 10.5, color: HNH.ink3 }}>8 giờ = 1 ngày phép</span>
        </div>

        {hourDays.map((d, di) => {
          const setDay = (patch: Partial<HourDay>) => setHourDays(prev => prev.map((x, i) => i === di ? { ...x, ...patch } : x))
          return (
            <div key={di} style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: 12, marginBottom: 10 }}>
              {/* Day header */}
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: HNH.ink3, background: HNH.cream, borderRadius: 6, padding: '2px 7px' }}>NGÀY {String(di + 1).padStart(2, '0')}</span>
                  {d.date && <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.red }}>{fmtDate(d.date)}</span>}
                </div>
                <button onClick={() => setHourDays(prev => prev.filter((_, i) => i !== di))} className="border-none bg-transparent cursor-pointer flex items-center" style={{ padding: 2 }}>
                  <Icon name="x" size={16} color={HNH.ink3} stroke={2} />
                </button>
              </div>

              {/* Date picker button */}
              <button onClick={() => setHourDayPickerIdx(di)}
                className="flex items-center gap-2 w-full border-none cursor-pointer"
                style={{ padding: '9px 11px', borderRadius: 10, border: `1px solid ${d.date ? HNH.line : HNH.red}`, background: d.date ? HNH.cream : HNH.red50, marginBottom: 8 }}>
                <Icon name="cal" size={15} color={d.date ? HNH.ink2 : HNH.red} stroke={2} />
                <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 700, color: d.date ? HNH.ink : HNH.red }}>
                  {d.date ? fmtDate(d.date) : 'Chọn ngày'}
                </span>
                <Icon name="chev-d" size={13} color={d.date ? HNH.ink3 : HNH.red} stroke={2} />
              </button>

              {/* Time frames */}
              {d.frames.map((f, fi) => {
                const h = frameHours(f)
                return (
                  <div key={fi} className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 9.5, color: HNH.ink3, fontWeight: 700, minWidth: 30 }}>KG {fi + 1}</span>
                    {/* From time button */}
                    <button onClick={() => setTimePicker({ di, fi, field: 'from', value: f.from })}
                      className="flex-1 flex items-center justify-center border-none cursor-pointer"
                      style={{ padding: '8px 6px', borderRadius: 9, background: f.from ? HNH.navy50 : HNH.cream, border: `1px solid ${f.from ? HNH.navy : HNH.line}` }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: f.from ? HNH.navy : HNH.ink3 }}>{f.from || '--:--'}</span>
                    </button>
                    <Icon name="arrow-r" size={13} color={HNH.ink3} stroke={2} />
                    {/* To time button */}
                    <button onClick={() => setTimePicker({ di, fi, field: 'to', value: f.to })}
                      className="flex-1 flex items-center justify-center border-none cursor-pointer"
                      style={{ padding: '8px 6px', borderRadius: 9, background: f.to ? HNH.navy50 : HNH.cream, border: `1px solid ${f.to ? HNH.navy : HNH.line}` }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: f.to ? HNH.navy : HNH.ink3 }}>{f.to || '--:--'}</span>
                    </button>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: h > 0 ? HNH.navy : HNH.ink4, minWidth: 36, textAlign: 'right' }}>{h > 0 ? `${h % 1 === 0 ? h : h.toFixed(1)}h` : '—'}</span>
                    {d.frames.length > 1 && (
                      <button onClick={() => setDay({ frames: d.frames.filter((_, i) => i !== fi) })} className="border-none bg-transparent cursor-pointer flex items-center" style={{ padding: 0 }}>
                        <Icon name="x" size={13} color={HNH.ink4} stroke={2} />
                      </button>
                    )}
                  </div>
                )
              })}
              <button onClick={() => setDay({ frames: [...d.frames, { from: '13:30', to: '17:30' }] })}
                className="border-none bg-transparent cursor-pointer" style={{ fontSize: 11.5, fontWeight: 700, color: HNH.navy, padding: '4px 0' }}>
                + Thêm khung giờ trong ngày
              </button>
            </div>
          )
        })}

        <button onClick={() => setHourDays(prev => [...prev, { date: '', frames: [{ from: '08:00', to: '12:00' }] }])}
          className="flex items-center justify-center gap-2 w-full border-none cursor-pointer"
          style={{ padding: '11px 0', borderRadius: 12, background: '#fff', border: `1px dashed ${HNH.red}`, color: HNH.red, fontWeight: 700, fontSize: 13 }}>
          <Icon name="plus" size={16} color={HNH.red} stroke={2.5} /> Thêm ngày nối tiếp
        </button>

        {hourDays.length > 0 && (
          <div className="flex items-center justify-between" style={{ background: '#fff', borderRadius: 12, border: `1px solid ${HNH.line}`, padding: '10px 14px', marginTop: 10 }}>
            <span style={{ fontSize: 12.5, color: HNH.ink3, fontWeight: 600 }}>Tổng {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h = quy đổi</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: HNH.red }}>{totalDays % 1 === 0 ? totalDays : totalDays.toFixed(2)} ngày</span>
          </div>
        )}
        {mode === 'hour' && overBalance && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: HNH.red, fontWeight: 600 }}>
            Vượt quá số ngày phép còn lại ({selected?.total_leave_days} ngày)
          </div>
        )}
        </>)}

        {/* Người duyệt */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>NGƯỜI DUYỆT / XÁC NHẬN <span style={{ color: HNH.red }}>*</span></div>
        <PersonPicker selectedIds={approverIds} knownPeople={Object.values(peopleCache)} onChange={setApproverIds}
          onLearnPeople={learnPeople} lockedIds={lockedIds}
          accent={HNH.navy} accentBg={HNH.navy50} addLabel="Thêm người duyệt" emptyText="Chưa chọn người duyệt" />

        {/* Người theo dõi */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>NGƯỜI THEO DÕI</div>
        <PersonPicker selectedIds={watcherIds} knownPeople={Object.values(peopleCache)} onChange={setWatcherIds}
          onLearnPeople={learnPeople} lockedIds={lockedIds}
          accent="#a87908" accentBg="#faf1d6" addLabel="Thêm người theo dõi" emptyText="Chưa chọn người theo dõi" />

        {/* Reason */}
        <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, padding: '14px 6px 6px' }}>LÝ DO <span style={{ color: HNH.red }}>*</span></div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do xin nghỉ..."
          className="w-full resize-none"
          style={{ background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`, padding: '12px 14px', fontSize: 14, color: HNH.ink, lineHeight: 1.4, minHeight: 90, fontFamily: 'inherit', outline: 'none' }} />
      </div>

      {/* Bottom bar */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${HNH.line}`, padding: '10px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={() => { if (canSubmit) setConfirmOpen(true) }} disabled={!canSubmit}
          className="flex items-center justify-center gap-2 w-full border-none"
          style={{ height: 50, borderRadius: 14, background: canSubmit ? HNH.red : HNH.cream2, color: canSubmit ? '#fff' : HNH.ink3, fontWeight: 800, fontSize: 15.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          <Icon name="send" size={18} color={canSubmit ? '#fff' : HNH.ink3} stroke={2.2} />
          Gửi đơn{totalDays > 0 ? ` · ${totalDays % 1 === 0 ? totalDays : totalDays.toFixed(2)} ngày` : ''}
        </button>
      </div>

      {/* Confirm sheet */}
      {confirmOpen && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 300, background: 'rgba(0,0,0,0.45)' }} onClick={() => !submitting && setConfirmOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 10px', borderBottom: `1px solid ${HNH.line}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink }}>Xác nhận đơn xin nghỉ</div>
              <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2 }}>Kiểm tra thông tin trước khi gửi chính thức</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
              {([
                ['Tiêu đề', title.trim() || '—'],
                ['Loại nghỉ', selectedTypeName + (isNonDeduct ? ' (không trừ phép)' : '')],
                ['Hình thức', mode === 'day' ? 'Theo ngày' : 'Theo giờ'],
                ['Tổng quy đổi', `${totalDays % 1 === 0 ? totalDays : totalDays.toFixed(2)} ngày${mode === 'hour' ? ` (${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h)` : ''}`],
                ['Người duyệt', approverNames.join(', ') || '—'],
                ['Người theo dõi', watcherNames.join(', ') || '—'],
                ['Lý do', reason.trim() || '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}`, fontSize: 13 }}>
                  <span style={{ color: HNH.ink3, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontWeight: 600, color: HNH.ink, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.3 }}>CHI TIẾT</div>
              <div style={{ marginTop: 6, background: HNH.cream, borderRadius: 12, padding: '10px 12px' }}>
                {mode === 'day' && days.map(d => (
                  <div key={d.date} className="flex justify-between" style={{ fontSize: 12.5, padding: '3px 0' }}>
                    <span style={{ color: HNH.ink }}>{fmtDate(d.date)}</span>
                    <span style={{ fontWeight: 700, color: HNH.red }}>{bdLabel(d.bd)} ({coefOf(d.bd)})</span>
                  </div>
                ))}
                {mode === 'hour' && hourDays.map((d, i) => (
                  <div key={i} style={{ padding: '3px 0' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink }}>{fmtDate(d.date)} — {dayHours(d) % 1 === 0 ? dayHours(d) : dayHours(d).toFixed(1)}h</div>
                    {d.frames.map((f, fi) => (
                      <div key={fi} style={{ fontSize: 11.5, color: HNH.ink3, paddingLeft: 8 }}>• {f.from} → {f.to}</div>
                    ))}
                  </div>
                ))}
              </div>
              {error && <div style={{ marginTop: 10, fontSize: 12.5, color: HNH.red, fontWeight: 600 }}>{error}</div>}
            </div>
            <div className="flex gap-3" style={{ padding: '12px 16px', borderTop: `1px solid ${HNH.line}` }}>
              <button onClick={() => setConfirmOpen(false)} disabled={submitting} className="border-none cursor-pointer"
                style={{ flex: 1, height: 48, borderRadius: 13, background: '#fff', border: `1.5px solid ${HNH.line}`, color: HNH.ink3, fontWeight: 700, fontSize: 14 }}>
                Huỷ
              </button>
              <button onClick={doSubmit} disabled={submitting} className="border-none cursor-pointer"
                style={{ flex: 2, height: 48, borderRadius: 13, background: HNH.success, color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {submitting ? 'Đang gửi...' : 'Đồng ý gửi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CalendarPicker — multi-select for day mode */}
      <CalendarPicker
        open={dayCalOpen}
        onClose={() => setDayCalOpen(false)}
        selectedDates={days.map(d => d.date)}
        onToggle={toggleDay}
      />

      {/* CalendarPicker — single-select for hourDay date */}
      <CalendarPicker
        open={hourDayPickerIdx !== null}
        onClose={() => setHourDayPickerIdx(null)}
        selectedDates={hourDayPickerIdx !== null && hourDays[hourDayPickerIdx]?.date ? [hourDays[hourDayPickerIdx].date] : []}
        singleSelect
        onSelect={ds => {
          if (hourDayPickerIdx !== null) {
            setHourDays(prev => prev.map((d, i) => i === hourDayPickerIdx ? { ...d, date: ds } : d))
          }
          setHourDayPickerIdx(null)
        }}
      />

      {/* TimePickerModal */}
      <TimePickerModal
        open={timePicker !== null}
        onClose={() => setTimePicker(null)}
        value={timePicker?.value ?? '08:00'}
        onChange={confirmTime}
      />
    </div>
  )
}
