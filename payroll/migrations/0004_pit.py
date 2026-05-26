import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0001_initial"),
        ("employee", "0001_initial"),
        ("payroll", "0003_bhxh"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PITConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True, verbose_name="Đang hiệu lực")),
                ("personal_deduction", models.BigIntegerField(
                    default=15500000,
                    help_text="Nghị quyết 110/2025/UBTVQH15 (từ 01/01/2026): 15,500,000đ/tháng.",
                    verbose_name="Giảm trừ bản thân (VND/tháng)",
                )),
                ("npt_deduction", models.BigIntegerField(
                    default=6200000,
                    help_text="6,200,000đ mỗi NPT được duyệt (từ 01/01/2026).",
                    verbose_name="Giảm trừ NPT (VND/người/tháng)",
                )),
                ("effective_from", models.DateField(verbose_name="Hiệu lực từ ngày")),
                ("note", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("company_id", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to="base.company",
                    verbose_name="Công ty",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, editable=False, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="%(class)s_created_by",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="Created By",
                )),
                ("modified_by", models.ForeignKey(
                    blank=True, editable=False, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="%(class)s_modified_by",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="Modified By",
                )),
            ],
            options={
                "verbose_name": "Cấu hình Thuế TNCN",
                "verbose_name_plural": "Cấu hình Thuế TNCN",
                "ordering": ["-effective_from"],
            },
        ),
        migrations.CreateModel(
            name="PITCalculation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True)),
                ("period_year", models.IntegerField(verbose_name="Năm")),
                ("period_month", models.IntegerField(verbose_name="Tháng")),
                ("gross_income", models.BigIntegerField(default=0, verbose_name="Thu nhập chịu thuế (VND)")),
                ("bhxh_deduction", models.BigIntegerField(default=0, verbose_name="Trừ BHXH NLĐ (VND)")),
                ("personal_deduction", models.BigIntegerField(default=15500000, verbose_name="Giảm trừ bản thân (VND)")),
                ("npt_count", models.IntegerField(default=0, verbose_name="Số NPT")),
                ("npt_deduction_total", models.BigIntegerField(default=0, verbose_name="Tổng giảm trừ NPT (VND)")),
                ("total_deductions", models.BigIntegerField(default=0, verbose_name="Tổng giảm trừ (VND)")),
                ("taxable_income", models.BigIntegerField(default=0, verbose_name="Thu nhập tính thuế (VND)")),
                ("pit_amount", models.BigIntegerField(default=0, verbose_name="Thuế TNCN phải nộp (VND)")),
                ("computed_at", models.DateTimeField(auto_now=True)),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="pit_calculations",
                    to="employee.employee",
                    verbose_name="Nhân viên",
                )),
                ("payslip", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="pit_calculations",
                    to="payroll.payslip",
                    verbose_name="Phiếu lương",
                )),
                ("config", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to="payroll.pitconfig",
                    verbose_name="Cấu hình TNCN áp dụng",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, editable=False, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="%(class)s_created_by",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="Created By",
                )),
                ("modified_by", models.ForeignKey(
                    blank=True, editable=False, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="%(class)s_modified_by",
                    to=settings.AUTH_USER_MODEL,
                    verbose_name="Modified By",
                )),
            ],
            options={
                "verbose_name": "Thuế TNCN",
                "verbose_name_plural": "Thuế TNCN",
                "ordering": ["-period_year", "-period_month", "employee"],
                "unique_together": {("employee", "period_year", "period_month")},
            },
        ),
    ]
