import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { useAuth } from '../lib/auth'
import { useClock } from '../lib/useClock'
import { useLiveClock } from '../lib/useLiveClock'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'
import { ClockModal } from '../components/ClockModal'
import { useTablet, useSmallPhone } from '../lib/useTablet'
import { useToast } from '../components/ui/Toast'

interface AttendanceRecord {
  id: number
  attendance_date: string
}

interface PaginatedResponse<T> {
  count: number
  results: T[]
}

interface LeaveAvailable {
  id: number
  available_days: number
  leave_type_id: { name: string }
}

interface TaskSummary {
  total: number
  to_do: number
  in_progress: number
  done: number
  blocked: number
  overdue: number
  recent_tasks: {
    id: number
    title: string
    status: string
    priority: string
    due_date: string | null
    overdue_days: number
    department: string | null
  }[]
}

interface PayrollEntry {
  month: number
  year: number
  col_AK: number | null
  col_AB: number | null
  contract_type: string
}

interface NotifSummary {
  unread: number
  total: number
}

/* ── Helpers ── */
function fmtMoney(n: number | null | undefined): string {
  if (n == null || n === 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

/* ── Components ── */


const TASK_WEBVIEW = '/tasks/1stopshop'

const STATUS_LABELS: Record<string, string> = {
  to_do: 'Cần làm', in_progress: 'Đang làm', done: 'Hoàn thành', blocked: 'Bị chặn',
}
const STATUS_COLORS: Record<string, string> = {
  to_do: '#06b6d4', in_progress: '#2563eb', done: HNH.success, blocked: '#ea580c',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp',
}

function EOfficeCompactCard({ tasks, compact, onClick }: { tasks: TaskSummary | null; compact?: boolean; onClick: () => void }) {
  const rows = [
    { label: 'Đang làm', val: tasks?.in_progress ?? 0, color: '#3b82f6' },
    { label: 'Cần làm',  val: tasks?.to_do ?? 0,       color: '#06b6d4' },
    { label: 'Bị chặn',  val: tasks?.blocked ?? 0,     color: '#f97316' },
    { label: 'Trễ hạn',  val: tasks?.overdue ?? 0,     color: HNH.red  },
  ]
  return (
    <button
      onClick={onClick}
      className="w-full border-none cursor-pointer text-left"
      style={{
        background: `linear-gradient(160deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`,
        borderRadius: 16, padding: compact ? '12px 12px' : '14px 16px', height: '100%', boxSizing: 'border-box',
        boxShadow: '0 4px 12px rgba(20,43,111,0.15)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 9 : 12 }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Công việc</div>
          <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: '#fff', marginTop: 1 }}>eOffice</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 7, padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Icon name="arrow-r" size={10} color="rgba(255,255,255,0.8)" stroke={2} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Mở</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 5 : 6 }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: compact ? 11 : 12, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{r.label}</span>
            <span style={{ fontSize: compact ? 15 : 18, fontWeight: 800, color: r.val > 0 ? r.color : 'rgba(255,255,255,0.25)', lineHeight: 1 }}>{r.val}</span>
          </div>
        ))}
      </div>
    </button>
  )
}

function TaskRow({ t, onClick }: { t: TaskSummary['recent_tasks'][number]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left border-none cursor-pointer"
      style={{ background: '#fff', border: `1px solid ${HNH.line}`, borderRadius: 14, padding: '10px 14px' }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: STATUS_COLORS[t.status] ?? HNH.ink3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
        <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>
          {STATUS_LABELS[t.status] ?? t.status}
          {t.due_date && <> · {t.due_date.slice(5).replace('-', '/')}</>}
          {t.overdue_days > 0 && <span style={{ color: HNH.red, fontWeight: 700 }}> · Trễ {t.overdue_days} ngày</span>}
        </div>
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
        background: t.priority === 'urgent' ? HNH.red50 : t.priority === 'high' ? '#fff7ed' : HNH.cream,
        color: t.priority === 'urgent' ? HNH.red : t.priority === 'high' ? '#ea580c' : HNH.ink3,
      }}>{PRIORITY_LABELS[t.priority] ?? t.priority}</div>
      <Icon name="chev-r" size={14} color={HNH.ink4} stroke={1.5} />
    </button>
  )
}

