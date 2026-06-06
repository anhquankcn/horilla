import React, { useState, useCallback, useEffect } from 'react'
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

interface CalendarDay {
  date: string
  day: number
  weekday: number
  color_status: string
  first_in: string | null
  last_out: string | null
  worked_hours: string | null
  leave_name: string | null
  leave_status: string | null
}

interface MonthCalendarData {
  year: number
  month: number
  today: string
  days: CalendarDay[]
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

/* ── Ten-Day Schedule Widget ── */
interface TenDayMeeting {
  id: number
  title: string
  start: string
  end: string
  meet_url: string
  slots: number[]
}

interface TenDayDay {
  date: string
  day: number
  weekday_vi: string
  is_today: boolean
  is_weekend: boolean
  day_type: 'office' | 'leave' | 'off' | 'trip' | 'event'
  leave_type: string | null
  shift_start: string | null
  shift_end: string | null
  meetings: TenDayMeeting[]
  busy_slots: number[]
}

interface TenDayData {
  days: TenDayDay[]
}

// Slot labels: 0-3 = morning, 4-7 = afternoon
const SLOT_LABEL = ['8h','9h','10h','11h','13h30','14h30','15h30','16h30']

const DAY_TYPE_CONFIG: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  office: { label: 'Văn phòng', bg: HNH.navy,    fg: '#fff',          icon: '🏢' },
  leave:  { label: 'Nghỉ phép', bg: '#8b5cf6',   fg: '#fff',          icon: '🌿' },
  off:    { label: 'Nghỉ',      bg: '#94a3b8',   fg: '#fff',          icon: '🏠' },
  trip:   { label: 'Công tác',  bg: '#f59e0b',   fg: '#fff',          icon: '✈️' },
  event:  { label: 'Sự kiện',   bg: '#ec4899',   fg: '#fff',          icon: '🎉' },
}

