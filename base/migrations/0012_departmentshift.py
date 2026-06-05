from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0011_appfeature"),
    ]

    operations = [
        migrations.CreateModel(
            name="DepartmentShift",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("is_primary", models.BooleanField(default=False, verbose_name="Ca chính")),
                (
                    "department",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="active_shifts",
                        to="base.department",
                        verbose_name="Phòng ban",
                    ),
                ),
                (
                    "shift",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="department_assignments",
                        to="base.employeeshift",
                        verbose_name="Ca làm việc",
                    ),
                ),
            ],
            options={
                "verbose_name": "Department Shift",
                "verbose_name_plural": "Department Shifts",
                "db_table": "base_departmentshift",
                "unique_together": {("department", "shift")},
            },
        ),
        migrations.RunPython(
            migrations.RunPython.noop,
            migrations.RunPython.noop,
        ),
    ]
