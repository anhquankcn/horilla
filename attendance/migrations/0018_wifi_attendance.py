from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0017_attendanceactivity_device_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendanceactivity",
            name="clock_in_source",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
        migrations.CreateModel(
            name="WifiAttendanceRange",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(max_length=120, verbose_name="Tên WiFi / Văn phòng")),
                ("ip_cidr", models.CharField(help_text="VD: 123.45.67.0/24 hoặc 123.45.67.89", max_length=64, verbose_name="Dải IP (CIDR) hoặc IP đơn")),
                ("is_active", models.BooleanField(default=True, verbose_name="Đang áp dụng")),
                ("note", models.CharField(blank=True, default="", max_length=255, verbose_name="Ghi chú")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Dải WiFi chấm công",
                "verbose_name_plural": "Dải WiFi chấm công",
                "ordering": ["-is_active", "label"],
            },
        ),
    ]
