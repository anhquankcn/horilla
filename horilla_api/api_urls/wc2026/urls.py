from django.urls import path

from horilla_api.api_views.wc2026 import views

urlpatterns = [
    path("matches/", views.WCMatchListView.as_view(), name="api-wc-matches"),
    path("predict/", views.WCPredictView.as_view(), name="api-wc-predict"),
    path("leaderboard/", views.WCLeaderboardView.as_view(), name="api-wc-leaderboard"),
    path("register/", views.WCRegisterView.as_view(), name="api-wc-register"),
    path("me/", views.WCMyProfileView.as_view(), name="api-wc-me"),
    path("admin/result/", views.WCAdminResultView.as_view(), name="api-wc-admin-result"),
]
