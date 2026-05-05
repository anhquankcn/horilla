"""tourism/admin.py"""

from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from tourism.models import Tour, TourAttendance, TourGuide, TourSchedule


@admin.register(Tour)
class TourAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "tour_type", "destination", "duration_display", "status"]
    list_filter = ["tour_type", "status"]
    search_fields = ["name", "code", "destination"]
    list_editable = ["status"]


@admin.register(TourGuide)
class TourGuideAdmin(admin.ModelAdmin):
    list_display = ["employee", "license_number", "guide_type", "languages", "is_active"]
    list_filter = ["guide_type", "is_active"]
    search_fields = ["employee__employee_first_name", "employee__employee_last_name", "license_number"]
    autocomplete_fields = ["employee"]


class TourAttendanceInline(admin.TabularInline):
    model = TourAttendance
    extra = 0
    fields = ["employee", "work_date", "check_in", "check_out", "status", "overtime_hours"]


@admin.register(TourSchedule)
class TourScheduleAdmin(admin.ModelAdmin):
    list_display = ["schedule_code", "tour", "start_date", "end_date", "pax", "lead_guide", "status"]
    list_filter = ["status", "tour__tour_type"]
    search_fields = ["schedule_code", "tour__name", "tour__code"]
    date_hierarchy = "start_date"
    inlines = [TourAttendanceInline]
    filter_horizontal = ["support_guides"]


@admin.register(TourAttendance)
class TourAttendanceAdmin(admin.ModelAdmin):
    list_display = ["employee", "tour_schedule", "work_date", "check_in", "check_out", "status", "overtime_hours"]
    list_filter = ["status", "work_date"]
    search_fields = ["employee__employee_first_name", "employee__employee_last_name", "tour_schedule__schedule_code"]
    date_hierarchy = "work_date"
    list_editable = ["status"]
