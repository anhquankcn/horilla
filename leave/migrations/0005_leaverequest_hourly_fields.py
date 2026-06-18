from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leave", "0004_hnh_compensatory_proposal_add_horilla_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="leaverequest",
            name="is_hourly",
            field=models.BooleanField(default=False, verbose_name="Nghỉ theo giờ"),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="requested_hours",
            field=models.FloatField(blank=True, null=True, verbose_name="Số giờ nghỉ"),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="start_time",
            field=models.TimeField(blank=True, null=True, verbose_name="Từ giờ"),
        ),
        migrations.AddField(
            model_name="leaverequest",
            name="end_time",
            field=models.TimeField(blank=True, null=True, verbose_name="Đến giờ"),
        ),
    ]
