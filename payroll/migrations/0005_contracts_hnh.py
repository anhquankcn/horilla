"""
0005_contracts_hnh.py

Creates 3 HNH contract tables + KPI appendix.
Does NOT touch existing payroll_contract table.
"""

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0001_initial"),
        ("employee", "0001_initial"),
        ("payroll", "0004_pit"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── TrialContract ──────────────────────────────────────────────────────
        migrations.CreateModel(
            name="TrialContract",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True)),
                ("contract_name", models.CharField(max_length=250, verbose_name="Tên hợp đồng")),
                ("contract_start_date", models.DateField(verbose_name="Ngày bắt đầu")),
                ("contract_end_date", models.DateField(blank=True, null=True, verbose_name="Ngày kết thúc")),
                ("wage", models.FloatField(default=0, verbose_name="Lương cơ bản (VND/tháng)")),
                ("contract_status", models.CharField(
                    choices=[("draft","Nháp"),("active","Hiệu lực"),("expired","Hết hạn"),("terminated","Chấm dứt")],
                    default="draft", max_length=20, verbose_name="Trạng thái",
                )),
                ("consent_agreed", models.BooleanField(default=False, verbose_name="Đã ký Phụ lục 3 (đồng ý bảo mật dữ liệu)")),
                ("consent_date", models.DateField(blank=True, null=True, verbose_name="Ngày ký Phụ lục 3")),
                ("probation_days", models.IntegerField(default=60, verbose_name="Thời gian thử việc (ngày)")),
                ("trial_wage_pct", models.DecimalField(decimal_places=2, default=Decimal("85.00"), max_digits=5, verbose_name="% lương trong thời gian thử việc")),
                ("employee_id", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="trialcontract_set",
                    to="employee.employee",
                    verbose_name="Nhân viên",
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
                "verbose_name": "Hợp đồng Thử việc",
                "verbose_name_plural": "Hợp đồng Thử việc",
                "ordering": ["-contract_start_date"],
            },
        ),
        migrations.AddField(
            model_name="trialcontract",
            name="allowances",
            field=models.ManyToManyField(
                blank=True,
                related_name="trial_contracts",
                to="payroll.allowance",
                verbose_name="Phụ cấp (Phụ lục 2)",
            ),
        ),
        migrations.AddField(
            model_name="trialcontract",
            name="deductions",
            field=models.ManyToManyField(
                blank=True,
                related_name="trial_contracts",
                to="payroll.deduction",
                verbose_name="Khoản trừ (Phụ lục 2)",
            ),
        ),

        # ── OfficialContract ───────────────────────────────────────────────────
        migrations.CreateModel(
            name="OfficialContract",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True)),
                ("contract_name", models.CharField(max_length=250, verbose_name="Tên hợp đồng")),
                ("contract_start_date", models.DateField(verbose_name="Ngày bắt đầu")),
                ("contract_end_date", models.DateField(blank=True, null=True, verbose_name="Ngày kết thúc")),
                ("wage", models.FloatField(default=0, verbose_name="Lương cơ bản (VND/tháng)")),
                ("contract_status", models.CharField(
                    choices=[("draft","Nháp"),("active","Hiệu lực"),("expired","Hết hạn"),("terminated","Chấm dứt")],
                    default="draft", max_length=20, verbose_name="Trạng thái",
                )),
                ("consent_agreed", models.BooleanField(default=False, verbose_name="Đã ký Phụ lục 3 (đồng ý bảo mật dữ liệu)")),
                ("consent_date", models.DateField(blank=True, null=True, verbose_name="Ngày ký Phụ lục 3")),
                ("employee_id", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="officialcontract_set",
                    to="employee.employee",
                    verbose_name="Nhân viên",
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
                "verbose_name": "Hợp đồng Chính thức",
                "verbose_name_plural": "Hợp đồng Chính thức",
                "ordering": ["-contract_start_date"],
            },
        ),
        migrations.AddField(
            model_name="officialcontract",
            name="allowances",
            field=models.ManyToManyField(
                blank=True,
                related_name="official_contracts",
                to="payroll.allowance",
                verbose_name="Phụ cấp (Phụ lục 2)",
            ),
        ),
        migrations.AddField(
            model_name="officialcontract",
            name="deductions",
            field=models.ManyToManyField(
                blank=True,
                related_name="official_contracts",
                to="payroll.deduction",
                verbose_name="Khoản trừ (Phụ lục 2)",
            ),
        ),

        # ── PerformanceContract ────────────────────────────────────────────────
        migrations.CreateModel(
            name="PerformanceContract",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True)),
                ("contract_name", models.CharField(max_length=250, verbose_name="Tên hợp đồng")),
                ("contract_start_date", models.DateField(verbose_name="Ngày bắt đầu")),
                ("contract_end_date", models.DateField(blank=True, null=True, verbose_name="Ngày kết thúc")),
                ("wage", models.FloatField(default=0, verbose_name="Lương cơ bản (VND/tháng)")),
                ("contract_status", models.CharField(
                    choices=[("draft","Nháp"),("active","Hiệu lực"),("expired","Hết hạn"),("terminated","Chấm dứt")],
                    default="draft", max_length=20, verbose_name="Trạng thái",
                )),
                ("consent_agreed", models.BooleanField(default=False, verbose_name="Đã ký Phụ lục 3 (đồng ý bảo mật dữ liệu)")),
                ("consent_date", models.DateField(blank=True, null=True, verbose_name="Ngày ký Phụ lục 3")),
                ("base_salary", models.FloatField(default=0, verbose_name="Lương cơ bản (VND/tháng)")),
                ("employee_id", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="performancecontract_set",
                    to="employee.employee",
                    verbose_name="Nhân viên",
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
                "verbose_name": "Hợp đồng Hiệu suất",
                "verbose_name_plural": "Hợp đồng Hiệu suất",
                "ordering": ["-contract_start_date"],
            },
        ),
        migrations.AddField(
            model_name="performancecontract",
            name="allowances",
            field=models.ManyToManyField(
                blank=True,
                related_name="performance_contracts",
                to="payroll.allowance",
                verbose_name="Phụ cấp (Phụ lục 2)",
            ),
        ),
        migrations.AddField(
            model_name="performancecontract",
            name="deductions",
            field=models.ManyToManyField(
                blank=True,
                related_name="performance_contracts",
                to="payroll.deduction",
                verbose_name="Khoản trừ (Phụ lục 2)",
            ),
        ),

        # ── ContractKPIAppendix (Phu luc 1) ───────────────────────────────────
        migrations.CreateModel(
            name="ContractKPIAppendix",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True)),
                ("year", models.IntegerField(verbose_name="Năm áp dụng")),
                ("annual_income_min", models.BigIntegerField(verbose_name="Thu nhập năm tối thiểu (VND)")),
                ("annual_income_max", models.BigIntegerField(verbose_name="Thu nhập năm tối đa (VND)")),
                ("kpi_description", models.TextField(blank=True, verbose_name="Mô tả chỉ số KPI")),
                ("kpi_pct_90_100", models.FloatField(default=100.0, verbose_name="Bonus rate khi KPI 90-100% (%)")),
                ("kpi_pct_75_89", models.FloatField(default=75.0, verbose_name="Bonus rate khi KPI 75-89% (%)")),
                ("kpi_pct_60_74", models.FloatField(default=50.0, verbose_name="Bonus rate khi KPI 60-74% (%)")),
                ("kpi_below_60", models.FloatField(default=0.0, verbose_name="Bonus rate khi KPI <60% (%)")),
                ("monthly_performance_advance", models.BigIntegerField(default=0, verbose_name="Tạm ứng lương hiệu suất tháng (VND)")),
                ("contract", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="kpi_appendices",
                    to="payroll.performancecontract",
                    verbose_name="Hợp đồng Hiệu suất",
                )),
                ("position", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to="base.jobposition",
                    verbose_name="Vị trí áp dụng",
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
                "verbose_name": "Phụ lục 1 — KPI & Thu nhập",
                "verbose_name_plural": "Phụ lục 1 — KPI & Thu nhập",
                "ordering": ["year"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="contractkpiappendix",
            unique_together={("contract", "year")},
        ),
    ]
