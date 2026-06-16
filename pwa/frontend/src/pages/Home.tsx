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
  shift_plan: { name: string; start: string | null; end: string | null } | null
  shift_plans: { name: string; start: string | null; end: string | null }[]
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
  nco:            '#ea580c',
}
const CAL_LEGEND: [string, string][] = [
  ['#16a34a', 'Hợp lệ'],
  ['#0ea5e9', 'Bù phép'],
  ['#f59e0b', 'Chờ duyệt'],
  ['#ef4444', 'Vắng'],
  ['#8b5cf6', 'Nghỉ phép'],
  ['#ea580c', 'NCO'],
]
const DAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function NcoDeclareModal({ day, onClose, onDone }: {
  day: MonthCalendarData['days'][0]; onClose: () => void; onDone: () => void
}) {
  const [out, setOut] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async () => {
    if (!out || !reason.trim()) return
    setBusy(true); setErr(null)
    try {
      await api.post('/api/attendance/nco/declare/', { date: day.date, clock_out: out, reason: reason.trim() })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi gửi khai báo'); setBusy(false)
    }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 20, width: 320, maxWidth: '100%' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#c2410c', marginBottom: 4 }}>Khai báo NCO</div>
        <div style={{ fontSize: 12, color: HNH.ink3, marginBottom: 12 }}>Ngày {day.date} — quên chấm công ra. Khai báo giờ ra thực tế để C&B duyệt.</div>
        <div style={{ fontSize: 12, color: HNH.ink2, marginBottom: 4 }}>Giờ ra thực tế</div>
        <input type="time" value={out} onChange={e => setOut(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 15, marginBottom: 10 }} />
        <div style={{ fontSize: 12, color: HNH.ink2, marginBottom: 4 }}>Lý do</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Vd: quên bấm clock-out" style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${HNH.line}`, fontSize: 14, resize: 'vertical', marginBottom: 10 }} />
        {err && <div style={{ fontSize: 12, color: HNH.red, marginBottom: 8 }}>{err}</div>}
        <div className="flex" style={{ gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 12, border: `1px solid ${HNH.line}`, background: '#fff', color: HNH.ink2, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
          <button disabled={busy || !out || !reason.trim()} onClick={submit} style={{ flex: 1, padding: 11, borderRadius: 12, border: 'none', background: (out && reason.trim()) ? HNH.navy : HNH.ink4, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Đang gửi…' : 'Gửi khai báo'}</button>
        </div>
      </div>
    </div>
  )
}

function MonthCalendar({ compact }: { compact?: boolean }) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<MonthCalendarData['days'][0] | null>(null)
  const [ncoDay, setNcoDay] = useState<MonthCalendarData['days'][0] | null>(null)
  const url = `/api/attendance/my-month-calendar/?year=${viewYear}&month=${viewMonth}`
  const { data, loading, refresh } = useApi<MonthCalendarData>(url)

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
            const isFuture = day.color_status === 'future'
            const statusColor = CAL_STATUS_COLORS[day.color_status]
            const isWeekend = day.weekday >= 5
            const plans = day.shift_plans || (day.shift_plan ? [day.shift_plan] : [])
            const hasPlan = plans.length > 0

            // Background and border for future days
            let cellBg: string
            let cellBorder: string
            if (isToday) {
              cellBg = 'transparent'
              cellBorder = `1.5px solid ${HNH.navy}`
            } else if (isFuture) {
              cellBg = hasPlan ? '#ffffff' : '#f1f5f9'
              cellBorder = hasPlan ? `1px solid #bfdbfe` : `1px solid ${HNH.line}`
            } else {
              cellBg = statusColor ? statusColor + '1a' : isWeekend ? '#fafafa' : 'transparent'
              cellBorder = statusColor ? `1px solid ${statusColor}35` : `1px solid ${HNH.line}`
            }

            return (
              <div key={day.date} onClick={() => {
                if (day.color_status === 'nco') setNcoDay(day)
                else if (plans.length > 0) setSelectedDay(day)
              }} style={{
                borderRadius: compact ? 5 : 6,
                background: cellBg,
                border: cellBorder,
                padding: compact ? '3px 2px' : '4px 2px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                minHeight: compact ? 54 : 62,
                position: 'relative', overflow: 'hidden',
                cursor: (plans.length > 0 || day.color_status === 'nco') ? 'pointer' : 'default',
              }}>
                {!isFuture && statusColor && (
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

                {/* Shift plans (future + past) */}
                {hasPlan && plans.slice(0, 3).map((sp, si) => (
                  <div key={si} style={{ textAlign: 'center', maxWidth: '100%', marginTop: si === 0 ? 2 : 0 }}>
                    <div style={{
                      fontSize: compact ? 6.5 : 7, fontWeight: 700, lineHeight: 1.1,
                      color: isFuture ? '#2563eb' : HNH.navy,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      padding: '0 1px',
                    }}>
                      {sp.name.length > 7 ? sp.name.slice(0, 6) + '…' : sp.name}
                    </div>
                    {sp.start && (
                      <div style={{ fontSize: compact ? 5.5 : 6, color: isFuture ? '#60a5fa' : HNH.ink3, lineHeight: 1.1 }}>
                        {sp.start.replace(':', 'h')}{sp.end ? `→${sp.end.replace(':', 'h')}` : ''}
                      </div>
                    )}
                  </div>
                ))}

                {/* Past day content */}
                {!isFuture && (
                  <>
                    {/* Worked hours */}
                    {day.worked_hours && (
                      <div style={{
                        fontSize: compact ? 9 : 10, fontWeight: 700, lineHeight: 1.2,
                        color: statusColor ?? HNH.ink2, marginTop: 1,
                      }}>{day.worked_hours}</div>
                    )}

                    {/* NCO marker */}
                    {day.color_status === 'nco' && (
                      <div style={{ fontSize: compact ? 8.5 : 9.5, fontWeight: 800, color: '#ea580c', marginTop: 1 }}>NCO</div>
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
                  </>
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

      {/* NCO declare modal */}
      {ncoDay && (
        <NcoDeclareModal day={ncoDay} onClose={() => setNcoDay(null)} onDone={() => { setNcoDay(null); refresh() }} />
      )}

      {/* Shift detail modal */}
      {selectedDay && (selectedDay.shift_plans || []).length > 0 && (
        <div onClick={() => setSelectedDay(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 18, padding: 20, width: 300, maxHeight: '70vh', overflow: 'auto',
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>
                {new Date(selectedDay.date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
              </span>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Icon name="x" size={18} color={HNH.ink3} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: HNH.ink3, marginBottom: 10 }}>
              {(selectedDay.shift_plans || []).length} ca được gán
            </div>
            {(selectedDay.shift_plans || []).map((sp, i) => (
              <div key={i} style={{
                background: HNH.navy50, borderRadius: 12, padding: '10px 14px', marginBottom: 8,
                border: `1px solid ${HNH.navy}20`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: HNH.navy }}>{sp.name}</div>
                {sp.start && (
                  <div style={{ fontSize: 12, color: HNH.ink2, marginTop: 4 }}>
                    {sp.start} → {sp.end || '?'}
                  </div>
                )}
              </div>
            ))}
            {selectedDay.worked_hours && (
              <div style={{ fontSize: 12, color: HNH.ink2, marginTop: 8 }}>
                Giờ làm: <strong>{selectedDay.worked_hours}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Today Shift Attendance Card ── */
interface ShiftRow {
  shift_name: string
  start_time: string
  end_time: string
  coefficient: number
  activities: { clock_in: string | null; clock_out: string | null }[]
  worked_minutes: number
  expected_minutes: number
  status: 'pending' | 'in_progress' | 'completed'
}
interface TodayShiftData {
  date: string
  shifts: ShiftRow[]
  total_worked_minutes: number
  total_expected_minutes: number
  progress_pct: number
}

const SHIFT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ', color: '#f59e0b', bg: '#fef3c7' },
  in_progress: { label: 'Đang làm', color: '#16a34a', bg: '#dcfce7' },
  completed: { label: 'Xong', color: '#2563eb', bg: '#dbeafe' },
}

function TodayShiftCard({ compact }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { data, loading } = useApi<TodayShiftData>('/api/attendance/my-today-shifts/')
  const [expanded, setExpanded] = useState(false)
  const shifts = data?.shifts ?? []
  const pct = data?.progress_pct ?? 0
  const totalWorked = data?.total_worked_minutes ?? 0
  const totalExpected = data?.total_expected_minutes ?? 0

  const workedH = Math.floor(totalWorked / 60)
  const workedM = Math.round(totalWorked % 60)
  const expectedH = Math.floor(totalExpected / 60)
  const expectedM = Math.round(totalExpected % 60)

  const barColor = pct >= 90 ? HNH.success : pct >= 50 ? '#2563eb' : pct > 0 ? '#f59e0b' : HNH.ink4

  // Giờ vào đầu / giờ ra cuối của cả ngày (gộp mọi ca + hoạt động)
  const allIns = shifts.flatMap(s => s.activities.map(a => a.clock_in).filter((t): t is string => !!t))
  const allOuts = shifts.flatMap(s => s.activities.map(a => a.clock_out).filter((t): t is string => !!t))
  const firstIn = allIns.length ? [...allIns].sort()[0] : null
  const lastOut = allOuts.length ? [...allOuts].sort()[allOuts.length - 1] : null

  return (
    <div
      style={{
        background: '#fff', borderRadius: 16,
        padding: compact ? '12px 12px' : '14px 16px',
        border: `1px solid ${HNH.line}`,
        boxShadow: '0 1px 3px rgba(15,20,40,0.05)',
      }}
    >
      {/* Header — tap để mở trang chấm công đầy đủ */}
      <div
        onClick={() => navigate('/attendance')}
        className="flex items-center justify-between"
        style={{ marginBottom: compact ? 8 : 10, cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <Icon name="clock" size={14} color={HNH.navy} stroke={2} />
          <span style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: HNH.ink }}>Chấm công hôm nay</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>
          {workedH}h{workedM > 0 ? String(workedM).padStart(2, '0') : ''} / {expectedH}h{expectedM > 0 ? String(expectedM).padStart(2, '0') : ''}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 3, background: HNH.cream2, marginBottom: compact ? 10 : 12, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${Math.min(100, pct)}%`,
          background: barColor,
          transition: 'width 0.5s ease',
        }} />
      </div>

      {loading && <div style={{ fontSize: 12, color: HNH.ink3, textAlign: 'center', padding: 12 }}>Đang tải...</div>}

      {!loading && shifts.length === 0 && (
        <div style={{ fontSize: 12, color: HNH.ink3, textAlign: 'center', padding: 8 }}>Không có ca hôm nay</div>
      )}

      {/* Tóm tắt: giờ vào đầu → giờ ra cuối của ngày */}
      {!loading && shifts.length > 0 && (
        <>
          <div className="flex items-center gap-3" style={{
            background: HNH.cream, borderRadius: 12, padding: '10px 12px',
          }}>
            <div className="flex items-center gap-1">
              <Icon name="arrow-r" size={11} color={HNH.success} stroke={2} />
              <span style={{ fontSize: 10, color: HNH.ink3 }}>Vào</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: firstIn ? HNH.ink : HNH.ink4 }}>{firstIn ?? '--:--'}</span>
            </div>
            <div style={{ flex: 1, height: 1, background: HNH.line }} />
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10, color: HNH.ink3 }}>Ra</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: lastOut ? HNH.ink : HNH.ink4 }}>{lastOut ?? '--:--'}</span>
              <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow-r" size={11} color={lastOut ? HNH.red : HNH.ink4} stroke={2} /></span>
            </div>
          </div>

          {/* Nút Xem chi tiết */}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
            style={{
              width: '100%', marginTop: 8, padding: '6px', borderRadius: 10,
              border: `1px solid ${HNH.line}`, background: '#fff',
              fontSize: 12, fontWeight: 600, color: HNH.navy, cursor: 'pointer',
            }}
          >
            {expanded ? 'Ẩn chi tiết ▴' : 'Xem chi tiết ▾'}
          </button>

          {/* Chi tiết: Ca, giờ vào - giờ ra, tổng số giờ làm */}
          {expanded && (
            <div style={{ marginTop: 8 }}>
              {shifts.map((s, i) => {
                const st = SHIFT_STATUS[s.status] ?? SHIFT_STATUS.pending
                const shiftPct = s.expected_minutes > 0 ? Math.min(100, Math.round(s.worked_minutes / s.expected_minutes * 100)) : 0
                return (
                  <div key={i} style={{
                    background: HNH.cream, borderRadius: 12, padding: compact ? '8px 10px' : '10px 12px',
                    marginBottom: 6,
                  }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                      <div className="flex items-center gap-2">
                        {s.shift_name
                          ? <>
                              <span style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: HNH.ink }}>{s.shift_name}</span>
                              <span style={{ fontSize: 10, color: HNH.ink3, fontWeight: 500 }}>{s.start_time}→{s.end_time}</span>
                            </>
                          : <span style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: HNH.ink }}>Trong ngày</span>}
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                        background: st.bg, color: st.color,
                      }}>{st.label}</span>
                    </div>
                    {s.activities.map((a, j) => (
                      <div key={j} className="flex items-center gap-3" style={{ marginBottom: 2 }}>
                        <div className="flex items-center gap-1">
                          <Icon name="arrow-r" size={9} color={HNH.success} stroke={2} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: a.clock_in ? HNH.ink : HNH.ink4 }}>{a.clock_in ?? '--:--'}</span>
                        </div>
                        <div style={{ flex: 1, height: 1, background: HNH.line, margin: '0 4px' }} />
                        <div className="flex items-center gap-1">
                          <span style={{ fontSize: 11, fontWeight: 600, color: a.clock_out ? HNH.ink : HNH.ink4 }}>{a.clock_out ?? '--:--'}</span>
                          <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow-r" size={9} color={a.clock_out ? HNH.red : HNH.ink4} stroke={2} /></span>
                        </div>
                      </div>
                    ))}
                    {s.activities.length === 0 && (
                      <div style={{ fontSize: 11, color: HNH.ink4, fontStyle: 'italic' }}>Chưa chấm công</div>
                    )}
                    <div className="flex items-center gap-2" style={{ marginTop: 5 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${shiftPct}%`, background: st.color, transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: st.color, minWidth: 28, textAlign: 'right' }}>{shiftPct}%</span>
                    </div>
                  </div>
                )
              })}
              {/* Tổng số giờ làm */}
              <div className="flex items-center justify-between" style={{
                padding: '8px 12px', borderRadius: 10, background: HNH.cream2, marginTop: 2,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: HNH.ink2 }}>Tổng số giờ làm</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: HNH.navy }}>
                  {workedH}h{workedM > 0 ? String(workedM).padStart(2, '0') : ''}
                </span>
              </div>
            </div>
          )}
        </>
      )}
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

  // KC session state
  const [kcValid, setKcValid] = useState<boolean | null>(null)
  const [kcChecking, setKcChecking] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    () => ('Notification' in window ? Notification.permission : 'default')
  )
  // Avatar menu checkbox selections
  const [chkKc, setChkKc] = useState(false)
  const [chkPush, setChkPush] = useState(false)
  const [chkCache, setChkCache] = useState(false)

  const checkKcSession = useCallback(async () => {
    setKcChecking(true)
    try {
      const res = await fetch('/bff/auth/kc-session', { credentials: 'include' })
      const data = await res.json() as { valid: boolean }
      setKcValid(data.valid)
    } catch {
      setKcValid(false)
    } finally {
      setKcChecking(false)
    }
  }, [])

  const refreshKcSession = useCallback(async () => {
    setKcChecking(true)
    try {
      const res = await fetch('/bff/auth/kc-refresh', { method: 'POST', credentials: 'include' })
      const data = await res.json() as { ok: boolean }
      if (data.ok) {
        setKcValid(true)
        showToast('Đã kết nối lại KC session ✓')
      } else {
        setKcValid(false)
        showToast('Không thể kết nối — hãy đăng nhập lại')
      }
    } catch {
      setKcValid(false)
      showToast('Lỗi kết nối KC SSO')
    } finally {
      setKcChecking(false)
    }
  }, [showToast])

  const enablePushNotif = useCallback(async () => {
    if (!('Notification' in window)) {
      showToast('Trình duyệt không hỗ trợ thông báo đẩy')
      return
    }
    if (Notification.permission === 'denied') {
      showToast('Thông báo bị chặn — vào Cài đặt trình duyệt để bật lại')
      return
    }
    const perm = await Notification.requestPermission()
    setPushPermission(perm)
    if (perm === 'granted') showToast('Đã bật thông báo đẩy ✓')
    else showToast('Chưa cấp quyền thông báo')
  }, [showToast])

  useEffect(() => { checkKcSession() }, [checkKcSession])

  const refreshAll = useCallback(async () => {
    rTasks(); rAtt(); rLeave(); rNotif(); rPay()
  }, [rTasks, rAtt, rLeave, rNotif, rPay])

  const openAvatarMenu = useCallback(() => {
    setChkKc(false); setChkPush(false); setChkCache(false)
    setAvatarMenuOpen(true)
  }, [])

  const clearCacheAndReload = useCallback(async () => {
    showToast('Đang xóa cache...')
    await new Promise(r => setTimeout(r, 400))
    try {
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(n => caches.delete(n)))
      }
    } catch { /* ignore */ }
    showToast('Đã xóa cache — đang tải lại...')
    setTimeout(() => window.location.reload(), 1600)
  }, [showToast])

  const handleAvatarConfirm = useCallback(async () => {
    setAvatarMenuOpen(false)
    if (chkKc) await refreshKcSession()
    if (chkPush) await enablePushNotif()
    if (chkCache) await clearCacheAndReload()
  }, [chkKc, chkPush, chkCache, refreshKcSession, enablePushNotif, clearCacheAndReload])

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
      {/* Avatar dropdown — slides from top-left */}
      {avatarMenuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
          onClick={() => setAvatarMenuOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 64, left: 16,
              width: 308,
              background: '#fff',
              borderRadius: 18,
              boxShadow: '0 8px 32px rgba(15,20,40,0.18)',
              border: `1px solid ${HNH.line}`,
              overflow: 'hidden',
              animation: 'slideDown 0.22s cubic-bezier(0.16,1,0.3,1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Profile header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 14px', borderBottom: `1px solid ${HNH.line}` }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar src={employee?.employee_profile} initials={initials} bg={HNH.red} size={44} />
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 14, height: 14, borderRadius: '50%',
                  background: kcValid === null ? HNH.ink4 : kcValid ? '#16a34a' : '#ef4444',
                  border: '2px solid #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 5, fontWeight: 900, color: '#fff',
                }}>KC</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {employee?.full_name ?? displayName}
                </div>
                <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {employee?.email ?? ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: kcChecking ? HNH.ink4 : kcValid ? '#16a34a' : '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: kcChecking ? HNH.ink3 : kcValid ? '#16a34a' : '#ef4444' }}>
                    KC SSO — {kcChecking ? 'Đang kiểm tra...' : kcValid ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Checkbox actions */}
            <div style={{ padding: '8px 12px 4px' }}>
              {([
                {
                  key: 'kc', checked: chkKc, onChange: setChkKc,
                  icon: 'link', iconBg: '#eff6ff', iconColor: '#2563eb',
                  label: 'Kết nối Keycloak SSO',
                  desc: kcChecking ? 'Đang kiểm tra...' : kcValid ? 'Online — Làm mới session' : 'Offline — Kết nối lại',
                  badgeText: kcValid ? 'Online' : 'Offline',
                  badgeBg: kcValid ? '#f0fdf4' : '#fef2f2',
                  badgeColor: kcValid ? '#16a34a' : '#ef4444',
                },
                {
                  key: 'push', checked: chkPush, onChange: setChkPush,
                  icon: 'bell', iconBg: '#f0fdf4', iconColor: '#16a34a',
                  label: 'Thông báo đẩy',
                  desc: pushPermission === 'granted' ? 'Đang bật' : pushPermission === 'denied' ? 'Bị chặn — mở Cài đặt' : 'Chưa bật',
                  badgeText: pushPermission === 'granted' ? 'Bật' : 'Tắt',
                  badgeBg: pushPermission === 'granted' ? '#f0fdf4' : HNH.cream,
                  badgeColor: pushPermission === 'granted' ? '#16a34a' : HNH.ink3,
                },
                {
                  key: 'cache', checked: chkCache, onChange: setChkCache,
                  icon: 'refresh', iconBg: '#fff7ed', iconColor: '#ea580c',
                  label: 'Xóa Cache & Tải lại',
                  desc: 'Xóa dữ liệu tạm, reload app',
                  badgeText: null, badgeBg: '', badgeColor: '',
                },
              ] as const).map(row => (
                <button
                  key={row.key}
                  onClick={() => row.onChange(!row.checked)}
                  style={{
                    width: '100%', padding: '9px 4px', display: 'flex', alignItems: 'center', gap: 11,
                    background: row.checked ? '#f8faff' : 'none',
                    border: row.checked ? `1.5px solid #bfdbfe` : '1.5px solid transparent',
                    cursor: 'pointer', borderRadius: 12, textAlign: 'left', marginBottom: 4,
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Checkbox indicator */}
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: row.checked ? 'none' : `1.5px solid ${HNH.ink4}`,
                    background: row.checked ? HNH.navy : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {row.checked && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {/* Icon */}
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: row.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={row.icon} size={16} color={row.iconColor} stroke={1.9} />
                  </div>
                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: HNH.ink }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 1 }}>{row.desc}</div>
                  </div>
                  {/* Status badge */}
                  {row.badgeText && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: row.badgeBg, color: row.badgeColor, flexShrink: 0 }}>
                      {row.badgeText}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Confirm button */}
            <div style={{ padding: '4px 16px 10px' }}>
              <button
                onClick={handleAvatarConfirm}
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 13,
                  background: (chkKc || chkPush || chkCache) ? HNH.navy : HNH.cream,
                  color: (chkKc || chkPush || chkCache) ? '#fff' : HNH.ink3,
                  border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700,
                  transition: 'all 0.15s',
                }}
              >
                Đồng ý{(chkKc || chkPush || chkCache) ? ` (${[chkKc, chkPush, chkCache].filter(Boolean).length})` : ''}
              </button>
            </div>

            {/* Version + build info */}
            <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${HNH.line}`, paddingTop: 10 }}>
              <div style={{ fontSize: 10, color: HNH.ink4, fontWeight: 500 }}>
                HNH HRM PWA · v{__APP_VERSION__}
              </div>
              <div style={{ fontSize: 9.5, color: HNH.ink4, marginTop: 2 }}>
                Build: {new Date(__BUILD_TIME__).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <style>{`@keyframes slideDown { from { opacity:0; transform:translateY(-12px) } to { opacity:1; transform:translateY(0) } }`}</style>
        </div>
      )}

      {/* Greeting header */}
      <div className="flex items-center gap-2" style={{ padding: `6px ${px}px ${isSmall ? 10 : 14}px` }}>
        {/* Avatar with KC badge */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={openAvatarMenu}
            className="border-none bg-transparent p-0"
            style={{ cursor: 'pointer', borderRadius: '50%', display: 'block' }}
          >
            <Avatar
              src={employee?.employee_profile}
              initials={initials}
              bg={HNH.red}
              size={isSmall ? 36 : 42}
            />
          </button>
          {/* KC session badge */}
          <div
            onClick={e => { e.stopPropagation(); checkKcSession() }}
            style={{
              position: 'absolute', bottom: -3, right: -3,
              width: isSmall ? 14 : 16, height: isSmall ? 14 : 16,
              borderRadius: '50%',
              background: kcChecking ? HNH.ink4 : kcValid === null ? HNH.ink4 : kcValid ? '#16a34a' : '#ef4444',
              border: '2px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 5, fontWeight: 900, color: '#fff', letterSpacing: -0.5,
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              animation: kcChecking ? 'spin 1s linear infinite' : 'none',
            }}
            title={kcValid ? 'KC: Online' : 'KC: Offline — bấm để kiểm tra lại'}
          >
            {kcChecking ? '' : 'KC'}
          </div>
        </div>
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

      {/* Monthly overview */}
      <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0` }}>
        <MonthlyCard
          month={now.getMonth() + 1}
          workingDays={workingDays}
          totalWorkDays={totalWorkDaysInMonth}
          leaveRemaining={leaveRemaining}
          netPay={netPay}
          payrollMonth={payrollMonth}
          activeCount={activeCount}
          totalTasks={tasks?.total ?? 0}
        />
      </div>

      {/* Today shift attendance detail */}
      <div style={{ padding: `${isSmall ? 10 : 12}px ${px}px 0` }}>
        <TodayShiftCard compact={isSmall} />
      </div>

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
