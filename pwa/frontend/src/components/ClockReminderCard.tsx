import { useState, useEffect } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'
import { useToast } from './ui/Toast'
import { api } from '../lib/api'

// Nhắc chấm công (role Nhân viên): tối đa 4 mốc/ngày, phút chia hết 10, giờ 0-23.
// Card đặt trên trang Chấm công. Tự fetch/lưu qua /api/employee/me/personal-settings/.

interface PersonalSettings {
  clock_reminder_enabled: boolean
  clock_reminder_times: string[]
  [k: string]: unknown
}

const MINUTE_OPTS = ['00', '10', '20', '30', '40', '50']
const HOUR_OPTS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MAX_REMINDERS = 4

// Mốc mới = giờ TRỐNG kế tiếp (không trùng mốc đã có). Backend dedup nên nếu mặc
// định luôn 08:00 thì thêm mốc thứ 2 sẽ bị gộp mất → "không thêm được giờ".
function nextFreeTime(times: string[]): string {
  const used = new Set(times)
  const startH = times.length
    ? (Math.max(...times.map(t => parseInt(t.split(':')[0], 10) || 0)) + 1) % 24
    : 8
  for (let i = 0; i < 24; i++) {
    const h = (startH + i) % 24
    const cand = `${String(h).padStart(2, '0')}:00`
    if (!used.has(cand)) return cand
  }
  return '08:00'
}

function Switch({ on, busy, onClick }: { on: boolean; busy?: boolean; onClick: () => void }) {
  const w = 46, h = 26, knob = h - 6
  return (
    <button onClick={onClick} disabled={busy} className="border-none shrink-0"
      style={{
        width: w, height: h, padding: 0, position: 'relative', borderRadius: h / 2,
        cursor: busy ? 'default' : 'pointer', background: on ? HNH.success : HNH.ink4,
        opacity: busy ? 0.6 : 1, transition: 'background .15s',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? w - knob - 3 : 3, width: knob, height: knob,
        borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

export function ClockReminderCard() {
  const { toast } = useToast()
  const [s, setS] = useState<PersonalSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<PersonalSettings>('/api/employee/me/personal-settings/')
      .then(setS)
      .catch(() => { /* im lặng — card chỉ ẩn phần điều khiển */ })
  }, [])

  const putSettings = async (patch: Partial<PersonalSettings>, optimistic: PersonalSettings) => {
    const prev = s
    setS(optimistic)
    setBusy(true)
    try {
      const res = await api.put<PersonalSettings>('/api/employee/me/personal-settings/', patch)
      setS(res)
    } catch (e) {
      setS(prev)  // revert
      toast((e as { message?: string })?.message || 'Lưu thất bại, thử lại')
    } finally {
      setBusy(false)
    }
  }

  const toggleEnabled = () => {
    if (!s || busy) return
    const next = !s.clock_reminder_enabled
    putSettings({ clock_reminder_enabled: next }, { ...s, clock_reminder_enabled: next })
  }

  const saveTimes = (times: string[]) => {
    if (!s || busy) return
    putSettings({ clock_reminder_times: times }, { ...s, clock_reminder_times: times })
  }

  const times = s?.clock_reminder_times ?? []
  const setSlot = (idx: number, next: string) => {
    if (times.some((t, i) => i !== idx && t === next)) { toast('Mốc giờ này đã có, chọn giờ khác'); return }
    const c = [...times]; c[idx] = next; saveTimes(c)
  }
  const addSlot = () => { if (times.length < MAX_REMINDERS) saveTimes([...times, nextFreeTime(times)]) }
  const removeSlot = (idx: number) => saveTimes(times.filter((_, i) => i !== idx))

  const selStyle: React.CSSProperties = {
    padding: '7px 8px', borderRadius: 9, border: `1.5px solid ${HNH.line}`,
    fontSize: 15, fontWeight: 700, color: HNH.ink, background: '#fff', outline: 'none',
  }

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${HNH.line}`, overflow: 'hidden' }}>
      <div className="flex items-start gap-3" style={{ padding: '14px 14px' }}>
        <div className="flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 11, background: HNH.navy50 }}>
          <Icon name="bell" size={18} color={HNH.navy} stroke={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14.5, fontWeight: 700, color: HNH.ink }}>Nhắc chấm công</div>
          <div style={{ fontSize: 12, color: HNH.ink3, marginTop: 2, lineHeight: 1.4 }}>
            Tự động nhắc đến giờ chấm công theo mốc bạn đặt (tối đa {MAX_REMINDERS} mốc/ngày).
          </div>
        </div>
        <div style={{ paddingTop: 4 }}>
          <Switch on={!!s?.clock_reminder_enabled} busy={busy || s === null} onClick={toggleEnabled} />
        </div>
      </div>

      {s?.clock_reminder_enabled && (
        <div style={{ padding: '0 14px 14px 54px', borderTop: `1px solid ${HNH.line}` }}>
          <div style={{ height: 10 }} />
          {times.length === 0 && (
            <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 8 }}>
              Chưa có mốc nào. Thêm mốc giờ để được nhắc chấm công.
            </div>
          )}
          {times.map((t, idx) => {
            const [hh = '08', mm = '00'] = (t || '').split(':')
            return (
              <div key={idx} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <select value={hh} disabled={busy} onChange={e => setSlot(idx, `${e.target.value}:${mm}`)} style={selStyle}>
                  {HOUR_OPTS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ fontWeight: 800, color: HNH.ink3 }}>:</span>
                <select value={MINUTE_OPTS.includes(mm) ? mm : '00'} disabled={busy} onChange={e => setSlot(idx, `${hh}:${e.target.value}`)} style={selStyle}>
                  {MINUTE_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={() => removeSlot(idx)} disabled={busy} className="border-none cursor-pointer"
                  style={{ width: 32, height: 32, borderRadius: 9, background: HNH.red50, marginLeft: 'auto' }}>
                  <Icon name="trash" size={15} color={HNH.red} stroke={2} />
                </button>
              </div>
            )
          })}
          {times.length < MAX_REMINDERS && (
            <button onClick={addSlot} disabled={busy} className="border-none cursor-pointer flex items-center gap-1.5"
              style={{ padding: '7px 12px', borderRadius: 9, background: HNH.navy50, color: HNH.navy, fontSize: 13, fontWeight: 700, marginTop: 2 }}>
              <Icon name="plus" size={14} color={HNH.navy} stroke={2.5} /> Thêm mốc ({times.length}/{MAX_REMINDERS})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
