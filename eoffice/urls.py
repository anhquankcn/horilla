"""eoffice/urls.py"""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.board, name="eoffice-board"),
    path("task/create/", views.task_create, name="eoffice-task-create"),
    path("task/<int:pk>/edit/", views.task_edit, name="eoffice-task-edit"),
    path("task/<int:pk>/archive/", views.task_archive, name="eoffice-task-archive"),
    path("task/<int:pk>/status/", views.task_status_change, name="eoffice-task-status"),
    path("task/<int:pk>/comment/", views.comment_create, name="eoffice-comment-create"),
    path("dashboard/", views.dashboard, name="eoffice-dashboard"),
]
