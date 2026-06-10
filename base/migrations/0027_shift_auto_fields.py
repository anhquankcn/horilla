from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0026_integration_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="departmentshift",
            name="auto_assign",
            field=models.BooleanField(
                default=False,
                help_text="Khi bật, nhân viên thuộc phòng ban này sẽ tự động được gán ca này.",
                verbose_name="Tự gán ca cho NV",
            ),
        ),
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="is_auto_punch_in_enabled",
            field=models.BooleanField(
                default=False,
                help_text="Tự động chấm công vào ca theo giờ bắt đầu.",
                verbose_name="Tự động Clock In",
            ),
        ),
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="auto_punch_in_time",
            field=models.TimeField(
                blank=True,
                help_text="Giờ hệ thống tự động Clock In. Để trống = dùng start_time của ca.",
                null=True,
                verbose_name="Giờ tự động Clock In",
            ),
        ),
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="require_gps_on_auto_clockin",
            field=models.BooleanField(
                default=False,
                help_text="Tự động lấy vị trí GPS khi hệ thống auto Clock In.",
                verbose_name="Lấy GPS khi auto Clock In",
            ),
        ),
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="require_gps_on_auto_clockout",
            field=models.BooleanField(
                default=False,
                help_text="Tự động lấy vị trí GPS khi hệ thống auto Clock Out.",
                verbose_name="Lấy GPS khi auto Clock Out",
            ),
        ),
    ]
