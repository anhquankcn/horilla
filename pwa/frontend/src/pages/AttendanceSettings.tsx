import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { TopBar } from '../components/layout/TopBar'
import { useToast } from '../components/ui/Toast'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HRMConfigData {
  geo_approval_required: boolean
  is_hr: boolean
}

interface ShiftSchedule {
  day: string
  start_time: string | null
  end_time: string | null
  blocks: number | null
  minimum_working_hour: string
  is_night_shift: boolean
}

interface GraceTime {
  id: number
  allowed_time: string
  allowed_min: number
  clock_in: boolean
  clock_out: boolean
}

interface ShiftInfo {
  id: number
  name: string
  weekly_full_time: string
  department_ids: number[]
  department_names: string[]
  schedules: ShiftSchedule[]
  grace_time: GraceTime | null
}

interface Department {
  id: number
  department: string
}

interface ShiftCategoriesData {
  shifts: ShiftInfo[]
  departments: Department[]
  grace_times: GraceTimeItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const DAY_VI: Record<string, string> = {
  monday: 'T2', tuesday: 'T3', wednesday: 'T4',
  thursday: 'T5', friday: 'T6', saturday: 'T7', sunday: 'CN',
}

function groupSchedules(schedules: ShiftSchedule[]) {
  const sorted = [...schedules].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
  const groups: { key: string; days: string[]; schedule: ShiftSchedule }[] = []
  for (const sch of sorted) {
    const key = `${sch.start_time}-${sch.end_time}-${sch.blocks}-${sch.minimum_working_hour}-${sch.is_night_shift}`
    const existing = groups.find(g => g.key === key)
    if (existing) existing.days.push(sch.day)
    else groups.push({ key, days: [sch.day], schedule: sch })
  }
  return groups
}

// ── Base UI Components ────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: HNH.ink3,
      letterSpacing: 0.6, textTransform: 'uppercase',
      padding: '0 6px 6px',
    }}>
      {title}
    </div>
  )
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${HNH.line}`, overflow: 'hidden',
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); !disabled && onChange(!value) }}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none',
        background: value ? HNH.success : HNH.ink4,
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        left: value ? 21 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

function SettingRow({ icon, label, detail, tone, last, onClick, trailing }: {
  icon: string; label: string; detail?: string
  tone?: 'ink' | 'red' | 'success' | 'warn' | 'navy'
  last?: boolean; onClick?: () => void; trailing?: React.ReactNode
}) {
  const t = tone ?? 'ink'
  const iconColor = t === 'red' ? HNH.red : t === 'success' ? HNH.success : t === 'warn' ? HNH.warn : t === 'navy' ? HNH.navy : HNH.ink2
  const iconBg = t === 'red' ? HNH.red50 : t === 'success' ? HNH.success50 : t === 'warn' ? HNH.warn50 : t === 'navy' ? HNH.navy50 : HNH.cream
  return (
    <button
      onClick={onClick} disabled={!onClick}
      className={`flex items-center gap-3 w-full text-left border-none ${onClick ? 'cursor-pointer' : ''}`}
      style={{ padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${HNH.line}`, background: 'transparent' }}
    >
      <div className="flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, borderRadius: 10, background: iconBg }}>
        <Icon name={icon} size={15} color={iconColor} stroke={1.9} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 600, color: t === 'red' ? HNH.red : HNH.ink }}>{label}</div>
        {detail && <div style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 500, marginTop: 1 }}>{detail}</div>}
      </div>
      {trailing}
      {onClick && !trailing && <Icon name="chev-r" size={16} color={HNH.ink4} stroke={2} />}
    </button>
  )
}

// ── Shift Detail Card ─────────────────────────────────────────────────────────

function InfoChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: HNH.ink4, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? HNH.ink }}>{value}</span>
    </div>
  )
}

function Pill({ text, active }: { text: string; active: boolean }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
      background: active ? HNH.success50 : HNH.cream,
      color: active ? HNH.success : HNH.ink4,
      border: `1px solid ${active ? HNH.success : HNH.line}`,
    }}>{text}</span>
  )
}

