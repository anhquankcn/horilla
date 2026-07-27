from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0008_hnh_profile_personal_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="clockout_notify_enabled",
            field=models.BooleanField(
                default=True, verbose_name="Nhận thông báo NV chấm ra ngoài văn phòng"
            ),
        ),
    ]
