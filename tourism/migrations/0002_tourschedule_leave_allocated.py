"""Add leave_allocated flag to TourSchedule"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tourism", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="tourschedule",
            name="leave_allocated",
            field=models.BooleanField(
                default=False,
                verbose_name="Đã cộng nghỉ bù",
                help_text="Tự động đánh dấu sau khi cộng ngày nghỉ bù vào tài khoản nhân viên",
            ),
        ),
    ]