function ShiftDetailCard({ shift, onEdit, onDelete, deleting }: {
  shift: ShiftInfo
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const groups = groupSchedules(shift.schedules)
  const repSched = groups[0]?.schedule ?? null

  return (
    <div style={{ borderBottom: `1px solid ${HNH.line}` }}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', border: 'none', background: 'none', cursor: 'pointer',
          padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        }}
      >
        {/* Mã ca badge */}
        <div style={{
          flexShrink: 0, minWidth: 34, height: 34, borderRadius: 10,
          background: HNH.red50, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 8.5, color: HNH.red, fontWeight: 700, lineHeight: 1 }}>CA</span>
          <span style={{ fontSize: 11, color: HNH.red, fontWeight: 800, lineHeight: 1 }}>#{shift.id}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink }}>{shift.name}</div>
          {repSched && repSched.start_time && repSched.end_time ? (
            <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2 }}>
              {repSched.start_time} → {repSched.end_time}
              {repSched.blocks ? ` · ${repSched.blocks} block×15'` : ''}
              {repSched.is_night_shift ? ' · 🌙 Ca đêm' : ''}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: HNH.ink4, marginTop: 2 }}>Chưa cấu hình lịch</div>
          )}
        </div>

        <Icon name={expanded ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink4} stroke={2} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Schedule groups */}
          {groups.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.map((g, idx) => (
                <div key={idx} style={{
                  background: HNH.cream, borderRadius: 12, padding: '10px 12px',
                }}>
                  {/* Day pills */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {g.days.map(d => (
                      <span key={d} style={{
                        fontSize: 11, fontWeight: 700, color: HNH.navy,
                        background: HNH.navy50, padding: '2px 7px', borderRadius: 6,
                      }}>
                        {DAY_VI[d] ?? d}
                      </span>
                    ))}
                    {g.schedule.is_night_shift && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#6366f1',
                        background: '#eef2ff', padding: '2px 7px', borderRadius: 6,
                      }}>Ca đêm</span>
                    )}
                  </div>

                  {/* Time info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 8 }}>
                    <InfoChip label="Bắt đầu" value={g.schedule.start_time ?? '—'} color={HNH.success} />
                    <InfoChip label="Block ×15'" value={g.schedule.blocks != null ? `${g.schedule.blocks} block` : '—'} color={HNH.navy} />
                    <InfoChip label="Kết thúc" value={g.schedule.end_time ?? '—'} color={HNH.red} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${HNH.line}`, paddingTop: 8 }}>
                    <Icon name="clock" size={13} color={HNH.ink3} stroke={1.8} />
                    <span style={{ fontSize: 12, color: HNH.ink3 }}>Giờ làm tối thiểu tính công:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: HNH.ink }}>{g.schedule.minimum_working_hour || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: HNH.ink4, padding: '6px 0' }}>
              Chưa có lịch làm việc — vào Admin để cấu hình EmployeeShiftSchedule
            </div>
          )}

          {/* Grace time / clock validation */}
          <div style={{ background: HNH.cream, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Khoảng thời gian hợp lệ
            </div>
            {shift.grace_time ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <InfoChip
                    label="Chấm hợp lệ (±phút)"
                    value={`±${shift.grace_time.allowed_min} phút`}
                    color={HNH.warn}
                  />
                  <InfoChip
                    label="Thời gian grace"
                    value={shift.grace_time.allowed_time}
                    color={HNH.ink2}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11.5, color: HNH.ink3 }}>Tính đi trễ:</span>
                    <Pill text={shift.grace_time.clock_in ? 'Có' : 'Không'} active={shift.grace_time.clock_in} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11.5, color: HNH.ink3 }}>Tính về sớm:</span>
                    <Pill text={shift.grace_time.clock_out ? 'Có' : 'Không'} active={shift.grace_time.clock_out} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: HNH.ink4 }}>
                Chưa gắn Grace Time — chấm công dựa trên giờ ca chính xác
              </div>
            )}
          </div>

          {/* Summary chips: validity / late / leave */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{
              background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 10,
              padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 90,
            }}>
              <span style={{ fontSize: 10, color: HNH.ink4, fontWeight: 600 }}>TÍNH CÔNG</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: HNH.success }}>
                {repSched ? `≥ ${repSched.minimum_working_hour}` : '—'}
              </span>
              <span style={{ fontSize: 10, color: HNH.ink3 }}>mới hợp lệ</span>
            </div>
            <div style={{
              background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 10,
              padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 90,
            }}>
              <span style={{ fontSize: 10, color: HNH.ink4, fontWeight: 600 }}>ĐI TRỄ / VỀ SỚM</span>
              <Pill
                text={shift.grace_time?.clock_in || shift.grace_time?.clock_out ? 'Bật' : 'Tắt'}
                active={!!(shift.grace_time?.clock_in || shift.grace_time?.clock_out)}
              />
              <span style={{ fontSize: 10, color: HNH.ink3 }}>theo grace time</span>
            </div>
            <div style={{
              background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 10,
              padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 90,
            }}>
              <span style={{ fontSize: 10, color: HNH.ink4, fontWeight: 600 }}>TUẦN LÀM</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: HNH.navy }}>{shift.weekly_full_time || '—'}</span>
              <span style={{ fontSize: 10, color: HNH.ink3 }}>giờ/tuần chuẩn</span>
            </div>
          </div>

          {/* Department badges */}
          {shift.department_names.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: HNH.ink4, fontWeight: 600, marginBottom: 5 }}>PHÒNG BAN SỬ DỤNG</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {shift.department_names.map(name => (
                  <span key={name} style={{
                    fontSize: 11.5, padding: '3px 9px', borderRadius: 10,
                    background: HNH.navy50, color: HNH.navy, fontWeight: 600,
                  }}>{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, borderTop: `1px solid ${HNH.line}`, paddingTop: 10 }}>
            <button
              onClick={onEdit}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10,
                border: `1.5px solid ${HNH.line}`, background: '#fff',
                fontSize: 13, fontWeight: 600, color: HNH.ink2, cursor: 'pointer',
              }}
            >
              Sửa
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10,
                border: `1.5px solid ${HNH.red}20`, background: HNH.red50,
                fontSize: 13, fontWeight: 600, color: HNH.red,
                cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1,
              }}
            >
              Xoá
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shift Edit Modal ──────────────────────────────────────────────────────────

interface ShiftModalProps {
  departments: Department[]
  graceTimes: GraceTimeItem[]
  onClose: () => void
  onSaved: (newShiftId?: number) => void
  editing: ShiftInfo | null
}

type DaySchedForm = {
  enabled: boolean
  start_time: string
  end_time: string
  minimum_working_hour: string
  is_night_shift: boolean
}

function initDayForm(schedules: ShiftSchedule[]): Record<string, DaySchedForm> {
  const result: Record<string, DaySchedForm> = {}
  DAY_ORDER.forEach(day => {
    const ex = schedules.find(s => s.day === day)
    result[day] = {
      enabled: !!ex,
      start_time: ex?.start_time ?? '08:00',
      end_time: ex?.end_time ?? '17:00',
      minimum_working_hour: ex?.minimum_working_hour ?? '08:15',
      is_night_shift: ex?.is_night_shift ?? false,
    }
  })
  return result
}

