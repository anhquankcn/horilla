import { useLocation, useNavigate } from 'react-router-dom'
import { HNH } from '../../lib/theme'

const tabs = [
  { id: 'home',  label: 'Trang chủ', path: '/',          icon: 'home'  },
  { id: 'life',  label: 'HNH Life',  path: '/life',       icon: 'life'  },
  { id: 'apps',  label: 'Ứng dụng',  path: '/apps',       icon: 'grid'  },
  { id: 'ruby',  label: 'Ruby AI',   path: '/ruby',       icon: 'ruby'  },
  { id: 'tasks', label: 'Công việc', path: '/task-board', icon: 'tasks' },
  { id: 'me',    label: 'Cá nhân',  path: '/profile',    icon: 'user'  },
] as const

// Sub-paths that highlight "apps" tab (attendance, employees, roles)
const appChildPaths = ['/attendance', '/employees', '/roles']
// Sub-paths that highlight "tasks" tab
const taskChildPaths = ['/tasks', '/task-board']

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.5)'
  const sw = 1.7
  switch (icon) {
    case 'home':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8Z" stroke={c} strokeWidth={sw} strokeLinejoin="round" fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/></svg>

    case 'life':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 21C6 15.5 2 12 2 8a5 5 0 0 1 10-1.5A5 5 0 0 1 22 8c0 4-4 7.5-10 13Z"
            stroke={c} strokeWidth={sw} strokeLinejoin="round"
            fill={active ? 'rgba(255,255,255,0.15)' : 'none'} />
        </svg>
      )

    case 'grid':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={c} strokeWidth={sw} fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={c} strokeWidth={sw} fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={c} strokeWidth={sw} fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={c} strokeWidth={sw} fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/></svg>

    case 'tasks':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke={c} strokeWidth={sw} fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/><path d="M9 12l2 2 4-4" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>

    case 'user':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.5" stroke={c} strokeWidth={sw} fill={active ? 'rgba(255,255,255,0.15)' : 'none'}/><path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5" stroke={c} strokeWidth={sw} strokeLinecap="round" fill="none"/></svg>

    case 'ruby':
      return (
        <div className="flex items-center justify-center" style={{
          width: 28, height: 28, borderRadius: 8,
          background: active
            ? `linear-gradient(135deg, ${HNH.red} 0%, ${HNH.redDark} 100%)`
            : 'rgba(255,255,255,0.1)',
        }}>
          <svg width="18" height="15" viewBox="0 0 100 80">
            <path d="M22 38 A28 28 0 0 1 78 38 Z" fill="#fff"/>
            <path d="M4 50 C 22 42, 38 56, 50 50 C 62 44, 78 56, 96 50 L 96 58 C 78 64, 62 52, 50 58 C 38 64, 22 52, 4 58 Z" fill="#fff" fillOpacity="0.9"/>
            <path d="M4 62 C 22 54, 38 68, 50 62 C 62 56, 78 68, 96 62 L 96 70 C 78 76, 62 64, 50 70 C 38 76, 22 64, 4 70 Z" fill="#fff" fillOpacity="0.6"/>
          </svg>
        </div>
      )

    default: return null
  }
}

export function SideNav({ skyBg }: { skyBg?: string }) {
  const location = useLocation()
  const navigate = useNavigate()

  function getActiveTab() {
    const path = location.pathname
    if (appChildPaths.some(p => path.startsWith(p))) return 'apps'
    if (taskChildPaths.some(p => path.startsWith(p))) return 'tasks'
    return tabs.find(t => t.path === path)?.id ?? 'home'
  }

  const activeTab = getActiveTab()

  return (
    <nav
      className="flex flex-col items-center shrink-0"
      style={{
        width: 76,
        background: skyBg ?? HNH.navy,
        paddingTop: 12,
        gap: 2,
      }}
    >
      {tabs.map(t => {
        const isActive = activeTab === t.id
        return (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'ruby') window.location.href = 'https://arkon.hnhtravel.work/pwa'
              else if (t.id === 'tasks') window.location.href = 'https://task.hnhtravel.work/pwa'
              else navigate(t.path)
            }}
            className="flex flex-col items-center gap-1 border-none cursor-pointer w-full"
            style={{
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              padding: '10px 4px',
              borderRadius: 0,
              borderLeft: isActive ? '3px solid #fff' : '3px solid transparent',
            }}
          >
            <NavIcon icon={t.icon} active={isActive} />
            <span style={{
              fontSize: 9.5,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
              letterSpacing: -0.1,
            }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
