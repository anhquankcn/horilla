from datetime import time

from django.db import migrations, models


def seed_ald26_core(apps, schema_editor):
    """ALD26: giờ lõi tính trễ = 08:00, về sớm = 17:30 (khung ca vẫn 00:00–23:58)."""
    Schedule = apps.get_model("base", "EmployeeShiftSchedule")
    Schedule.objects.filter(shift_id__employee_shift="ALD26").update(
        core_start_time=time(8, 0), core_end_time=time(17, 30)
    )


def unseed_ald26_core(apps, schema_editor):
    Schedule = apps.get_model("base", "EmployeeShiftSchedule")
    Schedule.objects.filter(shift_id__employee_shift="ALD26").update(
        core_start_time=None, core_end_time=None
    )


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0036_systemhealthlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="core_start_time",
            field=models.TimeField(
                blank=True,
                help_text="Giờ chuẩn để tính ĐI TRỄ (vd 08:00). Để trống = dùng start_time của ca. Dùng cho ca khung rộng như ALD26 (00:00–23:58) để không tính trễ từ đầu ca.",
                null=True,
                verbose_name="Giờ lõi tính trễ",
            ),
        ),
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="core_end_time",
            field=models.TimeField(
                blank=True,
                help_text="Giờ chuẩn để tính VỀ SỚM (vd 17:30). Để trống = dùng end_time của ca.",
                null=True,
                verbose_name="Giờ lõi tính về sớm",
            ),
        ),
        migrations.RunPython(seed_ald26_core, unseed_ald26_core),
    ]
