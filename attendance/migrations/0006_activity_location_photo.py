from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0005_gps_checkin_log"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_latitude",
            field=models.DecimalField(
                blank=True, decimal_places=7, max_digits=10, null=True
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_longitude",
            field=models.DecimalField(
                blank=True, decimal_places=7, max_digits=10, null=True
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_photo",
            field=models.ImageField(
                blank=True, null=True, upload_to="attendance/selfies/%Y/%m/"
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_out_latitude",
            field=models.DecimalField(
                blank=True, decimal_places=7, max_digits=10, null=True
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_out_longitude",
            field=models.DecimalField(
                blank=True, decimal_places=7, max_digits=10, null=True
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_out_photo",
            field=models.ImageField(
                blank=True, null=True, upload_to="attendance/selfies/%Y/%m/"
            ),
        ),
    ]
