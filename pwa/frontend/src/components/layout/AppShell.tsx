import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="flex flex-col min-h-[100dvh]" style={{ background: '#faf7f2' }}>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