/* ── Monthly Overview Card ── */
function MonthlyCard({ month, workingDays, totalWorkDays, leaveRemaining, netPay, payrollMonth, activeCount, totalTasks, compact }: {
  month: number; workingDays: number; totalWorkDays: number; leaveRemaining: number
  netPay: number | null; payrollMonth: string; activeCount: number; totalTasks: number; compact?: boolean
}) {
  const navigate = useNavigate()
  const rows = [
    { icon: 'cal',   label: 'Ngày công',           value: `${workingDays}/${totalWorkDays}`,      color: HNH.navy,    path: null },
    { icon: 'leaf',  label: 'Phép còn',             value: `${leaveRemaining} ng`,                 color: HNH.success, path: '/leave' },
    { icon: 'money', label: payrollMonth || 'Lương', value: fmtMoney(netPay),                       color: '#a87908',   path: '/payslip' },
    { icon: 'doc',   label: 'Việc làm',             value: `${activeCount}/${totalTasks || 0}`,    color: HNH.red,     path: '/tasks' },
  ]
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: compact ? '12px 12px' : '14px 16px', height: '100%', boxSizing: 'border-box',
      border: `1px solid ${HNH.line}`, boxShadow: '0 1px 3px rgba(15,20,40,0.05)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: compact ? 9 : 12 }}>
        Tổng quan T{month}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 7 }}>
        {rows.map(r => (
          <div
            key={r.label}
            onClick={r.path ? () => navigate(r.path!) : undefined}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: r.path ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name={r.icon} size={11} color={r.color} stroke={2} />
              <span style={{ fontSize: compact ? 11 : 12, color: HNH.ink3, fontWeight: 500 }}>{r.label}</span>
            </div>
            <span style={{ fontSize: compact ? 12.5 : 14, fontWeight: 700, color: HNH.ink }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Weather Widget ── */
const WMO: Record<number, { label: string; emoji: string }> = {
  0:  { label: 'Trời quang',     emoji: '☀️' },
  1:  { label: 'Ít mây',         emoji: '🌤️' },
  2:  { label: 'Có mây',         emoji: '⛅' },
  3:  { label: 'Nhiều mây',      emoji: '☁️' },
  45: { label: 'Sương mù',       emoji: '🌫️' },
  48: { label: 'Sương mù dày',   emoji: '🌫️' },
  51: { label: 'Mưa phùn nhẹ',   emoji: '🌦️' },
  53: { label: 'Mưa phùn',       emoji: '🌧️' },
  55: { label: 'Mưa phùn dày',   emoji: '🌧️' },
  61: { label: 'Mưa nhẹ',        emoji: '🌧️' },
  63: { label: 'Mưa vừa',        emoji: '🌧️' },
  65: { label: 'Mưa to',         emoji: '🌧️' },
  80: { label: 'Mưa rào',        emoji: '🌦️' },
  81: { label: 'Mưa rào vừa',    emoji: '🌧️' },
  82: { label: 'Mưa rào mạnh',   emoji: '⛈️' },
  95: { label: 'Dông bão',        emoji: '⛈️' },
  96: { label: 'Dông + mưa đá',  emoji: '⛈️' },
  99: { label: 'Bão mưa đá lớn', emoji: '⛈️' },
}

function getWmo(code: number) {
  return WMO[code] ?? WMO[Math.floor(code / 10) * 10] ?? { label: 'Không xác định', emoji: '🌡️' }
}

function getGreeting(hour: number): string {
  if (hour >= 5  && hour < 11) return 'Chào buổi sáng'
  if (hour >= 11 && hour < 13) return 'Chào buổi trưa'
  if (hour >= 13 && hour < 18) return 'Chào buổi chiều'
  if (hour >= 18 && hour < 22) return 'Chào buổi tối'
  return 'Xin chào'
}

function getSkyBg(hour: number, code: number): string {
  if (code >= 95) return 'linear-gradient(135deg,#374151 0%,#1f2937 100%)'
  if (code >= 61) return 'linear-gradient(135deg,#4b5563 0%,#6b7280 100%)'
  if (hour >= 5  && hour < 7)  return 'linear-gradient(135deg,#f97316 0%,#fb923c 50%,#fbbf24 100%)'
  if (hour >= 7  && hour < 11) return 'linear-gradient(135deg,#0284c7 0%,#38bdf8 100%)'
  if (hour >= 11 && hour < 15) return 'linear-gradient(135deg,#0369a1 0%,#0ea5e9 100%)'
  if (hour >= 15 && hour < 18) return 'linear-gradient(135deg,#0284c7 0%,#38bdf8 100%)'
  if (hour >= 18 && hour < 20) return 'linear-gradient(135deg,#dc2626 0%,#f97316 50%,#9333ea 100%)'
  if (hour >= 20 && hour < 22) return 'linear-gradient(135deg,#312e81 0%,#1e3a5f 100%)'
  return `linear-gradient(135deg,${HNH.navy} 0%,#0f172a 100%)`
}

const WEATHER_KEY = 'hnh_wx_v2'

interface WeatherState { temp: number; code: number; suburb: string; city: string; ts: number }

// HCM City fallback coords — always available when GPS fails/slow
const HCM_LAT = 10.7769
const HCM_LNG = 106.7009

interface WeatherProxyResponse { temp: number; code: number; suburb: string; city: string }

async function fetchWeatherData(lat: number, lng: number): Promise<WeatherState> {
  // Use server-side proxy to avoid iOS PWA blocking direct fetch to external APIs
  const d = await api.get<WeatherProxyResponse>(
    `/api/base/weather/?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`
  )
  return { temp: d.temp, code: d.code, suburb: d.suburb, city: d.city, ts: Date.now() }
}

function WeatherWidget({ name, hour, liveTime, compact }: { name: string; hour: number; liveTime: string; compact?: boolean }) {
  const [wx, setWx] = useState<WeatherState | null>(() => {
    try { return JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null') } catch { return null }
  })
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (wx && Date.now() - wx.ts < 20 * 60 * 1000) return  // fresh enough

    const save = (data: WeatherState) => {
      localStorage.setItem(WEATHER_KEY, JSON.stringify(data))
      setWx(data)
    }

    // HCM City fallback — fires after 8s if GPS hasn't responded yet
    let settled = false
    const fallbackTimer = setTimeout(async () => {
      if (settled) return
      settled = true
      try {
        const data = await fetchWeatherData(HCM_LAT, HCM_LNG)
        if (!data.city) data.city = 'TP.HCM'
        save(data)
      } catch { /* total network failure */ }
    }, 8000)

    if (!navigator.geolocation) {
      setDenied(true)
      return  // fallback timer still runs
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        // Use plain (non-async) callback to avoid iOS PWA async-in-geolocation bug
        // Kick off fetch in a detached promise, fallback timer guards against hangs
        fetchWeatherData(pos.coords.latitude, pos.coords.longitude)
          .then(data => {
            if (!settled) { settled = true; clearTimeout(fallbackTimer); save(data) }
          })
          .catch(() => {
            if (!settled) { settled = true; clearTimeout(fallbackTimer) }
            // fallback timer already handles HCM weather
          })
      },
      () => {
        setDenied(true)
        // fallback timer will load HCM weather
      },
      { timeout: 10000, maximumAge: 60000 }
    )

    return () => { settled = true; clearTimeout(fallbackTimer) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const greeting = getGreeting(hour)
  const skyBg = getSkyBg(hour, wx?.code ?? 0)
  const wmo = wx ? getWmo(wx.code) : null
  const location = wx ? [wx.suburb, wx.city].filter(Boolean).join(' · ') : null

  useEffect(() => {
    localStorage.setItem('hnh_sky_bg', skyBg)
    window.dispatchEvent(new CustomEvent('hnh-sky-bg', { detail: skyBg }))
  }, [skyBg])

  return (
    <div style={{
      background: skyBg, borderRadius: compact ? 18 : 22, padding: compact ? '14px 16px' : '18px 20px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      color: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left: greeting + location */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 11 : 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 }}>{greeting}</div>
          <div style={{ fontSize: compact ? 17 : 20, fontWeight: 800, color: '#fff', marginTop: 2, letterSpacing: -0.3 }}>{name}!</div>
          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: compact ? 5 : 7 }}>
              <Icon name="pin" size={11} color="rgba(255,255,255,0.7)" stroke={1.8} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{location}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Icon name="clock" size={11} color="rgba(255,255,255,0.6)" stroke={1.8} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: 0.3 }}>{liveTime}</span>
          </div>
          {denied && !wx && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>Bật vị trí để xem thời tiết</div>
          )}
        </div>

        {/* Right: weather */}
        {wmo && wx && (
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: compact ? 28 : 36, lineHeight: 1 }}>{wmo.emoji}</div>
            <div style={{ fontSize: compact ? 22 : 28, fontWeight: 800, color: '#fff', letterSpacing: -1, marginTop: 4 }}>{wx.temp}°</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginTop: 2 }}>{wmo.label}</div>
          </div>
        )}
        {!wmo && !denied && (
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: compact ? 24 : 30, opacity: 0.4 }}>🌡️</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Đang tải...</div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Work Schedule Widget ── */
interface DaySchedule {
  day_name: string
  start_time: string | null
  end_time: string | null
  start_time_2: string | null
  end_time_2: string | null
  is_night_shift: boolean
  is_leave: boolean
  leave_type: string | null
  is_off: boolean
}
interface ScheduleData {
  shift_name: string | null
  days: Record<string, DaySchedule>   // keyed by ISO date YYYY-MM-DD
}