function ShiftModal({ departments, graceTimes, onClose, onSaved, editing }: ShiftModalProps) {
  const { toast: showToast } = useToast()
  const [name, setName] = useState(editing?.name ?? '')
  const [weeklyFullTime, setWeeklyFullTime] = useState(editing?.weekly_full_time ?? '40:00')
  const [selectedDepts, setSelectedDepts] = useState<number[]>(editing?.department_ids ?? [])
  const [selectedGraceId, setSelectedGraceId] = useState<number | null>(editing?.grace_time?.id ?? null)
  const [scheduleForm, setScheduleForm] = useState<Record<string, DaySchedForm>>(
    editing ? initDayForm(editing.schedules) : {} as Record<string, DaySchedForm>
  )
  const [schedSection, setSchedSection] = useState(false)
  const [saving, setSaving] = useState(false)

  const toggleDept = (id: number) =>
    setSelectedDepts(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])

  const setDay = (day: string, patch: Partial<DaySchedForm>) =>
    setScheduleForm(f => ({ ...f, [day]: { ...f[day], ...patch } }))

  const handleSave = async () => {
    if (!name.trim()) { showToast('Vui lòng nhập tên ca'); return }
    setSaving(true)
    let shiftId: number | null = editing?.id ?? null
    try {
      if (editing) {
        await api.post('/api/employee/shift-categories/', {
          action: 'update_shift',
          shift_id: editing.id,
          name: name.trim(),
          weekly_full_time: weeklyFullTime || '40:00',
          grace_time_id: selectedGraceId,
          department_ids: selectedDepts,
        })
        // sync schedules
        const prevDays = new Set(editing.schedules.map(s => s.day))
        for (const day of DAY_ORDER) {
          const form = scheduleForm[day]
          if (!form) continue
          if (form.enabled) {
            await api.post('/api/employee/shift-categories/', {
              action: 'upsert_schedule',
              shift_id: shiftId,
              day,
              start_time: form.start_time,
              end_time: form.end_time,
              minimum_working_hour: form.minimum_working_hour,
              is_night_shift: form.is_night_shift,
            })
          } else if (prevDays.has(day)) {
            await api.post('/api/employee/shift-categories/', {
              action: 'delete_schedule',
              shift_id: shiftId,
              day,
            })
          }
        }
      } else {
        const res = await api.post<{ ok: boolean; id: number }>('/api/employee/shift-categories/', {
          action: 'create_shift',
          name: name.trim(),
          weekly_full_time: weeklyFullTime || '40:00',
          department_ids: selectedDepts,
        })
        shiftId = res.id
      }
      showToast(editing ? 'Đã cập nhật ca' : 'Đã tạo ca — mở để cấu hình lịch làm việc')
      onSaved(shiftId ?? undefined)
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi lưu ca')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 11,
    border: `1.5px solid ${HNH.line}`, fontSize: 13.5, color: HNH.ink,
    outline: 'none', boxSizing: 'border-box', background: '#fff',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '93vh', overflowY: 'auto', padding: '20px 18px 44px' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: HNH.ink }}>
            {editing ? `Sửa ca #${editing.id}` : 'Thêm ca làm việc'}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: HNH.cream, borderRadius: 10, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={15} color={HNH.ink3} stroke={2} />
          </button>
        </div>

        {/* Tên ca */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3, marginBottom: 5 }}>Tên ca</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Ca hành chính 8h–17h" style={inp} />
        </div>

        {/* Giờ tuần chuẩn */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3, marginBottom: 5 }}>Giờ làm chuẩn / tuần (HH:MM)</div>
          <input value={weeklyFullTime} onChange={e => setWeeklyFullTime(e.target.value)} placeholder="40:00" style={inp} />
        </div>

        {/* Grace Time selector — only when editing */}
        {editing && graceTimes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>Dung sai chấm công (Grace Time)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setSelectedGraceId(null)} style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${selectedGraceId === null ? HNH.navy : HNH.line}`, background: selectedGraceId === null ? HNH.navy50 : '#fff', color: selectedGraceId === null ? HNH.navy : HNH.ink3 }}>
                Không dùng
              </button>
              {graceTimes.map(gt => (
                <button key={gt.id} onClick={() => setSelectedGraceId(gt.id)} style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${selectedGraceId === gt.id ? HNH.navy : HNH.line}`, background: selectedGraceId === gt.id ? HNH.navy50 : '#fff', color: selectedGraceId === gt.id ? HNH.navy : HNH.ink3 }}>
                  ±{gt.allowed_min}'{gt.is_default ? ' ★' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Phòng ban */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>Phòng ban áp dụng</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {departments.map(d => {
              const active = selectedDepts.includes(d.id)
              return (
                <button key={d.id} onClick={() => toggleDept(d.id)} style={{ padding: '5px 11px', borderRadius: 20, cursor: 'pointer', border: `1.5px solid ${active ? HNH.red : HNH.line}`, background: active ? HNH.red50 : '#fff', color: active ? HNH.red : HNH.ink3, fontSize: 12, fontWeight: 600 }}>
                  {d.department}
                </button>
              )
            })}
          </div>
        </div>

        {/* Lịch làm việc theo ngày — only when editing */}
        {editing && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setSchedSection(s => !s)} style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${HNH.line}`, background: HNH.cream, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: schedSection ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="cal" size={15} color={HNH.navy} stroke={1.9} />
                <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>Lịch làm việc theo ngày</span>
                <span style={{ fontSize: 11, color: HNH.ink4 }}>({Object.values(scheduleForm).filter(f => f.enabled).length}/7 ngày)</span>
              </div>
              <Icon name={schedSection ? 'chev-u' : 'chev-d'} size={15} color={HNH.ink4} stroke={2} />
            </button>

            {schedSection && (
              <div style={{ border: `1.5px solid ${HNH.line}`, borderRadius: 12, overflow: 'hidden' }}>
                {DAY_ORDER.map((day, idx) => {
                  const form = scheduleForm[day]
                  if (!form) return null
                  return (
                    <div key={day} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${HNH.line}`, padding: '10px 12px', background: form.enabled ? '#fff' : HNH.cream }}>
                      {/* Day header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.enabled ? 10 : 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, minWidth: 28, textAlign: 'center', padding: '3px 7px', borderRadius: 7, background: form.enabled ? HNH.navy50 : HNH.line, color: form.enabled ? HNH.navy : HNH.ink4 }}>
                          {DAY_VI[day]}
                        </span>
                        <span style={{ flex: 1, fontSize: 12.5, color: form.enabled ? HNH.ink : HNH.ink4 }}>
                          {form.enabled ? `${form.start_time} → ${form.end_time}${form.is_night_shift ? ' 🌙' : ''}` : 'Không làm'}
                        </span>
                        <Toggle value={form.enabled} onChange={v => setDay(day, { enabled: v })} />
                      </div>

                      {/* Expanded inputs */}
                      {form.enabled && (
                        <div style={{ paddingLeft: 36, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 10.5, color: HNH.ink4, fontWeight: 600, marginBottom: 4 }}>BẮT ĐẦU</div>
                              <input type="time" value={form.start_time} onChange={e => setDay(day, { start_time: e.target.value })} style={{ ...inp, padding: '7px 9px', fontSize: 13 }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 10.5, color: HNH.ink4, fontWeight: 600, marginBottom: 4 }}>KẾT THÚC</div>
                              <input type="time" value={form.end_time} onChange={e => setDay(day, { end_time: e.target.value })} style={{ ...inp, padding: '7px 9px', fontSize: 13 }} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'flex-end' }}>
                            <div>
                              <div style={{ fontSize: 10.5, color: HNH.ink4, fontWeight: 600, marginBottom: 4 }}>TÍNH CÔNG TỐI THIỂU (HH:MM)</div>
                              <input value={form.minimum_working_hour} onChange={e => setDay(day, { minimum_working_hour: e.target.value })} placeholder="08:15" style={{ ...inp, padding: '7px 9px', fontSize: 13 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 2 }}>
                              <span style={{ fontSize: 10, color: HNH.ink4, fontWeight: 600 }}>CA ĐÊM</span>
                              <Toggle value={form.is_night_shift} onChange={v => setDay(day, { is_night_shift: v })} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `1.5px solid ${HNH.line}`, background: '#fff', fontSize: 14, fontWeight: 600, color: HNH.ink2, cursor: 'pointer' }}>Huỷ</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: HNH.red, fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Đang lưu...' : (editing ? 'Cập nhật' : 'Thêm ca')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shift Categories Section ───────────────────────────────────────────────────

