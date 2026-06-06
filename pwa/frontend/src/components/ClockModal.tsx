import { useState, useRef, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'
import { Badge } from './ui/Badge'
import { useGeolocation } from '../lib/useGeolocation'
import { useTablet } from '../lib/useTablet'
import { api } from '../lib/api'

interface Office {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  radius: number | null
  active: boolean
}

interface ClockModalProps {
  open: boolean
  onClose: () => void
  isClockedIn: boolean
  clockInTime: string | null
  duration: string
  shiftName: string
  acting: boolean
  onClockIn: (body?: Record<string, unknown>) => Promise<{ geo_valid: boolean | null } | null>
  onClockOut: (body?: Record<string, unknown>) => Promise<{ geo_valid: boolean | null } | null>
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

const MINIMAP_ZOOM = 15
const TILE_SZ = 256

function tileFrac(lat: number, lng: number) {
  const n = Math.pow(2, MINIMAP_ZOOM)
  const xf = (lng + 180) / 360 * n
  const sinLat = Math.sin(lat * Math.PI / 180)
  const yf = (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2 * n
  return { xf, yf }
}

function MiniMap({ officeLat, officeLng, officeRadius, userLat, userLng }: {
  officeLat: number; officeLng: number; officeRadius: number;
  userLat: number; userLng: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mapW, setMapW] = useState(0)
  const mapH = 190

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setMapW(el.offsetWidth)
    const ro = new ResizeObserver(() => setMapW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const center = tileFrac(officeLat, officeLng)
  const cTileX = Math.floor(center.xf)
  const cTileY = Math.floor(center.yf)
  const offPxX = (center.xf - cTileX) * TILE_SZ
  const offPxY = (center.yf - cTileY) * TILE_SZ
  const halfW = mapW / 2
  const halfH = mapH / 2

  const rangeX = Math.ceil(halfW / TILE_SZ) + 1
  const rangeY = Math.ceil(halfH / TILE_SZ) + 1
  const maxTile = Math.pow(2, MINIMAP_ZOOM) - 1
  const tiles: { key: string; sx: number; sy: number; tx: number; ty: number }[] = []
  for (let dy = -rangeY; dy <= rangeY; dy++) {
    for (let dx = -rangeX; dx <= rangeX; dx++) {
      const tx = cTileX + dx
      const ty = cTileY + dy
      if (tx < 0 || ty < 0 || tx > maxTile || ty > maxTile) continue
      tiles.push({ key: `${tx}-${ty}`, tx, ty, sx: halfW - offPxX + dx * TILE_SZ, sy: halfH - offPxY + dy * TILE_SZ })
    }
  }

  const uFrac = tileFrac(userLat, userLng)
  const uSX = halfW + (uFrac.xf - center.xf) * TILE_SZ
  const uSY = halfH + (uFrac.yf - center.yf) * TILE_SZ

  const metersPerPx = (2 * Math.PI * 6371000 * Math.cos(officeLat * Math.PI / 180)) / (Math.pow(2, MINIMAP_ZOOM) * TILE_SZ)
  const radiusPx = officeRadius / metersPerPx

  return (
    <div ref={containerRef} style={{ width: '100%', height: mapH, borderRadius: 14, overflow: 'hidden', border: `1px solid ${HNH.line}`, position: 'relative', background: '#e8e0d8' }}>
      {mapW > 0 && tiles.map(t => (
        <img key={t.key} src={`https://tile.openstreetmap.org/${MINIMAP_ZOOM}/${t.tx}/${t.ty}.png`} alt=""
          style={{ position: 'absolute', left: t.sx, top: t.sy, width: TILE_SZ, height: TILE_SZ, display: 'block' }} />
      ))}
      {mapW > 0 && (
        <svg style={{ position: 'absolute', inset: 0, width: mapW, height: mapH, pointerEvents: 'none' }} viewBox={`0 0 ${mapW} ${mapH}`}>
          <circle cx={halfW} cy={halfH} r={radiusPx} fill="rgba(192,34,43,0.13)" />
          <circle cx={halfW} cy={halfH} r={radiusPx} fill="none" stroke="#c0222b" strokeWidth={1.5} strokeDasharray="6,4" />
          <circle cx={halfW} cy={halfH} r={8} fill="#c0222b" stroke="white" strokeWidth={2.5} />
          <circle cx={uSX} cy={uSY} r={14} fill="none" stroke="#142b6f" strokeWidth={1} opacity={0.35} />
          <circle cx={uSX} cy={uSY} r={7} fill="#142b6f" stroke="white" strokeWidth={2.5} />
        </svg>
      )}
      <div style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 8, color: '#555', background: 'rgba(255,255,255,0.78)', borderRadius: 3, padding: '1px 4px', lineHeight: 1.5 }}>
        © OpenStreetMap
      </div>
    </div>
  )
}

function VerifyChip({ icon, label, value, ok, warn, bad }: {
  icon: string; label: string; value: string; ok?: boolean; warn?: boolean; bad?: boolean
}) {
  const c = ok ? HNH.success : bad ? HNH.red : warn ? HNH.warn : HNH.ink3
  const bg = ok ? HNH.success50 : bad ? HNH.red50 : warn ? HNH.warn50 : HNH.cream2
  return (
    <div className="flex items-center gap-2.5" style={{ background: '#fff', borderRadius: 14, padding: '10px 12px', border: `1px solid ${HNH.line}` }}>
      <div className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: bg }}>
        <Icon name={icon} size={15} color={c} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
        <div className="truncate" style={{ fontSize: 12, fontWeight: 600, color: HNH.ink }}>{value}</div>
      </div>
      {ok && <Icon name="check" size={14} color={HNH.success} stroke={2.5} />}
    </div>
  )
}

