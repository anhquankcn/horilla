from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('base', '0007_groupappvisibility'),
    ]

    operations = [
        migrations.AddField(
            model_name='employeeshiftschedule',
            name='start_time_2',
            field=models.TimeField(blank=True, null=True, verbose_name='Start Time 2 (afternoon)'),
        ),
        migrations.AddField(
            model_name='employeeshiftschedule',
            name='end_time_2',
            field=models.TimeField(blank=True, null=True, verbose_name='End Time 2 (afternoon)'),
        ),
    ]
