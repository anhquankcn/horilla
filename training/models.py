from django.db import models
from django.utils.translation import gettext_lazy as _

from base.horilla_company_manager import HorillaCompanyManager
from base.models import Company
from employee.models import Employee


class TrainingCategory(models.Model):
    name = models.CharField(max_length=100, verbose_name=_("Category Name"))
    description = models.TextField(blank=True, null=True)
    company_id = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_("Company"),
    )
    objects = HorillaCompanyManager("company_id")

    class Meta:
        verbose_name = _("Training Category")
        verbose_name_plural = _("Training Categories")
        ordering = ["name"]

    def __str__(self):
        return self.name


class TrainingCourse(models.Model):
    COURSE_TYPE_CHOICES = (
        ("internal", _("Internal")),
        ("external", _("External")),
        ("online", _("Online")),
        ("onsite", _("On-site")),
    )

    title = models.CharField(max_length=200, verbose_name=_("Course Title"))
    description = models.TextField(blank=True, null=True, verbose_name=_("Description"))
    category = models.ForeignKey(
        TrainingCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="courses",
        verbose_name=_("Category"),
    )
    course_type = models.CharField(
        max_length=20,
        choices=COURSE_TYPE_CHOICES,
        default="internal",
        verbose_name=_("Type"),
    )
    instructor = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        verbose_name=_("Instructor"),
    )
    instructor_employee = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="taught_courses",
        verbose_name=_("Instructor (Employee)"),
    )
    duration_hours = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        default=0,
        verbose_name=_("Duration (hours)"),
    )
    max_participants = models.PositiveIntegerField(
        default=0,
        verbose_name=_("Max Participants (0 = unlimited)"),
    )
    start_date = models.DateField(null=True, blank=True, verbose_name=_("Start Date"))
    end_date = models.DateField(null=True, blank=True, verbose_name=_("End Date"))
    location = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        verbose_name=_("Location"),
    )
    is_mandatory = models.BooleanField(default=False, verbose_name=_("Mandatory"))
    is_active = models.BooleanField(default=True, verbose_name=_("Active"))
    target_departments = models.ManyToManyField(
        "base.Department",
        blank=True,
        related_name="training_courses",
        verbose_name=_("Target Departments"),
    )
    company_id = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_("Company"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = HorillaCompanyManager("company_id")

    class Meta:
        verbose_name = _("Training Course")
        verbose_name_plural = _("Training Courses")
        ordering = ["-start_date", "title"]

    def __str__(self):
        return self.title

    @property
    def enrolled_count(self):
        return self.enrollments.exclude(status="cancelled").count()

    @property
    def completed_count(self):
        return self.enrollments.filter(status="completed").count()


class TrainingEnrollment(models.Model):
    STATUS_CHOICES = (
        ("enrolled", _("Enrolled")),
        ("in_progress", _("In Progress")),
        ("completed", _("Completed")),
        ("cancelled", _("Cancelled")),
        ("failed", _("Failed")),
    )

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="training_enrollments",
        verbose_name=_("Employee"),
    )
    course = models.ForeignKey(
        TrainingCourse,
        on_delete=models.CASCADE,
        related_name="enrollments",
        verbose_name=_("Course"),
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="enrolled",
        verbose_name=_("Status"),
    )
    enrolled_date = models.DateField(auto_now_add=True, verbose_name=_("Enrolled Date"))
    started_date = models.DateField(null=True, blank=True, verbose_name=_("Started Date"))
    completed_date = models.DateField(null=True, blank=True, verbose_name=_("Completed Date"))
    score = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        verbose_name=_("Score"),
    )
    certificate_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name=_("Certificate Number"),
    )
    notes = models.TextField(blank=True, null=True, verbose_name=_("Notes"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = HorillaCompanyManager("employee__employee_work_info__company_id")

    class Meta:
        verbose_name = _("Training Enrollment")
        verbose_name_plural = _("Training Enrollments")
        unique_together = ("employee", "course")
        ordering = ["-enrolled_date"]

    def __str__(self):
        return f"{self.employee} - {self.course}"

    @property
    def progress_percentage(self):
        if self.status == "completed":
            return 100
        if self.status == "in_progress":
            return 50
        if self.status == "enrolled":
            return 0
        return 0
