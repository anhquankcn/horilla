from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0012_employeeshiftplan"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="employeeshiftplan",
            unique_together=set(),
        ),
    ]
