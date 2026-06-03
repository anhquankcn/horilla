from django.db import migrations, models


class Migration(migrations.Migration):
    """
    attendance_historicalattendance was missing the column because the previous
    SeparateDatabaseAndState migration had empty database_operations (main table
    already had the column, but the history table never got it).
    """

    dependencies = [
        ("attendance", "0009_attendance_outside_geofence"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE attendance_historicalattendance ADD COLUMN IF NOT EXISTS attendance_outside_geofence boolean NOT NULL DEFAULT false;",
                    reverse_sql="ALTER TABLE attendance_historicalattendance DROP COLUMN IF EXISTS attendance_outside_geofence;",
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="historicalattendance",
                    name="attendance_outside_geofence",
                    field=models.BooleanField(default=False, verbose_name="Chấm công ngoài geofence"),
                ),
            ],
        ),
    ]
