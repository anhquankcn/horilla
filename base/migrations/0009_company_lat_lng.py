from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0008_employeeshiftschedule_split_times"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # Columns already exist in DB — only update Django's schema state
            database_operations=[],
            state_operations=[
                migrations.AddField(
                    model_name="company",
                    name="latitude",
                    field=models.FloatField(blank=True, null=True, verbose_name="Vĩ độ (Latitude)"),
                ),
                migrations.AddField(
                    model_name="company",
                    name="longitude",
                    field=models.FloatField(blank=True, null=True, verbose_name="Kinh độ (Longitude)"),
                ),
            ],
        ),
    ]
