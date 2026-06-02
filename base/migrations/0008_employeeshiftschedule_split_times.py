from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('base', '0007_groupappvisibility'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE base_employeeshiftschedule
                ADD COLUMN IF NOT EXISTS start_time_2 time NULL;
                ALTER TABLE base_employeeshiftschedule
                ADD COLUMN IF NOT EXISTS end_time_2 time NULL;
            """,
            reverse_sql="""
                ALTER TABLE base_employeeshiftschedule
                DROP COLUMN IF EXISTS start_time_2;
                ALTER TABLE base_employeeshiftschedule
                DROP COLUMN IF EXISTS end_time_2;
            """,
            state_operations=[
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
            ],
        ),
    ]
