"""
tourism/models.py

Quản lý tour du lịch, hướng dẫn viên, phân ca và chấm công theo tour
dành riêng cho Công ty Du lịch Hồng Ngọc Hà.
"""

from django.db import models
from django.utils.translation import gettext_lazy as _

from employee.models import Employee


class Tour(models.Model):
    """Tour du lịch"""

    STATUS_CHOICES = [
        ("active", _("Đang hoạt động")),
        ("inactive", _("Tạm dừng")),
        ("completed", _("Đã kết thúc")),
    ]

    TOUR_TYPE_CHOICES = [
        ("domestic", _("Trong nước")),
        ("international", _("Quốc tế")),
        ("incentive", _("Incentive")),
        ("mice", _("MICE")),
    ]

    name = models.CharField(max_length=200, verbose_name=_("Tên tour"))
    code = models.CharField(max_length=50, unique=True, verbose_name=_("Mã tour"))
    tour_type = models.CharField(
        max_length=20,
        choices=TOUR_TYPE_CHOICES,
        default="domestic",
        verbose_name=_("Loại tour"),
    )
    destination = models.CharField(max_length=200, verbose_name=_("Điểm đến"))
    departure = models.CharField(
        max_length=200, blank=True, verbose_name=_("Điểm khởi hành")
    )
    duration_days = models.PositiveIntegerField(
        default=1, verbose_name=_("Thời lượng (ngày)")
    )
    duration_nights = models.PositiveIntegerField(
        default=0, verbose_name=_("Thời lượng (đêm)")
    )
    description = models.TextField(blank=True, verbose_name=_("Mô tả"))
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="active", verbose_name=_("Trạng thái")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        verbose_name = _("Tour du lịch")
        verbose_name_plural = _("Danh sách tour")

    def __str__(self):
        return f"[{self.code}] {self.name}"

    @property
    def duration_display(self):
        return f"{self.duration_days}N{self.duration_nights}Đ"


class TourGuide(models.Model):
    """Hướng dẫn viên du lịch"""

    GUIDE_TYPE_CHOICES = [
        ("local", _("HDV nội địa")),
        ("international", _("HDV quốc tế")),
        ("both", _("Cả hai")),
    ]

    employee = models.OneToOneField(
        Employee,
        on_delete=models.CASCADE,
        related_name="tour_guide_profile",
        verbose_name=_("Nhân viên"),
    )
    license_number = models.CharField(
        max_length=100, blank=True, verbose_name=_("Số thẻ HDV")
    )
    license_expiry = models.DateField(
        null=True, blank=True, verbose_name=_("Ngày hết hạn thẻ")
    )
    guide_type = models.CharField(
        max_length=20,
        choices=GUIDE_TYPE_CHOICES,
        default="local",
        verbose_name=_("Loại HDV"),
    )
    languages = models.CharField(
        max_length=300,
        blank=True,
        verbose_name=_("Ngôn ngữ dẫn tour"),
        help_text=_("Ví dụ: Tiếng Việt, Tiếng Anh, Tiếng Pháp"),
    )
    specialization = models.CharField(
        max_length=300,
        blank=True,
        verbose_name=_("Chuyên môn / Tuyến tour"),
        help_text=_("Ví dụ: Hà Nội - Hạ Long, Miền Tây"),
    )
    is_active = models.BooleanField(default=True, verbose_name=_("Đang hoạt động"))
    notes = models.TextField(blank=True, verbose_name=_("Ghi chú"))

    class Meta:
        verbose_name = _("Hướng dẫn viên")
        verbose_name_plural = _("Danh sách hướng dẫn viên")

    def __str__(self):
        return str(self.employee)


class TourSchedule(models.Model):
    """Lịch khởi hành của một tour (phân ca theo tour)"""

    STATUS_CHOICES = [
        ("scheduled", _("Đã lên lịch")),
        ("confirmed", _("Đã xác nhận")),
        ("ongoing", _("Đang thực hiện")),
        ("completed", _("Hoàn thành")),
        ("cancelled", _("Đã hủy")),
    ]

    tour = models.ForeignKey(
        Tour,
        on_delete=models.CASCADE,
        related_name="schedules",
        verbose_name=_("Tour"),
    )
    schedule_code = models.CharField(
        max_length=80, unique=True, verbose_name=_("Mã lịch khởi hành")
    )
    start_date = models.DateField(verbose_name=_("Ngày khởi hành"))
    end_date = models.DateField(verbose_name=_("Ngày về"))
    pax = models.PositiveIntegerField(default=0, verbose_name=_("Số khách"))
    lead_guide = models.ForeignKey(
        TourGuide,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_schedules",
        verbose_name=_("HDV trưởng đoàn"),
    )
    support_guides = models.ManyToManyField(
        TourGuide,
        blank=True,
        related_name="support_schedules",
        verbose_name=_("HDV hỗ trợ"),
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="scheduled",
        verbose_name=_("Trạng thái"),
    )
    notes = models.TextField(blank=True, verbose_name=_("Ghi chú"))
    leave_allocated = models.BooleanField(
        default=False,
        verbose_name=_("Đã cộng nghỉ bù"),
        help_text=_("Tự động đánh dấu sau khi cộng ngày nghỉ bù vào tài khoản nhân viên"),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]
        verbose_name = _("Lịch khởi hành")
        verbose_name_plural = _("Lịch khởi hành tour")

    def __str__(self):
        return f"{self.schedule_code} - {self.tour.name} ({self.start_date})"

    @property
    def duration_display(self):
        if self.end_date and self.start_date:
            delta = (self.end_date - self.start_date).days + 1
            return f"{delta} ngày"
        return "–"


class TourAttendance(models.Model):
    """Chấm công theo tour cho nhân viên / HDV"""

    STATUS_CHOICES = [
        ("present", _("Có mặt")),
        ("absent", _("Vắng mặt")),
        ("leave", _("Nghỉ phép")),
        ("late", _("Đi muộn")),
    ]

    tour_schedule = models.ForeignKey(
        TourSchedule,
        on_delete=models.CASCADE,
        related_name="attendances",
        verbose_name=_("Lịch tour"),
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="tour_attendances",
        verbose_name=_("Nhân viên"),
    )
    work_date = models.DateField(verbose_name=_("Ngày làm việc"))
    check_in = models.TimeField(null=True, blank=True, verbose_name=_("Giờ vào"))
    check_out = models.TimeField(null=True, blank=True, verbose_name=_("Giờ ra"))
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="present",
        verbose_name=_("Trạng thái"),
    )
    overtime_hours = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        default=0,
        verbose_name=_("Giờ tăng ca"),
    )
    notes = models.TextField(blank=True, verbose_name=_("Ghi chú"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-work_date"]
        unique_together = [("tour_schedule", "employee", "work_date")]
        verbose_name = _("Chấm công theo tour")
        verbose_name_plural = _("Bảng chấm công theo tour")

    def __str__(self):
        return f"{self.employee} – {self.tour_schedule} – {self.work_date}"
