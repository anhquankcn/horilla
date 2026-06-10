import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HNH } from '../../lib/theme'
import { api } from '../../lib/api'

// home | life | [apps] | [ruby] | eoffice | me
const ALL_TABS = [
  { id: 'home',    label: 'Trang chủ', path: '/' },
  { id: 'life',    label: 'HNH Life',  path: '/life' },
  { id: 'apps',    label: 'Ứng dụng',  path: '/apps' },
  { id: 'ruby',    label: 'Ruby AI',   path: '/ruby' },
  { id: 'eoffice', label: 'eOffice',   path: '/eoffice' },
  { id: 'me',      label: 'Cá nhân',   path: '/profile' },
] as const

type TabId = typeof ALL_TABS[number]['id']

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const c = active ? HNH.red : HNH.ink3
  const sw = 1.7
  const fill = active ? HNH.red50 : 'none'
  switch (name) {
    case 'home':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8Z" stroke={c} strokeWidth={sw} strokeLinejoin="round" fill={fill}/></svg>
    case 'life':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 21C6 15.5 2 12 2 8a5 5 0 0 1 10-1.5A5 5 0 0 1 22 8c0 4-4 7.5-10 13Z"
            stroke={c} strokeWidth={sw} strokeLinejoin="round"
            fill={active ? HNH.red50 : 'none'} />
        </svg>
      )
    case 'eoffice':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke={c} strokeWidth={sw} fill={fill}/><path d="M9 12l2 2 4-4" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'me':
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.5" stroke={c} strokeWidth={sw} fill={fill}/><path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/></svg>
    default: return null
  }
}

/** Elevated "Ứng dụng" button — navy/blue, mirrors RubyIcon layout */
function AppsIcon({ active }: { active: boolean }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: 42, height: 42, borderRadius: 14,
        background: active
          ? `linear-gradient(135deg, ${HNH.navy2} 0%, #1d4ed8 100%)`
          : `linear-gradient(135deg, #0d2259 0%, ${HNH.navy} 100%)`,
        marginTop: -10,
        boxShadow: active
          ? '0 6px 16px rgba(20,43,111,0.50)'
          : '0 4px 12px rgba(20,43,111,0.30)',
      }}
    >
      {/* 2×2 rounded grid — universally recognised as "apps" */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3"  y="3"  width="7.5" height="7.5" rx="2" fill="white"/>
        <rect x="13.5" y="3"  width="7.5" height="7.5" rx="2" fill="white"/>
        <rect x="3"  y="13.5" width="7.5" height="7.5" rx="2" fill="white"/>
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill={active ? '#d4a017' : 'rgba(255,255,255,0.65)'}/>
      </svg>
    </div>
  )
}

/** Elevated "Ruby AI" button */
function RubyIcon({ active }: { active: boolean }) {
  return (
    <div
      className="flex items-center justify-center relative"
      style={{
        width: 42, height: 42, borderRadius: 14,
        background: active
          ? `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`
          : `linear-gradient(135deg, #1a1530 0%, ${HNH.navy} 100%)`,
        marginTop: -10,
        boxShadow: '0 6px 14px rgba(192,34,43,0.28)',
      }}
    >
      <svg width="26" height="22" viewBox="0 0 100 80">
        <path d="M22 38 A28 28 0 0 1 78 38 Z" fill="#fff"/>
        <g stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <line x1="50" y1="6" x2="50" y2="14"/>
          <line x1="20" y1="14" x2="25" y2="20"/>
          <line x1="80" y1="14" x2="75" y2="20"/>
        </g>
        <path d="M4 50 C 22 42, 38 56, 50 50 C 62 44, 78 56, 96 50 L 96 58 C 78 64, 62 52, 50 58 C 38 64, 22 52, 4 58 Z" fill="#fff" fillOpacity="0.95"/>
        <path d="M4 62 C 22 54, 38 68, 50 62 C 62 56, 78 68, 96 62 L 96 70 C 78 76, 62 64, 50 70 C 38 76, 22 64, 4 70 Z" fill="#fff" fillOpacity="0.7"/>
      </svg>
      <span className="absolute" style={{ top: -2, right: -2, width: 6, height: 6, borderRadius: '50%', background: HNH.gold }}/>
    </div>
  )
}