const OOF_TYPES = [
  { id: 'remote', label: 'Làm từ xa' },
  { id: 'client', label: 'Gặp KH' },
  { id: 'business_trip', label: 'Công tác' },
  { id: 'event', label: 'Sự kiện' },
  { id: 'other', label: 'Khác' },
]

type DoneState = null | 'valid' | 'pending'

export function ClockModal({ open, onClose, isClockedIn, clockInTime, duration, shiftName, acting, onClockIn, onClockOut }: ClockModalProps) {
  const geo = useGeolocation()
  const isTablet = useTablet()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [done, setDone] = useState<DoneState>(null)
  const wasClockedIn = useRef(false)
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  // TT Bổ sung
  const [workLocation, setWorkLocation] = useState<'in_office' | 'out_of_office'>('in_office')
  const [oofType, setOofType] = useState('')
  const [oofNote, setOofNote] = useState('')

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setCameraReady(false)
      setCameraError(null)
      setSelfie(null)
      setDone(null)
      setWorkLocation('in_office')
      setOofType('')
      setOofNote('')
      return
    }
    wasClockedIn.current = isClockedIn
    let mounted = true
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraReady(true)
      } catch {
        if (mounted) setCameraError('Chưa cấp quyền Camera')
      }
    }
    start()
    geo.refresh()
    api.get<Office[]>('/api/attendance/offices/').then(data => {
      if (!mounted) return
      setOffices(data)
      if (data.length > 0) setSelectedOfficeId(data[0].id)
    }).catch(() => {})
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [open])

  // Sort offices by distance when GPS is ready; auto-select nearest
  const officesWithDist = offices.map(o => ({
    ...o,
    dist: geo.position ? haversineM(geo.position.lat, geo.position.lng, o.latitude, o.longitude) : null,
  })).sort((a, b) => {
    if (a.dist === null && b.dist === null) return 0
    if (a.dist === null) return 1
    if (b.dist === null) return -1
    return a.dist - b.dist
  })

  useEffect(() => {
    if (geo.position && officesWithDist.length > 0 && officesWithDist[0].dist !== null) {
      setSelectedOfficeId(officesWithDist[0].id)
    }
  }, [geo.position?.lat, geo.position?.lng])   // eslint-disable-line react-hooks/exhaustive-deps

  const selectedOffice = officesWithDist.find(o => o.id === selectedOfficeId) ?? officesWithDist[0] ?? null

  // Compute geo status against selected office
  const selectedDist = selectedOffice?.dist ?? null
  const selectedRadius = selectedOffice?.radius ?? 200
  const isInsideSelected = selectedDist !== null ? selectedDist <= selectedRadius : null

  const capture = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const data = canvas.toDataURL('image/jpeg', 0.8)
    setSelfie(data)
    return data
  }, [])

  const handleAction = useCallback(async () => {
    const dataUrl = capture()
    const gpsBody: Record<string, unknown> = {}
    if (geo.position) {
      gpsBody.latitude = geo.position.lat
      gpsBody.longitude = geo.position.lng
    }
    if (dataUrl) {
      gpsBody.photo = dataUrl
    } else if (cameraError) {
      gpsBody.no_camera = true
    }
    if (selectedOfficeId !== null) {
      gpsBody.office_id = selectedOfficeId
    }
    gpsBody.work_location = workLocation
    if (workLocation === 'out_of_office' && oofType) {
      gpsBody.out_of_office_type = oofType
      if (oofType === 'other' && oofNote.trim()) {
        gpsBody.out_of_office_note = oofNote.trim()
      }
    }

    try {
      let res: { geo_valid: boolean | null } | null = null
      if (isClockedIn) {
        res = await onClockOut(gpsBody)
      } else {
        res = await onClockIn(gpsBody)
      }
      const geoValid = res?.geo_valid
      setDone(geoValid === false ? 'pending' : 'valid')
      setTimeout(() => onClose(), geoValid === false ? 2500 : 1200)
    } catch {
      setTimeout(() => onClose(), 1000)
    }
  }, [isClockedIn, onClockIn, onClockOut, capture, geo.position, selectedOfficeId, onClose, cameraError, workLocation, oofType, oofNote])

  if (!open) return null

  const isOutside = isInsideSelected === false
  const gpsBlocked = geo.loading && !isClockedIn

  const gpsLabel = geo.loading
    ? 'Đang định vị...'
    : geo.error
      ? geo.error
      : isInsideSelected
        ? `${selectedOffice?.name ?? 'VP'} · ±${Math.round(geo.position!.accuracy)}m`
        : selectedDist !== null
          ? `Cách ${selectedOffice?.name ?? 'VP'} ${fmtDist(selectedDist)}`
          : 'Không xác định'

  const statusColor =
    done === 'valid' ? HNH.success
    : done === 'pending' ? HNH.warn
    : isClockedIn ? HNH.success
    : isOutside ? HNH.warn
    : HNH.red

  const statusText =
    done === 'valid'
      ? (wasClockedIn.current ? 'ĐÃ KẾT THÚC CA' : 'ĐÃ CHẤM CÔNG VÀO CA')
    : done === 'pending'
      ? 'CHỜ XÁC NHẬN'
    : gpsBlocked
      ? 'ĐANG ĐỊNH VỊ GPS...'
    : isClockedIn
      ? 'ĐANG LÀM VIỆC'
    : isOutside
      ? 'NGOÀI KHU VỰC VĂN PHÒNG'
    : 'SẴN SÀNG CHẤM CÔNG'

  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')

  const btnBg =
    done === 'valid' ? HNH.success
    : done === 'pending' ? HNH.warn
    : acting ? HNH.ink3
    : gpsBlocked ? HNH.ink3
    : isClockedIn
      ? `radial-gradient(circle at 30% 30%, ${HNH.navy} 0%, ${HNH.navy2} 100%)`
    : isOutside
      ? `radial-gradient(circle at 30% 30%, #e67e22 0%, #d35400 100%)`
    : `radial-gradient(circle at 30% 30%, #d83641 0%, ${HNH.red} 50%, ${HNH.redDark} 100%)`

  const btnShadow = (acting || done || gpsBlocked)
    ? 'none'
    : isClockedIn
      ? '0 16px 32px rgba(20,43,111,0.3), inset 0 -4px 12px rgba(0,0,0,0.18), inset 0 4px 12px rgba(255,255,255,0.25)'
    : isOutside
      ? '0 16px 32px rgba(211,84,0,0.3), inset 0 -4px 12px rgba(0,0,0,0.18), inset 0 4px 12px rgba(255,255,255,0.25)'
    : '0 16px 32px rgba(192,34,43,0.3), inset 0 -4px 12px rgba(0,0,0,0.18), inset 0 4px 12px rgba(255,255,255,0.25)'

  const btnLabel =
    done === 'valid' ? 'THÀNH\nCÔNG'
    : done === 'pending' ? 'CHỜ XÁC\nNHẬN'
    : acting ? 'ĐANG\nXỬ LÝ...'
    : gpsBlocked ? 'ĐỊNH VỊ\nGPS...'
    : isClockedIn ? 'KẾT THÚC\nCA'
    : isOutside ? 'CHẤM CÔNG\nNGOÀI VP'
    : 'CHẤM\nVÀO CA'

  return (
    <div
      className={isTablet ? 'fixed inset-0 flex items-center justify-center' : 'fixed inset-0 flex flex-col'}
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
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
          <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${HNH.line}` }}>
            <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
              <Icon name="x" size={18} color={HNH.ink} stroke={2} />
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Chấm công</div>
            <div style={{ width: 36 }} />
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            {/* Camera preview */}
            <div className="relative overflow-hidden" style={{ borderRadius: 18, background: '#1a1a2e', marginBottom: 12, border: `1px solid ${HNH.line}` }}>
              <video
                ref={videoRef}
                autoPlay playsInline muted
                style={{
                  width: '100%', height: 220, objectFit: 'cover',
                  transform: 'scaleX(-1)', display: selfie ? 'none' : 'block',
                }}
              />
              {selfie && (
                <img src={selfie} alt="Selfie" style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
              )}
              {!cameraReady && !cameraError && !selfie && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                  Đang mở camera...
                </div>
              )}
              {cameraError && !selfie && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                  <Icon name="shield" size={32} color="rgba(255,255,255,0.3)" />
                  <div>{cameraError}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Chấm công sẽ được ghi chú "nocam"</div>
                </div>
              )}

              {/* GPS overlay on camera */}
              <div
                className="absolute flex items-center gap-1.5"
                style={{
                  bottom: 10, left: 10, right: 10,
                  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                  borderRadius: 10, padding: '8px 12px',
                }}
              >
                <Icon name="pin" size={14} color={geo.inside ? '#4ade80' : geo.inside === false ? '#f87171' : '#94a3b8'} />
                <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, flex: 1 }}>{gpsLabel}</span>
                {geo.loading && <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {!geo.loading && geo.inside === true && <Badge tone="success" size="s">Hợp lệ</Badge>}
                {!geo.loading && geo.inside === false && <Badge tone="red" size="s">Ngoài VP</Badge>}
              </div>
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Office picker */}
            {officesWithDist.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
                  Địa điểm chấm công
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {officesWithDist.map(o => {
                    const isSelected = o.id === selectedOfficeId
                    const inside = o.dist !== null ? o.dist <= (o.radius ?? 200) : null
                    return (
                      <button
                        key={o.id}
                        onClick={() => setSelectedOfficeId(o.id)}
                        className="flex-shrink-0 border-none cursor-pointer text-left"
                        style={{
                          borderRadius: 12,
                          padding: '8px 12px',
                          background: isSelected ? HNH.navy : '#fff',
                          border: `1.5px solid ${isSelected ? HNH.navy : HNH.line}`,
                          minWidth: 120,
                          maxWidth: 180,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: isSelected ? '#fff' : HNH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.name.replace(/^(Công ty|Cty)\s+/i, '')}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 2, color: isSelected ? 'rgba(255,255,255,0.7)' : HNH.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.dist !== null
                            ? <span style={{ color: inside ? (isSelected ? '#86efac' : HNH.success) : (isSelected ? '#fca5a5' : HNH.red), fontWeight: 700 }}>
                                {fmtDist(o.dist)} {inside ? '· Trong VP' : '· Ngoài VP'}
                              </span>
                            : o.address.slice(0, 28)
                          }
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Mini map — shown when user < 1km from selected office */}
            {!done && selectedOffice && geo.position && selectedDist !== null && selectedDist < 1000 && (
              <div style={{ marginBottom: 12 }}>
                <MiniMap
                  officeLat={selectedOffice.latitude}
                  officeLng={selectedOffice.longitude}
                  officeRadius={selectedOffice.radius ?? 200}
                  userLat={geo.position.lat}
                  userLng={geo.position.lng}
                />
              </div>
            )}

            {/* GPS blocked warning */}
            {!done && gpsBlocked && (
              <div
                className="flex items-center gap-2"
                style={{
                  background: HNH.navy50, border: `1px solid ${HNH.navy}50`,
                  borderRadius: 14, padding: '12px 14px', marginBottom: 12,
                }}
              >
                <div style={{ width: 18, height: 18, border: `2.5px solid ${HNH.navy}40`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.navy }}>Đang lấy tọa độ GPS</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>
                    Vui lòng chờ GPS xác định vị trí trước khi chấm công
                  </div>
                </div>
              </div>
            )}

            {/* GPS outside warning */}
            {!done && !gpsBlocked && isOutside && (
              <div
                className="flex items-center gap-2"
                style={{
                  background: HNH.warn50, border: `1px solid ${HNH.warn}`,
                  borderRadius: 14, padding: '12px 14px', marginBottom: 12,
                }}
              >
                <Icon name="shield" size={18} color={HNH.warn} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.warn }}>
                    Ngoài khu vực văn phòng
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>
                    Lượt chấm công sẽ cần xác nhận từ quản lý
                  </div>
                </div>
              </div>
            )}

            {/* Pending result banner */}
            {done === 'pending' && (
              <div
                className="flex items-center gap-2"
                style={{
                  background: HNH.warn50, border: `1px solid ${HNH.warn}`,
                  borderRadius: 14, padding: '12px 14px', marginBottom: 12,
                }}
              >
                <Icon name="clock" size={18} color={HNH.warn} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.warn }}>
                    Chấm công chờ xác nhận
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>
                    GPS ngoài khu vực VP — lượt chấm công cần quản lý phê duyệt
                  </div>
                </div>
              </div>
            )}

            {/* Valid result banner */}
            {done === 'valid' && (
              <div
                className="flex items-center gap-2"
                style={{
                  background: HNH.success50, border: `1px solid ${HNH.success}`,
                  borderRadius: 14, padding: '12px 14px', marginBottom: 12,
                }}
              >
                <Icon name="check" size={18} color={HNH.success} />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.success }}>
                  Chấm công hợp lệ
                </div>
              </div>
            )}

            {/* Status + Big button */}
            <div
              className="relative overflow-hidden text-center"
              style={{
                background: '#fff', borderRadius: 22, padding: '20px 18px',
                border: `1px solid ${HNH.line}`,
                boxShadow: '0 1px 2px rgba(15,20,40,0.04)',
              }}
            >
              <div
                className="absolute"
                style={{
                  left: '50%', top: 20, transform: 'translateX(-50%)',
                  width: 180, height: 180, borderRadius: '50%',
                  background: `radial-gradient(circle, ${
                    done === 'valid' ? HNH.success50
                    : done === 'pending' ? HNH.warn50
                    : isOutside ? 'rgba(201,122,22,0.12)'
                    : isClockedIn ? HNH.success50
                    : HNH.red50
                  } 0%, transparent 70%)`,
                }}
              />

              <div className="relative" style={{ fontSize: 11, color: statusColor, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {statusText}
              </div>

              <div className="relative" style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 48, fontWeight: 800,
                color: HNH.ink, letterSpacing: -2.5, lineHeight: 1, marginTop: 8,
              }}>
                {isClockedIn && !done
                  ? duration.split(':').map((p, i) => (
                      <span key={i}>{i > 0 && <span style={{ color: HNH.ink3 }}>:</span>}{p}</span>
                    ))
                  : <>{hh}<span style={{ color: HNH.ink3 }}>:</span>{mm}</>
                }
              </div>
              <div className="relative" style={{ fontSize: 12, color: HNH.ink3, marginTop: 4 }}>
                {shiftName}{clockInTime ? ` · Vào lúc ${clockInTime}` : ''}
              </div>

              <button
                onClick={handleAction}
                disabled={acting || !!done || gpsBlocked}
                className="relative flex flex-col items-center justify-center gap-2 border-none mx-auto"
                style={{
                  marginTop: 18, width: 130, height: 130, borderRadius: '50%',
                  background: btnBg,
                  color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
                  fontSize: 14, letterSpacing: 0.3,
                  opacity: (acting || gpsBlocked) ? 0.6 : 1,
                  boxShadow: btnShadow,
                  transition: 'all 0.3s ease',
                  cursor: (acting || gpsBlocked || !!done) ? 'not-allowed' : 'pointer',
                }}
              >
                {gpsBlocked
                  ? <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  : <Icon name={done ? (done === 'valid' ? 'check' : 'clock') : isClockedIn ? 'clock' : 'check'} size={28} color="#fff" stroke={3} />
                }
                <div style={{ whiteSpace: 'pre-line', lineHeight: 1.2 }}>{btnLabel}</div>
              </button>

              {isClockedIn && clockInTime && !done && (
                <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.success, fontWeight: 600, marginTop: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.success }} />
                  Đã chấm công lúc {clockInTime}
                </div>
              )}
              {done === 'valid' && (
                <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.success, fontWeight: 600, marginTop: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.success }} />
                  {wasClockedIn.current ? `Kết thúc ca lúc ${hh}:${mm}` : `Vào ca lúc ${hh}:${mm}`}
                </div>
              )}
              {done === 'pending' && (
                <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.warn, fontWeight: 600, marginTop: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.warn }} />
                  {wasClockedIn.current ? `Kết thúc ca lúc ${hh}:${mm} · Chờ duyệt` : `Vào ca lúc ${hh}:${mm} · Chờ duyệt`}
                </div>
              )}
            </div>

            {/* Verification chips */}
            <div className="grid grid-cols-2 gap-2" style={{ marginTop: 12 }}>
              <VerifyChip
                icon="pin"
                label="GPS"
                value={
                  geo.loading ? 'Đang định vị...'
                    : geo.error ? geo.error
                    : isInsideSelected ? `±${Math.round(geo.position!.accuracy)}m`
                    : selectedDist !== null ? `Cách ${fmtDist(selectedDist)}`
                    : '—'
                }
                ok={isInsideSelected === true}
                bad={isInsideSelected === false}
                warn={!!geo.error}
              />
              <VerifyChip
                icon="sparkle"
                label="Khuôn mặt"
                value={selfie ? 'Đã chụp' : cameraReady ? 'Sẵn sàng' : cameraError ? `${cameraError} (nocam)` : 'Đang mở...'}
                ok={!!selfie}
                warn={!!cameraError}
              />
            </div>

            {/* TT Bổ sung — chỉ hiển thị khi chưa xong */}
            {!done && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
                  TT Bổ sung
                </div>
                {/* Trong VP / Ngoài VP toggle */}
                <div className="flex gap-2" style={{ marginBottom: workLocation === 'out_of_office' ? 10 : 0 }}>
                  {(['in_office', 'out_of_office'] as const).map(loc => {
                    const sel = workLocation === loc
                    const isOof = loc === 'out_of_office'
                    return (
                      <button
                        key={loc}
                        onClick={() => { setWorkLocation(loc); if (loc === 'in_office') { setOofType(''); setOofNote('') } }}
                        className="flex-1 flex items-center justify-center gap-1.5 border-none cursor-pointer"
                        style={{
                          padding: '10px 0', borderRadius: 12,
                          background: sel ? (isOof ? HNH.warn50 : HNH.success50) : '#fff',
                          border: `1.5px solid ${sel ? (isOof ? HNH.warn : HNH.success) : HNH.line}`,
                          fontSize: 13, fontWeight: 700,
                          color: sel ? (isOof ? HNH.warn : HNH.success) : HNH.ink3,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Icon name={isOof ? 'pin' : 'home'} size={14} color={sel ? (isOof ? HNH.warn : HNH.success) : HNH.ink3} stroke={2} />
                        {isOof ? 'Ngoài VP' : 'Trong VP'}
                      </button>
                    )
                  })}
                </div>

                {/* Phân loại Ngoài VP */}
                {workLocation === 'out_of_office' && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.3, marginBottom: 6 }}>
                      Phân loại
                    </div>
                    <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
                      {OOF_TYPES.map(t => {
                        const sel = oofType === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => { setOofType(t.id); if (t.id !== 'other') setOofNote('') }}
                            className="border-none cursor-pointer"
                            style={{
                              padding: '7px 14px', borderRadius: 20,
                              background: sel ? HNH.navy : '#fff',
                              border: `1.5px solid ${sel ? HNH.navy : HNH.line}`,
                              fontSize: 12.5, fontWeight: 700,
                              color: sel ? '#fff' : HNH.ink3,
                              transition: 'all 0.15s',
                            }}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* Ô nhập khi chọn Khác */}
                    {oofType === 'other' && (
                      <textarea
                        value={oofNote}
                        onChange={e => setOofNote(e.target.value)}
                        placeholder="Mô tả thêm..."
                        rows={2}
                        style={{
                          width: '100%', borderRadius: 12,
                          border: `1.5px solid ${HNH.navy}60`,
                          padding: '10px 12px', fontSize: 13,
                          fontFamily: 'inherit', color: HNH.ink,
                          background: HNH.navy50,
                          resize: 'none', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* GPS coordinates: device + selected office side by side */}
            {geo.position && (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${HNH.line}`, padding: '7px 10px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>
                    Thiết bị
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: HNH.ink, letterSpacing: 0.1, lineHeight: 1.7 }}>
                    <span style={{ color: HNH.ink3, marginRight: 3 }}>Lat</span>{geo.position.lat.toFixed(8)}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: HNH.ink, letterSpacing: 0.1, lineHeight: 1.7 }}>
                    <span style={{ color: HNH.ink3, marginRight: 3 }}>Lng</span>{geo.position.lng.toFixed(8)}
                  </div>
                  <div style={{ fontSize: 9.5, color: HNH.ink3, marginTop: 2 }}>±{Math.round(geo.position.accuracy)}m</div>
                </div>
                <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${HNH.line}`, padding: '7px 10px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>
                    Văn phòng
                  </div>
                  {selectedOffice ? (
                    <>
                      <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: HNH.ink, letterSpacing: 0.1, lineHeight: 1.7 }}>
                        <span style={{ color: HNH.ink3, marginRight: 3 }}>Lat</span>{selectedOffice.latitude.toFixed(8)}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: HNH.ink, letterSpacing: 0.1, lineHeight: 1.7 }}>
                        <span style={{ color: HNH.ink3, marginRight: 3 }}>Lng</span>{selectedOffice.longitude.toFixed(8)}
                      </div>
                      <div style={{ fontSize: 9.5, color: HNH.ink3, marginTop: 2 }}>r={selectedOffice.radius ?? 200}m</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10.5, color: HNH.ink3, marginTop: 4 }}>Chưa chọn VP</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
