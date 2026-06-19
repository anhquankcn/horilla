"""
horilla_api/urls/attendance/urls.py
"""

from django.urls import path

from horilla_api.api_views.attendance.permission_views import AttendancePermissionCheck
from horilla_api.api_views.attendance.views import *
from horilla_api.api_views.attendance import export_views
from horilla_api.api_views.attendance.biometric_ingest import BiometricPunchView

urlpatterns = [
    path("biometric-punch/", BiometricPunchView.as_view(), name="api-biometric-punch"),
    path("clock-in/", ClockInAPIView.as_view(), name="api-check-in"),
    path("clock-out/", ClockOutAPIView.as_view(), name="api-check-out"),
    path("attendance/", AttendanceView.as_view(), name="api-attendance-list"),
    path("attendance/<int:pk>", AttendanceView.as_view(), name="api-attendance-detail"),
    path(
        "attendance/list/<str:type>",
        AttendanceView.as_view(),
        name="api-attendance-list",
    ),
    path("attendance-validate/<int:pk>", ValidateAttendanceView.as_view()),
    path(
        "attendance-request/",
        AttendanceRequestView.as_view(),
        name="api-attendance-request-view",
    ),
    path(
        "attendance-request/<int:pk>",
        AttendanceRequestView.as_view(),
        name="api-attendance-request-view",
    ),
    path(
        "attendance-request-approve/<int:pk>",
        AttendanceRequestApproveView.as_view(),
        name="api-",
    ),
    path(
        "attendance-request-cancel/<int:pk>",
        AttendanceRequestCancelView.as_view(),
        name="api-",
    ),
    path("overtime-approve/<int:pk>", OvertimeApproveView.as_view(), name="api-"),
    path(
        "attendance-hour-account/<int:pk>/",
        AttendanceOverTimeView.as_view(),
        name="api-",
    ),
    path("attendance-hour-account/", AttendanceOverTimeView.as_view(), name="api-"),
    path("late-come-early-out-view/", LateComeEarlyOutView.as_view(), name="api-"),
    path("attendance-activity/", AttendanceActivityView.as_view(), name="api-"),
    path("today-attendance/", TodayAttendance.as_view(), name="api-"),
    path("offline-employees/count/", OfflineEmployeesCountView.as_view(), name="api-"),
    path("offline-employees/list/", OfflineEmployeesListView.as_view(), name="api-"),
    path("permission-check/attendance", AttendancePermissionCheck.as_view()),
    path("checking-in", CheckingStatus.as_view()),
    path("offices/", OfficesAPIView.as_view(), name="api-offices"),
    path("offline-employee-mail-send", OfflineEmployeeMailsend.as_view()),
    path("converted-mail-template", ConvertedMailTemplateConvert.as_view()),
    path("mail-templates", MailTemplateView.as_view()),
    path("my-attendance/", UserAttendanceView.as_view()),
    path("attendance-type-check/", AttendanceTypeAccessCheck.as_view()),
    path("my-attendance-detailed/<int:id>/", UserAttendanceDetailedView.as_view()),
    path("my-attendance/<int:id>/activities/", MyAttendanceActivitiesView.as_view()),
    path("my-schedule/", MyScheduleAPIView.as_view(), name="api-my-schedule"),
    path(
        "activity-overview/",
        AttendanceActivityOverviewView.as_view(),
        name="api-attendance-activity-overview",
    ),
    path(
        "my-attendance-requests/",
        MyAttendanceRequestsView.as_view(),
        name="api-my-attendance-requests",
    ),
    path(
        "pwa-attendance-request/",
        PWAAttendanceRequestView.as_view(),
        name="api-pwa-attendance-request",
    ),
    path("my-calendar/", MyCalendarView.as_view(), name="api-my-calendar"),
    path("attendance/<int:pk>/comments/", AttendanceCommentView.as_view(), name="api-attendance-comments"),
    path("company-dashboard/", CompanyAttendanceDashboardView.as_view(), name="api-company-dashboard"),
    path("monthly-detail/", MonthlyAttendanceDetailView.as_view(), name="api-monthly-attendance-detail"),
    path("activity-detail/", AttendanceActivityDetailView.as_view(), name="api-attendance-activity-detail"),
    path("nco/declare/", NCODeclareView.as_view(), name="api-nco-declare"),
    path("nco/approve/", NCOApproveView.as_view(), name="api-nco-approve"),
    path("my-month-calendar/", MyMonthCalendarView.as_view(), name="api-my-month-calendar"),
    path("auto-clockout-schedule/", AutoClockoutScheduleView.as_view(), name="api-auto-clockout-schedule"),
    path("my-today-shifts/", MyTodayShiftDetailView.as_view(), name="api-my-today-shifts"),
    path("manager-punch-matrix/", ManagerPunchMatrixView.as_view(), name="api-manager-punch-matrix"),
    path("manager-punch-detail/", ManagerPunchDetailView.as_view(), name="api-manager-punch-detail"),
    # Export
    path("export-monthly/", export_views.AttendanceExportPreviewView.as_view(), name="api-export-monthly"),
    path("export-monthly/xlsx/", export_views.AttendanceExportExcelView.as_view(), name="api-export-monthly-xlsx"),
]
