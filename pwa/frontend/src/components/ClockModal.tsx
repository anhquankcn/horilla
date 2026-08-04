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
  const mapH = 127

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
          referrerPolicy="origin" loading="eager" decoding="async"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
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

function SummaryRow({ icon, label, value, sub, ok, warn, bad }: {
  icon: string; label: string; value: string; sub?: string;
  ok?: boolean; warn?: boolean; bad?: boolean
}) {
  const c = ok ? HNH.success : bad ? HNH.red : warn ? HNH.warn : HNH.ink3
  const bg = ok ? HNH.success50 : bad ? HNH.red50 : warn ? HNH.warn50 : HNH.cream
  return (
    <div className="flex items-start gap-3" style={{ padding: '8px 0', borderBottom: `1px solid ${HNH.line}` }}>
      <div className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: bg, marginTop: 2 }}>
        <Icon name={icon} size={14} color={c} stroke={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
        <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: HNH.ink, marginTop: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: c, fontWeight: 600, marginTop: 1 }}>{sub}</div>}
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

// Lưu thời điểm chấm công gần nhất qua localStorage để chống chấm lặp NGAY CẢ khi
// app bị thoát/reload ("văng") — state in-memory mất khi reload, localStorage thì không.
const LAST_CLOCK_KEY = 'hnh_last_clock_ts'
const RAPID_WINDOW_MS = 45000

// Phân loại thiết bị để cấm chấm công trên laptop/máy tính. Dùng cảm ứng để
// không chặn nhầm iPad (Safari iPad giả lập UA macOS).
function detectDeviceKind(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent
  const touch = (navigator.maxTouchPoints || 0) > 0
  if (/Android|iPhone|iPod/i.test(ua)) return 'mobile'
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touch)) return 'tablet'
  if (touch && /Tablet|Tab/i.test(ua)) return 'tablet'
  return 'desktop'
}

