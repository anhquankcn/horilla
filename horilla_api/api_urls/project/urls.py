from django.urls import path

from ...api_views.project import views

urlpatterns = [
    path("my-projects/", views.MyProjectsView.as_view()),
    path("<int:pk>/", views.ProjectDetailView.as_view()),
    path("tasks/<int:pk>/status/", views.TaskUpdateStatusView.as_view()),
]
