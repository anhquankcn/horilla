from django.urls import path

from horilla_api.api_views.expenses import views

urlpatterns = [
    path("my-role/", views.ExpenseRoleView.as_view()),
    # Employee
    path("requests/", views.ExpenseSubmitView.as_view()),
    path("requests/my/", views.ExpenseMyListView.as_view()),
    path("requests/<int:pk>/", views.ExpenseEditView.as_view()),
    # Manager
    path("requests/to-approve/", views.ExpenseToApproveView.as_view()),
    path("requests/<int:pk>/approve/", views.ExpenseApproveView.as_view()),
    # Hành chính
    path("requests/admin/", views.ExpenseAdminListView.as_view()),
    path("requests/<int:pk>/hc-confirm/", views.ExpenseHCConfirmView.as_view()),
    path("batches/", views.ExpenseBatchCreateView.as_view()),
    path("batches/<int:pk>/", views.ExpenseBatchDetailView.as_view()),
]
