import { useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'
import { Badge } from './ui/Badge'
import { useApi } from '../lib/useApi'
import { useTablet } from '../lib/useTablet'

interface Activity {
  id: number
  clock_in: string | null
  clock_out: string | null
  clock_in_date: string | null
  clock_out_date: string | null
  clock_in_latitude: string | null
  clock_in_longitude: string | null
  clock_in_address: string | null
  clock_in_photo: string | null
  clock_out_latitude: string | null
  clock_out_longitude: string | null
  clock_out_address: string | null
  clock_out_photo: string | null
  gps_in_distance_m: number | null
  gps_in_company_name: string | null
  gps_in_company_address: string | null
  gps_out_distance_m: number | null
  gps_out_company_name: string | null
  gps_out_company_address: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  attendanceId: number | null
  attendanceDate: string
  clockIn: string
  clockOut: string
  workedHour: string
}

function PhotoView({ src, label }: { src: string; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const photoUrl = src.startsWith('/') ? src : `/media/${src}`

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="border-none cursor-pointer p-0"
        style={{ background: 'none' }}
      >
        <div className="relative overflow-hidden" style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${HNH.line}` }}>
          <img
            src={photoUrl}
            alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
        <div style={{ fontSize: 9.5, color: HNH.ink3, marginTop: 2, textAlign: 'center' }}>{label}</div>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 10001, background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setExpanded(false)}
        >
          <button
            onClick={() => setExpanded(false)}
            className="absolute border-none cursor-pointer flex items-center justify-center"
            style={{ top: 16, left: 16, width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', zIndex: 1 }}
          >
            <svg width="9" height="16" viewBox="0 0 9 16">
              <path d="M7.5 1.5 1.5 8l6 6.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <img
            src={photoUrl}
            alt={label}
            style={{ maxWidth: '92%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }}
          />
        </div>
      )}
    </>
  )
}

// 1 lượt chấm phẳng (không còn cặp vào/ra) — mỗi lần chấm là 1 sự kiện.
interface Punch {
  key: string
  time: string            // HH:MM:SS
  photo: string | null
  lat: string | null
  lng: string | null
  address: string | null
  companyName: string | null
  companyAddress: string | null
  distanceM: number | null
}

// Gom các AttendanceActivity (cặp clock_in/clock_out) thành danh sách lượt chấm
// phẳng, sắp theo thời gian. Mỗi clock_in và clock_out = 1 lượt riêng.
function flattenPunches(activities: Activity[]): Punch[] {
  const punches: Punch[] = []
  for (const a of activities) {
    if (a.clock_in) {
      punches.push({
        key: `${a.id}-in`, time: a.clock_in, photo: a.clock_in_photo,
        lat: a.clock_in_latitude, lng: a.clock_in_longitude, address: a.clock_in_address,
        companyName: a.gps_in_company_name, companyAddress: a.gps_in_company_address,
        distanceM: a.gps_in_distance_m,
      })
    }
    if (a.clock_out) {
      punches.push({
        key: `${a.id}-out`, time: a.clock_out, photo: a.clock_out_photo,
        lat: a.clock_out_latitude, lng: a.clock_out_longitude, address: a.clock_out_address,
        companyName: a.gps_out_company_name, companyAddress: a.gps_out_company_address,
        distanceM: a.gps_out_distance_m,
      })
    }
  }
  punches.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0))
  return punches
}

function PunchCard({ punch, index, total, role }: {
  punch: Punch; index: number; total: number; role: 'in' | 'out' | 'mid'
}) {
  const time = punch.time?.slice(0, 5) ?? '--:--'
  const hasGps = punch.lat && punch.lng
  const roleLabel = role === 'in' ? 'Giờ vào ca' : role === 'out' ? 'Giờ ra ca' : 'Giờ chấm'
  const accent = role === 'in' ? HNH.success : role === 'out' ? HNH.navy : HNH.ink2
  const accentBg = role === 'in' ? HNH.success50 : role === 'out' ? HNH.navy50 : HNH.cream2

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '12px 14px',
      border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(15,20,40,0.03)',
    }}>
      <div className="flex items-start gap-3">
        <div style={{
          width: 34, height: 34, borderRadius: 10, background: accentBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 13, fontWeight: 800, color: accent,
        }}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Lượt {index + 1}/{total}
            </span>
            <Badge tone={role === 'in' ? 'success' : role === 'out' ? 'navy' : 'ink'} size="s">{roleLabel}</Badge>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace", marginTop: 2 }}>{time}</div>
          {punch.companyName && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={accent} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink2, fontWeight: 600 }}>
                {punch.companyName}
                {punch.distanceM != null && (
                  <span style={{ color: HNH.ink3, fontWeight: 400 }}> · {punch.distanceM}m</span>
                )}
              </span>
            </div>
          )}
          {punch.companyAddress && (
            <div style={{ marginTop: 1, paddingLeft: 15 }}>
              <span style={{ fontSize: 10, color: HNH.ink3 }}>{punch.companyAddress}</span>
            </div>
          )}
          {!punch.companyName && (hasGps || punch.address) && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.ink3} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink3 }}>
                {punch.address || `${Number(punch.lat).toFixed(5)}, ${Number(punch.lng).toFixed(5)}`}
              </span>
            </div>
          )}
        </div>
        {punch.photo && <PhotoView src={punch.photo} label={`Lượt ${index + 1}`} />}
      </div>
    </div>
  )
}

export function AttendanceDetailModal({ open, onClose, attendanceId, attendanceDate, clockIn, clockOut, workedHour }: Props) {
  const { data: activities, loading } = useApi<Activity[]>(
    open && attendanceId ? `/api/attendance/my-attendance/${attendanceId}/activities/` : null
  )
  const isTablet = useTablet()

  if (!open) return null

  const d = new Date(attendanceDate)
  const dayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  const dateLabel = `${dayLabels[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  // N lượt chấm phẳng. Lượt 1 = giờ vào ca; ngày ĐÃ QUA → lượt cuối = giờ ra ca;
  // các lượt còn lại = giờ chấm.
  const punches = flattenPunches(activities ?? [])
  const todayISO = new Date().toISOString().slice(0, 10)
  const isPast = attendanceDate < todayISO
  const punchRole = (i: number): 'in' | 'out' | 'mid' =>
    i === 0 ? 'in' : (isPast && i === punches.length - 1 && punches.length >= 2 ? 'out' : 'mid')

  return (
    <div
      className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
      style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className={isTablet ? '' : 'flex-1 overflow-y-auto'}
        style={isTablet
          ? { width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }
          : { WebkitOverflowScrolling: 'touch' as never }
        }
      >
        <div style={{ minHeight: isTablet ? undefined : '100%', background: HNH.cream, paddingBottom: 20, borderRadius: isTablet ? 24 : 0 }}>
          {/* Header */}
          <div className="flex items-center gap-3" style={{
            padding: '10px 16px', background: '#fff',
            borderBottom: `1px solid ${HNH.line}`,
          }}>
            <button
              onClick={onClose}
              className="flex items-center justify-center border-none cursor-pointer shrink-0"
              style={{
                width: 44, height: 44, borderRadius: 14,
                background: '#fff',
                boxShadow: '0 1px 4px rgba(15,20,40,0.09)',
              }}
            >
              <svg width="9" height="16" viewBox="0 0 9 16">
                <path d="M7.5 1.5 1.5 8l6 6.5" stroke={HNH.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, color: HNH.ink, letterSpacing: -0.2 }}>Chi tiết chấm công</div>
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            {/* Summary card */}
            <div style={{
              background: '#fff', borderRadius: 18, padding: '16px 18px',
              border: `1px solid ${HNH.line}`,
              boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, marginBottom: 2 }}>
                {dateLabel}
              </div>
              <div className="flex items-center gap-4" style={{ marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Vào</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{clockIn}</div>
                </div>
                <Icon name="arrow-r" size={16} color={HNH.ink3} />
                <div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{isPast ? 'Ra' : 'Chấm cuối'}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{clockOut}</div>
                </div>
                <div className="ml-auto" style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Tổng</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.navy, fontFamily: "'Plus Jakarta Sans', monospace" }}>{workedHour}</div>
                </div>
              </div>
            </div>

            {/* Lượt chấm công (phẳng) */}
            <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
              Lượt chấm công
              {!loading && <span style={{ color: HNH.ink3, fontWeight: 500 }}> ({punches.length})</span>}
            </div>

            {loading && (
              <div style={{ padding: 30, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                Đang tải...
              </div>
            )}

            {!loading && punches.length === 0 && (
              <div style={{
                padding: 30, textAlign: 'center',
                background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
              }}>
                <Icon name="clock" size={28} color={HNH.ink3} />
                <div style={{ color: HNH.ink3, fontSize: 13, marginTop: 8 }}>Chưa có lượt chấm nào</div>
              </div>
            )}

            {punches.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {punches.map((p, i) => (
                  <PunchCard key={p.key} punch={p} index={i} total={punches.length} role={punchRole(i)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
