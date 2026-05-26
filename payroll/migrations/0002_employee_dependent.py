import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("employee", "0001_initial"),
        ("payroll", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeDependent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        auto_now_add=True, null=True, verbose_name="Created At"
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(default=True, verbose_name="Is Active"),
                ),
                (
                    "full_name",
                    models.CharField(max_length=200, verbose_name="Họ và tên NPT"),
                ),
                ("dob", models.DateField(verbose_name="Ngày sinh")),
                (
                    "relationship",
                    models.CharField(
                        choices=[
                            ("spouse", "Vợ/Chồng"),
                            ("child", "Con"),
                            ("parent", "Cha/Mẹ"),
                            ("sibling", "Anh/Chị/Em ruột"),
                            ("other", "Khác"),
                        ],
                        max_length=20,
                        verbose_name="Quan hệ",
                    ),
                ),
                (
                    "mst_npt",
                    models.CharField(
                        blank=True,
                        help_text="Mã số thuế của người phụ thuộc (bắt buộc khi khai quyết toán)",
                        max_length=20,
                        null=True,
                        verbose_name="MST Người Phụ Thuộc",
                    ),
                ),
                ("start_date", models.DateField(verbose_name="Ngày đăng ký hiệu lực")),
                (
                    "end_date",
                    models.DateField(
                        blank=True, null=True, verbose_name="Ngày kết thúc hiệu lực"
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Chờ duyệt"),
                            ("approved", "Đã duyệt"),
                            ("rejected", "Từ chối"),
                            ("inactive", "Ngừng hiệu lực"),
                        ],
                        default="pending",
                        max_length=20,
                        verbose_name="Trạng thái",
                    ),
                ),
                (
                    "approved_at",
                    models.DateTimeField(
                        blank=True, null=True, verbose_name="Thời điểm duyệt"
                    ),
                ),
                (
                    "reject_reason",
                    models.TextField(blank=True, null=True, verbose_name="Lý do từ chối"),
                ),
                (
                    "document",
                    models.FileField(
                        blank=True,
                        help_text="Giấy khai sinh, hôn thú, hoặc giấy tờ chứng minh quan hệ",
                        null=True,
                        upload_to="payroll/dependents/",
                        verbose_name="Giấy tờ đính kèm",
                    ),
                ),
                (
                    "note",
                    models.TextField(blank=True, null=True, verbose_name="Ghi chú"),
                ),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="approved_dependents",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Người duyệt",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        editable=False,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dependents",
                        to="employee.employee",
                        verbose_name="Nhân viên",
                    ),
                ),
                (
                    "modified_by",
                    models.ForeignKey(
                        blank=True,
                        editable=False,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="employeedependent_modified_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Người Phụ Thuộc",
                "verbose_name_plural": "Người Phụ Thuộc",
                "ordering": ["employee", "full_name"],
                "abstract": False,
            },
        ),
    ]
