"""tourism initial migration"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Tour",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200, verbose_name="Tên tour")),
                ("code", models.CharField(max_length=50, unique=True, verbose_name="Mã tour")),
                ("tour_type", models.CharField(
                    choices=[("domestic", "Trong nước"), ("international", "Quốc tế"), ("incentive", "Incentive"), ("mice", "MICE")],
                    default="domestic",
                    max_length=20,
                    verbose_name="Loại tour",
                )),
                ("destination", models.CharField(max_length=200, verbose_name="Điểm đến")),
                ("departure", models.CharField(blank=True, max_length=200, verbose_name="Điểm khởi hành")),
                ("duration_days", models.PositiveIntegerField(default=1, verbose_name="Thời lượng (ngày)")),
                ("duration_nights", models.PositiveIntegerField(default=0, verbose_name="Thời lượng (đêm)")),
                ("description", models.TextField(blank=True, verbose_name="Mô tả")),
                ("status", models.CharField(
                    choices=[("active", "Đang hoạt động"), ("inactive", "Tạm dừng"), ("completed", "Đã kết thúc")],
                    default="active",
                    max_length=20,
                    verbose_name="Trạng thái",
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Tour du lịch",
                "verbose_name_plural": "Danh sách tour",
                "ordering": ["code"],
            },
        ),
        migrations.CreateModel(
            name="TourGuide",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("employee", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="tour_guide_profile",
                    to="employee.employee",
                    verbose_name="Nhân viên",
                )),
                ("license_number", models.CharField(blank=True, max_length=100, verbose_name="Số thẻ HDV")),
                ("license_expiry", models.DateField(blank=True, null=True, verbose_name="Ngày hết hạn thẻ")),
                ("guide_type", models.CharField(
                    choices=[("local", "HDV nội địa"), ("international", "HDV quốc tế"), ("both", "Cả hai")],
                    default="local",
                    max_length=20,
                    verbose_name="Loại HDV",
                )),
                ("languages", models.CharField(blank=True, max_length=300, verbose_name="Ngôn ngữ dẫn tour")),
                ("specialization", models.CharField(blank=True, max_length=300, verbose_name="Chuyên môn / Tuyến tour")),
                ("is_active", models.BooleanField(default=True, verbose_name="Đang hoạt động")),
                ("notes", models.TextField(blank=True, verbose_name="Ghi chú")),
            ],
            options={
                "verbose_name": "Hướng dẫn viên",
                "verbose_name_plural": "Danh sách hướng dẫn viên",
            },
        ),
        migrations.CreateModel(
            name="TourSchedule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tour", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="schedules",
                    to="tourism.tour",
                    verbose_name="Tour",
                )),
                ("schedule_code", models.CharField(max_length=80, unique=True, verbose_name="Mã lịch khởi hành")),
                ("start_date", models.DateField(verbose_name="Ngày khởi hành")),
                ("end_date", models.DateField(verbose_name="Ngày về")),
                ("pax", models.PositiveIntegerField(default=0, verbose_name="Số khách")),
                ("lead_guide", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="led_schedules",
                    to="tourism.tourguide",
                    verbose_name="HDV trưởng đoàn",
                )),
                ("support_guides", models.ManyToManyField(
                    blank=True,
                    related_name="support_schedules",
                    to="tourism.tourguide",
                    verbose_name="HDV hỗ trợ",
                )),
                ("status", models.CharField(
                    choices=[("scheduled", "Đã lên lịch"), ("confirmed", "Đã xác nhận"), ("ongoing", "Đang thực hiện"), ("completed", "Hoàn thành"), ("cancelled", "Đã hủy")],
                    default="scheduled",
                    max_length=20,
                    verbose_name="Trạng thái",
                )),
                ("notes", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Lịch khởi hành",
                "verbose_name_plural": "Lịch khởi hành tour",
                "ordering": ["-start_date"],
            },
        ),
        migrations.CreateModel(
            name="TourAttendance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tour_schedule", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="attendances",
                    to="tourism.tourschedule",
                    verbose_name="Lịch tour",
                )),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="tour_attendances",
                    to="employee.employee",
                    verbose_name="Nhân viên",
                )),
                ("work_date", models.DateField(verbose_name="Ngày làm việc")),
                ("check_in", models.TimeField(blank=True, null=True, verbose_name="Giờ vào")),
                ("check_out", models.TimeField(blank=True, null=True, verbose_name="Giờ ra")),
                ("status", models.CharField(
                    choices=[("present", "Có mặt"), ("absent", "Vắng mặt"), ("leave", "Nghỉ phép"), ("late", "Đi muộn")],
                    default="present",
                    max_length=20,
                    verbose_name="Trạng thái",
                )),
                ("overtime_hours", models.DecimalField(decimal_places=1, default=0, max_digits=4, verbose_name="Giờ tăng ca")),
                ("notes", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Chấm công theo tour",
                "verbose_name_plural": "Bảng chấm công theo tour",
                "ordering": ["-work_date"],
                "unique_together": {("tour_schedule", "employee", "work_date")},
            },
        ),
    ]
