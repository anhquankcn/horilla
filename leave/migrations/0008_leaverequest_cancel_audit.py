import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0001_initial"),
        ("leave", "0007_cb_leave_manager_and_watcher"),
    ]

    operations = [
        # LeaveRequest — audit hủy đơn đã duyệt (HNH #5)
        migrations.AddField(
            model_name="leaverequest",
            name="cancelled_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="leave_request_cancelled",
                to="employee.employee",
                verbose_name="Cancelled By",
            ),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="cancel_reason",
            field=models.TextField(blank=True, default="", verbose_name="Cancel Reason"),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Cancelled At"),
        ),
        # HistoricalLeaveRequest — giữ song song cho audit log
        migrations.AddField(
            model_name="historicalleaverequest",
            name="cancelled_by",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                editable=False,
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                to="employee.employee",
                verbose_name="Cancelled By",
            ),
        ),
        migrations.AddField(
            model_name="historicalleaverequest",
            name="cancel_reason",
            field=models.TextField(blank=True, default="", verbose_name="Cancel Reason"),
        ),
        migrations.AddField(
            model_name="historicalleaverequest",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Cancelled At"),
        ),
    ]
