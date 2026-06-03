import { useState, useRef, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from './ui/Icon'
import { Badge } from './ui/Badge'
import { useGeolocation } from '../lib/useGeolocation'
import { useTablet } from '../lib/useTablet'

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

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setCameraReady(false)
      setCameraError(null)
      setSelfie(null)
      setDone(null)
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
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [open])

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
  }, [isClockedIn, onClockIn, onClockOut, capture, geo.position, onClose])

  if (!open) return null

  const isOutside = geo.inside === false

  const gpsLabel = geo.loading
    ? 'Đang định vị...'
    : geo.error
      ? geo.error
      : geo.inside
        ? `185-187 Lê Thánh Tôn · ±${Math.round(geo.position!.accuracy)}m`
        : geo.distance != null
          ? `Cách VP ${geo.distance < 1000 ? `${Math.round(geo.distance)}m` : `${(geo.distance / 1000).toFixed(1)}km`}`
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
    : isClockedIn
      ? `radial-gradient(circle at 30% 30%, ${HNH.navy} 0%, ${HNH.navy2} 100%)`
    : isOutside
      ? `radial-gradient(circle at 30% 30%, #e67e22 0%, #d35400 100%)`
    : `radial-gradient(circle at 30% 30%, #d83641 0%, ${HNH.red} 50%, ${HNH.redDark} 100%)`

  const btnShadow = (acting || done)
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
                  {cameraError}
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
                {geo.inside === true && <Badge tone="success" size="s">Hợp lệ</Badge>}
                {geo.inside === false && <Badge tone="red" size="s">Ngoài VP</Badge>}
              </div>
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* GPS warning (before action) */}
            {!done && isOutside && (
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
                disabled={acting || !!done}
                className="relative flex flex-col items-center justify-center gap-2 border-none cursor-pointer mx-auto"
                style={{
                  marginTop: 18, width: 130, height: 130, borderRadius: '50%',
                  background: btnBg,
                  color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
                  fontSize: 14, letterSpacing: 0.3,
                  opacity: acting ? 0.6 : 1,
                  boxShadow: btnShadow,
                  transition: 'all 0.3s ease',
                }}
              >
                <Icon name={done ? (done === 'valid' ? 'check' : 'clock') : isClockedIn ? 'clock' : 'check'} size={28} color="#fff" stroke={3} />
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
                    : geo.inside ? `±${Math.round(geo.position!.accuracy)}m`
                    : geo.distance != null ? `Cách ${Math.round(geo.distance)}m`
                    : '—'
                }
                ok={geo.inside === true}
                bad={geo.inside === false}
                warn={!!geo.error}
              />
              <VerifyChip
                icon="sparkle"
                label="Khuôn mặt"
                value={selfie ? 'Đã chụp' : cameraReady ? 'Sẵn sàng' : cameraError ?? 'Đang mở...'}
                ok={!!selfie}
                warn={!!cameraError}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
