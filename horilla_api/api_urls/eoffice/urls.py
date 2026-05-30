from django.urls import path

from horilla_api.api_views.eoffice.views import (
    MyTaskListView,
    MyTaskSummaryView,
    TaskCreateView,
    TaskDetailView,
)

urlpatterns = [
    path("my-summary/", MyTaskSummaryView.as_view()),
    path("my-tasks/", MyTaskListView.as_view()),
    path("tasks/", TaskCreateView.as_view()),
    path("tasks/<int:pk>/", TaskDetailView.as_view()),
]
