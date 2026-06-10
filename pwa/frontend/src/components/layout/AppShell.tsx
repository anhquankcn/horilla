import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'
import { HNH } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { useTablet } from '../../lib/useTablet'
import { useNotificationPolling } from '../../lib/useNotificationPolling'
import { useAutoClockOut } from '../../lib/useAutoClockOut'
import { WelcomeWizard } from '../WelcomeWizard'
import { PWAInstallBanner } from '../PWAInstallBanner'

export const SKY_BG_EVENT = 'hnh-sky-bg'
export const SKY_BG_KEY   = 'hnh_sky_bg'

function switchToDesktop() {
  document.cookie = 'prefer_desktop=1;path=/;max-age=' + 60 * 60 * 24 * 365
  window.location.href = '/'
}

export function AppShell() {
  const isTablet = useTablet()
  const notifSummary = useNotificationPolling()
  useAutoClockOut()

  const [skyBg, setSkyBg] = useState<string>(
    () => localStorage.getItem(SKY_BG_KEY) ?? HNH.navy
  )

  useEffect(() => {
    const handler = (e: Event) => setSkyBg((e as CustomEvent<string>).detail)
    window.addEventListener(SKY_BG_EVENT, handler)
    return () => window.removeEventListener(SKY_BG_EVENT, handler)
  }, [])

  return (
    <div
      className="flex flex-col"
      style={{
        background: HNH.cream,
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      <WelcomeWizard />

      {/* Topbar — extends into status-bar / notch area */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))',
          paddingBottom: 6,
          paddingLeft: 16,
          paddingRight: 16,
          background: skyBg,
        }}
      >
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
        <div className="flex flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          <SideNav skyBg={skyBg} />
          <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
            <Outlet />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto flex flex-col relative" style={{ minHeight: 0 }}>
            <Outlet />
          </div>
          <PWAInstallBanner />
          <BottomNav announcementsUnread={notifSummary.announcements_unread} />
        </>
      )}
    </div>
  )
}
