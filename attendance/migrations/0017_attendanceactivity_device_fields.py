from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0016_add_shift_change_request"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_device",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_user_agent",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_out_device",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_out_user_agent",
            field=models.TextField(blank=True, default=""),
        ),
    ]
