import { useState } from 'react'
import { HNH } from '../lib/theme'
import { PunchSourceBadge, type PunchSource } from './PunchSourceBadge'

// Chi tiết hoạt động chấm công dùng chung giữa CC Tháng (C&B) và Trang chủ (tự xem).
// Nguồn dữ liệu: GET /api/attendance/activity-detail/

export interface ActivityDetail {
  id: number
  clock_in: string | null
  clock_out: string | null
  clock_in_address: string
  clock_out_address: string
  clock_in_lat: string | null
  clock_in_lng: string | null
  clock_out_lat?: string | null
  clock_out_lng?: string | null
  work_location: string
  work_location_label: string
  out_of_office_type: string
  out_of_office_label: string
  out_of_office_note: string
  clock_in_photo: string | null
  clock_out_photo: string | null
  // Geofence tính theo GPS thực của TỪNG lượt (backend trả). inside=null khi
  // thiếu GPS/geofence → fallback work_location.
  clock_in_inside?: boolean | null
  clock_in_distance_m?: number | null
  clock_out_inside?: boolean | null
  clock_out_distance_m?: number | null
  // Lượt chấm không ảnh (camera lỗi) — chờ HR duyệt.
  no_camera?: boolean
  // Nguồn chấm: biometric (máy) vs app (PWA).
  clock_in_source?: PunchSource
  clock_out_source?: PunchSource
}

// "Cách VP 12m" / "Cách VP 2.0km". Trả '' khi không có khoảng cách.
export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return ''
  return m < 1000 ? `Cách VP ${Math.round(m)}m` : `Cách VP ${(m / 1000).toFixed(1)}km`
}

// Quy ra trong/ngoài VP cho 1 lượt: ưu tiên GPS thực, fallback work_location.
export function legInside(inside: boolean | null | undefined, workLocation: string): boolean | null {
  if (inside === true || inside === false) return inside
  if (workLocation === 'in_office') return true
  if (workLocation === 'out_of_office') return false
  return null
}

export interface ActivityResp {
  office_name: string
  office_address: string
  activities: ActivityDetail[]
  is_nco?: boolean
  nco_pending?: boolean
  nco_declared_clock_out?: string | null
  nco_reason?: string | null
}

export function InfoLine({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: HNH.ink2, marginTop: 3, lineHeight: 1.4 }}>
      <span>{icon}</span><span style={{ flex: 1 }}>{text}</span>
    </div>
  )
}

export function ActivityCard({ act, office }: { act: ActivityDetail; office: ActivityResp }) {
  const isOut = act.work_location === 'out_of_office'
  const [zoom, setZoom] = useState<string | null>(null)
  return (
    <div style={{ border: `1px solid ${HNH.line}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
          {act.clock_in ?? '—'} <span style={{ color: HNH.ink3, fontWeight: 400 }}>→</span> {act.clock_out ?? '?'}
        </span>
        {act.work_location_label && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px',
            background: isOut ? '#fef3c7' : '#dcfce7',
            color: isOut ? '#92400e' : '#15803d',
          }}>{act.work_location_label}</span>
        )}
      </div>
      {act.clock_in_address && <InfoLine icon="📍" text={act.clock_in_address} />}
      {(office.office_name || office.office_address) && (
        <InfoLine icon="🏢" text={[office.office_name, office.office_address].filter(Boolean).join(' · ')} />
      )}
      {isOut && act.out_of_office_label && (
        <InfoLine
          icon="🚩"
          text={act.out_of_office_note
            ? `${act.out_of_office_label}: ${act.out_of_office_note}`
            : act.out_of_office_label}
        />
      )}
      {(act.clock_in_photo || act.clock_out_photo) && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {act.clock_in_photo && (
            <PhotoThumb url={act.clock_in_photo} label="Ảnh vào" onOpen={() => setZoom(act.clock_in_photo)} />
          )}
          {act.clock_out_photo && (
            <PhotoThumb url={act.clock_out_photo} label="Ảnh ra" onOpen={() => setZoom(act.clock_out_photo)} />
          )}
        </div>
      )}
      {zoom && <PhotoLightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}

export function PhotoThumb({ url, label, onOpen }: { url: string; label: string; onOpen: () => void }) {
  const [err, setErr] = useState(false)
  return (
    <button
      onClick={onOpen}
      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'center' }}
    >
      {err ? (
        <div style={{
          width: 60, height: 60, borderRadius: 10, background: '#f1f5f9',
          border: `1px solid ${HNH.line}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, color: HNH.ink3,
        }}>Lỗi ảnh</div>
      ) : (
        <img
          src={url}
          alt={label}
          loading="lazy"
          onError={() => setErr(true)}
          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, display: 'block', border: `1px solid ${HNH.line}` }}
        />
      )}
      <span style={{ fontSize: 10, color: HNH.ink3, marginTop: 3, display: 'block' }}>{label}</span>
    </button>
  )
}

export function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [err, setErr] = useState(false)
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      {err ? (
        <div style={{ color: '#fff', fontSize: 14 }}>Không tải được ảnh</div>
      ) : (
        <img
          src={url}
          onError={() => setErr(true)}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, objectFit: 'contain' }}
        />
      )}
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 'max(16px, env(safe-area-inset-top))', right: 16,
          width: 40, height: 40, borderRadius: 20, border: 'none',
          background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 22, cursor: 'pointer',
        }}
      >×</button>
    </div>
  )
}

