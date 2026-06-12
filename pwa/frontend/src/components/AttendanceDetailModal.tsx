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

function ActivityCard({ activity, index, total }: { activity: Activity; index: number; total: number }) {
  const inTime = activity.clock_in?.slice(0, 5) ?? '--:--'
  const outTime = activity.clock_out?.slice(0, 5) ?? '--:--'
  const hasInGps = activity.clock_in_latitude && activity.clock_in_longitude
  const hasOutGps = activity.clock_out_latitude && activity.clock_out_longitude
  const isOpen = !activity.clock_out

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      border: `1px solid ${HNH.line}`,
      boxShadow: '0 1px 2px rgba(15,20,40,0.03)',
    }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <div style={{
            width: 24, height: 24, borderRadius: 8,
            background: isOpen ? HNH.warn50 : HNH.success50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: isOpen ? HNH.warn : HNH.success,
          }}>
            {index + 1}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: HNH.ink }}>
            Hoạt động {index + 1}/{total}
          </span>
        </div>
        <Badge tone={isOpen ? 'warn' : 'success'} size="s">
          {isOpen ? 'Đang mở' : 'Hoàn tất'}
        </Badge>
      </div>

      {/* Clock in */}
      <div className="flex items-start gap-3" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: HNH.success50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="arrow-up" size={14} color={HNH.success} stroke={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Vào ca</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{inTime}</span>
          </div>
          {activity.gps_in_company_name && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.success} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink2, fontWeight: 600 }}>
                {activity.gps_in_company_name}
                {activity.gps_in_distance_m != null && (
                  <span style={{ color: HNH.ink3, fontWeight: 400 }}> · {activity.gps_in_distance_m}m</span>
                )}
              </span>
            </div>
          )}
          {activity.gps_in_company_address && (
            <div style={{ marginTop: 1, paddingLeft: 15 }}>
              <span style={{ fontSize: 10, color: HNH.ink3 }}>{activity.gps_in_company_address}</span>
            </div>
          )}
          {!activity.gps_in_company_name && (hasInGps || activity.clock_in_address) && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.ink3} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink3 }}>
                {activity.clock_in_address || `${Number(activity.clock_in_latitude).toFixed(5)}, ${Number(activity.clock_in_longitude).toFixed(5)}`}
              </span>
            </div>
          )}
        </div>
        {activity.clock_in_photo && (
          <PhotoView src={activity.clock_in_photo} label="Vào" />
        )}
      </div>

      {/* Clock out */}
      <div className="flex items-start gap-3" style={{ padding: '8px 0' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: isOpen ? HNH.warn50 : HNH.navy50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={isOpen ? 'clock' : 'arrow-r'} size={14} color={isOpen ? HNH.warn : HNH.navy} stroke={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Ra ca</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: isOpen ? HNH.warn : HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>
              {isOpen ? 'Chưa ra' : outTime}
            </span>
          </div>
          {activity.gps_out_company_name && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.navy} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink2, fontWeight: 600 }}>
                {activity.gps_out_company_name}
                {activity.gps_out_distance_m != null && (
                  <span style={{ color: HNH.ink3, fontWeight: 400 }}> · {activity.gps_out_distance_m}m</span>
                )}
              </span>
            </div>
          )}
          {activity.gps_out_company_address && (
            <div style={{ marginTop: 1, paddingLeft: 15 }}>
              <span style={{ fontSize: 10, color: HNH.ink3 }}>{activity.gps_out_company_address}</span>
            </div>
          )}
          {!activity.gps_out_company_name && (hasOutGps || activity.clock_out_address) && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.ink3} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink3 }}>
                {activity.clock_out_address || `${Number(activity.clock_out_latitude).toFixed(5)}, ${Number(activity.clock_out_longitude).toFixed(5)}`}
              </span>
            </div>
          )}
        </div>
        {activity.clock_out_photo && (
          <PhotoView src={activity.clock_out_photo} label="Ra" />
        )}
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
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Ra</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{clockOut}</div>
                </div>
                <div className="ml-auto" style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Tổng</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.navy, fontFamily: "'Plus Jakarta Sans', monospace" }}>{workedHour}</div>
                </div>
              </div>
            </div>

            {/* Activities */}
            <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
              Hoạt động chấm công
              {activities && <span style={{ color: HNH.ink3, fontWeight: 500 }}> ({activities.length})</span>}
            </div>

            {loading && (
              <div style={{ padding: 30, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>
                Đang tải...
              </div>
            )}

            {!loading && activities && activities.length === 0 && (
              <div style={{
                padding: 30, textAlign: 'center',
                background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}`,
              }}>
                <Icon name="clock" size={28} color={HNH.ink3} />
                <div style={{ color: HNH.ink3, fontSize: 13, marginTop: 8 }}>Chưa có hoạt động</div>
              </div>
            )}

            {activities && activities.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {activities.map((act, i) => (
                  <ActivityCard key={act.id} activity={act} index={i} total={activities.length} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
