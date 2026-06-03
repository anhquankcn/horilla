from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0008_attendancecomment"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # Column already exists in DB — only update Django's schema state
            database_operations=[],
            state_operations=[
                migrations.AddField(
                    model_name="attendance",
                    name="attendance_outside_geofence",
                    field=models.BooleanField(default=False, verbose_name="Chấm công ngoài geofence"),
                ),
            ],
        ),
    ]
