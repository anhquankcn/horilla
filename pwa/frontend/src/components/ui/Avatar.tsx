import { useState } from 'react'
import { HNH } from '../../lib/theme'

interface AvatarProps {
  initials?: string
  size?: number
  bg?: string
  color?: string
  src?: string | null
}

export function Avatar({ initials = 'NA', size = 36, bg = HNH.navy, color = '#fff', src }: AvatarProps) {
  const [imgError, setImgError] = useState(false)
  const showImg = !!src && !imgError

  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size, height: size, overflow: 'hidden',
        background: showImg ? 'transparent' : bg,
        color, fontSize: size * 0.38, fontWeight: 700, letterSpacing: 0.3,
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt="avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
        />
      ) : initials}
    </div>
  )
}
