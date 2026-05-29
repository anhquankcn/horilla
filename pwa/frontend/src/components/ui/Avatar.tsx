import { HNH } from '../../lib/theme'

interface AvatarProps {
  initials?: string
  size?: number
  bg?: string
  color?: string
}

export function Avatar({ initials = 'NA', size = 36, bg = HNH.navy, color = '#fff' }: AvatarProps) {
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: bg,
        color,
        fontSize: size * 0.38,
        fontWeight: 700,
        letterSpacing: 0.3,
      }}
    >
      {initials}
    </div>
  )
}
