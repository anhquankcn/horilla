"""
Promotion Hub — Hub Thăng Tiến
Workflow: 9-Box Assessment → Đề xuất → Phê duyệt → Quyết định → Công bố
"""
from django.db import models
from django.utils.translation import gettext_lazy as _

from base.horilla_company_manager import HorillaCompanyManager
from base.models import Company, Department, JobPosition
from employee.models import Employee


class EmployeeNineBox(models.Model):
    """9-Box performance × potential assessment for an employee in a period."""

    PERF_CHOICES = [
        (1, _("Cần cải thiện")),
        (2, _("Đạt yêu cầu")),
        (3, _("Xuất sắc")),
    ]
    POT_CHOICES = [
        (1, _("Tiềm năng thấp")),
        (2, _("Tiềm năng trung bình")),
        (3, _("Tiềm năng cao")),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="ninebox_assessments",
        verbose_name=_("Nhân viên"),
    )
    assessed_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ninebox_given",
        verbose_name=_("Người đánh giá"),
    )
    period = models.CharField(
        max_length=20,
        verbose_name=_("Kỳ đánh giá"),
        help_text="VD: 2025-H1, 2025-Q2",
    )
    performance = models.IntegerField(
        choices=PERF_CHOICES,
        verbose_name=_("Hiệu suất"),
    )
    potential = models.IntegerField(
        choices=POT_CHOICES,
        verbose_name=_("Tiềm năng"),
    )
    notes = models.TextField(blank=True, verbose_name=_("Ghi chú"))
    assessed_date = models.DateField(auto_now_add=True)
    company_id = models.ForeignKey(
        Company, on_delete=models.SET_NULL, null=True, blank=True
    )

    objects = HorillaCompanyManager("company_id")

    class Meta:
        unique_together = ("employee", "period", "assessed_by")
        ordering = ["-assessed_date"]
        verbose_name = _("9-Box Assessment")
        verbose_name_plural = _("9-Box Assessments")

    def __str__(self):
        return f"{self.employee} — {self.period} (P{self.performance}/Po{self.potential})"

    @property
    def quadrant_label(self):
        grid = {
            (3, 3): "Ngôi sao", (2, 3): "Tiềm năng nổi bật", (1, 3): "Bí ẩn",
            (3, 2): "Nhân tài thực dụng", (2, 2): "Cốt lõi", (1, 2): "Rủi ro",
            (3, 1): "Hiệu suất cao", (2, 1): "Ổn định", (1, 1): "Cần hỗ trợ",
        }
        return grid.get((self.performance, self.potential), "")


class PromotionNomination(models.Model):
    """Hồ sơ đề xuất thăng tiến — toàn bộ vòng đời từ draft đến công bố."""

    STATUS_CHOICES = [
        ("draft", _("Nháp")),
        ("submitted", _("Đã đề xuất")),
        ("reviewing", _("Đang xem xét")),
        ("approved", _("Đã phê duyệt")),
        ("rejected", _("Bị từ chối")),
        ("decided", _("Đã quyết định")),
        ("announced", _("Đã công bố")),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="promotion_nominations",
        verbose_name=_("Nhân viên được đề xuất"),
    )
    nominated_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        related_name="nominations_given",
        verbose_name=_("Người đề xuất"),
    )
    ninebox = models.ForeignKey(
        EmployeeNineBox,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nominations",
        verbose_name=_("Đánh giá 9-Box"),
    )
    # Positions
    current_job_position = models.ForeignKey(
        JobPosition, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("Chức vụ hiện tại"),
    )
    proposed_job_position = models.ForeignKey(
        JobPosition, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("Chức vụ đề xuất"),
    )
    current_department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("Phòng ban hiện tại"),
    )
    proposed_department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("Phòng ban đề xuất"),
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="draft",
        verbose_name=_("Trạng thái"),
    )
    nomination_reason = models.TextField(blank=True, verbose_name=_("Lý do đề xuất"))
    expected_date = models.DateField(null=True, blank=True, verbose_name=_("Dự kiến hiệu lực"))
    effective_date = models.DateField(null=True, blank=True, verbose_name=_("Ngày hiệu lực chính thức"))
    decision_notes = models.TextField(blank=True, verbose_name=_("Ghi chú quyết định"))
    company_id = models.ForeignKey(
        Company, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = HorillaCompanyManager("company_id")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Promotion Nomination")
        verbose_name_plural = _("Promotion Nominations")

    def __str__(self):
        return f"{self.employee} → {self.proposed_job_position} [{self.get_status_display()}]"

    @property
    def current_step(self):
        return self.approval_steps.filter(status="pending").order_by("order").first()

    @property
    def is_fully_approved(self):
        steps = self.approval_steps.all()
        return steps.exists() and all(s.status == "approved" for s in steps)


class PromotionApprovalStep(models.Model):
    """Một bước trong chuỗi phê duyệt."""

    STEP_STATUS = [
        ("pending", _("Chờ duyệt")),
        ("approved", _("Đã duyệt")),
        ("rejected", _("Từ chối")),
    ]
    ROLE_CHOICES = [
        ("manager", _("Quản lý trực tiếp")),
        ("hr", _("Nhân sự")),
        ("bgd", _("Ban Giám Đốc")),
        ("other", _("Khác")),
    ]

    nomination = models.ForeignKey(
        PromotionNomination,
        on_delete=models.CASCADE,
        related_name="approval_steps",
    )
    approver = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="promotion_approval_steps",
        verbose_name=_("Người phê duyệt"),
    )
    role = models.CharField(
        max_length=20, choices=ROLE_CHOICES, default="other",
        verbose_name=_("Vai trò"),
    )
    order = models.IntegerField(default=1, verbose_name=_("Thứ tự"))
    status = models.CharField(
        max_length=20, choices=STEP_STATUS, default="pending",
    )
    comment = models.TextField(blank=True, verbose_name=_("Nhận xét"))
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["nomination", "order"]
        verbose_name = _("Approval Step")

    def __str__(self):
        return f"[{self.nomination}] Step {self.order}: {self.approver} — {self.status}"


class PromotionAnnouncement(models.Model):
    """Thông báo công bố quyết định thăng tiến."""

    nomination = models.OneToOneField(
        PromotionNomination,
        on_delete=models.CASCADE,
        related_name="announcement",
    )
    title = models.CharField(max_length=200, verbose_name=_("Tiêu đề"))
    content = models.TextField(verbose_name=_("Nội dung"))
    created_by = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True,
        related_name="promotion_announcements_created",
    )
    is_published = models.BooleanField(default=False, verbose_name=_("Đã công bố"))
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Promotion Announcement")

    def __str__(self):
        return self.title
