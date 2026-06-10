from django.contrib import admin

from .models import ExpenseRequest, ExpenseWeeklyBatch


@admin.register(ExpenseRequest)
class ExpenseRequestAdmin(admin.ModelAdmin):
    list_display = ("employee", "amount", "category", "status", "created_at")
    list_filter = ("status", "category")
    search_fields = ("employee__employee_first_name", "description")


@admin.register(ExpenseWeeklyBatch)
class ExpenseWeeklyBatchAdmin(admin.ModelAdmin):
    list_display = ("week_start", "week_end", "created_at")