const DAY_SHORT: Record<string, string> = {
  monday:'T2', tuesday:'T3', wednesday:'T4', thursday:'T5',
  friday:'T6', saturday:'T7', sunday:'CN',
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function WeekStrip({ schedule, todayIso }: { schedule: ScheduleData | null; todayIso: string }) {
  const sortedDays = schedule?.days ? Object.keys(schedule.days).sort().slice(0, 6) : []
  if (sortedDays.length === 0) return (
    <div style={{ padding: '14px', textAlign: 'center', color: HNH.ink4, fontSize: 11 }}>Đang tải...</div>
  )
  return (
    <div className="flex">
      {sortedDays.map((iso, i) => {
        const sched = schedule?.days?.[iso] ?? null
        const [y, mo, d] = iso.split('-').map(Number)
        const date = new Date(y, mo - 1, d)
        const isToday = iso === todayIso
        const dayShort = sched
          ? (DAY_SHORT[sched.day_name] ?? '?')
          : DAY_SHORT[['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()]]
        const isLeave = sched?.is_leave ?? false
        const hasShift = !!sched?.start_time && !isLeave

        let bg = isToday ? HNH.navy : '#fff'
        if (isToday && isLeave) bg = '#fff3e6'

        const textMain = isToday && !isLeave ? '#fff' : isLeave ? HNH.warn : HNH.ink
        const textSub = isToday && !isLeave ? 'rgba(255,255,255,0.75)' : isLeave ? HNH.warn : HNH.navy
        const offColor = isToday && !isLeave ? 'rgba(255,255,255,0.4)' : HNH.ink4

        return (
          <div
            key={iso}
            className="flex flex-col items-center"
            style={{
              flex: 1,
              padding: '7px 2px 9px',
              background: bg,
              borderRight: i < 5 ? `1px solid ${HNH.line}` : 'none',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: isToday && !isLeave ? 'rgba(255,255,255,0.7)' : HNH.ink3 }}>
              {dayShort}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: textMain, lineHeight: 1.2, marginTop: 2 }}>
              {date.getDate()}
            </div>
            <div style={{ marginTop: 3, textAlign: 'center' }}>
              {isLeave ? (
                <div style={{ fontSize: 9, fontWeight: 700, color: HNH.warn }}>
                  <Icon name="leaf" size={9} color={HNH.warn} stroke={2} />
                </div>
              ) : hasShift ? (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: textSub, whiteSpace: 'nowrap' }}>
                    {sched!.start_time?.slice(0, 5)}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: textSub, opacity: 0.85 }}>
                    {sched!.end_time?.slice(0, 5)}
                  </div>
                  {sched!.is_night_shift && (
                    <div style={{ fontSize: 8, color: textSub, opacity: 0.75, marginTop: 1 }}>🌙</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 9, fontWeight: 600, color: offColor }}>Nghỉ</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function weekDateRange(schedule: ScheduleData | null): string {
  if (!schedule?.days) return ''
  const keys = Object.keys(schedule.days).sort()
  if (keys.length < 6) return ''
  return `${keys[0].slice(8)}/${keys[0].slice(5, 7)} – ${keys[5].slice(8)}/${keys[5].slice(5, 7)}`
}

function WorkScheduleWidget({ onClick }: { onClick: () => void }) {
  const { data: schedCurrent } = useApi<ScheduleData>('/api/employee/me/schedule/?week_offset=0')
  const { data: schedNext }    = useApi<ScheduleData>('/api/employee/me/schedule/?week_offset=1')
  const todayIso = toISO(new Date())

  if (!schedCurrent?.shift_name) return null

  return (
    <button
      onClick={onClick}
      className="w-full border-none cursor-pointer text-left"
      style={{ background: 'none', padding: 0 }}
    >
      <div style={{
        background: '#fff', borderRadius: 18,
        border: `1px solid ${HNH.line}`,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(15,20,40,0.05)',
      }}>
        {/* Tuần này */}
        <div>
          <div className="flex items-center justify-between" style={{ padding: '5px 10px 4px', background: HNH.navy50 }}>
            <div className="flex items-center gap-1" style={{ minWidth: 0, overflow: 'hidden' }}>
              <Icon name="cal" size={11} color={HNH.navy} stroke={2} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: HNH.navy, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>TUẦN NÀY</span>
              {schedCurrent.shift_name && (
                <span style={{ fontSize: 9, color: HNH.navy, opacity: 0.65, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  · {schedCurrent.shift_name}
                </span>
              )}
            </div>
            <span style={{ fontSize: 9, color: HNH.ink3, fontWeight: 500, flexShrink: 0, marginLeft: 6 }}>{weekDateRange(schedCurrent)}</span>
          </div>
          <WeekStrip schedule={schedCurrent} todayIso={todayIso} />
        </div>

        {/* Tuần tới */}
        <div style={{ borderTop: `1px solid ${HNH.line}` }}>
          <div className="flex items-center justify-between" style={{ padding: '5px 10px 4px', background: '#f0f3fa' }}>
            <div className="flex items-center gap-1" style={{ minWidth: 0, overflow: 'hidden' }}>
              <Icon name="cal" size={11} color={HNH.ink3} stroke={2} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>TUẦN TỚI</span>
              {(schedNext?.shift_name ?? schedCurrent.shift_name) && (
                <span style={{ fontSize: 9, color: HNH.ink3, opacity: 0.7, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  · {schedNext?.shift_name ?? schedCurrent.shift_name}
                </span>
              )}
            </div>
            <span style={{ fontSize: 9, color: HNH.ink3, fontWeight: 500, flexShrink: 0, marginLeft: 6 }}>{weekDateRange(schedNext)}</span>
          </div>
          <WeekStrip schedule={schedNext} todayIso={todayIso} />
        </div>
      </div>
    </button>
  )
}

/* ── Notification ticker ── */
interface NotifItem {
  id: number
  level: string        // 'info' | 'warning' | 'error' | 'success'
  unread: boolean
  verb: string
  description: string | null
  timestamp: string
  deleted?: boolean
  actor_name: string | null
}

function NotifStrip({ onClick }: { onClick: () => void }) {
  const { data } = useApi<{ count: number; results: NotifItem[] }>('/api/notifications/list/all?page_size=20')
  const items = (data?.results ?? []).filter(n => !n.deleted)
  if (items.length === 0) return null

  const doubled = [...items, ...items]
  const dur = Math.max(18, items.length * 5)

  return (
    <button
      onClick={onClick}
      className="w-full border-none cursor-pointer text-left"
      style={{ background: 'none', padding: 0 }}
    >
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#fff', border: `1px solid ${HNH.line}`,
        borderRadius: 12, overflow: 'hidden', height: 30,
        boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
      }}>
        {/* Fixed left icon */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: '100%', flexShrink: 0,
          background: HNH.navy50, borderRight: `1px solid ${HNH.line}`,
        }}>
          <Icon name="bell" size={12} color={HNH.navy} stroke={2} />
        </div>
        {/* Scrolling ticker */}
        <div style={{ flex: 1, overflow: 'hidden', height: '100%', position: 'relative' }}>
          <style>{`@keyframes hnh-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
          <div style={{
            display: 'flex', alignItems: 'center', height: '100%',
            animation: `hnh-ticker ${dur}s linear infinite`,
            width: 'max-content', padding: '0 6px',
          }}>
            {doubled.map((n, i) => {
              const isImportant = n.level === 'warning' || n.level === 'error'
              const text = n.verb.replace(/^\[.*?\]\s*/, '')
              return (
                <div key={`${n.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 18, whiteSpace: 'nowrap' }}>
                  {n.unread && (
                    <span style={{ fontSize: 7.5, fontWeight: 800, background: HNH.red, color: '#fff', padding: '1px 4px', borderRadius: 3, letterSpacing: 0.3 }}>MỚI</span>
                  )}
                  {isImportant && (
                    <span style={{ fontSize: 7.5, fontWeight: 800, background: '#f59e0b', color: '#fff', padding: '1px 4px', borderRadius: 3, letterSpacing: 0.3 }}>QUAN TRỌNG</span>
                  )}
                  <span style={{ fontSize: 11.5, color: n.unread ? HNH.ink : HNH.ink3, fontWeight: n.unread ? 600 : 400 }}>
                    {text.length > 60 ? text.slice(0, 60) + '…' : text}
                  </span>
                  <span style={{ color: HNH.ink4, marginLeft: 8, fontSize: 8, opacity: 0.35 }}>◆</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </button>
  )
}

/* ── Main ── */
export function HomePage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const { isClockedIn, duration, clockInTime, clockOutTime, clockIn, clockOut, acting } = useClock()
  const { now, time } = useLiveClock()
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const { data: tasks } = useApi<TaskSummary>('/api/eoffice/my-summary/')
  const { data: attendanceData } = useApi<PaginatedResponse<AttendanceRecord>>(
    '/api/attendance/my-attendance/?page_size=50'
  )
  const { data: leaveData } = useApi<PaginatedResponse<LeaveAvailable>>('/api/leave/available-leave/?page_size=20')
  const { data: notifSummary } = useApi<NotifSummary>('/api/notifications/summary/')
  const { data: payrollData } = useApi<PayrollEntry[]>('/api/payroll/my-monthly-payroll/')
  const { toast: showToast } = useToast()
  const refreshAll = useCallback(async () => {
    showToast('Đang xóa cache, tải lại ứng dụng...')
    try {
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(n => caches.delete(n)))
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) await reg.unregister()
      }
    } catch { /* ignore */ }
    setTimeout(() => window.location.reload(), 1200)
  }, [showToast])
  const isTablet = useTablet()
  const isSmall = useSmallPhone()
  const px = isTablet ? 28 : isSmall ? 14 : 20
  const activeCount = tasks ? tasks.to_do + tasks.in_progress + tasks.blocked : 0

  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const workingDays = attendanceData?.results?.filter(r => {
    const d = new Date(r.attendance_date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).length ?? 0
  const totalWorkDaysInMonth = (() => {
    const year = now.getFullYear()
    const month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d).getDay()
      if (day !== 0 && day !== 6) count++
    }
    return count
  })()

  const annualLeave = leaveData?.results?.find(l =>
    l.leave_type_id?.name?.toLowerCase().includes('phép năm') ||
    l.leave_type_id?.name?.toLowerCase().includes('annual')
  )
  const leaveRemaining = annualLeave ? annualLeave.available_days : (leaveData?.results?.[0]?.available_days ?? 0)
  const unreadCount = notifSummary?.unread ?? 0

  const latestPayroll = payrollData?.[0] ?? null
  const netPay = latestPayroll?.col_AK ?? null
  const payrollMonth = latestPayroll ? `T${latestPayroll.month}/${String(latestPayroll.year).slice(2)}` : ''

  const dayName = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][now.getDay()]
  const dateStr = `${dayName.toUpperCase()}, ${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')}`

  const initials = employee
    ? `${(employee.employee_first_name?.[0] ?? '')}${(employee.employee_last_name?.[0] ?? '')}`.toUpperCase()
    : '??'
  const displayName = employee?.employee_first_name ?? ''

  return (
    <PullToRefresh onRefresh={refreshAll}>
    <div style={{ padding: '6px 0 14px' }}>
      {/* Greeting header */}
      <div className="flex items-center gap-2" style={{ padding: `6px ${px}px ${isSmall ? 10 : 14}px` }}>
        <Avatar initials={initials} bg={HNH.red} size={isSmall ? 36 : 42} />
        <div className="flex-1">
          <div style={{ fontSize: isSmall ? 10.5 : 11.5, color: HNH.ink3, fontWeight: 600, letterSpacing: 0.4 }}>{dateStr}</div>
          <div style={{ fontSize: isSmall ? 15 : 18, fontWeight: 700, color: HNH.ink, letterSpacing: -0.2 }}>{displayName}</div>
        </div>
        {/* Work duration clock */}
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            background: HNH.navy, borderRadius: isSmall ? 11 : 14, padding: isSmall ? '5px 9px' : '6px 11px',
            boxShadow: '0 2px 8px rgba(20,43,111,0.15)',
          }}
        >
          <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1 }}>
            Giờ công
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: isSmall ? 13 : 15, fontWeight: 800,
            color: '#fff', letterSpacing: 0.5, lineHeight: 1, marginTop: 3,
          }}>
            {duration.slice(0, 5)}
          </div>
          <div style={{ fontSize: 7.5, fontWeight: 600, color: isClockedIn ? '#4ade80' : 'rgba(255,255,255,0.4)', marginTop: 2, letterSpacing: 0.3 }}>
            {isClockedIn ? '● live' : duration === '00:00:00' ? '—' : 'hôm nay'}
          </div>
        </div>

        {/* Bell */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative flex items-center justify-center border-none cursor-pointer"
          style={{
            width: isSmall ? 34 : 40, height: isSmall ? 34 : 40, borderRadius: isSmall ? 10 : 12, background: HNH.white,
            boxShadow: '0 1px 2px rgba(15,20,40,0.06)',
          }}
        >
          <Icon name="bell" size={isSmall ? 16 : 18} color={HNH.ink} />
          {unreadCount > 0 && (
            <span
              className="absolute flex items-center justify-center"
              style={{
                top: 3, right: 3, minWidth: 14, height: 14, padding: '0 3px',
                borderRadius: 7, background: HNH.red, border: '1.5px solid #fff',
                fontSize: 8.5, fontWeight: 800, color: '#fff', lineHeight: 1,
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Clock In/Out button + IN/OUT times */}
        <div className="flex items-center gap-1 shrink-0">
          <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.7, textAlign: 'right' }}>
            <div style={{ color: clockInTime ? HNH.success : HNH.ink4 }}>
              IN&nbsp;{clockInTime ?? '--:--'}
            </div>
            <div style={{ color: clockOutTime ? HNH.red : HNH.ink4 }}>
              OUT {clockOutTime ?? '--:--'}
            </div>
          </div>
          <button
            onClick={() => setClockModalOpen(true)}
            className="flex items-center justify-center border-none cursor-pointer shrink-0"
            style={{
              width: isSmall ? 34 : 40, height: isSmall ? 34 : 40, borderRadius: isSmall ? 10 : 12,
              background: isClockedIn ? HNH.success : HNH.red,
              boxShadow: isClockedIn ? '0 2px 8px rgba(34,197,94,0.3)' : '0 2px 8px rgba(192,34,43,0.3)',
            }}
          >
            <Icon name={isClockedIn ? 'check' : 'clock'} size={isSmall ? 16 : 18} color="#fff" stroke={2.2} />
          </button>
        </div>
      </div>

      {/* Notification strip */}
      <div style={{ padding: `0 ${px}px ${isSmall ? 8 : 10}px` }}>
        <NotifStrip onClick={() => navigate('/notifications')} />
      </div>

      {/* Weather widget */}
      <div style={{ padding: `0 ${px}px` }}>
        <WeatherWidget name={employee?.employee_first_name ?? 'bạn'} hour={now.getHours()} liveTime={time} compact={isSmall} />
      </div>

      {/* Work schedule widget */}
      <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0` }}>
        <WorkScheduleWidget onClick={() => navigate('/work-schedule')} />
      </div>

      {/* 2-column: Monthly overview + eOffice tasks */}
      <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isSmall ? 8 : 12 }}>
        <MonthlyCard
          month={now.getMonth() + 1}
          workingDays={workingDays}
          totalWorkDays={totalWorkDaysInMonth}
          leaveRemaining={leaveRemaining}
          netPay={netPay}
          payrollMonth={payrollMonth}
          activeCount={activeCount}
          totalTasks={tasks?.total ?? 0}
          compact={isSmall}
        />
        <EOfficeCompactCard tasks={tasks ?? null} compact={isSmall} onClick={() => navigate(TASK_WEBVIEW)} />
      </div>

      {/* Recent tasks */}
      {tasks && tasks.recent_tasks.length > 0 && (
        <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: isSmall ? 13.5 : 15, fontWeight: 700, color: HNH.ink }}>Việc cần làm</div>
            <button
              onClick={() => navigate(TASK_WEBVIEW)}
              className="border-none bg-transparent cursor-pointer"
              style={{ fontSize: isSmall ? 11 : 12, color: HNH.red, fontWeight: 600 }}
            >Xem tất cả →</button>
          </div>
          <div className="flex flex-col gap-2">
            {tasks.recent_tasks.map(t => (
              <TaskRow key={t.id} t={t} onClick={() => navigate('/tasks', { state: { openTaskId: t.id } })} />
            ))}
          </div>
        </div>
      )}

      <ClockModal
        open={clockModalOpen}
        onClose={() => setClockModalOpen(false)}
        isClockedIn={isClockedIn}
        clockInTime={clockInTime}
        duration={duration}
        shiftName={employee?.shift_name ?? 'Ca hành chính'}
        acting={acting}
        onClockIn={clockIn}
        onClockOut={clockOut}
      />
    </div>
    </PullToRefresh>
  )
}
