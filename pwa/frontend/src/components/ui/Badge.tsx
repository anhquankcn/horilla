import { TONES, type ToneName } from '../../lib/theme'

interface BadgeProps {
  children: React.ReactNode
  tone?: ToneName
  soft?: boolean
  size?: 's' | 'm'
}

export function Badge({ children, tone = 'navy', soft = true, size = 'm' }: BadgeProps) {
  const t = TONES[tone]
  const sm = size === 's'
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      style={{
        padding: sm ? '2px 7px' : '4px 9px',
        borderRadius: 999,
        background: soft ? t.bg : t.solidBg,
        color: soft ? t.color : t.solidFg,
        fontSize: sm ? 10.5 : 11.5,
        fontWeight: 600,
        letterSpacing: 0.1,
      }}
    >
      {children}
    </span>
  )
}
