import { useState } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'
import { Badge } from './ui/Badge'
import { useApi } from '../lib/useApi'
import { api } from '../lib/api'
import type { ActivityResp } from './AttendanceActivityDetail'
import { fmtDistance, legInside } from './AttendanceActivityDetail'

interface Props {
  open: boolean
  onClose: () => void
  attendanceDate: string
  clockIn: string
  clockOut: string
  workedHour: string
  onChanged?: () => void
}

// 1 lượt chấm phẳng (mỗi lần chấm = 1 sự kiện)
interface Punch {
  key: string
  time: string            // HH:MM
  photo: string | null
  address: string
  workLocation: string    // in_office | out_of_office | ''
  oofLabel: string        // loại lý do (ngoài VP)
  oofNote: string         // chi tiết khi loại "Khác"
  inside: boolean | null  // trong/ngoài VP theo GPS thực của LƯỢT này
  distanceM: number | null
  noCamera: boolean       // lượt chấm không ảnh (camera lỗi) — chờ HR duyệt
}

function flattenPunches(resp: ActivityResp | null): Punch[] {
  if (!resp) return []
  const out: Punch[] = []
  for (const a of resp.activities) {
    const note = a.out_of_office_type === 'other' ? (a.out_of_office_note || '') : ''
    const noCam = !!a.no_camera
    if (a.clock_in) {
      out.push({ key: `${a.id}-in`, time: a.clock_in, photo: a.clock_in_photo, address: a.clock_in_address,
        workLocation: a.work_location, oofLabel: a.out_of_office_label, oofNote: note,
        inside: legInside(a.clock_in_inside, a.work_location), distanceM: a.clock_in_distance_m ?? null, noCamera: noCam })
    }
    if (a.clock_out) {
      // Lượt RA dùng GPS RA của chính nó (không inherit work_location của activity).
      out.push({ key: `${a.id}-out`, time: a.clock_out, photo: a.clock_out_photo, address: a.clock_out_address,
        workLocation: a.work_location, oofLabel: a.out_of_office_label, oofNote: note,
        inside: legInside(a.clock_out_inside, a.work_location), distanceM: a.clock_out_distance_m ?? null, noCamera: noCam })
    }
  }
  out.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0))
  return out
}

