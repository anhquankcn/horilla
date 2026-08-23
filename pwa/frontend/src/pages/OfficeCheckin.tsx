import { useState, useRef, useEffect, useCallback } from 'react'
import { HNH } from '../lib/theme'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { TopBar } from '../components/layout/TopBar'
import { useAuth } from '../lib/auth'
import { useClock } from '../lib/useClock'
import { useGeolocation } from '../lib/useGeolocation'

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

export function OfficeCheckinPage() {
  const { employee } = useAuth()
  const { isClockedIn, stale: clockStale, duration, clockInTime, clockIn, clockOut, acting } = useClock()
  const geo = useGeolocation()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [outsideCheckin, setOutsideCheckin] = useState(false)

  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const shiftName = employee?.shift_name ?? 'Ca hành chính'

  useEffect(() => {
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
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

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

  const retake = useCallback(() => { setSelfie(null) }, [])

  const handleAction = useCallback(async () => {
    capture()
    const gpsBody: Record<string, unknown> = {}
    if (geo.position) {
      gpsBody.latitude = geo.position.lat
      gpsBody.longitude = geo.position.lng
    }
    if (isClockedIn) {
      await clockOut(gpsBody)
      setOutsideCheckin(false)
    } else {
      if (geo.inside === false) setOutsideCheckin(true)
      await clockIn(gpsBody)
    }
  }, [isClockedIn, clockIn, clockOut, capture, geo.position, geo.inside])

  const gpsLabel = geo.loading
    ? 'Đang định vị...'
    : geo.error
      ? geo.error
      : geo.inside
        ? `185-187 Lê Thánh Tôn · ±${Math.round(geo.position!.accuracy)}m`
        : geo.distance != null
          ? `Cách VP ${geo.distance < 1000 ? `${Math.round(geo.distance)}m` : `${(geo.distance / 1000).toFixed(1)}km`}`
          : 'Không xác định'

  const isOutside = geo.inside === false
  const statusColor = isClockedIn ? HNH.success : isOutside ? HNH.red : HNH.red
  const statusText = isClockedIn
    ? 'ĐANG LÀM VIỆC'
    : isOutside
      ? 'NGOÀI KHU VỰC VĂN PHÒNG'
      : 'SẴN SÀNG CHẤM CÔNG'

  const btnBg = acting
    ? HNH.ink3
    : isClockedIn
      ? `radial-gradient(circle at 30% 30%, ${HNH.navy} 0%, ${HNH.navy2} 100%)`
      : isOutside
        ? `radial-gradient(circle at 30% 30%, #e67e22 0%, #d35400 100%)`
        : `radial-gradient(circle at 30% 30%, #d83641 0%, ${HNH.red} 50%, ${HNH.redDark} 100%)`
  const btnShadow = acting
    ? 'none'
    : isClockedIn
      ? '0 16px 32px rgba(20,43,111,0.3), inset 0 -4px 12px rgba(0,0,0,0.18), inset 0 4px 12px rgba(255,255,255,0.25)'
      : isOutside
        ? '0 16px 32px rgba(211,84,0,0.3), inset 0 -4px 12px rgba(0,0,0,0.18), inset 0 4px 12px rgba(255,255,255,0.25)'
        : '0 16px 32px rgba(192,34,43,0.3), inset 0 -4px 12px rgba(0,0,0,0.18), inset 0 4px 12px rgba(255,255,255,0.25)'
  const btnLabel = acting
    ? 'ĐANG\nXỬ LÝ...'
    : isClockedIn
      ? 'KẾT THÚC\nCA'
      : isOutside
        ? 'CHẤM CÔNG\nNGOÀI VP'
        : 'CHẤM\nVÀO CA'

  return (
    <div style={{ background: HNH.cream, minHeight: '100%' }}>
      <TopBar
        title="Chấm công"
        sub="VĂN PHÒNG SGN"
        trailing={
          <button
            className="flex items-center justify-center border-none cursor-pointer"
            style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 2px rgba(15,20,40,0.06)' }}
          >
            <Icon name="cal" size={18} color={HNH.ink} />
          </button>
        }
      />

      <div style={{ padding: '0 20px 14px' }}>
        {/* Mode toggle */}
        <div className="flex gap-1" style={{ padding: 4, background: HNH.cream2, borderRadius: 12, marginBottom: 12 }}>
          <div className="flex-1 text-center" style={{ padding: '8px 10px', borderRadius: 9, background: '#fff', fontSize: 12.5, fontWeight: 700, color: HNH.ink, boxShadow: '0 1px 3px rgba(15,20,40,0.06)' }}>
            Văn phòng
          </div>
          <div className="flex-1 text-center" style={{ padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: HNH.ink3 }}>
            Theo tour
          </div>
        </div>

        {/* Camera preview */}
        <div
          className="relative overflow-hidden"
          style={{ borderRadius: 18, background: '#1a1a2e', marginBottom: 12, border: `1px solid ${HNH.line}` }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%', height: 260, objectFit: 'cover',
              transform: 'scaleX(-1)', display: selfie ? 'none' : 'block',
            }}
          />

          {selfie && (
            <div className="relative">
              <img src={selfie} alt="Selfie" style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }} />
              <button
                onClick={retake}
                className="absolute flex items-center gap-1.5 border-none cursor-pointer"
                style={{
                  top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff',
                  borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                }}
              >
                Chụp lại
              </button>
            </div>
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

          {/* GPS overlay */}
          <div
            className="absolute flex items-center gap-1.5"
            style={{
              bottom: 10, left: 10, right: 10,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
              borderRadius: 10, padding: '8px 12px',
            }}
          >
            <Icon
              name="pin"
              size={14}
              color={geo.inside ? '#4ade80' : geo.inside === false ? '#f87171' : '#94a3b8'}
            />
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, flex: 1 }}>
              {gpsLabel}
            </span>
            {geo.inside === true && <Badge tone="success" size="s">Hợp lệ</Badge>}
            {geo.inside === false && <Badge tone="red" size="s">Ngoài VP</Badge>}
          </div>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Outside-geofence warning */}
        {outsideCheckin && (
          <div
            className="flex items-center gap-2"
            style={{
              background: HNH.red50, border: `1px solid ${HNH.red}`,
              borderRadius: 14, padding: '12px 14px', marginBottom: 12,
            }}
          >
            <Icon name="shield" size={18} color={HNH.red} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: HNH.red }}>
              Check-in ngoài khu vực văn phòng — Không hợp lệ
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
                isOutside ? 'rgba(230,126,34,0.12)' : isClockedIn ? HNH.success50 : HNH.red50
              } 0%, transparent 70%)`,
            }}
          />

          <div className="relative" style={{ fontSize: 11, color: statusColor, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {statusText}
          </div>

          <div className="relative" style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 52, fontWeight: 800,
            color: HNH.ink, letterSpacing: -2.5, lineHeight: 1, marginTop: 8,
          }}>
            {isClockedIn
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
            disabled={acting || clockStale}
            className="relative flex flex-col items-center justify-center gap-2 border-none cursor-pointer mx-auto"
            style={{
              marginTop: 18, width: 140, height: 140, borderRadius: '50%',
              background: btnBg,
              color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
              fontSize: 15, letterSpacing: 0.3,
              opacity: acting ? 0.6 : 1,
              boxShadow: btnShadow,
            }}
          >
            <Icon name={isClockedIn ? 'clock' : 'check'} size={32} color="#fff" stroke={3} />
            <div style={{ whiteSpace: 'pre-line', lineHeight: 1.2 }}>{btnLabel}</div>
          </button>

          {isClockedIn && clockInTime && (
            <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.success, fontWeight: 600, marginTop: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.success }} />
              Đã chấm công lúc {clockInTime}
            </div>
          )}
          {!isClockedIn && !outsideCheckin && (
            <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.ink3, fontWeight: 600, marginTop: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.ink3 }} />
              Chưa chấm công hôm nay
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
          <VerifyChip icon="globe" label="WiFi" value="HNH-Office-5G" ok />
          <VerifyChip icon="shield" label="Thiết bị" value="Đã xác thực" ok />
        </div>
      </div>
    </div>
  )
}
