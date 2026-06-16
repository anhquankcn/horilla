from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0033_shiftschedule_check_mode"),
    ]

    operations = [
        migrations.CreateModel(
            name="StandbySyncLog",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("duration_seconds", models.IntegerField(blank=True, null=True)),
                ("trigger", models.CharField(choices=[("scheduled", "Theo lịch"), ("manual", "Thủ công")], default="scheduled", max_length=20)),
                ("status", models.CharField(choices=[("running", "Đang chạy"), ("success", "Thành công"), ("error", "Lỗi"), ("partial", "Một phần")], default="running", max_length=20)),
                ("tables", models.JSONField(blank=True, default=dict)),
                ("reconciliation", models.JSONField(blank=True, default=dict)),
                ("message", models.TextField(blank=True, default="")),
            ],
            options={
                "verbose_name": "Standby Sync Log",
                "ordering": ["-started_at"],
            },
        ),
    ]
