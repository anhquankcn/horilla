from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leave", "0008_leaverequest_cancel_audit"),
    ]

    operations = [
        # LeaveRequest — nhắc duyệt đơn treo (HNH #4)
        migrations.AddField(
            model_name="leaverequest",
            name="reminder_count",
            field=models.IntegerField(default=0, verbose_name="Reminder Count"),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="last_reminded_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Last Reminded At"),
        ),
        # HistoricalLeaveRequest — song song
        migrations.AddField(
            model_name="historicalleaverequest",
            name="reminder_count",
            field=models.IntegerField(default=0, verbose_name="Reminder Count"),
        ),
        migrations.AddField(
            model_name="historicalleaverequest",
            name="last_reminded_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Last Reminded At"),
        ),
    ]
