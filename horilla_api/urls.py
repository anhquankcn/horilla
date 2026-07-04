from django.urls import include, path

urlpatterns = [
    path("auth/", include("horilla_api.api_urls.auth.urls")),
    path("asset/", include("horilla_api.api_urls.asset.urls")),
    path("base/", include("horilla_api.api_urls.base.urls")),
    path("employee/", include("horilla_api.api_urls.employee.urls")),
    path("notifications/", include("horilla_api.api_urls.notifications.urls")),
    path("payroll/", include("horilla_api.api_urls.payroll.urls")),
    path("attendance/", include("horilla_api.api_urls.attendance.urls")),
    path("leave/", include("horilla_api.api_urls.leave.urls")),
    path("tourism/", include("horilla_api.api_urls.tourism.urls")),
    path("eoffice/", include("horilla_api.api_urls.eoffice.urls")),
    path("project/", include("horilla_api.api_urls.project.urls")),
    path("helpdesk/", include("horilla_api.api_urls.helpdesk.urls")),
    path("expenses/", include("horilla_api.api_urls.expenses.urls")),
    path("m2m/", include("horilla_api.api_urls.m2m.urls")),
    path("wc2026/", include("horilla_api.api_urls.wc2026.urls")),
    path("calendar/", include("horilla_api.api_urls.calendar.urls")),
]
