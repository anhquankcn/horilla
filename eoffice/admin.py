"""eoffice/admin.py"""

from django.contrib import admin

from .models import DashboardVisit, TaskComment, WorkTask


@admin.register(WorkTask)
class WorkTaskAdmin(admin.ModelAdmin):
    list_display = ["title", "assigned_to", "department", "status", "priority", "due_date", "is_active"]
    list_filter = ["status", "priority", "department", "is_active"]
    search_fields = ["title", "assigned_to__employee_first_name", "assigned_to__employee_last_name"]
    readonly_fields = ["created_at", "updated_at", "completed_at", "next_occurrence_created"]

    def has_delete_permission(self, request, obj=None):
        # Hard-delete via admin is disabled — use is_active=False (soft-delete) instead.
        return False


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ["task", "author", "created_at", "is_active"]
    list_filter = ["is_active"]
    readonly_fields = ["created_at", "updated_at"]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(DashboardVisit)
class DashboardVisitAdmin(admin.ModelAdmin):
    list_display = ["user", "visited_at"]
    list_filter = ["user"]
    readonly_fields = ["visited_at"]