function DayCard({ day, onClick }: { day: TenDayDay; onClick: () => void }) {
  const cfg = DAY_TYPE_CONFIG[day.day_type] ?? DAY_TYPE_CONFIG.office
  const isOff = day.day_type === 'off' || day.day_type === 'leave'
  const [mm, dd] = day.date.slice(5).split('-')
  const shortWd = day.weekday_vi.replace('Thứ ', 'T').replace('Chủ nhật', 'CN')

  return (
    <button
      onClick={onClick}
      className="flex flex-col border-none cursor-pointer shrink-0"
      style={{
        width: 74, borderRadius: 12,
        background: day.is_today ? cfg.bg : '#fff',
        border: day.is_today ? `2px solid ${cfg.bg}` : `1.5px solid ${day.is_weekend ? '#fde8e8' : HNH.line}`,
        padding: '7px 5px 6px',
        boxShadow: day.is_today ? `0 4px 14px ${cfg.bg}40` : '0 1px 3px rgba(15,20,40,0.05)',
        alignItems: 'center', gap: 3,
      }}
    >
      {/* Weekday */}
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
        color: day.is_today ? 'rgba(255,255,255,0.75)' : day.is_weekend ? HNH.red : HNH.ink3,
      }}>{shortWd}</div>

      {/* Date number */}
      <div style={{
        fontSize: 17, fontWeight: 800, lineHeight: 1.1,
        color: day.is_today ? '#fff' : day.is_weekend ? HNH.red : HNH.ink,
      }}>{parseInt(dd)}</div>

      {/* Month (only if 1st or today) */}
      {(day.day === 1 || day.is_today) && (
        <div style={{ fontSize: 8, color: day.is_today ? 'rgba(255,255,255,0.6)' : HNH.ink4 }}>T{parseInt(mm)}</div>
      )}

      {/* Day type badge */}
      <div style={{
        fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 5, marginTop: 1,
        background: day.is_today ? 'rgba(255,255,255,0.18)' : cfg.bg + '20',
        color: day.is_today ? '#fff' : cfg.bg,
        display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap',
      }}>
        <span>{cfg.icon}</span>
        <span style={{ display: day.is_today ? 'inline' : 'none' }}>{cfg.label}</span>
      </div>

      {/* Meeting slot grid 2×4 */}
      {!isOff && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginTop: 2, width: '100%', padding: '0 2px' }}>
          {[0,1,2,3].map(i => {
            const leftBusy = day.busy_slots.includes(i)
            const rightBusy = day.busy_slots.includes(i + 4)
            return (
              <React.Fragment key={i}>
                <div title={SLOT_LABEL[i]} style={{
                  height: 7, borderRadius: 2,
                  background: leftBusy ? HNH.red : day.is_today ? 'rgba(255,255,255,0.22)' : HNH.line,
                }} />
                <div title={SLOT_LABEL[i + 4]} style={{
                  height: 7, borderRadius: 2,
                  background: rightBusy ? HNH.red : day.is_today ? 'rgba(255,255,255,0.22)' : HNH.line,
                }} />
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Leave label */}
      {isOff && day.leave_type && (
        <div style={{
          fontSize: 7, color: day.is_today ? 'rgba(255,255,255,0.8)' : '#8b5cf6',
          textAlign: 'center', lineHeight: 1.2, marginTop: 1,
          overflow: 'hidden', maxWidth: '100%',
        }}>
          {day.leave_type.length > 9 ? day.leave_type.slice(0, 8) + '…' : day.leave_type}
        </div>
      )}
    </button>
  )
}

function TenDayWidget() {
  const navigate = useNavigate()
  const { data } = useApi<TenDayData>('/api/employee/me/ten-day-schedule/')
  const days = data?.days ?? []

  if (days.length === 0) return null

  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${HNH.line}`,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,20,40,0.05)',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '6px 12px 5px', background: HNH.navy50 }}>
        <div className="flex items-center gap-1.5">
          <Icon name="cal" size={11} color={HNH.navy} stroke={2} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: HNH.navy, letterSpacing: 0.3 }}>LỊCH LÀM VIỆC 10 NGÀY</span>
        </div>
        <div className="flex items-center gap-2" style={{ fontSize: 8, color: HNH.ink3 }}>
          <span>🔴 Có họp</span>
          <span>✈️ Công tác</span>
          <span>🎉 Sự kiện</span>
        </div>
      </div>

      {/* Horizontal scroll cards */}
      <div
        className="flex"
        style={{
          overflowX: 'auto',
          padding: '10px 10px 10px',
          gap: 7,
          scrollbarWidth: 'none',
        }}
      >
        {days.map(day => (
          <DayCard
            key={day.date}
            day={day}
            onClick={() => navigate(`/day/${day.date}`)}
          />
        ))}
      </div>

      {/* Slot grid legend */}
      <div className="flex items-center justify-between" style={{ padding: '4px 12px 7px', borderTop: `1px solid ${HNH.line}` }}>
        <div className="flex items-center gap-1">
          <div style={{ width: 10, height: 7, borderRadius: 2, background: HNH.line }} />
          <span style={{ fontSize: 8, color: HNH.ink3 }}>Cột trái: 8–12h · Cột phải: 13:30–17:30</span>
        </div>
        <div className="flex items-center gap-1">
          <div style={{ width: 10, height: 7, borderRadius: 2, background: HNH.red }} />
          <span style={{ fontSize: 8, color: HNH.ink3 }}>Có lịch họp</span>
        </div>
      </div>
    </div>
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

/* ── Attendance Calendar ── */
const CAL_STATUS_COLORS: Record<string, string> = {
  valid:          '#16a34a',
  leave_deducted: '#0ea5e9',
  pending:        '#f59e0b',
  absent:         '#ef4444',
  leave:          '#8b5cf6',
  leave_pending:  '#fb923c',
  holiday:        '#ec4899',
}
const CAL_LEGEND: [string, string][] = [
  ['#16a34a', 'Hợp lệ'],
  ['#0ea5e9', 'Bù phép'],
  ['#f59e0b', 'Chờ duyệt'],
  ['#ef4444', 'Vắng'],
  ['#8b5cf6', 'Nghỉ phép'],
]
const DAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function MonthCalendar({ compact }: { compact?: boolean }) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const url = `/api/attendance/my-month-calendar/?year=${viewYear}&month=${viewMonth}`
  const { data, loading } = useApi<MonthCalendarData>(url)

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }

  const today = data?.today ?? now.toISOString().slice(0, 10)
  const firstWeekday = data?.days?.[0]?.weekday ?? 0
  const cells: (CalendarDay | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...(data?.days ?? []),
  ]

  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      padding: compact ? '10px 10px 8px' : '12px 14px 10px',
      border: `1px solid ${HNH.line}`,
      boxShadow: '0 1px 3px rgba(15,20,40,0.05)',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: compact ? 7 : 9 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: HNH.ink }}>
          Lịch công T{viewMonth}/{viewYear}
        </div>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button onClick={prevMonth} className="border-none cursor-pointer flex items-center justify-center"
            style={{ width: 24, height: 24, borderRadius: 6, background: HNH.cream }}>
            <Icon name="chev-l" size={12} color={HNH.ink2} stroke={2.5} />
          </button>
          <button onClick={nextMonth} className="border-none cursor-pointer flex items-center justify-center"
            style={{ width: 24, height: 24, borderRadius: 6, background: HNH.cream }}>
            <Icon name="chev-r" size={12} color={HNH.ink2} stroke={2.5} />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 3 }}>
        {DAY_HEADERS.map(d => (
          <div key={d} style={{
            textAlign: 'center', fontSize: compact ? 9 : 9.5, fontWeight: 700,
            color: d === 'CN' ? HNH.red : HNH.ink3, paddingBottom: 4,
          }}>{d}</div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height: 110 }}>
          <div style={{ width: 18, height: 18, border: `2.5px solid ${HNH.line}`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: compact ? 2 : 3 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const isToday = day.date === today
            const statusColor = CAL_STATUS_COLORS[day.color_status]
            const isWeekend = day.weekday >= 5

            return (
              <div key={day.date} style={{
                borderRadius: compact ? 5 : 6,
                background: statusColor ? statusColor + '1a' : isWeekend ? '#fafafa' : 'transparent',
                border: isToday
                  ? `1.5px solid ${HNH.navy}`
                  : statusColor ? `1px solid ${statusColor}35` : `1px solid ${HNH.line}`,
                padding: compact ? '3px 2px' : '4px 2px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                minHeight: compact ? 54 : 62,
                position: 'relative', overflow: 'hidden',
              }}>
                {statusColor && (
                  <div style={{
                    position: 'absolute', top: 3, right: 3,
                    width: 4, height: 4, borderRadius: '50%', background: statusColor,
                  }} />
                )}

                {/* Day number */}
                <div style={{
                  fontSize: compact ? 11 : 12, fontWeight: isToday ? 800 : 600, lineHeight: 1.2,
                  color: isToday ? HNH.navy : isWeekend ? HNH.red : HNH.ink,
                }}>{day.day}</div>

                {/* Worked hours */}
                {day.worked_hours && (
                  <div style={{
                    fontSize: compact ? 9 : 10, fontWeight: 700, lineHeight: 1.2,
                    color: statusColor ?? HNH.ink2, marginTop: 1,
                  }}>{day.worked_hours}</div>
                )}

                {/* Leave label (if no attendance) */}
                {!day.worked_hours && day.leave_name && (
                  <div style={{
                    fontSize: 7, fontWeight: 600, lineHeight: 1.2, marginTop: 2,
                    color: statusColor ?? '#8b5cf6', textAlign: 'center',
                    overflow: 'hidden', maxWidth: '100%',
                  }}>
                    {day.leave_name.length > 9 ? day.leave_name.slice(0, 8) + '…' : day.leave_name}
                  </div>
                )}

                {/* First in / last out times */}
                {day.first_in && (
                  <div style={{ fontSize: compact ? 7 : 7.5, color: HNH.ink3, lineHeight: 1.15, marginTop: 'auto' }}>
                    {day.first_in}
                  </div>
                )}
                {day.last_out && (
                  <div style={{ fontSize: compact ? 7 : 7.5, color: HNH.ink3, lineHeight: 1.15 }}>
                    {day.last_out}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap" style={{ gap: '3px 10px', marginTop: 8 }}>
        {CAL_LEGEND.map(([color, label]) => (
          <div key={label} className="flex items-center" style={{ gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 8.5, color: HNH.ink3, fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main ── */
export function HomePage() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const { isClockedIn, duration, clockInTime, clockOutTime, clockIn, clockOut, acting } = useClock()
  const { now, time } = useLiveClock()
  const [clockModalOpen, setClockModalOpen] = useState(false)
  const { data: tasks, refresh: rTasks } = useApi<TaskSummary>('/api/eoffice/my-summary/')
  const { data: attendanceData, refresh: rAtt } = useApi<PaginatedResponse<AttendanceRecord>>(
    '/api/attendance/my-attendance/?page_size=50'
  )
  const { data: leaveData, refresh: rLeave } = useApi<PaginatedResponse<LeaveAvailable>>('/api/leave/available-leave/?page_size=20')
  const { data: notifSummary, refresh: rNotif } = useApi<NotifSummary>('/api/notifications/summary/')
  const { data: payrollData, refresh: rPay } = useApi<PayrollEntry[]>('/api/payroll/my-monthly-payroll/')
  const { toast: showToast } = useToast()
  const refreshAll = useCallback(async () => {
    rTasks(); rAtt(); rLeave(); rNotif(); rPay()
  }, [rTasks, rAtt, rLeave, rNotif, rPay])
  const clearCacheAndReload = useCallback(async () => {
    showToast('Đang xóa cache...')
    await new Promise(r => setTimeout(r, 400))
    try {
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(n => caches.delete(n)))
      }
    } catch { /* ignore */ }
    showToast('Đã xóa cache — đang tải lại ứng dụng...')
    setTimeout(() => window.location.reload(), 1600)
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
        <button
          onClick={clearCacheAndReload}
          className="border-none bg-transparent p-0 shrink-0"
          style={{ cursor: 'pointer', borderRadius: '50%' }}
          title="Xóa cache & tải lại"
        >
          <Avatar initials={initials} bg={HNH.red} size={isSmall ? 36 : 42} />
        </button>
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

      {/* Ten-day schedule widget */}
      <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0` }}>
        <TenDayWidget />
      </div>

      {/* Monthly attendance calendar */}
      <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0` }}>
        <MonthCalendar compact={isSmall} />
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
