from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0006_activity_location_photo"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_out_address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
