import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0010_historicalattendance_outside_geofence"),
        ("base", "0009_company_lat_lng"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # Columns already exist in DB — only update Django's schema state
            database_operations=[],
            state_operations=[
                migrations.AddField(
                    model_name="gpscheckinlog",
                    name="company",
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="gps_checkin_logs",
                        to="base.company",
                    ),
                ),
                migrations.AddField(
                    model_name="gpscheckinlog",
                    name="action",
                    field=models.CharField(
                        choices=[("in", "Clock in"), ("out", "Clock out")],
                        default="in",
                        max_length=3,
                    ),
                ),
            ],
        ),
    ]
