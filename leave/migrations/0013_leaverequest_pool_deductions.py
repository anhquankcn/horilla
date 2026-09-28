from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leave", "0012_leaverequest_balance_refunded"),
    ]

    operations = [
        migrations.AddField(
            model_name="leaverequest",
            name="pool_deductions",
            field=models.JSONField(blank=True, null=True, verbose_name="Chi tiết trừ phép"),
        ),
        migrations.AddField(
            model_name="historicalleaverequest",
            name="pool_deductions",
            field=models.JSONField(blank=True, null=True, verbose_name="Chi tiết trừ phép"),
        ),
    ]
