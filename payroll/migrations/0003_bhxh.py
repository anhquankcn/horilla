import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0001_initial"),
        ("employee", "0001_initial"),
        ("payroll", "0002_employee_dependent"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BHXHConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True, verbose_name="Đang hiệu lực")),
                ("bhxh_rate_ee", models.DecimalField(decimal_places=2, default=Decimal("8.00"), max_digits=5, verbose_name="BHXH NLĐ (%)")),
                ("bhyt_rate_ee", models.DecimalField(decimal_places=2, default=Decimal("1.50"), max_digits=5, verbose_name="BHYT NLĐ (%)")),
                ("bhtn_rate_ee", models.DecimalField(decimal_places=2, default=Decimal("1.00"), max_digits=5, verbose_name="BHTN NLĐ (%)")),
                ("bhxh_rate_er", models.DecimalField(decimal_places=2, default=Decimal("17.50"), max_digits=5, verbose_name="BHXH NSDLĐ (%)")),
                ("bhyt_rate_er", models.DecimalField(decimal_places=2, default=Decimal("3.00"), max_digits=5, verbose_name="BHYT NSDLĐ (%)")),
                ("bhtn_rate_er", models.DecimalField(decimal_places=2, default=Decimal("1.00"), max_digits=5, verbose_name="BHTN NSDLĐ (%)")),
                ("kpcd_rate_er", models.DecimalField(decimal_places=2, default=Decimal("2.00"), max_digits=5, verbose_name="KPCĐ NSDLĐ (%)")),
                ("luong_co_so", models.BigIntegerField(default=2340000, help_text="Mức lương cơ sở theo quy định nhà nước. Cap BHXH/BHYT = 20 × giá trị này.", verbose_name="Lương cơ sở (VND/tháng)")),
                ("luong_toi_thieu_vung", models.BigIntegerField(default=4960000, help_text="Vùng 1 (TP.HCM, HN...). Cap BHTN = 20 × giá trị này.", verbose_name="Lương tối thiểu vùng (VND/tháng)")),
                ("effective_from", models.DateField(verbose_name="Hiệu lực từ ngày")),
                ("note", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("company_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="base.company", verbose_name="Công ty")),
                ("created_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("modified_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bhxhconfig_modified_by", to=settings.AUTH_USER_MODEL, verbose_name="Modified By")),
            ],
            options={"verbose_name": "Cấu hình BHXH", "verbose_name_plural": "Cấu hình BHXH", "ordering": ["-effective_from"], "abstract": False},
        ),
        migrations.CreateModel(
            name="EmployeeBHXHInfo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True, verbose_name="Is Active")),
                ("luong_dong_bh", models.BigIntegerField(blank=True, help_text="Để trống nếu dùng lương hợp đồng. Nhập giá trị này nếu lương đóng BH khác lương HĐ.", null=True, verbose_name="Lương đóng BH (VND/tháng)")),
                ("so_bhxh", models.CharField(blank=True, max_length=20, verbose_name="Số sổ BHXH")),
                ("ma_bhyt", models.CharField(blank=True, max_length=20, verbose_name="Mã thẻ BHYT")),
                ("is_exempt", models.BooleanField(default=False, help_text="Tick nếu nhân viên không thuộc đối tượng đóng BHXH (VD: CTV thời vụ < 1 tháng).", verbose_name="Miễn đóng BH")),
                ("exempt_reason", models.TextField(blank=True, verbose_name="Lý do miễn")),
                ("employee", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="bhxh_info", to="employee.employee", verbose_name="Nhân viên")),
                ("created_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("modified_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="employeebhxhinfo_modified_by", to=settings.AUTH_USER_MODEL, verbose_name="Modified By")),
            ],
            options={"verbose_name": "Thông tin BHXH nhân viên", "verbose_name_plural": "Thông tin BHXH nhân viên", "abstract": False},
        ),
        migrations.CreateModel(
            name="BHXHContribution",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True, verbose_name="Created At")),
                ("is_active", models.BooleanField(default=True, verbose_name="Is Active")),
                ("period_year", models.IntegerField(verbose_name="Năm")),
                ("period_month", models.IntegerField(verbose_name="Tháng")),
                ("luong_dong_bh", models.BigIntegerField(default=0, verbose_name="Lương đóng BHXH/BHYT (VND)")),
                ("luong_dong_bhtn", models.BigIntegerField(default=0, verbose_name="Lương đóng BHTN (VND)")),
                ("bhxh_ee", models.BigIntegerField(default=0, verbose_name="BHXH NLĐ (VND)")),
                ("bhyt_ee", models.BigIntegerField(default=0, verbose_name="BHYT NLĐ (VND)")),
                ("bhtn_ee", models.BigIntegerField(default=0, verbose_name="BHTN NLĐ (VND)")),
                ("total_ee", models.BigIntegerField(default=0, verbose_name="Tổng BH NLĐ (VND)")),
                ("bhxh_er", models.BigIntegerField(default=0, verbose_name="BHXH NSDLĐ (VND)")),
                ("bhyt_er", models.BigIntegerField(default=0, verbose_name="BHYT NSDLĐ (VND)")),
                ("bhtn_er", models.BigIntegerField(default=0, verbose_name="BHTN NSDLĐ (VND)")),
                ("kpcd_er", models.BigIntegerField(default=0, verbose_name="KPCĐ NSDLĐ (VND)")),
                ("total_er", models.BigIntegerField(default=0, verbose_name="Tổng BH NSDLĐ (VND)")),
                ("computed_at", models.DateTimeField(auto_now=True)),
                ("config", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="payroll.bhxhconfig", verbose_name="Cấu hình BHXH áp dụng")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bhxh_contributions", to="employee.employee", verbose_name="Nhân viên")),
                ("payslip", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bhxh_contributions", to="payroll.payslip", verbose_name="Phiếu lương")),
                ("created_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("modified_by", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bhxhcontribution_modified_by", to=settings.AUTH_USER_MODEL, verbose_name="Modified By")),
            ],
            options={"verbose_name": "Đóng BHXH", "verbose_name_plural": "Đóng BHXH", "ordering": ["-period_year", "-period_month", "employee"], "unique_together": {("employee", "period_year", "period_month")}, "abstract": False},
        ),
    ]
