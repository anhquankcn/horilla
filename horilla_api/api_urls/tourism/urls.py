from django.urls import path

from ...api_views.tourism import views

urlpatterns = [
    path("my-schedules/", views.MyTourSchedulesView.as_view()),
    path("schedules/", views.TourScheduleListView.as_view()),
]
