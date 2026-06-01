from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0003_announcement"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="send_as_system",
            field=models.BooleanField(default=False),
        ),
    ]
