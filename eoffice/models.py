"""eoffice/models.py"""

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from base.models import Department
from employee.models import Employee
from horilla.models import HorillaModel


class WorkTask(HorillaModel):
    STATUS_CHOICES = [
        ("to_do", _("Cần làm")),
        ("in_progress", _("Đang làm")),
        ("done", _("Hoàn thành")),
        ("blocked", _("Bị chặn")),
    ]

    PRIORITY_CHOICES = [
        ("low", _("Thấp")),
        ("normal", _("Bình thường")),
        ("high", _("Cao")),
        ("urgent", _("Khẩn cấp")),
    ]

    RECURRENCE_CHOICES = [
        ("none", _("Không lặp")),
        ("daily", _("Hằng ngày")),
        ("weekly", _("Hằng tuần")),
        ("monthly", _("Hằng tháng")),
    ]

    title = models.CharField(max_length=255, verbose_name=_("Tiêu đề"))
    description = models.TextField(blank=True, verbose_name=_("Mô tả"))
    assigned_to = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="assigned_tasks",
        verbose_name=_("Giao cho"),
    )
    assigned_by = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="created_tasks",
        verbose_name=_("Người giao"),
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="tasks",
        verbose_name=_("Phòng ban"),
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="to_do",
        verbose_name=_("Trạng thái"),
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="normal",
        verbose_name=_("Ưu tiên"),
    )
    due_date = models.DateField(null=True, blank=True, verbose_name=_("Deadline"))
    recurrence_rule = models.CharField(
        max_length=20,
        choices=RECURRENCE_CHOICES,
        default="none",
        verbose_name=_("Lặp lại"),
    )
    # Idempotency guard for the recurring-task cron job.
    # Set True after spawning next occurrence; reset to False by transition_status()
    # when task moves OUT of 'done' (e.g. manager re-opens it).
    next_occurrence_created = models.BooleanField(default=False)
    parent_task = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="subtasks",
        verbose_name=_("Thuộc công việc cha"),
    )
    # created_at inherited from HorillaModel (auto_now_add=True) — do NOT redefine.
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Công việc")
        verbose_name_plural = _("Danh sách công việc")
        indexes = [
            models.Index(
                fields=["status", "recurrence_rule", "next_occurrence_created"],
                name="worktask_recur_cron_idx",
            ),
            models.Index(fields=["assigned_to", "is_active"], name="worktask_assignee_idx"),
            models.Index(fields=["department", "is_active"], name="worktask_dept_idx"),
            models.Index(fields=["due_date", "status"], name="worktask_overdue_idx"),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        if self.recurrence_rule != "none" and not self.due_date:
            raise ValidationError({"due_date": _("Deadline bắt buộc khi có lặp lại.")})
        if self.pk and self.parent_task_id == self.pk:
            raise ValidationError(
                {"parent_task": _("Công việc không thể là cha của chính nó.")}
            )
        if self.parent_task_id:
            parent_parent = (
                WorkTask.objects.filter(pk=self.parent_task_id)
                .values_list("parent_task_id", flat=True)
                .first()
            )
            if parent_parent is not None:
                raise ValidationError(
                    {"parent_task": _("Không tạo công việc con của công việc con (tối đa 1 cấp).")}
                )

    def save(self, *args, **kwargs):
        # Skip full_clean() for targeted update_fields saves (e.g. cron updating
        # next_occurrence_created=True — no need to re-validate the whole object).
        if not kwargs.get("update_fields"):
            self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        from django.utils import timezone
        if self.due_date and self.status in ("to_do", "in_progress"):
            return self.due_date < timezone.localdate()
        return False

    @property
    def overdue_days(self):
        from django.utils import timezone
        if self.is_overdue:
            return (timezone.localdate() - self.due_date).days
        return 0


class EmployeeDayLabel(models.Model):
    """HR/manager tags a specific date for an employee: trip, event."""

    LABEL_CHOICES = [
        ("trip",  _("Công tác")),
        ("event", _("Sự kiện")),
        ("sick",  _("Nghỉ ốm")),
    ]

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="day_labels", verbose_name=_("Nhân viên")
    )
    date = models.DateField(verbose_name=_("Ngày"))
    label = models.CharField(max_length=10, choices=LABEL_CHOICES, verbose_name=_("Loại"))
    note = models.CharField(max_length=200, blank=True, verbose_name=_("Ghi chú"))

    class Meta:
        unique_together = [("employee", "date")]
        verbose_name = _("Nhãn ngày")
        verbose_name_plural = _("Nhãn ngày làm việc")
        indexes = [models.Index(fields=["employee", "date"], name="edaylabel_emp_date_idx")]

    def __str__(self):
        return f"{self.employee} – {self.date} ({self.label})"


class DashboardVisit(models.Model):
    """Records every CEO/manager dashboard page load — used for the Phase 1b gate criterion."""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="dashboard_visits",
    )
    visited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Lượt xem dashboard")
        verbose_name_plural = _("Lượt xem dashboard")


class TaskComment(HorillaModel):
    task = models.ForeignKey(
        WorkTask,
        on_delete=models.DO_NOTHING,
        related_name="comments",
        verbose_name=_("Công việc"),
    )
    # SET_NULL: preserves comment audit history when employee is deactivated.
    # Without db_constraint=False, PostgreSQL still enforces the FK on WorkTask hard-delete —
    # DO_NOTHING means Django skips pre-delete cleanup only, not the DB constraint.
    author = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        related_name="task_comments",
        verbose_name=_("Người bình luận"),
    )
    body = models.TextField(verbose_name=_("Nội dung"))
    # Plain text only — HorillaModel.clean_fields() strips XSS on save.
    # created_at inherited from HorillaModel — do NOT redefine.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = _("Bình luận")
        verbose_name_plural = _("Bình luận công việc")

    def __str__(self):
        return f"{self.author} → {self.task}"
