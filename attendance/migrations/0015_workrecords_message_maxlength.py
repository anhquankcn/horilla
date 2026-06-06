from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0014_attendanceactivity_work_location"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workrecords",
            name="message",
            field=models.CharField(max_length=120, null=True, blank=True),
        ),
    ]
