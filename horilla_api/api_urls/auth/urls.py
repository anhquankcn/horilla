from django.urls import path

from ...api_views.auth.views import LoginAPIView, OIDCLoginAPIView

urlpatterns = [
    path("login/", LoginAPIView.as_view()),
    path("oidc-login/", OIDCLoginAPIView.as_view()),
]
