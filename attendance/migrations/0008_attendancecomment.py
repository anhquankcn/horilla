from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0007_activity_address_fields"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AttendanceComment",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("content", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("attendance", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="comments", to="attendance.attendance")),
                ("author", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attendance_comments", to="employee.employee")),
            ],
            options={
                "db_table": "attendance_comment",
                "ordering": ["created_at"],
            },
        ),
    ]
