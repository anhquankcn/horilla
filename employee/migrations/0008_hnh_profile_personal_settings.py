from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0007_hnh_profile_password_reset_tracking"),
    ]

    operations = [
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="allow_outside_office_checkin",
            field=models.BooleanField(
                default=False, verbose_name="Cho phép chấm công ngoài văn phòng"
            ),
        ),
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="meeting_reminder_enabled",
            field=models.BooleanField(
                default=True, verbose_name="Nhận thông báo nhắc họp trước 15 phút"
            ),
        ),
    ]
