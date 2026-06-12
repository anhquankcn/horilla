import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'
import { HNH } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { useTablet } from '../../lib/useTablet'
import { useNotificationPolling } from '../../lib/useNotificationPolling'
import { useAutoClockOut } from '../../lib/useAutoClockOut'
import { useAuth } from '../../lib/auth'
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
  const navigate = useNavigate()
  const { employee } = useAuth()
  const notifSummary = useNotificationPolling()
  useAutoClockOut()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const initials = employee
    ? `${employee.employee_first_name?.[0] ?? ''}${employee.employee_last_name?.[0] ?? ''}`.toUpperCase()
    : '?'

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
          HNH Travel
        </span>

        {/* Avatar + settings dropdown */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-2 border-none cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.15)',
              padding: '3px 10px 3px 3px',
              borderRadius: 20,
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: 13, background: HNH.red,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: '#fff',
            }}>
              {employee?.employee_profile
                ? <img src={employee.employee_profile} alt="" style={{ width: 26, height: 26, borderRadius: 13, objectFit: 'cover' }} />
                : initials}
            </div>
            <Icon name="gear" size={14} color="#fff" stroke={1.8} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 36, right: 0, zIndex: 50,
              background: '#fff', borderRadius: 14, padding: '6px 0',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 200,
              border: `1px solid ${HNH.line}`,
            }}>
              {employee && (
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${HNH.line}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: HNH.ink }}>
                    {employee.employee_first_name} {employee.employee_last_name}
                  </div>
                  <div style={{ fontSize: 11, color: HNH.ink3, marginTop: 2 }}>{employee.email}</div>
                </div>
              )}
              <button
                onClick={() => { setMenuOpen(false); navigate('/profile') }}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{ padding: '10px 16px', background: 'transparent', fontSize: 13, color: HNH.ink }}
              >
                <Icon name="user" size={16} color={HNH.navy} stroke={1.8} />
                Hồ sơ cá nhân
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate('/settings') }}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{ padding: '10px 16px', background: 'transparent', fontSize: 13, color: HNH.ink }}
              >
                <Icon name="gear" size={16} color={HNH.ink2} stroke={1.8} />
                Cài đặt App
              </button>
              <button
                onClick={() => { setMenuOpen(false); switchToDesktop() }}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{ padding: '10px 16px', background: 'transparent', fontSize: 13, color: HNH.ink }}
              >
                <Icon name="monitor" size={16} color={HNH.ink2} stroke={1.8} />
                Chế độ Desktop
              </button>
              <div style={{ height: 1, background: HNH.line, margin: '4px 0' }} />
              <button
                onClick={() => { setMenuOpen(false); window.location.href = '/bff/auth/login' }}
                className="flex items-center gap-3 w-full border-none cursor-pointer text-left"
                style={{ padding: '10px 16px', background: 'transparent', fontSize: 13, color: HNH.navy, fontWeight: 600 }}
              >
                <Icon name="shield" size={16} color={HNH.navy} stroke={1.8} />
                Đăng nhập lại (SSO)
              </button>
            </div>
          )}
        </div>
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
