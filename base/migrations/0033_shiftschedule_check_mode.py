from django.db import migrations, models


def set_oneway_shifts(apps, schema_editor):
    """HCS26 = chỉ clock-in, HCC26 = chỉ clock-out; tắt auto-punch cho cả hai
    (không còn phụ thuộc cron autoclock)."""
    EmployeeShiftSchedule = apps.get_model("base", "EmployeeShiftSchedule")
    EmployeeShiftSchedule.objects.filter(shift_id__employee_shift="HCS26").update(
        check_mode="clock_in_only",
        is_auto_punch_in_enabled=False,
        is_auto_punch_out_enabled=False,
    )
    EmployeeShiftSchedule.objects.filter(shift_id__employee_shift="HCC26").update(
        check_mode="clock_out_only",
        is_auto_punch_in_enabled=False,
        is_auto_punch_out_enabled=False,
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0032_appfeature_wc2026"),
    ]

    operations = [
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="check_mode",
            field=models.CharField(
                choices=[
                    ("both", "Cả vào & ra"),
                    ("clock_in_only", "Chỉ cần Clock-in"),
                    ("clock_out_only", "Chỉ cần Clock-out"),
                ],
                default="both",
                max_length=20,
                verbose_name="Kiểu chấm công",
            ),
        ),
        migrations.RunPython(set_oneway_shifts, noop),
    ]
