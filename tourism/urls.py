"""tourism/urls.py"""

from django.urls import path

from tourism import views

urlpatterns = [
    path("dashboard/", views.dashboard, name="tourism-dashboard"),
    # Tours
    path("tours/", views.tour_list, name="tourism-tour-list"),
    path("tours/create/", views.tour_create, name="tourism-tour-create"),
    path("tours/<int:pk>/edit/", views.tour_edit, name="tourism-tour-edit"),
    path("tours/<int:pk>/delete/", views.tour_delete, name="tourism-tour-delete"),
    # Guides (HDV)
    path("guides/", views.guide_list, name="tourism-guide-list"),
    path("guides/create/", views.guide_create, name="tourism-guide-create"),
    path("guides/<int:pk>/edit/", views.guide_edit, name="tourism-guide-edit"),
    path("guides/<int:pk>/delete/", views.guide_delete, name="tourism-guide-delete"),
    # Schedules (Lịch khởi hành / Phân ca)
    path("schedules/", views.schedule_list, name="tourism-schedule-list"),
    path("schedules/create/", views.schedule_create, name="tourism-schedule-create"),
    path("schedules/<int:pk>/edit/", views.schedule_edit, name="tourism-schedule-edit"),
    path("schedules/<int:pk>/delete/", views.schedule_delete, name="tourism-schedule-delete"),
    # Attendance (Chấm công)
    path("attendance/", views.attendance_list, name="tourism-attendance-list"),
    path("attendance/create/", views.attendance_create, name="tourism-attendance-create"),
    path("attendance/<int:pk>/edit/", views.attendance_edit, name="tourism-attendance-edit"),
    path("attendance/<int:pk>/delete/", views.attendance_delete, name="tourism-attendance-delete"),
]
