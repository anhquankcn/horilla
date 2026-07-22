from django.urls import path

from horilla_api.api_views.m2m import views

urlpatterns = [
    # M2M data endpoints (service token auth)
    path("whoami/", views.WhoAmIView.as_view()),
    path("employees/", views.M2MEmployeeListView.as_view()),
    path("employees/<int:pk>/", views.M2MEmployeeDetailView.as_view()),
    path("attendance/", views.M2MAttendanceView.as_view()),
    path("leave-balances/", views.M2MLeaveBalanceView.as_view()),
    # Nhắc lịch bận Outlook (BFF poll Graph)
    path("outlook-reminder-targets/", views.M2MOutlookReminderTargetsView.as_view()),
    path("send-meeting-push/", views.M2MSendMeetingPushView.as_view()),
    # Admin CRUD (user JWT auth)
    path("scopes/", views.M2MScopesListView.as_view()),
    path("accounts/", views.ServiceAccountAdminView.as_view()),
    path("accounts/<int:pk>/", views.ServiceAccountDetailView.as_view()),
    path("accounts/<int:pk>/rotate/", views.ServiceAccountRotateView.as_view()),
    # Integration configs (outbound)
    path("integrations/", views.IntegrationListView.as_view()),
    path("integrations/<str:system>/", views.IntegrationDetailView.as_view()),
    path("integrations/<str:system>/internal/", views.IntegrationInternalView.as_view()),
]
