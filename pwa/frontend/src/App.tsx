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
import { AttendanceSettingsPage } from './pages/AttendanceSettings'
import { ShiftProposalPage } from './pages/ShiftProposal'
import { WorkTypeProposalPage } from './pages/WorkTypeProposal'
import { AttendanceProposalPage } from './pages/AttendanceProposal'
import { AssetProposalPage } from './pages/AssetProposal'
import { CalendarPage } from './pages/Calendar'
import { AnnouncementHubPage } from './pages/AnnouncementHub'
import { AnnouncementFeedPage } from './pages/AnnouncementFeed'
import { ProjectsPage } from './pages/Projects'
import { DashboardPage } from './pages/Dashboard'
import { EmployeeProfilePage } from './pages/EmployeeProfile'
import { WorkInfoEditPage } from './pages/WorkInfoEdit'
import { UnifiedCalendarPage } from './pages/UnifiedCalendar'
import { AssetsPage } from './pages/Assets'
import { ReportsPage } from './pages/Reports'
import { PayrollMgmtPage } from './pages/PayrollMgmt'
import { DocumentsPage } from './pages/Documents'
import { OnboardingPage } from './pages/Onboarding'
import { JourneyPage } from './pages/Journey'
import { PMSPage } from './pages/PMS'
import { TrainingPage } from './pages/Training'
import { OrgChartPage } from './pages/OrgChart'
import { PromotionHubPage } from './pages/PromotionHub'
import { WorkSchedulePage } from './pages/WorkSchedule'
import { MonthlyAttendancePage } from './pages/MonthlyAttendance'
import { HelpDeskPage } from './pages/HelpDesk'
import { AttendanceDashboardPage } from './pages/AttendanceDashboard'
import { MonthlyAttendanceDetailPage } from './pages/MonthlyAttendanceDetail'
import { ShiftManagementPage } from './pages/ShiftManagement'
import { ShiftPlannerPage } from './pages/ShiftPlanner'
import { LeaveManagementPage } from './pages/LeaveManagement'
import { LeaveApprovalPage } from './pages/LeaveApproval'
import { LeaveOverviewPage } from './pages/LeaveOverview'
import { LeaveImportPage } from './pages/LeaveImport'
import { HNHLifePage } from './pages/HNHLife'
import { TaskBoardPage } from './pages/TaskBoard'
import { DayDetailPage } from './pages/DayDetail'
import { LabelDayWebViewPage } from './pages/LabelDayWebView'
// OpenAPI page removed — replaced by M2M ServiceAccounts
import { ExpenseListPage } from './pages/ExpenseList'
import { ExpenseSubmitPage } from './pages/ExpenseSubmit'
import { ExpenseApprovalsPage } from './pages/ExpenseApprovals'
import { ExpenseAdminPage } from './pages/ExpenseAdmin'
import { ExpenseBatchesPage } from './pages/ExpenseBatches'
import { ServiceAccountsPage } from './pages/ServiceAccounts'
import { DbSyncPage } from './pages/DbSync'
import { EOfficePage } from './pages/EOffice'
import { ExportAttendancePage } from './pages/ExportAttendance'
import { ServicesPage } from './pages/Services'
import { AccountMgmtPage } from './pages/AccountMgmt'
import { JobPositionRolesPage } from './pages/JobPositionRoles'
import { OnboardEmployeePage } from './pages/OnboardEmployee'
import { WC2026GamePage } from './pages/WC2026Game'
import { WC2026_ENABLED } from './lib/flags'

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
        <Route path="/proposals/attendance" element={<AttendanceProposalPage />} />
        <Route path="/proposals/asset" element={<AssetProposalPage />} />
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
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/announcements" element={<AnnouncementFeedPage />} />
        <Route path="/announcement-hub" element={<AnnouncementHubPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/employees/:id" element={<EmployeeProfilePage />} />
        <Route path="/employees/:id/work-info-edit" element={<WorkInfoEditPage />} />
        <Route path="/unified-calendar" element={<UnifiedCalendarPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/payroll-mgmt" element={<PayrollMgmtPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/journey" element={<JourneyPage />} />
        <Route path="/pms" element={<PMSPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/org-chart" element={<OrgChartPage />} />
        <Route path="/promotion-hub" element={<PromotionHubPage />} />
        <Route path="/work-schedule" element={<WorkSchedulePage />} />
        <Route path="/attendance/monthly" element={<MonthlyAttendancePage />} />
        <Route path="/helpdesk" element={<HelpDeskPage />} />
        <Route path="/attendance-dashboard" element={<AttendanceDashboardPage />} />
        <Route path="/attendance-monthly-detail" element={<MonthlyAttendanceDetailPage />} />
        <Route path="/shift-management" element={<ShiftManagementPage />} />
        <Route path="/shift-planner" element={<ShiftPlannerPage />} />
        <Route path="/leave-management" element={<LeaveManagementPage />} />
        <Route path="/leave/approvals" element={<LeaveApprovalPage />} />
        <Route path="/leave/overview" element={<LeaveOverviewPage />} />
        <Route path="/leave/import" element={<LeaveImportPage />} />
        <Route path="/life" element={<HNHLifePage />} />
        <Route path="/task-board" element={<TaskBoardPage />} />
        <Route path="/day/:date" element={<DayDetailPage />} />
        <Route path="/labelday" element={<LabelDayWebViewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/attendance-settings" element={<AttendanceSettingsPage />} />
        {/* open-api removed — replaced by /m2m ServiceAccounts */}
        <Route path="/m2m" element={<ServiceAccountsPage />} />
        <Route path="/db-sync" element={<DbSyncPage />} />
        <Route path="/eoffice" element={<EOfficePage />} />
        <Route path="/export-attendance" element={<ExportAttendancePage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/account-mgmt" element={<AccountMgmtPage />} />
        <Route path="/job-mgmt" element={<JobPositionRolesPage />} />
        <Route path="/onboard-employee" element={<OnboardEmployeePage />} />
        {WC2026_ENABLED && <Route path="/wc2026" element={<WC2026GamePage />} />}
        <Route path="/expenses" element={<ExpenseListPage />} />
        <Route path="/expenses/submit" element={<ExpenseSubmitPage />} />
        <Route path="/expenses/approvals" element={<ExpenseApprovalsPage />} />
        <Route path="/expenses/admin" element={<ExpenseAdminPage />} />
        <Route path="/expenses/batches" element={<ExpenseBatchesPage />} />
      </Route>

      <Route path="/leave/new" element={<ProtectedRoute><LeaveNewPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
