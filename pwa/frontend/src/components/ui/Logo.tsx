import { HNH } from '../../lib/theme'

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.5} viewBox="0 0 100 50">
      <path d="M22 30 A28 28 0 0 1 78 30 Z" fill={HNH.red} />
      <path d="M2 32 C 20 26, 35 38, 50 32 C 65 26, 80 38, 98 32 L 98 38 C 80 44, 65 32, 50 38 C 35 44, 20 32, 2 38 Z" fill={HNH.navy} />
      <path d="M2 40 C 20 34, 35 46, 50 40 C 65 34, 80 46, 98 40 L 98 46 C 80 52, 65 40, 50 46 C 35 52, 20 40, 2 46 Z" fill={HNH.navy2} />
    </svg>
  )
}
