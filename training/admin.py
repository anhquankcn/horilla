from django.contrib import admin

from training.models import TrainingCategory, TrainingCourse, TrainingEnrollment


@admin.register(TrainingCategory)
class TrainingCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "company_id")


@admin.register(TrainingCourse)
class TrainingCourseAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "course_type", "duration_hours", "is_active")
    list_filter = ("category", "course_type", "is_active")
    search_fields = ("title",)


@admin.register(TrainingEnrollment)
class TrainingEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("employee", "course", "status", "enrolled_date", "score")
    list_filter = ("status", "course")
    search_fields = ("employee__employee_first_name", "course__title")
