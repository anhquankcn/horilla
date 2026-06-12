from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0028_appfeature_export_attendance"),
    ]

    operations = [
        migrations.AddField(
            model_name="employeeshiftschedule",
            name="work_day_coefficient",
            field=models.DecimalField(
                decimal_places=2,
                default=1.00,
                help_text="0.33 = 1/3 ngày, 0.50 = nửa ngày, 1.00 = nguyên ngày",
                max_digits=3,
                verbose_name="Hệ số ngày công",
            ),
        ),
    ]