function ShiftCategoriesSection() {
  const { toast: showToast } = useToast()
  const [data, setData] = useState<ShiftCategoriesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ShiftInfo | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    if (!expanded) return
    setLoading(true)
    try {
      const res = await api.get<ShiftCategoriesData>('/api/employee/shift-categories/')
      setData(res)
    } catch {
      showToast('Không thể tải danh sách ca')
    } finally {
      setLoading(false)
    }
  }, [expanded, showToast])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (shiftId: number) => {
    if (!confirm('Xoá ca này? Thao tác không thể hoàn tác.')) return
    setDeleting(shiftId)
    try {
      await api.post('/api/employee/shift-categories/', { action: 'delete_shift', shift_id: shiftId })
      showToast('Đã xoá ca')
      loadData()
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi xoá ca')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <SettingCard>
        <SettingRow
          icon="clock"
          label="Quản lý Danh mục Ca"
          detail={data ? `${data.shifts.length} ca đang hoạt động` : 'Xem chi tiết và phân quyền phòng ban sử dụng ca'}
          tone="red"
          last={!expanded}
          onClick={() => setExpanded(e => !e)}
          trailing={
            <Icon name={expanded ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink4} stroke={2} />
          }
        />

        {expanded && (
          <div style={{ borderTop: `1px solid ${HNH.line}` }}>
            {/* Add button */}
            <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setEditing(null); setModalOpen(true) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10,
                  border: 'none', background: HNH.red, color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={14} color="#fff" stroke={2.5} />
                Thêm ca
              </button>
            </div>

            {loading && (
              <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 22, height: 22, border: `3px solid ${HNH.line}`, borderTopColor: HNH.red, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}

            {!loading && data && data.shifts.length === 0 && (
              <div style={{ padding: '16px 14px', fontSize: 13, color: HNH.ink3, textAlign: 'center' }}>
                Chưa có ca nào. Bấm "Thêm ca" để tạo mới.
              </div>
            )}

            {!loading && data && data.shifts.map(shift => (
              <ShiftDetailCard
                key={shift.id}
                shift={shift}
                onEdit={() => { setEditing(shift); setModalOpen(true) }}
                onDelete={() => handleDelete(shift.id)}
                deleting={deleting === shift.id}
              />
            ))}
          </div>
        )}
      </SettingCard>

      {modalOpen && (
        <ShiftModal
          departments={data?.departments ?? []}
          graceTimes={data?.grace_times ?? []}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={async (newShiftId) => {
            setModalOpen(false)
            await loadData()
            // Auto-open edit for newly created shift
            if (!editing && newShiftId) {
              setData(prev => {
                if (!prev) return prev
                const newShift = prev.shifts.find(s => s.id === newShiftId)
                if (newShift) {
                  setTimeout(() => { setEditing(newShift); setModalOpen(true) }, 100)
                }
                return prev
              })
            }
          }}
        />
      )}
    </>
  )
}

// ── Attendance Config Types ───────────────────────────────────────────────────

interface ValidationCondition {
  id: number
  validation_at_work: string
  minimum_overtime_to_approve: string
  overtime_cutoff: string
  auto_approve_ot: boolean
}

interface GraceTimeItem {
  id: number
  allowed_time: string
  allowed_min: number
  clock_in: boolean
  clock_out: boolean
  is_default: boolean
}

interface LateEarlyConfig {
  late_come_enabled: boolean
  early_out_enabled: boolean
  late_early_deduct_leave: boolean
}

interface AttendanceConfigData {
  validation_condition: ValidationCondition | null
  grace_times: GraceTimeItem[]
  late_early_config: LateEarlyConfig
}

// ── Điều kiện xác nhận công ───────────────────────────────────────────────────

function ValidationConditionSection() {
  const { toast: showToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ validation_at_work: '', minimum_overtime_to_approve: '', overtime_cutoff: '', auto_approve_ot: false })

  const load = useCallback(async () => {
    if (!expanded) return
    setLoading(true)
    try {
      const res = await api.get<AttendanceConfigData>('/api/employee/attendance-config/')
      const vc = res.validation_condition
      if (vc) setForm({ validation_at_work: vc.validation_at_work, minimum_overtime_to_approve: vc.minimum_overtime_to_approve, overtime_cutoff: vc.overtime_cutoff, auto_approve_ot: vc.auto_approve_ot })
    } catch { showToast('Không thể tải cấu hình') }
    finally { setLoading(false) }
  }, [expanded, showToast])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch('/api/employee/attendance-config/', { section: 'validation', ...form })
      showToast('Đã lưu')
      load()
    } catch { showToast('Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const field = (label: string, key: keyof typeof form, placeholder: string, hint: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 4 }}>{label}</div>
      <input
        value={form[key] as string}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${HNH.line}`, fontSize: 14, color: HNH.ink, outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: 11, color: HNH.ink4, marginTop: 3 }}>{hint}</div>
    </div>
  )

  return (
    <SettingCard>
      <SettingRow
        icon="check" label="Điều kiện xác nhận công" tone="navy"
        detail="Ngưỡng giờ làm tự duyệt, OT tối thiểu, OT cutoff"
        last={!expanded}
        onClick={() => setExpanded(e => !e)}
        trailing={<Icon name={expanded ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink4} stroke={2} />}
      />
      {expanded && (
        <div style={{ padding: '4px 14px 16px', borderTop: `1px solid ${HNH.line}` }}>
          {loading ? (
            <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 22, height: 22, border: `3px solid ${HNH.line}`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              <div style={{ marginTop: 12 }}>
                {field('Giờ làm tự động duyệt (HH:MM)', 'validation_at_work', 'VD: 09:00', 'Chấm công đủ X giờ → tự động duyệt hợp lệ')}
                {field('OT tối thiểu để duyệt (HH:MM)', 'minimum_overtime_to_approve', 'VD: 00:30', 'Tăng ca ít hơn mức này sẽ không được tính OT')}
                {field('OT tối đa (cutoff) (HH:MM)', 'overtime_cutoff', 'VD: 02:00', 'Cắt OT vượt quá giới hạn này trong một ca')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 12px', background: HNH.cream, borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>Tự động duyệt OT</div>
                  <div style={{ fontSize: 11.5, color: HNH.ink3 }}>OT đủ điều kiện sẽ tự duyệt, không cần HR</div>
                </div>
                <Toggle value={form.auto_approve_ot} onChange={v => setForm(f => ({ ...f, auto_approve_ot: v }))} />
              </div>
              <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '11px 0', borderRadius: 11, border: 'none', background: HNH.navy, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </>
          )}
        </div>
      )}
    </SettingCard>
  )
}

// ── Quản lý Grace Time ────────────────────────────────────────────────────────

interface GraceTimeModalProps {
  editing: GraceTimeItem | null
  onClose: () => void
  onSaved: () => void
}

function GraceTimeModal({ editing, onClose, onSaved }: GraceTimeModalProps) {
  const { toast: showToast } = useToast()
  const [mins, setMins] = useState(editing?.allowed_min ?? 15)
  const [clockIn, setClockIn] = useState(editing?.clock_in ?? true)
  const [clockOut, setClockOut] = useState(editing?.clock_out ?? false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (mins <= 0) { showToast('Số phút phải > 0'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.post('/api/employee/attendance-config/', { section: 'grace_time', action: 'update_grace', grace_id: editing.id, allowed_min: mins, clock_in: clockIn, clock_out: clockOut })
      } else {
        await api.post('/api/employee/attendance-config/', { section: 'grace_time', action: 'create_grace', allowed_min: mins, clock_in: clockIn, clock_out: clockOut })
      }
      showToast(editing ? 'Đã cập nhật' : 'Đã thêm grace time')
      onSaved()
    } catch (e: any) { showToast(e?.message ?? 'Lỗi') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '24px 20px 40px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 17, color: HNH.ink, marginBottom: 18 }}>
          {editing ? 'Sửa Grace Time' : 'Thêm Grace Time'}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>Số phút dung sai (±)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMins(m => Math.max(1, m - 5))} style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${HNH.line}`, background: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: 800, color: HNH.ink }}>{mins} phút</div>
            <button onClick={() => setMins(m => m + 5)} style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${HNH.line}`, background: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
          </div>
          <input type="range" min={1} max={120} value={mins} onChange={e => setMins(Number(e.target.value))} style={{ width: '100%', marginTop: 8 }} />
        </div>

        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: HNH.cream, borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>Tính đi trễ (Clock-in)</div>
              <div style={{ fontSize: 11.5, color: HNH.ink3 }}>Đến muộn hơn {mins}' → đánh dấu đi trễ</div>
            </div>
            <Toggle value={clockIn} onChange={setClockIn} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: HNH.cream, borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>Tính về sớm (Clock-out)</div>
              <div style={{ fontSize: 11.5, color: HNH.ink3 }}>Ra về sớm hơn {mins}' → đánh dấu về sớm</div>
            </div>
            <Toggle value={clockOut} onChange={setClockOut} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `1.5px solid ${HNH.line}`, background: '#fff', fontSize: 14, fontWeight: 600, color: HNH.ink2, cursor: 'pointer' }}>Huỷ</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: HNH.red, fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Đang lưu...' : (editing ? 'Cập nhật' : 'Thêm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function GraceTimeSection() {
  const { toast: showToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<GraceTimeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GraceTimeItem | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [settingDefault, setSettingDefault] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!expanded) return
    setLoading(true)
    try {
      const res = await api.get<AttendanceConfigData>('/api/employee/attendance-config/')
      setItems(res.grace_times)
    } catch { showToast('Không thể tải grace time') }
    finally { setLoading(false) }
  }, [expanded, showToast])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: number) => {
    if (!confirm('Xoá grace time này?')) return
    setDeleting(id)
    try {
      await api.post('/api/employee/attendance-config/', { section: 'grace_time', action: 'delete_grace', grace_id: id })
      showToast('Đã xoá')
      load()
    } catch (e: any) { showToast(e?.message ?? 'Không thể xoá') }
    finally { setDeleting(null) }
  }

  const handleSetDefault = async (id: number) => {
    setSettingDefault(id)
    try {
      await api.post('/api/employee/attendance-config/', { section: 'grace_time', action: 'set_default_grace', grace_id: id })
      showToast('Đã đặt mặc định')
      load()
    } catch { showToast('Lỗi') }
    finally { setSettingDefault(null) }
  }

  return (
    <>
      <SettingCard>
        <SettingRow
          icon="clock" label="Grace Time" tone="warn"
          detail={items.length > 0 ? `${items.length} khoảng dung sai đang cấu hình` : 'Khoảng ±phút cho phép khi chấm công'}
          last={!expanded}
          onClick={() => setExpanded(e => !e)}
          trailing={<Icon name={expanded ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink4} stroke={2} />}
        />
        {expanded && (
          <div style={{ borderTop: `1px solid ${HNH.line}` }}>
            <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setEditing(null); setModalOpen(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: 'none', background: HNH.warn, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Icon name="plus" size={14} color="#fff" stroke={2.5} />
                Thêm
              </button>
            </div>
            {loading && <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}><div style={{ width: 22, height: 22, border: `3px solid ${HNH.line}`, borderTopColor: HNH.warn, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}
            {!loading && items.length === 0 && <div style={{ padding: '12px 14px', fontSize: 13, color: HNH.ink3, textAlign: 'center' }}>Chưa có grace time nào</div>}
            {!loading && items.map((g, idx) => (
              <div key={g.id} style={{ padding: '10px 14px', borderTop: idx === 0 ? 'none' : `1px solid ${HNH.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: HNH.warn }}>±{g.allowed_min}'</span>
                    {g.is_default && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: HNH.success50, color: HNH.success }}>Mặc định</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: g.clock_in ? '#ecfdf5' : HNH.cream, color: g.clock_in ? HNH.success : HNH.ink4, fontWeight: 600 }}>
                      {g.clock_in ? '✓' : '✗'} Đi trễ
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: g.clock_out ? '#ecfdf5' : HNH.cream, color: g.clock_out ? HNH.success : HNH.ink4, fontWeight: 600 }}>
                      {g.clock_out ? '✓' : '✗'} Về sớm
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  {!g.is_default && (
                    <button onClick={() => handleSetDefault(g.id)} disabled={settingDefault === g.id} style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${HNH.success}`, background: HNH.success50, fontSize: 11, fontWeight: 600, color: HNH.success, cursor: 'pointer' }}>
                      {settingDefault === g.id ? '...' : 'Mặc định'}
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => { setEditing(g); setModalOpen(true) }} style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${HNH.line}`, background: '#fff', fontSize: 11, fontWeight: 600, color: HNH.ink2, cursor: 'pointer' }}>Sửa</button>
                    <button onClick={() => handleDelete(g.id)} disabled={deleting === g.id || g.is_default} style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${HNH.red}30`, background: HNH.red50, fontSize: 11, fontWeight: 600, color: HNH.red, cursor: (deleting === g.id || g.is_default) ? 'not-allowed' : 'pointer', opacity: g.is_default ? 0.4 : 1 }}>Xoá</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingCard>
      {modalOpen && <GraceTimeModal editing={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load() }} />}
    </>
  )
}

// ── Đi trễ / Về sớm ──────────────────────────────────────────────────────────

function LateEarlySection() {
  const { toast: showToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [config, setConfig] = useState<LateEarlyConfig>({ late_come_enabled: true, early_out_enabled: true, late_early_deduct_leave: false })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!expanded) return
    setLoading(true)
    try {
      const res = await api.get<AttendanceConfigData>('/api/employee/attendance-config/')
      setConfig(res.late_early_config)
    } catch { showToast('Không thể tải cấu hình') }
    finally { setLoading(false) }
  }, [expanded, showToast])

  useEffect(() => { load() }, [load])

  const patch = async (key: keyof LateEarlyConfig, value: boolean) => {
    setSaving(key)
    try {
      await api.patch('/api/employee/attendance-config/', { section: 'late_early', [key]: value })
      setConfig(c => ({ ...c, [key]: value }))
      showToast('Đã lưu')
    } catch { showToast('Lỗi khi lưu') }
    finally { setSaving(null) }
  }

  const configRows: { key: keyof LateEarlyConfig; label: string; detail: string; tone: 'red' | 'warn' | 'success' }[] = [
    { key: 'late_come_enabled', label: 'Theo dõi đi trễ', detail: 'Ghi nhận khi nhân viên clock-in sau giờ ca bắt đầu', tone: 'warn' },
    { key: 'early_out_enabled', label: 'Theo dõi về sớm', detail: 'Ghi nhận khi nhân viên clock-out trước giờ ca kết thúc', tone: 'warn' },
    { key: 'late_early_deduct_leave', label: 'Trừ phép theo giờ', detail: 'Đi trễ / về sớm → tự động trừ số giờ tương ứng vào số dư phép', tone: 'red' },
  ]

  return (
    <SettingCard>
      <SettingRow
        icon="clock" label="Đi trễ / Về sớm" tone="red"
        detail="Cấu hình theo dõi và chính sách đi trễ/về sớm"
        last={!expanded}
        onClick={() => setExpanded(e => !e)}
        trailing={<Icon name={expanded ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink4} stroke={2} />}
      />
      {expanded && (
        <div style={{ borderTop: `1px solid ${HNH.line}` }}>
          {loading ? (
            <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}><div style={{ width: 22, height: 22, border: `3px solid ${HNH.line}`, borderTopColor: HNH.red, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>
          ) : (
            configRows.map((row, idx) => (
              <div key={row.key} style={{ padding: '12px 14px', borderTop: idx === 0 ? 'none' : `1px solid ${HNH.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: HNH.ink }}>{row.label}</div>
                  <div style={{ fontSize: 11.5, color: HNH.ink3, marginTop: 2 }}>{row.detail}</div>
                </div>
                <Toggle value={config[row.key]} onChange={v => patch(row.key, v)} disabled={saving === row.key} />
              </div>
            ))
          )}
          {!loading && (
            <div style={{ padding: '10px 14px', borderTop: `1px solid ${HNH.line}`, background: HNH.cream }}>
              <div style={{ fontSize: 11.5, color: HNH.ink3, lineHeight: 1.5 }}>
                <strong>Lưu ý:</strong> Ngưỡng phút dung sai được cấu hình per-ca qua <strong>Grace Time</strong> ở trên.
                Mặc định hệ thống so sánh giờ clock-in/out với giờ bắt đầu/kết thúc ca chính xác.
              </div>
            </div>
          )}
        </div>
      )}
    </SettingCard>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

