"""
dependent.py

EmployeeDependent model for TNCN (Thuế Thu Nhập Cá Nhân) dependent management.
Tracks Người Phụ Thuộc for the 4,400,000 VND/person/month deduction.
"""

from django.contrib.auth.models import User
from django.db import models
from django.utils.translation import gettext_lazy as _

from employee.models import Employee
from horilla.models import HorillaModel


class EmployeeDependent(HorillaModel):
    class RelationshipChoice(models.TextChoices):
        SPOUSE = "spouse", "Vợ/Chồng"
        CHILD = "child", "Con"
        PARENT = "parent", "Cha/Mẹ"
        SIBLING = "sibling", "Anh/Chị/Em ruột"
        OTHER = "other", "Khác"

    class StatusChoice(models.TextChoices):
        PENDING = "pending", "Chờ duyệt"
        APPROVED = "approved", "Đã duyệt"
        REJECTED = "rejected", "Từ chối"
        INACTIVE = "inactive", "Ngừng hiệu lực"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="dependents",
        verbose_name=_("Nhân viên"),
    )
    full_name = models.CharField(max_length=200, verbose_name=_("Họ và tên NPT"))
    dob = models.DateField(verbose_name=_("Ngày sinh"))
    relationship = models.CharField(
        max_length=20,
        choices=RelationshipChoice.choices,
        verbose_name=_("Quan hệ"),
    )
    mst_npt = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name=_("MST Người Phụ Thuộc"),
        help_text=_("Mã số thuế của người phụ thuộc (bắt buộc khi khai quyết toán)"),
    )
    start_date = models.DateField(verbose_name=_("Ngày đăng ký hiệu lực"))
    end_date = models.DateField(
        null=True,
        blank=True,
        verbose_name=_("Ngày kết thúc hiệu lực"),
    )
    status = models.CharField(
        max_length=20,
        choices=StatusChoice.choices,
        default=StatusChoice.PENDING,
        verbose_name=_("Trạng thái"),
    )
    approved_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_dependents",
        verbose_name=_("Người duyệt"),
    )
    approved_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Thời điểm duyệt"))
    reject_reason = models.TextField(blank=True, null=True, verbose_name=_("Lý do từ chối"))
    document = models.FileField(
        upload_to="payroll/dependents/",
        null=True,
        blank=True,
        verbose_name=_("Giấy tờ đính kèm"),
        help_text=_("Giấy khai sinh, hôn thú, hoặc giấy tờ chứng minh quan hệ"),
    )
    note = models.TextField(blank=True, null=True, verbose_name=_("Ghi chú"))

    class Meta:
        ordering = ["employee", "full_name"]
        verbose_name = "Người Phụ Thuộc"
        verbose_name_plural = "Người Phụ Thuộc"

    def __str__(self):
        return f"{self.full_name} ({self.get_relationship_display()}) — {self.employee}"
