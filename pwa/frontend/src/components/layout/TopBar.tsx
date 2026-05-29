import { HNH } from '../../lib/theme'

interface TopBarProps {
  title: string
  sub?: string
  onBack?: () => void
  trailing?: React.ReactNode
}

export function TopBar({ title, sub, onBack, trailing }: TopBarProps) {
  return (
    <div className="flex items-center gap-3" style={{ padding: '8px 20px 10px' }}>
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center justify-center border-none cursor-pointer shrink-0"
          style={{
            width: 38, height: 38, borderRadius: 12,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(15,20,40,0.06)',
          }}
        >
          <svg width="9" height="16" viewBox="0 0 9 16">
            <path d="M7.5 1.5 1.5 8l6 6.5" stroke={HNH.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        {sub && (
          <div style={{ fontSize: 11, fontWeight: 700, color: HNH.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {sub}
          </div>
        )}
        <div style={{ fontSize: 18, fontWeight: 700, color: HNH.ink, letterSpacing: -0.2 }}>
          {title}
        </div>
      </div>
      {trailing && <div className="flex items-center gap-2">{trailing}</div>}
    </div>
  )
}
