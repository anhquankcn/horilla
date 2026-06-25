from django.urls import path

from ...api_views.employee import views as views
from ...api_views.employee import shift_management_views as smv
from ...api_views.employee import keycloak_account_views as kav
from ...api_views.employee.onboard_views import (
    OnboardOptionsView, OnboardEmployeeView, OnboardScanIdView,
)

urlpatterns = [
    path("onboard/options/", OnboardOptionsView.as_view(), name="api-onboard-options"),
    path("onboard/scan-id/", OnboardScanIdView.as_view(), name="api-onboard-scan-id"),
    path("onboard/", OnboardEmployeeView.as_view(), name="api-onboard-employee"),
    path("me/", views.EmployeeMeAPIView.as_view(), name="api-employee-me"),
    path("me/bank/", views.EmployeeBankView.as_view(), name="api-employee-me-bank"),
    path("me/schedule/", views.EmployeeScheduleView.as_view(), name="api-employee-schedule"),
    path("me/ten-day-schedule/", views.TenDayScheduleView.as_view(), name="api-ten-day-schedule"),
    path("me/day-detail/", views.DayDetailView.as_view(), name="api-day-detail"),
    # path('employees/', views.EmployeeAPIView.as_view(), name='api-employees-list'),
    path(
        "employees/<int:pk>/",
        views.EmployeeAPIView.as_view(),
        name="api-employee-detail",
    ),
    path(
        "employee-type/<int:pk>",
        views.EmployeeTypeAPIView.as_view(),
        name="api-employees",
    ),
    path("employee-type/", views.EmployeeTypeAPIView.as_view(), name="api-employees"),
    path(
        "list/employees/",
        views.EmployeeListAPIView.as_view(),
        name="api-employee-list-detailed",
    ),  # Alternative endpoint for listing employees
    path(
        "employee-bank-details/<int:pk>/",
        views.EmployeeBankDetailsAPIView.as_view(),
        name="api-employee-bank-details-detail",
    ),
    path(
        "employee-work-information/",
        views.EmployeeWorkInformationAPIView.as_view(),
        name="api-employee-work-information-list",
    ),
    path(
        "employee-work-information/<int:pk>/",
        views.EmployeeWorkInformationAPIView.as_view(),
        name="api-employee-work-information-detail",
    ),
    path(
        "employee-work-info-export/",
        views.EmployeeWorkInfoExportView.as_view(),
        name="api-employee-work-info-export",
    ),
    path(
        "employee-work-info-import/",
        views.EmployeeWorkInfoImportView.as_view(),
        name="api-employee-work-info-import",
    ),
    path(
        "employee-bulk-update/",
        views.EmployeeBulkUpdateView.as_view(),
        name="api-employee-bulk-update",
    ),
    path(
        "disciplinary-action/",
        views.DisciplinaryActionAPIView.as_view(),
        name="api-disciplinary-action-list",
    ),
    path(
        "disciplinary-action/<int:pk>/",
        views.DisciplinaryActionAPIView.as_view(),
        name="api-disciplinary-action-detail",
    ),
    path(
        "disciplinary-action-type/",
        views.ActiontypeView.as_view(),
        name="api-disciplinary-action-type",
    ),
    path(
        "disciplinary-action-type/<int:pk>/",
        views.ActiontypeView.as_view(),
        name="api-disciplinary-action-type",
    ),
    path("policies/", views.PolicyAPIView.as_view(), name="api-policy-list"),
    path("policies/<int:pk>/", views.PolicyAPIView.as_view(), name="api-policy-detail"),
    path(
        "document-request/",
        views.DocumentRequestAPIView.as_view(),
        name="api-document-request-list",
    ),
    path(
        "document-request/<int:pk>/",
        views.DocumentRequestAPIView.as_view(),
        name="api-document-request-detail",
    ),
    path(
        "document-bulk-approve-reject/",
        views.DocumentBulkApproveRejectAPIView.as_view(),
        name="api-document-bulk-approve-reject",
    ),
    path(
        "document-request-approve-reject/<int:id>/<str:status>/",
        views.DocumentRequestApproveRejectView.as_view(),
        name="api-document-request-approve-reject",
    ),
    path("documents/", views.DocumentAPIView.as_view(), name="api-document-list"),
    path(
        "documents/<int:pk>/",
        views.DocumentAPIView.as_view(),
        name="api-document-detail",
    ),
    path(
        "employee-bulk- archive/<str:is_active>/",
        views.EmployeeBulkArchiveView.as_view(),
        name="api-employee-bulk-archive",
    ),
    path(
        "employee-archive/<int:id>/<str:is_active>/",
        views.EmployeeArchiveView.as_view(),
        name="api-employee-archive",
    ),
    path(
        "employee-selector/",
        views.EmployeeSelectorView.as_view(),
        name="api-employee-selector",
    ),
    path(
        "manager-check/",
        views.ReportingManagerCheck.as_view(),
        name="api-manager-check",
    ),
    path(
        "directory/",
        views.EmployeeDirectoryView.as_view(),
        name="api-employee-directory",
    ),
    path(
        "employees/by-email/",
        views.EmployeeByEmailView.as_view(),
        name="api-employee-by-email",
    ),
    path(
        "departments/",
        views.DepartmentListView.as_view(),
        name="api-department-list",
    ),
    path(
        "companies/",
        views.CompanyListView.as_view(),
        name="api-company-list",
    ),
    path(
        "positions/",
        views.PositionListView.as_view(),
        name="api-position-list",
    ),
    path(
        "roles-for-position/",
        views.RolesForPositionView.as_view(),
        name="api-roles-for-position",
    ),
    path(
        "assign-position/",
        views.AssignPositionView.as_view(),
        name="api-assign-position",
    ),
    path(
        "revoke-position/",
        views.RevokePositionView.as_view(),
        name="api-revoke-position",
    ),
    path(
        "change-role/",
        views.ChangeRoleView.as_view(),
        name="api-change-role",
    ),
    # ── Permission Groups ──
    path(
        "groups/",
        views.GroupListView.as_view(),
        name="api-group-list",
    ),
    path(
        "groups/<int:pk>/",
        views.GroupDetailView.as_view(),
        name="api-group-detail",
    ),
    path(
        "groups/<int:pk>/add-members/",
        views.GroupAddMembersView.as_view(),
        name="api-group-add-members",
    ),
    path(
        "groups/<int:pk>/remove-members/",
        views.GroupRemoveMembersView.as_view(),
        name="api-group-remove-members",
    ),
    path(
        "groups/<int:pk>/available-employees/",
        views.GroupAvailableEmployeesView.as_view(),
        name="api-group-available-employees",
    ),
    path(
        "groups/<int:pk>/update/",
        views.GroupUpdateView.as_view(),
        name="api-group-update",
    ),
    path(
        "groups/all-permissions/",
        views.AllPermissionsView.as_view(),
        name="api-group-all-permissions",
    ),
    path(
        "all-app-features/",
        views.AllAppFeaturesView.as_view(),
        name="api-all-app-features",
    ),
    path(
        "my-apps/",
        views.MyAppsView.as_view(),
        name="api-my-apps",
    ),
    path(
        "my-nav-tabs/",
        views.MyNavTabsView.as_view(),
        name="api-my-nav-tabs",
    ),
    path(
        "dashboard/",
        views.DashboardView.as_view(),
        name="api-dashboard",
    ),
    path(
        "<int:pk>/public-info/",
        views.EmployeePublicInfoView.as_view(),
        name="api-employee-public-info",
    ),
    path(
        "<int:pk>/profile/",
        views.EmployeeProfileView.as_view(),
        name="api-employee-profile",
    ),
    path(
        "<int:pk>/work-info-edit/",
        views.WorkInfoEditView.as_view(),
        name="api-employee-work-info-edit",
    ),
    path(
        "unified-calendar/",
        views.UnifiedCalendarView.as_view(),
        name="api-unified-calendar",
    ),
    path(
        "reports/",
        views.ReportsView.as_view(),
        name="api-reports",
    ),
    path(
        "documents-pwa/",
        views.DocumentsPWAView.as_view(),
        name="api-documents-pwa",
    ),
    path(
        "onboarding-offboarding/",
        views.OnboardingOffboardingPWAView.as_view(),
        name="api-onboarding-offboarding",
    ),
    path(
        "employee-journey/",
        views.EmployeeJourneyPWAView.as_view(),
        name="api-employee-journey",
    ),
    path(
        "pms/",
        views.PMSPWAView.as_view(),
        name="api-pms-pwa",
    ),
    path(
        "training/",
        views.TrainingPWAView.as_view(),
        name="api-training-pwa",
    ),
    path(
        "org-chart/",
        views.OrgChartView.as_view(),
        name="api-org-chart",
    ),
    path(
        "promotion-hub/",
        views.PromotionHubView.as_view(),
        name="api-promotion-hub",
    ),
    # ── Shift Management ──
    path("shift-mgmt/scope/", smv.ShiftMgmtScopeView.as_view(), name="api-shift-mgmt-scope"),
    path("shift-mgmt/shifts/", smv.ShiftMgmtShiftsView.as_view(), name="api-shift-mgmt-shifts"),
    path("shift-mgmt/dept-shifts/", smv.ShiftMgmtDeptShiftView.as_view(), name="api-shift-mgmt-dept-shifts"),
    path("shift-mgmt/employees/", smv.ShiftMgmtEmployeesView.as_view(), name="api-shift-mgmt-employees"),
    path("shift-mgmt/plan/", smv.ShiftMgmtPlanView.as_view(), name="api-shift-mgmt-plan"),
    path("shift-mgmt/schedule/<int:schedule_id>/auto/", smv.ShiftScheduleAutoView.as_view(), name="api-shift-schedule-auto"),
    path("shift-categories/", smv.ShiftCRUDView.as_view(), name="api-shift-categories"),
    path("shift-planner/", smv.ShiftPlannerView.as_view(), name="api-shift-planner"),
    path("attendance-config/", smv.AttendanceConfigView.as_view(), name="api-attendance-config"),
    # ── Keycloak Account Management ──
    path("kc-options/", kav.KcOptionsView.as_view(), name="api-kc-options"),
    path("<int:pk>/kc-account/identity/", kav.KcIdentityView.as_view(), name="api-kc-identity"),
    path("<int:pk>/kc-account/", kav.KcAccountView.as_view(), name="api-kc-account"),
    path("kc-dept-preview/", kav.KcDeptPreviewView.as_view(), name="api-kc-dept-preview"),
    path("kc-bulk-create/", kav.KcBulkCreateView.as_view(), name="api-kc-bulk-create"),
]
