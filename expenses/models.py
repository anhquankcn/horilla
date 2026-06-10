from django.db import models
from django.utils.translation import gettext_lazy as _

from horilla.models import HorillaModel


class ExpenseWeeklyBatch(HorillaModel):
    week_start = models.DateField(verbose_name=_("Từ ngày"))
    week_end = models.DateField(verbose_name=_("Đến ngày"))
    note = models.TextField(blank=True, verbose_name=_("Ghi chú"))

    class Meta:
        ordering = ["-week_start"]
        verbose_name = _("Bảng kê chi phí")
        verbose_name_plural = _("Bảng kê chi phí")

    def __str__(self):
        return f"Bảng kê {self.week_start} → {self.week_end}"


class ExpenseRequest(HorillaModel):
    CATEGORY_CHOICES = [
        ("tool", _("Công cụ, dụng cụ")),
        ("transport", _("Di chuyển, công tác")),
        ("license", _("License phần mềm")),
        ("other", _("Khác")),
    ]
    STATUS_CHOICES = [
        ("pending", _("Chờ quản lý duyệt")),
        ("manager_approved", _("Quản lý đã duyệt")),
        ("hc_approved", _("Hành chính xác nhận")),
        ("rejected", _("Từ chối")),
        ("cancelled", _("Nhân viên đã hủy")),
    ]

    employee = models.ForeignKey(
        "employee.Employee",
        on_delete=models.CASCADE,
        related_name="expense_requests",
        verbose_name=_("Nhân viên"),
    )
    date_incurred = models.DateField(verbose_name=_("Ngày phát sinh"))
    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, verbose_name=_("Danh mục")
    )
    description = models.TextField(verbose_name=_("Mô tả chi tiết"))
    amount = models.PositiveIntegerField(verbose_name=_("Số tiền (VND)"))
    receipt = models.FileField(
        upload_to="expenses/receipts/", verbose_name=_("Chứng từ/Hóa đơn")
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending"
    )
    manager_note = models.TextField(
        blank=True, verbose_name=_("Ghi chú quản lý")
    )
    hc_note = models.TextField(
        blank=True, verbose_name=_("Ghi chú Hành chính")
    )
    batch = models.ForeignKey(
        ExpenseWeeklyBatch,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="items",
        verbose_name=_("Bảng kê"),
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("Yêu cầu thanh toán")
        verbose_name_plural = _("Yêu cầu thanh toán")

    def __str__(self):
        return f"{self.employee} — {self.amount:,} VND ({self.get_status_display()})"