const NAV_TABS_KEY = 'hnh_nav_tabs'

export function BottomNav({ announcementsUnread = 0 }: { announcementsUnread?: number }) {
  const location = useLocation()
  const navigate = useNavigate()

  const [allowedTabs, setAllowedTabs] = useState<TabId[] | null>(
    () => {
      try {
        const cached = localStorage.getItem(NAV_TABS_KEY)
        return cached ? JSON.parse(cached) : null
      } catch { return null }
    }
  )

  useEffect(() => {
    api.get<{ allowed_tabs: TabId[] }>('/api/employee/my-nav-tabs/')
      .then(data => {
        setAllowedTabs(data.allowed_tabs)
        localStorage.setItem(NAV_TABS_KEY, JSON.stringify(data.allowed_tabs))
      })
      .catch(() => {})
  }, [])

  const tabs = allowedTabs && allowedTabs.length < ALL_TABS.length
    ? ALL_TABS.filter(t => allowedTabs.includes(t.id as TabId))
    : ALL_TABS

  const activeTab = tabs.find(t => t.path === location.pathname)?.id ?? 'home'

  return (
    <nav
      className="sticky bottom-0 z-30 flex justify-around"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: `1px solid ${HNH.line}`,
        padding: '8px 6px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
      }}
    >
      {tabs.map(t => {
        const isActive = activeTab === t.id

        if (t.id === 'apps') {
          return (
            <button
              key={t.id}
              className="flex-1 flex flex-col items-center gap-1 p-1 bg-transparent border-none cursor-pointer"
              onClick={() => navigate(t.path)}
            >
              <AppsIcon active={isActive} />
              <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 600, color: isActive ? HNH.navy : HNH.ink2, letterSpacing: -0.1 }}>
                {t.label}
              </span>
            </button>
          )
        }

        if (t.id === 'ruby') {
          return (
            <button
              key={t.id}
              className="flex-1 flex flex-col items-center gap-1 p-1 bg-transparent border-none cursor-pointer"
              onClick={() => navigate('/ruby')}
            >
              <RubyIcon active={isActive} />
              <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 600, color: isActive ? HNH.red : HNH.ink2, letterSpacing: -0.1 }}>
                {t.label}
              </span>
            </button>
          )
        }

        if (t.id === 'eoffice') {
          const goEoffice = async () => {
            try {
              const res = await fetch('/bff/embed/eoffice/url?to=/pwa', { credentials: 'include' })
              if (res.ok) {
                const data = await res.json()
                window.location.href = data.url
              } else {
                navigate('/eoffice')
              }
            } catch {
              navigate('/eoffice')
            }
          }
          return (
            <button
              key={t.id}
              className="flex-1 flex flex-col items-center gap-1 py-1 bg-transparent border-none cursor-pointer"
              onClick={goEoffice}
            >
              <TabIcon name={t.id} active={isActive} />
              <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 500, color: isActive ? HNH.red : HNH.ink3, letterSpacing: -0.1 }}>
                {t.label}
              </span>
            </button>
          )
        }

        return (
          <button
            key={t.id}
            className="flex-1 flex flex-col items-center gap-1 py-1 bg-transparent border-none cursor-pointer"
            onClick={() => navigate(t.path)}
          >
            <div className="relative">
              <TabIcon name={t.id} active={isActive} />
              {t.id === 'life' && announcementsUnread > 0 && (
                <span
                  className="absolute flex items-center justify-center"
                  style={{
                    top: -4, right: -8,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: HNH.red,
                    color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    padding: '0 4px',
                    border: '2px solid #fff',
                    lineHeight: 1,
                  }}
                >
                  {announcementsUnread > 99 ? '99+' : announcementsUnread}
                </span>
              )}
            </div>
            <span style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 500, color: isActive ? HNH.red : HNH.ink3, letterSpacing: -0.1 }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