function PhotoView({ src, label }: { src: string; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const [err, setErr] = useState(false)
  const photoUrl = src.startsWith('/') ? src : `/media/${src}`
  return (
    <>
      <button onClick={() => setExpanded(true)} className="border-none cursor-pointer p-0" style={{ background: 'none' }}>
        {err ? (
          <div style={{ width: 56, height: 56, borderRadius: 12, background: '#f1f5f9', border: `1px solid ${HNH.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: HNH.ink3 }}>Lỗi ảnh</div>
        ) : (
          <div className="relative overflow-hidden" style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${HNH.line}` }}>
            <img src={photoUrl} alt={label} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
      </button>
      {expanded && !err && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 10001, background: 'rgba(0,0,0,0.85)' }} onClick={() => setExpanded(false)}>
          <img src={photoUrl} alt={label} onClick={e => e.stopPropagation()} style={{ maxWidth: '92%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }} />
          <button onClick={() => setExpanded(false)} className="absolute border-none cursor-pointer" style={{ top: 'calc(16px + env(safe-area-inset-top, 0px))', right: 16, width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 22 }}>×</button>
        </div>
      )}
    </>
  )
}

function PunchCard({ punch, index, total, role, officeName }: {
  punch: Punch; index: number; total: number; role: 'in' | 'out' | 'mid'; officeName: string
}) {
  const isOut = punch.inside === false
  const isIn = punch.inside === true
  const distLabel = fmtDistance(punch.distanceM)
  const roleLabel = role === 'in' ? 'Giờ vào ca' : role === 'out' ? 'Giờ ra ca' : 'Giờ chấm'
  const accent = role === 'in' ? HNH.success : role === 'out' ? HNH.navy : HNH.ink2
  const accentBg = role === 'in' ? HNH.success50 : role === 'out' ? HNH.navy50 : HNH.cream2

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '12px 14px', border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(15,20,40,0.03)' }}>
      <div className="flex items-start gap-3">
        <div style={{ width: 34, height: 34, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, color: accent }}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: HNH.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>Lượt {index + 1}/{total}</span>
            <Badge tone={role === 'in' ? 'success' : role === 'out' ? 'navy' : 'ink'} size="s">{roleLabel}</Badge>
            {/* Card badge Trong/Ngoài VP */}
            {isIn && <Badge tone="success" size="s">Trong VP</Badge>}
            {isOut && <Badge tone="warn" size="s">Ngoài VP</Badge>}
            {punch.noCamera && <Badge tone="red" size="s">⚠ Không ảnh</Badge>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace", marginTop: 2 }}>{punch.time?.slice(0, 5) || '--:--'}</div>

          {/* Khoảng cách GPS thực của lượt này tới VP */}
          {distLabel && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={isIn ? HNH.success : isOut ? HNH.warn : HNH.ink3} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink2, fontWeight: 600 }}>
                {distLabel}{isIn ? ' · trong khu vực' : isOut ? ' · ngoài khu vực' : ''}
              </span>
            </div>
          )}

          {/* Trong VP: tên địa điểm VP (chữ nhỏ) */}
          {isIn && officeName && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.success} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink2, fontWeight: 600 }}>{officeName}</span>
            </div>
          )}

          {/* Ngoài VP: loại lý do (+ chi tiết nếu Khác) + địa điểm chấm (phường, tỉnh) */}
          {isOut && (
            <>
              {punch.oofLabel && (
                <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
                  <Icon name="map" size={11} color={HNH.warn} stroke={1.5} />
                  <span style={{ fontSize: 10.5, color: '#c2410c', fontWeight: 700 }}>
                    {punch.oofLabel}{punch.oofNote ? `: ${punch.oofNote}` : ''}
                  </span>
                </div>
              )}
              {punch.address && (
                <div className="flex items-center gap-1" style={{ marginTop: 3 }}>
                  <Icon name="pin" size={11} color={HNH.ink3} stroke={1.5} />
                  <span style={{ fontSize: 10.5, color: HNH.ink3 }}>{punch.address}</span>
                </div>
              )}
            </>
          )}

          {/* Không có work_location: hiển thị địa chỉ nếu có */}
          {!isIn && !isOut && punch.address && (
            <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
              <Icon name="pin" size={11} color={HNH.ink3} stroke={1.5} />
              <span style={{ fontSize: 10.5, color: HNH.ink3 }}>{punch.address}</span>
            </div>
          )}
        </div>
        {punch.photo && <PhotoView src={punch.photo} label={`Lượt ${index + 1}`} />}
      </div>
    </div>
  )
}

