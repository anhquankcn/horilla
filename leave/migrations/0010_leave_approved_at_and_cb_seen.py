import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0007_hnh_profile_password_reset_tracking"),
        ("leave", "0009_leaverequest_approval_reminder"),
    ]

    operations = [
        migrations.AddField(
            model_name="historicalleaverequest",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Approved At"),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Approved At"),
        ),
        migrations.CreateModel(
            name="HNHLeaveRequestSeen",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("seen_at", models.DateTimeField(auto_now_add=True)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="leave_seen_set",
                        to="employee.employee",
                    ),
                ),
                (
                    "leave_request",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cb_seen_set",
                        to="leave.leaverequest",
                    ),
                ),
            ],
            options={
                "verbose_name": "C&B đã xem đơn nghỉ",
                "verbose_name_plural": "C&B đã xem đơn nghỉ",
                "unique_together": {("leave_request", "employee")},
            },
        ),
    ]
