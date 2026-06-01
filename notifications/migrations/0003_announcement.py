import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_pushsubscription"),
        ("base", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Announcement",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("body", models.TextField()),
                ("target_type", models.CharField(max_length=20, choices=[
                    ("individual", "Cá nhân"),
                    ("multi_user", "Nhiều người"),
                    ("department", "Phòng ban"),
                    ("company", "Toàn công ty"),
                ])),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("sender", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sent_announcements", to=settings.AUTH_USER_MODEL)),
                ("target_department", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="base.department")),
                ("target_company", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="base.company")),
            ],
            options={"db_table": "notifications_announcement", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="AnnouncementRecipient",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("read", models.BooleanField(default=False)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("announcement", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="recipients", to="notifications.announcement")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="received_announcements", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "notifications_announcementrecipient",
                "unique_together": {("announcement", "user")},
            },
        ),
        migrations.CreateModel(
            name="AnnouncementFeedback",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("message", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("announcement", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="feedbacks", to="notifications.announcement")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "notifications_announcementfeedback", "ordering": ["-created_at"]},
        ),
    ]