export function AttendanceDetailModal({ open, onClose, attendanceDate, clockIn, clockOut, workedHour, onChanged }: Props) {
  const { data: resp, loading, refresh } = useApi<ActivityResp>(
    open && attendanceDate ? `/api/attendance/activity-detail/?date=${attendanceDate}` : null
  )
  const [ncoOut, setNcoOut] = useState('')
  const [ncoReason, setNcoReason] = useState('')
  const [ncoBusy, setNcoBusy] = useState(false)

  if (!open) return null

  const d = new Date(attendanceDate)
  const dayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  const dateLabel = `${dayLabels[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

  const punches = flattenPunches(resp ?? null)
  const todayISO = new Date().toISOString().slice(0, 10)
  const isPast = attendanceDate < todayISO
  const punchRole = (i: number): 'in' | 'out' | 'mid' =>
    i === 0 ? 'in' : (isPast && i === punches.length - 1 && punches.length >= 2 ? 'out' : 'mid')
  const isNco = !!resp?.is_nco

  const submitNco = async () => {
    if (!ncoOut || !ncoReason.trim()) return
    setNcoBusy(true)
    try {
      await api.post('/api/attendance/nco/declare/', { date: attendanceDate, clock_out: ncoOut, reason: ncoReason.trim() })
      setNcoOut(''); setNcoReason('')
      refresh?.(); onChanged?.()
    } catch { /* noop */ } finally { setNcoBusy(false) }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', borderRadius: 24, boxShadow: '0 24px 48px rgba(0,0,0,0.25)', margin: '0 16px' }}
      >
        <div style={{ background: HNH.cream, paddingBottom: 20, borderRadius: 24 }}>
          <div className="flex items-center gap-3" style={{ padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}`, borderRadius: '24px 24px 0 0' }}>
            <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer shrink-0" style={{ width: 44, height: 44, borderRadius: 14, background: '#fff', boxShadow: '0 1px 4px rgba(15,20,40,0.09)' }}>
              <svg width="9" height="16" viewBox="0 0 9 16"><path d="M7.5 1.5 1.5 8l6 6.5" stroke={HNH.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, color: HNH.ink, letterSpacing: -0.2 }}>Chi tiết chấm công</div>
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            {/* Summary */}
            <div style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(15,20,40,0.04)', marginBottom: 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, marginBottom: 2 }}>{dateLabel}</div>
              <div className="flex items-center gap-4" style={{ marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Vào</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{clockIn}</div>
                </div>
                <Icon name="arrow-r" size={16} color={HNH.ink3} />
                <div>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{isNco ? 'Ra' : isPast ? 'Ra' : 'Chấm cuối'}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: isNco ? '#ea580c' : HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace" }}>{isNco ? 'NCO' : clockOut}</div>
                </div>
                <div className="ml-auto" style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Tổng</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: HNH.navy, fontFamily: "'Plus Jakarta Sans', monospace" }}>{workedHour}</div>
                </div>
              </div>
            </div>

            {/* NCO: khai báo giờ ra (tự khai) */}
            {isNco && (
              <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: '#c2410c' }}>
                <div><b>NCO — Quên chấm công ra.</b> Có giờ vào nhưng không có giờ ra.</div>
                {resp?.nco_pending ? (
                  <div style={{ marginTop: 8, color: HNH.ink2 }}>
                    Đã khai báo giờ ra: <b>{resp.nco_declared_clock_out}</b> — chờ C&B duyệt.
                    {resp.nco_reason && <div style={{ color: HNH.ink3, fontSize: 12, marginTop: 2 }}>Lý do: {resp.nco_reason}</div>}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ color: HNH.ink2 }}>Khai báo giờ ra thực tế:</div>
                    <input type="time" value={ncoOut} onChange={e => setNcoOut(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 14 }} />
                    <textarea placeholder="Lý do (vd: quên bấm clock-out)" value={ncoReason} onChange={e => setNcoReason(e.target.value)} rows={2} style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${HNH.line}`, fontSize: 13, resize: 'vertical' }} />
                    <button disabled={ncoBusy || !ncoOut || !ncoReason.trim()} onClick={submitNco} style={{ marginTop: 2, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: (ncoOut && ncoReason.trim()) ? HNH.navy : HNH.ink4, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {ncoBusy ? 'Đang gửi…' : 'Khai báo NCO'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Lượt chấm công (phẳng) */}
            <div style={{ fontSize: 13.5, fontWeight: 700, color: HNH.ink, marginBottom: 8 }}>
              Lượt chấm công{!loading && <span style={{ color: HNH.ink3, fontWeight: 500 }}> ({punches.length})</span>}
            </div>

            {loading && <div style={{ padding: 30, textAlign: 'center', color: HNH.ink3, fontSize: 13 }}>Đang tải...</div>}

            {!loading && punches.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', background: '#fff', borderRadius: 16, border: `1px solid ${HNH.line}` }}>
                <Icon name="clock" size={28} color={HNH.ink3} />
                <div style={{ color: HNH.ink3, fontSize: 13, marginTop: 8 }}>Chưa có lượt chấm nào</div>
              </div>
            )}

            {punches.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {punches.map((p, i) => (
                  <PunchCard key={p.key} punch={p} index={i} total={punches.length} role={punchRole(i)} officeName={resp?.office_name ?? ''} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
