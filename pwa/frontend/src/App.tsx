import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { LoginPage } from './pages/Login'
import { HomePage } from './pages/Home'
import { AttendancePage } from './pages/Attendance'
import { OfficeCheckinPage } from './pages/OfficeCheckin'
import { ProfilePage } from './pages/Profile'
import { LeavePage } from './pages/Leave'
import { LeaveNewPage } from './pages/LeaveNew'
import { PayslipPage } from './pages/Payslip'
import { BusinessPage } from './pages/Business'
import { NotificationsPage } from './pages/Notifications'
import { RubyPage } from './pages/Ruby'
import { TasksPage } from './pages/Tasks'
import { TaskWebViewPage } from './pages/TaskWebView'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/attendance/office" element={<OfficeCheckinPage />} />
        <Route path="/ruby" element={<RubyPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/1stopshop" element={<TaskWebViewPage />} />
        <Route path="/business" element={<BusinessPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/leave" element={<LeavePage />} />
        <Route path="/payslip" element={<PayslipPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="/leave/new" element={<ProtectedRoute><LeaveNewPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