// ── Thiết lập Wifi Chấm công (Admin hệ thống) ────────────────────────────────

interface WifiRange { id: number; label: string; ip_cidr: string; is_active: boolean; note: string }
interface WifiRangesData { ranges: WifiRange[]; my_ip: string; is_admin: boolean }

function WifiAttendanceSection() {
  const { toast: showToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<WifiRangesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const [cidr, setCidr] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!expanded) return
    setLoading(true)
    try { setData(await api.get<WifiRangesData>('/api/attendance/wifi-ranges/')) }
    catch { showToast('Không tải được cấu hình WiFi') }
    finally { setLoading(false) }
  }, [expanded, showToast])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!label.trim() || !cidr.trim()) { showToast('Nhập tên WiFi và dải IP'); return }
    setSaving(true)
    try {
      await api.post('/api/attendance/wifi-ranges/', { label: label.trim(), ip_cidr: cidr.trim() })
      setLabel(''); setCidr(''); showToast('Đã thêm dải WiFi'); load()
    } catch (e: any) { showToast(e?.message ?? 'Lỗi khi thêm dải IP') }
    finally { setSaving(false) }
  }
  const toggleActive = async (r: WifiRange) => {
    setBusy(r.id)
    try { await api.put(`/api/attendance/wifi-ranges/${r.id}/`, { is_active: !r.is_active }); load() }
    catch { showToast('Lỗi') } finally { setBusy(null) }
  }
  const remove = async (r: WifiRange) => {
    if (!confirm(`Xoá dải "${r.label}" (${r.ip_cidr})?`)) return
    setBusy(r.id)
    try { await api.del(`/api/attendance/wifi-ranges/${r.id}/`); load() }
    catch { showToast('Lỗi khi xoá') } finally { setBusy(null) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${HNH.line}`,
    fontSize: 13.5, color: HNH.ink, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <SettingCard>
      <SettingRow
        icon="pin" label="Thiết lập Wifi Chấm công" tone="navy"
        detail="Dải IP WiFi văn phòng cho phép chấm công khi GPS lỗi"
        last={!expanded}
        onClick={() => setExpanded(e => !e)}
        trailing={<Icon name={expanded ? 'chev-u' : 'chev-d'} size={16} color={HNH.ink4} stroke={2} />}
      />
      {expanded && (
        <div style={{ borderTop: `1px solid ${HNH.line}`, padding: '12px 14px' }}>
          {loading ? (
            <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 22, height: 22, border: `3px solid ${HNH.line}`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {data && !data.is_admin && (
                <div style={{ fontSize: 12, color: HNH.warn, marginBottom: 10, fontWeight: 600 }}>
                  Chỉ Admin hệ thống mới sửa được. Bạn đang xem ở chế độ chỉ đọc.
                </div>
              )}
              <div style={{ fontSize: 11.5, color: HNH.ink3, marginBottom: 8, lineHeight: 1.5 }}>
                Khi GPS lỗi, nếu IP công cộng của điện thoại nằm trong 1 dải đang bật → cho phép chấm công (đánh dấu <strong>App Wifi</strong>). IP hiện tại của bạn: <strong style={{ color: HNH.navy }}>{data?.my_ip || '—'}</strong>
              </div>

              {/* Form thêm */}
              {data?.is_admin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, background: HNH.cream, borderRadius: 12, padding: 10 }}>
                  <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Tên WiFi / Văn phòng (VD: WiFi VP Lê Thánh Tôn)" style={inp} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={cidr} onChange={e => setCidr(e.target.value)} placeholder="Dải IP: 123.45.67.0/24 hoặc IP đơn" style={{ ...inp, flex: 1 }} />
                    <button onClick={() => setCidr(data?.my_ip || '')} title="Lấy IP hiện tại của bạn"
                      style={{ padding: '0 12px', borderRadius: 10, border: `1.5px solid ${HNH.navy}`, background: HNH.navy50, color: HNH.navy, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Lấy IP
                    </button>
                  </div>
                  <button onClick={add} disabled={saving}
                    style={{ padding: '10px 0', borderRadius: 10, border: 'none', background: HNH.navy, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Đang thêm...' : '+ Thêm dải WiFi'}
                  </button>
                </div>
              )}

              {/* Danh sách */}
              {(data?.ranges ?? []).length === 0 && (
                <div style={{ fontSize: 12.5, color: HNH.ink4, textAlign: 'center', padding: '10px 0' }}>Chưa có dải WiFi nào.</div>
              )}
              {(data?.ranges ?? []).map((r, idx) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderTop: idx === 0 ? 'none' : `1px solid ${HNH.line}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: HNH.navy, fontFamily: 'monospace' }}>{r.ip_cidr}</div>
                  </div>
                  {data?.is_admin ? (
                    <>
                      <Toggle value={r.is_active} onChange={() => toggleActive(r)} disabled={busy === r.id} />
                      <button onClick={() => remove(r)} disabled={busy === r.id}
                        style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: HNH.red50, cursor: 'pointer' }}>
                        <Icon name="trash" size={15} color={HNH.red} stroke={2} />
                      </button>
                    </>
                  ) : (
                    <Pill text={r.is_active ? 'Đang bật' : 'Tắt'} active={r.is_active} />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </SettingCard>
  )
}

