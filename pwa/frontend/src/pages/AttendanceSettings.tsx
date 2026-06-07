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
  onClose: () => void
  onSaved: () => void
  editing: ShiftInfo | null
}

function ShiftModal({ departments, onClose, onSaved, editing }: ShiftModalProps) {
  const { toast: showToast } = useToast()
  const [name, setName] = useState(editing?.name ?? '')
  const [selectedDepts, setSelectedDepts] = useState<number[]>(editing?.department_ids ?? [])
  const [saving, setSaving] = useState(false)

  const toggleDept = (id: number) =>
    setSelectedDepts(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])

  const handleSave = async () => {
    if (!name.trim()) { showToast('Vui lòng nhập tên ca'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.post('/api/employee/shift-categories/', {
          action: 'update_shift', shift_id: editing.id, name: name.trim(), department_ids: selectedDepts,
        })
      } else {
        await api.post('/api/employee/shift-categories/', {
          action: 'create_shift', name: name.trim(), department_ids: selectedDepts,
        })
      }
      showToast(editing ? 'Đã cập nhật ca' : 'Đã thêm ca mới')
      onSaved()
    } catch (e: any) {
      showToast(e?.message ?? 'Lỗi khi lưu ca')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0', width: '100%',
          maxHeight: '85vh', overflowY: 'auto', padding: '24px 20px 40px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 17, color: HNH.ink, marginBottom: 6 }}>
          {editing ? `Sửa ca — #${editing.id}` : 'Thêm ca làm việc'}
        </div>
        {editing && (
          <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 14 }}>
            Để cấu hình giờ bắt đầu/kết thúc và grace time, vào Admin → Base → Employee Shift
          </div>
        )}
        {!editing && (
          <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 14 }}>
            Sau khi tạo, vào Admin → Base → Employee Shift để cấu hình lịch và grace time
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 6 }}>Tên ca</div>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Ví dụ: Ca hành chính 8h-17h"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 12,
              border: `1.5px solid ${HNH.line}`, fontSize: 14, color: HNH.ink,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: HNH.ink3, marginBottom: 8 }}>
            Phòng ban được dùng ca này
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {departments.map(d => {
              const active = selectedDepts.includes(d.id)
              return (
                <button key={d.id} onClick={() => toggleDept(d.id)} style={{
                  padding: '6px 12px', borderRadius: 20,
                  border: `1.5px solid ${active ? HNH.red : HNH.line}`,
                  background: active ? HNH.red50 : '#fff',
                  color: active ? HNH.red : HNH.ink2,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}>
                  {d.department}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            border: `1.5px solid ${HNH.line}`, background: '#fff',
            fontSize: 14, fontWeight: 600, color: HNH.ink2, cursor: 'pointer',
          }}>Huỷ</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 2, padding: '12px 0', borderRadius: 12,
            border: 'none', background: HNH.red,
            fontSize: 14, fontWeight: 700, color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
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
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); loadData() }}
        />
      )}
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

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

        <SectionTitle title="Thông tin" />
        <SettingCard>
          <SettingRow icon="info" label="Module" detail="HRM · Chấm công (hrm-att-setting)" last />
        </SettingCard>

      </div>
    </div>
  )
}
