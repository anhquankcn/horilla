import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'
import { HNH } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { useTablet } from '../../lib/useTablet'

function switchToDesktop() {
  document.cookie = 'prefer_desktop=1;path=/;max-age=' + 60 * 60 * 24 * 365
  window.location.href = '/'
}

export function AppShell() {
  const isTablet = useTablet()

  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: HNH.cream }}>
      <div className="flex items-center justify-between shrink-0" style={{
        padding: '6px 16px',
        background: HNH.navy,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          HNH Travel · {isTablet ? 'Tablet' : 'Mobile'}
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

      {isTablet ? (
        <div className="flex flex-1" style={{ minHeight: 0 }}>
          <SideNav />
          <div className="flex-1 overflow-auto flex flex-col" style={{ minHeight: 0 }}>
            <Outlet />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto flex flex-col" style={{ minHeight: 0 }}>
            <Outlet />
          </div>
          <BottomNav />
        </>
      )}
    </div>
  )
}
