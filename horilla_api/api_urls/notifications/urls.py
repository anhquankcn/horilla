from django.urls import path, re_path

from ...api_views.notifications import views

urlpatterns = [
    path("list/<str:type>", views.NotificationView.as_view()),
    path("<int:id>/", views.NotificationReadDelView.as_view()),
    path(
        "bulk-delete-unread/",
        views.NotificationBulkDelUnreadMessageView.as_view(),
    ),
    path("bulk-read/", views.NotificationBulkReadDelView.as_view()),
    path("bulk-delete/", views.NotificationBulkReadDelView.as_view()),
    path("summary/", views.NotificationSummaryView.as_view()),
    path("push/vapid-key/", views.VapidPublicKeyView.as_view()),
    path("push/subscribe/", views.PushSubscribeView.as_view()),
    path("announcements/", views.AnnouncementCreateView.as_view()),
    path("announcements/history/", views.AnnouncementHistoryView.as_view()),
    path("announcements/received/", views.AnnouncementReceivedView.as_view()),
    path("announcements/feed/", views.AnnouncementFeedView.as_view()),
    path("announcements/targets/", views.AnnouncementTargetsView.as_view()),
    path("announcements/<int:pk>/", views.AnnouncementDetailView.as_view()),
    path("announcements/<int:pk>/feedback/", views.AnnouncementFeedbackView.as_view()),
    path("announcements/<int:pk>/like/", views.AnnouncementLikeView.as_view()),
]
