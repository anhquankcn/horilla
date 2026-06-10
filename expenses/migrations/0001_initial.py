from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("employee", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ExpenseWeeklyBatch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True, verbose_name="Is Active")),
                ("week_start", models.DateField(verbose_name="Từ ngày")),
                ("week_end", models.DateField(verbose_name="Đến ngày")),
                ("note", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("created_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("modified_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_modified_by", to=settings.AUTH_USER_MODEL, verbose_name="Modified By")),
            ],
            options={
                "verbose_name": "Bảng kê chi phí",
                "verbose_name_plural": "Bảng kê chi phí",
                "ordering": ["-week_start"],
            },
        ),
        migrations.CreateModel(
            name="ExpenseRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True, verbose_name="Is Active")),
                ("date_incurred", models.DateField(verbose_name="Ngày phát sinh")),
                ("category", models.CharField(choices=[("tool", "Công cụ, dụng cụ"), ("transport", "Di chuyển, công tác"), ("license", "License phần mềm"), ("other", "Khác")], max_length=20, verbose_name="Danh mục")),
                ("description", models.TextField(verbose_name="Mô tả chi tiết")),
                ("amount", models.PositiveIntegerField(verbose_name="Số tiền (VND)")),
                ("receipt", models.FileField(upload_to="expenses/receipts/", verbose_name="Chứng từ/Hóa đơn")),
                ("status", models.CharField(choices=[("pending", "Chờ quản lý duyệt"), ("manager_approved", "Quản lý đã duyệt"), ("hc_approved", "Hành chính xác nhận"), ("rejected", "Từ chối"), ("cancelled", "Nhân viên đã hủy")], default="pending", max_length=20)),
                ("manager_note", models.TextField(blank=True, verbose_name="Ghi chú quản lý")),
                ("hc_note", models.TextField(blank=True, verbose_name="Ghi chú Hành chính")),
                ("batch", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="items", to="expenses.expenseweeklybatch", verbose_name="Bảng kê")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="expense_requests", to="employee.employee", verbose_name="Nhân viên")),
                ("created_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("modified_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_modified_by", to=settings.AUTH_USER_MODEL, verbose_name="Modified By")),
            ],
            options={
                "verbose_name": "Yêu cầu thanh toán",
                "verbose_name_plural": "Yêu cầu thanh toán",
                "ordering": ["-created_at"],
            },
        ),
    ]
