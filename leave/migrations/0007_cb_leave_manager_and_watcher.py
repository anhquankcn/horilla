import django.db.models.deletion
from django.db import migrations, models


def seed_global_cb(apps, schema_editor):
    """Mặc định: tram.pvh@hongngocha.com duyệt + theo dõi mọi công ty/phòng ban.
    Resolve theo email (không hardcode id) để chạy đúng cả stage lẫn prod."""
    CBLeaveManager = apps.get_model("leave", "CBLeaveManager")
    Employee = apps.get_model("employee", "Employee")
    mgr = Employee.objects.filter(
        email__iexact="tram.pvh@hongngocha.com", is_active=True
    ).first()
    if mgr and not CBLeaveManager.objects.filter(
        company_id__isnull=True, department_id__isnull=True
    ).exists():
        CBLeaveManager.objects.create(
            company_id=None, department_id=None, manager_id=mgr
        )


def unseed_global_cb(apps, schema_editor):
    CBLeaveManager = apps.get_model("leave", "CBLeaveManager")
    CBLeaveManager.objects.filter(
        company_id__isnull=True, department_id__isnull=True
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("leave", "0006_historicalleaverequest_hourly_fields"),
        ("base", "0036_systemhealthlog"),
        ("employee", "0007_hnh_profile_password_reset_tracking"),
    ]

    operations = [
        migrations.CreateModel(
            name="CBLeaveManager",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("company_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="cb_leave_managers", to="base.company", verbose_name="Công ty")),
                ("department_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="cb_leave_managers", to="base.department", verbose_name="Phòng ban")),
                ("manager_id", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="cb_leave_manager_for", to="employee.employee", verbose_name="Người C&B duyệt")),
            ],
            options={
                "verbose_name": "C&B duyệt nghỉ phép",
                "verbose_name_plural": "C&B duyệt nghỉ phép",
                "db_table": "leave_cb_manager",
                "unique_together": {("company_id", "department_id")},
            },
        ),
        migrations.CreateModel(
            name="LeaveRequestWatcher",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("employee_id", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="watching_leave_requests", to="employee.employee", verbose_name="Người theo dõi")),
                ("leave_request_id", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="watcher_links", to="leave.leaverequest", verbose_name="Đơn nghỉ phép")),
            ],
            options={
                "verbose_name": "Người theo dõi đơn nghỉ phép",
                "verbose_name_plural": "Người theo dõi đơn nghỉ phép",
                "db_table": "leave_request_watcher",
                "unique_together": {("leave_request_id", "employee_id")},
            },
        ),
        migrations.RunPython(seed_global_cb, unseed_global_cb),
    ]
