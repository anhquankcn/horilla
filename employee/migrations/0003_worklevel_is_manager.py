from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0002_work_level"),
    ]

    operations = [
        migrations.AddField(
            model_name="worklevel",
            name="is_manager",
            field=models.BooleanField(default=False, verbose_name="Cấp quản lý"),
        ),
    ]
