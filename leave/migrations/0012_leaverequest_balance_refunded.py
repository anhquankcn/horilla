from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leave", "0011_leaverequest_approved_by"),
    ]

    operations = [
        migrations.AddField(
            model_name="leaverequest",
            name="balance_refunded",
            field=models.BooleanField(default=False, verbose_name="Đã hoàn số dư phép"),
        ),
        migrations.AddField(
            model_name="historicalleaverequest",
            name="balance_refunded",
            field=models.BooleanField(default=False, verbose_name="Đã hoàn số dư phép"),
        ),
    ]
