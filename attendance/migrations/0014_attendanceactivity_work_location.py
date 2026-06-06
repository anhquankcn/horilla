from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0013_employeeshiftplan_remove_unique_together"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendanceactivity",
            name="no_camera",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="work_location",
            field=models.CharField(
                blank=True,
                choices=[("in_office", "Trong VP"), ("out_of_office", "Ngoài VP")],
                default="in_office",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="out_of_office_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("remote", "Làm từ xa"),
                    ("client", "Gặp KH"),
                    ("business_trip", "Công tác"),
                    ("event", "Sự kiện"),
                    ("other", "Khác"),
                ],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="attendanceactivity",
            name="out_of_office_note",
            field=models.TextField(blank=True, null=True),
        ),
    ]
