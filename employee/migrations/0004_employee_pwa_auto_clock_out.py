from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0003_worklevel_is_manager"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="pwa_auto_clock_out",
            field=models.BooleanField(
                default=True,
                verbose_name="Tự động clock out khi hết ca",
                help_text="Nếu tắt, hệ thống sẽ không tự động clock out nhân viên này khi hết ca.",
            ),
        ),
    ]
