from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0001_initial"),
        ("employee", "0001_initial"),
        ("payroll", "0006_trial_kpi"),
    ]

    operations = [
        migrations.CreateModel(
            name="MonthlyPayrollEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True)),
                ("modified_at", models.DateTimeField(auto_now=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("year", models.IntegerField(verbose_name="Năm")),
                ("month", models.IntegerField(verbose_name="Tháng")),
                ("standard_days", models.DecimalField(decimal_places=1, default=Decimal("26"), max_digits=5, verbose_name="Ngày công chuẩn (E)")),
                ("actual_days", models.DecimalField(decimal_places=1, default=Decimal("0"), max_digits=5, verbose_name="Ngày công thực tế (F)")),
                ("lcb_bhxh", models.DecimalField(decimal_places=0, default=0, max_digits=14, verbose_name="LCB đóng BHXH (G)")),
                ("total_gross", models.DecimalField(decimal_places=0, default=0, max_digits=14, verbose_name="Tổng Gross TT (H)")),
                ("pc_chuc_vu", models.DecimalField(decimal_places=0, default=0, max_digits=12, verbose_name="PC Chức vụ (I)")),
                ("pc_travel", models.DecimalField(decimal_places=0, default=0, max_digits=12, verbose_name="PC Đi lại (L)")),
                ("night_shifts", models.DecimalField(decimal_places=1, default=0, max_digits=6, verbose_name="Số ca đêm (M)")),
                ("night_shift_rate", models.DecimalField(decimal_places=0, default=250000, max_digits=10, verbose_name="Đơn giá ca đêm (N)")),
                ("ot_normal", models.DecimalField(decimal_places=2, default=0, max_digits=7, verbose_name="Giờ OT ngày thường (P)")),
                ("ot_weekend", models.DecimalField(decimal_places=2, default=0, max_digits=7, verbose_name="Giờ OT cuối tuần (Q)")),
                ("ot_holiday", models.DecimalField(decimal_places=2, default=0, max_digits=7, verbose_name="Giờ OT ngày lễ (R)")),
                ("kpi_pct", models.DecimalField(decimal_places=2, default=Decimal("100.00"), max_digits=6, verbose_name="% KPI tháng (U)")),
                ("incentive", models.DecimalField(decimal_places=0, default=0, max_digits=14, verbose_name="Incentive (Y)")),
                ("bonus", models.DecimalField(decimal_places=0, default=0, max_digits=14, verbose_name="Bonus / T13 (Z)")),
                ("other_adjust", models.DecimalField(decimal_places=0, default=0, max_digits=14, verbose_name="Phát sinh khác (AA)")),
                ("npt", models.IntegerField(default=0, verbose_name="Số NPT (AG)")),
                ("tam_ung", models.DecimalField(decimal_places=0, default=0, max_digits=14, verbose_name="Tạm ứng (AJ)")),
                ("notes", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("company", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="base.company", verbose_name="Công ty")),
                ("employee_id", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="monthly_payroll_entries", to="employee.employee", verbose_name="Nhân viên")),
                ("trial_contract", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="payroll_entries", to="payroll.trialcontract", verbose_name="HĐ UAT PM")),
                ("official_contract", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="payroll_entries", to="payroll.officialcontract", verbose_name="HĐ Chính thức")),
                ("performance_contract", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="payroll_entries", to="payroll.performancecontract", verbose_name="HĐ Hiệu suất")),
            ],
            options={
                "verbose_name": "Bảng lương tháng",
                "verbose_name_plural": "Bảng lương tháng",
                "ordering": ["employee_id__employee_work_info__department_id__department", "employee_id__employee_last_name"],
            },
        ),
        migrations.AddConstraint(
            model_name="monthlypayrollentry",
            constraint=models.UniqueConstraint(fields=["employee_id", "year", "month"], name="uq_employee_year_month"),
        ),
    ]