// Danh sách hoạt động chấm công (loading + empty + list). Dùng chung mọi nơi.
export function ActivityList({ resp, loading }: { resp: ActivityResp | null; loading: boolean }) {
  return (
    <>
      {loading && <div style={{ fontSize: 12, color: HNH.ink3 }}>Đang tải…</div>}
      {!loading && (!resp || resp.activities.length === 0) && (
        <div style={{ fontSize: 12, color: HNH.ink3 }}>Không có hoạt động chấm công.</div>
      )}
      {!loading && resp && resp.activities.map(act => (
        <ActivityCard key={act.id} act={act} office={resp} />
      ))}
    </>
  )
}

// ── Danh sách LƯỢT CHẤM phẳng (mỗi lần chấm = 1 lượt) — dùng chung CC Tháng + tự xem ──
interface Punch {
  key: string
  time: string
  photo: string | null
  address: string
  workLocation: string
  oofLabel: string
  oofNote: string
  inside: boolean | null   // trong/ngoài VP theo GPS thực của LƯỢT này
  distanceM: number | null // khoảng cách tới VP (m)
  noCamera: boolean        // lượt chấm không ảnh (camera lỗi) — chờ HR duyệt
  source: PunchSource      // nguồn chấm: biometric (máy) vs app
}

export function flattenPunches(resp: ActivityResp | null): Punch[] {
  if (!resp) return []
  const out: Punch[] = []
  for (const a of resp.activities) {
    const note = a.out_of_office_type === 'other' ? (a.out_of_office_note || '') : ''
    const noCam = !!a.no_camera
    if (a.clock_in) {
      out.push({ key: `${a.id}-in`, time: a.clock_in, photo: a.clock_in_photo, address: a.clock_in_address,
        workLocation: a.work_location, oofLabel: a.out_of_office_label, oofNote: note,
        inside: legInside(a.clock_in_inside, a.work_location), distanceM: a.clock_in_distance_m ?? null, noCamera: noCam,
        source: a.clock_in_source })
    }
    if (a.clock_out) {
      // Lượt RA dùng GPS RA của chính nó (không inherit work_location của activity).
      out.push({ key: `${a.id}-out`, time: a.clock_out, photo: a.clock_out_photo, address: a.clock_out_address,
        workLocation: a.work_location, oofLabel: a.out_of_office_label, oofNote: note,
        inside: legInside(a.clock_out_inside, a.work_location), distanceM: a.clock_out_distance_m ?? null, noCamera: noCam,
        source: a.clock_out_source })
    }
  }
  out.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0))
  return out
}

function PunchCard({ punch, index, total, officeName }: {
  punch: Punch; index: number; total: number; officeName: string
}) {
  const [zoom, setZoom] = useState<string | null>(null)
  const isOut = punch.inside === false
  const isIn = punch.inside === true
  const distLabel = fmtDistance(punch.distanceM)
  // Mô hình ALD26 ca 24h: hiển thị theo thứ tự lượt chấm (lần đầu → lần tiếp
  // theo), không phải cặp vào/ra cứng.
  const isFirst = index === 0
  const roleLabel = isFirst ? 'Lần đầu' : `Lần ${index + 1}`
  const accent = isFirst ? HNH.success : HNH.navy
  const accentBg = isFirst ? HNH.success50 : HNH.navy50

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', marginBottom: 8, border: `1px solid ${HNH.line}` }}>
      <div className="flex items-start gap-3">
        <div style={{ width: 30, height: 30, borderRadius: 9, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: accent }}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: HNH.ink3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>Lượt {index + 1}/{total}</span>
            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 7px', background: isFirst ? '#dcfce7' : HNH.navy50, color: accent }}>{roleLabel}</span>
            {isIn && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 7px', background: '#dcfce7', color: '#15803d' }}>Trong VP</span>}
            {isOut && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 7px', background: '#fef3c7', color: '#92400e' }}>Ngoài VP</span>}
            {punch.noCamera && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '1px 7px', background: '#fee2e2', color: '#b91c1c' }}>⚠ Không ảnh</span>}
            <PunchSourceBadge source={punch.source} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: HNH.ink, fontFamily: "'Plus Jakarta Sans', monospace", marginTop: 2 }}>{punch.time?.slice(0, 5) || '--:--'}</div>
          {distLabel && <InfoLine icon="📏" text={`${distLabel}${isIn ? ' · trong khu vực' : isOut ? ' · ngoài khu vực' : ''}`} />}
          {isIn && officeName && <InfoLine icon="🏢" text={officeName} />}
          {isOut && punch.oofLabel && <InfoLine icon="🚩" text={punch.oofNote ? `${punch.oofLabel}: ${punch.oofNote}` : punch.oofLabel} />}
          {isOut && punch.address && <InfoLine icon="📍" text={punch.address} />}
          {!isIn && !isOut && punch.address && <InfoLine icon="📍" text={punch.address} />}
        </div>
        {punch.photo && <PhotoThumb url={punch.photo} label={`Lượt ${index + 1}`} onOpen={() => setZoom(punch.photo)} />}
      </div>
      {zoom && <PhotoLightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}

export function PunchList({ resp, loading }: { resp: ActivityResp | null; loading: boolean; isPast: boolean }) {
  const punches = flattenPunches(resp)
  return (
    <>
      {loading && <div style={{ fontSize: 12, color: HNH.ink3 }}>Đang tải…</div>}
      {!loading && punches.length === 0 && (
        <div style={{ fontSize: 12, color: HNH.ink3 }}>Không có lượt chấm nào.</div>
      )}
      {punches.map((p, i) => (
        <PunchCard key={p.key} punch={p} index={i} total={punches.length} officeName={resp?.office_name ?? ''} />
      ))}
    </>
  )
}
