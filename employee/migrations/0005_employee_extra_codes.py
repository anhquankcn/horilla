from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0004_employee_pwa_auto_clock_out"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="stt",
            field=models.PositiveIntegerField(blank=True, help_text="Thứ tự hiển thị", null=True, verbose_name="STT"),
        ),
        migrations.AddField(
            model_name="employee",
            name="attendance_code",
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name="Mã công"),
        ),
        migrations.AddField(
            model_name="employee",
            name="employee_code",
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name="Mã Nhân viên HRM"),
        ),
        migrations.AddField(
            model_name="employee",
            name="accounting_code",
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name="Mã Kế Toán"),
        ),
        migrations.AddField(
            model_name="employee",
            name="master_data_code",
            field=models.CharField(blank=True, max_length=100, null=True, verbose_name="Mã MasterData"),
        ),
    ]