export function AttendanceSettingsPage() {
  const navigate = useNavigate()
  const { toast: showToast } = useToast()
  const [hrmConfig, setHrmConfig] = useState<HRMConfigData | null>(null)
  const [hrmSaving, setHrmSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<HRMConfigData>('/api/base/hrm-config/')
      .then(data => { setHrmConfig(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const patchHRMConfig = async (key: string, value: boolean) => {
    if (!hrmConfig) return
    setHrmSaving(key)
    try {
      await api.patch('/api/base/hrm-config/', { [key]: value })
      setHrmConfig(prev => prev ? { ...prev, [key]: value } : prev)
      showToast('Đã lưu cấu hình')
    } catch {
      showToast('Lỗi khi lưu cấu hình')
    } finally {
      setHrmSaving(null)
    }
  }

  if (loading) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Cài đặt Chấm công" onBack={() => navigate(-1)} />
        <div className="flex items-center justify-center" style={{ paddingTop: 80 }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${HNH.line}`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </div>
    )
  }

  if (!hrmConfig?.is_hr) {
    return (
      <div style={{ background: HNH.cream, minHeight: '100%' }}>
        <TopBar title="Cài đặt Chấm công" onBack={() => navigate(-1)} />
        <div className="flex flex-col items-center justify-center gap-3" style={{ padding: '80px 32px 0' }}>
          <Icon name="shield" size={40} color={HNH.ink4} stroke={1.5} />
          <div style={{ fontSize: 14, color: HNH.ink3, fontWeight: 600, textAlign: 'center' }}>
            Bạn không có quyền truy cập trang cài đặt này
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar title="Cài đặt Chấm công" onBack={() => navigate(-1)} />

      <div style={{ padding: '0 16px 32px', maxWidth: 600, margin: '0 auto' }}>

        <SectionTitle title="Geofence & Phê duyệt" />
        <SettingCard>
          <SettingRow
            icon="shield"
            label="Duyệt khi chấm công ngoài VP"
            detail={
              hrmConfig.geo_approval_required
                ? 'Bật — check-in ngoài VP cần quản lý duyệt'
                : 'Tắt — chấm công ngoài VP được tự động hợp lệ'
            }
            tone={hrmConfig.geo_approval_required ? 'warn' : 'success'}
            last
            onClick={hrmSaving !== 'geo_approval_required' ? () => patchHRMConfig('geo_approval_required', !hrmConfig.geo_approval_required) : undefined}
            trailing={
              <Toggle
                value={hrmConfig.geo_approval_required}
                onChange={v => patchHRMConfig('geo_approval_required', v)}
                disabled={hrmSaving === 'geo_approval_required'}
              />
            }
          />
        </SettingCard>

        <SectionTitle title="Danh mục Ca làm việc" />
        <ShiftCategoriesSection />

        <SectionTitle title="Điều kiện xác nhận công" />
        <ValidationConditionSection />

        <SectionTitle title="Grace Time" />
        <GraceTimeSection />

        <SectionTitle title="Đi trễ / Về sớm" />
        <LateEarlySection />

        <SectionTitle title="Thiết lập Wifi Chấm công" />
        <WifiAttendanceSection />

        <SectionTitle title="Thông tin" />
        <SettingCard>
          <SettingRow icon="info" label="Module" detail="HRM · Chấm công (hrm-att-setting)" last />
        </SettingCard>

      </div>
    </div>
  )
}
