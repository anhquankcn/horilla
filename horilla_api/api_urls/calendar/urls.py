from django.urls import path

from horilla_api.api_views.calendar import views

urlpatterns = [
    # Feed cá nhân (subscribe) — xác thực bằng token trong URL, công khai.
    path("feed/<str:token>", views.CalendarFeedView.as_view(), name="calendar-feed"),
    # 1 sự kiện (PA3 "Thêm vào lịch") — auth JWT.
    path("event/<str:kind>/<int:pk>", views.CalendarEventView.as_view(), name="calendar-event"),
    # JSON sự kiện cho màn Lịch tổng hợp.
    path("events/", views.CalendarEventsView.as_view(), name="calendar-events"),
    # Quản lý token feed cá nhân.
    path("token/", views.CalendarTokenView.as_view(), name="calendar-token"),
]
