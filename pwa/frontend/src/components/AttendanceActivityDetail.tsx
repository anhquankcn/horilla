import { useState } from 'react'
import { HNH } from '../lib/theme'

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
  work_location: string
  work_location_label: string
  out_of_office_type: string
  out_of_office_label: string
  out_of_office_note: string
  clock_in_photo: string | null
  clock_out_photo: string | null
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
