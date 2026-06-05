from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0011_gpscheckinlog_company_action"),
        ("base", "0012_departmentshift"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeShiftPlan",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("date", models.DateField(verbose_name="Ngày")),
                ("note", models.CharField(blank=True, default="", max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shift_plans",
                        to="employee.employee",
                        verbose_name="Nhân viên",
                    ),
                ),
                (
                    "shift",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="plan_entries",
                        to="base.employeeshift",
                        verbose_name="Ca làm việc",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_shift_plans",
                        to="employee.employee",
                        verbose_name="Người tạo",
                    ),
                ),
            ],
            options={
                "verbose_name": "Employee Shift Plan",
                "verbose_name_plural": "Employee Shift Plans",
                "db_table": "attendance_employeeshiftplan",
                "ordering": ["date", "employee"],
                "unique_together": {("employee", "date")},
            },
        ),
    ]
