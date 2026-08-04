from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0009_hnh_profile_clockout_notify"),
    ]

    operations = [
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="clock_reminder_enabled",
            field=models.BooleanField(
                default=False, verbose_name="Bật nhắc chấm công"
            ),
        ),
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="clock_reminder_times",
            field=models.JSONField(
                blank=True,
                default=list,
                verbose_name="Các mốc giờ nhắc chấm công (danh sách HH:MM, tối đa 4)",
            ),
        ),
    ]
