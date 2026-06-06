"""eoffice/urls.py"""

from django.shortcuts import redirect
from django.urls import path

from . import views

urlpatterns = [
    path("", lambda r: redirect("eoffice-board")),
    path("board/", views.board, name="eoffice-board"),
    path("task/create/", views.task_create, name="eoffice-task-create"),
    path("task/<int:pk>/edit/", views.task_edit, name="eoffice-task-edit"),
    path("task/<int:pk>/archive/", views.task_archive, name="eoffice-task-archive"),
    path("task/<int:pk>/status/", views.task_status_change, name="eoffice-task-status"),
    path("task/<int:pk>/comment/", views.comment_create, name="eoffice-comment-create"),
    path("tasks/", views.task_list, name="eoffice-task-list"),
    path("dashboard/", views.dashboard, name="eoffice-dashboard"),
    path("labelday/", views.labelday_view, name="eoffice-labelday"),
    path("labelday/assign/", views.labelday_assign, name="eoffice-labelday-assign"),
    path("labelday/delete/", views.labelday_delete, name="eoffice-labelday-delete"),
]
