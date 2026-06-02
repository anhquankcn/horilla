from django.contrib import admin
from .models import EmployeeNineBox, PromotionAnnouncement, PromotionApprovalStep, PromotionNomination


@admin.register(EmployeeNineBox)
class NineBoxAdmin(admin.ModelAdmin):
    list_display = ["employee", "period", "performance", "potential", "assessed_by", "assessed_date"]
    list_filter = ["period", "performance", "potential"]
    search_fields = ["employee__employee_first_name", "employee__employee_last_name"]


class ApprovalStepInline(admin.TabularInline):
    model = PromotionApprovalStep
    extra = 0
    fields = ["order", "approver", "role", "status", "comment", "decided_at"]
    readonly_fields = ["decided_at"]


@admin.register(PromotionNomination)
class NominationAdmin(admin.ModelAdmin):
    list_display = ["employee", "nominated_by", "status", "proposed_job_position", "created_at"]
    list_filter = ["status"]
    search_fields = ["employee__employee_first_name", "employee__employee_last_name"]
    inlines = [ApprovalStepInline]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(PromotionAnnouncement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ["title", "nomination", "is_published", "published_at"]
    list_filter = ["is_published"]
