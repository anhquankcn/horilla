from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0035_db_defaults_for_sync"),
    ]

    operations = [
        migrations.CreateModel(
            name="SystemHealthLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("check_type", models.CharField(
                    choices=[("prod_standby", "Prod → Standby Replication"), ("sso_backup", "Backup SSO")],
                    max_length=30,
                )),
                ("checked_at", models.DateTimeField(auto_now_add=True)),
                ("status", models.CharField(
                    choices=[("ok", "OK"), ("warn", "Cảnh báo"), ("error", "Lỗi")],
                    default="ok", max_length=10,
                )),
                ("details", models.JSONField(blank=True, default=dict)),
                ("message", models.TextField(blank=True, default="")),
            ],
            options={"verbose_name": "System Health Log", "ordering": ["-checked_at"]},
        ),
    ]