export function ClockModal({ open, onClose, isClockedIn, clockInTime, shiftName, acting, onClockIn, onClockOut }: ClockModalProps) {
  const geo = useGeolocation()
  const isTablet = useTablet()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraRetry, setCameraRetry] = useState(0)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [done, setDone] = useState<DoneState>(null)
  const wasClockedIn = useRef(false)
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  const [workLocation, setWorkLocation] = useState<'in_office' | 'out_of_office'>('in_office')
  const [oofType, setOofType] = useState('')
  const [oofNote, setOofNote] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null)
  const [blockMsg, setBlockMsg] = useState<string | null>(null)
  const [rapidConfirm, setRapidConfirm] = useState(false)  // đã cảnh báo chấm lặp, lần bấm sau bỏ qua
  const deviceKind = detectDeviceKind()

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
      setShowConfirm(false)
      setPendingBody(null)
      setBlockMsg(null)
      return
    }
    wasClockedIn.current = isClockedIn
    if (detectDeviceKind() === 'desktop') {
      setBlockMsg('Không thể chấm công trên máy tính/laptop. Vui lòng dùng điện thoại có camera.')
    }
    let mounted = true
    async function startWithConstraints(constraints: MediaStreamConstraints): Promise<MediaStream> {
      return navigator.mediaDevices.getUserMedia(constraints)
    }
    async function start() {
      try {
        let stream: MediaStream
        try {
          stream = await startWithConstraints({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          })
        } catch (err: unknown) {
          // facingMode:'user' thất bại (OverconstrainedError) → thử lại không có constraint
          if ((err as DOMException)?.name === 'OverconstrainedError') {
            stream = await startWithConstraints({ video: true })
          } else {
            throw err
          }
        }
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // play() có thể bị autoplay-policy reject dù stream OK (iOS PWA). Video
          // đã có thuộc tính autoPlay/playsInline/muted nên KHÔNG để reject phá
          // luồng — nuốt lỗi, camera vẫn hiển thị.
          await videoRef.current.play().catch(() => {})
        }
        setCameraReady(true)
      } catch (err: unknown) {
        if (!mounted) return
        const name = (err as DOMException)?.name
        if (name === 'NotAllowedError') {
          const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0)
          setCameraError(isIOS
            ? 'Chưa cấp quyền Camera cho ứng dụng này.\nVào Cài đặt iPhone → Quyền riêng tư & Bảo mật → Camera → bật Safari → sau đó nhấn Thử lại bên dưới.'
            : 'Chưa cấp quyền Camera — vào Cài đặt trình duyệt để cho phép, rồi nhấn Thử lại.'
          )
        } else if (name === 'NotFoundError') {
          setCameraError('Thiết bị không có camera')
        } else if (name === 'NotReadableError') {
          setCameraError('Camera đang dùng bởi ứng dụng khác — tắt app khác rồi thử lại')
        } else {
          setCameraError('Không mở được camera')
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cameraRetry])

  const officesWithDist = offices.map(o => ({
    ...o,
    dist: geo.position ? haversineM(geo.position.lat, geo.position.lng, o.latitude, o.longitude) : null,
  })).sort((a, b) => {
    if (a.dist === null && b.dist === null) return 0
    if (a.dist === null) return 1
    if (b.dist === null) return -1
    return a.dist - b.dist
  })

  // Tự chọn VP GẦN NHẤT theo GPS. Phải chạy lại cả khi danh sách VP vừa tải xong
  // (offices.length đổi) — nếu GPS định vị xong TRƯỚC khi offices về thì effect chỉ
  // theo dõi lat/lng sẽ không chạy lại → kẹt ở VP đầu danh sách (bug quan.na thấy HCM
  // dù đang ở Hà Nội).
  useEffect(() => {
    if (geo.position && officesWithDist.length > 0 && officesWithDist[0].dist !== null) {
      setSelectedOfficeId(officesWithDist[0].id)
    }
  }, [geo.position?.lat, geo.position?.lng, offices.length])   // eslint-disable-line react-hooks/exhaustive-deps

  const selectedOffice = officesWithDist.find(o => o.id === selectedOfficeId) ?? officesWithDist[0] ?? null
  const selectedDist = selectedOffice?.dist ?? null
  const selectedRadius = selectedOffice?.radius ?? 200
  const isInsideSelected = selectedDist !== null ? selectedDist <= selectedRadius : null
  const gpsReady = !!geo.position
  const gpsOff = !geo.loading && !geo.position   // GPS tắt / chưa cấp quyền / lỗi

  // Hệ thống TỰ xác định Trong/Ngoài VP theo GPS có nằm trong GeoFence của VP gần
  // nhất (đã chọn) hay không. Trong → in_office; Ngoài → out_of_office (cần lý do).
  useEffect(() => {
    if (done) return
    if (isInsideSelected === true) {
      setWorkLocation('in_office'); setOofType(''); setOofNote('')
    } else if (isInsideSelected === false) {
      setWorkLocation('out_of_office')
      setOofType(prev => prev || 'remote')   // mặc định "Làm từ xa" khi Ngoài VP
    }
  }, [isInsideSelected, done])

  const retryCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraError(null)
    setCameraReady(false)
    setSelfie(null)
    setCameraRetry(c => c + 1)
  }, [])

  const capture = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return null
    // Giảm RAM (tránh iOS PWA reload/"văng"): chụp tối đa 720px cạnh dài — selfie
    // chấm công không cần full-res. Full-res + toDataURL base64 spike RAM mỗi lần.
    const MAX = 720
    const vw = video.videoWidth, vh = video.videoHeight
    const scale = Math.min(1, MAX / Math.max(vw, vh))
    const w = Math.max(1, Math.round(vw * scale))
    const h = Math.max(1, Math.round(vh * scale))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, w, h)
    const data = canvas.toDataURL('image/jpeg', 0.7)
    setSelfie(data)
    // Giải phóng buffer canvas ngay sau khi lấy data (giảm giữ RAM trên iOS)
    canvas.width = 0
    canvas.height = 0
    return data
  }, [])

  // Countdown: tự đóng confirm sau 10s
  useEffect(() => {
    if (!showConfirm) return
    let remaining = 10
    const id = setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        // Phải clear selfie + pendingBody để camera preview hoạt động lại
        setShowConfirm(false)
        setSelfie(null)
        setPendingBody(null)
        setCountdown(10)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [showConfirm])

  // noCamera=true: đường fallback khi camera thực sự hỏng — chấm KHÔNG ảnh,
  // bắt buộc đang trong VP (chống chấm hộ), server đánh dấu chờ HR duyệt.
  const openConfirm = useCallback((noCamera = false) => {
    const gpsBlocked = geo.loading && !isClockedIn
    if (acting || !!done || gpsBlocked) return
    // Chống chấm lặp sau khi văng/reload: vừa chấm < 45s và chưa xác nhận lại → cảnh báo.
    // Dùng localStorage nên sống sót qua reload (in-memory state mất khi app bị thoát).
    const lastTs = Number(localStorage.getItem(LAST_CLOCK_KEY) || 0)
    const agoMs = lastTs ? Date.now() - lastTs : Infinity
    if (agoMs < RAPID_WINDOW_MS && !rapidConfirm) {
      setBlockMsg(`Bạn vừa chấm công ${Math.round(agoMs / 1000)} giây trước. Nếu app bị thoát rồi mở lại thì KHÔNG cần chấm lại. Bấm lần nữa nếu chắc chắn muốn chấm tiếp.`)
      setRapidConfirm(true)
      return
    }
    // Cấm chấm công trên laptop/máy tính
    if (deviceKind === 'desktop') {
      setBlockMsg('Không thể chấm công trên máy tính/laptop. Vui lòng dùng điện thoại có camera.')
      return
    }
    const body: Record<string, unknown> = {}
    if (noCamera) {
      // Fallback: chỉ cho khi ĐANG trong VP.
      if (isInsideSelected !== true) {
        setBlockMsg('Camera lỗi: chỉ chấm công không ảnh được khi bạn đang ở trong văn phòng.')
        return
      }
      body.no_camera = true
    } else {
      // Bắt buộc bật camera + chụp ảnh
      const dataUrl = capture()
      if (!dataUrl) {
        setBlockMsg('Bắt buộc bật camera và chụp ảnh để chấm công. Hãy cấp quyền Camera rồi thử lại.')
        return
      }
      body.photo = dataUrl
    }
    setBlockMsg(null)
    if (geo.position) { body.latitude = geo.position.lat; body.longitude = geo.position.lng }
    body.client_ua = navigator.userAgent
    body.device_kind = deviceKind
    if (selectedOfficeId !== null) body.office_id = selectedOfficeId
    body.work_location = workLocation
    if (workLocation === 'out_of_office' && oofType) {
      body.out_of_office_type = oofType
      if (oofType === 'other' && oofNote.trim()) body.out_of_office_note = oofNote.trim()
    }
    setPendingBody(body)
    setShowConfirm(true)
    setCountdown(10)
  }, [acting, done, geo.loading, isClockedIn, capture, geo.position, deviceKind, selectedOfficeId, workLocation, oofType, oofNote, rapidConfirm, isInsideSelected])

  const dismissConfirm = useCallback(() => {
    setShowConfirm(false)
    setSelfie(null)
    setPendingBody(null)
  }, [])

  const confirmAndClock = useCallback(async () => {
    if (!pendingBody) return
    setShowConfirm(false)
    setBlockMsg(null)
    try {
      let res: { geo_valid: boolean | null } | null = null
      if (isClockedIn) res = await onClockOut(pendingBody)
      else res = await onClockIn(pendingBody)
      try { localStorage.setItem(LAST_CLOCK_KEY, String(Date.now())) } catch { /* ignore */ }
      setRapidConfirm(false)
      const geoValid = res?.geo_valid
      setDone(geoValid === false ? 'pending' : 'valid')
      setTimeout(() => onClose(), geoValid === false ? 2500 : 1200)
    } catch (err: unknown) {
      // Chấm công THẤT BẠI — KHÔNG được đóng modal im lặng như thành công.
      // Trước đây catch nuốt lỗi + đóng modal → user tưởng đã chấm nhưng server
      // không ghi (mất chấm công). Giờ hiện lỗi rõ, giữ modal để chấm lại.
      const e = err as { status?: number; message?: string }
      let serverMsg: string | null = null
      try { const j = JSON.parse(e?.message || '{}'); serverMsg = j.error || j.message || null } catch { /* not json */ }
      if (e?.status === 400 && /already clocked-in/i.test(e?.message || '')) {
        // Server báo đã có lượt mở hôm nay → thực ra ĐÃ chấm rồi (trạng thái client
        // bị cũ). Coi như thành công, đồng bộ lại thay vì báo lỗi vô cớ.
        try { localStorage.setItem(LAST_CLOCK_KEY, String(Date.now())) } catch { /* ignore */ }
        setRapidConfirm(false)
        setDone('valid')
        setTimeout(() => onClose(), 1200)
      } else {
        setBlockMsg(
          'Chấm công CHƯA được ghi nhận'
          + (serverMsg ? `: ${serverMsg}` : ' — kiểm tra mạng/GPS rồi thử lại.')
        )
        // Giữ modal mở (không onClose) để user thấy lỗi và chấm lại.
      }
    }
  }, [pendingBody, isClockedIn, onClockIn, onClockOut, onClose])

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

  // ALD26: mọi lượt đều là "Chấm công" (không phân vào/ra ca)
  const statusText =
    done === 'valid'
      ? 'ĐÃ CHẤM CÔNG'
    : done === 'pending'
      ? 'CHỜ XÁC NHẬN'
    : gpsBlocked
      ? 'ĐANG ĐỊNH VỊ GPS...'
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
      ? `linear-gradient(135deg, ${HNH.navy} 0%, ${HNH.navy2} 100%)`
    : isOutside
      ? 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)'
    : `linear-gradient(135deg, #d83641 0%, ${HNH.red} 50%, ${HNH.redDark} 100%)`

  const btnLabel =
    done === 'valid' ? 'Đã chấm công thành công'
    : done === 'pending' ? 'Chờ xác nhận từ quản lý'
    : acting ? 'Đang xử lý...'
    : gpsBlocked ? 'Đang định vị GPS...'
    : gpsOff ? 'Bật GPS để chấm công'
    : isOutside ? 'Chấm công (ngoài VP)'
    : 'Chấm công'

  const btnIcon =
    done === 'valid' ? 'check'
    : done === 'pending' ? 'clock'
    : acting ? 'clock'
    : gpsBlocked ? 'pin'
    : gpsOff ? 'pin'
    : 'stamp'

  // Chỉ enable nút khi: không đang xử lý/chưa xong, không phải máy tính,
  // camera sẵn sàng (chụp được selfie), có toạ độ GPS, đã chọn Trong/Ngoài VP,
  // và nếu Trong VP thì phải nằm trong GeoFence.
  const btnDisabled =
    acting || !!done || gpsBlocked || deviceKind === 'desktop'
    || !cameraReady || !!cameraError
    || !geo.position                       // GPS off / chưa định vị → không cho chấm
    || !workLocation
    || (workLocation === 'in_office' && isInsideSelected !== true)
    || (workLocation === 'out_of_office' && !oofType)                          // Ngoài VP phải có lý do
    || (workLocation === 'out_of_office' && oofType === 'other' && !oofNote.trim())

  // Confirm dialog summary helpers
  const oofTypeLabel = OOF_TYPES.find(t => t.id === oofType)?.label ?? ''
  const workLocationLabel = workLocation === 'in_office'
    ? 'Trong văn phòng'
    : `Ngoài VP${oofType ? ' · ' + oofTypeLabel : ''}`

  // Inner content (scrollable area) — shared between mobile and tablet
  const scrollContent = (
    <div style={{ background: HNH.cream, paddingBottom: 8 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))', background: '#fff', borderBottom: `1px solid ${HNH.line}` }}>
        <button onClick={onClose} className="flex items-center justify-center border-none cursor-pointer" style={{ width: 36, height: 36, borderRadius: 10, background: HNH.cream }}>
          <Icon name="x" size={18} color={HNH.ink} stroke={2} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: HNH.ink }}>Chấm công</div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        {/* Banner chặn: laptop hoặc thiếu camera */}
        {blockMsg && (
          <div style={{
            background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 12,
            padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#be123c', fontWeight: 600,
          }}>
            {blockMsg}
          </div>
        )}
        {/* ===== TRÊN CÙNG: Trạng thái Trong/Ngoài VP (hệ thống TỰ xác định theo GPS) ===== */}
        {!done && (
          <>
            {/* Card auto Trong/Ngoài VP */}
            <div style={{
              borderRadius: 16, padding: '12px 14px', marginBottom: 10,
              background: !gpsReady ? HNH.cream2 : (isInsideSelected ? HNH.success50 : HNH.warn50),
              border: `1.5px solid ${!gpsReady ? HNH.line : (isInsideSelected ? HNH.success : HNH.warn)}`,
            }}>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center" style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: !gpsReady ? '#fff' : (isInsideSelected ? HNH.success : HNH.warn),
                }}>
                  <Icon name={!gpsReady ? 'pin' : (isInsideSelected ? 'home' : 'map')} size={20} color={!gpsReady ? HNH.ink4 : '#fff'} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: !gpsReady ? HNH.ink3 : (isInsideSelected ? HNH.success : HNH.warn) }}>
                    {!gpsReady ? (geo.loading ? 'ĐANG XÁC ĐỊNH VỊ TRÍ…' : 'CHƯA BẬT GPS') : (isInsideSelected ? 'TRONG VĂN PHÒNG' : 'NGOÀI VĂN PHÒNG')}
                  </div>
                  <div style={{ fontSize: 11.5, color: HNH.ink2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedOffice
                      ? `${selectedOffice.name.replace(/^(Công ty|Cty)\s+/i, '')}${selectedDist != null ? ' · ' + fmtDist(selectedDist) : ''}${gpsReady ? ' · tự xác định' : ''}`
                      : 'Chưa có văn phòng'}
                  </div>
                </div>
              </div>
            </div>

            {/* Banner: GPS tắt / chưa cấp quyền → không cho chấm công */}
            {gpsOff && (
              <div className="flex items-center gap-2" style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
                <Icon name="pin" size={18} color="#be123c" stroke={2} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#be123c' }}>{geo.error || 'Chưa lấy được vị trí GPS'}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>Hãy BẬT Định vị (GPS) và cấp quyền vị trí cho ứng dụng, rồi thử lại.</div>
                </div>
                <button onClick={() => geo.refresh()} className="border-none cursor-pointer" style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 10, background: '#be123c', color: '#fff', fontSize: 12, fontWeight: 700 }}>Thử lại</button>
              </div>
            )}

            {/* Chips văn phòng — VP gần nhất xếp đầu (bên trái). Cho chọn để đổi VP đối chiếu. */}
            {officesWithDist.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
                  Địa điểm gần bạn
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
                          borderRadius: 12, padding: '8px 12px',
                          background: isSelected ? HNH.navy : '#fff',
                          border: `1.5px solid ${isSelected ? HNH.navy : HNH.line}`,
                          minWidth: 120, maxWidth: 180, transition: 'all 0.15s ease',
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

            {/* Lý do khi Ngoài VP (bắt buộc) */}
            {gpsReady && workLocation === 'out_of_office' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.3, marginBottom: 6, textTransform: 'uppercase' }}>Lý do ngoài VP *</div>
                <div className="flex flex-wrap gap-2" style={{ marginBottom: oofType === 'other' ? 8 : 0 }}>
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
                          color: sel ? '#fff' : HNH.ink3, transition: 'all 0.15s',
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                {oofType === 'other' && (
                  <textarea
                    value={oofNote}
                    onChange={e => setOofNote(e.target.value)}
                    placeholder="Mô tả thêm..."
                    rows={2}
                    style={{
                      width: '100%', borderRadius: 12, border: `1.5px solid ${HNH.navy}60`,
                      padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: HNH.ink,
                      background: HNH.navy50, resize: 'none', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Mini map */}
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
          <div className="flex items-center gap-2" style={{ background: HNH.navy50, border: `1px solid ${HNH.navy}50`, borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ width: 18, height: 18, border: `2.5px solid ${HNH.navy}40`, borderTopColor: HNH.navy, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.navy }}>Đang lấy tọa độ GPS</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>Vui lòng chờ GPS xác định vị trí trước khi chấm công</div>
            </div>
          </div>
        )}

        {/* GPS outside warning */}
        {!done && !gpsBlocked && isOutside && (
          <div className="flex items-center gap-2" style={{ background: HNH.warn50, border: `1px solid ${HNH.warn}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
            <Icon name="shield" size={18} color={HNH.warn} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.warn }}>Ngoài khu vực văn phòng</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>Lượt chấm công sẽ cần xác nhận từ quản lý</div>
            </div>
          </div>
        )}

        {/* Result banners */}
        {done === 'pending' && (
          <div className="flex items-center gap-2" style={{ background: HNH.warn50, border: `1px solid ${HNH.warn}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
            <Icon name="clock" size={18} color={HNH.warn} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.warn }}>Chấm công chờ xác nhận</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: HNH.ink2, marginTop: 2 }}>GPS ngoài khu vực VP — lượt chấm công cần quản lý phê duyệt</div>
            </div>
          </div>
        )}
        {done === 'valid' && (
          <div className="flex items-center gap-2" style={{ background: HNH.success50, border: `1px solid ${HNH.success}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
            <Icon name="check" size={18} color={HNH.success} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: HNH.success }}>Chấm công hợp lệ</div>
          </div>
        )}

        {/* Status card — time display, NO button */}
        <div
          className="relative overflow-hidden text-center"
          style={{ background: '#fff', borderRadius: 22, padding: '20px 18px 16px', border: `1px solid ${HNH.line}`, boxShadow: '0 1px 2px rgba(15,20,40,0.04)' }}
        >
          <div className="absolute" style={{
            left: '50%', top: 20, transform: 'translateX(-50%)',
            width: 180, height: 180, borderRadius: '50%',
            background: `radial-gradient(circle, ${
              done === 'valid' ? HNH.success50
              : done === 'pending' ? HNH.warn50
              : isOutside ? 'rgba(201,122,22,0.12)'
              : isClockedIn ? HNH.success50
              : HNH.red50
            } 0%, transparent 70%)`,
          }} />
          <div className="relative" style={{ fontSize: 11, color: statusColor, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {statusText}
          </div>
          <div className="relative" style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 52, fontWeight: 800,
            color: HNH.ink, letterSpacing: -2.5, lineHeight: 1, marginTop: 8,
          }}>
            {hh}<span style={{ color: HNH.ink3 }}>:</span>{mm}
          </div>
          <div className="relative" style={{ fontSize: 12, color: HNH.ink3, marginTop: 4 }}>
            {shiftName}{clockInTime ? ` · Chấm đầu ${clockInTime}` : ''}
          </div>
          {isClockedIn && clockInTime && !done && (
            <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.success, fontWeight: 600, marginTop: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.success }} />
              Đã chấm công lúc {clockInTime}
            </div>
          )}
          {done === 'valid' && (
            <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.success, fontWeight: 600, marginTop: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.success }} />
              Đã chấm công lúc {hh}:{mm}
            </div>
          )}
          {done === 'pending' && (
            <div className="relative flex items-center justify-center gap-1.5" style={{ fontSize: 11.5, color: HNH.warn, fontWeight: 600, marginTop: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HNH.warn }} />
              Đã chấm công lúc {hh}:{mm} · Chờ duyệt
            </div>
          )}
        </div>

        {/* Verification chips */}
        <div className="grid grid-cols-2 gap-2" style={{ marginTop: 12 }}>
          <VerifyChip
            icon="pin" label="GPS"
            value={
              geo.loading ? 'Đang định vị...'
              : geo.error ? geo.error
              : isInsideSelected ? `±${Math.round(geo.position!.accuracy)}m`
              : selectedDist !== null ? `Cách ${fmtDist(selectedDist)}`
              : '—'
            }
            ok={isInsideSelected === true} bad={isInsideSelected === false} warn={!!geo.error}
          />
          <VerifyChip
            icon="sparkle" label="Khuôn mặt"
            value={selfie ? 'Đã chụp' : cameraReady ? 'Sẵn sàng' : cameraError ? `${cameraError} (nocam)` : 'Đang mở...'}
            ok={!!selfie} warn={!!cameraError}
          />
        </div>

        {/* (Trong/Ngoài VP + lý do đã chuyển lên TRÊN CÙNG, hệ thống tự xác định theo GPS) */}

        {/* GPS coordinates */}
        {geo.position && (
          <div style={{ marginTop: 8, marginBottom: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${HNH.line}`, padding: '7px 10px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>Thiết bị</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: HNH.ink, letterSpacing: 0.1, lineHeight: 1.7 }}>
                <span style={{ color: HNH.ink3, marginRight: 3 }}>Lat</span>{geo.position.lat.toFixed(8)}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: HNH.ink, letterSpacing: 0.1, lineHeight: 1.7 }}>
                <span style={{ color: HNH.ink3, marginRight: 3 }}>Lng</span>{geo.position.lng.toFixed(8)}
              </div>
              <div style={{ fontSize: 9.5, color: HNH.ink3, marginTop: 2 }}>±{Math.round(geo.position.accuracy)}m</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${HNH.line}`, padding: '7px 10px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>Văn phòng</div>
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

        {/* Camera preview (đặt cuối, ngay trên nút Chấm công) — khung tỉ lệ 4:3 đúng
            kích cỡ ảnh chụp, hiển thị đầy đủ chiều cao thông thường (không cắt dải ngang). */}
        <div className="relative overflow-hidden" style={{ borderRadius: 18, background: '#1a1a2e', marginTop: 12, marginBottom: 4, border: `1px solid ${HNH.line}`, aspectRatio: '4 / 3' }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: selfie ? 'none' : 'block' }}
          />
          {selfie && (
            <img src={selfie} alt="Selfie" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
          {!cameraReady && !cameraError && !selfie && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              Đang mở camera...
            </div>
          )}
          {cameraError && !selfie && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ padding: '20px 16px', textAlign: 'center' }}>
              <Icon name="shield" size={32} color="rgba(255,255,255,0.3)" />
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {cameraError}
              </div>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={retryCam}
                  style={{
                    padding: '9px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.18)', color: '#fff',
                    fontSize: 13, fontWeight: 700, backdropFilter: 'blur(6px)',
                  }}
                >
                  Thử lại
                </button>
                {/* Fallback: chỉ hiện khi ĐANG trong VP — chấm không ảnh, chờ HR duyệt */}
                {isInsideSelected === true && !acting && !done && (
                  <button
                    onClick={() => openConfirm(true)}
                    style={{
                      padding: '9px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.4)',
                      cursor: 'pointer', background: 'transparent', color: '#fff',
                      fontSize: 12.5, fontWeight: 700,
                    }}
                  >
                    Camera lỗi — chấm không ảnh
                  </button>
                )}
              </div>
              {isInsideSelected === true && (
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>
                  Lượt chấm không ảnh sẽ được gửi cho HR duyệt.
                </div>
              )}
            </div>
          )}
          {/* GPS overlay on camera */}
          <div className="absolute flex items-center gap-1.5" style={{ bottom: 10, left: 10, right: 10, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="pin" size={14} color={geo.inside ? '#4ade80' : geo.inside === false ? '#f87171' : '#94a3b8'} />
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, flex: 1 }}>{gpsLabel}</span>
            {geo.loading && <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {!geo.loading && geo.inside === true && <Badge tone="success" size="s">Hợp lệ</Badge>}
            {!geo.loading && geo.inside === false && <Badge tone="red" size="s">Ngoài VP</Badge>}
          </div>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )

  // Bottom action bar (shared between mobile and tablet)
  const bottomBar = (
    <div style={{
      background: '#fff',
      borderTop: `1px solid ${HNH.line}`,
      padding: '10px 16px',
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      flexShrink: 0,
    }}>
      <button
        onClick={() => openConfirm(false)}
        disabled={btnDisabled}
        className="flex items-center justify-center gap-2.5 w-full border-none"
        style={{
          height: 54, borderRadius: 16,
          background: btnBg,
          color: '#fff',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800, fontSize: 15.5, letterSpacing: 0.2,
          opacity: btnDisabled ? 0.65 : 1,
          cursor: btnDisabled ? 'not-allowed' : 'pointer',
          boxShadow: btnDisabled ? 'none' : '0 6px 20px rgba(0,0,0,0.18)',
          transition: 'all 0.2s ease',
        }}
      >
        {(acting || gpsBlocked) && !done
          ? <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          : <Icon name={btnIcon} size={20} color="#fff" stroke={2.5} />
        }
        {btnLabel}
      </button>
    </div>
  )

  // Confirm bottom sheet overlay
  const confirmOverlay = showConfirm && (
    <div
      className="absolute inset-0 flex items-end justify-center"
      style={{ zIndex: 100, background: 'rgba(0,0,0,0.4)' }}
      onClick={dismissConfirm}
    >
      <div
        style={{
          width: '100%', maxWidth: 520,
          background: '#fff',
          borderRadius: '24px 24px 0 0',
          padding: '6px 16px 0',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
          maxHeight: '80vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: HNH.line, margin: '8px auto 16px' }} />

        {/* Title row + selfie */}
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Xác nhận thông tin
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: HNH.ink, marginTop: 2 }}>
              Chấm công
            </div>
          </div>
          {selfie && (
            <img
              src={selfie} alt="Selfie preview"
              style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', border: `2px solid ${HNH.line}` }}
            />
          )}
          {!selfie && cameraError && (
            <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: HNH.warn50, border: `2px solid ${HNH.warn}` }}>
              <Icon name="shield" size={22} color={HNH.warn} stroke={2} />
            </div>
          )}
        </div>

        {/* Summary rows */}
        <div style={{ marginBottom: 14 }}>
          <SummaryRow
            icon="clock" label="Thời gian"
            value={`${hh}:${mm}`}
            ok
          />
          <SummaryRow
            icon="pin" label="Địa điểm"
            value={selectedOffice?.name ?? 'Chưa chọn văn phòng'}
            sub={
              isInsideSelected === true ? `Trong VP · Cách ${selectedDist !== null ? fmtDist(selectedDist) : '—'}`
              : isInsideSelected === false ? `Ngoài VP · Cách ${selectedDist !== null ? fmtDist(selectedDist) : '—'}`
              : 'Chưa xác định'
            }
            ok={isInsideSelected === true}
            warn={isInsideSelected === false}
          />
          <SummaryRow
            icon="sparkle" label="Hình ảnh"
            value={selfie ? 'Đã chụp selfie' : cameraError ? 'Không có camera — ghi chú nocam' : 'Không có hình'}
            ok={!!selfie}
            warn={!!cameraError}
          />
          <SummaryRow
            icon={workLocation === 'in_office' ? 'home' : 'map'} label="Vị trí làm việc"
            value={workLocationLabel}
            ok={workLocation === 'in_office'}
            warn={workLocation === 'out_of_office'}
          />
          {geo.position && (
            <SummaryRow
              icon="pin" label="GPS"
              value={`${geo.position.lat.toFixed(6)}, ${geo.position.lng.toFixed(6)}`}
              sub={`±${Math.round(geo.position.accuracy)}m`}
              ok
            />
          )}
        </div>

        {/* Countdown bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 4, background: HNH.cream2, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(countdown / 10) * 100}%`,
              background: countdown <= 3 ? HNH.red : HNH.navy,
              borderRadius: 2,
              transition: 'width 1s linear, background 0.3s',
            }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: HNH.ink3, fontWeight: 600, marginTop: 5 }}>
            Tự đóng sau <span style={{ color: countdown <= 3 ? HNH.red : HNH.ink2, fontWeight: 800 }}>{countdown}s</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={dismissConfirm}
            style={{
              flex: 1, height: 50, borderRadius: 14,
              border: `1.5px solid ${HNH.line}`, background: '#fff',
              fontSize: 14, fontWeight: 700, color: HNH.ink3, cursor: 'pointer',
            }}
          >
            Đóng
          </button>
          <button
            onClick={confirmAndClock}
            style={{
              flex: 2, height: 50, borderRadius: 14,
              border: 'none', background: btnBg,
              fontSize: 15, fontWeight: 800, color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}
          >
            Xác nhận Chấm công
          </button>
        </div>
      </div>
    </div>
  )

  if (isTablet) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', position: 'fixed' }}
      >
        <div style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', borderRadius: 24, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.25)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
            {scrollContent}
          </div>
          {bottomBar}
          {confirmOverlay}
        </div>
      </div>
    )
  }

  return (
    <div
      className="clock-modal-fill flex flex-col"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' as never, minHeight: 0 }}>
        {scrollContent}
      </div>
      {bottomBar}
      {confirmOverlay}
    </div>
  )
}
