// Badge phân biệt NGUỒN lượt chấm công: máy chấm công (biometric/vân tay) vs app PWA.
// Nguồn dữ liệu: field clock_in_source / clock_out_source từ API attendance
// ('biometric' | 'app' | null). null (import Excel/thủ công) → không hiện badge.

export type PunchSource = 'biometric' | 'app' | null | undefined

const FingerprintIcon = ({ color, size = 10 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
    <path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
  </svg>
)

const PhoneIcon = ({ color, size = 10 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </svg>
)

export function PunchSourceBadge({ source, size = 's' }: { source: PunchSource; size?: 's' | 'xs' }) {
  if (source !== 'biometric' && source !== 'app') return null
  const isBio = source === 'biometric'
  const bg = isBio ? '#e0e7ff' : '#e0f2fe'
  const fg = isBio ? '#4338ca' : '#0369a1'
  const label = isBio ? 'Máy CC' : 'App'
  const fs = size === 'xs' ? 9 : 10
  const icon = size === 'xs' ? 8.5 : 10
  return (
    <span
      title={isBio ? 'Chấm bằng máy chấm công (vân tay)' : 'Chấm bằng ứng dụng PWA'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
        fontSize: fs, fontWeight: 700, borderRadius: 6, padding: '1px 7px',
        background: bg, color: fg,
      }}
    >
      {isBio ? <FingerprintIcon color={fg} size={icon} /> : <PhoneIcon color={fg} size={icon} />}
      {label}
    </span>
  )
}
