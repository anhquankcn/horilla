from django.urls import path

from horilla_api.api_views.helpdesk import views

urlpatterns = [
    path("ticket-types/", views.TicketTypeListView.as_view(), name="api-helpdesk-ticket-types"),
    path("tickets/", views.TicketListCreateView.as_view(), name="api-helpdesk-tickets"),
    path("tickets/<int:pk>/", views.TicketDetailView.as_view(), name="api-helpdesk-ticket-detail"),
    path("tickets/<int:pk>/comment/", views.TicketCommentView.as_view(), name="api-helpdesk-ticket-comment"),
]
