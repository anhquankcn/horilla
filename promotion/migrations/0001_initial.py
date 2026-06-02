from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("base", "0001_initial"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeNineBox",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("period", models.CharField(max_length=20, verbose_name="Kỳ đánh giá")),
                ("performance", models.IntegerField(choices=[(1, "Cần cải thiện"), (2, "Đạt yêu cầu"), (3, "Xuất sắc")])),
                ("potential", models.IntegerField(choices=[(1, "Tiềm năng thấp"), (2, "Tiềm năng trung bình"), (3, "Tiềm năng cao")])),
                ("notes", models.TextField(blank=True)),
                ("assessed_date", models.DateField(auto_now_add=True)),
                ("assessed_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ninebox_given", to="employee.employee")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ninebox_assessments", to="employee.employee")),
                ("company_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="base.company")),
            ],
            options={"ordering": ["-assessed_date"], "verbose_name": "9-Box Assessment"},
        ),
        migrations.AddConstraint(
            model_name="employeeninebox",
            constraint=models.UniqueConstraint(fields=("employee", "period", "assessed_by"), name="unique_ninebox_per_employee_period_assessor"),
        ),
        migrations.CreateModel(
            name="PromotionNomination",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("draft","Nháp"),("submitted","Đã đề xuất"),("reviewing","Đang xem xét"),("approved","Đã phê duyệt"),("rejected","Bị từ chối"),("decided","Đã quyết định"),("announced","Đã công bố")], default="draft", max_length=20)),
                ("nomination_reason", models.TextField(blank=True)),
                ("expected_date", models.DateField(blank=True, null=True)),
                ("effective_date", models.DateField(blank=True, null=True)),
                ("decision_notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("company_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="base.company")),
                ("current_department", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="base.department")),
                ("current_job_position", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="base.jobposition")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="promotion_nominations", to="employee.employee")),
                ("ninebox", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="nominations", to="promotion.employeeninebox")),
                ("nominated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="nominations_given", to="employee.employee")),
                ("proposed_department", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="base.department")),
                ("proposed_job_position", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="base.jobposition")),
            ],
            options={"ordering": ["-created_at"], "verbose_name": "Promotion Nomination"},
        ),
        migrations.CreateModel(
            name="PromotionApprovalStep",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("role", models.CharField(choices=[("manager","Quản lý trực tiếp"),("hr","Nhân sự"),("bgd","Ban Giám Đốc"),("other","Khác")], default="other", max_length=20)),
                ("order", models.IntegerField(default=1)),
                ("status", models.CharField(choices=[("pending","Chờ duyệt"),("approved","Đã duyệt"),("rejected","Từ chối")], default="pending", max_length=20)),
                ("comment", models.TextField(blank=True)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("approver", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="promotion_approval_steps", to="employee.employee")),
                ("nomination", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approval_steps", to="promotion.promotionnomination")),
            ],
            options={"ordering": ["nomination", "order"], "verbose_name": "Approval Step"},
        ),
        migrations.CreateModel(
            name="PromotionAnnouncement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=200)),
                ("content", models.TextField()),
                ("is_published", models.BooleanField(default=False)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="promotion_announcements_created", to="employee.employee")),
                ("nomination", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="announcement", to="promotion.promotionnomination")),
            ],
            options={"ordering": ["-created_at"], "verbose_name": "Promotion Announcement"},
        ),
    ]
