import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { HNH } from '../../lib/theme'
import { Icon } from '../ui/Icon'

function switchToDesktop() {
  document.cookie = 'prefer_desktop=1;path=/;max-age=' + 60 * 60 * 24 * 365
  window.location.href = '/'
}

export function AppShell() {
  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: '#faf7f2' }}>
      <div className="flex items-center justify-between" style={{
        padding: '6px 16px',
        background: HNH.navy,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          HNH Travel · Mobile
        </span>
        <button
          onClick={switchToDesktop}
          className="flex items-center gap-1.5 border-none cursor-pointer"
          style={{
            background: 'rgba(255,255,255,0.15)',
            padding: '4px 10px',
            borderRadius: 8,
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <Icon name="monitor" size={13} color="#fff" stroke={1.8} />
          Desktop
        </button>
      </div>
      <div className="flex-1 overflow-auto flex flex-col" style={{ minHeight: 0 }}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
