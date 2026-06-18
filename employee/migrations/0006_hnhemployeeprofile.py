import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0005_employee_extra_codes"),
    ]

    operations = [
        migrations.CreateModel(
            name="HNHEmployeeProfile",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cccd", models.CharField(blank=True, max_length=20, null=True, verbose_name="Số CCCD/CMND")),
                ("cccd_issue_date", models.DateField(blank=True, null=True, verbose_name="Ngày cấp")),
                ("cccd_issue_place", models.CharField(blank=True, max_length=150, null=True, verbose_name="Nơi cấp")),
                ("job_title", models.CharField(blank=True, max_length=150, null=True, verbose_name="Chức danh công việc")),
                ("major", models.CharField(blank=True, max_length=150, null=True, verbose_name="Chuyên ngành học")),
                ("temporary_address", models.TextField(blank=True, max_length=255, null=True, verbose_name="Địa chỉ tạm trú / liên hệ")),
                ("ethnicity", models.CharField(blank=True, default="Kinh", max_length=50, null=True, verbose_name="Dân tộc")),
                ("birth_cert_place", models.TextField(blank=True, max_length=255, null=True, verbose_name="Nơi cấp giấy khai sinh")),
                ("license_plate", models.CharField(blank=True, max_length=20, null=True, verbose_name="Biển số xe")),
                ("bhxh_number", models.CharField(blank=True, max_length=20, null=True, verbose_name="Số sổ BHXH")),
                ("bhxh_hospital", models.CharField(blank=True, max_length=150, null=True, verbose_name="Nơi đăng ký KCB BHXH")),
                ("tax_code", models.CharField(blank=True, max_length=20, null=True, verbose_name="Mã số thuế cá nhân")),
                ("unemployment_benefit", models.BooleanField(default=False, verbose_name="Đang hưởng trợ cấp thất nghiệp")),
                ("household_head_name", models.CharField(blank=True, max_length=100, null=True, verbose_name="Họ tên chủ hộ")),
                ("household_head_dob", models.DateField(blank=True, null=True, verbose_name="Ngày sinh chủ hộ")),
                ("household_head_cccd", models.CharField(blank=True, max_length=20, null=True, verbose_name="Số CCCD chủ hộ")),
                ("household_head_phone", models.CharField(blank=True, max_length=20, null=True, verbose_name="SĐT chủ hộ")),
                ("household_address", models.TextField(blank=True, max_length=255, null=True, verbose_name="Địa chỉ hộ khẩu thường trú")),
                ("household_relation", models.CharField(blank=True, max_length=50, null=True, verbose_name="Quan hệ với chủ hộ")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "employee_id",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="hnh_profile",
                        to="employee.employee",
                        verbose_name="Nhân viên",
                    ),
                ),
            ],
            options={
                "verbose_name": "Hồ sơ nhân sự HNH",
                "verbose_name_plural": "Hồ sơ nhân sự HNH",
            },
        ),
    ]
