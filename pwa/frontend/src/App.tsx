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
import { AppsPage } from './pages/Apps'
import { EmployeesPage } from './pages/Employees'
import { RolesPage } from './pages/Roles'
import { GroupsPage } from './pages/Groups'
import { AttendanceActivityPage } from './pages/AttendanceActivity'
import { ProposalsPage } from './pages/Proposals'
import { LeaveProposalPage } from './pages/LeaveProposal'
import { ApprovalsPage } from './pages/Approvals'
import { SettingsPage } from './pages/Settings'
import { ShiftProposalPage } from './pages/ShiftProposal'
import { WorkTypeProposalPage } from './pages/WorkTypeProposal'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/attendance-activity" element={<AttendanceActivityPage />} />
        <Route path="/proposals" element={<ProposalsPage />} />
        <Route path="/proposals/leave" element={<LeaveProposalPage />} />
        <Route path="/proposals/shift" element={<ShiftProposalPage />} />
        <Route path="/proposals/worktype" element={<WorkTypeProposalPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
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
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="/leave/new" element={<ProtectedRoute><LeaveNewPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
