from django.urls import path

from horilla_api.api_views.eoffice.views import MyTaskSummaryView

urlpatterns = [
    path("my-summary/", MyTaskSummaryView.as_view()),
]
